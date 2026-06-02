-- ============================================================
-- Partial-payment propagation: invoice tracks balance from receipts
-- ============================================================

-- 1. Extend invoice status check to include 'partial'
ALTER TABLE public.invoice DROP CONSTRAINT IF EXISTS invoice_status_check;
ALTER TABLE public.invoice ADD CONSTRAINT invoice_status_check
  CHECK (status IN ('draft','issued','partial','paid','cancelled'));

-- 2. Add amount_paid + generated remaining_due
ALTER TABLE public.invoice
  ADD COLUMN IF NOT EXISTS amount_paid integer NOT NULL DEFAULT 0;

ALTER TABLE public.invoice
  DROP COLUMN IF EXISTS remaining_due;
ALTER TABLE public.invoice
  ADD COLUMN remaining_due integer
  GENERATED ALWAYS AS (GREATEST(COALESCE(total_ttc,0) - COALESCE(amount_paid,0), 0)) STORED;

-- 3. Backfill amount_paid from existing receipts via invoice_payment_link → payments → payment_receipts
UPDATE public.invoice i
SET amount_paid = LEAST(
  COALESCE((
    SELECT SUM(pr.amount)::int
    FROM public.invoice_payment_link ipl
    JOIN public.payment_receipts pr ON pr.payment_id = ipl.payment_id
    WHERE ipl.invoice_id = i.id
  ), 0),
  i.total_ttc
)
WHERE EXISTS (
  SELECT 1 FROM public.invoice_payment_link ipl WHERE ipl.invoice_id = i.id
);

-- Backfill: invoices already 'paid' with no receipt rows → mirror total_ttc
UPDATE public.invoice
SET amount_paid = total_ttc
WHERE status = 'paid' AND amount_paid = 0;

-- ============================================================
-- 4. Rewrite recompute_payment_from_receipts():
--    - fires on INSERT/UPDATE/DELETE
--    - locks payment + invoice rows with FOR UPDATE
--    - propagates amount_paid + status into linked invoice
--    - writes invoice_audit 'overpaid' entry on surplus
-- ============================================================
CREATE OR REPLACE FUNCTION public.recompute_payment_from_receipts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid := COALESCE(NEW.payment_id, OLD.payment_id);
  v_payment public.payments%ROWTYPE;
  v_total integer;
  v_new_status text;
  v_invoice_id uuid;
  v_invoice public.invoice%ROWTYPE;
  v_invoice_paid integer;
  v_invoice_new_status text;
  v_overage integer;
  v_prior_total integer;
  v_prior_overage integer;
  v_delta integer;
  v_balance_after integer;
