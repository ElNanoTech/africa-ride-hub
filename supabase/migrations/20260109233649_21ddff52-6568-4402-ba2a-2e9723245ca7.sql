-- =============================================
-- B) TENANT STRUCTURE - CREATE TABLES & COLUMNS FIRST
-- =============================================

-- Create customers table
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  primary_color text DEFAULT '#000000',
  secondary_color text DEFAULT '#ffffff',
  is_active boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Add customer_id columns to all tables FIRST (before RPC functions)
ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.rentals ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.kyc_submissions ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.credit_scores ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.telemetry_events ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.income_records ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);

-- Create default customer for existing data
INSERT INTO public.customers (id, name, slug, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'DAM Flotte', 'dam-flotte', true)
ON CONFLICT (slug) DO NOTHING;

-- Update existing data with default customer
UPDATE public.drivers SET customer_id = '00000000-0000-0000-0000-000000000001' WHERE customer_id IS NULL;
UPDATE public.vehicles SET customer_id = '00000000-0000-0000-0000-000000000001' WHERE customer_id IS NULL;
UPDATE public.rentals SET customer_id = '00000000-0000-0000-0000-000000000001' WHERE customer_id IS NULL;
UPDATE public.loans SET customer_id = '00000000-0000-0000-0000-000000000001' WHERE customer_id IS NULL;
UPDATE public.payments SET customer_id = '00000000-0000-0000-0000-000000000001' WHERE customer_id IS NULL;
UPDATE public.support_tickets SET customer_id = '00000000-0000-0000-0000-000000000001' WHERE customer_id IS NULL;
UPDATE public.kyc_submissions SET customer_id = '00000000-0000-0000-0000-000000000001' WHERE customer_id IS NULL;
UPDATE public.notifications SET customer_id = '00000000-0000-0000-0000-000000000001' WHERE customer_id IS NULL;
UPDATE public.credit_scores SET customer_id = '00000000-0000-0000-0000-000000000001' WHERE customer_id IS NULL;
UPDATE public.telemetry_events SET customer_id = '00000000-0000-0000-0000-000000000001' WHERE customer_id IS NULL;
UPDATE public.income_records SET customer_id = '00000000-0000-0000-0000-000000000001' WHERE customer_id IS NULL;
UPDATE public.admin_users SET customer_id = '00000000-0000-0000-0000-000000000001' WHERE customer_id IS NULL AND NOT is_platform_owner;

-- Create function to get current admin's customer_id
CREATE OR REPLACE FUNCTION public.current_customer_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT customer_id FROM public.admin_users 
  WHERE user_id = auth.uid() 
  LIMIT 1
$$;

-- =============================================
-- A) PLATFORM OWNER SEPARATION - DB ENFORCED
-- =============================================

-- Drop existing permissive RLS policies on feature_flags and platform_settings
DROP POLICY IF EXISTS "Platform owners manage all flags" ON public.feature_flags;
DROP POLICY IF EXISTS "Super admins update non-platform flags" ON public.feature_flags;
DROP POLICY IF EXISTS "Super admins view non-platform flags" ON public.feature_flags;
DROP POLICY IF EXISTS "Platform owners manage settings" ON public.platform_settings;
DROP POLICY IF EXISTS "Platform owners full access" ON public.feature_flags;
DROP POLICY IF EXISTS "Super admins view customer flags" ON public.feature_flags;
DROP POLICY IF EXISTS "Super admins update customer flags" ON public.feature_flags;
DROP POLICY IF EXISTS "Platform owners only access" ON public.platform_settings;

-- Create strict RLS policies for feature_flags
-- Platform owners can do everything
CREATE POLICY "Platform owners full access"
ON public.feature_flags
FOR ALL
USING (is_platform_owner())
WITH CHECK (is_platform_owner());

-- Super admins can only view non-platform flags
CREATE POLICY "Super admins view customer flags"
ON public.feature_flags
FOR SELECT
USING (
  NOT is_platform_only 
  AND has_admin_role('super_admin'::text) 
  AND NOT is_platform_owner()
);

-- Super admins can only update non-platform flags
CREATE POLICY "Super admins update customer flags"
ON public.feature_flags
FOR UPDATE
USING (
  NOT is_platform_only 
  AND has_admin_role('super_admin'::text) 
  AND NOT is_platform_owner()
)
WITH CHECK (
  NOT is_platform_only 
  AND has_admin_role('super_admin'::text) 
  AND NOT is_platform_owner()
);

-- Strict RLS for platform_settings - only platform owners
CREATE POLICY "Platform owners only access"
ON public.platform_settings
FOR ALL
USING (is_platform_owner())
WITH CHECK (is_platform_owner());

-- Customers table policies
DROP POLICY IF EXISTS "Platform owners manage customers" ON public.customers;
DROP POLICY IF EXISTS "Admins view own customer" ON public.customers;

CREATE POLICY "Platform owners manage customers"
ON public.customers
FOR ALL
USING (is_platform_owner())
WITH CHECK (is_platform_owner());

