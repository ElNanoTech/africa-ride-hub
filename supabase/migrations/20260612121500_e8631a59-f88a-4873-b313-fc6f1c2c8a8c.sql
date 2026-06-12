-- =====================================================================
-- FLEET CONTROL — punch list FC-A1 / FC-A2 / FC-A3
-- =====================================================================

-- ---------------------------------------------------------------------
-- FC-A2 — Realtime: publish vehicle_inspections + vehicle_inspection_photos
-- so admin and driver screens refresh without manual reload.
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vehicle_inspections','vehicle_inspection_photos'] LOOP
    -- REPLICA IDENTITY FULL for accurate UPDATE/DELETE payloads (matches
    -- the convention used for the other realtime tables).
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- FC-A3 — Single source of truth for the required zone set, derived from
-- the require_all_photos / require_documents settings.
-- Rule: (require_all_photos ? 7 photo zones : none)
--     ∪ (require_documents  ? 4 doc zones   : none)
-- If both flags are false we still require the 7 photos — a control can
-- never be submitted empty. NOTE: this photos-fallback applies to driver
-- SUBMIT only; fleet_control_approve reads the two flags directly and
-- skips its completeness check entirely when both are off (admin judgment).
-- Mirrored in TS by requiredZones() / approvalRequiredZones() in
-- src/lib/fleetControl.ts.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fleet_control_required_zones()
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_photos boolean;
  v_docs boolean;
  v_photo_zones text[] := ARRAY['front','rear','left','right','interior_front','interior_rear','dash'];
  v_doc_zones   text[] := ARRAY['doc_carte_grise','doc_assurance','doc_vignette','doc_permis'];
  v_result text[] := ARRAY[]::text[];
BEGIN
  v_photos := COALESCE((SELECT (setting_value)::text::boolean FROM public.platform_settings
                          WHERE setting_key = 'fleet_control.require_all_photos'), true);
  v_docs   := COALESCE((SELECT (setting_value)::text::boolean FROM public.platform_settings
                          WHERE setting_key = 'fleet_control.require_documents'), true);
  IF NOT v_photos AND NOT v_docs THEN
    -- Never allow an empty submission.
    v_photos := true;
  END IF;
  IF v_photos THEN v_result := v_result || v_photo_zones; END IF;
  IF v_docs   THEN v_result := v_result || v_doc_zones;   END IF;
  RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.fleet_control_required_zones() TO authenticated;

