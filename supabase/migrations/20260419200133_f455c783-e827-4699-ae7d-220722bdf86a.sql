-- New drivers should start at a neutral baseline (500), not a perfect 1000.
-- Real-world score builds up (or down) from behavior, payments, accidents, etc.
ALTER TABLE public.driver_scores
  ALTER COLUMN current_score SET DEFAULT 500;