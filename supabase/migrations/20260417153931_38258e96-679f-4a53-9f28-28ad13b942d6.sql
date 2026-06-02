-- Make the voice-notes bucket private
UPDATE storage.buckets SET public = false WHERE id = 'voice-notes';

-- Clean up any prior policies on this bucket so we have a single source of truth
DROP POLICY IF EXISTS "voice_notes_public_read" ON storage.objects;
DROP POLICY IF EXISTS "voice_notes_authenticated_upload" ON storage.objects;
DROP POLICY IF EXISTS "voice_notes_owner_upload" ON storage.objects;
DROP POLICY IF EXISTS "voice_notes_owner_delete" ON storage.objects;
DROP POLICY IF EXISTS "voice_notes_admin_read" ON storage.objects;
DROP POLICY IF EXISTS "voice_notes_driver_read_own_ticket" ON storage.objects;

-- Upload: any authenticated user can write only inside their own auth.uid() folder.
-- Path layout used by the app: {auth.uid()}/{ticketId}/{timestamp}.webm
CREATE POLICY "voice_notes_owner_upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'voice-notes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Delete: only the original uploader can delete their files
CREATE POLICY "voice_notes_owner_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'voice-notes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Read: admins can read every voice note
CREATE POLICY "voice_notes_admin_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'voice-notes'
  AND public.is_admin()
);

-- Read: drivers can read voice notes attached to their own support tickets,
-- OR voice notes they uploaded themselves (path starts with their auth.uid())
CREATE POLICY "voice_notes_driver_read_own_ticket"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'voice-notes'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.support_tickets st
      JOIN public.drivers d ON d.id = st.driver_id
      WHERE st.id::text = (storage.foldername(name))[2]
        AND (d.auth_user_id = auth.uid() OR d.user_id = auth.uid())
    )
  )
);
