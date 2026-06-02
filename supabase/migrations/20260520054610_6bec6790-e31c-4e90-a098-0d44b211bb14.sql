
-- ============================================================
-- PART 1 — WALLET LEDGER STRENGTHENING
-- ============================================================

-- driver_wallets: optional metadata, no behavioural change
ALTER TABLE public.driver_wallets
  ADD COLUMN IF NOT EXISTS currency   text    NOT NULL DEFAULT 'XOF',
  ADD COLUMN IF NOT EXISTS is_active  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- driver_wallet_transactions: spec-required columns (nullable / defaulted so legacy rows remain valid)
ALTER TABLE public.driver_wallet_transactions
  ADD COLUMN IF NOT EXISTS wallet_id  uuid,
  ADD COLUMN IF NOT EXISTS direction  text,
  ADD COLUMN IF NOT EXISTS metadata   jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Back-fill wallet_id and direction for existing rows (safe, no-op on second run)
UPDATE public.driver_wallet_transactions t
   SET wallet_id = w.id
  FROM public.driver_wallets w
 WHERE t.wallet_id IS NULL AND w.driver_id = t.driver_id;

UPDATE public.driver_wallet_transactions
   SET direction = CASE WHEN amount >= 0 THEN 'credit' ELSE 'debit' END
 WHERE direction IS NULL;

-- direction must be valid going forward
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_txn_direction_chk') THEN
    ALTER TABLE public.driver_wallet_transactions
      ADD CONSTRAINT wallet_txn_direction_chk CHECK (direction IN ('credit','debit')) NOT VALID;
    -- legacy rows backfilled above; mark valid
    ALTER TABLE public.driver_wallet_transactions VALIDATE CONSTRAINT wallet_txn_direction_chk;
  END IF;
END $$;

-- Idempotency: one overpayment credit per Wave payment
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_overpayment_per_payment
  ON public.driver_wallet_transactions (payment_id, type)
  WHERE type = 'overpayment_credit' AND payment_id IS NOT NULL;

-- Aggregated, ledger-derived balance view (independent of cached balance column)
CREATE OR REPLACE VIEW public.wallet_balance_view AS
SELECT
  w.id                                                                     AS wallet_id,
  w.customer_id,
  w.driver_id,
  COALESCE(SUM(CASE WHEN t.direction = 'credit' THEN t.amount ELSE 0 END), 0)::int AS total_credits,
  COALESCE(SUM(CASE WHEN t.direction = 'debit'  THEN t.amount ELSE 0 END), 0)::int AS total_debits,
  COALESCE(SUM(CASE WHEN t.direction = 'credit' THEN t.amount ELSE -t.amount END), 0)::int AS available_balance,
  MAX(t.created_at) AS last_transaction_at,
  COUNT(t.id)::int  AS transaction_count
FROM public.driver_wallets w
LEFT JOIN public.driver_wallet_transactions t ON t.wallet_id = w.id
GROUP BY w.id, w.customer_id, w.driver_id;

-- ============================================================
-- PART 2 — credit_driver_wallet idempotency for overpayments
-- ============================================================
CREATE OR REPLACE FUNCTION public.credit_driver_wallet(
  p_driver_id  uuid,
  p_amount     integer,
  p_type       text DEFAULT 'upfront_deposit',
  p_invoice_id uuid DEFAULT NULL,
  p_payment_id uuid DEFAULT NULL,
  p_rental_id  uuid DEFAULT NULL,
  p_method     text DEFAULT NULL,
  p_reference  text DEFAULT NULL,
  p_note       text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_id uuid;
  v_wallet_id   uuid;
  v_new_balance integer;
BEGIN
  IF p_amount <= 0 THEN RETURN 0; END IF;

  -- Idempotency: skip duplicate overpayment credit for same payment
  IF p_type = 'overpayment_credit' AND p_payment_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.driver_wallet_transactions
      WHERE payment_id = p_payment_id AND type = 'overpayment_credit'
    ) THEN
      SELECT balance INTO v_new_balance FROM public.driver_wallets WHERE driver_id = p_driver_id;
      RETURN COALESCE(v_new_balance, 0);
    END IF;
  END IF;

  SELECT customer_id INTO v_customer_id FROM public.drivers WHERE id = p_driver_id;

  INSERT INTO public.driver_wallets (driver_id, customer_id, balance, updated_at)
  VALUES (p_driver_id, v_customer_id, p_amount, now())
  ON CONFLICT (driver_id) DO UPDATE
    SET balance = public.driver_wallets.balance + EXCLUDED.balance,
        updated_at = now()
  RETURNING id, balance INTO v_wallet_id, v_new_balance;

  INSERT INTO public.driver_wallet_transactions
    (driver_id, customer_id, wallet_id, rental_id, invoice_id, payment_id,
     type, direction, amount, balance_after, method, reference, note, created_by)
  VALUES
    (p_driver_id, v_customer_id, v_wallet_id, p_rental_id, p_invoice_id, p_payment_id,
     p_type, 'credit', p_amount, v_new_balance, p_method, p_reference, p_note, p_created_by);

  RETURN v_new_balance;
