-- Drop the overly permissive insert policy
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.login_activity;

-- Create a more restrictive insert policy - only allow insert if the driver_id matches the authenticated driver
CREATE POLICY "Drivers can insert their own login activity"
ON public.login_activity
FOR INSERT
WITH CHECK (driver_id = current_driver_id() OR is_admin());