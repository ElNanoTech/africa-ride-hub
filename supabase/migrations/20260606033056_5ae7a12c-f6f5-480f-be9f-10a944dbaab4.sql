
-- ============================================================
-- PHASE 4: MAINTENANCE MODULE
-- ============================================================

-- 1. Providers (workshops, garages)
CREATE TABLE public.maintenance_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  specialty TEXT,
  rating NUMERIC(2,1),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_providers TO authenticated;
GRANT ALL ON public.maintenance_providers TO service_role;
ALTER TABLE public.maintenance_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage tenant providers" ON public.maintenance_providers
  FOR ALL TO authenticated
  USING (is_platform_owner() OR (is_admin() AND (customer_id = current_customer_id() OR current_customer_id() IS NULL)))
  WITH CHECK (is_platform_owner() OR (is_admin() AND (customer_id = current_customer_id() OR current_customer_id() IS NULL)));

-- 2. Maintenance orders
CREATE TABLE public.maintenance_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID,
  vehicle_id UUID NOT NULL,
  provider_id UUID REFERENCES public.maintenance_providers(id) ON DELETE SET NULL,
  order_number TEXT,
  order_type TEXT NOT NULL DEFAULT 'repair', -- repair, service, inspection, tire, body, other
  status TEXT NOT NULL DEFAULT 'draft', -- draft, to_validate, in_progress, completed, cancelled
  priority TEXT NOT NULL DEFAULT 'normal', -- low, normal, high, urgent
  description TEXT,
  diagnosis TEXT,
  scheduled_date DATE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  estimated_cost INTEGER NOT NULL DEFAULT 0,
  actual_cost INTEGER NOT NULL DEFAULT 0,
  mileage_km INTEGER,
  created_by UUID,
  validated_by UUID,
  validated_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_orders TO authenticated;
GRANT ALL ON public.maintenance_orders TO service_role;
ALTER TABLE public.maintenance_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage tenant orders" ON public.maintenance_orders
  FOR ALL TO authenticated
  USING (is_platform_owner() OR (is_admin() AND (customer_id = current_customer_id() OR current_customer_id() IS NULL)))
  WITH CHECK (is_platform_owner() OR (is_admin() AND (customer_id = current_customer_id() OR current_customer_id() IS NULL)));
CREATE INDEX idx_maintenance_orders_vehicle ON public.maintenance_orders(vehicle_id);
CREATE INDEX idx_maintenance_orders_status ON public.maintenance_orders(status);
CREATE INDEX idx_maintenance_orders_customer ON public.maintenance_orders(customer_id);

