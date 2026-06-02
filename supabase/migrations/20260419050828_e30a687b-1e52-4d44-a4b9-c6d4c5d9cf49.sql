-- 1) Configurable score weights per Uffizio alert type
CREATE TABLE IF NOT EXISTS public.driving_event_weights (
  alert_type_id integer PRIMARY KEY,
  alert_name    text NOT NULL,
  score_delta   integer NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid
);

ALTER TABLE public.driving_event_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read driving weights"
  ON public.driving_event_weights FOR SELECT
  USING (is_admin());

CREATE POLICY "scoring admins manage driving weights"
  ON public.driving_event_weights FOR ALL
  USING (has_admin_role_in(ARRAY['super_admin','manager']))
  WITH CHECK (has_admin_role_in(ARRAY['super_admin','manager']));

INSERT INTO public.driving_event_weights (alert_type_id, alert_name, score_delta, active) VALUES
  (1,  'Over Speed',          -5,  true),
  (34, 'Harsh Acceleration',  -3,  true),
  (35, 'Harsh Braking',       -3,  true),
  (53, 'Zone Over Speeding',  -5,  true),
  (7,  'Night Driving',       -2,  false),
  (32, 'SOS',                  0,  true),
  (22, 'Idle',                 0,  false),
  (99, 'Device Low Battery',   0,  false)
ON CONFLICT (alert_type_id) DO NOTHING;

-- 2) Ingested driving events (one row per Uffizio alert)
CREATE TABLE IF NOT EXISTS public.driving_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id            uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  vehicle_id           uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  rental_id            uuid REFERENCES public.rentals(id) ON DELETE SET NULL,
  customer_id          uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  alert_type_id        integer,
  alert_name           text,
  alert_info           text,
  alert_location       text,
  duration_seconds     integer,
  occurred_at          timestamptz NOT NULL,
  score_delta_applied  integer NOT NULL DEFAULT 0,
  uffizio_event_hash   text UNIQUE,
  raw                  jsonb,
  synced_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driving_events_driver_time
  ON public.driving_events(driver_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_driving_events_rental
  ON public.driving_events(rental_id);
CREATE INDEX IF NOT EXISTS idx_driving_events_vehicle_time
  ON public.driving_events(vehicle_id, occurred_at DESC);

ALTER TABLE public.driving_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage driving events"
  ON public.driving_events FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "drivers view own driving events"
  ON public.driving_events FOR SELECT
  USING (driver_id = current_driver_id() OR is_admin());

-- 3) Link score_events back to the originating driving event
ALTER TABLE public.score_events
  ADD COLUMN IF NOT EXISTS driving_event_id uuid
    REFERENCES public.driving_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_score_events_driving_event
  ON public.score_events(driving_event_id)
  WHERE driving_event_id IS NOT NULL;