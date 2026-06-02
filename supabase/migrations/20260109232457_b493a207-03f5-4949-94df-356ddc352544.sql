
-- Add platform owner flag to admin_users (hidden from UI, only settable via direct DB access)
ALTER TABLE public.admin_users 
ADD COLUMN IF NOT EXISTS is_platform_owner boolean NOT NULL DEFAULT false;

-- Create feature_flags table for controlling feature visibility
CREATE TABLE public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text UNIQUE NOT NULL,
  flag_value boolean NOT NULL DEFAULT false,
  description text,
  is_platform_only boolean NOT NULL DEFAULT false,
  category text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.admin_users(id)
);

-- Create platform_settings table for platform-level configuration
CREATE TABLE public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.admin_users(id)
);

-- Enable RLS on both tables
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Security definer function to check if user is platform owner
CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
    AND is_platform_owner = true
    AND is_active = true
  )
$$;

-- RLS policies for feature_flags
-- Platform owners can manage all flags
CREATE POLICY "Platform owners manage all flags"
ON public.feature_flags
FOR ALL
USING (is_platform_owner())
WITH CHECK (is_platform_owner());

-- Customer super admins can only view non-platform-only flags
CREATE POLICY "Super admins view non-platform flags"
ON public.feature_flags
FOR SELECT
USING (
  NOT is_platform_only 
  AND has_admin_role('super_admin'::text)
  AND NOT is_platform_owner()
);

-- Customer super admins can update non-platform-only flags
CREATE POLICY "Super admins update non-platform flags"
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

-- RLS policies for platform_settings (platform owners only)
CREATE POLICY "Platform owners manage settings"
ON public.platform_settings
FOR ALL
USING (is_platform_owner())
WITH CHECK (is_platform_owner());

-- Insert default feature flags
INSERT INTO public.feature_flags (flag_key, flag_value, description, is_platform_only, category) VALUES
  -- Platform-only flags (hidden from customer)
  ('demo_mode', false, 'Enable demo mode with sample data', true, 'platform'),
  ('show_pricing_module', false, 'Show pricing configuration module', true, 'platform'),
  ('enable_white_label', false, 'Enable white-label branding options', true, 'platform'),
  ('show_future_modules', false, 'Show upcoming features in development', true, 'platform'),
  ('enable_multi_tenant', false, 'Enable multi-tenant support', true, 'platform'),
  ('debug_mode', false, 'Enable debug logging and tools', true, 'platform'),
  
  -- Customer-visible flags (can be toggled by super admin)
  ('enable_loans', true, 'Enable loan application feature', false, 'loans'),
  ('enable_rentals', true, 'Enable vehicle rental feature', false, 'rentals'),
  ('enable_credit_scoring', true, 'Enable credit scoring system', false, 'scoring'),
  ('enable_ai_explanations', true, 'Enable AI-powered score explanations', false, 'scoring'),
  ('enable_whatsapp_notifications', false, 'Enable WhatsApp notifications', false, 'notifications'),
  ('enable_driver_kyc', true, 'Require KYC verification for drivers', false, 'drivers'),
  ('auto_approve_rentals', false, 'Auto-approve rental requests', false, 'rentals'),
  ('auto_approve_kyc', false, 'Auto-approve KYC submissions', false, 'drivers')
ON CONFLICT (flag_key) DO NOTHING;

-- Insert default platform settings
INSERT INTO public.platform_settings (setting_key, setting_value, description) VALUES
  ('pricing_tiers', '{"basic": 0, "pro": 49, "enterprise": 199}'::jsonb, 'Platform pricing tiers'),
  ('platform_branding', '{"name": "DAM Flotte", "primary_color": "#0EA5E9", "logo_url": null}'::jsonb, 'Platform branding configuration'),
  ('demo_data_config', '{"drivers": 10, "vehicles": 5, "loans": 3}'::jsonb, 'Demo mode data configuration'),
  ('feature_roadmap', '{"q1_2026": ["multi_fleet", "api_v2"], "q2_2026": ["mobile_app", "analytics_v2"]}'::jsonb, 'Internal feature roadmap'),
  ('tenant_limits', '{"max_drivers": 1000, "max_vehicles": 500, "max_admins": 20}'::jsonb, 'Default tenant limits')
ON CONFLICT (setting_key) DO NOTHING;

-- Create function to check if a feature is enabled
CREATE OR REPLACE FUNCTION public.is_feature_enabled(p_flag_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT flag_value FROM public.feature_flags WHERE flag_key = p_flag_key),
    false
  )
$$;

-- Create function to get platform setting
CREATE OR REPLACE FUNCTION public.get_platform_setting(p_setting_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT setting_value FROM public.platform_settings WHERE setting_key = p_setting_key),
    '{}'::jsonb
  )
$$;

-- Trigger for updated_at on feature_flags
CREATE TRIGGER update_feature_flags_updated_at
BEFORE UPDATE ON public.feature_flags
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on platform_settings
CREATE TRIGGER update_platform_settings_updated_at
BEFORE UPDATE ON public.platform_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE public.feature_flags IS 'Feature flags for controlling feature visibility. Platform-only flags are hidden from customer admins.';
COMMENT ON TABLE public.platform_settings IS 'Platform-level settings only accessible by platform owners.';
COMMENT ON COLUMN public.admin_users.is_platform_owner IS 'Hidden flag - only settable via direct database access. Grants access to platform-level features.';
COMMENT ON COLUMN public.feature_flags.is_platform_only IS 'If true, this flag is only visible to platform owners and hidden from customer super admins.';
