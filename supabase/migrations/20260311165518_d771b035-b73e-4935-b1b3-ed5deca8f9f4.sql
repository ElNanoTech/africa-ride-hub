
-- Create geofence_zones table for persistent zone configuration
CREATE TABLE public.geofence_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  zone_type text NOT NULL DEFAULT 'circle',
  center_lat double precision,
  center_lng double precision,
  radius_meters integer,
  color text NOT NULL DEFAULT '#3b82f6',
  is_active boolean NOT NULL DEFAULT true,
  customer_id uuid REFERENCES public.customers(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.geofence_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage geofence zones" ON public.geofence_zones
  FOR ALL TO public
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Drivers can view geofence zones" ON public.geofence_zones
  FOR SELECT TO public
  USING (is_driver() OR is_admin());

-- Create geofence_alerts table for persistent alert history
CREATE TABLE public.geofence_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES public.vehicles(id),
  driver_id uuid REFERENCES public.drivers(id),
  zone_id uuid REFERENCES public.geofence_zones(id),
  alert_type text NOT NULL DEFAULT 'exit',
  vehicle_name text,
  zone_name text,
  lat double precision,
  lng double precision,
  speed double precision DEFAULT 0,
  acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.geofence_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage geofence alerts" ON public.geofence_alerts
  FOR ALL TO public
  USING (is_admin())
  WITH CHECK (is_admin());

-- Add unique constraint on telemetry_events to prevent duplicates per driver/vehicle/date
CREATE UNIQUE INDEX IF NOT EXISTS telemetry_events_driver_vehicle_date_idx
  ON public.telemetry_events (driver_id, vehicle_id, event_date);
