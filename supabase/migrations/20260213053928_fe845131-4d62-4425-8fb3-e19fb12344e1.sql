
-- Create storage bucket for voice notes
INSERT INTO storage.buckets (id, name, public) VALUES ('voice-notes', 'voice-notes', true);

-- Allow authenticated users to upload voice notes
CREATE POLICY "Authenticated users can upload voice notes"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'voice-notes' AND auth.role() = 'authenticated');

-- Allow anyone to read voice notes (public bucket)
CREATE POLICY "Anyone can read voice notes"
ON storage.objects FOR SELECT
USING (bucket_id = 'voice-notes');

-- Allow users to delete their own voice notes
CREATE POLICY "Users can delete own voice notes"
ON storage.objects FOR DELETE
USING (bucket_id = 'voice-notes' AND auth.uid()::text = (storage.foldername(name))[1]);
