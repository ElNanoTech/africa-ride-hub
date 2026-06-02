-- Fix the legacy seed_driver_score trigger to use the platform-configured base score (500)
-- instead of the hardcoded 1000 value, keeping it in sync with credit_scores baseline.
CREATE OR REPLACE FUNCTION public.seed_driver_score()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base_score integer;
BEGIN
  v_base_score := COALESCE(
    (SELECT (setting_value #>> '{}')::integer
     FROM public.platform_settings
     WHERE setting_key = 'default_driver_base_score'),
    500
  );

  INSERT INTO public.driver_scores(customer_id, driver_id, current_score)
  VALUES (NEW.customer_id, NEW.id, v_base_score)
  ON CONFLICT (customer_id, driver_id) DO NOTHING;
  RETURN NEW;
END;
$function$;