BEGIN
  IF v_payment_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Lock parent payment first
  SELECT * INTO v_payment FROM public.payments WHERE id = v_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Recompute aggregate from ledger
  SELECT COALESCE(SUM(amount), 0)::int INTO v_total
  FROM public.payment_receipts WHERE payment_id = v_payment.id;

  IF v_total <= 0 THEN
    v_new_status := 'pending';
  ELSIF v_total < v_payment.amount THEN
    v_new_status := 'partial';
  ELSIF v_total = v_payment.amount THEN
    v_new_status := 'paid';
  ELSE
    v_new_status := 'overpaid';
  END IF;

  UPDATE public.payments
  SET amount_paid = v_total,
      status = v_new_status,
      paid_at = CASE
        WHEN v_new_status IN ('paid','overpaid') AND paid_at IS NULL THEN now()
        WHEN v_new_status IN ('pending','partial') THEN NULL
        ELSE paid_at END,
      paid_date = CASE
        WHEN v_new_status IN ('paid','overpaid') AND paid_date IS NULL THEN CURRENT_DATE
        WHEN v_new_status IN ('pending','partial') THEN NULL
        ELSE paid_date END,
      wave_transaction_id = COALESCE(wave_transaction_id,
        CASE WHEN TG_OP <> 'DELETE' THEN NEW.wave_transaction_id END)
  WHERE id = v_payment.id;

  -- ---------- Overpaid wallet credit (only on INSERT that pushes it over) ----------
  IF TG_OP = 'INSERT' AND v_new_status = 'overpaid' THEN
    v_overage := v_total - v_payment.amount;
    v_prior_total := v_total - NEW.amount;
    v_prior_overage := GREATEST(0, v_prior_total - v_payment.amount);
    v_delta := v_overage - v_prior_overage;

    IF v_delta > 0 THEN
      INSERT INTO public.driver_wallets (driver_id, customer_id, balance)
      VALUES (v_payment.driver_id, v_payment.customer_id, 0)
      ON CONFLICT (driver_id) DO NOTHING;

      UPDATE public.driver_wallets
      SET balance = balance + v_delta, updated_at = now()
      WHERE driver_id = v_payment.driver_id
      RETURNING balance INTO v_balance_after;

      INSERT INTO public.driver_wallet_transactions
        (driver_id, customer_id, payment_id, type, amount, balance_after, method, reference, note, created_by)
      VALUES (
        v_payment.driver_id, v_payment.customer_id, v_payment.id,
        'credit', v_delta, COALESCE(v_balance_after, v_delta),
        NEW.method, NEW.wave_transaction_id,
        'Trop-perçu sur paiement ' || v_payment.id::text,
        NEW.recorded_by
      );
    END IF;
  END IF;

  -- ---------- Propagate to linked invoice ----------
  SELECT invoice_id INTO v_invoice_id
  FROM public.invoice_payment_link
  WHERE payment_id = v_payment.id
  LIMIT 1;

  IF v_invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice FROM public.invoice WHERE id = v_invoice_id FOR UPDATE;
    IF FOUND AND v_invoice.status <> 'cancelled' THEN
      -- Sum of all receipts across all payments linked to this invoice
      SELECT COALESCE(SUM(pr.amount), 0)::int INTO v_invoice_paid
      FROM public.invoice_payment_link ipl
      JOIN public.payment_receipts pr ON pr.payment_id = ipl.payment_id
      WHERE ipl.invoice_id = v_invoice_id;

      IF v_invoice_paid <= 0 THEN
        v_invoice_new_status := CASE WHEN v_invoice.status = 'draft' THEN 'draft' ELSE 'issued' END;
      ELSIF v_invoice_paid < v_invoice.total_ttc THEN
        v_invoice_new_status := 'partial';
      ELSE
        v_invoice_new_status := 'paid';
      END IF;

      UPDATE public.invoice
      SET amount_paid = LEAST(v_invoice_paid, total_ttc),
          status = v_invoice_new_status,
          paid_at = CASE
            WHEN v_invoice_new_status = 'paid' AND paid_at IS NULL THEN COALESCE(v_payment.paid_at, now())
            WHEN v_invoice_new_status IN ('issued','partial') THEN NULL
            ELSE paid_at END
      WHERE id = v_invoice_id;

      -- Audit: overpaid surplus
      IF v_invoice_paid > v_invoice.total_ttc THEN
        INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
        VALUES (v_invoice_id, v_invoice.customer_id, 'overpaid', NULL, 'system',
          jsonb_build_object(
            'payment_id', v_payment.id,
            'total_received', v_invoice_paid,
            'invoice_total', v_invoice.total_ttc,
            'surplus', v_invoice_paid - v_invoice.total_ttc));
      ELSIF v_invoice_new_status = 'partial' AND v_invoice.status <> 'partial' THEN
        INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
        VALUES (v_invoice_id, v_invoice.customer_id, 'partial', NULL, 'system',
          jsonb_build_object(
            'payment_id', v_payment.id,
            'amount_paid', v_invoice_paid,
            'remaining_due', GREATEST(v_invoice.total_ttc - v_invoice_paid, 0)));
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_receipts_recompute ON public.payment_receipts;
CREATE TRIGGER trg_payment_receipts_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.payment_receipts
FOR EACH ROW
EXECUTE FUNCTION public.recompute_payment_from_receipts();

-- ============================================================
-- 5. Extend auto_generate_invoice_on_payment() — handle 'partial'
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_generate_invoice_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_settings public.customer_billing_settings;
  v_drv public.drivers;
  v_invoice_id uuid;
  v_linked_invoice_id uuid;
  v_vat numeric(5,2) := 0;
  v_vat_amount integer := 0;
  v_designation text;
  v_is_paid boolean;
  v_was_paid boolean;
  v_is_partial boolean;
  v_was_partial boolean;
