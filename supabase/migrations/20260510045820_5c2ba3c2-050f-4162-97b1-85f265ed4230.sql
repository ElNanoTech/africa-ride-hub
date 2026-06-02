-- Enforce subtotal_ht + vat_amount = total_ttc at DB level.
-- (uniq_invoice_per_rental partial unique index already enforces no duplicate
--  invoice per rental for invoice_kind='invoice'.)
ALTER TABLE public.invoice
  ADD CONSTRAINT invoice_totals_match
  CHECK (round(coalesce(subtotal_ht, 0) + coalesce(vat_amount, 0)) = round(coalesce(total_ttc, 0)));