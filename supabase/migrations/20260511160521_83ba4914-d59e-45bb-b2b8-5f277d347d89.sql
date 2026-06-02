ALTER TABLE public.invoice_audit DROP CONSTRAINT audit_action_check;
ALTER TABLE public.invoice_audit ADD CONSTRAINT audit_action_check
  CHECK (action = ANY (ARRAY[
    'created','issued','paid','cancelled','viewed_public',
    'regenerated_link','statement_generated','auto_generated','fee_changed'
  ]));