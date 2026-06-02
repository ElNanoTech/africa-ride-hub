-- Admin-only wrapper: create a rental for a driver and immediately
-- run it through the canonical approve_and_activate_rental flow.
CREATE OR REPLACE FUNCTION public.admin_create_rental(
  p_driver_id uuid,
  p_vehicle_id uuid,
  p_rate integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_open_statuses text[] := ARRAY[
    'pending','approved','active','paid',
    'return_pending','overdue_return','payment_overdue','vehicle_disabled'
  ];
  v_driver public.drivers;
  v_vehicle public.vehicles;
  v_existing_driver_rental uuid;
  v_existing_vehicle_rental uuid;
  v_rental_id uuid;
BEGIN
  -- AuthZ: mirror approve_and_activate_rental
  IF NOT public.has_admin_role_in(ARRAY['super_admin','manager']) THEN
    RAISE EXCEPTION 'forbidden: super_admin or manager required' USING ERRCODE = '42501';
  END IF;

  IF p_driver_id IS NULL OR p_vehicle_id IS NULL THEN
    RAISE EXCEPTION 'driver and vehicle are required';
  END IF;
  IF p_rate IS NULL OR p_rate <= 0 THEN
    RAISE EXCEPTION 'rate must be greater than 0';
  END IF;

  -- Driver must exist and be active
  SELECT * INTO v_driver FROM public.drivers WHERE id = p_driver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver not found';
  END IF;
  IF v_driver.driver_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Driver is not active';
  END IF;

  -- Vehicle must exist
  SELECT * INTO v_vehicle FROM public.vehicles WHERE id = p_vehicle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vehicle not found';
  END IF;

  -- Driver must not have an open rental
  SELECT id INTO v_existing_driver_rental
    FROM public.rentals
    WHERE driver_id = p_driver_id
      AND status = ANY (v_open_statuses)
    LIMIT 1;
  IF v_existing_driver_rental IS NOT NULL THEN
    RAISE EXCEPTION 'Driver has an active rental';
  END IF;

  -- Vehicle must not be in an open rental
  SELECT id INTO v_existing_vehicle_rental
    FROM public.rentals
    WHERE vehicle_id = p_vehicle_id
      AND status = ANY (v_open_statuses)
    LIMIT 1;
  IF v_existing_vehicle_rental IS NOT NULL THEN
    RAISE EXCEPTION 'Vehicle is currently rented';
  END IF;

  -- Insert pending rental (customer_id auto-stamped by trigger)
  INSERT INTO public.rentals (driver_id, vehicle_id, start_date, status)
  VALUES (p_driver_id, p_vehicle_id, CURRENT_DATE, 'pending')
  RETURNING id INTO v_rental_id;

  -- Delegate to canonical approval flow (creates invoice, payment, applies wallet)
  PERFORM public.approve_and_activate_rental(
    p_rental_id := v_rental_id,
    p_rate := p_rate
  );

  RETURN v_rental_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_rental(uuid, uuid, integer) TO authenticated;