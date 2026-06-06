ALTER TABLE public.vehicle_inspection_photos
  DROP CONSTRAINT IF EXISTS vehicle_inspection_photos_zone_check;

ALTER TABLE public.vehicle_inspection_photos
  ADD CONSTRAINT vehicle_inspection_photos_zone_check
  CHECK (zone = ANY (ARRAY[
    'front','rear','left','right','dash','interior','tires',
    'doc_vignette','doc_assurance','doc_carte_parking','doc_carte_grise'
  ]));