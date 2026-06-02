CREATE OR REPLACE FUNCTION public.recompute_driver_current_score(p_driver_id uuid, p_customer_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_score integer;
  v_total_delta integer;
  v_score integer;
BEGIN
  v_base_score := COALESCE(
    (SELECT (setting_value #>> '{}')::integer
     FROM public.platform_settings
     WHERE setting_key = 'default_driver_base_score'),
    500
  );

  SELECT COALESCE(SUM(delta), 0)::integer
    INTO v_total_delta
  FROM public.driver_score_events
  WHERE driver_id = p_driver_id;

  v_score := GREATEST(0, LEAST(1000, v_base_score + v_total_delta));

  UPDATE public.driver_scores
  SET current_score = v_score,
      customer_id = COALESCE(p_customer_id, customer_id),
      updated_at = now()
  WHERE driver_id = p_driver_id;

  IF NOT FOUND THEN
    INSERT INTO public.driver_scores (driver_id, customer_id, current_score)
    VALUES (p_driver_id, p_customer_id, v_score);
  END IF;

  RETURN v_score;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_driver_score_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_driver_current_score(NEW.driver_id, NEW.customer_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_driver_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_score integer;
BEGIN
  v_base_score := COALESCE(
    (SELECT (setting_value #>> '{}')::integer
     FROM public.platform_settings
     WHERE setting_key = 'default_driver_base_score'),
    500
  );

  UPDATE public.driver_scores
  SET current_score = v_base_score,
      customer_id = COALESCE(NEW.customer_id, customer_id),
      updated_at = now()
  WHERE driver_id = NEW.id;

  IF NOT FOUND THEN
    INSERT INTO public.driver_scores(customer_id, driver_id, current_score)
    VALUES (NEW.customer_id, NEW.id, v_base_score);
  END IF;

  RETURN NEW;
END;
$$;

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
  v_new_score := public.recompute_driver_current_score(NEW.driver_id, NEW.customer_id);

  v_tier := CASE
    WHEN v_new_score >= 800 THEN 'A'
    WHEN v_new_score >= 650 THEN 'B'
    WHEN v_new_score >= 500 THEN 'C'
    WHEN v_new_score >= 300 THEN 'D'
    ELSE 'E'
  END;

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
        tier = EXCLUDED.tier,
        status = 'active';

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT d.id AS driver_id, d.customer_id
    FROM public.drivers d
  LOOP
    PERFORM public.recompute_driver_current_score(r.driver_id, r.customer_id);
  END LOOP;
END $$;

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
  false,
  false,
  false
FROM public.driver_scores ds
ON CONFLICT (driver_id, calculation_week) DO UPDATE
SET score = EXCLUDED.score,
    tier = EXCLUDED.tier,
    status = 'active';