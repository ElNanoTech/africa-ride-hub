-- Lock scoring_config to admins only
DROP POLICY IF EXISTS "authenticated_users_view_scoring_config" ON public.scoring_config;
CREATE POLICY "admins view scoring config"
  ON public.scoring_config FOR SELECT
  USING (is_admin());

-- Restrict driver SELECT on vehicles to non-sensitive columns via a view
DROP POLICY IF EXISTS "drivers view vehicles" ON public.vehicles;
CREATE POLICY "admins view vehicles"
  ON public.vehicles FOR SELECT
  USING (is_admin());

CREATE OR REPLACE VIEW public.vehicles_public
WITH (security_invoker = on) AS
SELECT id, model_name, license_plate, vehicle_type, rent_per_day,
       status, image_url, make, model_year, fleet_group,
       customer_id, created_at, updated_at
FROM public.vehicles;

GRANT SELECT ON public.vehicles_public TO authenticated, anon;

-- Allow drivers to read the safe view
CREATE POLICY "drivers view vehicles via safe view"
  ON public.vehicles FOR SELECT
  USING (
    is_driver() AND (
      customer_id IS NULL
      OR customer_id = (
        SELECT customer_id FROM public.drivers
        WHERE auth_user_id = auth.uid() OR user_id = auth.uid()
        LIMIT 1
      )
    )
  );