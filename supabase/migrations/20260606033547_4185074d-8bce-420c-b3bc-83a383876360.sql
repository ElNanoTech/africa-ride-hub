
-- ============================================================
-- PHASE 5: TRAFFIC VIOLATIONS (CONTRAVENTIONS)
-- ============================================================

CREATE TABLE public.traffic_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID,
  vehicle_id UUID,
  driver_id UUID,
  rental_id UUID,
  pv_number TEXT,
  license_plate TEXT NOT NULL,
  violation_type TEXT NOT NULL,
  violation_date TIMESTAMPTZ NOT NULL,
  location TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'XOF',
  status TEXT NOT NULL DEFAULT 'pending_payment', -- pending_payment, paid, contested, cancelled, liquidated
  payment_due_date DATE,
  paid_at TIMESTAMPTZ,
  payment_reference TEXT,
  source TEXT NOT NULL DEFAULT 'manual', -- cgi_portal, manual, import
  pdf_url TEXT,
  raw_data JSONB,
  attribution_method TEXT, -- rental, gps_history, manual, unassigned
  gps_matched BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  synced_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.traffic_violations TO authenticated;
GRANT ALL ON public.traffic_violations TO service_role;
ALTER TABLE public.traffic_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage tenant violations" ON public.traffic_violations
  FOR ALL TO authenticated
  USING (is_platform_owner() OR (is_admin() AND (customer_id = current_customer_id() OR current_customer_id() IS NULL)))
  WITH CHECK (is_platform_owner() OR (is_admin() AND (customer_id = current_customer_id() OR current_customer_id() IS NULL)));

CREATE POLICY "drivers view own violations" ON public.traffic_violations
  FOR SELECT TO authenticated
  USING (driver_id = current_driver_id());

CREATE INDEX idx_traffic_violations_plate ON public.traffic_violations(license_plate);
CREATE INDEX idx_traffic_violations_vehicle ON public.traffic_violations(vehicle_id);
CREATE INDEX idx_traffic_violations_driver ON public.traffic_violations(driver_id);
CREATE INDEX idx_traffic_violations_status ON public.traffic_violations(status);
CREATE INDEX idx_traffic_violations_customer ON public.traffic_violations(customer_id);
CREATE UNIQUE INDEX uq_traffic_violations_pv ON public.traffic_violations(pv_number) WHERE pv_number IS NOT NULL;

CREATE TRIGGER trg_tv_updated_at BEFORE UPDATE ON public.traffic_violations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- SECURITY FIXES
-- ============================================================

-- 1. accident-evidence bucket: scope by accident.customer_id
DROP POLICY IF EXISTS "admins manage tenant evidence" ON storage.objects;
DROP POLICY IF EXISTS "admins read tenant evidence" ON storage.objects;

CREATE POLICY "admins manage tenant evidence" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'accident-evidence'
    AND (
      is_platform_owner()
      OR (
        has_admin_role_in(ARRAY['super_admin','manager'])
        AND EXISTS (
          SELECT 1 FROM public.accidents a
          WHERE (a.id)::text = (storage.foldername(objects.name))[2]
            AND (a.customer_id = current_customer_id() OR current_customer_id() IS NULL)
        )
      )
    )
  )
  WITH CHECK (
    bucket_id = 'accident-evidence'
    AND (
      is_platform_owner()
      OR (
        has_admin_role_in(ARRAY['super_admin','manager'])
        AND EXISTS (
          SELECT 1 FROM public.accidents a
          WHERE (a.id)::text = (storage.foldername(objects.name))[2]
            AND (a.customer_id = current_customer_id() OR current_customer_id() IS NULL)
        )
      )
    )
  );

CREATE POLICY "admins read tenant evidence" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'accident-evidence'
    AND (
      is_platform_owner()
      OR (
        has_admin_role_in(ARRAY['super_admin','manager','support'])
        AND EXISTS (
          SELECT 1 FROM public.accidents a
          WHERE (a.id)::text = (storage.foldername(objects.name))[2]
            AND (a.customer_id = current_customer_id() OR current_customer_id() IS NULL)
        )
      )
    )
  );

-- 2. admin_users: remove NULL branch so customer admins can't see platform owners
DROP POLICY IF EXISTS "admins can read admin users" ON public.admin_users;
CREATE POLICY "admins can read admin users" ON public.admin_users
  FOR SELECT TO authenticated
  USING (
    is_platform_owner()
    OR (is_admin() AND customer_id IS NOT NULL AND customer_id = current_customer_id())
    OR user_id = auth.uid()
  );

-- 3. income_records: remove bare is_admin() branch
DROP POLICY IF EXISTS "Drivers can view own pending income" ON public.income_records;
CREATE POLICY "Drivers can view own pending income" ON public.income_records
  FOR SELECT TO authenticated
  USING (driver_id = current_driver_id());
