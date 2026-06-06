
-- vehicle-inspections bucket policies. Path convention: <inspection_id>/<zone>-<timestamp>.jpg
-- We rely on the inspection row to enforce tenancy via a join.

DROP POLICY IF EXISTS "vinsp drivers manage own files" ON storage.objects;
CREATE POLICY "vinsp drivers manage own files"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'vehicle-inspections'
  AND EXISTS (
    SELECT 1 FROM public.vehicle_inspections vi
    WHERE vi.id::text = split_part(storage.objects.name, '/', 1)
      AND vi.driver_id = public.current_driver_id()
  )
)
WITH CHECK (
  bucket_id = 'vehicle-inspections'
  AND EXISTS (
    SELECT 1 FROM public.vehicle_inspections vi
    WHERE vi.id::text = split_part(storage.objects.name, '/', 1)
      AND vi.driver_id = public.current_driver_id()
  )
);

DROP POLICY IF EXISTS "vinsp admins manage tenant files" ON storage.objects;
CREATE POLICY "vinsp admins manage tenant files"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'vehicle-inspections'
  AND (
    public.is_platform_owner()
    OR (
      public.is_admin() AND EXISTS (
        SELECT 1 FROM public.vehicle_inspections vi
        WHERE vi.id::text = split_part(storage.objects.name, '/', 1)
          AND vi.customer_id = public.current_customer_id()
      )
    )
  )
)
WITH CHECK (
  bucket_id = 'vehicle-inspections'
  AND (
    public.is_platform_owner()
    OR (
      public.is_admin() AND EXISTS (
        SELECT 1 FROM public.vehicle_inspections vi
        WHERE vi.id::text = split_part(storage.objects.name, '/', 1)
          AND vi.customer_id = public.current_customer_id()
      )
    )
  )
);
