-- 1. Drop the legacy trigger that creates 28 daily payments on rental activation.
DROP TRIGGER IF EXISTS trigger_generate_rental_payments ON public.rentals;

-- 2. Keep the function around (in case other code references it) but make it a no-op
--    so it cannot accidentally be re-attached and fire again.
CREATE OR REPLACE FUNCTION public.generate_rental_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Deprecated: the single-day rental model creates the payment in
  -- confirm_rental_pickup(). This trigger is intentionally a no-op.
  RETURN NEW;
END;
$function$;

-- 3. Clean up the bad payments already inserted by the legacy trigger:
--    delete pending/unpaid rental payments for rentals that have not had
--    pickup confirmed yet (no final_rate set) and have more than one
--    pending payment row. Keep paid rows untouched.
DELETE FROM public.payments p
WHERE p.payment_type = 'rental'
  AND p.status = 'pending'
  AND p.rental_id IN (
    SELECT r.id FROM public.rentals r
    WHERE r.pickup_confirmed_at IS NULL
  );
