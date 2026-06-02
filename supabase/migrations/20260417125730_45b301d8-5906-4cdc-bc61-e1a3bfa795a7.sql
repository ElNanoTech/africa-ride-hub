
-- 1. Update generate_rental_payments to always create daily payments
CREATE OR REPLACE FUNCTION public.generate_rental_payments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_daily_rate INTEGER;
  v_due_date DATE;
  i INTEGER;
BEGIN
  IF NEW.status <> 'active' OR (OLD.status IS NOT DISTINCT FROM NEW.status) THEN
    RETURN NEW;
  END IF;

  SELECT rent_per_day INTO v_daily_rate
  FROM public.vehicles
  WHERE id = NEW.vehicle_id;

  IF v_daily_rate IS NULL THEN
    RAISE WARNING 'Vehicle % not found or has no rent_per_day for rental %', NEW.vehicle_id, NEW.id;
    RETURN NEW;
  END IF;

  -- Always 28 daily payments
  FOR i IN 1..28 LOOP
    v_due_date := NEW.start_date + i;
    INSERT INTO public.payments (
      driver_id, rental_id, amount, due_date, payment_type, status, customer_id
    ) VALUES (
      NEW.driver_id, NEW.id, v_daily_rate, v_due_date, 'rental', 'pending', NEW.customer_id
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- 2. Update notify_rental_request to drop rental_plan reference
CREATE OR REPLACE FUNCTION public.notify_rental_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.notifications (
    driver_id,
    title,
    message,
    notification_type
  ) VALUES (
    NEW.driver_id,
    'Demande de location soumise',
    'Votre demande de location a été soumise. Un administrateur examinera votre demande bientôt.',
    'rental_status'
  );
  RETURN NEW;
END;
$function$;

-- 3. Drop the columns
ALTER TABLE public.vehicles DROP COLUMN IF EXISTS rent_per_week;
ALTER TABLE public.rentals DROP COLUMN IF EXISTS rental_plan;
