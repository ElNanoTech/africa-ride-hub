-- Revoke column-level SELECT on verification_token from authenticated role.
-- RLS is row-level; column privileges are the correct tool to hide sensitive columns.
-- Service role (edge functions handling verification) and platform owners retain access.
REVOKE SELECT (verification_token, verification_sent_at) ON public.admin_users FROM authenticated;
REVOKE SELECT (verification_token, verification_sent_at) ON public.admin_users FROM anon;

-- Grant SELECT on all non-sensitive columns explicitly to authenticated.
GRANT SELECT (
  id, user_id, email, full_name, is_active, last_login_at,
  created_at, updated_at, role_key, email_verified,
  is_platform_owner, customer_id
) ON public.admin_users TO authenticated;

-- Platform owners need full access (including verification_token) via a security-definer view
-- so the auth/verification edge functions and platform-owner UI can still read it when needed.
CREATE OR REPLACE VIEW public.admin_users_with_tokens
WITH (security_invoker = false) AS
SELECT * FROM public.admin_users
WHERE public.is_platform_owner();

GRANT SELECT ON public.admin_users_with_tokens TO authenticated;
GRANT ALL ON public.admin_users_with_tokens TO service_role;