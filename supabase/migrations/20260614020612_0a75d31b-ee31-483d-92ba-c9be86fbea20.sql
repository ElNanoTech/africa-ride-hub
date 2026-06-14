
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

  SELECT * INTO v_rental
    FROM public.rentals
   WHERE vehicle_id = p_vehicle AND status = 'active'
   ORDER BY created_at DESC
   LIMIT 1;
  v_driver := COALESCE(p_driver, v_rental.driver_id);

  IF v_rental.id IS NOT NULL AND (p_driver IS NULL OR p_driver = v_rental.driver_id) THEN
    v_rental_link := v_rental.id;
  END IF;

  IF v_driver IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.drivers d
     WHERE d.id = v_driver AND d.customer_id = v_vehicle.customer_id
  ) THEN
    RAISE EXCEPTION 'driver_not_in_tenant';
  END IF;

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

NOTIFY pgrst, 'reload schema';
