
-- =====================================================================
-- FLEET CONTROL — PHASE 1
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. vehicle_inspections: new columns + status migration
-- ---------------------------------------------------------------------
ALTER TABLE public.vehicle_inspections
  ADD COLUMN IF NOT EXISTS cycle_days integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS last_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rental_id uuid REFERENCES public.rentals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS immobilization_state text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS immobilization_requested_by uuid,
  ADD COLUMN IF NOT EXISTS immobilization_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS immobilization_cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS immobilization_command_ref text;

-- Migrate legacy status values
UPDATE public.vehicle_inspections SET status = 'pending'  WHERE status = 'draft';
UPDATE public.vehicle_inspections SET status = 'approved' WHERE status = 'validated';
UPDATE public.vehicle_inspections SET status = 'overdue'  WHERE status = 'expired';

-- Backfill last_validated_at from validated_at where appropriate
UPDATE public.vehicle_inspections
   SET last_validated_at = validated_at,
       reviewed_at = validated_at,
       reviewed_by = validated_by
 WHERE last_validated_at IS NULL AND validated_at IS NOT NULL;

ALTER TABLE public.vehicle_inspections
  DROP CONSTRAINT IF EXISTS vehicle_inspections_status_check;

ALTER TABLE public.vehicle_inspections
  ADD CONSTRAINT vehicle_inspections_status_check
  CHECK (status IN ('pending','submitted','approved','rejected','overdue','blocked','cancelled'));

ALTER TABLE public.vehicle_inspections
  ADD CONSTRAINT vehicle_inspections_immo_state_check
  CHECK (immobilization_state IN ('none','requested','pending_stop','cut_sent','failed','cancelled','unblocked'));

CREATE INDEX IF NOT EXISTS idx_vinsp_immo_state ON public.vehicle_inspections(immobilization_state)
  WHERE immobilization_state <> 'none';

-- ---------------------------------------------------------------------
-- 2. vehicle_inspection_photos: item-level review
-- ---------------------------------------------------------------------
ALTER TABLE public.vehicle_inspection_photos
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'photo',
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

-- Backfill from parent inspection for any orphan rows
UPDATE public.vehicle_inspection_photos p
   SET customer_id = COALESCE(p.customer_id, i.customer_id),
       vehicle_id  = COALESCE(p.vehicle_id,  i.vehicle_id),
       driver_id   = COALESCE(p.driver_id,   i.driver_id),
       submitted_at = COALESCE(p.submitted_at, p.created_at)
  FROM public.vehicle_inspections i
 WHERE p.inspection_id = i.id;

ALTER TABLE public.vehicle_inspection_photos
  DROP CONSTRAINT IF EXISTS vehicle_inspection_photos_zone_check;

-- New zone list (legacy zones kept temporarily to not break anything else)
ALTER TABLE public.vehicle_inspection_photos
  ADD CONSTRAINT vehicle_inspection_photos_zone_check
  CHECK (zone IN (
    'front','rear','left','right','interior_front','interior_rear','dash',
    'doc_carte_grise','doc_assurance','doc_vignette','doc_permis',
    -- legacy aliases:
    'tires','interior','doc_carte_parking'
  ));

ALTER TABLE public.vehicle_inspection_photos
  ADD CONSTRAINT vehicle_inspection_photos_item_type_check
  CHECK (item_type IN ('photo','document'));

ALTER TABLE public.vehicle_inspection_photos
  ADD CONSTRAINT vehicle_inspection_photos_validation_status_check
  CHECK (validation_status IN ('pending','submitted','approved','rejected'));

CREATE INDEX IF NOT EXISTS idx_vinsp_photos_customer ON public.vehicle_inspection_photos(customer_id);
CREATE INDEX IF NOT EXISTS idx_vinsp_photos_driver   ON public.vehicle_inspection_photos(driver_id);

