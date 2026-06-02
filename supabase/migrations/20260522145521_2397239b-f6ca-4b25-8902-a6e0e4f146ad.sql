
-- ============================================================
-- Invoice cancellation → automatic wallet credit reversal
-- ============================================================

-- 1) Allow the new ledger type
ALTER TABLE public.driver_wallet_transactions
  DROP CONSTRAINT IF EXISTS driver_wallet_transactions_type_check;

ALTER TABLE public.driver_wallet_transactions
  ADD CONSTRAINT driver_wallet_transactions_type_check
  CHECK (type = ANY (ARRAY[
    'upfront_deposit',
    'rental_invoice_applied',
    'manual_adjustment',
    'refund_or_credit',
    'credit',
    'debit',
    'invoice_cancellation_refund'
  ]));

-- 2) Idempotency: one refund row per invoice per source
--    (sources: 'wallet_reversal', 'wave_refund', etc.)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_cancellation_refund_per_source
  ON public.driver_wallet_transactions (invoice_id, (metadata->>'reversal_source'))
  WHERE type = 'invoice_cancellation_refund' AND invoice_id IS NOT NULL;


-- 3) Reversal function
CREATE OR REPLACE FUNCTION public.reverse_cancelled_invoice_payments(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inv             RECORD;
  v_wallet          public.driver_wallets;
  v_wallet_portion  integer := 0;
  v_wave_portion    integer := 0;
  v_other_portion   integer := 0;
  v_total_paid      integer := 0;
  v_prev_balance    integer;
  v_new_balance     integer;
  v_actor           uuid;
  v_already         integer;
  v_credits         jsonb := '[]'::jsonb;
BEGIN
  SELECT id, customer_id, driver_id, invoice_number, status,
         amount_paid, total_ttc, cancelled_by, rental_id
    INTO v_inv
  FROM public.invoice
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND OR v_inv.status <> 'cancelled' THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_cancelled');
  END IF;

  -- Effective paid amount (cap at total_ttc; overpayment already lives in wallet)
  v_total_paid := LEAST(COALESCE(v_inv.amount_paid, 0), COALESCE(v_inv.total_ttc, 0));

  IF v_total_paid <= 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'nothing_paid');
  END IF;

  -- Idempotency check
  SELECT COUNT(*) INTO v_already
  FROM public.driver_wallet_transactions
  WHERE invoice_id = p_invoice_id
    AND type = 'invoice_cancellation_refund';

  IF v_already > 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_reversed',
                              'existing_rows', v_already);
  END IF;

  -- Determine source split
  -- Wallet portion = sum of prior 'rental_invoice_applied' debits on this invoice
  SELECT COALESCE(SUM(amount), 0) INTO v_wallet_portion
  FROM public.driver_wallet_transactions
  WHERE invoice_id = p_invoice_id
    AND type = 'rental_invoice_applied'
    AND direction = 'debit';

  v_wallet_portion := LEAST(v_wallet_portion, v_total_paid);
  v_wave_portion   := GREATEST(v_total_paid - v_wallet_portion, 0);

  -- Lock & load wallet (create if missing — defensive)
  SELECT * INTO v_wallet
  FROM public.driver_wallets
  WHERE driver_id = v_inv.driver_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.driver_wallets (driver_id, customer_id, balance)
    VALUES (v_inv.driver_id, v_inv.customer_id, 0)
    RETURNING * INTO v_wallet;
  END IF;

  v_prev_balance := v_wallet.balance;
  v_actor := v_inv.cancelled_by;

  -- Wallet reversal row
  IF v_wallet_portion > 0 THEN
    v_new_balance := v_wallet.balance + v_wallet_portion;
    UPDATE public.driver_wallets
      SET balance = v_new_balance, updated_at = now()
      WHERE id = v_wallet.id;

    INSERT INTO public.driver_wallet_transactions
      (driver_id, customer_id, wallet_id, rental_id, invoice_id,
       type, direction, amount, balance_after, created_by, note, metadata)
    VALUES
      (v_inv.driver_id, v_inv.customer_id, v_wallet.id, v_inv.rental_id, v_inv.id,
       'invoice_cancellation_refund', 'credit', v_wallet_portion, v_new_balance, v_actor,
       'Annulation facture ' || COALESCE(v_inv.invoice_number, v_inv.id::text)
         || ' — restitution crédit portefeuille',
       jsonb_build_object(
         'reversal_source', 'wallet_reversal',
         'reversal_reason', 'invoice_cancelled',
         'cancelled_invoice_id', v_inv.id,
         'cancelled_invoice_number', v_inv.invoice_number,
         'original_payment_source', 'wallet_auto_apply',
         'previous_wallet_balance', v_prev_balance,
         'new_wallet_balance', v_new_balance,
         'admin_actor', v_actor
       ));

    v_wallet.balance := v_new_balance;
    v_credits := v_credits || jsonb_build_object('source', 'wallet_reversal', 'amount', v_wallet_portion);
  END IF;

  -- Wave / external refund row
  IF v_wave_portion > 0 THEN
    v_prev_balance := v_wallet.balance;
    v_new_balance  := v_wallet.balance + v_wave_portion;
    UPDATE public.driver_wallets
      SET balance = v_new_balance, updated_at = now()
      WHERE id = v_wallet.id;

    INSERT INTO public.driver_wallet_transactions
      (driver_id, customer_id, wallet_id, rental_id, invoice_id,
       type, direction, amount, balance_after, created_by, note, metadata)
    VALUES
      (v_inv.driver_id, v_inv.customer_id, v_wallet.id, v_inv.rental_id, v_inv.id,
       'invoice_cancellation_refund', 'credit', v_wave_portion, v_new_balance, v_actor,
       'Annulation facture ' || COALESCE(v_inv.invoice_number, v_inv.id::text)
         || ' — remboursement paiement',
       jsonb_build_object(
         'reversal_source', 'wave_refund',
         'reversal_reason', 'invoice_cancelled',
         'cancelled_invoice_id', v_inv.id,
         'cancelled_invoice_number', v_inv.invoice_number,
         'original_payment_source', 'wave_or_external',
         'previous_wallet_balance', v_prev_balance,
         'new_wallet_balance', v_new_balance,
         'admin_actor', v_actor
       ));

    v_wallet.balance := v_new_balance;
    v_credits := v_credits || jsonb_build_object('source', 'wave_refund', 'amount', v_wave_portion);
  END IF;

  -- Invoice audit
  BEGIN
    INSERT INTO public.invoice_audit
      (invoice_id, customer_id, action, actor_id, actor_type, metadata)
    VALUES
      (v_inv.id, v_inv.customer_id, 'refunded', v_actor,
       CASE WHEN v_actor IS NULL THEN 'system' ELSE 'admin' END,
       jsonb_build_object(
         'note', 'Crédit restauré suite à annulation de facture',
         'invoice_id', v_inv.id,
         'invoice_number', v_inv.invoice_number,
         'amount_restored', v_wallet_portion + v_wave_portion,
         'sources_restored', v_credits,
         'wallet_before', COALESCE((v_credits->0->>'amount')::int, 0) * 0 + 
                          (v_wallet.balance - v_wallet_portion - v_wave_portion),
         'wallet_after', v_wallet.balance
       ));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'invoice_audit refunded insert failed for %: %', v_inv.id, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'invoice_id', v_inv.id,
    'amount_restored', v_wallet_portion + v_wave_portion,
    'wallet_portion', v_wallet_portion,
    'wave_portion', v_wave_portion,
    'new_wallet_balance', v_wallet.balance,
    'credits', v_credits
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_cancelled_invoice_payments(uuid) TO authenticated, service_role;


-- 4) Trigger: when invoice flips to cancelled, fire the reversal
CREATE OR REPLACE FUNCTION public.trg_invoice_cancellation_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'cancelled'
     AND (OLD.status IS DISTINCT FROM 'cancelled')
     AND COALESCE(NEW.amount_paid, 0) > 0 THEN
    BEGIN
      PERFORM public.reverse_cancelled_invoice_payments(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'reverse_cancelled_invoice_payments failed for %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_cancellation_refund ON public.invoice;
CREATE TRIGGER trg_invoice_cancellation_refund
AFTER UPDATE OF status ON public.invoice
FOR EACH ROW
EXECUTE FUNCTION public.trg_invoice_cancellation_refund();
