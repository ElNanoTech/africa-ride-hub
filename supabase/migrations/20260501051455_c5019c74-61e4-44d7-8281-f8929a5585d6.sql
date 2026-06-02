-- Add logo column for invoice header branding
ALTER TABLE public.customer_billing_settings
  ADD COLUMN IF NOT EXISTS legal_logo_url text;

-- Public bucket for invoice/branding logos (small, safe to be public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('billing-logos', 'billing-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read logos (public bucket, used in PDFs and public invoice page)
DROP POLICY IF EXISTS "Billing logos are publicly readable" ON storage.objects;
CREATE POLICY "Billing logos are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'billing-logos');

-- Only authenticated admins can upload/update/delete logos under their customer folder
DROP POLICY IF EXISTS "Admins can upload billing logos" ON storage.objects;
CREATE POLICY "Admins can upload billing logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'billing-logos'
    AND EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid() AND a.is_active = true)
  );

DROP POLICY IF EXISTS "Admins can update billing logos" ON storage.objects;
CREATE POLICY "Admins can update billing logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'billing-logos'
    AND EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid() AND a.is_active = true)
  );

DROP POLICY IF EXISTS "Admins can delete billing logos" ON storage.objects;
CREATE POLICY "Admins can delete billing logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'billing-logos'
    AND EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid() AND a.is_active = true)
  );