EXCEPTION WHEN unique_violation THEN
  -- Race with another concurrent overpayment credit for same payment_id
  SELECT balance INTO v_new_balance FROM public.driver_wallets WHERE driver_id = p_driver_id;
  RETURN COALESCE(v_new_balance, 0);
END;
$function$;

-- Make apply_wallet_to_invoice also tag direction = 'debit' on the row it inserts
-- (it currently doesn't pass direction, but with the new NOT-NULL-ish check it must)
-- Re-emit with direction set, no behavioural change otherwise.
CREATE OR REPLACE FUNCTION public.apply_wallet_to_invoice(
  p_driver_id  uuid,
  p_rental_id  uuid,
  p_invoice_id uuid,
  p_payment_id uuid,
  p_amount_due integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet public.driver_wallets;
  v_apply integer;
  v_new_balance integer;
BEGIN
  IF p_amount_due <= 0 THEN RETURN 0; END IF;

  SELECT * INTO v_wallet FROM public.driver_wallets WHERE driver_id = p_driver_id FOR UPDATE;
  IF NOT FOUND OR v_wallet.balance <= 0 THEN RETURN 0; END IF;

  v_apply := LEAST(v_wallet.balance, p_amount_due);
  v_new_balance := v_wallet.balance - v_apply;

  UPDATE public.driver_wallets
     SET balance = v_new_balance, updated_at = now()
   WHERE driver_id = p_driver_id;

  INSERT INTO public.driver_wallet_transactions
    (driver_id, customer_id, wallet_id, rental_id, invoice_id, payment_id,
     type, direction, amount, balance_after, note)
  VALUES
    (p_driver_id, v_wallet.customer_id, v_wallet.id, p_rental_id, p_invoice_id, p_payment_id,
     'rental_invoice_applied', 'debit', v_apply, v_new_balance,
     'Application automatique du crédit portefeuille');

  RETURN v_apply;
END;
$function$;

-- ============================================================
-- PART 3 — Daily invoicing feature flag (per-tenant)
-- ============================================================
ALTER TABLE public.customer_billing_settings
  ADD COLUMN IF NOT EXISTS daily_invoicing_enabled boolean NOT NULL DEFAULT true;

-- ============================================================
-- PART 4 — Calendar-day daily rental invoicing
-- Rewrites issue_daily_rental_invoices to use Africa/Abidjan
-- calendar days, with due = next day 12:00 noon Abidjan.
-- Signature unchanged so all callers keep working.
-- ============================================================
CREATE OR REPLACE FUNCTION public.issue_daily_rental_invoices()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_rental         public.rentals;
  v_drv            public.drivers;
  v_settings       public.customer_billing_settings;
  v_rate           integer;
  v_total          integer;
  v_inserted       integer := 0;
  v_base_day       date;
  v_today_abj      date;
  v_d              date;
  v_invoice_id     uuid;
  v_payment_id     uuid;
  v_due_at         timestamptz;
  v_issued_at      timestamptz;
BEGIN
  v_today_abj := (now() AT TIME ZONE 'Africa/Abidjan')::date;

  FOR v_rental IN
    SELECT r.*
      FROM public.rentals r
     WHERE r.returned_at IS NULL
       AND r.status NOT IN ('completed','terminated','rejected','cancelled','paid')
       AND r.approval_date IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.invoice i
          WHERE i.rental_id = r.id
            AND i.invoice_kind IN ('invoice','daily_rental')
       )
  LOOP
    SELECT * INTO v_settings
      FROM public.customer_billing_settings
     WHERE customer_id = v_rental.customer_id;

    -- Skip when tenant disabled automatic daily invoicing
    IF v_settings.id IS NOT NULL
       AND COALESCE(v_settings.daily_invoicing_enabled, true) = false THEN
      CONTINUE;
    END IF;

    v_rate := COALESCE(v_rental.final_rate, v_rental.approved_rate, 0);
    IF v_rate <= 0 THEN CONTINUE; END IF;
    v_total := v_rate;

    SELECT * INTO v_drv FROM public.drivers WHERE id = v_rental.driver_id;

    -- Day 1 is the approval day in Abidjan tz; the upfront invoice already covers it.
    v_base_day := (v_rental.approval_date AT TIME ZONE 'Africa/Abidjan')::date;

    -- Iterate calendar days strictly after Day 1, up to today (no future).
    v_d := v_base_day + 1;
    WHILE v_d <= v_today_abj LOOP
      -- Skip if this rental + period_start daily_rental already exists
      -- (uniq_daily_rental_per_period also enforces this at the index level).
      IF NOT EXISTS (
        SELECT 1 FROM public.invoice
         WHERE rental_id = v_rental.id
           AND invoice_kind = 'daily_rental'
           AND period_start = v_d
      ) THEN
        v_issued_at := ((v_d::text || ' 12:00')::timestamp AT TIME ZONE 'Africa/Abidjan');
        v_due_at    := (((v_d + 1)::text || ' 12:00')::timestamp AT TIME ZONE 'Africa/Abidjan');

        BEGIN
          INSERT INTO public.invoice (
            customer_id, driver_id, status, invoice_kind,
            driver_snapshot_name, driver_snapshot_phone,
            subtotal_ht, vat_amount, total_ttc,
            vat_rate_snapshot, vat_enabled_snapshot,
            legal_name_snapshot, legal_nif_snapshot, legal_rccm_snapshot,
            legal_address_snapshot, legal_footer_snapshot,
            rental_id, period_start, period_end, issued_at
          ) VALUES (
            v_rental.customer_id, v_rental.driver_id, 'issued', 'daily_rental',
            v_drv.full_name, v_drv.phone_number,
            v_total, 0, v_total,
            COALESCE(v_settings.vat_rate, 0), COALESCE(v_settings.vat_enabled, false),
            v_settings.legal_name, v_settings.legal_nif, v_settings.legal_rccm,
            v_settings.legal_address, v_settings.legal_footer,
            v_rental.id, v_d, v_d, v_issued_at
          )
          RETURNING id INTO v_invoice_id;
        EXCEPTION WHEN unique_violation THEN
          -- Concurrent run inserted the same day; skip.
          v_d := v_d + 1;
          CONTINUE;
        END;

        -- Single line item describing the rental day
        INSERT INTO public.invoice_line (
          invoice_id, customer_id, position, designation,
          quantity, unit_price, line_total_ht, vat_rate, line_vat, line_total_ttc
        ) VALUES (
          v_invoice_id, v_rental.customer_id, 1,
          'Location journalière — ' || to_char(v_d, 'DD/MM/YYYY'),
          1, v_total, v_total, 0, 0, v_total
        );

        -- Payable row so driver can pay from the PWA
        INSERT INTO public.payments (
          driver_id, customer_id, rental_id, invoice_id,
          payment_type, amount, due_date, status
        ) VALUES (
          v_rental.driver_id, v_rental.customer_id, v_rental.id, v_invoice_id,
          'rental', v_total, (v_due_at AT TIME ZONE 'Africa/Abidjan')::date, 'pending'
        )
        RETURNING id INTO v_payment_id;

        -- Auto-apply wallet credit if any
        PERFORM public.apply_wallet_to_invoice(
          v_rental.driver_id, v_rental.id, v_invoice_id, v_payment_id, v_total
        );

        v_inserted := v_inserted + 1;
      END IF;

      v_d := v_d + 1;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END;
$function$;