-- ---------------------------------------------------------------------
-- 3. fleet_control_audit
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fleet_control_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  fleet_control_id uuid REFERENCES public.vehicle_inspections(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  actor_id uuid,
  actor_type text NOT NULL CHECK (actor_type IN ('admin','driver','system')),
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.fleet_control_audit TO authenticated;
GRANT ALL ON public.fleet_control_audit TO service_role;

ALTER TABLE public.fleet_control_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read tenant audit"
  ON public.fleet_control_audit FOR SELECT
  TO authenticated
  USING (
    public.is_platform_owner()
    OR (public.is_admin() AND customer_id = public.current_customer_id())
  );

CREATE POLICY "drivers read own audit"
  ON public.fleet_control_audit FOR SELECT
  TO authenticated
  USING (driver_id = public.current_driver_id());

-- writes only via SECURITY DEFINER functions / service_role
CREATE POLICY "no direct inserts"
  ON public.fleet_control_audit FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_fca_control ON public.fleet_control_audit(fleet_control_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fca_customer ON public.fleet_control_audit(customer_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 4. Settings defaults
-- ---------------------------------------------------------------------
INSERT INTO public.platform_settings (setting_key, setting_value, description) VALUES
  ('fleet_control.cycle_days', '14'::jsonb, 'Période de contrôle (jours)'),
  ('fleet_control.late_threshold_days', '3'::jsonb, 'Seuil de retard avant escalade (jours)'),
  ('fleet_control.relance_threshold', '2'::jsonb, 'Nombre de relances avant escalade'),
  ('fleet_control.auto_immobilisation_enabled', 'false'::jsonb, 'Immobilisation automatique activée'),
  ('fleet_control.parking_check_interval_min', '15'::jsonb, 'Vérification stationnement (minutes)'),
  ('fleet_control.relance_cooldown_hours', '24'::jsonb, 'Délai minimum entre deux relances (heures)'),
  ('fleet_control.require_all_photos', 'true'::jsonb, 'Toutes les photos obligatoires'),
  ('fleet_control.require_documents', 'true'::jsonb, 'Documents obligatoires')
ON CONFLICT (setting_key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. Notification types
-- ---------------------------------------------------------------------
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_notification_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_notification_type_check
  CHECK (notification_type IN (
    'score_update','payment_reminder','loan_status','rental_status','safety_tip',
    'announcement','income_status','system','payment_grace_started','payment_final_overdue',
    'rental_pickup_confirmed','vehicle_disabled','kyc_approved','kyc_rejected',
    'accident_report_submitted','accident_report_closed','invoice_issued','invoice_cancelled',
    'monthly_statement_ready','training_completed','training_reminder',
    -- Fleet control:
    'fleet_control_required','fleet_control_overdue','fleet_control_reminder',
    'fleet_control_approved','fleet_control_rejected',
    'fleet_control_blocked','fleet_control_unblocked'
  ));

-- ---------------------------------------------------------------------
-- 6. RLS additions for drivers on inspections + items
-- ---------------------------------------------------------------------
CREATE POLICY "drivers read own inspections"
  ON public.vehicle_inspections FOR SELECT
  TO authenticated
  USING (driver_id = public.current_driver_id());

CREATE POLICY "drivers update own inspections submit"
  ON public.vehicle_inspections FOR UPDATE
  TO authenticated
  USING (driver_id = public.current_driver_id())
  WITH CHECK (driver_id = public.current_driver_id());

CREATE POLICY "drivers read own inspection items"
  ON public.vehicle_inspection_photos FOR SELECT
  TO authenticated
  USING (driver_id = public.current_driver_id());

CREATE POLICY "drivers manage own inspection items"
  ON public.vehicle_inspection_photos FOR INSERT
  TO authenticated
  WITH CHECK (driver_id = public.current_driver_id());

CREATE POLICY "drivers update own inspection items"
  ON public.vehicle_inspection_photos FOR UPDATE
  TO authenticated
  USING (driver_id = public.current_driver_id() AND validation_status IN ('pending','submitted','rejected'))
  WITH CHECK (driver_id = public.current_driver_id());

CREATE POLICY "drivers delete own pending items"
  ON public.vehicle_inspection_photos FOR DELETE
  TO authenticated
  USING (driver_id = public.current_driver_id() AND validation_status IN ('pending','rejected'));

-- ---------------------------------------------------------------------
-- 7. Helper functions
-- ---------------------------------------------------------------------

-- settings reader (jsonb)
CREATE OR REPLACE FUNCTION public.fleet_control_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_object_agg(
           regexp_replace(setting_key, '^fleet_control\.', ''),
           setting_value
         )
    FROM public.platform_settings
   WHERE setting_key LIKE 'fleet_control.%';
$$;

GRANT EXECUTE ON FUNCTION public.fleet_control_settings() TO authenticated;

-- audit logger
CREATE OR REPLACE FUNCTION public.fleet_control_log(
  p_control uuid,
  p_action text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_actor_type text DEFAULT 'system'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_row public.vehicle_inspections;
BEGIN
  SELECT * INTO v_row FROM public.vehicle_inspections WHERE id = p_control;
  INSERT INTO public.fleet_control_audit
    (customer_id, fleet_control_id, vehicle_id, driver_id, actor_id, actor_type, action, metadata)
  VALUES
    (v_row.customer_id, v_row.id, v_row.vehicle_id, v_row.driver_id, auth.uid(), p_actor_type, p_action, COALESCE(p_metadata,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fleet_control_log(uuid,text,jsonb,text) TO authenticated;

-- send reminder (with cooldown)
CREATE OR REPLACE FUNCTION public.fleet_control_remind(p_control uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.vehicle_inspections;
  v_cooldown_hours int;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_row FROM public.vehicle_inspections WHERE id = p_control;
  IF v_row IS NULL THEN RAISE EXCEPTION 'control_not_found'; END IF;

  v_cooldown_hours := COALESCE((SELECT (setting_value)::text::int
                                  FROM platform_settings WHERE setting_key='fleet_control.relance_cooldown_hours'), 24);

  IF v_row.last_reminder_at IS NOT NULL
     AND v_row.last_reminder_at + (v_cooldown_hours || ' hours')::interval > v_now THEN
    RETURN jsonb_build_object(
      'sent', false,
      'cooldown_until', v_row.last_reminder_at + (v_cooldown_hours || ' hours')::interval
    );
  END IF;

  UPDATE public.vehicle_inspections
     SET reminder_count = reminder_count + 1,
         last_reminder_at = v_now,
         updated_at = v_now
   WHERE id = p_control;

  IF v_row.driver_id IS NOT NULL THEN
    INSERT INTO public.notifications (driver_id, customer_id, notification_type, title, message, priority)
    VALUES (
      v_row.driver_id, v_row.customer_id, 'fleet_control_reminder',
      'Contrôle véhicule en attente',
      'Soumettez vos photos avant immobilisation.',
      'high'
    );
  END IF;

  PERFORM public.fleet_control_log(p_control, 'reminder_sent',
    jsonb_build_object('reminder_count', v_row.reminder_count + 1), 'admin');

  RETURN jsonb_build_object('sent', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fleet_control_remind(uuid) TO authenticated;

-- Approve a single item
CREATE OR REPLACE FUNCTION public.fleet_control_item_review(
  p_item uuid,
  p_status text,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_control_id uuid;
BEGIN
  IF p_status NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF p_status = 'rejected' AND COALESCE(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'rejection_reason_required';
  END IF;

  UPDATE public.vehicle_inspection_photos
     SET validation_status = p_status,
         rejection_reason  = CASE WHEN p_status = 'rejected' THEN p_reason ELSE NULL END,
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         updated_at = now()
   WHERE id = p_item
  RETURNING inspection_id INTO v_control_id;

  PERFORM public.fleet_control_log(v_control_id, 'item_' || p_status,
    jsonb_build_object('item_id', p_item, 'reason', p_reason), 'admin');
END;
$$;

GRANT EXECUTE ON FUNCTION public.fleet_control_item_review(uuid,text,text) TO authenticated;

-- Approve full control
CREATE OR REPLACE FUNCTION public.fleet_control_approve(p_control uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.vehicle_inspections;
  v_cycle int;
  v_required boolean;
  v_missing int;
BEGIN
  SELECT * INTO v_row FROM public.vehicle_inspections WHERE id = p_control;
  IF v_row IS NULL THEN RAISE EXCEPTION 'control_not_found'; END IF;

  v_cycle := COALESCE(NULLIF(v_row.cycle_days,0),
              COALESCE((SELECT (setting_value)::text::int FROM platform_settings
                         WHERE setting_key='fleet_control.cycle_days'),14));

  v_required := COALESCE((SELECT (setting_value)::text::boolean FROM platform_settings
                            WHERE setting_key='fleet_control.require_all_photos'), true);

  IF v_required THEN
    SELECT count(*) INTO v_missing
      FROM (VALUES
        ('front'),('rear'),('left'),('right'),('interior_front'),('interior_rear'),('dash'),
        ('doc_carte_grise'),('doc_assurance'),('doc_vignette'),('doc_permis')
      ) AS req(zone)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.vehicle_inspection_photos p
        WHERE p.inspection_id = p_control AND p.zone = req.zone
          AND p.validation_status IN ('submitted','approved')
     );
    IF v_missing > 0 THEN RAISE EXCEPTION 'incomplete_items: % missing', v_missing; END IF;
  END IF;

  UPDATE public.vehicle_inspections
     SET status = 'approved',
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         validated_at = now(),
         validated_by = auth.uid(),
         last_validated_at = now(),
         rejection_reason = NULL,
         reminder_count = 0,
         immobilization_state = CASE WHEN immobilization_state IN ('cut_sent','requested','pending_stop')
                                     THEN 'unblocked' ELSE immobilization_state END,
         updated_at = now()
   WHERE id = p_control;

  -- Schedule next cycle
  INSERT INTO public.vehicle_inspections
    (customer_id, vehicle_id, driver_id, rental_id, status, cycle_days,
     due_at)
  VALUES (v_row.customer_id, v_row.vehicle_id, v_row.driver_id, v_row.rental_id,
          'pending', v_cycle, now() + (v_cycle || ' days')::interval);

  IF v_row.driver_id IS NOT NULL THEN
    INSERT INTO public.notifications (driver_id, customer_id, notification_type, title, message)
    VALUES (v_row.driver_id, v_row.customer_id, 'fleet_control_approved',
      'Contrôle conforme ✅', 'Bravo ! Prochain contrôle dans ' || v_cycle || ' jours.');
  END IF;

  PERFORM public.fleet_control_log(p_control, 'control_approved',
    jsonb_build_object('next_cycle_days', v_cycle), 'admin');
END;
$$;

GRANT EXECUTE ON FUNCTION public.fleet_control_approve(uuid) TO authenticated;

-- Reject full control
CREATE OR REPLACE FUNCTION public.fleet_control_reject(p_control uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.vehicle_inspections;
BEGIN
  IF COALESCE(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'rejection_reason_required'; END IF;
  SELECT * INTO v_row FROM public.vehicle_inspections WHERE id = p_control;

  UPDATE public.vehicle_inspections
     SET status = 'rejected',
         rejection_reason = p_reason,
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         updated_at = now()
   WHERE id = p_control;

  IF v_row.driver_id IS NOT NULL THEN
    INSERT INTO public.notifications (driver_id, customer_id, notification_type, title, message, priority)
    VALUES (v_row.driver_id, v_row.customer_id, 'fleet_control_rejected',
      'Contrôle refusé', p_reason, 'high');
  END IF;

  PERFORM public.fleet_control_log(p_control, 'control_rejected',
    jsonb_build_object('reason', p_reason), 'admin');
END;
$$;

GRANT EXECUTE ON FUNCTION public.fleet_control_reject(uuid,text) TO authenticated;

-- Immobilization state machine
CREATE OR REPLACE FUNCTION public.fleet_control_immobilize_request(p_control uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.vehicle_inspections;
BEGIN
  SELECT * INTO v_row FROM public.vehicle_inspections WHERE id=p_control;
  IF v_row.immobilization_state NOT IN ('none','cancelled','unblocked') THEN
    RAISE EXCEPTION 'already_in_progress';
  END IF;
  UPDATE public.vehicle_inspections
     SET immobilization_state='requested',
         immobilization_requested_by=auth.uid(),
         immobilization_requested_at=now(),
         immobilization_cancelled_at=NULL,
         updated_at=now()
   WHERE id=p_control;

  INSERT INTO public.vehicle_immobilization_commands
    (customer_id, vehicle_id, inspection_id, status, source, requested_by, reason)
  VALUES (v_row.customer_id, v_row.vehicle_id, p_control, 'pending','manual', auth.uid(), p_reason);

  PERFORM public.fleet_control_log(p_control,'immobilization_requested',
    jsonb_build_object('reason',p_reason),'admin');
END;$$;
GRANT EXECUTE ON FUNCTION public.fleet_control_immobilize_request(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fleet_control_immobilize_cancel(p_control uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.vehicle_inspections
     SET immobilization_state='cancelled',
         immobilization_cancelled_at=now(),
         updated_at=now()
   WHERE id=p_control AND immobilization_state IN ('requested','pending_stop');

  UPDATE public.vehicle_immobilization_commands
     SET status='cancelled', updated_at=now()
   WHERE inspection_id=p_control AND status IN ('pending','sent');

  PERFORM public.fleet_control_log(p_control,'immobilization_cancelled','{}'::jsonb,'admin');
END;$$;
GRANT EXECUTE ON FUNCTION public.fleet_control_immobilize_cancel(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fleet_control_unblock(p_control uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.vehicle_inspections;
BEGIN
  SELECT * INTO v_row FROM public.vehicle_inspections WHERE id=p_control;
  UPDATE public.vehicle_inspections
     SET immobilization_state='unblocked',
         status = CASE WHEN status='blocked' THEN 'pending' ELSE status END,
         updated_at=now()
   WHERE id=p_control;

  IF v_row.driver_id IS NOT NULL THEN
    INSERT INTO public.notifications (driver_id, customer_id, notification_type, title, message)
    VALUES (v_row.driver_id, v_row.customer_id, 'fleet_control_unblocked',
            'Véhicule débloqué', 'Vous pouvez reprendre la route.');
  END IF;

  PERFORM public.fleet_control_log(p_control,'unblocked','{}'::jsonb,'admin');
END;$$;
GRANT EXECUTE ON FUNCTION public.fleet_control_unblock(uuid) TO authenticated;

-- Driver-side submit
CREATE OR REPLACE FUNCTION public.fleet_control_submit(p_control uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row public.vehicle_inspections; v_missing int;
BEGIN
  SELECT * INTO v_row FROM public.vehicle_inspections WHERE id=p_control;
  IF v_row.driver_id <> public.current_driver_id() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT count(*) INTO v_missing
    FROM (VALUES
      ('front'),('rear'),('left'),('right'),('interior_front'),('interior_rear'),('dash'),
      ('doc_carte_grise'),('doc_assurance'),('doc_vignette'),('doc_permis')
    ) AS req(zone)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.vehicle_inspection_photos p
      WHERE p.inspection_id=p_control AND p.zone=req.zone
   );
  IF v_missing > 0 THEN RAISE EXCEPTION 'incomplete: % missing', v_missing; END IF;

  UPDATE public.vehicle_inspection_photos
     SET validation_status = CASE WHEN validation_status='pending' THEN 'submitted' ELSE validation_status END,
         submitted_at = COALESCE(submitted_at, now()),
         updated_at = now()
   WHERE inspection_id = p_control;

  UPDATE public.vehicle_inspections
     SET status='submitted', submitted_at=now(), updated_at=now()
   WHERE id=p_control;

  PERFORM public.fleet_control_log(p_control,'control_submitted','{}'::jsonb,'driver');
END;$$;
GRANT EXECUTE ON FUNCTION public.fleet_control_submit(uuid) TO authenticated;
