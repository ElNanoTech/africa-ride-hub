-- Layer 3D hotfix: qualify scheduled_obligations.obligation_id inside
-- the RETURNS TABLE function to avoid ambiguity with the output column.

CREATE OR REPLACE FUNCTION public.sync_repayment_obligation_statuses(
  p_schedule_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TABLE (obligation_id uuid, old_status text, new_status text, invoice_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule public.repayment_schedules%ROWTYPE;
  v_row record;
  v_mapped_status text;
BEGIN
  IF NOT public.has_repayment_permission('repayment.view') THEN
    RAISE EXCEPTION 'forbidden: repayment.view required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_schedule
  FROM public.repayment_schedules
  WHERE schedule_id = p_schedule_id
    AND (public.is_platform_owner() OR customer_id = public.current_customer_id());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'repayment schedule not found' USING ERRCODE = 'P0002';
  END IF;

  FOR v_row IN
    SELECT so.*, i.status AS invoice_status, i.remaining_due, i.amount_paid
    FROM public.scheduled_obligations so
    LEFT JOIN public.invoice i ON i.id = so.invoice_id
    WHERE so.schedule_id = v_schedule.schedule_id
    ORDER BY so.sequence_number
  LOOP
    v_mapped_status := CASE
      WHEN v_row.status IN ('CANCELLED','SUPERSEDED') THEN v_row.status
      WHEN v_row.invoice_id IS NULL AND v_row.due_date + v_schedule.grace_period_days < current_date THEN 'OVERDUE'
      WHEN v_row.invoice_status IN ('paid','overpaid') THEN 'PAID'
      WHEN v_row.invoice_status = 'partial' OR COALESCE(v_row.amount_paid, 0) > 0 THEN 'PARTIALLY_PAID'
      WHEN v_row.invoice_status IN ('issued','draft') THEN
        CASE WHEN v_row.due_date + v_schedule.grace_period_days < current_date THEN 'OVERDUE' ELSE 'INVOICED' END
      WHEN v_row.due_date + v_schedule.grace_period_days < current_date THEN 'OVERDUE'
      ELSE v_row.status
    END;

    IF v_mapped_status IS DISTINCT FROM v_row.status THEN
      UPDATE public.scheduled_obligations
      SET status = v_mapped_status
      WHERE public.scheduled_obligations.obligation_id = v_row.obligation_id;
      PERFORM public.repayment_audit(
        v_row.customer_id, v_row.credit_account_id, v_row.schedule_id, v_row.obligation_id,
        'OBLIGATION_STATUS_SYNCED',
        jsonb_build_object('status', v_row.status, 'invoice_status', v_row.invoice_status),
        jsonb_build_object('status', v_mapped_status, 'invoice_status', v_row.invoice_status),
        NULL,
        COALESCE(p_idempotency_key, 'sync') || ':' || v_row.obligation_id::text
      );
    END IF;

    obligation_id := v_row.obligation_id;
    old_status := v_row.status;
    new_status := v_mapped_status;
    invoice_id := v_row.invoice_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_repayment_obligation_statuses(uuid, text) TO authenticated;
