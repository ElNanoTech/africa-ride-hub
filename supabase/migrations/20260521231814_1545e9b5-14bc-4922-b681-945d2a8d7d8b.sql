
-- 1. Allow the new audit action used by auto-apply
ALTER TABLE public.invoice_audit DROP CONSTRAINT IF EXISTS audit_action_check;
ALTER TABLE public.invoice_audit ADD CONSTRAINT audit_action_check
  CHECK (action = ANY (ARRAY[
    'created','issued','paid','cancelled','viewed_public',
    'regenerated_link','statement_generated','auto_generated',
    'fee_changed','wallet_auto_apply'
  ]));

-- 2. Harden the RPC: catch ANY audit error (not just undefined_table/column)
--    so a logging issue can never roll back the wallet debit + receipt.
CREATE OR REPLACE FUNCTION public.apply_wallet_credit_to_open_invoices(p_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet         public.driver_wallets;
  v_inv            RECORD;
  v_remaining      integer;
  v_apply          integer;
  v_payment_id     uuid;
  v_payment_remain integer;
  v_new_balance    integer;
  v_applied_total  integer := 0;
  v_applied_count  integer := 0;
  v_applications   jsonb := '[]'::jsonb;
  v_prev_balance   integer;
  v_prev_inv_due   integer;
BEGIN
  IF NOT (
    public.is_admin()
    OR public.is_platform_owner()
    OR p_driver_id = public.current_driver_id()
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_wallet
  FROM public.driver_wallets
  WHERE driver_id = p_driver_id
  FOR UPDATE;

  IF NOT FOUND OR v_wallet.balance <= 0 THEN
    RETURN jsonb_build_object(
      'applied_count', 0,
      'total_applied', 0,
      'new_wallet_balance', COALESCE(v_wallet.balance, 0),
      'applications', '[]'::jsonb
    );
  END IF;

  FOR v_inv IN
    SELECT i.id, i.invoice_number, i.total_ttc, i.amount_paid, i.remaining_due,
           i.status, i.issued_at, i.created_at, i.customer_id, i.rental_id
    FROM public.invoice i
    WHERE i.driver_id = p_driver_id
      AND i.status IN ('issued', 'partial')
      AND i.remaining_due > 0
    ORDER BY
      CASE WHEN i.status = 'partial' THEN 0 ELSE 1 END,
      COALESCE(i.issued_at, i.created_at) ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_wallet.balance <= 0;

    SELECT payment_id INTO v_payment_id
    FROM public.invoice_payment_link
    WHERE invoice_id = v_inv.id
    LIMIT 1;

    IF v_payment_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT GREATEST(amount - amount_paid, 0) INTO v_payment_remain
    FROM public.payments
    WHERE id = v_payment_id
    FOR UPDATE;

    v_remaining := LEAST(v_inv.remaining_due, COALESCE(v_payment_remain, v_inv.remaining_due));
    IF v_remaining <= 0 THEN
      CONTINUE;
    END IF;

    v_apply := LEAST(v_wallet.balance, v_remaining);
    IF v_apply <= 0 THEN
      CONTINUE;
    END IF;

    v_prev_balance := v_wallet.balance;
    v_prev_inv_due := v_inv.remaining_due;
    v_new_balance  := v_wallet.balance - v_apply;

    -- 1) Debit wallet
    UPDATE public.driver_wallets
    SET balance = v_new_balance, updated_at = now()
    WHERE id = v_wallet.id;

    -- 2) Ledger entry
    INSERT INTO public.driver_wallet_transactions
      (driver_id, customer_id, wallet_id, rental_id, invoice_id, payment_id,
       type, direction, amount, balance_after, note, metadata)
    VALUES
      (p_driver_id, v_wallet.customer_id, v_wallet.id, v_inv.rental_id, v_inv.id, v_payment_id,
       'rental_invoice_applied', 'debit', v_apply, v_new_balance,
       'Crédit portefeuille appliqué automatiquement à ' || COALESCE(v_inv.invoice_number, v_inv.id::text),
       jsonb_build_object(
         'reason', 'auto_applied_to_invoice',
         'invoice_number', v_inv.invoice_number,
         'previous_wallet_balance', v_prev_balance,
         'previous_invoice_remaining_due', v_prev_inv_due,
         'new_wallet_balance', v_new_balance,
         'new_invoice_remaining_due', v_prev_inv_due - v_apply
       ));

    -- 3) Payment receipt (triggers recompute_payment_from_receipts which
    --    updates payment.amount_paid/status and via downstream triggers
    --    invoice.amount_paid -> invoice.remaining_due/status)
    INSERT INTO public.payment_receipts
      (payment_id, customer_id, amount, method, note)
    VALUES
      (v_payment_id, v_inv.customer_id, v_apply, 'other',
       'Crédit portefeuille DAM appliqué automatiquement');

    -- 4) Audit (best-effort, never blocks the apply)
    BEGIN
      INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
      VALUES (v_inv.id, v_inv.customer_id, 'wallet_auto_apply', NULL, 'system',
        jsonb_build_object(
          'wallet_id', v_wallet.id,
          'amount_applied', v_apply,
          'old_wallet_balance', v_prev_balance,
          'new_wallet_balance', v_new_balance,
          'old_invoice_remaining_due', v_prev_inv_due,
          'new_invoice_remaining_due', v_prev_inv_due - v_apply,
          'note', 'Crédit portefeuille appliqué automatiquement'
        ));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'invoice_audit insert failed for invoice %: %', v_inv.id, SQLERRM;
    END;

    v_applied_total := v_applied_total + v_apply;
    v_applied_count := v_applied_count + 1;
    v_applications  := v_applications || jsonb_build_object(
      'invoice_id', v_inv.id,
      'invoice_number', v_inv.invoice_number,
      'amount_applied', v_apply,
      'fully_paid', (v_prev_inv_due - v_apply) <= 0
    );

    v_wallet.balance := v_new_balance;
  END LOOP;

  RETURN jsonb_build_object(
    'applied_count', v_applied_count,
    'total_applied', v_applied_total,
    'new_wallet_balance', v_wallet.balance,
    'applications', v_applications
  );
END;
$function$;
