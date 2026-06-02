ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_type_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_type_check
  CHECK (payment_type = ANY (ARRAY['rental'::text, 'loan_repayment'::text, 'wallet_topup'::text]));