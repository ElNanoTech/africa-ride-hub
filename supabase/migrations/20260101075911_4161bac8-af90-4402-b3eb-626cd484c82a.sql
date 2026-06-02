-- Allow super_admins to insert, update, and delete admin_users
CREATE POLICY "Super admins can insert admin users"
ON public.admin_users
FOR INSERT
TO authenticated
WITH CHECK (has_admin_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update admin users"
ON public.admin_users
FOR UPDATE
TO authenticated
USING (has_admin_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete admin users"
ON public.admin_users
FOR DELETE
TO authenticated
USING (has_admin_role(auth.uid(), 'super_admin'));

-- Allow super_admins to insert and delete admin_roles
CREATE POLICY "Super admins can insert admin roles"
ON public.admin_roles
FOR INSERT
TO authenticated
WITH CHECK (has_admin_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update admin roles"
ON public.admin_roles
FOR UPDATE
TO authenticated
USING (has_admin_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete admin roles"
ON public.admin_roles
FOR DELETE
TO authenticated
USING (has_admin_role(auth.uid(), 'super_admin'));