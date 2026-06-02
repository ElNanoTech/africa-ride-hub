CREATE OR REPLACE FUNCTION public.enforce_invoice_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft','issued') THEN
      RAISE EXCEPTION 'Invoice must start as draft or issued (got %)', NEW.status;
    END IF;
    -- Assign number immediately when inserted as 'issued'
    IF NEW.status = 'issued' AND NEW.invoice_number IS NULL THEN
      DECLARE
        v_year integer := extract(year from now())::integer;
        v_n integer;
      BEGIN
        v_n := public.next_invoice_number(NEW.customer_id, v_year);
        NEW.invoice_number := public.format_invoice_number(NEW.customer_id, v_year, v_n);
        NEW.issued_at := COALESCE(NEW.issued_at, now());
      END;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    IF OLD.status IN ('issued','paid','cancelled') THEN
      IF OLD.invoice_number IS DISTINCT FROM NEW.invoice_number
         OR OLD.driver_snapshot_name IS DISTINCT FROM NEW.driver_snapshot_name
         OR OLD.subtotal_ht IS DISTINCT FROM NEW.subtotal_ht
         OR OLD.vat_amount IS DISTINCT FROM NEW.vat_amount
         OR OLD.total_ttc IS DISTINCT FROM NEW.total_ttc THEN
        RAISE EXCEPTION 'Cannot modify frozen fields on issued/paid/cancelled invoice';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'draft'  AND NEW.status IN ('issued','cancelled')) OR
    (OLD.status = 'issued' AND NEW.status IN ('paid','cancelled')) OR
    (OLD.status = 'paid'   AND NEW.status = 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Invalid invoice status transition: % -> %', OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'issued' AND NEW.invoice_number IS NULL THEN
    DECLARE
      v_year integer := extract(year from now())::integer;
      v_n integer;
    BEGIN
      v_n := public.next_invoice_number(NEW.customer_id, v_year);
      NEW.invoice_number := public.format_invoice_number(NEW.customer_id, v_year, v_n);
      NEW.issued_at := COALESCE(NEW.issued_at, now());
    END;
  END IF;

  IF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN
    NEW.paid_at := now();
  END IF;

  IF NEW.status = 'cancelled' THEN
    IF NEW.cancel_reason IS NULL OR length(trim(NEW.cancel_reason)) = 0 THEN
      RAISE EXCEPTION 'cancel_reason is required when cancelling an invoice';
    END IF;
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
  END IF;

  RETURN NEW;
END;
$function$;