-- Create storage bucket for income proof images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'income-proofs', 
  'income-proofs', 
  false, 
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
);

-- RLS: Drivers can upload their own proofs
CREATE POLICY "Drivers can upload their own income proofs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'income-proofs' 
  AND (storage.foldername(name))[1] = (SELECT id::text FROM public.drivers WHERE auth_user_id = auth.uid() LIMIT 1)
);

-- RLS: Drivers can view their own proofs
CREATE POLICY "Drivers can view their own income proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'income-proofs' 
  AND (storage.foldername(name))[1] = (SELECT id::text FROM public.drivers WHERE auth_user_id = auth.uid() LIMIT 1)
);

-- RLS: Admins can view all income proofs
CREATE POLICY "Admins can view all income proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'income-proofs' 
  AND EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true)
);

-- Add proof_url column to income_records
ALTER TABLE public.income_records ADD COLUMN IF NOT EXISTS proof_url TEXT;