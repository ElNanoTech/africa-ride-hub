-- Drop the incorrect policies
DROP POLICY IF EXISTS "super admin manages admin users" ON public.admin_users;

-- Create corrected policy that checks admin_roles table
CREATE POLICY "super admin manages admin users" 
ON public.admin_users 
FOR ALL 
USING (has_admin_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_admin_role(auth.uid(), 'super_admin'::app_role));

-- Also fix admin_roles policies to use the correct function
DROP POLICY IF EXISTS "Super admins can insert admin roles" ON public.admin_roles;
DROP POLICY IF EXISTS "Super admins can update admin roles" ON public.admin_roles;
DROP POLICY IF EXISTS "Super admins can delete admin roles" ON public.admin_roles;

CREATE POLICY "Super admins can insert admin roles" 
ON public.admin_roles 
FOR INSERT 
WITH CHECK (has_admin_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can update admin roles" 
ON public.admin_roles 
FOR UPDATE 
USING (has_admin_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can delete admin roles" 
ON public.admin_roles 
FOR DELETE 
USING (has_admin_role(auth.uid(), 'super_admin'::app_role));