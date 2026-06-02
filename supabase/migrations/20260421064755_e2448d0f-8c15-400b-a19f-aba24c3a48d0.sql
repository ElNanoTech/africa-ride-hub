-- Allow severity to be 'UNKNOWN' so new driver-submitted cases are not
-- pre-classified as 'MINOR'. The admin sets the real severity during review.
ALTER TABLE public.accidents
  ALTER COLUMN severity SET DEFAULT 'UNKNOWN';

-- Drop any existing CHECK constraint on severity (name is unknown across envs;
-- attempt the conventional one then re-create with the broader value set).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'accidents_severity_check'
  ) THEN
    ALTER TABLE public.accidents DROP CONSTRAINT accidents_severity_check;
  END IF;
END $$;

ALTER TABLE public.accidents
  ADD CONSTRAINT accidents_severity_check
  CHECK (severity IN ('UNKNOWN', 'MINOR', 'MODERATE', 'SEVERE'));