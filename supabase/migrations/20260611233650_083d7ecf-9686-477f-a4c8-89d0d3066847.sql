DROP POLICY IF EXISTS "Admins can manage subscriptions" ON public.push_subscriptions;

CREATE POLICY "Tenant admins manage own-tenant subscriptions"
ON public.push_subscriptions
FOR ALL
TO authenticated
USING (
  public.is_admin()
  AND (
    public.has_admin_role('super_admin')
    OR EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = push_subscriptions.driver_id
        AND d.customer_id = public.current_customer_id()
    )
  )
)
WITH CHECK (
  public.is_admin()
  AND (
    public.has_admin_role('super_admin')
    OR EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = push_subscriptions.driver_id
        AND d.customer_id = public.current_customer_id()
    )
  )
);