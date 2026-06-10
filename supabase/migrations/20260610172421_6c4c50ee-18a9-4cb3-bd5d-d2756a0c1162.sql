
CREATE POLICY "Admins can create accidents"
ON public.accidents
FOR INSERT
TO authenticated
WITH CHECK (
  is_platform_owner()
  OR (
    has_admin_role_in(ARRAY['super_admin','manager','support'])
    AND (customer_id = current_customer_id() OR current_customer_id() IS NULL)
  )
);
