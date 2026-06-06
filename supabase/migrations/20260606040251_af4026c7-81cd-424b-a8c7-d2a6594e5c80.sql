DROP POLICY IF EXISTS "Admins can view all KYC documents" ON storage.objects;
CREATE POLICY "Admins can view all KYC documents" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'kyc-documents' AND (is_platform_owner() OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id::text = (storage.foldername(name))[1] AND d.customer_id = current_customer_id())));

DROP POLICY IF EXISTS "Admins can upload KYC documents" ON storage.objects;
CREATE POLICY "Admins can upload KYC documents" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'kyc-documents' AND (is_platform_owner() OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id::text = (storage.foldername(name))[1] AND d.customer_id = current_customer_id())));

DROP POLICY IF EXISTS "Admins can update KYC documents" ON storage.objects;
CREATE POLICY "Admins can update KYC documents" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'kyc-documents' AND (is_platform_owner() OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id::text = (storage.foldername(name))[1] AND d.customer_id = current_customer_id())));

DROP POLICY IF EXISTS "Admins can delete KYC documents" ON storage.objects;
CREATE POLICY "Admins can delete KYC documents" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'kyc-documents' AND (is_platform_owner() OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id::text = (storage.foldername(name))[1] AND d.customer_id = current_customer_id())));

DROP POLICY IF EXISTS "Admins can view all income proofs" ON storage.objects;
CREATE POLICY "Admins can view all income proofs" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'income-proofs' AND (is_platform_owner() OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id::text = (storage.foldername(name))[1] AND d.customer_id = current_customer_id())));

DROP POLICY IF EXISTS "Admins can update income proofs" ON storage.objects;
CREATE POLICY "Admins can update income proofs" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'income-proofs' AND (is_platform_owner() OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id::text = (storage.foldername(name))[1] AND d.customer_id = current_customer_id())));

DROP POLICY IF EXISTS "Admins can delete income proofs" ON storage.objects;
CREATE POLICY "Admins can delete income proofs" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'income-proofs' AND (is_platform_owner() OR EXISTS (SELECT 1 FROM public.drivers d WHERE d.id::text = (storage.foldername(name))[1] AND d.customer_id = current_customer_id())));

DROP POLICY IF EXISTS "Admins select accident photos" ON storage.objects;
CREATE POLICY "Admins select accident photos" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'accident-photos' AND (is_platform_owner() OR EXISTS (SELECT 1 FROM public.accidents a WHERE a.id::text = (storage.foldername(name))[1] AND a.customer_id = current_customer_id())));

DROP POLICY IF EXISTS "Admins insert accident photos" ON storage.objects;
CREATE POLICY "Admins insert accident photos" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'accident-photos' AND (is_platform_owner() OR EXISTS (SELECT 1 FROM public.accidents a WHERE a.id::text = (storage.foldername(name))[1] AND a.customer_id = current_customer_id())));

DROP POLICY IF EXISTS "Admins update accident photos" ON storage.objects;
CREATE POLICY "Admins update accident photos" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'accident-photos' AND (is_platform_owner() OR EXISTS (SELECT 1 FROM public.accidents a WHERE a.id::text = (storage.foldername(name))[1] AND a.customer_id = current_customer_id())));

DROP POLICY IF EXISTS "Admins delete accident photos" ON storage.objects;
CREATE POLICY "Admins delete accident photos" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'accident-photos' AND (is_platform_owner() OR EXISTS (SELECT 1 FROM public.accidents a WHERE a.id::text = (storage.foldername(name))[1] AND a.customer_id = current_customer_id())));

DROP POLICY IF EXISTS "voice_notes_admin_read" ON storage.objects;
CREATE POLICY "voice_notes_admin_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'voice-notes' AND (is_platform_owner() OR EXISTS (SELECT 1 FROM public.support_tickets st WHERE st.id::text = (storage.foldername(name))[2] AND st.customer_id = current_customer_id())));