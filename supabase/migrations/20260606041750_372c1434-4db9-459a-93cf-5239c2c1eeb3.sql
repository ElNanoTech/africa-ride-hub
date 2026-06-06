CREATE POLICY "Drivers view own alerts"
ON public.alerts
FOR SELECT
TO authenticated
USING (driver_id = public.current_driver_id());