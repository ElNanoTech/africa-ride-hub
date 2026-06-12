
-- 1. Add unblocked notification to fleet_control_unblock
CREATE OR REPLACE FUNCTION public.fleet_control_unblock(p_control uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.vehicle_inspections;
  v_plate text;
BEGIN
  SELECT * INTO v_row FROM public.vehicle_inspections WHERE id=p_control;
  IF v_row IS NULL THEN RAISE EXCEPTION 'control_not_found'; END IF;
  PERFORM public.fc_require_admin(v_row.customer_id);

  UPDATE public.vehicle_inspections
     SET immobilization_state='unblocked', status='approved', updated_at=now()
   WHERE id=p_control;

  SELECT license_plate INTO v_plate FROM public.vehicles WHERE id = v_row.vehicle_id;

  IF v_row.driver_id IS NOT NULL THEN
    INSERT INTO public.notifications (driver_id, customer_id, notification_type, title, message)
    VALUES (
      v_row.driver_id,
      v_row.customer_id,
      'fleet_control_unblocked',
      'Véhicule débloqué',
      'Votre véhicule ' || COALESCE(v_plate, '') || ' a été débloqué. Vous pouvez reprendre la route.'
    );
  END IF;

  PERFORM public.fleet_control_log(p_control,'immobilization_unblocked','{}'::jsonb,'admin');
END;$function$;

-- 2. Fix cross-tenant bypass on admin policies (remove current_customer_id() IS NULL branch).
--    Platform owners already retain access via is_platform_owner().
DROP POLICY IF EXISTS "admins manage tenant orders" ON public.maintenance_orders;
CREATE POLICY "admins manage tenant orders" ON public.maintenance_orders
  USING (is_platform_owner() OR (is_admin() AND customer_id = current_customer_id()))
  WITH CHECK (is_platform_owner() OR (is_admin() AND customer_id = current_customer_id()));

DROP POLICY IF EXISTS "admins manage tenant other charges" ON public.other_charges;
CREATE POLICY "admins manage tenant other charges" ON public.other_charges
  USING (is_platform_owner() OR (is_admin() AND customer_id = current_customer_id()))
  WITH CHECK (is_platform_owner() OR (is_admin() AND customer_id = current_customer_id()));

DROP POLICY IF EXISTS "admins manage tenant providers" ON public.maintenance_providers;
CREATE POLICY "admins manage tenant providers" ON public.maintenance_providers
  USING (is_platform_owner() OR (is_admin() AND customer_id = current_customer_id()))
  WITH CHECK (is_platform_owner() OR (is_admin() AND customer_id = current_customer_id()));

DROP POLICY IF EXISTS "admins manage tenant violations" ON public.traffic_violations;
CREATE POLICY "admins manage tenant violations" ON public.traffic_violations
  USING (is_platform_owner() OR (is_admin() AND customer_id = current_customer_id()))
  WITH CHECK (is_platform_owner() OR (is_admin() AND customer_id = current_customer_id()));

DROP POLICY IF EXISTS "admins manage tenant files" ON public.accident_files;
CREATE POLICY "admins manage tenant files" ON public.accident_files
  USING (is_platform_owner() OR (has_admin_role_in(ARRAY['super_admin','manager']) AND EXISTS (
    SELECT 1 FROM public.accidents a WHERE a.id = accident_files.accident_id AND a.customer_id = current_customer_id()
  )))
  WITH CHECK (is_platform_owner() OR (has_admin_role_in(ARRAY['super_admin','manager']) AND EXISTS (
    SELECT 1 FROM public.accidents a WHERE a.id = accident_files.accident_id AND a.customer_id = current_customer_id()
  )));

DROP POLICY IF EXISTS "admins view tenant files" ON public.accident_files;
CREATE POLICY "admins view tenant files" ON public.accident_files FOR SELECT
  USING (is_platform_owner() OR (has_admin_role_in(ARRAY['super_admin','manager','support']) AND EXISTS (
    SELECT 1 FROM public.accidents a WHERE a.id = accident_files.accident_id AND a.customer_id = current_customer_id()
  )));

DROP POLICY IF EXISTS "admins view tenant history" ON public.accident_status_history;
CREATE POLICY "admins view tenant history" ON public.accident_status_history FOR SELECT
  USING (is_platform_owner() OR (has_admin_role_in(ARRAY['super_admin','manager','support']) AND EXISTS (
    SELECT 1 FROM public.accidents a WHERE a.id = accident_status_history.accident_id AND a.customer_id = current_customer_id()
  )));

DROP POLICY IF EXISTS "admins view tenant activity" ON public.accident_activity;
CREATE POLICY "admins view tenant activity" ON public.accident_activity FOR SELECT
  USING (is_platform_owner() OR (has_admin_role_in(ARRAY['super_admin','manager','support']) AND EXISTS (
    SELECT 1 FROM public.accidents a WHERE a.id = accident_activity.accident_id AND a.customer_id = current_customer_id()
  )));
