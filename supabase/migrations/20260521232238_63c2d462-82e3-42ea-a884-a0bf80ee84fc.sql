
ALTER TABLE public.driver_wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_txn_amount_positive_chk;

ALTER TABLE public.driver_wallet_transactions
  ADD CONSTRAINT wallet_txn_amount_positive_chk
  CHECK (amount > 0);
