-- Public bucket for vehicle photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-photos', 'vehicle-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "Vehicle photos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'vehicle-photos');

-- Admins can upload, update, delete vehicle photos
CREATE POLICY "Admins upload vehicle photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'vehicle-photos' AND public.is_admin());

CREATE POLICY "Admins update vehicle photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'vehicle-photos' AND public.is_admin());

CREATE POLICY "Admins delete vehicle photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'vehicle-photos' AND public.is_admin());
