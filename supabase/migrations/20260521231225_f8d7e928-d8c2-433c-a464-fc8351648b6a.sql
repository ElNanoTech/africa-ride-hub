
-- ============================================================
-- Server-side automatic wallet credit application
-- Triggers + pg_cron safety net, all idempotent via advisory locks
-- ============================================================

-- Helper: safe wrapper that takes an advisory xact lock per driver,
-- calls the existing RPC inside a sub-block, and never raises so it
-- cannot block the originating INSERT/UPDATE.
CREATE OR REPLACE FUNCTION public.trigger_apply_wallet_credit(p_driver_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lock_key bigint;
BEGIN
  IF p_driver_id IS NULL THEN
    RETURN;
  END IF;

  v_lock_key := hashtextextended('wallet_apply:' || p_driver_id::text, 0);

  -- If another transaction is already applying for this driver,
  -- skip silently (idempotent: that one will absorb the work).
  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    RETURN;
  END IF;

  BEGIN
    PERFORM public.apply_wallet_credit_to_open_invoices(p_driver_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trigger_apply_wallet_credit failed for driver %: %', p_driver_id, SQLERRM;
  END;
END;
$$;


-- Trigger 1: wallet credited (top-up, refund, adjustment_credit, etc.)
CREATE OR REPLACE FUNCTION public.trg_wallet_txn_auto_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only react to credits (incoming money). Debits are produced by the
  -- RPC itself, so we must ignore them to avoid recursion.
  IF NEW.direction = 'credit' AND COALESCE(NEW.amount, 0) > 0 THEN
    PERFORM public.trigger_apply_wallet_credit(NEW.driver_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_txn_auto_apply ON public.driver_wallet_transactions;
CREATE TRIGGER trg_wallet_txn_auto_apply
AFTER INSERT ON public.driver_wallet_transactions
FOR EACH ROW
EXECUTE FUNCTION public.trg_wallet_txn_auto_apply();


-- Trigger 2: invoice becomes payable (issued or partial with balance due)
CREATE OR REPLACE FUNCTION public.trg_invoice_auto_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.driver_id IS NOT NULL
     AND NEW.status IN ('issued', 'partial')
     AND COALESCE(NEW.remaining_due, 0) > 0 THEN
    PERFORM public.trigger_apply_wallet_credit(NEW.driver_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_auto_apply ON public.invoice;
CREATE TRIGGER trg_invoice_auto_apply
AFTER INSERT OR UPDATE OF status, total_ttc, amount_paid ON public.invoice
FOR EACH ROW
EXECUTE FUNCTION public.trg_invoice_auto_apply();


-- Trigger 3: payment receipt confirmed (Wave webhook, manual entry, etc.)
-- Overpayment flows credit back into the wallet, so we re-run the apply
-- to immediately push that newly-available balance onto remaining invoices.
CREATE OR REPLACE FUNCTION public.trg_receipt_auto_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_driver_id uuid;
BEGIN
  SELECT driver_id INTO v_driver_id
  FROM public.payments
  WHERE id = NEW.payment_id;

  IF v_driver_id IS NOT NULL THEN
    PERFORM public.trigger_apply_wallet_credit(v_driver_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_receipt_auto_apply ON public.payment_receipts;
CREATE TRIGGER trg_receipt_auto_apply
AFTER INSERT ON public.payment_receipts
FOR EACH ROW
EXECUTE FUNCTION public.trg_receipt_auto_apply();


-- ============================================================
-- Cron safety net: sweep every 15 minutes for any driver that has
-- both wallet balance and unpaid invoices. Idempotent — the RPC
-- early-exits when nothing is owed.
-- ============================================================
CREATE OR REPLACE FUNCTION public.sweep_wallet_auto_apply()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_run_id     uuid;
  v_driver     uuid;
  v_processed  integer := 0;
  v_errors     integer := 0;
BEGIN
  INSERT INTO public.billing_cron_runs (job_name, status, details)
  VALUES ('wallet_auto_apply_sweep', 'running', '{}'::jsonb)
  RETURNING id INTO v_run_id;

  FOR v_driver IN
    SELECT DISTINCT dw.driver_id
    FROM public.driver_wallets dw
    WHERE dw.balance > 0
      AND EXISTS (
        SELECT 1 FROM public.invoice i
        WHERE i.driver_id = dw.driver_id
          AND i.status IN ('issued', 'partial')
          AND COALESCE(i.remaining_due, 0) > 0
      )
  LOOP
    BEGIN
      PERFORM public.apply_wallet_credit_to_open_invoices(v_driver);
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      RAISE WARNING 'sweep_wallet_auto_apply driver %: %', v_driver, SQLERRM;
    END;
  END LOOP;

  UPDATE public.billing_cron_runs
  SET status = 'completed',
      processed_count = v_processed,
      finished_at = now(),
      details = jsonb_build_object('errors', v_errors)
  WHERE id = v_run_id;

  RETURN jsonb_build_object('processed', v_processed, 'errors', v_errors);
END;
$$;

-- Schedule (or reschedule) the cron job
DO $$
BEGIN
  PERFORM cron.unschedule('wallet-auto-apply-sweep')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wallet-auto-apply-sweep');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'wallet-auto-apply-sweep',
  '*/15 * * * *',
  $$ SELECT public.sweep_wallet_auto_apply(); $$
);
