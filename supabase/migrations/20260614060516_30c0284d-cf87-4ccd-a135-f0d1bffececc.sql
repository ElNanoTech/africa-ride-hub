CREATE TABLE IF NOT EXISTS public.driver_vehicle_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('tire','brakes','engine','accident','cleaning','body','other')),
  urgency text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low','normal','high','urgent')),
  description text NOT NULL,
  photo_paths text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'reported' CHECK (status IN ('reported','analysis','approved','repairing','completed','cancelled')),
  support_ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_vehicle_reports_driver ON public.driver_vehicle_reports(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_vehicle_reports_vehicle ON public.driver_vehicle_reports(vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_vehicle_reports_customer ON public.driver_vehicle_reports(customer_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_vehicle_reports TO authenticated;
GRANT ALL ON public.driver_vehicle_reports TO service_role;

ALTER TABLE public.driver_vehicle_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers view own vehicle reports" ON public.driver_vehicle_reports;
CREATE POLICY "Drivers view own vehicle reports"
ON public.driver_vehicle_reports FOR SELECT TO authenticated
USING (driver_id = public.current_driver_id());

DROP POLICY IF EXISTS "Drivers create own vehicle reports" ON public.driver_vehicle_reports;
CREATE POLICY "Drivers create own vehicle reports"
ON public.driver_vehicle_reports FOR INSERT TO authenticated
WITH CHECK (driver_id = public.current_driver_id());

DROP POLICY IF EXISTS "Admins manage tenant vehicle reports" ON public.driver_vehicle_reports;
CREATE POLICY "Admins manage tenant vehicle reports"
ON public.driver_vehicle_reports FOR ALL TO authenticated
USING (public.is_platform_owner() OR (public.is_admin() AND customer_id = public.current_customer_id()))
WITH CHECK (public.is_platform_owner() OR (public.is_admin() AND customer_id = public.current_customer_id()));

DROP TRIGGER IF EXISTS trg_driver_vehicle_reports_updated_at ON public.driver_vehicle_reports;
CREATE TRIGGER trg_driver_vehicle_reports_updated_at
BEFORE UPDATE ON public.driver_vehicle_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_vehicle_reports;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DROP POLICY IF EXISTS "Drivers upload own maintenance report photos" ON storage.objects;
CREATE POLICY "Drivers upload own maintenance report photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'maintenance-report-photos'
  AND (storage.foldername(name))[1] = public.current_driver_id()::text
);

DROP POLICY IF EXISTS "Drivers read own maintenance report photos" ON storage.objects;
CREATE POLICY "Drivers read own maintenance report photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'maintenance-report-photos'
  AND (storage.foldername(name))[1] = public.current_driver_id()::text
);

DROP POLICY IF EXISTS "Admins read tenant maintenance report photos" ON storage.objects;
CREATE POLICY "Admins read tenant maintenance report photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'maintenance-report-photos'
  AND (
    public.is_platform_owner()
    OR EXISTS (
      SELECT 1
      FROM public.driver_vehicle_reports r
      WHERE r.customer_id = public.current_customer_id()
        AND (storage.foldername(storage.objects.name))[1] = r.driver_id::text
    )
  )
);

CREATE OR REPLACE FUNCTION public.driver_acknowledge_alert(
  p_alert uuid,
  p_status text DEFAULT 'acknowledged'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_driver uuid := public.current_driver_id();
BEGIN
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'driver_not_found';
  END IF;
  IF p_status NOT IN ('acknowledged','dismissed') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  UPDATE public.alerts
     SET status = p_status,
         acknowledged_at = COALESCE(acknowledged_at, now()),
         updated_at = now()
   WHERE id = p_alert
     AND driver_id = v_driver
     AND status IN ('open','acknowledged','dismissed');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'alert_not_found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.driver_acknowledge_alert(uuid, text) TO authenticated;