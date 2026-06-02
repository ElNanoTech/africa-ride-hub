
-- =====================================================
-- Phase 1: Rent-to-Own Contracts Schema
-- =====================================================

-- Main contracts table
CREATE TABLE public.rent_to_own_contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id),
  customer_id UUID REFERENCES public.customers(id),
  
  -- Contract terms
  total_price INTEGER NOT NULL, -- Total vehicle price in FCFA
  weekly_payment INTEGER NOT NULL, -- Weekly payment amount
  contract_duration_weeks INTEGER NOT NULL DEFAULT 156, -- 3 years = 156 weeks
  start_date DATE NOT NULL,
  expected_end_date DATE NOT NULL,
  
  -- Progress tracking
  total_paid INTEGER NOT NULL DEFAULT 0,
  weeks_completed INTEGER NOT NULL DEFAULT 0,
  ownership_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'completed', 'defaulted', 'cancelled')),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Milestones table for gamification
CREATE TABLE public.contract_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.rent_to_own_contracts(id) ON DELETE CASCADE,
  milestone_type TEXT NOT NULL, -- '25_percent', '50_percent', '75_percent', '100_percent', 'year_1', 'year_2', 'year_3'
  milestone_label TEXT NOT NULL,
  target_value NUMERIC NOT NULL,
  reached_at TIMESTAMP WITH TIME ZONE,
  reward_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Payment history for contracts
CREATE TABLE public.contract_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.rent_to_own_contracts(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  week_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'late', 'missed', 'partial')),
  wave_transaction_id TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_rto_contracts_driver ON public.rent_to_own_contracts(driver_id);
CREATE INDEX idx_rto_contracts_vehicle ON public.rent_to_own_contracts(vehicle_id);
CREATE INDEX idx_rto_contracts_customer ON public.rent_to_own_contracts(customer_id);
CREATE INDEX idx_rto_contracts_status ON public.rent_to_own_contracts(status);
CREATE INDEX idx_contract_payments_contract ON public.contract_payments(contract_id);
CREATE INDEX idx_contract_milestones_contract ON public.contract_milestones(contract_id);

-- RLS
ALTER TABLE public.rent_to_own_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_payments ENABLE ROW LEVEL SECURITY;

-- Contracts policies
CREATE POLICY "Drivers view own contracts" ON public.rent_to_own_contracts
  FOR SELECT USING (driver_id = current_driver_id() OR is_admin());

CREATE POLICY "Admins manage contracts" ON public.rent_to_own_contracts
  FOR ALL USING (has_admin_role_in(ARRAY['super_admin', 'manager']))
  WITH CHECK (has_admin_role_in(ARRAY['super_admin', 'manager']));

-- Milestones policies
CREATE POLICY "Drivers view own milestones" ON public.contract_milestones
  FOR SELECT USING (contract_id IN (
    SELECT id FROM public.rent_to_own_contracts WHERE driver_id = current_driver_id()
  ) OR is_admin());

CREATE POLICY "Admins manage milestones" ON public.contract_milestones
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Payments policies
CREATE POLICY "Drivers view own contract payments" ON public.contract_payments
  FOR SELECT USING (contract_id IN (
    SELECT id FROM public.rent_to_own_contracts WHERE driver_id = current_driver_id()
  ) OR is_admin());

CREATE POLICY "Admins manage contract payments" ON public.contract_payments
  FOR ALL USING (has_admin_role_in(ARRAY['super_admin', 'manager']))
  WITH CHECK (has_admin_role_in(ARRAY['super_admin', 'manager']));

-- Updated_at trigger
CREATE TRIGGER update_rto_contracts_updated_at
  BEFORE UPDATE ON public.rent_to_own_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Feature flags for rent-to-own premium features
INSERT INTO public.feature_flags (flag_key, flag_value, description, category, is_platform_only) VALUES
  ('rent_to_own_tracker', false, 'Suivi Rent-to-Own: progression de propriété, jalons, équité', 'finance', false),
  ('rent_to_own_milestones', false, 'Jalons gamifiés du parcours Rent-to-Own avec récompenses', 'gamification', false),
  ('mechanic_shop', false, 'Module atelier mécanique: réservations, historique maintenance', 'fleet', false),
  ('vehicle_marketplace', false, 'Place de marché véhicules: achat/vente/échange post-propriété', 'finance', false),
  ('maintenance_wallet', false, 'Portefeuille maintenance: épargne automatique pour réparations', 'finance', false),
  ('vehicle_health_score', false, 'Score santé véhicule basé sur historique maintenance et conduite', 'fleet', false);
