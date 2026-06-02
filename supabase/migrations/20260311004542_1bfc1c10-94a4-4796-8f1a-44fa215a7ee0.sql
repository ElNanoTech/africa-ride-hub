-- Drop the ALL policy and create explicit ones for admins on accident-photos
DROP POLICY IF EXISTS "Admins manage accident photos" ON storage.objects;

-- Explicit SELECT for admins
CREATE POLICY "Admins select accident photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'accident-photos'
  AND EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE admin_users.user_id = auth.uid()
    AND admin_users.is_active = true
  )
);

-- Explicit INSERT for admins
CREATE POLICY "Admins insert accident photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'accident-photos'
  AND EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE admin_users.user_id = auth.uid()
    AND admin_users.is_active = true
  )
);

-- Explicit UPDATE for admins
CREATE POLICY "Admins update accident photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'accident-photos'
  AND EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE admin_users.user_id = auth.uid()
    AND admin_users.is_active = true
  )
);

-- Explicit DELETE for admins
CREATE POLICY "Admins delete accident photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'accident-photos'
  AND EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE admin_users.user_id = auth.uid()
    AND admin_users.is_active = true
  )
);