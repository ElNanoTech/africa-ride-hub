
-- =========================================================
-- Phase 7: Communication module
-- =========================================================

-- Training modules
CREATE TABLE public.training_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'safety',
  video_url TEXT,
  thumbnail_url TEXT,
  content TEXT,
  duration_minutes INTEGER DEFAULT 0,
  order_index INTEGER DEFAULT 0,
  is_mandatory BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT training_modules_category_check
    CHECK (category IN ('safety','driving','customer_service','financial','platform','other'))
);

CREATE INDEX idx_training_modules_customer ON public.training_modules(customer_id);
CREATE INDEX idx_training_modules_published ON public.training_modules(is_published, order_index);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_modules TO authenticated;
GRANT ALL ON public.training_modules TO service_role;
ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tenant training"
ON public.training_modules FOR ALL TO authenticated
USING (is_platform_owner() OR (is_admin() AND (customer_id = current_customer_id() OR customer_id IS NULL)))
WITH CHECK (is_platform_owner() OR (is_admin() AND (customer_id = current_customer_id() OR customer_id IS NULL)));

CREATE POLICY "Drivers view published training"
ON public.training_modules FOR SELECT TO authenticated
USING (
  is_published = true
  AND (
    customer_id IS NULL
    OR customer_id = (SELECT d.customer_id FROM public.drivers d WHERE d.id = current_driver_id())
  )
);

CREATE TRIGGER trg_training_modules_updated_at
BEFORE UPDATE ON public.training_modules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Training progress
CREATE TABLE public.training_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started',
  progress_percent INTEGER NOT NULL DEFAULT 0,
  score INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (driver_id, module_id),
  CONSTRAINT training_progress_status_check
    CHECK (status IN ('not_started','in_progress','completed'))
);

CREATE INDEX idx_training_progress_driver ON public.training_progress(driver_id);
CREATE INDEX idx_training_progress_module ON public.training_progress(module_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_progress TO authenticated;
GRANT ALL ON public.training_progress TO service_role;
ALTER TABLE public.training_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers manage own training progress"
ON public.training_progress FOR ALL TO authenticated
USING (driver_id = current_driver_id())
WITH CHECK (driver_id = current_driver_id());

CREATE POLICY "Admins view tenant training progress"
ON public.training_progress FOR SELECT TO authenticated
USING (
  is_platform_owner()
  OR (is_admin() AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = training_progress.driver_id
      AND d.customer_id = current_customer_id()
  ))
);

CREATE TRIGGER trg_training_progress_updated_at
BEFORE UPDATE ON public.training_progress
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Broadcasts (admin -> driver segment)
CREATE TABLE public.broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all',
  audience_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  channel TEXT NOT NULL DEFAULT 'in_app',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft',
  recipient_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT broadcasts_audience_check
    CHECK (audience IN ('all','active','suspended','top_scorers','low_scorers','custom')),
  CONSTRAINT broadcasts_channel_check
    CHECK (channel IN ('in_app','push','sms','whatsapp')),
  CONSTRAINT broadcasts_status_check
    CHECK (status IN ('draft','scheduled','sending','sent','failed'))
);

CREATE INDEX idx_broadcasts_customer_status ON public.broadcasts(customer_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcasts TO authenticated;
GRANT ALL ON public.broadcasts TO service_role;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tenant broadcasts"
ON public.broadcasts FOR ALL TO authenticated
USING (is_platform_owner() OR (is_admin() AND (customer_id = current_customer_id() OR customer_id IS NULL)))
WITH CHECK (is_platform_owner() OR (is_admin() AND (customer_id = current_customer_id() OR customer_id IS NULL)));

CREATE TRIGGER trg_broadcasts_updated_at
BEFORE UPDATE ON public.broadcasts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Broadcast deliveries (per driver)
CREATE TABLE public.broadcast_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  UNIQUE (broadcast_id, driver_id)
);

