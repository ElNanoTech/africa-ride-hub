-- Add fleet/GPS metadata columns to vehicles
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS uffizio_imei      text,
  ADD COLUMN IF NOT EXISTS sim_number        text,
  ADD COLUMN IF NOT EXISTS gps_installed_at  date,
  ADD COLUMN IF NOT EXISTS gps_active        boolean,
  ADD COLUMN IF NOT EXISTS fleet_group       text,
  ADD COLUMN IF NOT EXISTS make              text,
  ADD COLUMN IF NOT EXISTS model_year        integer,
  ADD COLUMN IF NOT EXISTS import_notes      text;

-- Constrain fleet_group to the three known categories
ALTER TABLE public.vehicles
  DROP CONSTRAINT IF EXISTS vehicles_fleet_group_check;
ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_fleet_group_check
  CHECK (fleet_group IS NULL OR fleet_group IN ('VTC','WARREN','CARGO'));

-- Plate normalization helper: trim, uppercase, collapse whitespace
CREATE OR REPLACE FUNCTION public.normalize_license_plate(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(upper(trim(p)), '\s+', '', 'g'), '');
$$;

-- Trigger: always store license_plate normalized
CREATE OR REPLACE FUNCTION public.normalize_vehicle_plate_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.license_plate IS NOT NULL THEN
    NEW.license_plate := public.normalize_license_plate(NEW.license_plate);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_vehicle_plate ON public.vehicles;
CREATE TRIGGER trg_normalize_vehicle_plate
  BEFORE INSERT OR UPDATE OF license_plate ON public.vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_vehicle_plate_trigger();

-- Backfill existing rows so trigger-normalized form is consistent
UPDATE public.vehicles
SET license_plate = public.normalize_license_plate(license_plate)
WHERE license_plate IS DISTINCT FROM public.normalize_license_plate(license_plate);

-- Helpful indexes for upcoming Uffizio sync queries
CREATE INDEX IF NOT EXISTS idx_vehicles_fleet_group ON public.vehicles(fleet_group);
CREATE INDEX IF NOT EXISTS idx_vehicles_gps_active  ON public.vehicles(gps_active);
CREATE INDEX IF NOT EXISTS idx_vehicles_uffizio_imei ON public.vehicles(uffizio_imei) WHERE uffizio_imei IS NOT NULL;