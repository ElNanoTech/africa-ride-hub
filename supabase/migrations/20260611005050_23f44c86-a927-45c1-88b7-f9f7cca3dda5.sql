CREATE OR REPLACE FUNCTION public.force_promote_platform_owner(_admin_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.admin_users
     SET is_platform_owner = true,
         is_active = true,
         role_key = COALESCE(role_key, 'super_admin'),
         email_verified = true
   WHERE id = _admin_id;
  PERFORM set_config('session_replication_role', 'origin', true);
END;
$$;
REVOKE ALL ON FUNCTION public.force_promote_platform_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.force_promote_platform_owner(uuid) TO service_role;