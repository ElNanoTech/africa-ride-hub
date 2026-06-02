CREATE OR REPLACE FUNCTION public.enforce_invoice_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft','issued') THEN
      RAISE EXCEPTION 'Invoice must start as draft or issued (got %)', NEW.status;
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
  END IF;

  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    IF OLD.status IN ('paid','cancelled') THEN
      -- Allow backfilling invoice_number/issued_at when previously NULL
      IF (OLD.invoice_number IS NOT NULL AND OLD.invoice_number IS DISTINCT FROM NEW.invoice_number)
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

DO $$
DECLARE
  r RECORD;
  v_year integer;
  v_n integer;
BEGIN
  FOR r IN
    SELECT id, customer_id, created_at
    FROM public.invoice
    WHERE invoice_number IS NULL
      AND status IN ('issued','paid','cancelled')
    ORDER BY created_at ASC
  LOOP
    v_year := extract(year from r.created_at)::integer;
    v_n := public.next_invoice_number(r.customer_id, v_year);
    UPDATE public.invoice
    SET invoice_number = public.format_invoice_number(r.customer_id, v_year, v_n),
        issued_at = COALESCE(issued_at, created_at)
    WHERE id = r.id;
  END LOOP;
END$$;