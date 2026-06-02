
-- Create current vehicle state table (one row per vehicle, upserted on each sync)
CREATE TABLE public.vehicle_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_no text NOT NULL,
  imei_no text NOT NULL DEFAULT '',
  lat double precision NOT NULL DEFAULT 0,
  lng double precision NOT NULL DEFAULT 0,
  speed double precision NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'offline',
  heading double precision,
  last_update text DEFAULT '',
  device_name text DEFAULT '',
  driver_name text DEFAULT '',
  ignition text DEFAULT '',
  company text DEFAULT '',
  fuel_level double precision,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  customer_id uuid REFERENCES public.customers(id),
  UNIQUE(imei_no)
);

-- Index for fast lookups
CREATE INDEX idx_vehicle_positions_status ON public.vehicle_positions(status);
CREATE INDEX idx_vehicle_positions_synced_at ON public.vehicle_positions(synced_at);

-- Enable RLS
ALTER TABLE public.vehicle_positions ENABLE ROW LEVEL SECURITY;

-- Admins can read/write
CREATE POLICY "Admins manage vehicle positions"
  ON public.vehicle_positions FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Drivers can view (for their own map views)
CREATE POLICY "Drivers view vehicle positions"
  ON public.vehicle_positions FOR SELECT
  USING (is_driver() OR is_admin());

-- Enable Realtime for instant push updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicle_positions;
