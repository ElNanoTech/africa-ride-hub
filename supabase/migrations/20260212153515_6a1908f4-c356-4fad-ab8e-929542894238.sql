
-- Badge definitions table (system-managed)
CREATE TABLE public.badge_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  badge_key TEXT NOT NULL UNIQUE,
  name_fr TEXT NOT NULL,
  description_fr TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🏆',
  category TEXT NOT NULL DEFAULT 'general',
  milestone_type TEXT NOT NULL,
  milestone_value INTEGER NOT NULL DEFAULT 1,
  tier TEXT DEFAULT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Driver badges (earned badges)
CREATE TABLE public.driver_badges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES public.badge_definitions(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(driver_id, badge_id)
);

-- Enable RLS
ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_badges ENABLE ROW LEVEL SECURITY;

-- Badge definitions: everyone can read
CREATE POLICY "Anyone can view badge definitions"
  ON public.badge_definitions FOR SELECT
  USING (true);

CREATE POLICY "Admins manage badge definitions"
  ON public.badge_definitions FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Driver badges: drivers see own, admins see all
CREATE POLICY "Drivers view own badges"
  ON public.driver_badges FOR SELECT
  USING (driver_id = current_driver_id() OR is_admin());

CREATE POLICY "System can insert badges"
  ON public.driver_badges FOR INSERT
  WITH CHECK (driver_id = current_driver_id() OR is_admin());

CREATE POLICY "Drivers can mark badges seen"
  ON public.driver_badges FOR UPDATE
  USING (driver_id = current_driver_id())
  WITH CHECK (driver_id = current_driver_id());

CREATE POLICY "Admins manage driver badges"
  ON public.driver_badges FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Seed badge definitions
INSERT INTO public.badge_definitions (badge_key, name_fr, description_fr, icon, category, milestone_type, milestone_value, sort_order) VALUES
  ('first_login', 'Premier Pas', 'Première connexion à l''app', '👣', 'onboarding', 'login_count', 1, 1),
  ('streak_3', 'Régulier', '3 jours consécutifs', '🔥', 'streak', 'daily_streak', 3, 2),
  ('streak_7', 'Dévoué', '7 jours consécutifs', '⚡', 'streak', 'daily_streak', 7, 3),
  ('streak_14', 'Inarrêtable', '14 jours consécutifs', '💎', 'streak', 'daily_streak', 14, 4),
  ('streak_30', 'Légendaire', '30 jours consécutifs', '👑', 'streak', 'daily_streak', 30, 5),
  ('first_rental', 'Première Location', 'Premier véhicule loué', '🚗', 'rental', 'rental_count', 1, 6),
  ('payments_5', 'Payeur Fiable', '5 paiements à temps', '💰', 'payment', 'ontime_payments', 5, 7),
  ('payments_10', 'Payeur d''Or', '10 paiements à temps', '🥇', 'payment', 'ontime_payments', 10, 8),
  ('payments_25', 'Payeur Platine', '25 paiements à temps', '💎', 'payment', 'ontime_payments', 25, 9),
  ('tier_c', 'Tier C Atteint', 'Score suffisant pour Tier C', '🥉', 'score', 'tier_reached', 0, 10),
  ('tier_b', 'Tier B Atteint', 'Score suffisant pour Tier B', '🥈', 'score', 'tier_reached', 0, 11),
  ('tier_a', 'Tier A Atteint', 'Score maximum atteint!', '🥇', 'score', 'tier_reached', 0, 12),
  ('first_income', 'Premier Revenu', 'Premier revenu déclaré', '📊', 'income', 'income_count', 1, 13),
  ('kyc_approved', 'Vérifié', 'KYC approuvé avec succès', '✅', 'onboarding', 'kyc_approved', 1, 14);

-- Update tier for tier badges
UPDATE public.badge_definitions SET tier = 'C' WHERE badge_key = 'tier_c';
UPDATE public.badge_definitions SET tier = 'B' WHERE badge_key = 'tier_b';
UPDATE public.badge_definitions SET tier = 'A' WHERE badge_key = 'tier_a';
