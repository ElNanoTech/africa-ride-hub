
DROP POLICY IF EXISTS "Authenticated read tts-cache" ON storage.objects;
CREATE POLICY "Authenticated read tts-cache"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'tts-cache');

DROP POLICY IF EXISTS "Service writes tts-cache" ON storage.objects;
CREATE POLICY "Service writes tts-cache"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'tts-cache');
