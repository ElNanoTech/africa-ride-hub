
-- 1. Default new score = 650
ALTER TABLE public.driver_scores ALTER COLUMN current_score SET DEFAULT 650;

-- 2. Auto-seed score row on driver insert
CREATE OR REPLACE FUNCTION public.seed_driver_initial_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.driver_scores (driver_id, customer_id, current_score)
  VALUES (NEW.id, NEW.customer_id, 650)
  ON CONFLICT (customer_id, driver_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_driver_initial_score ON public.drivers;
CREATE TRIGGER trg_seed_driver_initial_score
AFTER INSERT ON public.drivers
FOR EACH ROW EXECUTE FUNCTION public.seed_driver_initial_score();

-- 3. Seed canonical 6-factor scoring_config (idempotent upserts)
INSERT INTO public.scoring_config (config_key, config_value, description)
VALUES
  ('weights',
   '{"payment_history":25,"driving_behavior":25,"income_stability":10,"sinistralite":15,"infractions":10,"credit":15}'::jsonb,
   'KIRA 6-factor weights (Phase 12)')
ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = now();

INSERT INTO public.scoring_config (config_key, config_value, description)
VALUES
  ('tier_thresholds',
   '{"platinum":800,"gold":650,"silver":500,"bronze":300}'::jsonb,
   'Canonical grade thresholds A800/B650/C500/D300 (Phase 12)')
ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = now();

INSERT INTO public.scoring_config (config_key, config_value, description)
VALUES
  ('base_score',
   '{"floor":500,"default":700,"new_driver":650}'::jsonb,
   'Score base 0-1000 (Phase 12)')
ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = now();

-- 4. Security finding fix: scope WITH CHECK to current tenant
DROP POLICY IF EXISTS "admins manage scores" ON public.driver_scores;
CREATE POLICY "admins manage scores" ON public.driver_scores
FOR ALL
USING (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin'::text, 'manager'::text])
      AND ((customer_id = current_customer_id()) OR (current_customer_id() IS NULL)))
)
WITH CHECK (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin'::text, 'manager'::text])
      AND ((customer_id = current_customer_id()) OR (current_customer_id() IS NULL)))
);
