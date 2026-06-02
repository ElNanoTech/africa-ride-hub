-- =====================================================
-- DAM FLOTTE AUTH, ROLES & RLS MASTER MIGRATION
-- =====================================================

-- 1. ADD auth_user_id COLUMN TO DRIVERS (for Yango OAuth linking)
-- Note: keeping user_id for backwards compatibility, but auth_user_id is the new standard
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id);

-- Copy existing user_id values to auth_user_id where not null
UPDATE public.drivers 
SET auth_user_id = user_id 
WHERE user_id IS NOT NULL AND auth_user_id IS NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_drivers_auth_user_id ON public.drivers(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_drivers_yango_id ON public.drivers(yango_driver_id);

-- 2. ADD role_key COLUMN TO admin_users (single role approach)
-- First, add the column if not exists
ALTER TABLE public.admin_users 
ADD COLUMN IF NOT EXISTS role_key TEXT DEFAULT 'manager';

-- Update role_key based on existing roles in admin_roles table
UPDATE public.admin_users au
SET role_key = COALESCE(
  (SELECT ar.role::TEXT FROM public.admin_roles ar 
   WHERE ar.admin_user_id = au.id 
   ORDER BY CASE ar.role 
     WHEN 'super_admin' THEN 1 
     WHEN 'manager' THEN 2 
     WHEN 'loan_officer' THEN 3 
     WHEN 'support_agent' THEN 4 
   END 
   LIMIT 1), 
  'manager'
);

-- Map old role names to new ones
UPDATE public.admin_users SET role_key = 'agent_pret' WHERE role_key = 'loan_officer';
UPDATE public.admin_users SET role_key = 'agent_support' WHERE role_key = 'support_agent';

-- 3. ADD user_agent TO audit_logs
ALTER TABLE public.admin_audit_logs 
ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- 4. ADD entity_id as old_values/new_values approach
ALTER TABLE public.admin_audit_logs 
ADD COLUMN IF NOT EXISTS old_values JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.admin_audit_logs 
ADD COLUMN IF NOT EXISTS new_values JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.admin_audit_logs 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Rename entity_type/entity_id for consistency
ALTER TABLE public.admin_audit_logs 
RENAME COLUMN target_type TO entity_type;
ALTER TABLE public.admin_audit_logs 
RENAME COLUMN target_id TO entity_id;

-- 5. CREATE/UPDATE SECURITY HELPER FUNCTIONS

-- Update is_admin function to check both user_id and is_active
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid() 
    AND is_active = TRUE
  );
$$;

-- has_admin_role - check if current user has specific admin role
CREATE OR REPLACE FUNCTION public.has_admin_role(role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND role_key = role
    AND is_active = TRUE
  );
$$;

-- has_admin_role_in - check if current user has any of the specified roles
CREATE OR REPLACE FUNCTION public.has_admin_role_in(roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND role_key = ANY(roles)
    AND is_active = TRUE
  );
$$;

-- is_driver - check if current user is a driver
CREATE OR REPLACE FUNCTION public.is_driver()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.drivers
    WHERE (auth_user_id = auth.uid() OR user_id = auth.uid())
  );
$$;

-- current_driver_id - get current driver's ID
CREATE OR REPLACE FUNCTION public.current_driver_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.drivers
  WHERE (auth_user_id = auth.uid() OR user_id = auth.uid())
  LIMIT 1;
$$;

-- 6. DROP OLD RLS POLICIES (to recreate with new logic)

-- Drivers policies
DROP POLICY IF EXISTS "Admins can view all drivers" ON public.drivers;
DROP POLICY IF EXISTS "Admins can update drivers" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can view own profile" ON public.drivers;
DROP POLICY IF EXISTS "Drivers can update own profile" ON public.drivers;
DROP POLICY IF EXISTS "Allow driver creation" ON public.drivers;
DROP POLICY IF EXISTS "driver reads own profile" ON public.drivers;
DROP POLICY IF EXISTS "driver updates own profile" ON public.drivers;
DROP POLICY IF EXISTS "admin manages drivers" ON public.drivers;

-- Vehicles policies  
DROP POLICY IF EXISTS "Admins can manage vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Anyone can view available vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "drivers view vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "admin manages vehicles" ON public.vehicles;

-- Rentals policies
DROP POLICY IF EXISTS "Admins can manage rentals" ON public.rentals;
DROP POLICY IF EXISTS "Drivers can view own rentals" ON public.rentals;
DROP POLICY IF EXISTS "Drivers can create rentals" ON public.rentals;
DROP POLICY IF EXISTS "driver views own rentals" ON public.rentals;
DROP POLICY IF EXISTS "driver creates rental" ON public.rentals;
DROP POLICY IF EXISTS "admin manages rentals" ON public.rentals;

