-- Self-healing reconciliation RPC: if a linked payment is paid/overpaid but
-- the invoice is still 'issued', mark the invoice paid and audit it.
-- Safe to call from any admin context; RLS on invoice already restricts scope.
CREATE OR REPLACE FUNCTION public.reconcile_invoice_status(p_invoice_id uuid)
RETURNS TABLE(invoice_id uuid, new_status text, paid_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inv public.invoice;
  v_pay public.payments;
BEGIN
  SELECT * INTO v_inv FROM public.invoice WHERE id = p_invoice_id;
  IF NOT FOUND OR v_inv.status <> 'issued' THEN
    RETURN QUERY SELECT p_invoice_id, COALESCE(v_inv.status, 'unknown'::text), v_inv.paid_at;
    RETURN;
  END IF;

  SELECT p.* INTO v_pay
  FROM public.invoice_payment_link l
  JOIN public.payments p ON p.id = l.payment_id
  WHERE l.invoice_id = p_invoice_id
    AND p.status IN ('paid','overpaid')
  ORDER BY p.paid_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT p_invoice_id, v_inv.status, v_inv.paid_at;
    RETURN;
  END IF;

  UPDATE public.invoice
     SET status = 'paid',
         paid_at = COALESCE(v_pay.paid_at, v_pay.created_at, now())
   WHERE id = p_invoice_id
     AND status = 'issued';

  INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
  VALUES (p_invoice_id, v_inv.customer_id, 'paid', NULL, 'system',
          jsonb_build_object('payment_id', v_pay.id, 'source', 'reconcile_invoice_status', 'status', v_pay.status));

  RETURN QUERY
    SELECT i.id, i.status, i.paid_at FROM public.invoice i WHERE i.id = p_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_invoice_status(uuid) TO authenticated;

-- One-shot backfill of any currently stale invoices (idempotent).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT i.id AS invoice_id, i.customer_id, p.id AS payment_id, p.status AS pay_status,
           COALESCE(p.paid_at, p.created_at, now()) AS effective_paid_at
      FROM public.invoice i
      JOIN public.invoice_payment_link l ON l.invoice_id = i.id
      JOIN public.payments p ON p.id = l.payment_id
     WHERE i.status = 'issued'
       AND p.status IN ('paid','overpaid')
  LOOP
    UPDATE public.invoice
       SET status = 'paid',
           paid_at = r.effective_paid_at
     WHERE id = r.invoice_id AND status = 'issued';

    INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
    VALUES (r.invoice_id, r.customer_id, 'paid', NULL, 'system',
            jsonb_build_object('payment_id', r.payment_id, 'source', 'backfill_2026_05', 'status', r.pay_status));
  END LOOP;
END $$;