-- =========================================================
-- Migration 1: Seed initial credit score (20260418181500)
-- =========================================================

CREATE OR REPLACE FUNCTION public.seed_initial_credit_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.credit_scores (
    driver_id, score, tier, status, calculation_week,
    driving_data_available, payment_data_available, income_data_available,
    customer_id
  )
  VALUES (
    NEW.id, 500, 'C', 'provisional',
    date_trunc('week', NOW())::date,
    FALSE, FALSE, FALSE,
    NEW.customer_id
  )
  ON CONFLICT (driver_id, calculation_week) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_initial_credit_score ON public.drivers;
CREATE TRIGGER trg_seed_initial_credit_score
  AFTER INSERT ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.seed_initial_credit_score();

INSERT INTO public.credit_scores (
  driver_id, score, tier, status, calculation_week,
  driving_data_available, payment_data_available, income_data_available,
  customer_id
)
SELECT
  d.id, 500, 'C', 'provisional',
  date_trunc('week', NOW())::date,
  FALSE, FALSE, FALSE,
  d.customer_id
FROM public.drivers d
WHERE NOT EXISTS (
  SELECT 1 FROM public.credit_scores cs WHERE cs.driver_id = d.id
)
ON CONFLICT (driver_id, calculation_week) DO NOTHING;

-- =========================================================
-- Migration 2: score_events + displayed_score (20260418200000)
-- =========================================================

INSERT INTO public.platform_settings (setting_key, setting_value, description)
VALUES (
  'default_driver_base_score',
  '500'::jsonb,
  'Starting credit score for new drivers (Spec 5.1). Editable by Super Admin.'
)
ON CONFLICT (setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.score_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  score_delta integer NOT NULL,
  reason text NOT NULL,
  source text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_score_events_driver ON public.score_events(driver_id);
CREATE INDEX IF NOT EXISTS idx_score_events_created ON public.score_events(created_at);

ALTER TABLE public.score_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Drivers view own score events" ON public.score_events;
CREATE POLICY "Drivers view own score events"
  ON public.score_events FOR SELECT
  USING (driver_id = public.get_driver_id(auth.uid()));

DROP POLICY IF EXISTS "Admins manage score events" ON public.score_events;
CREATE POLICY "Admins manage score events"
  ON public.score_events FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.get_driver_displayed_score(p_driver_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(0, LEAST(1000,
    COALESCE(
      (SELECT (setting_value #>> '{}')::integer
       FROM public.platform_settings
       WHERE setting_key = 'default_driver_base_score'),
      500
    )
    + COALESCE(
        (SELECT SUM(score_delta)::integer
         FROM public.score_events
         WHERE driver_id = p_driver_id),
        0
      )
  ));
$$;

GRANT EXECUTE ON FUNCTION public.get_driver_displayed_score(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.seed_initial_credit_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_score integer;
  v_tier text;
BEGIN
  v_base_score := COALESCE(
    (SELECT (setting_value #>> '{}')::integer
     FROM public.platform_settings
     WHERE setting_key = 'default_driver_base_score'),
    500
  );

  v_tier := CASE
    WHEN v_base_score >= 800 THEN 'A'
    WHEN v_base_score >= 650 THEN 'B'
    WHEN v_base_score >= 500 THEN 'C'
    WHEN v_base_score >= 300 THEN 'D'
    ELSE 'E'
  END;

  INSERT INTO public.credit_scores (
    driver_id, score, tier, status, calculation_week,
    driving_data_available, payment_data_available, income_data_available,
    customer_id
  )
  VALUES (
    NEW.id, v_base_score, v_tier, 'active',
    date_trunc('week', NOW())::date,
    FALSE, FALSE, FALSE,
    NEW.customer_id
  )
  ON CONFLICT (driver_id, calculation_week) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_initial_credit_score ON public.drivers;
CREATE TRIGGER trg_seed_initial_credit_score
  AFTER INSERT ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.seed_initial_credit_score();

UPDATE public.credit_scores
SET status = 'active'
WHERE status = 'provisional'
  AND driving_impact IS NULL
  AND payment_impact IS NULL
  AND income_impact IS NULL
  AND driving_data_available = FALSE
  AND payment_data_available = FALSE
  AND income_data_available = FALSE;

DO $$
DECLARE
  v_base_score integer;
  v_tier text;
BEGIN
  v_base_score := COALESCE(
    (SELECT (setting_value #>> '{}')::integer
     FROM public.platform_settings
     WHERE setting_key = 'default_driver_base_score'),
    500
  );

  v_tier := CASE
    WHEN v_base_score >= 800 THEN 'A'
    WHEN v_base_score >= 650 THEN 'B'
    WHEN v_base_score >= 500 THEN 'C'
    WHEN v_base_score >= 300 THEN 'D'
    ELSE 'E'
  END;

  INSERT INTO public.credit_scores (
    driver_id, score, tier, status, calculation_week,
    driving_data_available, payment_data_available, income_data_available,
    customer_id
  )
  SELECT
    d.id, v_base_score, v_tier, 'active',
    date_trunc('week', NOW())::date,
    FALSE, FALSE, FALSE,
    d.customer_id
  FROM public.drivers d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.credit_scores cs WHERE cs.driver_id = d.id
  )
  ON CONFLICT (driver_id, calculation_week) DO NOTHING;
END $$;