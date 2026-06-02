
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "Profile photos are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-photos');

-- Admins can upload/update/delete
CREATE POLICY "Admins manage profile photos - insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'profile-photos' AND public.is_admin());

CREATE POLICY "Admins manage profile photos - update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'profile-photos' AND public.is_admin());

CREATE POLICY "Admins manage profile photos - delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'profile-photos' AND public.is_admin());

-- Drivers can update their own photo
CREATE POLICY "Drivers upload own profile photo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Drivers update own profile photo"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
