-- 1. Add voice note URL on accidents
ALTER TABLE public.accidents
  ADD COLUMN IF NOT EXISTS voice_note_url text,
  ADD COLUMN IF NOT EXISTS voice_note_storage_path text;

-- 2. Trigger to keep driver_scores.current_score in sync with driver_score_events
CREATE OR REPLACE FUNCTION public.apply_driver_score_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_score integer;
BEGIN
  -- Ensure a driver_scores row exists
  INSERT INTO public.driver_scores (driver_id, customer_id, current_score)
  VALUES (NEW.driver_id, NEW.customer_id, 1000)
  ON CONFLICT (customer_id, driver_id) DO NOTHING;

  -- Apply delta and clamp 0..1000
  UPDATE public.driver_scores
  SET current_score = GREATEST(0, LEAST(1000, current_score + NEW.delta)),
      updated_at = now()
  WHERE driver_id = NEW.driver_id
  RETURNING current_score INTO v_new_score;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_driver_score_event ON public.driver_score_events;
CREATE TRIGGER trg_apply_driver_score_event
AFTER INSERT ON public.driver_score_events
FOR EACH ROW
EXECUTE FUNCTION public.apply_driver_score_event();

-- 3. Backfill driver_scores from existing score events (for any drivers that
--    have events but no/desynced current_score row).
INSERT INTO public.driver_scores (driver_id, customer_id, current_score)
SELECT DISTINCT e.driver_id, e.customer_id, 1000
FROM public.driver_score_events e
ON CONFLICT (customer_id, driver_id) DO NOTHING;

UPDATE public.driver_scores ds
SET current_score = GREATEST(0, LEAST(1000, 1000 + COALESCE(agg.total_delta, 0))),
    updated_at = now()
FROM (
  SELECT driver_id, SUM(delta)::int AS total_delta
  FROM public.driver_score_events
  GROUP BY driver_id
) agg
WHERE ds.driver_id = agg.driver_id;

-- 4. RLS for driver_scores so drivers can read their own + admins can read all
ALTER TABLE public.driver_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers read own current score" ON public.driver_scores;
CREATE POLICY "Drivers read own current score"
ON public.driver_scores
FOR SELECT
USING (driver_id = public.current_driver_id());

DROP POLICY IF EXISTS "Admins read driver scores" ON public.driver_scores;
CREATE POLICY "Admins read driver scores"
ON public.driver_scores
FOR SELECT
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "System manages driver scores" ON public.driver_scores;
CREATE POLICY "System manages driver scores"
ON public.driver_scores
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));