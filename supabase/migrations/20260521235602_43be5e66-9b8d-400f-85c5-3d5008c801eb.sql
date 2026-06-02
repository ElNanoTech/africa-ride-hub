ALTER TABLE public.invoice_audit DROP CONSTRAINT IF EXISTS audit_action_check;

ALTER TABLE public.invoice_audit
  ADD CONSTRAINT audit_action_check
  CHECK (action IN (
    'created','issued','paid','partial','overpaid','cancelled','refunded',
    'draft','wallet_auto_apply','status_changed','updated','reissued','note',
    'fee_changed','regenerated_link','auto_generated'
  ));