-- 3. Line items
CREATE TABLE public.maintenance_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.maintenance_orders(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_cost INTEGER NOT NULL DEFAULT 0,
  item_type TEXT NOT NULL DEFAULT 'part', -- part, labor, fee
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_order_items TO authenticated;
GRANT ALL ON public.maintenance_order_items TO service_role;
ALTER TABLE public.maintenance_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage tenant order items" ON public.maintenance_order_items
  FOR ALL TO authenticated
  USING (
    is_platform_owner() OR (is_admin() AND EXISTS (
      SELECT 1 FROM public.maintenance_orders o
      WHERE o.id = maintenance_order_items.order_id
      AND (o.customer_id = current_customer_id() OR current_customer_id() IS NULL)
    ))
  )
  WITH CHECK (
    is_platform_owner() OR (is_admin() AND EXISTS (
      SELECT 1 FROM public.maintenance_orders o
      WHERE o.id = maintenance_order_items.order_id
      AND (o.customer_id = current_customer_id() OR current_customer_id() IS NULL)
    ))
  );
CREATE INDEX idx_mo_items_order ON public.maintenance_order_items(order_id);

-- 4. Other charges (insurance, sub-rentals, etc.)
CREATE TABLE public.other_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID,
  vehicle_id UUID,
  charge_type TEXT NOT NULL, -- insurance, sub_rental, tax, registration, other
  label TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  charge_date DATE NOT NULL DEFAULT CURRENT_DATE,
  period_start DATE,
  period_end DATE,
  provider_name TEXT,
  reference TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.other_charges TO authenticated;
GRANT ALL ON public.other_charges TO service_role;
ALTER TABLE public.other_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage tenant other charges" ON public.other_charges
  FOR ALL TO authenticated
  USING (is_platform_owner() OR (is_admin() AND (customer_id = current_customer_id() OR current_customer_id() IS NULL)))
  WITH CHECK (is_platform_owner() OR (is_admin() AND (customer_id = current_customer_id() OR current_customer_id() IS NULL)));
CREATE INDEX idx_other_charges_vehicle ON public.other_charges(vehicle_id);
CREATE INDEX idx_other_charges_customer ON public.other_charges(customer_id);

-- updated_at triggers (reuse existing update_updated_at_column function)
CREATE TRIGGER trg_mp_updated_at BEFORE UPDATE ON public.maintenance_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_mo_updated_at BEFORE UPDATE ON public.maintenance_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_oc_updated_at BEFORE UPDATE ON public.other_charges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- SECURITY: Tenant-scope admin access on kyc_submissions, loans, payments
-- ============================================================

-- KYC submissions
DROP POLICY IF EXISTS "Admins can view all KYC" ON public.kyc_submissions;
DROP POLICY IF EXISTS "Admins can update KYC" ON public.kyc_submissions;
CREATE POLICY "Admins can view all KYC" ON public.kyc_submissions
  FOR SELECT TO authenticated
  USING (is_platform_owner() OR (is_admin(auth.uid()) AND customer_id = current_customer_id()));
CREATE POLICY "Admins can update KYC" ON public.kyc_submissions
  FOR UPDATE TO authenticated
  USING (is_platform_owner() OR (is_admin(auth.uid()) AND customer_id = current_customer_id()));

-- Loans
DROP POLICY IF EXISTS "admin deletes loans" ON public.loans;
DROP POLICY IF EXISTS "driver views own loans" ON public.loans;
DROP POLICY IF EXISTS "loan staff manages loans" ON public.loans;
CREATE POLICY "admin deletes loans" ON public.loans
  FOR DELETE TO authenticated
  USING (is_platform_owner() OR (has_admin_role_in(ARRAY['super_admin','manager']) AND customer_id = current_customer_id()));
CREATE POLICY "driver views own loans" ON public.loans
  FOR SELECT TO authenticated
  USING (
    driver_id = current_driver_id()
    OR is_platform_owner()
    OR (is_admin() AND customer_id = current_customer_id())
  );
CREATE POLICY "loan staff manages loans" ON public.loans
  FOR UPDATE TO authenticated
  USING (is_platform_owner() OR (has_admin_role_in(ARRAY['super_admin','manager','agent_pret']) AND customer_id = current_customer_id()))
  WITH CHECK (is_platform_owner() OR (has_admin_role_in(ARRAY['super_admin','manager','agent_pret']) AND customer_id = current_customer_id()));

-- Payments
DROP POLICY IF EXISTS "admin manages payments" ON public.payments;
DROP POLICY IF EXISTS "driver views own payments" ON public.payments;
CREATE POLICY "admin manages payments" ON public.payments
  FOR ALL TO authenticated
  USING (is_platform_owner() OR (has_admin_role_in(ARRAY['super_admin','manager']) AND customer_id = current_customer_id()))
  WITH CHECK (is_platform_owner() OR (has_admin_role_in(ARRAY['super_admin','manager']) AND customer_id = current_customer_id()));
CREATE POLICY "driver views own payments" ON public.payments
  FOR SELECT TO authenticated
  USING (
    driver_id = current_driver_id()
    OR is_platform_owner()
    OR (is_admin() AND customer_id = current_customer_id())
  );
