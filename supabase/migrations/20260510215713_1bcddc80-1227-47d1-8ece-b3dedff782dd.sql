-- Allow admin to edit invoice fields while invoice is still 'issued' (not yet paid).
-- Frozen rule remains for 'paid' and 'cancelled' invoices, where amounts are legally final.
CREATE OR REPLACE FUNCTION public.enforce_invoice_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft','issued') THEN
      RAISE EXCEPTION 'Invoice must start as draft or issued (got %)', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    -- Frozen fields only locked once invoice is paid or cancelled.
    -- 'issued' invoices remain editable by admin (e.g. fee amendments before payment).
    IF OLD.status IN ('paid','cancelled') THEN
      IF OLD.invoice_number IS DISTINCT FROM NEW.invoice_number
         OR OLD.driver_snapshot_name IS DISTINCT FROM NEW.driver_snapshot_name
         OR OLD.subtotal_ht IS DISTINCT FROM NEW.subtotal_ht
         OR OLD.vat_amount IS DISTINCT FROM NEW.vat_amount
         OR OLD.total_ttc IS DISTINCT FROM NEW.total_ttc THEN
        RAISE EXCEPTION 'Cannot modify frozen fields on paid/cancelled invoice';
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

  RETURN NEW;
END;
$$;