-- B7: Block driver activation when KYC not verified
CREATE OR REPLACE FUNCTION public.enforce_kyc_before_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.driver_status = 'active'
     AND (OLD.driver_status IS DISTINCT FROM NEW.driver_status)
     AND NEW.kyc_status <> 'verified' THEN
    RAISE EXCEPTION 'KYC requis avant activation: le conducteur doit avoir kyc_status = verified pour passer en actif (actuel: %)', NEW.kyc_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_kyc_before_activation ON public.drivers;
CREATE TRIGGER trg_enforce_kyc_before_activation
BEFORE UPDATE OF driver_status ON public.drivers
FOR EACH ROW
EXECUTE FUNCTION public.enforce_kyc_before_activation();