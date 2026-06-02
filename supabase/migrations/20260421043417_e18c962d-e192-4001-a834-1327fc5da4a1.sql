-- Deduplicate: keep the row with the most recent update per driver
DELETE FROM public.driver_scores ds
USING public.driver_scores keep
WHERE ds.driver_id = keep.driver_id
  AND ds.customer_id IS NULL
  AND keep.customer_id IS NULL
  AND ds.id <> keep.id
  AND ds.updated_at <= keep.updated_at;

-- Add partial unique index for null-customer rows so ON CONFLICT works
CREATE UNIQUE INDEX IF NOT EXISTS driver_scores_driver_id_null_customer_uq
  ON public.driver_scores (driver_id)
  WHERE customer_id IS NULL;