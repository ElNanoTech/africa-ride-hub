-- ============================================================
-- Pre-demo security hardening
-- Strategy: filter by customer_id when set, allow when both NULL
--           (preserves current single-tenant flow with 0 customers)
-- ============================================================

-- 1) GPS LIVE POSITIONS — restrict drivers
DROP POLICY IF EXISTS "Drivers view vehicle positions" ON public.vehicle_positions;
CREATE POLICY "Drivers view vehicle positions"
  ON public.vehicle_positions FOR SELECT
  USING (
    is_admin()
    OR (
      is_driver() AND (
        customer_id IS NULL
        OR customer_id = (
          SELECT customer_id FROM public.drivers
          WHERE auth_user_id = auth.uid() OR user_id = auth.uid()
          LIMIT 1
        )
      )
    )
  );

-- 2) GPS HISTORY — restrict drivers
DROP POLICY IF EXISTS "Drivers view vehicle history" ON public.vehicle_location_history;
CREATE POLICY "Drivers view vehicle history"
  ON public.vehicle_location_history FOR SELECT
  USING (
    is_admin()
    OR (
      is_driver() AND (
        customer_id IS NULL
        OR customer_id = (
          SELECT customer_id FROM public.drivers
          WHERE auth_user_id = auth.uid() OR user_id = auth.uid()
          LIMIT 1
        )
      )
    )
  );

-- 3) GEOFENCE ZONES — restrict drivers
DROP POLICY IF EXISTS "Drivers can view geofence zones" ON public.geofence_zones;
CREATE POLICY "Drivers can view geofence zones"
  ON public.geofence_zones FOR SELECT
  USING (
    is_admin()
    OR (
      is_driver() AND (
        customer_id IS NULL
        OR customer_id = (
          SELECT customer_id FROM public.drivers
          WHERE auth_user_id = auth.uid() OR user_id = auth.uid()
          LIMIT 1
        )
      )
    )
  );

-- 4) ADMIN_USERS — scope SELECT to same-tenant or platform owner
DROP POLICY IF EXISTS "admins can read admin users" ON public.admin_users;
CREATE POLICY "admins can read admin users"
  ON public.admin_users FOR SELECT
  USING (
    is_platform_owner()
    OR (
      is_admin() AND (
        customer_id IS NULL
        OR customer_id = current_customer_id()
      )
    )
    OR user_id = auth.uid()
  );

-- 5) AI_EXPLANATIONS — drivers can only insert for themselves
DROP POLICY IF EXISTS "System can insert explanations" ON public.ai_explanations;
CREATE POLICY "Drivers can insert own explanations"
  ON public.ai_explanations FOR INSERT
  TO authenticated
  WITH CHECK (
    is_admin(auth.uid())
    OR driver_id = get_driver_id(auth.uid())
  );

-- 6) ACCIDENT_NOTIFICATIONS — drivers read their own
CREATE POLICY "Drivers view own accident notifications"
  ON public.accident_notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.accidents a
      WHERE a.id = accident_notifications.accident_id
        AND a.driver_id = get_driver_id(auth.uid())
    )
  );

-- 7) STORAGE: police-reports — admin DELETE/UPDATE
CREATE POLICY "Admins can update police reports"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'police-reports' AND is_admin())
  WITH CHECK (bucket_id = 'police-reports' AND is_admin());

CREATE POLICY "Admins can delete police reports"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'police-reports' AND is_admin());

-- 8) STORAGE: income-proofs — admin DELETE/UPDATE
CREATE POLICY "Admins can update income proofs"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'income-proofs' AND is_admin())
  WITH CHECK (bucket_id = 'income-proofs' AND is_admin());

CREATE POLICY "Admins can delete income proofs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'income-proofs' AND is_admin());