-- ---------------------------------------------------------------------
-- FC-A3 — fleet_control_submit: completeness check now uses the derived
-- required zone set (was: always the full 11). Also hardened vs the
-- previous version:
--   * status guard — only pending/rejected/overdue controls can be
--     submitted (raises invalid_status_for_submit otherwise), so a driver
--     cannot re-flip a submitted/approved/blocked/cancelled cycle;
--   * the item flip only touches rows whose storage object actually
--     exists (same storage-join semantics as the completeness check,
--     applied to ALL flipped rows, not just required zones).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fleet_control_submit(p_control uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $fn$
DECLARE
  v_row public.vehicle_inspections;
  v_missing int;
BEGIN
  SELECT * INTO v_row FROM public.vehicle_inspections WHERE id = p_control;
  IF v_row IS NULL THEN RAISE EXCEPTION 'control_not_found'; END IF;
  IF v_row.driver_id <> public.current_driver_id() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_row.status NOT IN ('pending','rejected','overdue') THEN
    RAISE EXCEPTION 'invalid_status_for_submit';
  END IF;

  SELECT count(*) INTO v_missing
    FROM unnest(public.fleet_control_required_zones()) AS req(zone)
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.vehicle_inspection_photos p
       JOIN storage.objects o
         ON o.bucket_id = 'vehicle-inspections'
        AND o.name = p.storage_path
      WHERE p.inspection_id = p_control
        AND p.zone = req.zone
        AND COALESCE(p.storage_path, '') <> ''
   );
  IF v_missing > 0 THEN RAISE EXCEPTION 'incomplete: % missing', v_missing; END IF;

  UPDATE public.vehicle_inspection_photos p
     SET validation_status = CASE WHEN p.validation_status='pending' THEN 'submitted' ELSE p.validation_status END,
         submitted_at = COALESCE(p.submitted_at, now()),
         updated_at = now()
   WHERE p.inspection_id = p_control
     AND COALESCE(p.storage_path, '') <> ''
     AND EXISTS (
       SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'vehicle-inspections'
          AND o.name = p.storage_path
     );

  UPDATE public.vehicle_inspections
     SET status='submitted', submitted_at=now(), updated_at=now()
   WHERE id=p_control;

  PERFORM public.fleet_control_log(p_control,'control_submitted','{}'::jsonb,'driver');
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.fleet_control_submit(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- FC-A3 — fleet_control_approve: derived required zone set, with the
-- pre-existing escape hatch restored — when require_all_photos=false AND
-- require_documents=false, the completeness check is skipped entirely
-- (admin judgment); the photos-fallback of fleet_control_required_zones()
-- applies to SUBMIT only. Everything else identical to the previous
-- version: FOR UPDATE, already-approved repair, item approval, due_at
-- reset, sibling-cycle cancellation, driver notification, audit.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fleet_control_approve(p_control uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $fn$
DECLARE
  v_row public.vehicle_inspections;
  v_cycle int;
  v_missing int;
  v_photos boolean;
  v_docs boolean;
BEGIN
  SELECT * INTO v_row FROM public.vehicle_inspections WHERE id = p_control FOR UPDATE;
  IF v_row IS NULL THEN RAISE EXCEPTION 'control_not_found'; END IF;
  PERFORM public.fc_require_admin(v_row.customer_id);

  -- Repair any previously approved controls whose item rows were left in
  -- submitted/pending state, but do not send duplicate notifications/audit rows.
  IF v_row.status = 'approved' THEN
    UPDATE public.vehicle_inspection_photos
       SET validation_status = 'approved',
           reviewed_at = COALESCE(reviewed_at, now()),
           reviewed_by = COALESCE(reviewed_by, auth.uid()),
           rejection_reason = NULL,
           updated_at = now()
     WHERE inspection_id = p_control
       AND validation_status IN ('pending', 'submitted', 'approved');
    RETURN;
  END IF;

  v_cycle := COALESCE(NULLIF(v_row.cycle_days,0),
              COALESCE((SELECT (setting_value)::text::int FROM public.platform_settings
                         WHERE setting_key='fleet_control.cycle_days'),14));

  -- Escape hatch: both require flags off → no completeness enforcement
  -- (the submit-only photos fallback must NOT block an admin approval).
  v_photos := COALESCE((SELECT (setting_value)::text::boolean FROM public.platform_settings
                          WHERE setting_key = 'fleet_control.require_all_photos'), true);
  v_docs   := COALESCE((SELECT (setting_value)::text::boolean FROM public.platform_settings
                          WHERE setting_key = 'fleet_control.require_documents'), true);
  IF v_photos OR v_docs THEN
    SELECT count(*) INTO v_missing
      FROM unnest(public.fleet_control_required_zones()) AS req(zone)
     WHERE NOT EXISTS (
       SELECT 1
         FROM public.vehicle_inspection_photos p
         JOIN storage.objects o
           ON o.bucket_id = 'vehicle-inspections'
          AND o.name = p.storage_path
        WHERE p.inspection_id = p_control
          AND p.zone = req.zone
          AND p.validation_status IN ('submitted','approved')
          AND COALESCE(p.storage_path, '') <> ''
     );
    IF v_missing > 0 THEN RAISE EXCEPTION 'incomplete_items: % missing', v_missing; END IF;
  END IF;

  UPDATE public.vehicle_inspection_photos
     SET validation_status = 'approved',
         reviewed_at = COALESCE(reviewed_at, now()),
         reviewed_by = COALESCE(reviewed_by, auth.uid()),
         rejection_reason = NULL,
         updated_at = now()
   WHERE inspection_id = p_control
     AND validation_status IN ('pending', 'submitted', 'approved');

  UPDATE public.vehicle_inspections
     SET status='approved', reviewed_at=now(), reviewed_by=auth.uid(),
         validated_at=now(), validated_by=auth.uid(), last_validated_at=now(),
         due_at = now() + (v_cycle || ' days')::interval,
         rejection_reason=NULL, reminder_count=0, last_reminder_at=NULL,
         immobilization_state = CASE WHEN immobilization_state IN ('cut_sent','requested','pending_stop')
                                     THEN 'unblocked' ELSE immobilization_state END,
         updated_at=now()
   WHERE id = p_control;

  UPDATE public.vehicle_inspections
     SET status = 'cancelled',
         rejection_reason = COALESCE(rejection_reason, 'Cycle remplacé par le contrôle validé'),
         updated_at = now()
   WHERE id <> p_control
     AND driver_id IS NOT DISTINCT FROM v_row.driver_id
     AND vehicle_id = v_row.vehicle_id
     AND status IN ('pending','submitted','rejected','overdue','blocked');

  IF v_row.driver_id IS NOT NULL THEN
    INSERT INTO public.notifications (driver_id, customer_id, notification_type, title, message)
    VALUES (v_row.driver_id, v_row.customer_id, 'fleet_control_approved',
            'Contrôle validé',
            'Votre contrôle a été validé. Prochain contrôle dans ' || v_cycle || ' jours.');
  END IF;
  PERFORM public.fleet_control_log(p_control, 'control_approved',
    jsonb_build_object('next_due_in_days', v_cycle), 'admin');
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.fleet_control_approve(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- FC-A1 — Manual control creation by an admin.
-- Mirrors the fc_autocreate_from_rental trigger: one active control per
-- vehicle (statuses pending/submitted/rejected/overdue/blocked), driver
-- derived from the active rental when not provided, due_at from the
-- cycle_days setting, audit + driver notification. rental_id is linked
-- only when the resolved driver is the active rental's driver. Returns
-- jsonb { created, control_id, driver_id, notified } so the UI can build
-- an honest toast from the server's actual outcome.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fleet_control_create_manual(
  p_vehicle uuid,
  p_driver uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_vehicle public.vehicles;
  v_rental public.rentals;
  v_driver uuid;
  v_rental_link uuid;
  v_cycle int;
  v_existing uuid;
  v_control public.vehicle_inspections;
BEGIN
  SELECT * INTO v_vehicle FROM public.vehicles WHERE id = p_vehicle;
  IF v_vehicle IS NULL THEN RAISE EXCEPTION 'vehicle_not_found'; END IF;
  PERFORM public.fc_require_admin(v_vehicle.customer_id);

  -- Resolve the driver: explicit param wins, else the active rental's driver.
  SELECT * INTO v_rental
    FROM public.rentals
   WHERE vehicle_id = p_vehicle AND status = 'active'
   ORDER BY created_at DESC
   LIMIT 1;
  v_driver := COALESCE(p_driver, v_rental.driver_id);

  -- Link the rental only when the control actually targets the rental's
  -- driver (p_driver omitted or equal). An explicit p_driver overriding to
  -- a different driver must NOT claim the active rental.
  IF v_rental.id IS NOT NULL AND (p_driver IS NULL OR p_driver = v_rental.driver_id) THEN
    v_rental_link := v_rental.id;
  END IF;

  -- Tenant scoping on the driver (explicit or derived).
  IF v_driver IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.drivers d
     WHERE d.id = v_driver AND d.customer_id = v_vehicle.customer_id
  ) THEN
    RAISE EXCEPTION 'driver_not_in_tenant';
  END IF;

  -- One-active-control idempotency (same statuses as the trigger).
  SELECT id INTO v_existing
    FROM public.vehicle_inspections
   WHERE vehicle_id = p_vehicle
     AND status IN ('pending','submitted','rejected','overdue','blocked')
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'created', false, 'control_id', v_existing,
      'driver_id', NULL, 'notified', false);
  END IF;

  v_cycle := COALESCE((SELECT (setting_value)::text::int FROM public.platform_settings
                        WHERE setting_key = 'fleet_control.cycle_days'), 14);

  INSERT INTO public.vehicle_inspections
    (customer_id, vehicle_id, driver_id, rental_id, status, cycle_days, due_at)
  VALUES
    (v_vehicle.customer_id, p_vehicle, v_driver, v_rental_link, 'pending', v_cycle,
     now() + (v_cycle || ' days')::interval)
  RETURNING * INTO v_control;

  IF v_driver IS NOT NULL THEN
    INSERT INTO public.notifications (driver_id, customer_id, notification_type, title, message)
    VALUES (v_driver, v_vehicle.customer_id, 'fleet_control_required',
            'Contrôle véhicule demandé',
            'Votre gestionnaire demande un contrôle de '
              || COALESCE(v_vehicle.license_plate, 'votre véhicule')
              || '. Soumettez vos photos dès que possible.');
  END IF;

  PERFORM public.fleet_control_log(v_control.id, 'control_created_manual',
    jsonb_build_object('reason', p_reason, 'vehicle_id', p_vehicle, 'driver_id', v_driver), 'admin');

  RETURN jsonb_build_object(
    'created', true, 'control_id', v_control.id,
    'driver_id', v_driver, 'notified', v_driver IS NOT NULL);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.fleet_control_create_manual(uuid, uuid, text) TO authenticated;
