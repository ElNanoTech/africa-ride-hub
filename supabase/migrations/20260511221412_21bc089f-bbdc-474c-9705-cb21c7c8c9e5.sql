-- 1. Add amount_paid + expand status check
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS amount_paid integer NOT NULL DEFAULT 0;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'overdue'::text, 'waived'::text, 'partial'::text, 'overpaid'::text, 'late'::text]));

-- Backfill amount_paid for already-paid rows so ledger stays consistent
UPDATE public.payments
SET amount_paid = amount
WHERE status = 'paid' AND amount_paid = 0;

-- 2. Receipts ledger
CREATE TABLE IF NOT EXISTS public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  customer_id uuid,
  amount integer NOT NULL CHECK (amount > 0),
  method text NOT NULL DEFAULT 'wave' CHECK (method = ANY (ARRAY['wave'::text, 'cash'::text, 'orange'::text, 'mtn'::text, 'moov'::text, 'other'::text])),
  wave_transaction_id text,
  note text,
  recorded_by uuid,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_receipts_payment_idx ON public.payment_receipts(payment_id);
CREATE INDEX IF NOT EXISTS payment_receipts_customer_idx ON public.payment_receipts(customer_id);

ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_owners_all_receipts"
  ON public.payment_receipts
  FOR ALL
  USING (is_platform_owner())
  WITH CHECK (is_platform_owner());

CREATE POLICY "admins_view_tenant_receipts"
  ON public.payment_receipts
  FOR SELECT
  USING (is_admin() AND ((customer_id IS NULL) OR (customer_id = current_customer_id())));

CREATE POLICY "admins_insert_tenant_receipts"
  ON public.payment_receipts
  FOR INSERT
  WITH CHECK (
    has_admin_role_in(ARRAY['super_admin'::text, 'manager'::text])
    AND ((customer_id IS NULL) OR (customer_id = current_customer_id()))
  );

CREATE POLICY "drivers_view_own_receipts"
  ON public.payment_receipts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.id = payment_receipts.payment_id
        AND p.driver_id = current_driver_id()
    )
  );

-- 3. Trigger to recompute payments aggregate + credit overpayment to wallet
CREATE OR REPLACE FUNCTION public.recompute_payment_from_receipts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_total integer;
  v_overage integer;
  v_new_status text;
  v_balance integer;
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE id = NEW.payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total
  FROM public.payment_receipts WHERE payment_id = v_payment.id;

  IF v_total <= 0 THEN
    v_new_status := COALESCE(v_payment.status, 'pending');
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
      paid_at = CASE WHEN v_new_status IN ('paid', 'overpaid') AND paid_at IS NULL THEN now() ELSE paid_at END,
      paid_date = CASE WHEN v_new_status IN ('paid', 'overpaid') AND paid_date IS NULL THEN CURRENT_DATE ELSE paid_date END,
      wave_transaction_id = COALESCE(wave_transaction_id, NEW.wave_transaction_id)
  WHERE id = v_payment.id;

  -- Credit any overage to driver wallet (only on the receipt that pushes it over)
  IF v_new_status = 'overpaid' THEN
    v_overage := v_total - v_payment.amount;
    -- Only credit the *new* surplus introduced by this receipt
    -- (previous overage already credited on prior receipts)
    DECLARE
      v_prior_total integer;
      v_prior_overage integer;
      v_delta integer;
      v_balance_after integer;
    BEGIN
      v_prior_total := v_total - NEW.amount;
      v_prior_overage := GREATEST(0, v_prior_total - v_payment.amount);
      v_delta := v_overage - v_prior_overage;

      IF v_delta > 0 THEN
        -- Ensure wallet exists
        INSERT INTO public.driver_wallets (driver_id, customer_id, balance)
        VALUES (v_payment.driver_id, v_payment.customer_id, 0)
        ON CONFLICT (driver_id) DO NOTHING;

        UPDATE public.driver_wallets
        SET balance = balance + v_delta,
            updated_at = now()
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
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_receipts_recompute ON public.payment_receipts;
CREATE TRIGGER trg_payment_receipts_recompute
AFTER INSERT ON public.payment_receipts
FOR EACH ROW
EXECUTE FUNCTION public.recompute_payment_from_receipts();