-- Loans policies
DROP POLICY IF EXISTS "Admins can manage loans" ON public.loans;
DROP POLICY IF EXISTS "Drivers can view own loans" ON public.loans;
DROP POLICY IF EXISTS "Drivers can create loans" ON public.loans;
DROP POLICY IF EXISTS "driver views own loans" ON public.loans;
DROP POLICY IF EXISTS "driver applies for loan" ON public.loans;
DROP POLICY IF EXISTS "loan staff manages loans" ON public.loans;

-- Payments policies
DROP POLICY IF EXISTS "Admins can manage payments" ON public.payments;
DROP POLICY IF EXISTS "Drivers can view own payments" ON public.payments;
DROP POLICY IF EXISTS "driver views own payments" ON public.payments;
DROP POLICY IF EXISTS "admin manages payments" ON public.payments;

-- Support tickets policies
DROP POLICY IF EXISTS "Admins can manage tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Drivers can view own tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Drivers can create tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Drivers can update own tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "driver views own tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "driver creates ticket" ON public.support_tickets;
DROP POLICY IF EXISTS "support staff manages tickets" ON public.support_tickets;

-- Scoring config policies
DROP POLICY IF EXISTS "Admins can update scoring config" ON public.scoring_config;
DROP POLICY IF EXISTS "Anyone can view scoring config" ON public.scoring_config;
DROP POLICY IF EXISTS "super admin manages scoring config" ON public.scoring_config;

-- Admin audit logs policies
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.admin_audit_logs;
DROP POLICY IF EXISTS "Admins can create audit logs" ON public.admin_audit_logs;
DROP POLICY IF EXISTS "admins read audit logs" ON public.admin_audit_logs;
DROP POLICY IF EXISTS "admins insert audit logs" ON public.admin_audit_logs;

-- Admin users policies  
DROP POLICY IF EXISTS "Admins can view admin users" ON public.admin_users;
DROP POLICY IF EXISTS "Super admins can insert admin users" ON public.admin_users;
DROP POLICY IF EXISTS "Super admins can update admin users" ON public.admin_users;
DROP POLICY IF EXISTS "Super admins can delete admin users" ON public.admin_users;
DROP POLICY IF EXISTS "Users can view own admin profile" ON public.admin_users;
DROP POLICY IF EXISTS "admins can read admin users" ON public.admin_users;
DROP POLICY IF EXISTS "super admin manages admin users" ON public.admin_users;

-- Credit scores policies
DROP POLICY IF EXISTS "Admins can manage scores" ON public.credit_scores;
DROP POLICY IF EXISTS "Drivers can view own scores" ON public.credit_scores;
DROP POLICY IF EXISTS "driver views own scores" ON public.credit_scores;
DROP POLICY IF EXISTS "admin manages scores" ON public.credit_scores;

-- Notifications policies
DROP POLICY IF EXISTS "Admins can manage notifications" ON public.notifications;
DROP POLICY IF EXISTS "Drivers can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Drivers can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "driver views own notifications" ON public.notifications;
DROP POLICY IF EXISTS "driver updates own notifications" ON public.notifications;
DROP POLICY IF EXISTS "admin manages notifications" ON public.notifications;

-- 7. CREATE NEW RLS POLICIES

-- DRIVERS POLICIES
CREATE POLICY "driver reads own profile"
ON public.drivers FOR SELECT
USING (
  (auth_user_id = auth.uid() OR user_id = auth.uid())
  OR public.is_admin()
);

CREATE POLICY "driver updates own profile"
ON public.drivers FOR UPDATE
USING (auth_user_id = auth.uid() OR user_id = auth.uid())
WITH CHECK (auth_user_id = auth.uid() OR user_id = auth.uid());

CREATE POLICY "admin manages drivers"
ON public.drivers FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- VEHICLES POLICIES
CREATE POLICY "drivers view vehicles"
ON public.vehicles FOR SELECT
USING (
  public.is_driver()
  OR public.is_admin()
);

CREATE POLICY "admin manages vehicles"
ON public.vehicles FOR ALL
USING (public.has_admin_role_in(ARRAY['super_admin', 'manager']))
WITH CHECK (public.has_admin_role_in(ARRAY['super_admin', 'manager']));

-- RENTALS POLICIES
CREATE POLICY "driver views own rentals"
ON public.rentals FOR SELECT
USING (
  driver_id = public.current_driver_id()
  OR public.is_admin()
);

