
ALTER TABLE public.invoice
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_invoice_tags ON public.invoice USING GIN (tags);
