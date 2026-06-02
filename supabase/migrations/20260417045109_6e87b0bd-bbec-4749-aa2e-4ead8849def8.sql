-- Seed the driver_auth_mode platform setting (idempotent)
INSERT INTO public.platform_settings (setting_key, setting_value, description)
VALUES (
  'driver_auth_mode',
  '"org_managed"'::jsonb,
  'Active driver login mode: org_managed | yango_oauth | whatsapp_otp'
)
ON CONFLICT (setting_key) DO NOTHING;

-- Loosen RLS: admins can READ all settings; only platform owners can WRITE.
DROP POLICY IF EXISTS "Platform owners only access" ON public.platform_settings;

CREATE POLICY "Admins can read platform settings"
ON public.platform_settings
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Platform owners can insert platform settings"
ON public.platform_settings
FOR INSERT
TO authenticated
WITH CHECK (public.is_platform_owner());

CREATE POLICY "Platform owners can update platform settings"
ON public.platform_settings
FOR UPDATE
TO authenticated
USING (public.is_platform_owner())
WITH CHECK (public.is_platform_owner());

CREATE POLICY "Platform owners can delete platform settings"
ON public.platform_settings
FOR DELETE
TO authenticated
USING (public.is_platform_owner());

-- Allow anonymous read of driver_auth_mode ONLY (the driver login screen
-- needs to know which form to render before the user is authenticated).
-- We expose this via a SECURITY DEFINER function rather than a permissive
-- RLS policy so we don't leak any other settings.
CREATE OR REPLACE FUNCTION public.get_driver_auth_mode()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT setting_value #>> '{}' FROM public.platform_settings WHERE setting_key = 'driver_auth_mode'),
    'org_managed'
  )
$$;

GRANT EXECUTE ON FUNCTION public.get_driver_auth_mode() TO anon, authenticated;