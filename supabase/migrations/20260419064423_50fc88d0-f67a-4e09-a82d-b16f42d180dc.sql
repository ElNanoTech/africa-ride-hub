-- Fix 1: Update get_driver_id to also check auth_user_id (mirrors current_driver_id)
CREATE OR REPLACE FUNCTION public.get_driver_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id FROM public.drivers
  WHERE auth_user_id = _user_id OR user_id = _user_id
  LIMIT 1
$function$;

-- Fix 2: Remove the public read policy on voice-notes storage bucket.
-- Reads should be restricted to the authenticated owner-or-admin policies that already exist.
DROP POLICY IF EXISTS "Anyone can read voice notes" ON storage.objects;