ALTER TABLE public.invoice
  ADD CONSTRAINT invoice_rental_id_fkey
  FOREIGN KEY (rental_id) REFERENCES public.rentals(id) ON DELETE SET NULL;