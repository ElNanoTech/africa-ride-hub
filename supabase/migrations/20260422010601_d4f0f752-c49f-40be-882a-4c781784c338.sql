
-- =========================================================
-- 1. Severity default → UNKNOWN
-- =========================================================
ALTER TABLE public.accidents
  ALTER COLUMN severity SET DEFAULT 'UNKNOWN';

-- =========================================================
-- 2. Helper: does the driver currently have an active rental?
-- =========================================================
CREATE OR REPLACE FUNCTION public.driver_has_active_rental(p_driver_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rentals r
    WHERE r.driver_id = p_driver_id
      AND r.status IN ('active','approved','paid','payment_overdue','overdue_return')
  );
$$;

-- =========================================================
-- 3. Replace driver INSERT policy on accidents to require an active rental
-- =========================================================
DROP POLICY IF EXISTS "drivers insert own accidents" ON public.accidents;

CREATE POLICY "drivers insert own accidents"
ON public.accidents
FOR INSERT
WITH CHECK (
  driver_id = public.current_driver_id()
  AND public.driver_has_active_rental(driver_id)
);

-- =========================================================
-- 4. Sync at-fault score event → credit_scores snapshot
--    so the driver-facing score gauge updates immediately.
-- =========================================================
CREATE OR REPLACE FUNCTION public.sync_credit_score_from_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_score integer;
  v_tier text;
  v_week date := date_trunc('week', NOW())::date;
BEGIN
  -- Read the new authoritative current_score (already updated by apply_driver_score_event)
  SELECT current_score INTO v_new_score
  FROM public.driver_scores
  WHERE driver_id = NEW.driver_id
  LIMIT 1;

  IF v_new_score IS NULL THEN
    RETURN NEW;
  END IF;

  v_tier := CASE
    WHEN v_new_score >= 800 THEN 'A'
    WHEN v_new_score >= 650 THEN 'B'
    WHEN v_new_score >= 500 THEN 'C'
    WHEN v_new_score >= 300 THEN 'D'
    ELSE 'E'
  END;

  -- Upsert the weekly snapshot the driver app actually reads.
  INSERT INTO public.credit_scores (
    driver_id, customer_id, score, tier, status,
    calculation_week, driving_data_available, payment_data_available, income_data_available
  )
  VALUES (
    NEW.driver_id, NEW.customer_id, v_new_score, v_tier, 'active',
    v_week, false, false, false
  )
  ON CONFLICT (driver_id, calculation_week) DO UPDATE
    SET score = EXCLUDED.score,
        tier  = EXCLUDED.tier,
        status = 'active';

  RETURN NEW;
END;
$$;

-- Run AFTER apply_driver_score_event so driver_scores.current_score is fresh
DROP TRIGGER IF EXISTS trg_sync_credit_score_from_event ON public.driver_score_events;
CREATE TRIGGER trg_sync_credit_score_from_event
AFTER INSERT ON public.driver_score_events
FOR EACH ROW
EXECUTE FUNCTION public.sync_credit_score_from_event();

-- =========================================================
-- 5. Backfill: for any driver who has score events but whose latest
--    credit_scores snapshot is out of sync, insert/update a snapshot.
-- =========================================================
INSERT INTO public.credit_scores (
  driver_id, customer_id, score, tier, status,
  calculation_week, driving_data_available, payment_data_available, income_data_available
)
SELECT
  ds.driver_id,
  ds.customer_id,
  ds.current_score,
  CASE
    WHEN ds.current_score >= 800 THEN 'A'
    WHEN ds.current_score >= 650 THEN 'B'
    WHEN ds.current_score >= 500 THEN 'C'
    WHEN ds.current_score >= 300 THEN 'D'
    ELSE 'E'
  END,
  'active',
  date_trunc('week', NOW())::date,
  false, false, false
FROM public.driver_scores ds
WHERE EXISTS (
  SELECT 1 FROM public.driver_score_events e WHERE e.driver_id = ds.driver_id
)
AND NOT EXISTS (
  SELECT 1 FROM public.credit_scores cs
  WHERE cs.driver_id = ds.driver_id
    AND cs.calculation_week = date_trunc('week', NOW())::date
    AND cs.score = ds.current_score
)
ON CONFLICT (driver_id, calculation_week) DO UPDATE
  SET score = EXCLUDED.score,
      tier  = EXCLUDED.tier,
      status = 'active';
