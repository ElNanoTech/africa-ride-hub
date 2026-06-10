
CREATE OR REPLACE FUNCTION public.set_customer_id_from_current()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS NULL THEN
    NEW.customer_id := public.current_customer_id();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_customer_id ON public.maintenance_orders;
CREATE TRIGGER trg_set_customer_id
BEFORE INSERT ON public.maintenance_orders
FOR EACH ROW EXECUTE FUNCTION public.set_customer_id_from_current();

DROP TRIGGER IF EXISTS trg_set_customer_id ON public.maintenance_providers;
CREATE TRIGGER trg_set_customer_id
BEFORE INSERT ON public.maintenance_providers
FOR EACH ROW EXECUTE FUNCTION public.set_customer_id_from_current();

DROP TRIGGER IF EXISTS trg_set_customer_id ON public.other_charges;
CREATE TRIGGER trg_set_customer_id
BEFORE INSERT ON public.other_charges
FOR EACH ROW EXECUTE FUNCTION public.set_customer_id_from_current();
