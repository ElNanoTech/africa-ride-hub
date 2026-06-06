
-- =========================================================
-- Phase 3.5: Fleet Control inspections + tenant security fixes
-- =========================================================

-- ---------- vehicle_inspections ----------
CREATE TABLE IF NOT EXISTS public.vehicle_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','validated','rejected','expired')),
  due_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  submitted_at TIMESTAMPTZ,
  validated_at TIMESTAMPTZ,
  validated_by UUID,
  rejection_reason TEXT,
  reminder_count INTEGER NOT NULL DEFAULT 0,
  last_reminder_at TIMESTAMPTZ,
  immobilized_at TIMESTAMPTZ,
  immobilization_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_inspections TO authenticated;
GRANT ALL ON public.vehicle_inspections TO service_role;
ALTER TABLE public.vehicle_inspections ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_vinsp_vehicle ON public.vehicle_inspections(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vinsp_driver ON public.vehicle_inspections(driver_id);
CREATE INDEX IF NOT EXISTS idx_vinsp_customer_status ON public.vehicle_inspections(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_vinsp_due ON public.vehicle_inspections(due_at);

CREATE POLICY "platform owners manage inspections"
ON public.vehicle_inspections FOR ALL TO authenticated
USING (public.is_platform_owner())
WITH CHECK (public.is_platform_owner());

CREATE POLICY "customer admins manage tenant inspections"
ON public.vehicle_inspections FOR ALL TO authenticated
USING (public.is_admin() AND customer_id = public.current_customer_id())
WITH CHECK (public.is_admin() AND customer_id = public.current_customer_id());

CREATE POLICY "drivers view own inspections"
ON public.vehicle_inspections FOR SELECT TO authenticated
USING (driver_id = public.current_driver_id());

CREATE POLICY "drivers insert own inspections"
ON public.vehicle_inspections FOR INSERT TO authenticated
WITH CHECK (driver_id = public.current_driver_id());

CREATE POLICY "drivers update own draft inspections"
ON public.vehicle_inspections FOR UPDATE TO authenticated
USING (driver_id = public.current_driver_id() AND status IN ('draft','submitted','rejected'))
WITH CHECK (driver_id = public.current_driver_id());

DROP TRIGGER IF EXISTS trg_vinsp_updated_at ON public.vehicle_inspections;
CREATE TRIGGER trg_vinsp_updated_at
BEFORE UPDATE ON public.vehicle_inspections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- vehicle_inspection_photos ----------
CREATE TABLE IF NOT EXISTS public.vehicle_inspection_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES public.vehicle_inspections(id) ON DELETE CASCADE,
  zone TEXT NOT NULL CHECK (zone IN ('front','rear','left','right','dash','interior','tires')),
  storage_path TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (inspection_id, zone)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_inspection_photos TO authenticated;
GRANT ALL ON public.vehicle_inspection_photos TO service_role;
ALTER TABLE public.vehicle_inspection_photos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_vinsp_photos_inspection ON public.vehicle_inspection_photos(inspection_id);

CREATE POLICY "platform owners manage inspection photos"
ON public.vehicle_inspection_photos FOR ALL TO authenticated
USING (public.is_platform_owner())
WITH CHECK (public.is_platform_owner());

CREATE POLICY "customer admins manage tenant inspection photos"
ON public.vehicle_inspection_photos FOR ALL TO authenticated
USING (
  public.is_admin() AND EXISTS (
    SELECT 1 FROM public.vehicle_inspections vi
    WHERE vi.id = vehicle_inspection_photos.inspection_id
      AND vi.customer_id = public.current_customer_id()
  )
)
WITH CHECK (
  public.is_admin() AND EXISTS (
    SELECT 1 FROM public.vehicle_inspections vi
    WHERE vi.id = vehicle_inspection_photos.inspection_id
      AND vi.customer_id = public.current_customer_id()
  )
);

CREATE POLICY "drivers manage own inspection photos"
ON public.vehicle_inspection_photos FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.vehicle_inspections vi
    WHERE vi.id = vehicle_inspection_photos.inspection_id
      AND vi.driver_id = public.current_driver_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.vehicle_inspections vi
    WHERE vi.id = vehicle_inspection_photos.inspection_id
      AND vi.driver_id = public.current_driver_id()
  )
);

DROP TRIGGER IF EXISTS trg_vinsp_photos_updated_at ON public.vehicle_inspection_photos;
CREATE TRIGGER trg_vinsp_photos_updated_at
BEFORE UPDATE ON public.vehicle_inspection_photos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- vehicle_immobilization_commands ----------
CREATE TABLE IF NOT EXISTS public.vehicle_immobilization_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  inspection_id UUID REFERENCES public.vehicle_inspections(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','acknowledged','failed','cancelled')),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','auto_overdue','auto_reminder','other')),
  requested_by UUID,
  reason TEXT,
  sent_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_immobilization_commands TO authenticated;
GRANT ALL ON public.vehicle_immobilization_commands TO service_role;
ALTER TABLE public.vehicle_immobilization_commands ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_vic_vehicle ON public.vehicle_immobilization_commands(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vic_status ON public.vehicle_immobilization_commands(status);

CREATE POLICY "platform owners manage commands"
ON public.vehicle_immobilization_commands FOR ALL TO authenticated
USING (public.is_platform_owner())
WITH CHECK (public.is_platform_owner());

CREATE POLICY "customer admins manage tenant commands"
ON public.vehicle_immobilization_commands FOR ALL TO authenticated
USING (public.is_admin() AND customer_id = public.current_customer_id())
WITH CHECK (public.is_admin() AND customer_id = public.current_customer_id());

DROP TRIGGER IF EXISTS trg_vic_updated_at ON public.vehicle_immobilization_commands;
CREATE TRIGGER trg_vic_updated_at
BEFORE UPDATE ON public.vehicle_immobilization_commands
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Security fixes: tenant-scope existing policies
-- =========================================================

-- credit_scores: remove unscoped admin branch from driver SELECT policy
DROP POLICY IF EXISTS "driver views own scores" ON public.credit_scores;
CREATE POLICY "driver views own scores"
ON public.credit_scores FOR SELECT TO authenticated
USING (driver_id = public.current_driver_id());

-- driver_scores: drop unscoped admin policies; tenant-scoped ones remain
DROP POLICY IF EXISTS "Admins read driver scores" ON public.driver_scores;
DROP POLICY IF EXISTS "System manages driver scores" ON public.driver_scores;

CREATE POLICY "service role manages driver scores"
ON public.driver_scores FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- drivers: scope admin access by customer_id
DROP POLICY IF EXISTS "admin manages drivers" ON public.drivers;
CREATE POLICY "admin manages drivers"
ON public.drivers FOR ALL TO authenticated
USING (
  public.is_platform_owner()
  OR (public.is_admin() AND customer_id = public.current_customer_id())
)
WITH CHECK (
  public.is_platform_owner()
  OR (public.is_admin() AND customer_id = public.current_customer_id())
);

DROP POLICY IF EXISTS "driver reads own profile" ON public.drivers;
CREATE POLICY "driver reads own profile"
ON public.drivers FOR SELECT TO authenticated
USING (
  auth_user_id = auth.uid()
  OR user_id = auth.uid()
  OR public.is_platform_owner()
  OR (public.is_admin() AND customer_id = public.current_customer_id())
);