CREATE INDEX idx_broadcast_deliveries_driver ON public.broadcast_deliveries(driver_id, read_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_deliveries TO authenticated;
GRANT ALL ON public.broadcast_deliveries TO service_role;
ALTER TABLE public.broadcast_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers view own deliveries"
ON public.broadcast_deliveries FOR SELECT TO authenticated
USING (driver_id = current_driver_id());

CREATE POLICY "Drivers mark own delivery read"
ON public.broadcast_deliveries FOR UPDATE TO authenticated
USING (driver_id = current_driver_id())
WITH CHECK (driver_id = current_driver_id());

CREATE POLICY "Admins manage tenant deliveries"
ON public.broadcast_deliveries FOR ALL TO authenticated
USING (
  is_platform_owner()
  OR (is_admin() AND EXISTS (
    SELECT 1 FROM public.broadcasts b
    WHERE b.id = broadcast_deliveries.broadcast_id
      AND (b.customer_id = current_customer_id() OR b.customer_id IS NULL)
  ))
)
WITH CHECK (
  is_platform_owner()
  OR (is_admin() AND EXISTS (
    SELECT 1 FROM public.broadcasts b
    WHERE b.id = broadcast_deliveries.broadcast_id
      AND (b.customer_id = current_customer_id() OR b.customer_id IS NULL)
  ))
);

-- Driver ads / announcements (banner content)
CREATE TABLE public.driver_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  image_url TEXT,
  cta_label TEXT,
  cta_url TEXT,
  placement TEXT NOT NULL DEFAULT 'home_banner',
  priority INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  view_count INTEGER NOT NULL DEFAULT 0,
  click_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT driver_ads_placement_check
    CHECK (placement IN ('home_banner','formation_banner','rentals_banner','popup'))
);

CREATE INDEX idx_driver_ads_customer_active ON public.driver_ads(customer_id, is_active, starts_at, ends_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_ads TO authenticated;
GRANT ALL ON public.driver_ads TO service_role;
ALTER TABLE public.driver_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tenant ads"
ON public.driver_ads FOR ALL TO authenticated
USING (is_platform_owner() OR (is_admin() AND (customer_id = current_customer_id() OR customer_id IS NULL)))
WITH CHECK (is_platform_owner() OR (is_admin() AND (customer_id = current_customer_id() OR customer_id IS NULL)));

CREATE POLICY "Drivers view active ads"
ON public.driver_ads FOR SELECT TO authenticated
USING (
  is_active = true
  AND starts_at <= now()
  AND (ends_at IS NULL OR ends_at > now())
  AND (
    customer_id IS NULL
    OR customer_id = (SELECT d.customer_id FROM public.drivers d WHERE d.id = current_driver_id())
  )
);

CREATE TRIGGER trg_driver_ads_updated_at
BEFORE UPDATE ON public.driver_ads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Security hardening: tenant-scope WITH CHECK on accident sub-tables
-- =========================================================
DROP POLICY IF EXISTS "admins manage determinations" ON public.accident_determinations;
CREATE POLICY "admins manage determinations"
ON public.accident_determinations FOR ALL TO authenticated
USING (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin','manager']) AND EXISTS (
    SELECT 1 FROM public.accidents a
    WHERE a.id = accident_determinations.accident_id
      AND a.customer_id = current_customer_id()
  ))
)
WITH CHECK (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin','manager']) AND EXISTS (
    SELECT 1 FROM public.accidents a
    WHERE a.id = accident_determinations.accident_id
      AND a.customer_id = current_customer_id()
  ))
);

DROP POLICY IF EXISTS "admins manage notes" ON public.accident_notes;
CREATE POLICY "admins manage notes"
ON public.accident_notes FOR ALL TO authenticated
USING (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin','manager','agent_support']) AND EXISTS (
    SELECT 1 FROM public.accidents a
    WHERE a.id = accident_notes.accident_id
      AND a.customer_id = current_customer_id()
  ))
)
WITH CHECK (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin','manager','agent_support']) AND EXISTS (
    SELECT 1 FROM public.accidents a
    WHERE a.id = accident_notes.accident_id
      AND a.customer_id = current_customer_id()
  ))
);

DROP POLICY IF EXISTS "admins manage tenant parties" ON public.accident_parties;
CREATE POLICY "admins manage tenant parties"
ON public.accident_parties FOR ALL TO authenticated
USING (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin','manager']) AND EXISTS (
    SELECT 1 FROM public.accidents a
    WHERE a.id = accident_parties.accident_id
      AND a.customer_id = current_customer_id()
  ))
)
WITH CHECK (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin','manager']) AND EXISTS (
    SELECT 1 FROM public.accidents a
    WHERE a.id = accident_parties.accident_id
      AND a.customer_id = current_customer_id()
  ))
);
