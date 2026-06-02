-- Fix: Restrict scoring_config to authenticated users only (remove public access)
-- The "anyone can view scoring config" policy exposes the proprietary scoring algorithm

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "anyone can view scoring config" ON public.scoring_config;

-- Create a more restrictive policy - only admins and authenticated drivers can view
CREATE POLICY "authenticated_users_view_scoring_config"
ON public.scoring_config
FOR SELECT
TO authenticated
USING (true);

-- Also fix the banks table - restrict to authenticated users
DROP POLICY IF EXISTS "Anyone can view banks" ON public.banks;

CREATE POLICY "authenticated_users_view_banks"
ON public.banks
FOR SELECT
TO authenticated
USING (true);

-- Fix the notification with null customer_id
UPDATE public.notifications 
SET customer_id = '00000000-0000-0000-0000-000000000001' 
WHERE customer_id IS NULL;