
-- 1. accident_notifications
DROP POLICY IF EXISTS "admins view notifications" ON public.accident_notifications;
CREATE POLICY "admins view notifications" ON public.accident_notifications
FOR SELECT USING (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin','manager','support']) AND customer_id = current_customer_id())
);

-- 2. admin_audit_logs
DROP POLICY IF EXISTS "admins read audit logs" ON public.admin_audit_logs;
CREATE POLICY "admins read audit logs" ON public.admin_audit_logs
FOR SELECT USING (
  is_platform_owner()
  OR (is_admin() AND admin_user_id IN (
    SELECT id FROM public.admin_users WHERE customer_id = current_customer_id()
  ))
);

-- 3. ai_explanations (no customer_id; join via drivers)
DROP POLICY IF EXISTS "Admins can manage all explanations" ON public.ai_explanations;
CREATE POLICY "Admins can manage all explanations" ON public.ai_explanations
FOR ALL USING (
  is_platform_owner()
  OR (is_admin(auth.uid()) AND driver_id IN (
    SELECT id FROM public.drivers WHERE customer_id = current_customer_id()
  ))
) WITH CHECK (
  is_platform_owner()
  OR (is_admin(auth.uid()) AND driver_id IN (
    SELECT id FROM public.drivers WHERE customer_id = current_customer_id()
  ))
);

-- 4. ai_usage_logs INSERT
DROP POLICY IF EXISTS "Admins can insert usage logs" ON public.ai_usage_logs;
CREATE POLICY "Admins can insert usage logs" ON public.ai_usage_logs
FOR INSERT WITH CHECK (
  is_platform_owner()
  OR (is_admin() AND customer_id = current_customer_id())
);

-- 5. credit_score_breakdowns (no customer_id; join via credit_scores -> drivers)
DROP POLICY IF EXISTS "Admins can manage breakdowns" ON public.credit_score_breakdowns;
CREATE POLICY "Admins can manage breakdowns" ON public.credit_score_breakdowns
FOR ALL USING (
  is_platform_owner()
  OR (is_admin(auth.uid()) AND credit_score_id IN (
    SELECT cs.id FROM public.credit_scores cs
    WHERE cs.customer_id = current_customer_id()
  ))
) WITH CHECK (
  is_platform_owner()
  OR (is_admin(auth.uid()) AND credit_score_id IN (
    SELECT cs.id FROM public.credit_scores cs
    WHERE cs.customer_id = current_customer_id()
  ))
);

-- 6. credit_scores
DROP POLICY IF EXISTS "admin manages scores" ON public.credit_scores;
CREATE POLICY "admin manages scores" ON public.credit_scores
FOR ALL USING (
  is_platform_owner() OR (is_admin() AND customer_id = current_customer_id())
) WITH CHECK (
  is_platform_owner() OR (is_admin() AND customer_id = current_customer_id())
);

-- 7. driving_events
DROP POLICY IF EXISTS "admins manage driving events" ON public.driving_events;
CREATE POLICY "admins manage driving events" ON public.driving_events
FOR ALL USING (
  is_platform_owner() OR (is_admin() AND customer_id = current_customer_id())
) WITH CHECK (
  is_platform_owner() OR (is_admin() AND customer_id = current_customer_id())
);

-- 8. geofence_alerts (no customer_id; join via geofence_zones)
DROP POLICY IF EXISTS "Admins manage geofence alerts" ON public.geofence_alerts;
CREATE POLICY "Admins manage geofence alerts" ON public.geofence_alerts
FOR ALL USING (
  is_platform_owner()
  OR (is_admin() AND zone_id IN (
    SELECT id FROM public.geofence_zones WHERE customer_id = current_customer_id()
  ))
) WITH CHECK (
  is_platform_owner()
  OR (is_admin() AND zone_id IN (
    SELECT id FROM public.geofence_zones WHERE customer_id = current_customer_id()
  ))
);

-- 9. income_records
DROP POLICY IF EXISTS "Admins can manage income" ON public.income_records;
CREATE POLICY "Admins can manage income" ON public.income_records
FOR ALL USING (
  is_platform_owner() OR (is_admin(auth.uid()) AND customer_id = current_customer_id())
) WITH CHECK (
  is_platform_owner() OR (is_admin(auth.uid()) AND customer_id = current_customer_id())
);

-- 10. rental_adjustments (no customer_id; join via rentals)
DROP POLICY IF EXISTS "Managers view adjustments" ON public.rental_adjustments;
CREATE POLICY "Managers view adjustments" ON public.rental_adjustments
FOR SELECT USING (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin','manager']) AND rental_id IN (
    SELECT id FROM public.rentals WHERE customer_id = current_customer_id()
  ))
);

DROP POLICY IF EXISTS "Managers create adjustments" ON public.rental_adjustments;
CREATE POLICY "Managers create adjustments" ON public.rental_adjustments
FOR INSERT WITH CHECK (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin','manager']) AND rental_id IN (
    SELECT id FROM public.rentals WHERE customer_id = current_customer_id()
  ))
);

DROP POLICY IF EXISTS "Super admin manages adjustments" ON public.rental_adjustments;
CREATE POLICY "Super admin manages adjustments" ON public.rental_adjustments
FOR ALL USING (
  is_platform_owner()
  OR (has_admin_role('super_admin') AND rental_id IN (
    SELECT id FROM public.rentals WHERE customer_id = current_customer_id()
  ))
) WITH CHECK (
  is_platform_owner()
  OR (has_admin_role('super_admin') AND rental_id IN (
    SELECT id FROM public.rentals WHERE customer_id = current_customer_id()
  ))
);

-- 11. score_events (no customer_id; join via drivers)
DROP POLICY IF EXISTS "Admins manage score events" ON public.score_events;
CREATE POLICY "Admins manage score events" ON public.score_events
FOR ALL USING (
  is_platform_owner()
  OR (is_admin(auth.uid()) AND driver_id IN (
    SELECT id FROM public.drivers WHERE customer_id = current_customer_id()
  ))
) WITH CHECK (
  is_platform_owner()
  OR (is_admin(auth.uid()) AND driver_id IN (
    SELECT id FROM public.drivers WHERE customer_id = current_customer_id()
  ))
);

-- 12. telemetry_events
DROP POLICY IF EXISTS "Admins can manage telemetry" ON public.telemetry_events;
CREATE POLICY "Admins can manage telemetry" ON public.telemetry_events
FOR ALL USING (
  is_platform_owner() OR (is_admin(auth.uid()) AND customer_id = current_customer_id())
) WITH CHECK (
  is_platform_owner() OR (is_admin(auth.uid()) AND customer_id = current_customer_id())
);
