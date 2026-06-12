CREATE OR REPLACE FUNCTION public.fleet_control_submit(p_control uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_row public.vehicle_inspections;
  v_missing int;
BEGIN
  SELECT * INTO v_row FROM public.vehicle_inspections WHERE id = p_control;
  IF v_row IS NULL THEN RAISE EXCEPTION 'control_not_found'; END IF;
  IF v_row.driver_id <> public.current_driver_id() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT count(*) INTO v_missing
    FROM (VALUES
      ('front'),('rear'),('left'),('right'),('interior_front'),('interior_rear'),('dash'),
      ('doc_carte_grise'),('doc_assurance'),('doc_vignette'),('doc_permis')
    ) AS req(zone)
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

  UPDATE public.vehicle_inspection_photos
     SET validation_status = CASE WHEN validation_status='pending' THEN 'submitted' ELSE validation_status END,
         submitted_at = COALESCE(submitted_at, now()),
         updated_at = now()
   WHERE inspection_id = p_control;

  UPDATE public.vehicle_inspections
     SET status='submitted', submitted_at=now(), updated_at=now()
   WHERE id=p_control;

  PERFORM public.fleet_control_log(p_control,'control_submitted','{}'::jsonb,'driver');
END;
$$;
GRANT EXECUTE ON FUNCTION public.fleet_control_submit(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fleet_control_approve(p_control uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $fn$
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
              COALESCE((SELECT (setting_value)::text::int FROM public.platform_settings
                         WHERE setting_key='fleet_control.cycle_days'),14));

  v_required := COALESCE((SELECT (setting_value)::text::boolean FROM public.platform_settings
                            WHERE setting_key='fleet_control.require_all_photos'), true);
  IF v_required THEN
    SELECT count(*) INTO v_missing
      FROM (VALUES ('front'),('rear'),('left'),('right'),('interior_front'),('interior_rear'),('dash'),
        ('doc_carte_grise'),('doc_assurance'),('doc_vignette'),('doc_permis')) AS req(zone)
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
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.fleet_control_approve(uuid) TO authenticated;

WITH orphan_items AS (
  DELETE FROM public.vehicle_inspection_photos p
  WHERE p.storage_path IS NULL
     OR p.storage_path = ''
     OR NOT EXISTS (
       SELECT 1 FROM storage.objects o
       WHERE o.bucket_id = 'vehicle-inspections'
         AND o.name = p.storage_path
     )
  RETURNING p.inspection_id
), affected_controls AS (
  SELECT DISTINCT inspection_id FROM orphan_items
)
UPDATE public.vehicle_inspections vi
   SET status = CASE WHEN vi.status IN ('submitted', 'rejected') THEN 'pending' ELSE vi.status END,
       submitted_at = CASE WHEN vi.status IN ('submitted', 'rejected') THEN NULL ELSE vi.submitted_at END,
       rejection_reason = CASE WHEN vi.status IN ('submitted', 'rejected') THEN NULL ELSE vi.rejection_reason END,
       updated_at = now()
  FROM affected_controls ac
 WHERE vi.id = ac.inspection_id
   AND vi.status IN ('submitted', 'rejected', 'pending', 'overdue', 'blocked');