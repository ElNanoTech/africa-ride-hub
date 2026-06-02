
-- 1. Canonical internal helper
CREATE OR REPLACE FUNCTION public._settle_wallet_to_payment(
  p_driver_id  uuid,
  p_invoice_id uuid,
  p_payment_id uuid,
  p_amount     integer,
  p_source     text DEFAULT 'manual'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wallet       public.driver_wallets;
  v_pay_remain   integer;
  v_inv          public.invoice;
  v_apply        integer;
  v_new_balance  integer;
  v_note         text;
  v_inv_found    boolean;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN 0; END IF;

  SELECT * INTO v_wallet
  FROM public.driver_wallets
  WHERE driver_id = p_driver_id
  FOR UPDATE;
  IF NOT FOUND OR v_wallet.balance <= 0 THEN RETURN 0; END IF;

  SELECT GREATEST(amount - amount_paid, 0) INTO v_pay_remain
  FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF v_pay_remain IS NULL OR v_pay_remain <= 0 THEN RETURN 0; END IF;

  SELECT * INTO v_inv FROM public.invoice WHERE id = p_invoice_id FOR UPDATE;
  v_inv_found := FOUND;
  IF v_inv_found AND v_inv.status = 'cancelled' THEN RETURN 0; END IF;

  v_apply := LEAST(v_wallet.balance, p_amount, v_pay_remain);
  IF v_inv_found AND COALESCE(v_inv.remaining_due, v_inv.total_ttc) > 0 THEN
    v_apply := LEAST(v_apply, v_inv.remaining_due);
  END IF;
  IF v_apply <= 0 THEN RETURN 0; END IF;

  v_new_balance := v_wallet.balance - v_apply;

  UPDATE public.driver_wallets
  SET balance = v_new_balance, updated_at = now()
  WHERE id = v_wallet.id;

  v_note := CASE
    WHEN p_source = 'cron'
      THEN 'Crédit portefeuille appliqué (cron facturation) à ' || COALESCE(v_inv.invoice_number, p_invoice_id::text)
    ELSE 'Crédit portefeuille appliqué automatiquement à ' || COALESCE(v_inv.invoice_number, p_invoice_id::text)
  END;

  INSERT INTO public.driver_wallet_transactions
    (driver_id, customer_id, wallet_id, rental_id, invoice_id, payment_id,
     type, direction, amount, balance_after, note, metadata)
  VALUES
    (p_driver_id, v_wallet.customer_id, v_wallet.id, v_inv.rental_id, p_invoice_id, p_payment_id,
     'rental_invoice_applied', 'debit', v_apply, v_new_balance, v_note,
     jsonb_build_object(
       'reason', 'auto_applied_to_invoice',
       'source', p_source,
       'invoice_number', v_inv.invoice_number,
       'previous_wallet_balance', v_wallet.balance,
       'new_wallet_balance', v_new_balance
     ));

  INSERT INTO public.payment_receipts
    (payment_id, customer_id, amount, method, note)
  VALUES
    (p_payment_id, COALESCE(v_inv.customer_id, v_wallet.customer_id), v_apply, 'other',
     'Crédit portefeuille DAM appliqué (' || p_source || ')');

  RETURN v_apply;
END;
$$;

-- 2. Idempotent wrapper used by daily cron + rental activation
CREATE OR REPLACE FUNCTION public.apply_wallet_to_invoice(
  p_driver_id  uuid,
  p_rental_id  uuid,
  p_invoice_id uuid,
  p_payment_id uuid,
  p_amount_due integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_existing integer;
BEGIN
  IF p_amount_due IS NULL OR p_amount_due <= 0 THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_existing
  FROM public.driver_wallet_transactions
  WHERE invoice_id = p_invoice_id
    AND payment_id = p_payment_id
    AND direction  = 'debit'
    AND type       = 'rental_invoice_applied';

  IF v_existing > 0 THEN RETURN v_existing; END IF;

  RETURN public._settle_wallet_to_payment(
    p_driver_id, p_invoice_id, p_payment_id, p_amount_due, 'cron'
  );
END;
$$;

-- 3. Manual/admin path now shares the helper
CREATE OR REPLACE FUNCTION public.apply_wallet_credit_to_open_invoices(p_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wallet         public.driver_wallets;
  v_inv            RECORD;
  v_payment_id     uuid;
  v_applied        integer;
  v_applied_total  integer := 0;
  v_applied_count  integer := 0;
  v_applications   jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.is_platform_owner() OR p_driver_id = public.current_driver_id()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_wallet FROM public.driver_wallets WHERE driver_id = p_driver_id;
  IF NOT FOUND OR v_wallet.balance <= 0 THEN
    RETURN jsonb_build_object('applied_count',0,'total_applied',0,
      'new_wallet_balance',COALESCE(v_wallet.balance,0),'applications','[]'::jsonb);
  END IF;

  FOR v_inv IN
    SELECT i.id, i.invoice_number, i.remaining_due
    FROM public.invoice i
    WHERE i.driver_id = p_driver_id
      AND i.status IN ('issued', 'partial')
      AND i.remaining_due > 0
    ORDER BY CASE WHEN i.status='partial' THEN 0 ELSE 1 END,
             COALESCE(i.issued_at, i.created_at) ASC
  LOOP
    SELECT payment_id INTO v_payment_id
    FROM public.invoice_payment_link WHERE invoice_id = v_inv.id LIMIT 1;
    IF v_payment_id IS NULL THEN CONTINUE; END IF;

    v_applied := public._settle_wallet_to_payment(
      p_driver_id, v_inv.id, v_payment_id, v_inv.remaining_due, 'manual');

    IF v_applied > 0 THEN
      v_applied_total := v_applied_total + v_applied;
      v_applied_count := v_applied_count + 1;
      v_applications  := v_applications || jsonb_build_object(
        'invoice_id', v_inv.id, 'invoice_number', v_inv.invoice_number, 'amount', v_applied);
    END IF;

    SELECT * INTO v_wallet FROM public.driver_wallets WHERE id = v_wallet.id;
    EXIT WHEN v_wallet.balance <= 0;
  END LOOP;

  RETURN jsonb_build_object(
    'applied_count', v_applied_count,
    'total_applied', v_applied_total,
    'new_wallet_balance', COALESCE(v_wallet.balance, 0),
    'applications', v_applications
  );
END;
$$;

-- 4. Reconciliation guard view
CREATE OR REPLACE VIEW public.v_wallet_settlement_anomalies AS
SELECT
  t.id AS wallet_txn_id, t.driver_id, t.customer_id, t.invoice_id, t.payment_id,
  t.amount AS debited_amount, t.created_at,
  i.invoice_number, i.status AS invoice_status,
  i.amount_paid AS invoice_amount_paid, i.total_ttc AS invoice_total,
  'CRITICAL'::text AS severity,
  'Crédit portefeuille débité mais non appliqué à la facture.'::text AS message,
  'Réparer le rapprochement.'::text AS recommended_action
FROM public.driver_wallet_transactions t
LEFT JOIN public.invoice i ON i.id = t.invoice_id
WHERE t.direction = 'debit'
  AND t.type = 'rental_invoice_applied'
  AND t.invoice_id IS NOT NULL
  AND t.payment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_receipts pr
    WHERE pr.payment_id = t.payment_id
      AND pr.amount = t.amount
      AND pr.created_at BETWEEN t.created_at - interval '5 seconds'
                            AND t.created_at + interval '5 seconds'
  );

ALTER VIEW public.v_wallet_settlement_anomalies SET (security_invoker = true);
GRANT SELECT ON public.v_wallet_settlement_anomalies TO authenticated;

-- 5. Self-test function — inline assertions (no nested PROCEDURE)
CREATE OR REPLACE FUNCTION public.test_wallet_settlement_paths()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_customer_id uuid;
  v_driver_id   uuid;
  v_wallet_id   uuid;
  v_invoice_id  uuid;
  v_payment_id  uuid;
  v_results     jsonb := '[]'::jsonb;
  v_balance     integer;
  v_paid        integer;
  v_status      text;
  v_remaining   integer;
  v_ok          boolean;
  v_label       text;
  v_detail      jsonb;
BEGIN
  IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'platform owner only'; END IF;

  SELECT id INTO v_customer_id FROM public.customers LIMIT 1;
  IF v_customer_id IS NULL THEN RAISE EXCEPTION 'no customer in DB'; END IF;

  INSERT INTO public.drivers (full_name, phone_number, customer_id, status)
  VALUES ('__TEST_WALLET_SETTLEMENT__',
          '+22500000' || lpad((floor(random()*100000))::text, 5, '0'),
          v_customer_id, 'inactive')
  RETURNING id INTO v_driver_id;

  INSERT INTO public.driver_wallets (driver_id, customer_id, balance)
  VALUES (v_driver_id, v_customer_id, 10000)
  RETURNING id INTO v_wallet_id;

  ----- PATH A: cron -----
  INSERT INTO public.payments (driver_id, customer_id, amount, payment_type, due_date, status)
  VALUES (v_driver_id, v_customer_id, 15000, 'rental', CURRENT_DATE, 'pending')
  RETURNING id INTO v_payment_id;

  INSERT INTO public.invoice
    (customer_id, driver_id, status, invoice_kind, subtotal_ht, vat_amount, total_ttc, vat_rate_snapshot, vat_enabled_snapshot)
  VALUES
    (v_customer_id, v_driver_id, 'issued', 'invoice', 15000, 0, 15000, 0, false)
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_payment_link (invoice_id, payment_id, customer_id)
  VALUES (v_invoice_id, v_payment_id, v_customer_id);

  PERFORM public.apply_wallet_to_invoice(v_driver_id, NULL, v_invoice_id, v_payment_id, 15000);

  SELECT balance INTO v_balance FROM public.driver_wallets WHERE id = v_wallet_id;
  SELECT amount_paid, status, remaining_due INTO v_paid, v_status, v_remaining
    FROM public.invoice WHERE id = v_invoice_id;

  v_results := v_results
    || jsonb_build_object('check','A.wallet_zero','pass', v_balance = 0, 'detail', jsonb_build_object('balance',v_balance))
    || jsonb_build_object('check','A.invoice_amount_paid','pass', v_paid = 10000, 'detail', jsonb_build_object('amount_paid',v_paid))
    || jsonb_build_object('check','A.invoice_remaining','pass', v_remaining = 5000, 'detail', jsonb_build_object('remaining_due',v_remaining))
    || jsonb_build_object('check','A.invoice_status','pass', v_status = 'partial', 'detail', jsonb_build_object('status',v_status))
    || jsonb_build_object('check','A.receipt_exists','pass',
        EXISTS(SELECT 1 FROM public.payment_receipts WHERE payment_id=v_payment_id AND amount=10000),
        'detail', jsonb_build_object('payment_id',v_payment_id));

  -- Idempotency
  PERFORM public.apply_wallet_to_invoice(v_driver_id, NULL, v_invoice_id, v_payment_id, 15000);
  SELECT balance INTO v_balance FROM public.driver_wallets WHERE id = v_wallet_id;
  v_results := v_results
    || jsonb_build_object('check','A.idempotent','pass', v_balance = 0, 'detail', jsonb_build_object('balance_after_second_call',v_balance));

  -- Cancellation reversal
  UPDATE public.invoice SET status='cancelled', cancelled_at=now(), cancel_reason='test'
  WHERE id = v_invoice_id;
  SELECT balance INTO v_balance FROM public.driver_wallets WHERE id = v_wallet_id;
  v_results := v_results
    || jsonb_build_object('check','A.cancel_refund','pass', v_balance = 10000, 'detail', jsonb_build_object('balance_after_cancel',v_balance));

  ----- PATH B: manual -----
  INSERT INTO public.payments (driver_id, customer_id, amount, payment_type, due_date, status)
  VALUES (v_driver_id, v_customer_id, 15000, 'rental', CURRENT_DATE, 'pending')
  RETURNING id INTO v_payment_id;

  INSERT INTO public.invoice
    (customer_id, driver_id, status, invoice_kind, subtotal_ht, vat_amount, total_ttc, vat_rate_snapshot, vat_enabled_snapshot)
  VALUES
    (v_customer_id, v_driver_id, 'issued', 'invoice', 15000, 0, 15000, 0, false)
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_payment_link (invoice_id, payment_id, customer_id)
  VALUES (v_invoice_id, v_payment_id, v_customer_id);

  PERFORM public.apply_wallet_credit_to_open_invoices(v_driver_id);

  SELECT balance INTO v_balance FROM public.driver_wallets WHERE id = v_wallet_id;
  SELECT amount_paid, status, remaining_due INTO v_paid, v_status, v_remaining
    FROM public.invoice WHERE id = v_invoice_id;

  v_results := v_results
    || jsonb_build_object('check','B.wallet_zero','pass', v_balance = 0, 'detail', jsonb_build_object('balance',v_balance))
    || jsonb_build_object('check','B.invoice_amount_paid','pass', v_paid = 10000, 'detail', jsonb_build_object('amount_paid',v_paid))
    || jsonb_build_object('check','B.invoice_remaining','pass', v_remaining = 5000, 'detail', jsonb_build_object('remaining_due',v_remaining))
    || jsonb_build_object('check','B.invoice_status','pass', v_status = 'partial', 'detail', jsonb_build_object('status',v_status))
    || jsonb_build_object('check','B.receipt_exists','pass',
        EXISTS(SELECT 1 FROM public.payment_receipts WHERE payment_id=v_payment_id AND amount=10000),
        'detail', jsonb_build_object('payment_id',v_payment_id));

  -- Cleanup
  DELETE FROM public.invoice WHERE driver_id = v_driver_id;
  DELETE FROM public.payments WHERE driver_id = v_driver_id;
  DELETE FROM public.driver_wallet_transactions WHERE driver_id = v_driver_id;
  DELETE FROM public.driver_wallets WHERE driver_id = v_driver_id;
  DELETE FROM public.drivers WHERE id = v_driver_id;

  RETURN jsonb_build_object('ok', NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_results) e WHERE (e->>'pass')::boolean = false
  ), 'results', v_results);

EXCEPTION WHEN OTHERS THEN
  BEGIN
    DELETE FROM public.invoice WHERE driver_id = v_driver_id;
    DELETE FROM public.payments WHERE driver_id = v_driver_id;
    DELETE FROM public.driver_wallet_transactions WHERE driver_id = v_driver_id;
    DELETE FROM public.driver_wallets WHERE driver_id = v_driver_id;
    DELETE FROM public.drivers WHERE id = v_driver_id;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'results', v_results);
END;
$$;

REVOKE ALL ON FUNCTION public.test_wallet_settlement_paths() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_wallet_settlement_paths() TO authenticated;
