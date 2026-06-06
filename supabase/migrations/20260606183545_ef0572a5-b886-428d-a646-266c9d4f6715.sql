ALTER TABLE public.accidents ADD COLUMN IF NOT EXISTS incident_type text;
ALTER TABLE public.accidents DROP CONSTRAINT IF EXISTS accidents_incident_type_check;
ALTER TABLE public.accidents ADD CONSTRAINT accidents_incident_type_check CHECK (incident_type IS NULL OR incident_type = ANY (ARRAY['COLLISION','SCRAPE','ROLLOVER','THEFT','VANDALISM','BREAKDOWN','FIRE','OTHER']));