ALTER TABLE public.vehicles
  DROP CONSTRAINT IF EXISTS vehicles_fleet_group_check;

ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_fleet_group_check
  CHECK (fleet_group IS NULL OR fleet_group IN ('VTC','WARREN','CARGO','NLOOTTO'));