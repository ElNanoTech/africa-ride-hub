DROP INDEX IF EXISTS public.uniq_invoice_per_rental;

CREATE UNIQUE INDEX uniq_invoice_per_rental
  ON public.invoice (rental_id)
  WHERE invoice_kind = 'invoice'
    AND rental_id IS NOT NULL
    AND status <> 'cancelled';