
-- admin_users: split global vs tenant management
DROP POLICY IF EXISTS "super admin manages admin users" ON public.admin_users;

CREATE POLICY "Platform owners manage all admin users"
ON public.admin_users FOR ALL TO authenticated
USING (is_platform_owner())
WITH CHECK (is_platform_owner());

CREATE POLICY "Tenant super admins manage tenant admin users"
ON public.admin_users FOR ALL TO authenticated
USING (
  has_admin_role(auth.uid(), 'super_admin'::app_role)
  AND customer_id IS NOT NULL
  AND customer_id = current_customer_id()
  AND COALESCE(is_platform_owner, false) = false
)
WITH CHECK (
  has_admin_role(auth.uid(), 'super_admin'::app_role)
  AND customer_id IS NOT NULL
  AND customer_id = current_customer_id()
  AND COALESCE(is_platform_owner, false) = false
);

-- admin_roles: scope role grants to admin users of caller's tenant
DROP POLICY IF EXISTS "Super admins can insert admin roles" ON public.admin_roles;
DROP POLICY IF EXISTS "Super admins can update admin roles" ON public.admin_roles;
DROP POLICY IF EXISTS "Super admins can delete admin roles" ON public.admin_roles;

CREATE POLICY "Platform owners manage all admin roles"
ON public.admin_roles FOR ALL TO authenticated
USING (is_platform_owner())
WITH CHECK (is_platform_owner());

CREATE POLICY "Tenant super admins insert tenant admin roles"
ON public.admin_roles FOR INSERT TO authenticated
WITH CHECK (
  has_admin_role(auth.uid(), 'super_admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = admin_roles.admin_user_id
      AND au.customer_id IS NOT NULL
      AND au.customer_id = current_customer_id()
      AND COALESCE(au.is_platform_owner, false) = false
  )
);

CREATE POLICY "Tenant super admins update tenant admin roles"
ON public.admin_roles FOR UPDATE TO authenticated
USING (
  has_admin_role(auth.uid(), 'super_admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = admin_roles.admin_user_id
      AND au.customer_id = current_customer_id()
  )
)
WITH CHECK (
  has_admin_role(auth.uid(), 'super_admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = admin_roles.admin_user_id
      AND au.customer_id = current_customer_id()
      AND COALESCE(au.is_platform_owner, false) = false
  )
);

CREATE POLICY "Tenant super admins delete tenant admin roles"
ON public.admin_roles FOR DELETE TO authenticated
USING (
  has_admin_role(auth.uid(), 'super_admin'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.id = admin_roles.admin_user_id
      AND au.customer_id = current_customer_id()
      AND COALESCE(au.is_platform_owner, false) = false
  )
);
