-- Block tenant admins from setting is_platform_owner
CREATE OR REPLACE FUNCTION public.prevent_platform_owner_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_platform_owner, false) = true AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'Only platform owners can set is_platform_owner';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.is_platform_owner, false) IS DISTINCT FROM COALESCE(OLD.is_platform_owner, false)
       AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'Only platform owners can change is_platform_owner';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_platform_owner_escalation ON public.admin_users;
CREATE TRIGGER trg_prevent_platform_owner_escalation
BEFORE INSERT OR UPDATE ON public.admin_users
FOR EACH ROW EXECUTE FUNCTION public.prevent_platform_owner_escalation();

-- Tenant scope on driver_score_events insert
DROP POLICY IF EXISTS "admins insert score events" ON public.driver_score_events;
CREATE POLICY "admins insert score events"
ON public.driver_score_events
FOR INSERT
TO authenticated
WITH CHECK (
  is_platform_owner()
  OR (
    has_admin_role_in(ARRAY['super_admin'::text, 'manager'::text])
    AND customer_id = current_customer_id()
  )
);

-- Remove unscoped admin branch from driver-facing SELECT policies
DROP POLICY IF EXISTS "Drivers view vehicle history" ON public.vehicle_location_history;
CREATE POLICY "Drivers view vehicle history"
ON public.vehicle_location_history
FOR SELECT
TO authenticated
USING (
  is_driver() AND (
    customer_id IS NULL
    OR customer_id = (
      SELECT drivers.customer_id FROM public.drivers
      WHERE drivers.auth_user_id = auth.uid() OR drivers.user_id = auth.uid()
      LIMIT 1
    )
  )
);

DROP POLICY IF EXISTS "Drivers view vehicle positions" ON public.vehicle_positions;
CREATE POLICY "Drivers view vehicle positions"
ON public.vehicle_positions
FOR SELECT
TO authenticated
USING (
  is_driver() AND (
    customer_id IS NULL
    OR customer_id = (
      SELECT drivers.customer_id FROM public.drivers
      WHERE drivers.auth_user_id = auth.uid() OR drivers.user_id = auth.uid()
      LIMIT 1
    )
  )
);