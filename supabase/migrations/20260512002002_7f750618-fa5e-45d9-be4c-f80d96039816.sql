ALTER TABLE public.driver_wallet_transactions DROP CONSTRAINT IF EXISTS driver_wallet_transactions_type_check;
ALTER TABLE public.driver_wallet_transactions ADD CONSTRAINT driver_wallet_transactions_type_check
  CHECK (type = ANY (ARRAY['upfront_deposit'::text, 'rental_invoice_applied'::text, 'manual_adjustment'::text, 'refund_or_credit'::text, 'credit'::text, 'debit'::text]));