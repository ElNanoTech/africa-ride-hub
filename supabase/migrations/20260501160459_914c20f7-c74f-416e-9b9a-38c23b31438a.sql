-- 1) Single-tenant: assign DAM Africa to orphan vehicles
UPDATE public.vehicles
SET customer_id = '57f6a536-a023-477d-b2a8-8eaf27e632e2'
WHERE customer_id IS NULL;

-- 2) Stamp vehicles.uffizio_device_id with the raw vehicle_no so autostamp trigger matches
WITH norm AS (
  SELECT DISTINCT
    vp.vehicle_no AS raw_no,
    REGEXP_REPLACE(
      UPPER(TRIM(REGEXP_REPLACE(vp.vehicle_no, '^(DZIRE|ALTO|SUZUKI CARGO|SUZUKI|CARRY)\s+', '', 'i'))),
      '\s+NLOOTTO\s+\d+$', ''
    ) AS norm_plate
  FROM public.vehicle_positions vp
  WHERE vp.vehicle_no IS NOT NULL
),
matches AS (
  SELECT DISTINCT ON (n.raw_no)
    n.raw_no,
    v.id AS vehicle_id
  FROM norm n
  JOIN public.vehicles v
    ON UPPER(TRIM(v.license_plate)) = n.norm_plate
    OR UPPER(TRIM(v.license_plate)) = n.norm_plate || '-01'
  WHERE v.uffizio_device_id IS DISTINCT FROM n.raw_no
  ORDER BY n.raw_no, v.created_at
)
UPDATE public.vehicles v
SET uffizio_device_id = m.raw_no,
    gps_active = true
FROM matches m
WHERE v.id = m.vehicle_id;

-- 3) Backfill customer_id on vehicle_positions
UPDATE public.vehicle_positions vp
SET customer_id = v.customer_id
FROM public.vehicles v
WHERE vp.customer_id IS NULL
  AND v.uffizio_device_id = vp.vehicle_no
  AND v.customer_id IS NOT NULL;

-- 4) Backfill customer_id on vehicle_location_history (joined by vehicle_no like positions)
UPDATE public.vehicle_location_history h
SET customer_id = v.customer_id
FROM public.vehicles v
WHERE h.customer_id IS NULL
  AND v.uffizio_device_id = h.vehicle_no
  AND v.customer_id IS NOT NULL;