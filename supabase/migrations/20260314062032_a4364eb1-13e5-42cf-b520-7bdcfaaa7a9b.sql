
-- Create append-only vehicle location history table for trip replay
CREATE TABLE public.vehicle_location_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_no text NOT NULL,
  imei_no text NOT NULL DEFAULT '',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  speed double precision NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'offline',
  heading double precision,
  ignition text DEFAULT '',
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  customer_id uuid REFERENCES public.customers(id)
);

-- Indexes for efficient history queries
CREATE INDEX idx_vlh_imei_recorded ON public.vehicle_location_history(imei_no, recorded_at DESC);
CREATE INDEX idx_vlh_vehicle_recorded ON public.vehicle_location_history(vehicle_no, recorded_at DESC);
CREATE INDEX idx_vlh_recorded_at ON public.vehicle_location_history(recorded_at DESC);

-- Enable RLS
ALTER TABLE public.vehicle_location_history ENABLE ROW LEVEL SECURITY;

-- Admins can read/write
CREATE POLICY "Admins manage vehicle history"
  ON public.vehicle_location_history FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Drivers can view (for trip replay)
CREATE POLICY "Drivers view vehicle history"
  ON public.vehicle_location_history FOR SELECT
  USING (is_driver() OR is_admin());

-- Auto-cleanup: create function to purge old history (keep 30 days)
CREATE OR REPLACE FUNCTION public.cleanup_vehicle_history()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.vehicle_location_history
  WHERE recorded_at < now() - interval '30 days';
$$;
