-- Add status and approval fields to income_records for driver self-reporting
ALTER TABLE public.income_records 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'approved',
ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS reviewed_by uuid,
ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS rejection_reason text,
ADD COLUMN IF NOT EXISTS trust_weight numeric(3,2) DEFAULT 1.0;

-- Add comments for documentation
COMMENT ON COLUMN public.income_records.status IS 'Status: pending, approved, rejected';
COMMENT ON COLUMN public.income_records.submitted_by IS 'User ID who submitted the record';
COMMENT ON COLUMN public.income_records.trust_weight IS 'Weight applied in scoring: 1.0 for verified, 0.7 for driver-declared';

-- Update existing records to be approved
UPDATE public.income_records SET status = 'approved' WHERE status IS NULL;

-- Add RLS policy for drivers to submit their own income
DROP POLICY IF EXISTS "Drivers can submit own income" ON public.income_records;
CREATE POLICY "Drivers can submit own income"
ON public.income_records
FOR INSERT
WITH CHECK (
  driver_id = current_driver_id() 
  AND source = 'driver_declared'
  AND status = 'pending'
);

-- Add policy for drivers to view their own submissions
DROP POLICY IF EXISTS "Drivers can view own pending income" ON public.income_records;
CREATE POLICY "Drivers can view own pending income"
ON public.income_records
FOR SELECT
USING (
  driver_id = current_driver_id()
  OR is_admin()
);

-- Add index for pending approvals
CREATE INDEX IF NOT EXISTS idx_income_records_pending ON public.income_records(status) WHERE status = 'pending';