-- Tighten push_subscriptions admin policy: only Platform Owners get the
-- cross-tenant shortcut. Customer-scoped super_admins must match customer_id.
DROP POLICY IF EXISTS "Tenant admins manage own-tenant subscriptions" ON public.push_subscriptions;

CREATE POLICY "Tenant admins manage own-tenant subscriptions"
ON public.push_subscriptions
FOR ALL
TO authenticated
USING (
  public.is_platform_owner()
  OR (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = push_subscriptions.driver_id
        AND d.customer_id = public.current_customer_id()
    )
  )
)
WITH CHECK (
  public.is_platform_owner()
  OR (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = push_subscriptions.driver_id
        AND d.customer_id = public.current_customer_id()
    )
  )
);