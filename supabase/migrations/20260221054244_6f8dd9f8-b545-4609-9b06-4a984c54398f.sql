
-- Function to auto-generate payment schedule when rental is approved
CREATE OR REPLACE FUNCTION public.generate_rental_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_vehicle RECORD;
  v_payment_amount INTEGER;
  v_interval_days INTEGER;
  v_num_payments INTEGER;
  v_due_date DATE;
  i INTEGER;
BEGIN
  -- Only trigger when status changes TO 'active'
  IF NEW.status <> 'active' OR (OLD.status IS NOT DISTINCT FROM NEW.status) THEN
    RETURN NEW;
  END IF;

  -- Get vehicle rent info
  SELECT rent_per_day, rent_per_week INTO v_vehicle
  FROM public.vehicles
  WHERE id = NEW.vehicle_id;

  IF v_vehicle IS NULL THEN
    RAISE WARNING 'Vehicle % not found for rental %', NEW.vehicle_id, NEW.id;
    RETURN NEW;
  END IF;

  -- Determine payment amount and interval based on rental_plan
  IF NEW.rental_plan = 'weekly' THEN
    v_payment_amount := COALESCE(v_vehicle.rent_per_week, v_vehicle.rent_per_day * 7);
    v_interval_days := 7;
  ELSE
    -- daily plan
    v_payment_amount := v_vehicle.rent_per_day;
    v_interval_days := 1;
  END IF;

  -- Generate payments for 4 weeks (28 days) initially
  -- For weekly: 4 payments, for daily: 28 payments
  v_num_payments := CASE WHEN NEW.rental_plan = 'weekly' THEN 4 ELSE 28 END;

  FOR i IN 1..v_num_payments LOOP
    v_due_date := NEW.start_date + (i * v_interval_days);
    
    INSERT INTO public.payments (
      driver_id,
      rental_id,
      amount,
      due_date,
      payment_type,
      status,
      customer_id
    ) VALUES (
      NEW.driver_id,
      NEW.id,
      v_payment_amount,
      v_due_date,
      'rental',
      'pending',
      NEW.customer_id
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Create trigger on rentals table
CREATE TRIGGER trigger_generate_rental_payments
  AFTER UPDATE ON public.rentals
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_rental_payments();
