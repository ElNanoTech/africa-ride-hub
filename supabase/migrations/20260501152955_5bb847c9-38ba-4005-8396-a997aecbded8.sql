-- Link DAM managers to DAM Africa
UPDATE public.admin_users
SET customer_id = (SELECT id FROM public.customers WHERE slug = 'dam-africa' LIMIT 1),
    updated_at = now()
WHERE email IN ('manager@damflotte.com','agent@damflotte.com','support@damflotte.com','test@damflotte.com')
  AND customer_id IS NULL;

-- Backfill orphan drivers to DAM Africa (only tenant currently)
UPDATE public.drivers
SET customer_id = (SELECT id FROM public.customers WHERE slug = 'dam-africa' LIMIT 1),
    updated_at = now()
WHERE customer_id IS NULL;

-- Also backfill driver_scores rows that follow drivers
UPDATE public.driver_scores ds
SET customer_id = d.customer_id
FROM public.drivers d
WHERE ds.driver_id = d.id AND ds.customer_id IS NULL AND d.customer_id IS NOT NULL;
