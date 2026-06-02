
-- Allow admins to delete tenant receipts (RLS)
CREATE POLICY "admins_delete_tenant_receipts"
  ON public.payment_receipts
  FOR DELETE
  USING (
    has_admin_role_in(ARRAY['super_admin','manager'])
    AND ((customer_id IS NULL) OR (customer_id = current_customer_id()))
  );

-- RPC: void a payment receipt and recompute the parent payment + wallet
CREATE OR REPLACE FUNCTION public.void_payment_receipt(
  p_receipt_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_receipt public.payment_receipts%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_total_before integer;
  v_total_after integer;
  v_overage_before integer;
  v_overage_after integer;
  v_reverse integer;
  v_balance integer;
  v_new_status text;
  v_actor uuid := auth.uid();
BEGIN
  IF NOT (is_platform_owner() OR has_admin_role_in(ARRAY['super_admin','manager'])) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_receipt FROM public.payment_receipts WHERE id = p_receipt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt not found';
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = v_receipt.payment_id FOR UPDATE;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_before
    FROM public.payment_receipts WHERE payment_id = v_payment.id;
  v_total_after := v_total_before - v_receipt.amount;
  v_overage_before := GREATEST(0, v_total_before - v_payment.amount);
  v_overage_after := GREATEST(0, v_total_after - v_payment.amount);
  v_reverse := v_overage_before - v_overage_after;

  -- Delete the receipt (cascade-safe since it's a row delete)
  DELETE FROM public.payment_receipts WHERE id = p_receipt_id;

  -- Recompute payment status from remaining receipts
  IF v_total_after <= 0 THEN
    v_new_status := 'pending';
  ELSIF v_total_after < v_payment.amount THEN
    v_new_status := 'partial';
  ELSIF v_total_after = v_payment.amount THEN
    v_new_status := 'paid';
  ELSE
    v_new_status := 'overpaid';
  END IF;

  UPDATE public.payments
  SET amount_paid = v_total_after,
      status = v_new_status,
      paid_at  = CASE WHEN v_new_status NOT IN ('paid','overpaid') THEN NULL ELSE paid_at END,
      paid_date = CASE WHEN v_new_status NOT IN ('paid','overpaid') THEN NULL ELSE paid_date END
  WHERE id = v_payment.id;

  -- Reverse any over-payment that was credited to the driver wallet by this receipt
  IF v_reverse > 0 AND v_payment.driver_id IS NOT NULL THEN
    UPDATE public.driver_wallets
      SET balance = balance - v_reverse,
          updated_at = now()
      WHERE driver_id = v_payment.driver_id
      RETURNING balance INTO v_balance;

    INSERT INTO public.driver_wallet_transactions
      (driver_id, customer_id, payment_id, type, amount, balance_after, method, reference, note, created_by)
    VALUES (
      v_payment.driver_id, v_payment.customer_id, v_payment.id,
      'debit', v_reverse, COALESCE(v_balance, 0),
      v_receipt.method, v_receipt.wave_transaction_id,
      'Annulation reçu paiement ' || v_payment.id::text || COALESCE(' — ' || p_reason, ''),
      v_actor
    );
  END IF;

  -- Audit
  INSERT INTO public.admin_audit_logs (admin_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    COALESCE(v_actor, '00000000-0000-0000-0000-000000000000'::uuid),
    'payment_receipt_voided',
    'payment_receipt',
    p_receipt_id,
    jsonb_build_object(
      'payment_id', v_payment.id,
      'amount', v_receipt.amount,
      'reason', p_reason,
      'wallet_reversed', v_reverse
    )
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'new_status', v_new_status,
    'amount_paid', v_total_after,
    'wallet_reversed', v_reverse
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.void_payment_receipt(uuid, text) TO authenticated;