BEGIN
  v_is_paid    := NEW.status IN ('paid','overpaid');
  v_was_paid   := (TG_OP = 'UPDATE' AND OLD.status IN ('paid','overpaid'));
  v_is_partial := NEW.status = 'partial';
  v_was_partial:= (TG_OP = 'UPDATE' AND OLD.status = 'partial');

  -- Only act on meaningful transitions
  IF NOT v_is_paid AND NOT v_is_partial THEN
    RETURN NEW;
  END IF;
  IF v_is_paid AND v_was_paid THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS NULL OR NEW.driver_id IS NULL OR NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- Find linked invoice
  SELECT invoice_id INTO v_linked_invoice_id
  FROM public.invoice_payment_link
  WHERE payment_id = NEW.id
  LIMIT 1;

  -- ---------- Partial branch ----------
  IF v_is_partial THEN
    -- Never auto-generate a brand-new invoice on partial.
    IF v_linked_invoice_id IS NULL THEN
      RETURN NEW;
    END IF;

    UPDATE public.invoice
       SET status = 'partial',
           amount_paid = LEAST(COALESCE(NEW.amount_paid, 0), total_ttc),
           paid_at = NULL
     WHERE id = v_linked_invoice_id
       AND status IN ('issued','partial');

    IF FOUND THEN
      INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
      VALUES (v_linked_invoice_id, NEW.customer_id, 'partial', NULL, 'system',
        jsonb_build_object('payment_id', NEW.id, 'amount_paid', NEW.amount_paid, 'status', NEW.status));
    END IF;

    RETURN NEW;
  END IF;

  -- ---------- Paid / overpaid branches (unchanged) ----------
  -- Path A: pre-linked invoice
  IF v_linked_invoice_id IS NOT NULL THEN
    UPDATE public.invoice
       SET status = 'paid',
           amount_paid = LEAST(COALESCE(NEW.amount_paid, NEW.amount), total_ttc),
           paid_at = COALESCE(NEW.paid_at, now())
     WHERE id = v_linked_invoice_id
       AND status <> 'paid';

    IF FOUND THEN
      INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
      VALUES (v_linked_invoice_id, NEW.customer_id, 'paid', NULL, 'system',
              jsonb_build_object('payment_id', NEW.id, 'source', 'payment_status_change', 'status', NEW.status));
    END IF;

    RETURN NEW;
  END IF;

  -- Path B: legacy auto-invoice
  SELECT * INTO v_settings FROM public.customer_billing_settings WHERE customer_id = NEW.customer_id;
  IF v_settings IS NULL OR NOT v_settings.module_enabled OR NOT v_settings.auto_invoicing THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_drv FROM public.drivers WHERE id = NEW.driver_id;

  IF v_settings.vat_enabled THEN
    v_vat := v_settings.vat_rate;
    v_vat_amount := round(NEW.amount * v_vat / 100.0)::integer;
  END IF;

  v_designation := CASE NEW.payment_type
    WHEN 'rental' THEN 'Location véhicule'
    WHEN 'loan'   THEN 'Échéance de prêt'
    ELSE 'Paiement'
  END;

  INSERT INTO public.invoice (
    customer_id, driver_id, status, invoice_kind,
    driver_snapshot_name, driver_snapshot_phone,
    subtotal_ht, vat_amount, total_ttc, amount_paid,
    vat_rate_snapshot, vat_enabled_snapshot,
    legal_name_snapshot, legal_nif_snapshot, legal_rccm_snapshot,
    legal_address_snapshot, legal_footer_snapshot,
    rental_id
  ) VALUES (
    NEW.customer_id, NEW.driver_id, 'issued', 'invoice',
    v_drv.full_name, v_drv.phone_number,
    NEW.amount, v_vat_amount, NEW.amount + v_vat_amount, 0,
    v_vat, v_settings.vat_enabled,
    v_settings.legal_name, v_settings.legal_nif, v_settings.legal_rccm,
    v_settings.legal_address, v_settings.legal_footer,
    NEW.rental_id
  ) RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_line (
    invoice_id, customer_id, position, designation, quantity,
    unit_price, line_total_ht, vat_rate, line_vat, line_total_ttc, source_payment_id
  ) VALUES (
    v_invoice_id, NEW.customer_id, 1, v_designation, 1,
    NEW.amount, NEW.amount, v_vat, v_vat_amount, NEW.amount + v_vat_amount, NEW.id
  );

  INSERT INTO public.invoice_payment_link (invoice_id, payment_id, customer_id)
  VALUES (v_invoice_id, NEW.id, NEW.customer_id);

  UPDATE public.invoice
    SET status = 'paid',
        amount_paid = LEAST(COALESCE(NEW.amount_paid, NEW.amount), total_ttc),
        paid_at = COALESCE(NEW.paid_at, now())
    WHERE id = v_invoice_id;

  INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
  VALUES (v_invoice_id, NEW.customer_id, 'auto_generated', NULL, 'system',
          jsonb_build_object('payment_id', NEW.id, 'payment_type', NEW.payment_type, 'status', NEW.status));

  RETURN NEW;
END;
$function$;

-- ============================================================
-- 6. Update enforce_invoice_status_transition() — allow new transitions
-- ============================================================
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
    (OLD.status = 'draft'   AND NEW.status IN ('issued','cancelled')) OR
    (OLD.status = 'issued'  AND NEW.status IN ('partial','paid','cancelled')) OR
    (OLD.status = 'partial' AND NEW.status IN ('partial','paid','issued','cancelled')) OR
    (OLD.status = 'paid'    AND NEW.status IN ('partial','cancelled'))
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