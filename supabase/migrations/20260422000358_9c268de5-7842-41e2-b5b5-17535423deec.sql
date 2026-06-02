-- Auto-activate a driver as soon as their KYC is verified, but only if
-- they are currently 'inactive' (never override a 'suspended' driver).
-- This removes the need for a separate manual activation step after KYC
-- approval, which was confusing admins into thinking the driver was live.

CREATE OR REPLACE FUNCTION public.auto_activate_on_kyc_verified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kyc_status = 'verified'
     AND COALESCE(OLD.kyc_status, '') <> 'verified'
     AND NEW.driver_status = 'inactive' THEN
    NEW.driver_status := 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_activate_on_kyc_verified ON public.drivers;
CREATE TRIGGER trg_auto_activate_on_kyc_verified
BEFORE UPDATE OF kyc_status ON public.drivers
FOR EACH ROW
EXECUTE FUNCTION public.auto_activate_on_kyc_verified();