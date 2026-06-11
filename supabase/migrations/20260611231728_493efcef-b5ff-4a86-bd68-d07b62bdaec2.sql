-- Auto-create a Fleet Control entry when a rental becomes active
-- (Test #1 expectation: "fleet control is created from assignment/rental")

CREATE OR REPLACE FUNCTION public.fc_autocreate_from_rental()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle int;
  v_exists uuid;
BEGIN
  -- Only act when rental is (or becomes) active and has both vehicle + driver
  IF NEW.status <> 'active' OR NEW.vehicle_id IS NULL OR NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if there's already an open control for this driver+vehicle
  SELECT id INTO v_exists
    FROM public.vehicle_inspections
   WHERE vehicle_id = NEW.vehicle_id
     AND driver_id  = NEW.driver_id
     AND status IN ('pending','submitted','rejected','overdue','blocked')
   LIMIT 1;
  IF v_exists IS NOT NULL THEN RETURN NEW; END IF;

  v_cycle := COALESCE(
    (SELECT (setting_value)::text::int FROM public.platform_settings
      WHERE setting_key='fleet_control.cycle_days'),
    14
  );

  INSERT INTO public.vehicle_inspections
    (customer_id, vehicle_id, driver_id, rental_id, status, due_at, cycle_days)
  VALUES
    (NEW.customer_id, NEW.vehicle_id, NEW.driver_id, NEW.id,
     'pending', now() + (v_cycle || ' days')::interval, v_cycle);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fc_autocreate_from_rental ON public.rentals;
CREATE TRIGGER trg_fc_autocreate_from_rental
AFTER INSERT OR UPDATE OF status ON public.rentals
FOR EACH ROW EXECUTE FUNCTION public.fc_autocreate_from_rental();