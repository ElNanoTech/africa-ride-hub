-- Drop existing check constraint and add updated one with 'not_submitted' status
ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS drivers_kyc_status_check;

-- Add updated check constraint
ALTER TABLE public.drivers ADD CONSTRAINT drivers_kyc_status_check 
CHECK (kyc_status IN ('pending', 'verified', 'rejected', 'not_submitted'));

-- Fix existing data: drivers with 'pending' status but no KYC submission should be 'not_submitted'
UPDATE public.drivers d
SET kyc_status = 'not_submitted'
WHERE d.kyc_status = 'pending' 
AND NOT EXISTS (SELECT 1 FROM public.kyc_submissions k WHERE k.driver_id = d.id);