CREATE POLICY "driver creates rental"
ON public.rentals FOR INSERT
WITH CHECK (
  driver_id = public.current_driver_id()
);

CREATE POLICY "admin manages rentals"
ON public.rentals FOR ALL
USING (public.has_admin_role_in(ARRAY['super_admin', 'manager']))
WITH CHECK (public.has_admin_role_in(ARRAY['super_admin', 'manager']));

-- LOANS POLICIES
CREATE POLICY "driver views own loans"
ON public.loans FOR SELECT
USING (
  driver_id = public.current_driver_id()
  OR public.is_admin()
);

CREATE POLICY "driver applies for loan"
ON public.loans FOR INSERT
WITH CHECK (
  driver_id = public.current_driver_id()
);

CREATE POLICY "loan staff manages loans"
ON public.loans FOR UPDATE
USING (public.has_admin_role_in(ARRAY['super_admin', 'manager', 'agent_pret']))
WITH CHECK (public.has_admin_role_in(ARRAY['super_admin', 'manager', 'agent_pret']));

CREATE POLICY "admin deletes loans"
ON public.loans FOR DELETE
USING (public.has_admin_role_in(ARRAY['super_admin', 'manager']));

-- PAYMENTS POLICIES
CREATE POLICY "driver views own payments"
ON public.payments FOR SELECT
USING (
  driver_id = public.current_driver_id()
  OR public.is_admin()
);

CREATE POLICY "admin manages payments"
ON public.payments FOR ALL
USING (public.has_admin_role_in(ARRAY['super_admin', 'manager']))
WITH CHECK (public.has_admin_role_in(ARRAY['super_admin', 'manager']));

-- SUPPORT TICKETS POLICIES
CREATE POLICY "driver views own tickets"
ON public.support_tickets FOR SELECT
USING (
  driver_id = public.current_driver_id()
  OR public.is_admin()
);

CREATE POLICY "driver creates ticket"
ON public.support_tickets FOR INSERT
WITH CHECK (
  driver_id = public.current_driver_id()
);

CREATE POLICY "driver updates own ticket"
ON public.support_tickets FOR UPDATE
USING (driver_id = public.current_driver_id())
WITH CHECK (driver_id = public.current_driver_id());

CREATE POLICY "support staff manages tickets"
ON public.support_tickets FOR UPDATE
USING (public.has_admin_role_in(ARRAY['super_admin', 'manager', 'agent_support']))
WITH CHECK (public.has_admin_role_in(ARRAY['super_admin', 'manager', 'agent_support']));

CREATE POLICY "admin deletes tickets"
ON public.support_tickets FOR DELETE
USING (public.has_admin_role_in(ARRAY['super_admin', 'manager']));

-- CREDIT SCORES POLICIES
CREATE POLICY "driver views own scores"
ON public.credit_scores FOR SELECT
USING (
  driver_id = public.current_driver_id()
  OR public.is_admin()
);

CREATE POLICY "admin manages scores"
ON public.credit_scores FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- SCORING CONFIG POLICIES
CREATE POLICY "anyone can view scoring config"
ON public.scoring_config FOR SELECT
USING (true);

CREATE POLICY "super admin manages scoring config"
ON public.scoring_config FOR ALL
USING (public.has_admin_role('super_admin'))
WITH CHECK (public.has_admin_role('super_admin'));

-- ADMIN AUDIT LOGS POLICIES
CREATE POLICY "admins read audit logs"
ON public.admin_audit_logs FOR SELECT
USING (public.is_admin());

CREATE POLICY "admins insert audit logs"
ON public.admin_audit_logs FOR INSERT
WITH CHECK (
  public.is_admin() 
  AND admin_user_id = auth.uid()
);

-- ADMIN USERS POLICIES
CREATE POLICY "admins can read admin users"
ON public.admin_users FOR SELECT
USING (public.is_admin());

CREATE POLICY "user can view own admin profile"
ON public.admin_users FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "super admin manages admin users"
ON public.admin_users FOR ALL
USING (public.has_admin_role('super_admin'))
WITH CHECK (public.has_admin_role('super_admin'));

-- NOTIFICATIONS POLICIES
CREATE POLICY "driver views own notifications"
ON public.notifications FOR SELECT
USING (
  driver_id = public.current_driver_id()
  OR public.is_admin()
);

CREATE POLICY "driver updates own notifications"
ON public.notifications FOR UPDATE
USING (driver_id = public.current_driver_id())
WITH CHECK (driver_id = public.current_driver_id());

CREATE POLICY "admin manages notifications"
ON public.notifications FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 8. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON public.admin_users(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users(email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin ON public.admin_audit_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.admin_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.admin_audit_logs(created_at DESC);