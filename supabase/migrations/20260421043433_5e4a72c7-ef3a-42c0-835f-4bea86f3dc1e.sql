CREATE OR REPLACE FUNCTION public.apply_driver_score_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure a driver_scores row exists for this driver
  IF NOT EXISTS (SELECT 1 FROM public.driver_scores WHERE driver_id = NEW.driver_id) THEN
    INSERT INTO public.driver_scores (driver_id, customer_id, current_score)
    VALUES (NEW.driver_id, NEW.customer_id, 1000);
  END IF;

  -- Apply delta and clamp 0..1000
  UPDATE public.driver_scores
  SET current_score = GREATEST(0, LEAST(1000, current_score + NEW.delta)),
      updated_at = now()
  WHERE driver_id = NEW.driver_id;

  RETURN NEW;
END;
$$;