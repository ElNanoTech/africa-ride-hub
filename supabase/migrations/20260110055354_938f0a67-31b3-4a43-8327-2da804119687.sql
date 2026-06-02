-- Create storage bucket for KYC documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-documents', 'kyc-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for kyc-documents bucket
-- Drivers can upload their own documents
CREATE POLICY "Drivers can upload their own KYC documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'kyc-documents' 
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM public.drivers 
    WHERE auth_user_id = auth.uid() OR user_id = auth.uid()
    LIMIT 1
  )
);

-- Drivers can view their own documents
CREATE POLICY "Drivers can view their own KYC documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'kyc-documents'
  AND (
    -- Driver viewing their own
    (storage.foldername(name))[1] = (
      SELECT id::text FROM public.drivers 
      WHERE auth_user_id = auth.uid() OR user_id = auth.uid()
      LIMIT 1
    )
    -- Or admin viewing any
    OR public.is_admin()
  )
);

-- Admins can view all KYC documents
CREATE POLICY "Admins can view all KYC documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'kyc-documents'
  AND public.is_admin()
);

-- Drivers can update their own documents (before approval)
CREATE POLICY "Drivers can update their own KYC documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'kyc-documents'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM public.drivers 
    WHERE auth_user_id = auth.uid() OR user_id = auth.uid()
    LIMIT 1
  )
);

-- Drivers can delete their own documents (before approval)
CREATE POLICY "Drivers can delete their own KYC documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'kyc-documents'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM public.drivers 
    WHERE auth_user_id = auth.uid() OR user_id = auth.uid()
    LIMIT 1
  )
);