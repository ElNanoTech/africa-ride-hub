-- Add income_source column to credit_scores table to track which data source was used
ALTER TABLE public.credit_scores 
ADD COLUMN IF NOT EXISTS income_source text DEFAULT 'unknown';

-- Add comment for documentation
COMMENT ON COLUMN public.credit_scores.income_source IS 'Source of income data: yango, manual, wave, estimated, mixed, unknown';