CREATE POLICY "Admins view own customer"
ON public.customers
FOR SELECT
USING (
  is_admin() AND id IN (
    SELECT au.customer_id FROM public.admin_users au
    WHERE au.user_id = auth.uid()
  )
);

-- Create RPC function to get visible feature flags for current user
CREATE OR REPLACE FUNCTION public.get_visible_feature_flags()
RETURNS TABLE(
  id uuid,
  flag_key text,
  flag_value boolean,
  description text,
  category text,
  is_platform_only boolean,
  customer_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF is_platform_owner() THEN
    -- Platform owners see everything
    RETURN QUERY SELECT 
      f.id, f.flag_key, f.flag_value, f.description, f.category, 
      f.is_platform_only, f.customer_id, f.created_at, f.updated_at
    FROM public.feature_flags f;
  ELSIF is_admin() THEN
    -- Admins see only non-platform flags
    RETURN QUERY SELECT 
      f.id, f.flag_key, f.flag_value, f.description, f.category, 
      f.is_platform_only, f.customer_id, f.created_at, f.updated_at
    FROM public.feature_flags f
    WHERE NOT f.is_platform_only;
  ELSE
    -- No access for non-admins
    RETURN;
  END IF;
END;
$$;

-- =============================================
-- C) FEATURE FLAG AUDIT LOG (IMMUTABLE)
-- =============================================

-- Create immutable audit log table
CREATE TABLE IF NOT EXISTS public.feature_flag_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  actor_email text,
  flag_key text NOT NULL,
  old_value boolean,
  new_value boolean,
  customer_id uuid REFERENCES public.customers(id),
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.feature_flag_audit_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Platform owners view all audit logs" ON public.feature_flag_audit_log;
DROP POLICY IF EXISTS "Admins view customer audit logs" ON public.feature_flag_audit_log;
DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.feature_flag_audit_log;

-- Only platform owners can view all audit logs
CREATE POLICY "Platform owners view all audit logs"
ON public.feature_flag_audit_log
FOR SELECT
USING (is_platform_owner());

-- Super admins can view their customer's audit logs only
CREATE POLICY "Admins view customer audit logs"
ON public.feature_flag_audit_log
FOR SELECT
USING (
  is_admin() 
  AND NOT is_platform_owner()
  AND customer_id = current_customer_id()
);

-- Insert-only policy for logging (no updates/deletes allowed)
CREATE POLICY "Admins can insert audit logs"
ON public.feature_flag_audit_log
FOR INSERT
WITH CHECK (
  is_admin() AND actor_id IN (
    SELECT au.id FROM public.admin_users au WHERE au.user_id = auth.uid()
  )
);

-- Create trigger function to auto-log feature flag changes
CREATE OR REPLACE FUNCTION public.log_feature_flag_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_email text;
BEGIN
  -- Get the actor info
  SELECT au.id, au.email INTO v_actor_id, v_actor_email
  FROM public.admin_users au
  WHERE au.user_id = auth.uid()
  LIMIT 1;
  
  -- Log the change
  INSERT INTO public.feature_flag_audit_log (
    actor_id,
    actor_email,
    flag_key,
    old_value,
    new_value,
    customer_id,
    reason
  ) VALUES (
    COALESCE(v_actor_id, '00000000-0000-0000-0000-000000000000'),
    COALESCE(v_actor_email, 'system'),
    NEW.flag_key,
    OLD.flag_value,
    NEW.flag_value,
    NEW.customer_id,
    'Feature flag updated'
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger for feature flag changes
DROP TRIGGER IF EXISTS tr_feature_flag_audit ON public.feature_flags;
CREATE TRIGGER tr_feature_flag_audit
AFTER UPDATE ON public.feature_flags
FOR EACH ROW
WHEN (OLD.flag_value IS DISTINCT FROM NEW.flag_value)
EXECUTE FUNCTION public.log_feature_flag_change();

-- =============================================
-- D) FIX SECURITY WARNINGS
-- =============================================

-- Fix ai_explanations - service role insert should be more restrictive
DROP POLICY IF EXISTS "Service role can insert explanations" ON public.ai_explanations;
CREATE POLICY "System can insert explanations"
ON public.ai_explanations
FOR INSERT
WITH CHECK (
  driver_id IN (SELECT d.id FROM public.drivers d)
);

-- Create indexes for customer_id columns for performance
CREATE INDEX IF NOT EXISTS idx_drivers_customer_id ON public.drivers(customer_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_customer_id ON public.vehicles(customer_id);
CREATE INDEX IF NOT EXISTS idx_rentals_customer_id ON public.rentals(customer_id);
CREATE INDEX IF NOT EXISTS idx_loans_customer_id ON public.loans(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer_id ON public.support_tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_feature_flags_customer_id ON public.feature_flags(customer_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_customer_id ON public.admin_users(customer_id);
CREATE INDEX IF NOT EXISTS idx_feature_flag_audit_log_customer_id ON public.feature_flag_audit_log(customer_id);

-- Add updated_at trigger for customers table
DROP TRIGGER IF EXISTS update_customers_updated_at ON public.customers;
CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();