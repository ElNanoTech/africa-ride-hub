
-- B49: Prevent double-booking
CREATE UNIQUE INDEX IF NOT EXISTS idx_rentals_no_double_booking
ON public.rentals (vehicle_id)
WHERE status IN ('active', 'pending');

-- B50: Add is_test flag
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_drivers_is_test ON public.drivers (is_test) WHERE is_test = false;
CREATE INDEX IF NOT EXISTS idx_vehicles_is_test ON public.vehicles (is_test) WHERE is_test = false;

-- B10: Update vehicle_type constraint to include all existing + new types
DO $$
BEGIN
  ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_vehicle_type_check;
  ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS check_vehicle_type;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

ALTER TABLE public.vehicles ADD CONSTRAINT check_vehicle_type 
CHECK (vehicle_type IN ('car', 'bike', 'cargo_bike', 'truck', 'van', 'sedan', 'compact', 'cargo', 'suv', 'pickup'));
