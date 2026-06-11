-- Helper: raise if current caller is not an active admin for the row's tenant
CREATE OR REPLACE FUNCTION public.fc_require_admin(p_customer uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF public.is_platform_owner() THEN RETURN; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF p_customer IS NOT NULL AND p_customer <> public.current_customer_id() THEN
    RAISE EXCEPTION 'wrong_tenant';
  END IF;
END;
$$;

-- approve
CREATE OR REPLACE FUNCTION public.fleet_control_approve(p_control uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_row public.vehicle_inspections;
  v_cycle int;
  v_required boolean;
  v_missing int;
BEGIN
  SELECT * INTO v_row FROM public.vehicle_inspections WHERE id = p_control;
  IF v_row IS NULL THEN RAISE EXCEPTION 'control_not_found'; END IF;
  PERFORM public.fc_require_admin(v_row.customer_id);

  v_cycle := COALESCE(NULLIF(v_row.cycle_days,0),
              COALESCE((SELECT (setting_value)::text::int FROM platform_settings
                         WHERE setting_key='fleet_control.cycle_days'),14));

  v_required := COALESCE((SELECT (setting_value)::text::boolean FROM platform_settings
                            WHERE setting_key='fleet_control.require_all_photos'), true);
  IF v_required THEN
    SELECT count(*) INTO v_missing
      FROM (VALUES ('front'),('rear'),('left'),('right'),('interior_front'),('interior_rear'),('dash'),
        ('doc_carte_grise'),('doc_assurance'),('doc_vignette'),('doc_permis')) AS req(zone)
     WHERE NOT EXISTS (SELECT 1 FROM public.vehicle_inspection_photos p
        WHERE p.inspection_id = p_control AND p.zone = req.zone
          AND p.validation_status IN ('submitted','approved'));
    IF v_missing > 0 THEN RAISE EXCEPTION 'incomplete_items: % missing', v_missing; END IF;
  END IF;

  UPDATE public.vehicle_inspections
     SET status='approved', reviewed_at=now(), reviewed_by=auth.uid(),
         validated_at=now(), validated_by=auth.uid(), last_validated_at=now(),
         due_at = now() + (v_cycle || ' days')::interval,
         rejection_reason=NULL, reminder_count=0, last_reminder_at=NULL,
         immobilization_state = CASE WHEN immobilization_state IN ('cut_sent','requested','pending_stop')
                                     THEN 'unblocked' ELSE immobilization_state END,
         updated_at=now()
   WHERE id = p_control;

  IF v_row.driver_id IS NOT NULL THEN
    INSERT INTO public.notifications (driver_id, customer_id, notification_type, title, message)
    VALUES (v_row.driver_id, v_row.customer_id, 'fleet_control_approved',
            'Contrôle validé',
            'Votre contrôle a été validé. Prochain contrôle dans ' || v_cycle || ' jours.');
  END IF;
  PERFORM public.fleet_control_log(p_control, 'control_approved',
    jsonb_build_object('next_due_in_days', v_cycle), 'admin');
END;$fn$;

-- reject (drop priority column)
CREATE OR REPLACE FUNCTION public.fleet_control_reject(p_control uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_row public.vehicle_inspections;
BEGIN
  IF COALESCE(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'rejection_reason_required'; END IF;
  SELECT * INTO v_row FROM public.vehicle_inspections WHERE id = p_control;
  IF v_row IS NULL THEN RAISE EXCEPTION 'control_not_found'; END IF;
  PERFORM public.fc_require_admin(v_row.customer_id);

  UPDATE public.vehicle_inspections
     SET status='rejected', rejection_reason=p_reason,
         reviewed_at=now(), reviewed_by=auth.uid(), updated_at=now()
   WHERE id = p_control;

  IF v_row.driver_id IS NOT NULL THEN
    INSERT INTO public.notifications (driver_id, customer_id, notification_type, title, message)
    VALUES (v_row.driver_id, v_row.customer_id, 'fleet_control_rejected',
            'Contrôle refusé', p_reason);
  END IF;
  PERFORM public.fleet_control_log(p_control, 'control_rejected',
    jsonb_build_object('reason', p_reason), 'admin');
END;$fn$;

-- remind (drop priority + admin guard)
CREATE OR REPLACE FUNCTION public.fleet_control_remind(p_control uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_row public.vehicle_inspections;
  v_cooldown_hours int;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_row FROM public.vehicle_inspections WHERE id = p_control;
  IF v_row IS NULL THEN RAISE EXCEPTION 'control_not_found'; END IF;
  PERFORM public.fc_require_admin(v_row.customer_id);

  v_cooldown_hours := COALESCE((SELECT (setting_value)::text::int FROM platform_settings
                                  WHERE setting_key='fleet_control.relance_cooldown_hours'), 24);
  IF v_row.last_reminder_at IS NOT NULL
     AND v_row.last_reminder_at + (v_cooldown_hours || ' hours')::interval > v_now THEN
    RETURN jsonb_build_object('sent', false,
      'cooldown_until', v_row.last_reminder_at + (v_cooldown_hours || ' hours')::interval);
  END IF;

  UPDATE public.vehicle_inspections
     SET reminder_count = reminder_count + 1, last_reminder_at = v_now, updated_at = v_now
   WHERE id = p_control;

  IF v_row.driver_id IS NOT NULL THEN
    INSERT INTO public.notifications (driver_id, customer_id, notification_type, title, message)
    VALUES (v_row.driver_id, v_row.customer_id, 'fleet_control_reminder',
            'Contrôle véhicule en attente',
            'Soumettez vos photos avant immobilisation.');
  END IF;
  PERFORM public.fleet_control_log(p_control, 'reminder_sent',
    jsonb_build_object('reminder_count', v_row.reminder_count + 1), 'admin');
  RETURN jsonb_build_object('sent', true);
END;$fn$;

-- item review guard
CREATE OR REPLACE FUNCTION public.fleet_control_item_review(p_item uuid, p_status text, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_control_id uuid; v_customer uuid;
BEGIN
  IF p_status NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF p_status = 'rejected' AND COALESCE(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'rejection_reason_required';
  END IF;
  SELECT inspection_id, customer_id INTO v_control_id, v_customer
    FROM public.vehicle_inspection_photos WHERE id = p_item;
  IF v_control_id IS NULL THEN RAISE EXCEPTION 'item_not_found'; END IF;
  PERFORM public.fc_require_admin(v_customer);

  UPDATE public.vehicle_inspection_photos
     SET validation_status=p_status,
         rejection_reason = CASE WHEN p_status='rejected' THEN p_reason ELSE NULL END,
         reviewed_at=now(), reviewed_by=auth.uid(), updated_at=now()
   WHERE id = p_item;

  PERFORM public.fleet_control_log(v_control_id, 'item_' || p_status,
    jsonb_build_object('item_id', p_item, 'reason', p_reason), 'admin');
END;$fn$;

-- immobilize request guard (system bypass)
CREATE OR REPLACE FUNCTION public.fleet_control_immobilize_request(p_control uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_row public.vehicle_inspections;
BEGIN
  SELECT * INTO v_row FROM public.vehicle_inspections WHERE id=p_control;
  IF v_row IS NULL THEN RAISE EXCEPTION 'control_not_found'; END IF;
  -- System (service-role caller, no auth.uid) is permitted for auto-immobilization
  IF auth.uid() IS NOT NULL THEN
    PERFORM public.fc_require_admin(v_row.customer_id);
  END IF;
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
  VALUES (v_row.customer_id, v_row.vehicle_id, p_control, 'pending',
          CASE WHEN auth.uid() IS NULL THEN 'auto_overdue' ELSE 'manual' END,
          auth.uid(), p_reason);

  PERFORM public.fleet_control_log(p_control,'immobilization_requested',
    jsonb_build_object('reason',p_reason),
    CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'admin' END);
END;$fn$;

-- immobilize cancel guard
CREATE OR REPLACE FUNCTION public.fleet_control_immobilize_cancel(p_control uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_row public.vehicle_inspections;
BEGIN
  SELECT * INTO v_row FROM public.vehicle_inspections WHERE id=p_control;
  IF v_row IS NULL THEN RAISE EXCEPTION 'control_not_found'; END IF;
  PERFORM public.fc_require_admin(v_row.customer_id);

  UPDATE public.vehicle_inspections
     SET immobilization_state='cancelled',
         immobilization_cancelled_at=now(), updated_at=now()
   WHERE id=p_control AND immobilization_state IN ('requested','pending_stop');

  UPDATE public.vehicle_immobilization_commands
     SET status='cancelled', updated_at=now()
   WHERE inspection_id=p_control AND status IN ('pending','sent');

  PERFORM public.fleet_control_log(p_control,'immobilization_cancelled','{}'::jsonb,'admin');
END;$fn$;

-- unblock guard
CREATE OR REPLACE FUNCTION public.fleet_control_unblock(p_control uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_row public.vehicle_inspections;
BEGIN
  SELECT * INTO v_row FROM public.vehicle_inspections WHERE id=p_control;
  IF v_row IS NULL THEN RAISE EXCEPTION 'control_not_found'; END IF;
  PERFORM public.fc_require_admin(v_row.customer_id);

  UPDATE public.vehicle_inspections
     SET immobilization_state='unblocked', status='approved', updated_at=now()
   WHERE id=p_control;
  PERFORM public.fleet_control_log(p_control,'immobilization_unblocked','{}'::jsonb,'admin');
END;$fn$;