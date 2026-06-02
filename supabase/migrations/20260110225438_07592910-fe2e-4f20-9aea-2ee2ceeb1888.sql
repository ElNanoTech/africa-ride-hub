-- Drop the existing policy that uses get_driver_id
DROP POLICY IF EXISTS "Drivers can create KYC" ON public.kyc_submissions;

-- Create a new policy that uses current_driver_id() which checks both user_id and auth_user_id
CREATE POLICY "Drivers can create KYC" 
ON public.kyc_submissions 
FOR INSERT 
TO authenticated
WITH CHECK (driver_id = current_driver_id());