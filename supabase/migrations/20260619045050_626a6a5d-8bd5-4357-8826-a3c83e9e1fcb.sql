-- ============================================================
-- Layer 3I - Platform Licensing, Feature Entitlements & Commercial Packaging
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.customers') IS NULL THEN RAISE EXCEPTION 'Layer 3I requires public.customers'; END IF;
  IF to_regclass('public.admin_users') IS NULL THEN RAISE EXCEPTION 'Layer 3I requires public.admin_users'; END IF;
  IF to_regclass('public.feature_flags') IS NULL THEN RAISE EXCEPTION 'Layer 3I requires existing public.feature_flags'; END IF;
  IF to_regclass('public.credit_products') IS NULL THEN RAISE EXCEPTION 'Layer 3I expects Layer 3A credit_products'; END IF;
  IF to_regclass('public.v_credit_portfolio_health') IS NULL THEN RAISE EXCEPTION 'Layer 3I expects Layer 3H views'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.has_platform_permission(permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(auth.role(), '') = 'service_role'
    OR public.is_platform_owner()
    OR CASE permission
      WHEN 'platform.view' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','agent_support','loan_officer','support'])
      WHEN 'platform.plan.manage' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'platform.feature.manage' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'platform.entitlement.manage' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'platform.trial.manage' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer'])
      WHEN 'platform.audit' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'platform.admin' THEN public.has_admin_role_in(ARRAY['super_admin'])
      ELSE false
    END
$$;

CREATE OR REPLACE FUNCTION public.platform_licensing_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND (
       to_jsonb(NEW) ->> 'status' IS DISTINCT FROM to_jsonb(OLD) ->> 'status'
       OR to_jsonb(NEW) ->> 'entitlement_status' IS DISTINCT FROM to_jsonb(OLD) ->> 'entitlement_status'
     ) THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END; $$;

CREATE TABLE IF NOT EXISTS public.platform_plans (
  plan_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key text NOT NULL UNIQUE,
  plan_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','RETIRED','ARCHIVED')),
  is_base_plan boolean NOT NULL DEFAULT false,
  commercial_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status_changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_features (
  feature_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL UNIQUE,
  feature_name text NOT NULL,
  category text NOT NULL,
  module_key text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','BETA','RETIRED','HIDDEN')),
  default_flag_state text NOT NULL DEFAULT 'ENABLED' CHECK (default_flag_state IN ('ENABLED','DISABLED','HIDDEN','BETA','TRIAL')),
  description text NOT NULL DEFAULT '',
  upgrade_copy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status_changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plan_features (
  plan_feature_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.platform_plans(plan_id) ON DELETE CASCADE,
  feature_id uuid NOT NULL REFERENCES public.platform_features(feature_id) ON DELETE CASCADE,
  feature_state text NOT NULL DEFAULT 'DISABLED' CHECK (feature_state IN ('ENABLED','DISABLED','HIDDEN','BETA','TRIAL')),
  limits_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RETIRED','ARCHIVED')),
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, feature_id)
);

CREATE TABLE IF NOT EXISTS public.tenant_plan_assignments (
  assignment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.platform_plans(plan_id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PENDING','SUPERSEDED','CANCELLED','EXPIRED')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  assigned_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status_changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_tenant_active_plan_assignment
  ON public.tenant_plan_assignments(tenant_id) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS public.tenant_entitlements (
  entitlement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.platform_plans(plan_id) ON DELETE SET NULL,
  feature_id uuid NOT NULL REFERENCES public.platform_features(feature_id) ON DELETE CASCADE,
  entitlement_status text NOT NULL DEFAULT 'PENDING' CHECK (entitlement_status IN ('ACTIVE','TRIAL','EXPIRED','DISABLED','PENDING')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  source text NOT NULL DEFAULT 'PLAN' CHECK (source IN ('PLAN','ADD_ON','TRIAL','MANUAL','PARTNER','LEGACY','SEED')),
  override_reason text,
  created_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, feature_id)
);

CREATE TABLE IF NOT EXISTS public.feature_trials (
  trial_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  feature_id uuid NOT NULL REFERENCES public.platform_features(feature_id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED','CANCELLED','CONVERTED','PENDING')),
  activated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  ended_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  reason text,
  usage_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status_changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.usage_limits (
  usage_limit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.platform_plans(plan_id) ON DELETE CASCADE,
  feature_id uuid REFERENCES public.platform_features(feature_id) ON DELETE CASCADE,
  limit_key text NOT NULL,
  limit_name text NOT NULL,
  limit_value integer,
  limit_period text NOT NULL DEFAULT 'CURRENT' CHECK (limit_period IN ('CURRENT','MONTHLY','ANNUAL','LIFETIME')),
  hard_limit boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'PLAN' CHECK (source IN ('PLAN','ADD_ON','TRIAL','MANUAL','PARTNER','SEED')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED','RETIRED')),
  created_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status_changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_usage_limits_tenant_key
  ON public.usage_limits(tenant_id, limit_key) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_usage_limits_plan_key
  ON public.usage_limits(plan_id, limit_key) WHERE plan_id IS NOT NULL AND tenant_id IS NULL;

CREATE TABLE IF NOT EXISTS public.platform_add_ons (
  add_on_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  add_on_key text NOT NULL UNIQUE,
  add_on_name text NOT NULL,
  feature_id uuid REFERENCES public.platform_features(feature_id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','RETIRED','ARCHIVED')),
  commercial_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status_changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_add_ons (
  tenant_add_on_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  add_on_id uuid NOT NULL REFERENCES public.platform_add_ons(add_on_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PENDING','EXPIRED','DISABLED')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  assigned_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  reason text,
  created_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, add_on_id)
);

CREATE TABLE IF NOT EXISTS public.platform_audit_events (
  audit_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  actor_role text,
  event_type text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  before_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_platform_audit_idempotency
  ON public.platform_audit_events(idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.feature_flags
  ADD COLUMN IF NOT EXISTS feature_id uuid REFERENCES public.platform_features(feature_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS feature_state text NOT NULL DEFAULT 'ENABLED' CHECK (feature_state IN ('ENABLED','DISABLED','HIDDEN','BETA','TRIAL')),
  ADD COLUMN IF NOT EXISTS rollout_rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NOT NULL DEFAULT now();

UPDATE public.feature_flags
SET feature_state = CASE WHEN flag_value THEN 'ENABLED' ELSE 'DISABLED' END
WHERE feature_id IS NULL AND feature_state = 'ENABLED';

CREATE INDEX IF NOT EXISTS idx_platform_features_category ON public.platform_features(category, module_key);
CREATE INDEX IF NOT EXISTS idx_tenant_entitlements_tenant_status ON public.tenant_entitlements(tenant_id, entitlement_status, expires_at);
CREATE INDEX IF NOT EXISTS idx_feature_trials_tenant_status ON public.feature_trials(tenant_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_platform_audit_events_tenant_created ON public.platform_audit_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_flags_feature_state ON public.feature_flags(feature_id, feature_state);

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_plans','platform_features','plan_features','tenant_plan_assignments','tenant_entitlements','feature_trials','usage_limits','platform_add_ons','tenant_add_ons','platform_audit_events']
  LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t); END LOOP;
END; $$;

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_plans','platform_features','plan_features','platform_add_ons']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "platform catalog select" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "platform catalog manage" ON public.%I', t);
    EXECUTE format('CREATE POLICY "platform catalog select" ON public.%I FOR SELECT TO authenticated USING (public.has_platform_permission(''platform.view''))', t);
    EXECUTE format('CREATE POLICY "platform catalog manage" ON public.%I FOR ALL TO authenticated USING (public.has_platform_permission(''platform.admin'')) WITH CHECK (public.has_platform_permission(''platform.admin''))', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['tenant_plan_assignments','tenant_entitlements','feature_trials','usage_limits','tenant_add_ons','platform_audit_events']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "platform tenant select" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "platform tenant manage" ON public.%I', t);
    EXECUTE format('CREATE POLICY "platform tenant select" ON public.%I FOR SELECT TO authenticated USING (public.is_platform_owner() OR tenant_id = public.current_customer_id())', t);
    EXECUTE format('CREATE POLICY "platform tenant manage" ON public.%I FOR ALL TO authenticated USING (public.has_platform_permission(''platform.admin'')) WITH CHECK (public.has_platform_permission(''platform.admin''))', t);
  END LOOP;

  DROP POLICY IF EXISTS "platform tenant select" ON public.usage_limits;
  CREATE POLICY "platform tenant select" ON public.usage_limits FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR tenant_id = public.current_customer_id()
    OR (tenant_id IS NULL AND plan_id IN (
      SELECT tpa.plan_id FROM public.tenant_plan_assignments tpa
      WHERE tpa.tenant_id = public.current_customer_id() AND tpa.status = 'ACTIVE'
    ))
  );
END; $$;

CREATE OR REPLACE FUNCTION public.prevent_platform_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'platform audit events are immutable' USING ERRCODE = '25006'; END;
$$;

DROP TRIGGER IF EXISTS trg_platform_audit_immutable ON public.platform_audit_events;
CREATE TRIGGER trg_platform_audit_immutable BEFORE UPDATE OR DELETE ON public.platform_audit_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_platform_audit_mutation();

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_plans','platform_features','plan_features','tenant_plan_assignments','tenant_entitlements','feature_trials','usage_limits','platform_add_ons','tenant_add_ons']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_touch_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_licensing_touch_updated_at()', t, t);
  END LOOP;
END; $$;

INSERT INTO public.platform_plans (plan_key, plan_name, description, status, is_base_plan, commercial_metadata_json) VALUES
  ('fleet_core', 'KIRA Fleet Core', 'Complete fleet operations baseline.', 'ACTIVE', true, '{"tier":1,"positioning":"Base platform"}'::jsonb),
  ('growth', 'KIRA Growth', 'Fleet Core plus ownership readiness and growth activation.', 'ACTIVE', false, '{"tier":2,"positioning":"Expansion platform"}'::jsonb),
  ('professional', 'KIRA Professional', 'Fleet Core, Trust, Growth, and operational analytics.', 'ACTIVE', false, '{"tier":3,"positioning":"Operating company package"}'::jsonb),
  ('enterprise', 'KIRA Enterprise', 'Full commercial platform access.', 'ACTIVE', false, '{"tier":4,"positioning":"Full platform"}'::jsonb),
  ('partner', 'KIRA Partner', 'Partner-ready licensing package.', 'ACTIVE', false, '{"tier":5,"positioning":"Partner ecosystem"}'::jsonb),
  ('custom', 'KIRA Custom', 'Custom negotiated package.', 'DRAFT', false, '{"tier":6,"positioning":"Custom"}'::jsonb)
ON CONFLICT (plan_key) DO UPDATE
SET plan_name = EXCLUDED.plan_name, description = EXCLUDED.description, status = EXCLUDED.status,
    is_base_plan = EXCLUDED.is_base_plan, commercial_metadata_json = EXCLUDED.commercial_metadata_json, updated_at = now();

INSERT INTO public.platform_features (feature_key, feature_name, category, module_key, status, default_flag_state, description, upgrade_copy_json) VALUES
  ('driver_management','Driver Management','CORE','fleet_core','ACTIVE','ENABLED','Driver workflows.','{}'::jsonb),
  ('vehicle_management','Vehicle Management','CORE','fleet_core','ACTIVE','ENABLED','Vehicle inventory.','{}'::jsonb),
  ('driver_app','Driver App','CORE','fleet_core','ACTIVE','ENABLED','Driver mobile.','{}'::jsonb),
  ('invoicing','Invoicing','CORE','fleet_core','ACTIVE','ENABLED','Invoices.','{}'::jsonb),
  ('wallet','Wallet','CORE','fleet_core','ACTIVE','ENABLED','Wallet.','{}'::jsonb),
  ('payments','Payments','CORE','fleet_core','ACTIVE','ENABLED','Payments.','{}'::jsonb),
  ('maintenance','Maintenance','CORE','fleet_core','ACTIVE','ENABLED','Maintenance.','{}'::jsonb),
  ('basic_reporting','Basic Reporting','CORE','fleet_core','ACTIVE','ENABLED','Reporting.','{}'::jsonb),
  ('trust_center','Trust Center','TRUST','trust','ACTIVE','DISABLED','Trust.','{"cta":"Request KIRA Trust"}'::jsonb),
  ('advanced_driver_scoring','Advanced Driver Scoring','TRUST','trust','ACTIVE','DISABLED','Scoring.','{}'::jsonb),
  ('risk_analytics','Risk Analytics','TRUST','trust','ACTIVE','DISABLED','Risk.','{}'::jsonb),
  ('trust_dashboards','Trust Dashboards','TRUST','trust','ACTIVE','DISABLED','Dashboards.','{}'::jsonb),
  ('driver_benchmarking','Driver Benchmarking','TRUST','trust','ACTIVE','DISABLED','Benchmark.','{}'::jsonb),
  ('growth_center','Growth Center','GROWTH','growth','ACTIVE','DISABLED','Growth.','{"cta":"Start Growth Trial"}'::jsonb),
  ('ownership_readiness','Ownership Readiness','GROWTH','growth','ACTIVE','DISABLED','Ownership prep.','{}'::jsonb),
  ('opportunity_engine','Opportunity Engine','GROWTH','growth','ACTIVE','DISABLED','Opportunities.','{}'::jsonb),
  ('product_eligibility','Product Eligibility','GROWTH','growth','ACTIVE','DISABLED','Eligibility.','{}'::jsonb),
  ('credit_products','Credit Products','CREDIT','credit','ACTIVE','DISABLED','Credit.','{"cta":"Request KIRA Credit"}'::jsonb),
  ('underwriting','Underwriting','CREDIT','credit','ACTIVE','DISABLED','Underwriting.','{}'::jsonb),
  ('contracts','Contracts','CREDIT','credit','ACTIVE','DISABLED','Contracts.','{}'::jsonb),
  ('repayment','Repayment','CREDIT','credit','ACTIVE','DISABLED','Repayment.','{}'::jsonb),
  ('collections','Collections','CREDIT','credit','ACTIVE','DISABLED','Collections.','{}'::jsonb),
  ('recovery','Recovery','CREDIT','credit','ACTIVE','DISABLED','Recovery.','{}'::jsonb),
  ('ownership_completion','Ownership Completion','OWNERSHIP','ownership','ACTIVE','DISABLED','Completion.','{}'::jsonb),
  ('asset_transfer','Asset Transfer','OWNERSHIP','ownership','ACTIVE','DISABLED','Transfer.','{}'::jsonb),
  ('certificates','Certificates','OWNERSHIP','ownership','ACTIVE','DISABLED','Certificates.','{}'::jsonb),
  ('ownership_analytics','Ownership Analytics','OWNERSHIP','ownership','ACTIVE','DISABLED','Analytics.','{}'::jsonb),
  ('executive_dashboards','Executive Dashboards','INTELLIGENCE','intelligence','ACTIVE','DISABLED','Exec.','{}'::jsonb),
  ('portfolio_analytics','Portfolio Analytics','INTELLIGENCE','intelligence','ACTIVE','DISABLED','Portfolio.','{"cta":"Request KIRA Intelligence"}'::jsonb),
  ('risk_intelligence','Risk Intelligence','INTELLIGENCE','intelligence','ACTIVE','DISABLED','Risk Intel.','{}'::jsonb),
  ('executive_attention_center','Executive Attention Center','INTELLIGENCE','intelligence','ACTIVE','DISABLED','Attention.','{}'::jsonb),
  ('fleet_entrepreneur','Fleet Entrepreneur','FUTURE','future','BETA','HIDDEN','Future.','{}'::jsonb),
  ('marketplace','Marketplace','FUTURE','future','DRAFT','HIDDEN','Future.','{}'::jsonb),
  ('partner_financing','Partner Financing','FUTURE','partner','BETA','HIDDEN','Future.','{}'::jsonb),
  ('insurance','Insurance','FUTURE','partner','BETA','HIDDEN','Future.','{}'::jsonb),
  ('telematics','Telematics','FUTURE','partner','BETA','HIDDEN','Future.','{}'::jsonb),
  ('ai_copilot','AI Copilot','FUTURE','future','BETA','HIDDEN','Future.','{}'::jsonb)
ON CONFLICT (feature_key) DO UPDATE
SET feature_name = EXCLUDED.feature_name, category = EXCLUDED.category, module_key = EXCLUDED.module_key,
    status = EXCLUDED.status, default_flag_state = EXCLUDED.default_flag_state,
    description = EXCLUDED.description, upgrade_copy_json = EXCLUDED.upgrade_copy_json, updated_at = now();

UPDATE public.platform_features
SET default_flag_state = CASE WHEN category = 'FUTURE' THEN 'HIDDEN' WHEN status = 'BETA' THEN 'BETA' ELSE 'ENABLED' END,
    updated_at = now()
WHERE category <> 'CORE' OR default_flag_state <> 'ENABLED';

INSERT INTO public.feature_flags (flag_key, flag_value, description, is_platform_only, category, feature_id, feature_state, rollout_rules_json, status_changed_at)
SELECT 'license_' || f.feature_key, f.default_flag_state IN ('ENABLED','BETA','TRIAL'),
  'Commercial licensing state for ' || f.feature_name, false, lower(f.category),
  f.feature_id, f.default_flag_state, '{}'::jsonb, now()
FROM public.platform_features f
ON CONFLICT (flag_key) DO UPDATE
SET description = EXCLUDED.description, category = EXCLUDED.category, feature_id = EXCLUDED.feature_id,
    feature_state = EXCLUDED.feature_state, flag_value = EXCLUDED.flag_value,
    updated_at = now(), status_changed_at = now();

INSERT INTO public.plan_features (plan_id, feature_id, feature_state, limits_json)
SELECT p.plan_id, f.feature_id,
  CASE
    WHEN f.category = 'CORE' THEN 'ENABLED'
    WHEN p.plan_key = 'fleet_core' AND f.category IN ('TRUST','GROWTH','CREDIT','OWNERSHIP','INTELLIGENCE') THEN 'DISABLED'
    WHEN p.plan_key = 'fleet_core' THEN 'HIDDEN'
    WHEN p.plan_key = 'growth' AND f.category IN ('TRUST','GROWTH') THEN 'ENABLED'
    WHEN p.plan_key = 'growth' AND f.category IN ('CREDIT','OWNERSHIP','INTELLIGENCE') THEN 'DISABLED'
    WHEN p.plan_key = 'growth' THEN 'HIDDEN'
    WHEN p.plan_key = 'professional' AND f.category IN ('TRUST','GROWTH','INTELLIGENCE') THEN 'ENABLED'
    WHEN p.plan_key = 'professional' AND f.category IN ('CREDIT','OWNERSHIP') THEN 'DISABLED'
    WHEN p.plan_key = 'professional' THEN 'HIDDEN'
    WHEN p.plan_key = 'enterprise' AND f.category <> 'FUTURE' THEN 'ENABLED'
    WHEN p.plan_key = 'enterprise' AND f.status = 'BETA' THEN 'BETA'
    WHEN p.plan_key = 'partner' AND f.category IN ('CORE','TRUST','GROWTH','CREDIT','INTELLIGENCE') THEN 'ENABLED'
    WHEN p.plan_key = 'partner' AND f.category = 'FUTURE' AND f.module_key = 'partner' THEN 'BETA'
    WHEN p.plan_key = 'custom' THEN 'DISABLED'
    ELSE 'HIDDEN'
  END,
  CASE p.plan_key
    WHEN 'fleet_core' THEN '{"driver_count":50,"vehicle_count":20,"admin_user_count":5,"credit_account_count":0}'::jsonb
    WHEN 'growth' THEN '{"driver_count":150,"vehicle_count":75,"admin_user_count":10,"credit_account_count":0}'::jsonb
    WHEN 'professional' THEN '{"driver_count":500,"vehicle_count":250,"admin_user_count":25,"credit_account_count":100}'::jsonb
    WHEN 'enterprise' THEN '{"driver_count":null,"vehicle_count":null,"admin_user_count":null,"credit_account_count":null}'::jsonb
    ELSE '{}'::jsonb
  END
FROM public.platform_plans p CROSS JOIN public.platform_features f
ON CONFLICT (plan_id, feature_id) DO UPDATE
SET feature_state = EXCLUDED.feature_state, limits_json = EXCLUDED.limits_json, updated_at = now();

INSERT INTO public.platform_add_ons (add_on_key, add_on_name, feature_id, description, status, commercial_metadata_json)
SELECT seed.add_on_key, seed.add_on_name, f.feature_id, seed.description, 'ACTIVE', seed.metadata
FROM (
  SELECT 'trust_add_on' AS add_on_key, 'KIRA Trust Add-On' AS add_on_name, 'trust_center' AS feature_key, 'Attach Trust features.' AS description, '{"category":"TRUST"}'::jsonb AS metadata
  UNION ALL SELECT 'growth_add_on', 'KIRA Growth Add-On', 'growth_center', 'Attach Growth.', '{"category":"GROWTH"}'::jsonb
  UNION ALL SELECT 'credit_add_on', 'KIRA Credit Add-On', 'credit_products', 'Attach Credit.', '{"category":"CREDIT"}'::jsonb
  UNION ALL SELECT 'ownership_add_on', 'KIRA Ownership Add-On', 'ownership_completion', 'Attach Ownership.', '{"category":"OWNERSHIP"}'::jsonb
  UNION ALL SELECT 'intelligence_add_on', 'KIRA Intelligence Add-On', 'portfolio_analytics', 'Attach Intelligence.', '{"category":"INTELLIGENCE"}'::jsonb
  UNION ALL SELECT 'insurance_add_on', 'Insurance Add-On', 'insurance', 'Future insurance.', '{"category":"PARTNER","future":true}'::jsonb
  UNION ALL SELECT 'telematics_add_on', 'Telematics Add-On', 'telematics', 'Future telematics.', '{"category":"PARTNER","future":true}'::jsonb
) seed
JOIN public.platform_features f ON f.feature_key = seed.feature_key
ON CONFLICT (add_on_key) DO UPDATE
SET add_on_name = EXCLUDED.add_on_name, feature_id = EXCLUDED.feature_id,
    description = EXCLUDED.description, status = EXCLUDED.status,
    commercial_metadata_json = EXCLUDED.commercial_metadata_json, updated_at = now();

INSERT INTO public.customers (name, slug, is_active, settings) VALUES
  ('QA Layer 3I Fleet Core', 'qa-layer3i-fleet-core', true, '{"qa_layer":"3I","package":"fleet_core"}'::jsonb),
  ('QA Layer 3I Growth', 'qa-layer3i-growth', true, '{"qa_layer":"3I","package":"growth"}'::jsonb),
  ('QA Layer 3I Enterprise', 'qa-layer3i-enterprise', true, '{"qa_layer":"3I","package":"enterprise"}'::jsonb),
  ('QA Layer 3I Trial Customer', 'qa-layer3i-trial-customer', true, '{"qa_layer":"3I","package":"trial"}'::jsonb)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name, settings = public.customers.settings || EXCLUDED.settings, is_active = true, updated_at = now();

INSERT INTO public.tenant_plan_assignments (tenant_id, plan_id, status, reason)
SELECT c.id, p.plan_id, 'ACTIVE', 'Layer 3I seed: preserve existing production tenant access with Enterprise package.'
FROM public.customers c JOIN public.platform_plans p ON p.plan_key = 'enterprise'
WHERE c.is_active = true AND c.slug NOT LIKE 'qa-layer3i-%'
  AND NOT EXISTS (SELECT 1 FROM public.tenant_plan_assignments tpa WHERE tpa.tenant_id = c.id AND tpa.status = 'ACTIVE');

INSERT INTO public.tenant_plan_assignments (tenant_id, plan_id, status, reason)
SELECT c.id, p.plan_id, 'ACTIVE', 'Layer 3I QA seed plan assignment.'
FROM public.customers c
JOIN public.platform_plans p ON p.plan_key = CASE c.slug
  WHEN 'qa-layer3i-fleet-core' THEN 'fleet_core'
  WHEN 'qa-layer3i-growth' THEN 'growth'
  WHEN 'qa-layer3i-enterprise' THEN 'enterprise'
  WHEN 'qa-layer3i-trial-customer' THEN 'fleet_core'
END
WHERE c.slug LIKE 'qa-layer3i-%'
  AND NOT EXISTS (SELECT 1 FROM public.tenant_plan_assignments tpa WHERE tpa.tenant_id = c.id AND tpa.status = 'ACTIVE');

INSERT INTO public.tenant_entitlements (tenant_id, plan_id, feature_id, entitlement_status, starts_at, expires_at, source, override_reason)
SELECT tpa.tenant_id, tpa.plan_id, pf.feature_id,
  CASE WHEN pf.feature_state IN ('ENABLED','BETA') THEN 'ACTIVE' WHEN pf.feature_state = 'TRIAL' THEN 'TRIAL' ELSE 'DISABLED' END,
  now(), NULL, 'PLAN', 'Layer 3I seed from assigned plan.'
FROM public.tenant_plan_assignments tpa
JOIN public.plan_features pf ON pf.plan_id = tpa.plan_id
WHERE tpa.status = 'ACTIVE'
ON CONFLICT (tenant_id, feature_id) DO UPDATE
SET plan_id = EXCLUDED.plan_id, entitlement_status = EXCLUDED.entitlement_status, source = EXCLUDED.source,
    override_reason = EXCLUDED.override_reason, updated_at = now(), status_changed_at = now();

WITH trial_seed AS (
  SELECT c.id AS tenant_id, f.feature_id
  FROM public.customers c JOIN public.platform_features f ON f.feature_key = 'growth_center'
  WHERE c.slug = 'qa-layer3i-trial-customer'
)
INSERT INTO public.feature_trials (tenant_id, feature_id, starts_at, expires_at, status, reason)
SELECT tenant_id, feature_id, now(), now() + interval '14 days', 'ACTIVE', 'Layer 3I QA active Growth trial.'
FROM trial_seed
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_trials ft
  WHERE ft.tenant_id = trial_seed.tenant_id AND ft.feature_id = trial_seed.feature_id AND ft.status = 'ACTIVE'
);

WITH trial_seed AS (
  SELECT c.id AS tenant_id, f.feature_id
  FROM public.customers c JOIN public.platform_features f ON f.feature_key = 'growth_center'
  WHERE c.slug = 'qa-layer3i-trial-customer'
)
INSERT INTO public.tenant_entitlements (tenant_id, feature_id, entitlement_status, starts_at, expires_at, source, override_reason)
SELECT tenant_id, feature_id, 'TRIAL', now(), now() + interval '14 days', 'TRIAL', 'Layer 3I QA active Growth trial.'
FROM trial_seed
ON CONFLICT (tenant_id, feature_id) DO UPDATE
SET entitlement_status = 'TRIAL', starts_at = EXCLUDED.starts_at, expires_at = EXCLUDED.expires_at,
    source = 'TRIAL', override_reason = EXCLUDED.override_reason, updated_at = now(), status_changed_at = now();

INSERT INTO public.usage_limits (tenant_id, plan_id, feature_id, limit_key, limit_name, limit_value, hard_limit, source)
SELECT NULL, p.plan_id, NULL, limits.limit_key, limits.limit_name, limits.limit_value, true, 'PLAN'
FROM public.platform_plans p
CROSS JOIN LATERAL (VALUES
    ('driver_count', 'Driver count', CASE p.plan_key WHEN 'fleet_core' THEN 50 WHEN 'growth' THEN 150 WHEN 'professional' THEN 500 ELSE NULL END),
    ('vehicle_count', 'Vehicle count', CASE p.plan_key WHEN 'fleet_core' THEN 20 WHEN 'growth' THEN 75 WHEN 'professional' THEN 250 ELSE NULL END),
    ('admin_user_count', 'Admin user count', CASE p.plan_key WHEN 'fleet_core' THEN 5 WHEN 'growth' THEN 10 WHEN 'professional' THEN 25 ELSE NULL END),
    ('credit_account_count', 'Credit account count', CASE p.plan_key WHEN 'fleet_core' THEN 0 WHEN 'growth' THEN 0 WHEN 'professional' THEN 100 ELSE NULL END),
    ('storage_gb', 'Storage GB', CASE p.plan_key WHEN 'fleet_core' THEN 25 WHEN 'growth' THEN 100 WHEN 'professional' THEN 500 ELSE NULL END),
    ('branch_count', 'Branch count', CASE p.plan_key WHEN 'fleet_core' THEN 1 WHEN 'growth' THEN 3 WHEN 'professional' THEN 10 ELSE NULL END)
) limits(limit_key, limit_name, limit_value)
ON CONFLICT DO NOTHING;

INSERT INTO public.usage_limits (tenant_id, limit_key, limit_name, limit_value, hard_limit, source)
SELECT c.id, 'driver_count', 'QA driver count hard limit', 0, true, 'SEED'
FROM public.customers c WHERE c.slug = 'qa-layer3i-fleet-core'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.record_platform_audit_event(
  p_event_type text, p_target_type text, p_target_id text DEFAULT NULL, p_tenant_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL, p_before_json jsonb DEFAULT '{}'::jsonb, p_after_json jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor public.admin_users%ROWTYPE; v_event_id uuid; v_requires_reason boolean;
BEGIN
  IF NOT public.has_platform_permission('platform.view') THEN
    RAISE EXCEPTION 'forbidden: platform.view required' USING ERRCODE = '42501';
  END IF;
  v_requires_reason := p_event_type = ANY(ARRAY['PLAN_ASSIGNED','PLAN_CHANGED','FEATURE_ENABLED','FEATURE_DISABLED','FEATURE_HIDDEN','ENTITLEMENT_GRANTED','ENTITLEMENT_REVOKED','ENTITLEMENT_UPDATED','TRIAL_STARTED','TRIAL_ENDED','USAGE_LIMIT_CHANGED','MANUAL_OVERRIDE_CREATED']);
  IF v_requires_reason AND NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'reason required for high-risk platform licensing action' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_actor FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true LIMIT 1;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT audit_event_id INTO v_event_id FROM public.platform_audit_events WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_event_id IS NOT NULL THEN RETURN v_event_id; END IF;
  END IF;
  INSERT INTO public.platform_audit_events (tenant_id, actor_id, actor_role, event_type, target_type, target_id, before_json, after_json, reason, idempotency_key)
  VALUES (COALESCE(p_tenant_id, v_actor.customer_id, public.current_customer_id()), v_actor.id, v_actor.role_key, p_event_type, p_target_type, p_target_id, COALESCE(p_before_json, '{}'::jsonb), COALESCE(p_after_json, '{}'::jsonb), p_reason, p_idempotency_key)
  RETURNING audit_event_id INTO v_event_id;
  RETURN v_event_id;
END; $$;

CREATE OR REPLACE FUNCTION public.check_feature_entitlement(p_feature_key text, p_customer_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_customer_id uuid := COALESCE(p_customer_id, public.current_customer_id());
  v_feature public.platform_features%ROWTYPE; v_entitlement public.tenant_entitlements%ROWTYPE;
  v_assignment public.tenant_plan_assignments%ROWTYPE; v_plan_feature public.plan_features%ROWTYPE;
  v_feature_state text; v_access_state text; v_allowed boolean := false;
  v_code text := 'FEATURE_NOT_LICENSED'; v_message text; v_plan_name text;
BEGIN
  IF v_customer_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'TENANT_NOT_RESOLVED', 'message', 'No tenant context.', 'feature_key', p_feature_key);
  END IF;
  IF NOT (COALESCE(auth.role(), '') = 'service_role' OR public.is_platform_owner() OR v_customer_id = public.current_customer_id()) THEN
    RAISE EXCEPTION 'forbidden: tenant entitlement scope mismatch' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_feature FROM public.platform_features WHERE feature_key = p_feature_key LIMIT 1;
  IF v_feature.feature_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'FEATURE_UNKNOWN', 'message', 'Unknown feature.', 'feature_key', p_feature_key);
  END IF;
  SELECT COALESCE(ff.feature_state, v_feature.default_flag_state) INTO v_feature_state
  FROM public.feature_flags ff
  WHERE ff.feature_id = v_feature.feature_id OR ff.flag_key = 'license_' || p_feature_key
  ORDER BY ff.customer_id NULLS FIRST LIMIT 1;
  v_feature_state := COALESCE(v_feature_state, v_feature.default_flag_state, 'DISABLED');
  SELECT * INTO v_assignment FROM public.tenant_plan_assignments
  WHERE tenant_id = v_customer_id AND status = 'ACTIVE' AND starts_at <= now() AND (expires_at IS NULL OR expires_at > now())
  ORDER BY created_at DESC LIMIT 1;
  IF v_assignment.assignment_id IS NOT NULL THEN
    SELECT * INTO v_plan_feature FROM public.plan_features WHERE plan_id = v_assignment.plan_id AND feature_id = v_feature.feature_id LIMIT 1;
    SELECT plan_name INTO v_plan_name FROM public.platform_plans WHERE plan_id = v_assignment.plan_id;
  END IF;
  SELECT * INTO v_entitlement FROM public.tenant_entitlements WHERE tenant_id = v_customer_id AND feature_id = v_feature.feature_id LIMIT 1;
  IF v_feature.status = 'HIDDEN' OR v_feature_state = 'HIDDEN' OR COALESCE(v_plan_feature.feature_state, 'DISABLED') = 'HIDDEN' THEN
    v_access_state := 'HIDDEN'; v_code := 'FEATURE_HIDDEN'; v_message := v_feature.feature_name || ' is not visible in this package.';
  ELSIF v_feature_state = 'DISABLED' THEN
    v_access_state := 'DISABLED'; v_code := 'FEATURE_NOT_LICENSED'; v_message := v_feature.feature_name || ' is disabled.';
  ELSIF v_entitlement.entitlement_id IS NULL THEN
    v_access_state := 'LOCKED'; v_code := 'FEATURE_NOT_LICENSED'; v_message := v_feature.feature_name || ' requires an entitlement.';
  ELSIF v_entitlement.entitlement_status = 'TRIAL' AND COALESCE(v_entitlement.expires_at, now() + interval '1 day') <= now() THEN
    v_access_state := 'EXPIRED'; v_code := 'TRIAL_EXPIRED'; v_message := v_feature.feature_name || ' trial expired.';
  ELSIF v_entitlement.entitlement_status IN ('ACTIVE','TRIAL') AND v_entitlement.starts_at <= now() AND (v_entitlement.expires_at IS NULL OR v_entitlement.expires_at > now()) THEN
    v_access_state := CASE
      WHEN v_entitlement.entitlement_status = 'TRIAL' THEN 'TRIAL'
      WHEN v_feature_state = 'BETA' OR COALESCE(v_plan_feature.feature_state, '') = 'BETA' THEN 'BETA'
      ELSE 'ENABLED' END;
    v_allowed := true; v_code := 'FEATURE_LICENSED'; v_message := v_feature.feature_name || ' is available.';
  ELSIF COALESCE(v_plan_feature.feature_state, 'DISABLED') = 'DISABLED' THEN
    v_access_state := 'DISABLED'; v_code := 'FEATURE_NOT_LICENSED'; v_message := v_feature.feature_name || ' not in package.';
  ELSIF v_entitlement.entitlement_status = 'PENDING' THEN
    v_access_state := 'PENDING'; v_code := 'FEATURE_PENDING'; v_message := v_feature.feature_name || ' pending activation.';
  ELSE
    v_access_state := 'LOCKED'; v_code := 'FEATURE_NOT_LICENSED'; v_message := v_feature.feature_name || ' is not active.';
  END IF;
  RETURN jsonb_build_object('allowed', v_allowed, 'code', v_code, 'message', v_message,
    'feature_key', v_feature.feature_key, 'feature_name', v_feature.feature_name,
    'category', v_feature.category, 'module_key', v_feature.module_key,
    'access_state', v_access_state, 'feature_state', v_feature_state,
    'entitlement_status', v_entitlement.entitlement_status, 'source', v_entitlement.source,
    'plan_name', v_plan_name, 'expires_at', v_entitlement.expires_at, 'upgrade_copy', v_feature.upgrade_copy_json);
END; $$;

CREATE OR REPLACE FUNCTION public.require_feature_entitlement(p_feature_key text, p_customer_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.check_feature_entitlement(p_feature_key, p_customer_id);
  IF COALESCE((v_result ->> 'allowed')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FEATURE_NOT_LICENSED: %', p_feature_key USING ERRCODE = '42501', DETAIL = v_result::text;
  END IF;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.assign_platform_plan(
  p_customer_id uuid, p_plan_key text, p_reason text,
  p_starts_at timestamptz DEFAULT now(), p_expires_at timestamptz DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor public.admin_users%ROWTYPE; v_plan public.platform_plans%ROWTYPE; v_assignment_id uuid;
BEGIN
  IF NOT public.has_platform_permission('platform.plan.manage') THEN
    RAISE EXCEPTION 'forbidden: platform.plan.manage required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_plan FROM public.platform_plans WHERE plan_key = p_plan_key AND status IN ('ACTIVE','DRAFT') LIMIT 1;
  IF v_plan.plan_id IS NULL THEN RAISE EXCEPTION 'unknown platform plan: %', p_plan_key USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_actor FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true LIMIT 1;
  UPDATE public.tenant_plan_assignments
  SET status = 'SUPERSEDED', updated_by = v_actor.id, updated_at = now(), status_changed_at = now()
  WHERE tenant_id = p_customer_id AND status = 'ACTIVE';
  INSERT INTO public.tenant_plan_assignments (tenant_id, plan_id, status, starts_at, expires_at, assigned_by, created_by, updated_by, reason)
  VALUES (p_customer_id, v_plan.plan_id, 'ACTIVE', COALESCE(p_starts_at, now()), p_expires_at, v_actor.id, v_actor.id, v_actor.id, p_reason)
  RETURNING assignment_id INTO v_assignment_id;
  INSERT INTO public.tenant_entitlements (tenant_id, plan_id, feature_id, entitlement_status, starts_at, expires_at, source, override_reason, created_by, updated_by)
  SELECT p_customer_id, v_plan.plan_id, pf.feature_id,
    CASE WHEN pf.feature_state IN ('ENABLED','BETA') THEN 'ACTIVE' WHEN pf.feature_state = 'TRIAL' THEN 'TRIAL' ELSE 'DISABLED' END,
    COALESCE(p_starts_at, now()), p_expires_at, 'PLAN', p_reason, v_actor.id, v_actor.id
  FROM public.plan_features pf WHERE pf.plan_id = v_plan.plan_id
  ON CONFLICT (tenant_id, feature_id) DO UPDATE
  SET plan_id = EXCLUDED.plan_id, entitlement_status = EXCLUDED.entitlement_status,
      starts_at = EXCLUDED.starts_at, expires_at = EXCLUDED.expires_at,
      source = 'PLAN', override_reason = EXCLUDED.override_reason,
      updated_by = EXCLUDED.updated_by, updated_at = now(), status_changed_at = now();
  PERFORM public.record_platform_audit_event('PLAN_ASSIGNED', 'platform_plan', v_plan.plan_id::text, p_customer_id, p_reason, '{}'::jsonb, jsonb_build_object('plan_key', p_plan_key, 'assignment_id', v_assignment_id));
  RETURN v_assignment_id;
END; $$;

CREATE OR REPLACE FUNCTION public.grant_tenant_entitlement(
  p_customer_id uuid, p_feature_key text, p_status text DEFAULT 'ACTIVE',
  p_source text DEFAULT 'MANUAL', p_expires_at timestamptz DEFAULT NULL, p_reason text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor public.admin_users%ROWTYPE; v_feature public.platform_features%ROWTYPE; v_entitlement_id uuid;
BEGIN
  IF NOT public.has_platform_permission('platform.entitlement.manage') THEN
    RAISE EXCEPTION 'forbidden: platform.entitlement.manage required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_actor FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true LIMIT 1;
  SELECT * INTO v_feature FROM public.platform_features WHERE feature_key = p_feature_key LIMIT 1;
  IF v_feature.feature_id IS NULL THEN RAISE EXCEPTION 'unknown feature: %', p_feature_key USING ERRCODE = '22023'; END IF;
  INSERT INTO public.tenant_entitlements (tenant_id, feature_id, entitlement_status, starts_at, expires_at, source, override_reason, created_by, updated_by)
  VALUES (p_customer_id, v_feature.feature_id, p_status, now(), p_expires_at, p_source, p_reason, v_actor.id, v_actor.id)
  ON CONFLICT (tenant_id, feature_id) DO UPDATE
  SET entitlement_status = EXCLUDED.entitlement_status, expires_at = EXCLUDED.expires_at,
      source = EXCLUDED.source, override_reason = EXCLUDED.override_reason,
      updated_by = EXCLUDED.updated_by, updated_at = now(), status_changed_at = now()
  RETURNING entitlement_id INTO v_entitlement_id;
  PERFORM public.record_platform_audit_event(
    CASE WHEN p_status = 'DISABLED' THEN 'ENTITLEMENT_REVOKED' ELSE 'ENTITLEMENT_GRANTED' END,
    'tenant_entitlement', v_entitlement_id::text, p_customer_id, p_reason,
    '{}'::jsonb, jsonb_build_object('feature_key', p_feature_key, 'status', p_status, 'source', p_source, 'expires_at', p_expires_at));
  RETURN v_entitlement_id;
END; $$;

CREATE OR REPLACE FUNCTION public.revoke_tenant_entitlement(p_customer_id uuid, p_feature_key text, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_feature_id uuid; v_entitlement_id uuid; v_before jsonb;
BEGIN
  IF NOT public.has_platform_permission('platform.entitlement.manage') THEN
    RAISE EXCEPTION 'forbidden: platform.entitlement.manage required' USING ERRCODE = '42501';
  END IF;
  SELECT feature_id INTO v_feature_id FROM public.platform_features WHERE feature_key = p_feature_key LIMIT 1;
  IF v_feature_id IS NULL THEN RAISE EXCEPTION 'unknown feature: %', p_feature_key USING ERRCODE = '22023'; END IF;
  SELECT to_jsonb(te.*), te.entitlement_id INTO v_before, v_entitlement_id
  FROM public.tenant_entitlements te WHERE te.tenant_id = p_customer_id AND te.feature_id = v_feature_id LIMIT 1;
  UPDATE public.tenant_entitlements
  SET entitlement_status = 'DISABLED', source = 'MANUAL', override_reason = p_reason,
      updated_at = now(), status_changed_at = now()
  WHERE tenant_id = p_customer_id AND feature_id = v_feature_id
  RETURNING entitlement_id INTO v_entitlement_id;
  IF v_entitlement_id IS NULL THEN
    INSERT INTO public.tenant_entitlements (tenant_id, feature_id, entitlement_status, starts_at, source, override_reason)
    VALUES (p_customer_id, v_feature_id, 'DISABLED', now(), 'MANUAL', p_reason)
    RETURNING entitlement_id INTO v_entitlement_id;
  END IF;
  PERFORM public.record_platform_audit_event('ENTITLEMENT_REVOKED', 'tenant_entitlement', v_entitlement_id::text, p_customer_id, p_reason, COALESCE(v_before, '{}'::jsonb), jsonb_build_object('feature_key', p_feature_key, 'status', 'DISABLED'));
  RETURN v_entitlement_id;
END; $$;

CREATE OR REPLACE FUNCTION public.start_feature_trial(
  p_customer_id uuid, p_feature_key text,
  p_expires_at timestamptz DEFAULT (now() + interval '14 days'),
  p_reason text DEFAULT 'Trial started from Platform Licensing'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor public.admin_users%ROWTYPE; v_feature public.platform_features%ROWTYPE; v_trial_id uuid;
BEGIN
  IF NOT public.has_platform_permission('platform.trial.manage') THEN
    RAISE EXCEPTION 'forbidden: platform.trial.manage required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_actor FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true LIMIT 1;
  SELECT * INTO v_feature FROM public.platform_features WHERE feature_key = p_feature_key LIMIT 1;
  IF v_feature.feature_id IS NULL THEN RAISE EXCEPTION 'unknown feature: %', p_feature_key USING ERRCODE = '22023'; END IF;
  INSERT INTO public.feature_trials (tenant_id, feature_id, starts_at, expires_at, status, activated_by, reason, created_by, updated_by)
  VALUES (p_customer_id, v_feature.feature_id, now(), COALESCE(p_expires_at, now() + interval '14 days'), 'ACTIVE', v_actor.id, p_reason, v_actor.id, v_actor.id)
  RETURNING trial_id INTO v_trial_id;
  INSERT INTO public.tenant_entitlements (tenant_id, feature_id, entitlement_status, starts_at, expires_at, source, override_reason, created_by, updated_by)
  VALUES (p_customer_id, v_feature.feature_id, 'TRIAL', now(), COALESCE(p_expires_at, now() + interval '14 days'), 'TRIAL', p_reason, v_actor.id, v_actor.id)
  ON CONFLICT (tenant_id, feature_id) DO UPDATE
  SET entitlement_status = 'TRIAL', starts_at = EXCLUDED.starts_at, expires_at = EXCLUDED.expires_at,
      source = 'TRIAL', override_reason = EXCLUDED.override_reason,
      updated_by = EXCLUDED.updated_by, updated_at = now(), status_changed_at = now();
  PERFORM public.record_platform_audit_event('TRIAL_STARTED', 'feature_trial', v_trial_id::text, p_customer_id, p_reason, '{}'::jsonb, jsonb_build_object('feature_key', p_feature_key, 'expires_at', p_expires_at));
  RETURN v_trial_id;
END; $$;

CREATE OR REPLACE FUNCTION public.end_feature_trial(p_trial_id uuid, p_reason text DEFAULT 'Trial ended')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor public.admin_users%ROWTYPE; v_trial public.feature_trials%ROWTYPE; v_feature_key text;
BEGIN
  IF NOT public.has_platform_permission('platform.trial.manage') THEN
    RAISE EXCEPTION 'forbidden: platform.trial.manage required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_actor FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true LIMIT 1;
  SELECT * INTO v_trial FROM public.feature_trials WHERE trial_id = p_trial_id LIMIT 1;
  IF v_trial.trial_id IS NULL THEN RAISE EXCEPTION 'unknown trial: %', p_trial_id USING ERRCODE = '22023'; END IF;
  SELECT feature_key INTO v_feature_key FROM public.platform_features WHERE feature_id = v_trial.feature_id;
  UPDATE public.feature_trials SET status = 'CANCELLED', ended_by = v_actor.id, updated_by = v_actor.id,
    reason = p_reason, updated_at = now(), status_changed_at = now() WHERE trial_id = p_trial_id;
  UPDATE public.tenant_entitlements SET entitlement_status = 'DISABLED', source = 'TRIAL', override_reason = p_reason,
    updated_by = v_actor.id, updated_at = now(), status_changed_at = now()
  WHERE tenant_id = v_trial.tenant_id AND feature_id = v_trial.feature_id AND source = 'TRIAL';
  PERFORM public.record_platform_audit_event('TRIAL_ENDED', 'feature_trial', p_trial_id::text, v_trial.tenant_id, p_reason, to_jsonb(v_trial), jsonb_build_object('feature_key', v_feature_key, 'status', 'CANCELLED'));
  RETURN p_trial_id;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_expired_feature_trials()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer := 0; r record;
BEGIN
  IF NOT (COALESCE(auth.role(), '') = 'service_role' OR public.has_platform_permission('platform.trial.manage')) THEN
    RAISE EXCEPTION 'forbidden: platform.trial.manage required' USING ERRCODE = '42501';
  END IF;
  FOR r IN SELECT ft.*, pf.feature_key FROM public.feature_trials ft
    JOIN public.platform_features pf ON pf.feature_id = ft.feature_id
    WHERE ft.status = 'ACTIVE' AND ft.expires_at <= now()
  LOOP
    UPDATE public.feature_trials SET status = 'EXPIRED', updated_at = now(), status_changed_at = now() WHERE trial_id = r.trial_id;
    UPDATE public.tenant_entitlements SET entitlement_status = 'EXPIRED', updated_at = now(), status_changed_at = now(),
      override_reason = 'Trial expired automatically.'
    WHERE tenant_id = r.tenant_id AND feature_id = r.feature_id AND source = 'TRIAL';
    PERFORM public.record_platform_audit_event('TRIAL_EXPIRED', 'feature_trial', r.trial_id::text, r.tenant_id, 'Trial expired automatically.', to_jsonb(r), jsonb_build_object('feature_key', r.feature_key, 'status', 'EXPIRED'));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION public.set_feature_flag_state(
  p_feature_key text, p_feature_state text, p_customer_id uuid DEFAULT NULL, p_reason text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor public.admin_users%ROWTYPE; v_feature public.platform_features%ROWTYPE; v_flag_id uuid;
BEGIN
  IF NOT public.has_platform_permission('platform.feature.manage') THEN
    RAISE EXCEPTION 'forbidden: platform.feature.manage required' USING ERRCODE = '42501';
  END IF;
  IF p_feature_state NOT IN ('ENABLED','DISABLED','HIDDEN','BETA','TRIAL') THEN
    RAISE EXCEPTION 'invalid feature state: %', p_feature_state USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_actor FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true LIMIT 1;
  SELECT * INTO v_feature FROM public.platform_features WHERE feature_key = p_feature_key LIMIT 1;
  IF v_feature.feature_id IS NULL THEN RAISE EXCEPTION 'unknown feature: %', p_feature_key USING ERRCODE = '22023'; END IF;
  INSERT INTO public.feature_flags (flag_key, flag_value, description, is_platform_only, category, customer_id, feature_id, feature_state, updated_by, created_by, status_changed_at)
  VALUES ('license_' || p_feature_key, p_feature_state IN ('ENABLED','BETA','TRIAL'),
    'Commercial licensing state for ' || v_feature.feature_name, false, lower(v_feature.category),
    p_customer_id, v_feature.feature_id, p_feature_state, v_actor.id, v_actor.id, now())
  ON CONFLICT (flag_key) DO UPDATE
  SET flag_value = EXCLUDED.flag_value, feature_id = EXCLUDED.feature_id, feature_state = EXCLUDED.feature_state,
      updated_by = EXCLUDED.updated_by, updated_at = now(), status_changed_at = now()
  RETURNING id INTO v_flag_id;
  PERFORM public.record_platform_audit_event(
    CASE p_feature_state WHEN 'ENABLED' THEN 'FEATURE_ENABLED' WHEN 'HIDDEN' THEN 'FEATURE_HIDDEN' ELSE 'FEATURE_DISABLED' END,
    'feature_flag', v_flag_id::text, p_customer_id, p_reason,
    '{}'::jsonb, jsonb_build_object('feature_key', p_feature_key, 'feature_state', p_feature_state));
  RETURN v_flag_id;
END; $$;

CREATE OR REPLACE FUNCTION public.set_usage_limit(
  p_customer_id uuid, p_limit_key text, p_limit_value integer, p_reason text,
  p_feature_key text DEFAULT NULL, p_hard_limit boolean DEFAULT true
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor public.admin_users%ROWTYPE; v_feature_id uuid; v_limit_id uuid;
BEGIN
  IF NOT public.has_platform_permission('platform.entitlement.manage') THEN
    RAISE EXCEPTION 'forbidden: platform.entitlement.manage required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_actor FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true LIMIT 1;
  IF p_feature_key IS NOT NULL THEN
    SELECT feature_id INTO v_feature_id FROM public.platform_features WHERE feature_key = p_feature_key LIMIT 1;
  END IF;
  INSERT INTO public.usage_limits (tenant_id, feature_id, limit_key, limit_name, limit_value, hard_limit, source, status, created_by, updated_by)
  VALUES (p_customer_id, v_feature_id, p_limit_key, initcap(replace(p_limit_key, '_', ' ')), p_limit_value, COALESCE(p_hard_limit, true), 'MANUAL', 'ACTIVE', v_actor.id, v_actor.id)
  ON CONFLICT DO NOTHING
  RETURNING usage_limit_id INTO v_limit_id;
  IF v_limit_id IS NULL THEN
    UPDATE public.usage_limits SET feature_id = v_feature_id, limit_name = initcap(replace(p_limit_key, '_', ' ')),
      limit_value = p_limit_value, hard_limit = COALESCE(p_hard_limit, true), source = 'MANUAL', status = 'ACTIVE',
      updated_by = v_actor.id, updated_at = now(), status_changed_at = now()
    WHERE tenant_id = p_customer_id AND limit_key = p_limit_key
    RETURNING usage_limit_id INTO v_limit_id;
  END IF;
  PERFORM public.record_platform_audit_event('USAGE_LIMIT_CHANGED', 'usage_limit', v_limit_id::text, p_customer_id, p_reason, '{}'::jsonb, jsonb_build_object('limit_key', p_limit_key, 'limit_value', p_limit_value, 'hard_limit', p_hard_limit));
  RETURN v_limit_id;
END; $$;

CREATE OR REPLACE FUNCTION public.check_usage_limit(p_limit_key text, p_increment integer DEFAULT 0, p_customer_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer_id uuid := COALESCE(p_customer_id, public.current_customer_id());
  v_limit public.usage_limits%ROWTYPE; v_actual integer := 0; v_allowed boolean := true; v_plan_id uuid;
BEGIN
  IF v_customer_id IS NULL THEN RETURN jsonb_build_object('allowed', false, 'code', 'TENANT_NOT_RESOLVED', 'limit_key', p_limit_key); END IF;
  SELECT tpa.plan_id INTO v_plan_id FROM public.tenant_plan_assignments tpa
  WHERE tpa.tenant_id = v_customer_id AND tpa.status = 'ACTIVE' ORDER BY tpa.created_at DESC LIMIT 1;
  SELECT * INTO v_limit FROM public.usage_limits ul WHERE ul.limit_key = p_limit_key AND ul.status = 'ACTIVE'
    AND (ul.tenant_id = v_customer_id OR (ul.tenant_id IS NULL AND ul.plan_id = v_plan_id))
  ORDER BY ul.tenant_id NULLS LAST LIMIT 1;
  IF p_limit_key = 'driver_count' THEN
    SELECT COUNT(*)::integer INTO v_actual FROM public.drivers WHERE customer_id = v_customer_id;
  ELSIF p_limit_key = 'vehicle_count' THEN
    SELECT COUNT(*)::integer INTO v_actual FROM public.vehicles WHERE customer_id = v_customer_id;
  ELSIF p_limit_key = 'admin_user_count' THEN
    SELECT COUNT(*)::integer INTO v_actual FROM public.admin_users WHERE customer_id = v_customer_id AND is_active = true;
  ELSIF p_limit_key = 'credit_account_count' THEN
    SELECT COUNT(*)::integer INTO v_actual FROM public.credit_accounts WHERE customer_id = v_customer_id;
  ELSE v_actual := 0; END IF;
  IF v_limit.usage_limit_id IS NOT NULL AND v_limit.limit_value IS NOT NULL THEN
    v_allowed := (v_actual + COALESCE(p_increment, 0)) <= v_limit.limit_value;
  END IF;
  RETURN jsonb_build_object('allowed', v_allowed,
    'code', CASE WHEN v_allowed THEN 'USAGE_ALLOWED' ELSE 'USAGE_LIMIT_EXCEEDED' END,
    'limit_key', p_limit_key, 'limit_value', v_limit.limit_value, 'actual_usage', v_actual,
    'requested_increment', COALESCE(p_increment, 0), 'hard_limit', COALESCE(v_limit.hard_limit, false),
    'message', CASE WHEN v_allowed THEN 'Within limit.' ELSE 'Exceeds limit.' END);
END; $$;

CREATE OR REPLACE FUNCTION public.request_feature_upgrade(p_feature_key text, p_reason text DEFAULT 'Upgrade requested')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer_id uuid := public.current_customer_id(); v_event_id uuid;
BEGIN
  IF NOT public.has_platform_permission('platform.view') THEN
    RAISE EXCEPTION 'forbidden: platform.view required' USING ERRCODE = '42501';
  END IF;
  v_event_id := public.record_platform_audit_event('UPGRADE_REQUESTED', 'platform_feature', p_feature_key, v_customer_id, p_reason, '{}'::jsonb, jsonb_build_object('feature_key', p_feature_key));
  RETURN v_event_id;
END; $$;

CREATE OR REPLACE VIEW public.v_platform_entitlement_matrix WITH (security_invoker = true) AS
SELECT c.id AS tenant_id, c.name AS tenant_name, c.slug AS tenant_slug,
  pp.plan_id, pp.plan_key, pp.plan_name,
  pf.feature_id, pf.feature_key, pf.feature_name, pf.category, pf.module_key,
  pf.status AS feature_catalog_status,
  COALESCE(ff.feature_state, pf.default_flag_state) AS feature_state,
  plf.feature_state AS plan_feature_state,
  te.entitlement_status, te.source, te.starts_at, te.expires_at,
  CASE
    WHEN pf.status = 'HIDDEN' OR COALESCE(ff.feature_state, pf.default_flag_state) = 'HIDDEN' OR COALESCE(plf.feature_state, 'DISABLED') = 'HIDDEN' THEN 'HIDDEN'
    WHEN COALESCE(ff.feature_state, pf.default_flag_state) = 'DISABLED' THEN 'DISABLED'
    WHEN te.entitlement_status = 'TRIAL' AND COALESCE(te.expires_at, now() + interval '1 day') <= now() THEN 'EXPIRED'
    WHEN te.entitlement_status = 'TRIAL' THEN 'TRIAL'
    WHEN te.entitlement_status = 'ACTIVE' AND (te.expires_at IS NULL OR te.expires_at > now()) THEN
      CASE WHEN COALESCE(ff.feature_state, plf.feature_state, pf.default_flag_state) = 'BETA' THEN 'BETA' ELSE 'ENABLED' END
    WHEN COALESCE(plf.feature_state, 'DISABLED') = 'DISABLED' THEN 'DISABLED'
    WHEN te.entitlement_status = 'PENDING' THEN 'PENDING'
    ELSE 'LOCKED'
  END AS access_state,
  pf.description, pf.upgrade_copy_json, te.override_reason,
  greatest(COALESCE(c.updated_at, c.created_at), COALESCE(pp.updated_at, pp.created_at),
    COALESCE(pf.updated_at, pf.created_at), COALESCE(te.updated_at, te.created_at, now())) AS last_updated_at
FROM public.customers c
LEFT JOIN public.tenant_plan_assignments tpa
  ON tpa.tenant_id = c.id AND tpa.status = 'ACTIVE' AND tpa.starts_at <= now() AND (tpa.expires_at IS NULL OR tpa.expires_at > now())
LEFT JOIN public.platform_plans pp ON pp.plan_id = tpa.plan_id
CROSS JOIN public.platform_features pf
LEFT JOIN public.plan_features plf ON plf.plan_id = pp.plan_id AND plf.feature_id = pf.feature_id
LEFT JOIN public.tenant_entitlements te ON te.tenant_id = c.id AND te.feature_id = pf.feature_id
LEFT JOIN public.feature_flags ff ON ff.feature_id = pf.feature_id AND ff.customer_id IS NULL
WHERE c.is_active = true;

CREATE OR REPLACE VIEW public.v_platform_trial_status WITH (security_invoker = true) AS
SELECT ft.trial_id, ft.tenant_id, c.name AS tenant_name, c.slug AS tenant_slug,
  pf.feature_key, pf.feature_name, pf.category,
  ft.starts_at, ft.expires_at,
  CASE WHEN ft.status = 'ACTIVE' AND ft.expires_at <= now() THEN 'EXPIRED_PENDING_SYNC' ELSE ft.status END AS trial_status,
  ft.activated_by, au.email AS activated_by_email, ft.reason, ft.created_at, ft.updated_at
FROM public.feature_trials ft
JOIN public.customers c ON c.id = ft.tenant_id
JOIN public.platform_features pf ON pf.feature_id = ft.feature_id
LEFT JOIN public.admin_users au ON au.id = ft.activated_by;

CREATE OR REPLACE VIEW public.v_platform_usage_limit_status WITH (security_invoker = true) AS
WITH active_plan AS (SELECT tenant_id, plan_id FROM public.tenant_plan_assignments WHERE status = 'ACTIVE'),
resolved_limits AS (
  SELECT c.id AS tenant_id, c.name AS tenant_name, c.slug AS tenant_slug,
    ul.usage_limit_id, ul.limit_key, ul.limit_name, ul.limit_value, ul.hard_limit, ul.source, ul.status,
    COALESCE(ul.feature_id, pf.feature_id) AS feature_id
  FROM public.customers c
  LEFT JOIN active_plan ap ON ap.tenant_id = c.id
  JOIN public.usage_limits ul ON ul.tenant_id = c.id OR (ul.tenant_id IS NULL AND ul.plan_id = ap.plan_id)
  LEFT JOIN public.platform_features pf ON pf.feature_id = ul.feature_id
  WHERE c.is_active = true AND ul.status = 'ACTIVE'
)
SELECT rl.*,
  CASE rl.limit_key
    WHEN 'driver_count' THEN (SELECT COUNT(*)::integer FROM public.drivers d WHERE d.customer_id = rl.tenant_id)
    WHEN 'vehicle_count' THEN (SELECT COUNT(*)::integer FROM public.vehicles v WHERE v.customer_id = rl.tenant_id)
    WHEN 'admin_user_count' THEN (SELECT COUNT(*)::integer FROM public.admin_users au WHERE au.customer_id = rl.tenant_id AND au.is_active = true)
    WHEN 'credit_account_count' THEN (SELECT COUNT(*)::integer FROM public.credit_accounts ca WHERE ca.customer_id = rl.tenant_id)
    ELSE 0
  END AS current_usage,
  CASE
    WHEN rl.limit_value IS NULL THEN 'UNLIMITED'
    WHEN CASE rl.limit_key
      WHEN 'driver_count' THEN (SELECT COUNT(*)::integer FROM public.drivers d WHERE d.customer_id = rl.tenant_id)
      WHEN 'vehicle_count' THEN (SELECT COUNT(*)::integer FROM public.vehicles v WHERE v.customer_id = rl.tenant_id)
      WHEN 'admin_user_count' THEN (SELECT COUNT(*)::integer FROM public.admin_users au WHERE au.customer_id = rl.tenant_id AND au.is_active = true)
      WHEN 'credit_account_count' THEN (SELECT COUNT(*)::integer FROM public.credit_accounts ca WHERE ca.customer_id = rl.tenant_id)
      ELSE 0 END > rl.limit_value THEN 'EXCEEDED'
    WHEN rl.limit_value > 0 AND CASE rl.limit_key
      WHEN 'driver_count' THEN (SELECT COUNT(*)::numeric FROM public.drivers d WHERE d.customer_id = rl.tenant_id)
      WHEN 'vehicle_count' THEN (SELECT COUNT(*)::numeric FROM public.vehicles v WHERE v.customer_id = rl.tenant_id)
      WHEN 'admin_user_count' THEN (SELECT COUNT(*)::numeric FROM public.admin_users au WHERE au.customer_id = rl.tenant_id AND au.is_active = true)
      WHEN 'credit_account_count' THEN (SELECT COUNT(*)::numeric FROM public.credit_accounts ca WHERE ca.customer_id = rl.tenant_id)
      ELSE 0 END >= rl.limit_value * 0.8 THEN 'NEAR_LIMIT'
    ELSE 'OK'
  END AS limit_status
FROM resolved_limits rl;

CREATE OR REPLACE VIEW public.v_platform_audit_timeline WITH (security_invoker = true) AS
SELECT pae.audit_event_id, pae.tenant_id, c.name AS tenant_name, c.slug AS tenant_slug,
  pae.actor_id, au.email AS actor_email, pae.actor_role,
  pae.event_type, pae.target_type, pae.target_id,
  pae.before_json, pae.after_json, pae.reason, pae.created_at
FROM public.platform_audit_events pae
LEFT JOIN public.customers c ON c.id = pae.tenant_id
LEFT JOIN public.admin_users au ON au.id = pae.actor_id;

CREATE OR REPLACE VIEW public.v_platform_upgrade_catalog WITH (security_invoker = true) AS
SELECT pf.feature_id, pf.feature_key, pf.feature_name, pf.category, pf.module_key,
  pf.status, pf.default_flag_state, pf.description, pf.upgrade_copy_json,
  array_agg(DISTINCT pp.plan_key ORDER BY pp.plan_key) FILTER (WHERE plf.feature_state IN ('ENABLED','BETA','TRIAL')) AS available_in_plans,
  array_agg(DISTINCT pao.add_on_key ORDER BY pao.add_on_key) FILTER (WHERE pao.status = 'ACTIVE') AS available_add_ons
FROM public.platform_features pf
LEFT JOIN public.plan_features plf ON plf.feature_id = pf.feature_id
LEFT JOIN public.platform_plans pp ON pp.plan_id = plf.plan_id
LEFT JOIN public.platform_add_ons pao ON pao.feature_id = pf.feature_id
GROUP BY pf.feature_id;

CREATE OR REPLACE FUNCTION public.get_tenant_entitlements(p_customer_id uuid DEFAULT NULL)
RETURNS TABLE (tenant_id uuid, tenant_name text, plan_key text, plan_name text,
  feature_key text, feature_name text, category text, module_key text,
  access_state text, entitlement_status text, feature_state text, source text, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.tenant_id, v.tenant_name, v.plan_key, v.plan_name,
    v.feature_key, v.feature_name, v.category, v.module_key,
    v.access_state, v.entitlement_status, v.feature_state, v.source, v.expires_at
  FROM public.v_platform_entitlement_matrix v
  WHERE (p_customer_id IS NULL OR v.tenant_id = p_customer_id)
    AND (COALESCE(auth.role(), '') = 'service_role' OR public.is_platform_owner() OR v.tenant_id = public.current_customer_id())
$$;

GRANT SELECT ON public.platform_plans TO authenticated, service_role;
GRANT SELECT ON public.platform_features TO authenticated, service_role;
GRANT SELECT ON public.plan_features TO authenticated, service_role;
GRANT SELECT ON public.tenant_plan_assignments TO authenticated, service_role;
GRANT SELECT ON public.tenant_entitlements TO authenticated, service_role;
GRANT SELECT ON public.feature_trials TO authenticated, service_role;
GRANT SELECT ON public.usage_limits TO authenticated, service_role;
GRANT SELECT ON public.platform_add_ons TO authenticated, service_role;
GRANT SELECT ON public.tenant_add_ons TO authenticated, service_role;
GRANT SELECT ON public.platform_audit_events TO authenticated, service_role;
GRANT SELECT ON public.v_platform_entitlement_matrix TO authenticated, service_role;
GRANT SELECT ON public.v_platform_trial_status TO authenticated, service_role;
GRANT SELECT ON public.v_platform_usage_limit_status TO authenticated, service_role;
GRANT SELECT ON public.v_platform_audit_timeline TO authenticated, service_role;
GRANT SELECT ON public.v_platform_upgrade_catalog TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.has_platform_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_platform_audit_event(text, text, text, uuid, text, jsonb, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_feature_entitlement(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.require_feature_entitlement(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_platform_plan(uuid, text, text, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.grant_tenant_entitlement(uuid, text, text, text, timestamptz, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_tenant_entitlement(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_feature_trial(uuid, text, timestamptz, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.end_feature_trial(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_expired_feature_trials() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_feature_flag_state(text, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_usage_limit(uuid, text, integer, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_usage_limit(text, integer, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_feature_upgrade(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_entitlements(uuid) TO authenticated, service_role;

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_plans','platform_features','plan_features','tenant_plan_assignments','tenant_entitlements','feature_trials','feature_flags','usage_limits','platform_add_ons','tenant_add_ons','platform_audit_events']
  LOOP
    BEGIN EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t); EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; WHEN undefined_object THEN NULL; END;
  END LOOP;
END; $$;

NOTIFY pgrst, 'reload schema';

DO $$
DECLARE v_version text := '20260619110000'; v_name text := 'layer3i_platform_licensing_entitlements';
  v_has_name boolean; v_has_statements boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = v_version) THEN
    RAISE NOTICE 'Migration % already marked applied', v_version; RETURN;
  END IF;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations' AND column_name = 'name') INTO v_has_name;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations' AND column_name = 'statements') INTO v_has_statements;
  IF v_has_name AND v_has_statements THEN
    EXECUTE 'insert into supabase_migrations.schema_migrations(version, name, statements) values ($1, $2, array[]::text[])' USING v_version, v_name;
  ELSIF v_has_name THEN
    EXECUTE 'insert into supabase_migrations.schema_migrations(version, name) values ($1, $2)' USING v_version, v_name;
  ELSIF v_has_statements THEN
    EXECUTE 'insert into supabase_migrations.schema_migrations(version, statements) values ($1, array[]::text[])' USING v_version;
  ELSE
    EXECUTE 'insert into supabase_migrations.schema_migrations(version) values ($1)' USING v_version;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';