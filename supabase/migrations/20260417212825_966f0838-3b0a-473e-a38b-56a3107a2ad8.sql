-- Allow admins to upload KYC documents to any path (for admin-managed driver creation)
CREATE POLICY "Admins can upload KYC documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'kyc-documents'
  AND public.is_admin()
);

-- Also allow admins to update/delete (parity with view policy)
CREATE POLICY "Admins can update KYC documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'kyc-documents' AND public.is_admin());

CREATE POLICY "Admins can delete KYC documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'kyc-documents' AND public.is_admin());