CREATE OR REPLACE FUNCTION public.apply_driver_score_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure a driver_scores row exists (one per driver — customer_id may be null)
  INSERT INTO public.driver_scores (driver_id, customer_id, current_score)
  VALUES (NEW.driver_id, NEW.customer_id, 1000)
  ON CONFLICT (customer_id, driver_id) DO NOTHING;

  -- Apply delta and clamp 0..1000 (no RETURNING — avoids multi-row issues)
  UPDATE public.driver_scores
  SET current_score = GREATEST(0, LEAST(1000, current_score + NEW.delta)),
      updated_at = now()
  WHERE driver_id = NEW.driver_id;

  RETURN NEW;
END;
$$;