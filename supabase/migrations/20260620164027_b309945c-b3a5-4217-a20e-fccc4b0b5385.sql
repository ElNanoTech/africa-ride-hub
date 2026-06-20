-- Layer 3X retry 2: drop array_to_string from generated tsvector (stable -> not allowed)

DO $$
BEGIN
  IF to_regclass('public.customers') IS NULL THEN RAISE EXCEPTION 'Layer 3X requires public.customers'; END IF;
  IF to_regclass('public.admin_users') IS NULL THEN RAISE EXCEPTION 'Layer 3X requires public.admin_users'; END IF;
  IF to_regclass('public.drivers') IS NULL THEN RAISE EXCEPTION 'Layer 3X requires public.drivers'; END IF;
  IF to_regclass('public.platform_features') IS NULL THEN RAISE EXCEPTION 'Layer 3X expects Layer 3I platform licensing features'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_operating_experience_permission(permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(auth.role(), '') = 'service_role'
    OR session_user IN ('postgres','supabase_admin')
    OR public.is_platform_owner()
    OR CASE permission
      WHEN 'guidance.view' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','agent_support','loan_officer','support']) OR public.current_driver_id() IS NOT NULL
      WHEN 'guidance.manage' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'training.view' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','agent_support','loan_officer','support']) OR public.current_driver_id() IS NOT NULL
      WHEN 'training.manage' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_support','support'])
      WHEN 'knowledge.manage' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_support','support'])
      WHEN 'playbook.manage' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'adoption.view' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_support','support'])
      WHEN 'health_score.view' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      ELSE false
    END
$$;

CREATE OR REPLACE FUNCTION public.operating_experience_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

CREATE TABLE IF NOT EXISTS public.role_experiences (
  experience_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text NOT NULL UNIQUE,
  role_name text NOT NULL,
  homepage_path text NOT NULL DEFAULT '/admin/operating-experience',
  focus_area text NOT NULL,
  navigation_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  dashboard_cards_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  primary_actions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  training_track_keys text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DRAFT','RETIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.learning_modules (
  module_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL,
  audience_role_keys text[] NOT NULL DEFAULT '{}',
  description text NOT NULL DEFAULT '',
  content_md text NOT NULL DEFAULT '',
  estimated_minutes integer NOT NULL DEFAULT 10,
  is_driver_education boolean NOT NULL DEFAULT false,
  checklist_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.learning_progress (
  progress_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.learning_modules(module_id) ON DELETE CASCADE,
  admin_user_id uuid REFERENCES public.admin_users(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE CASCADE,
  assigned_role_key text,
  status text NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED','IN_PROGRESS','COMPLETED','WAIVED')),
  progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  score integer CHECK (score IS NULL OR (score BETWEEN 0 AND 100)),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  due_at timestamptz,
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_progress_actor_check CHECK (admin_user_id IS NOT NULL OR driver_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_learning_progress_admin
  ON public.learning_progress(module_id, admin_user_id) WHERE admin_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_learning_progress_driver
  ON public.learning_progress(module_id, driver_id) WHERE driver_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.knowledge_articles (
  article_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_key text NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL,
  summary text NOT NULL DEFAULT '',
  body_md text NOT NULL DEFAULT '',
  role_keys text[] NOT NULL DEFAULT '{}',
  related_routes text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('simple'::regconfig, coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(body_md, ''))
  ) STORED,
  created_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.operating_playbooks (
  playbook_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_key text NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL,
  owner_role_key text NOT NULL,
  purpose text NOT NULL,
  trigger_conditions text NOT NULL DEFAULT '',
  steps_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  empty_state_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  disabled_state_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  created_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guided_workflows (
  workflow_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_key text NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  target_route text NOT NULL DEFAULT '/admin/operating-experience',
  owner_role_key text NOT NULL,
  required_permissions text[] NOT NULL DEFAULT '{}',
  steps_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DRAFT','RETIRED')),
  created_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workflow_progress (
  progress_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES public.guided_workflows(workflow_id) ON DELETE CASCADE,
  actor_admin_user_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  subject_type text NOT NULL DEFAULT 'tenant',
  subject_id text,
  current_step_key text NOT NULL,
  status text NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED')),
  progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_workflow_progress_subject
  ON public.workflow_progress(customer_id, workflow_id, subject_type, COALESCE(subject_id, 'tenant'));

CREATE TABLE IF NOT EXISTS public.next_best_actions (
  action_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  role_key text NOT NULL DEFAULT 'manager',
  action_type text NOT NULL,
  urgency text NOT NULL DEFAULT 'TODAY' CHECK (urgency IN ('URGENT','TODAY','THIS_WEEK','OPPORTUNITY','TRAINING_NEEDED')),
  title text NOT NULL,
  description text NOT NULL,
  entity_type text,
  entity_id text,
  cta_label text NOT NULL DEFAULT 'Open',
  href text NOT NULL DEFAULT '/admin/operating-experience',
  source text NOT NULL DEFAULT 'RULE_ENGINE',
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','DISMISSED','COMPLETED')),
  priority_score integer NOT NULL DEFAULT 50,
  due_at timestamptz,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_next_best_action_open_source
  ON public.next_best_actions(customer_id, source, action_type, COALESCE(entity_id, action_type))
  WHERE status = 'OPEN';

CREATE TABLE IF NOT EXISTS public.tenant_health_scores (
  score_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE UNIQUE,
  health_score integer NOT NULL DEFAULT 70 CHECK (health_score BETWEEN 0 AND 100),
  feature_adoption_score integer NOT NULL DEFAULT 70 CHECK (feature_adoption_score BETWEEN 0 AND 100),
  workflow_completion_score integer NOT NULL DEFAULT 70 CHECK (workflow_completion_score BETWEEN 0 AND 100),
  training_completion_score integer NOT NULL DEFAULT 70 CHECK (training_completion_score BETWEEN 0 AND 100),
  collections_efficiency_score integer NOT NULL DEFAULT 70 CHECK (collections_efficiency_score BETWEEN 0 AND 100),
  driver_adoption_score integer NOT NULL DEFAULT 70 CHECK (driver_adoption_score BETWEEN 0 AND 100),
  score_status text NOT NULL DEFAULT 'HEALTHY' CHECK (score_status IN ('AT_RISK','WATCH','HEALTHY','EXCELLENT')),
  scoring_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  next_review_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.adoption_metrics (
  metric_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  metric_date date NOT NULL DEFAULT current_date,
  role_key text,
  module_key text,
  feature_key text,
  metric_name text NOT NULL,
  metric_value numeric NOT NULL DEFAULT 0,
  dimensions_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, metric_date, role_key, module_key, feature_key, metric_name)
);

CREATE TABLE IF NOT EXISTS public.help_content (
  help_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screen_key text NOT NULL UNIQUE,
  route_pattern text NOT NULL,
  title text NOT NULL,
  body_md text NOT NULL DEFAULT '',
  tooltip_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  faq_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  quick_tips_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  example_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  created_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.operating_guidance_audit_events (
  audit_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  actor_admin_user_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  actor_driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  actor_role text,
  event_type text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  reason text,
  before_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_operating_guidance_audit_idempotency
  ON public.operating_guidance_audit_events(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_learning_modules_category_status ON public.learning_modules(category, status, sort_order);
CREATE INDEX IF NOT EXISTS idx_learning_progress_customer_status ON public.learning_progress(customer_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_search ON public.knowledge_articles USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_operating_playbooks_category ON public.operating_playbooks(category, status);
CREATE INDEX IF NOT EXISTS idx_guided_workflows_category ON public.guided_workflows(category, status);
CREATE INDEX IF NOT EXISTS idx_workflow_progress_customer_status ON public.workflow_progress(customer_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_next_best_actions_customer_urgency ON public.next_best_actions(customer_id, status, urgency, priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_adoption_metrics_customer_date ON public.adoption_metrics(customer_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_help_content_route ON public.help_content(route_pattern, status);
CREATE INDEX IF NOT EXISTS idx_operating_guidance_audit_customer_created ON public.operating_guidance_audit_events(customer_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_experiences, public.learning_modules, public.learning_progress, public.knowledge_articles, public.operating_playbooks, public.guided_workflows, public.workflow_progress, public.next_best_actions, public.tenant_health_scores, public.adoption_metrics, public.help_content TO authenticated;
GRANT SELECT, INSERT ON public.operating_guidance_audit_events TO authenticated;
GRANT ALL ON public.role_experiences, public.learning_modules, public.learning_progress, public.knowledge_articles, public.operating_playbooks, public.guided_workflows, public.workflow_progress, public.next_best_actions, public.tenant_health_scores, public.adoption_metrics, public.help_content, public.operating_guidance_audit_events TO service_role;

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['role_experiences','learning_modules','learning_progress','knowledge_articles','operating_playbooks','guided_workflows','workflow_progress','next_best_actions','tenant_health_scores','adoption_metrics','help_content','operating_guidance_audit_events']
  LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t); END LOOP;
END; $$;

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['role_experiences','learning_modules','knowledge_articles','operating_playbooks','guided_workflows','help_content']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "operating catalog select" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "operating catalog manage" ON public.%I', t);
    EXECUTE format('CREATE POLICY "operating catalog select" ON public.%I FOR SELECT TO authenticated USING (public.has_operating_experience_permission(''guidance.view''))', t);
    EXECUTE format('CREATE POLICY "operating catalog manage" ON public.%I FOR ALL TO authenticated USING (public.has_operating_experience_permission(''guidance.manage'')) WITH CHECK (public.has_operating_experience_permission(''guidance.manage''))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['workflow_progress','next_best_actions','tenant_health_scores','adoption_metrics','operating_guidance_audit_events']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "operating tenant select" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "operating tenant manage" ON public.%I', t);
    EXECUTE format('CREATE POLICY "operating tenant select" ON public.%I FOR SELECT TO authenticated USING (public.is_platform_owner() OR customer_id = public.current_customer_id())', t);
    EXECUTE format('CREATE POLICY "operating tenant manage" ON public.%I FOR ALL TO authenticated USING (public.has_operating_experience_permission(''guidance.manage'')) WITH CHECK (public.has_operating_experience_permission(''guidance.manage''))', t);
  END LOOP;
END; $$;

DROP POLICY IF EXISTS "learning progress select" ON public.learning_progress;
CREATE POLICY "learning progress select" ON public.learning_progress FOR SELECT TO authenticated
USING (public.is_platform_owner() OR customer_id = public.current_customer_id()
  OR admin_user_id IN (SELECT au.id FROM public.admin_users au WHERE au.user_id = auth.uid())
  OR driver_id = public.current_driver_id());

DROP POLICY IF EXISTS "learning progress manage" ON public.learning_progress;
CREATE POLICY "learning progress manage" ON public.learning_progress FOR ALL TO authenticated
USING (public.has_operating_experience_permission('training.manage') OR driver_id = public.current_driver_id())
WITH CHECK (public.has_operating_experience_permission('training.manage') OR driver_id = public.current_driver_id());

CREATE OR REPLACE FUNCTION public.prevent_operating_guidance_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'operating guidance audit events are immutable' USING ERRCODE = '25006'; END;
$$;

DROP TRIGGER IF EXISTS trg_operating_guidance_audit_immutable ON public.operating_guidance_audit_events;
CREATE TRIGGER trg_operating_guidance_audit_immutable
BEFORE UPDATE OR DELETE ON public.operating_guidance_audit_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_operating_guidance_audit_mutation();

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['role_experiences','learning_modules','learning_progress','knowledge_articles','operating_playbooks','guided_workflows','workflow_progress','next_best_actions','tenant_health_scores','adoption_metrics','help_content']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_touch_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.operating_experience_touch_updated_at()', t, t);
  END LOOP;
END; $$;

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['learning_modules','learning_progress','knowledge_articles','operating_playbooks','guided_workflows','workflow_progress','next_best_actions','tenant_health_scores','adoption_metrics','help_content','operating_guidance_audit_events']
  LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END; $$;

INSERT INTO public.role_experiences (role_key, role_name, homepage_path, focus_area, navigation_json, dashboard_cards_json, primary_actions_json, training_track_keys) VALUES
  ('owner', 'Owner', '/admin/operating-experience?role=owner', 'Company health, customer success, licensing, and growth readiness.',
    '[{"label":"Tenant Health","href":"/admin/operating-experience?tab=health"},{"label":"Licensing","href":"/admin/platform-administration"},{"label":"Portfolio","href":"/admin/credit-portfolio"}]'::jsonb,
    '[{"label":"Health score","metric":"tenant_health"},{"label":"Open actions","metric":"open_next_best_actions"},{"label":"Training completion","metric":"training_completion"}]'::jsonb,
    '[{"label":"Review tenant health","href":"/admin/operating-experience?tab=health"},{"label":"Refresh next actions","href":"/admin/operating-experience?tab=actions"}]'::jsonb,
    ARRAY['platform_overview','tenant_health','licensing_basics']),
  ('executive', 'Executive', '/admin/operating-experience?role=executive', 'High-signal dashboards and cross-module operating priorities.',
    '[{"label":"Executive Intelligence","href":"/admin/executive-intelligence"},{"label":"Attention","href":"/admin/attention"},{"label":"Health","href":"/admin/operating-experience?tab=health"}]'::jsonb,
    '[{"label":"Portfolio risk","metric":"portfolio_risk"},{"label":"Opportunities","metric":"opportunities"},{"label":"Adoption","metric":"adoption"}]'::jsonb,
    '[{"label":"Open executive dashboard","href":"/admin/executive-intelligence"}]'::jsonb,
    ARRAY['platform_overview','analytics_basics']),
  ('fleet_manager', 'Fleet Manager', '/admin/operating-experience?role=fleet_manager', 'Driver readiness, vehicle availability, inspections, and daily dispatch.',
    '[{"label":"Drivers","href":"/admin/drivers"},{"label":"Vehicle Ops","href":"/admin/vehicle-operations"},{"label":"Fleet Control","href":"/admin/fleet-control"}]'::jsonb,
    '[{"label":"Drivers needing action","metric":"driver_attention"},{"label":"Vehicle blockers","metric":"vehicle_blockers"}]'::jsonb,
    '[{"label":"Create driver","href":"/admin/drivers/new"},{"label":"Review fleet control","href":"/admin/fleet-control"}]'::jsonb,
    ARRAY['fleet_basics','driver_operations']),
  ('finance_manager', 'Finance Manager', '/admin/operating-experience?role=finance_manager', 'Invoices, cash collection, wallets, reconciliation, and finance exceptions.',
    '[{"label":"Finance","href":"/admin/financial-operations"},{"label":"Billing","href":"/admin/billing"},{"label":"Payments","href":"/admin/payments"}]'::jsonb,
    '[{"label":"Overdue amount","metric":"overdue_amount"},{"label":"Unresolved anomalies","metric":"finance_anomalies"}]'::jsonb,
    '[{"label":"Issue invoice","href":"/admin/billing"},{"label":"Open reconciliation","href":"/admin/financial-operations"}]'::jsonb,
    ARRAY['finance_basics','payments_reconciliation']),
  ('collections_manager', 'Collections Manager', '/admin/operating-experience?role=collections_manager', 'Delinquency, promises to pay, escalations, and default handoff.',
    '[{"label":"Collections","href":"/admin/credit-collections"},{"label":"Default Recovery","href":"/admin/default-recovery"},{"label":"Risk","href":"/admin/trust-risk"}]'::jsonb,
    '[{"label":"Past due cases","metric":"past_due_cases"},{"label":"Escalations","metric":"risk_escalations"}]'::jsonb,
    '[{"label":"Open collections queue","href":"/admin/credit-collections"}]'::jsonb,
    ARRAY['collections_basics','default_review']),
  ('risk_manager', 'Risk Manager', '/admin/operating-experience?role=risk_manager', 'Trust signals, risk reviews, default governance, and protection actions.',
    '[{"label":"Trust & Risk","href":"/admin/trust-risk"},{"label":"Driving Behavior","href":"/admin/driving-behavior"},{"label":"Default Recovery","href":"/admin/default-recovery"}]'::jsonb,
    '[{"label":"High risk drivers","metric":"high_risk_drivers"},{"label":"Open incidents","metric":"open_incidents"}]'::jsonb,
    '[{"label":"Review risk queue","href":"/admin/trust-risk"}]'::jsonb,
    ARRAY['trust_basics','risk_governance']),
  ('dispatcher', 'Dispatcher', '/admin/operating-experience?role=dispatcher', 'Assignments, live vehicle availability, driver contact, and route readiness.',
    '[{"label":"Tracking","href":"/admin/tracking"},{"label":"Vehicles","href":"/admin/vehicles"},{"label":"Drivers","href":"/admin/drivers"}]'::jsonb,
    '[{"label":"Available vehicles","metric":"available_vehicles"},{"label":"Drivers without vehicle","metric":"drivers_without_vehicle"}]'::jsonb,
    '[{"label":"Open tracking","href":"/admin/tracking"}]'::jsonb,
    ARRAY['fleet_basics','dispatch_basics']),
  ('driver', 'Driver', '/driver', 'Simple French-first education, payments, score, ownership, and support guidance.',
    '[{"label":"Accueil","href":"/driver"},{"label":"Formation","href":"/driver/formation"},{"label":"Finance","href":"/driver/finance"}]'::jsonb,
    '[{"label":"Training","metric":"driver_training"},{"label":"Score","metric":"driver_score"}]'::jsonb,
    '[{"label":"Commencer la formation","href":"/driver/formation"}]'::jsonb,
    ARRAY['driver_getting_started','driver_payments','driver_ownership']),
  ('support_agent', 'Support Agent', '/admin/operating-experience?role=support_agent', 'Tickets, driver education, knowledge search, and guided troubleshooting.',
    '[{"label":"Support","href":"/admin/support"},{"label":"Knowledge","href":"/admin/operating-experience?tab=knowledge"},{"label":"Drivers","href":"/admin/drivers"}]'::jsonb,
    '[{"label":"Knowledge articles","metric":"knowledge_articles"},{"label":"Training needed","metric":"training_needed"}]'::jsonb,
    '[{"label":"Search knowledge","href":"/admin/operating-experience?tab=knowledge"}]'::jsonb,
    ARRAY['support_basics','driver_education']),
  ('branch_manager', 'Branch Manager', '/admin/operating-experience?role=branch_manager', 'Local branch performance, staff execution, vehicles, and finance follow-up.',
    '[{"label":"Attention","href":"/admin/attention"},{"label":"Finance","href":"/admin/finance"},{"label":"Vehicle Ops","href":"/admin/vehicle-operations"}]'::jsonb,
    '[{"label":"Branch blockers","metric":"branch_blockers"},{"label":"Daily cash","metric":"daily_cash"}]'::jsonb,
    '[{"label":"Start daily review","href":"/admin/attention"}]'::jsonb,
    ARRAY['branch_operations','finance_basics'])
ON CONFLICT (role_key) DO UPDATE
SET role_name=EXCLUDED.role_name, homepage_path=EXCLUDED.homepage_path, focus_area=EXCLUDED.focus_area, navigation_json=EXCLUDED.navigation_json, dashboard_cards_json=EXCLUDED.dashboard_cards_json, primary_actions_json=EXCLUDED.primary_actions_json, training_track_keys=EXCLUDED.training_track_keys, updated_at=now();

INSERT INTO public.learning_modules (module_key, title, category, audience_role_keys, description, content_md, estimated_minutes, is_driver_education, checklist_json, sort_order) VALUES
  ('platform_overview', 'KIRA platform overview', 'Administration', ARRAY['owner','executive','branch_manager'], 'How the modules fit together and where each role starts.', 'Use the operating experience page as the first stop. Start with tenant health, then next-best-actions, then the relevant workflow.', 12, false, '[{"label":"Open role homepage","required":true},{"label":"Review next-best-actions","required":true},{"label":"Search one help article","required":true}]'::jsonb, 10),
  ('fleet_basics', 'Fleet basics', 'Fleet', ARRAY['fleet_manager','dispatcher','branch_manager'], 'Drivers, vehicles, inspections, and assignment hygiene.', 'Keep driver and vehicle records complete before finance or credit work begins.', 18, false, '[{"label":"Create or verify first driver","required":true},{"label":"Create first vehicle","required":true},{"label":"Confirm assignment state","required":true}]'::jsonb, 20),
  ('driver_operations', 'Driver operations', 'Drivers', ARRAY['fleet_manager','support_agent'], 'KYC, status changes, profile completeness, and support handoffs.', 'A driver should always know what is missing and how to fix it.', 16, false, '[{"label":"Review KYC queue","required":true},{"label":"Open Driver 360","required":true}]'::jsonb, 30),
  ('finance_basics', 'Finance basics', 'Finance', ARRAY['finance_manager','branch_manager'], 'Invoices, payment status, wallets, and reconciliation guardrails.', 'Finance users should start with overdue, partial, and unresolved records.', 20, false, '[{"label":"Open billing","required":true},{"label":"Review reconciliation exceptions","required":true}]'::jsonb, 40),
  ('trust_basics', 'Trust basics', 'Trust', ARRAY['risk_manager','fleet_manager'], 'Trust signals, risk queues, and driver coaching.', 'Trust work reduces surprises by making risk visible before default.', 18, false, '[{"label":"Open Trust & Risk","required":true},{"label":"Review a high-risk driver","required":true}]'::jsonb, 50),
  ('credit_basics', 'Credit basics', 'Credit', ARRAY['collections_manager','finance_manager','executive'], 'Credit account lifecycle from product to ownership completion.', 'Credit work depends on eligibility, underwriting, contracts, repayment, collections, default review, and ownership completion.', 24, false, '[{"label":"Open credit operations","required":true},{"label":"Trace one account lifecycle","required":true}]'::jsonb, 60),
  ('collections_basics', 'Collections basics', 'Collections', ARRAY['collections_manager','support_agent'], 'Delinquency queues, promises to pay, escalation, and humane follow-up.', 'Start with high-priority overdue cases, then follow promises and escalation state.', 20, false, '[{"label":"Open collections queue","required":true},{"label":"Review one promise to pay","required":true}]'::jsonb, 70),
  ('ownership_basics', 'Ownership basics', 'Ownership', ARRAY['owner','executive','collections_manager'], 'Ownership readiness, final approval, transfer records, and certificate completion.', 'Ownership is completed only when blockers are clear and evidence is retained.', 18, false, '[{"label":"Open ownership completion queue","required":true},{"label":"Review completion blockers","required":true}]'::jsonb, 80),
  ('analytics_basics', 'Analytics basics', 'Analytics', ARRAY['owner','executive','finance_manager'], 'Portfolio health, product performance, and data quality drilldowns.', 'Every analytics number should expose its source and limits.', 18, false, '[{"label":"Open portfolio analytics","required":true},{"label":"Check source records","required":true}]'::jsonb, 90),
  ('licensing_basics', 'Licensing basics', 'Licensing', ARRAY['owner','executive'], 'Plans, entitlements, trials, and disabled-state explanations.', 'Commercial gates should explain why access is locked and what fixes it.', 16, false, '[{"label":"Open platform administration","required":true},{"label":"Review locked-module explanation","required":true}]'::jsonb, 100),
  ('driver_getting_started', 'Bien commencer avec KIRA', 'Driver Education', ARRAY['driver'], 'French-first introduction for drivers.', 'Bienvenue. Regardez votre solde, vos factures, votre score et vos actions du jour. Si un document manque, KIRA vous indique quoi envoyer.', 8, true, '[{"label":"Ouvrir accueil chauffeur","required":true},{"label":"Verifier documents","required":true}]'::jsonb, 110),
  ('driver_payments', 'Comprendre les paiements', 'Driver Education', ARRAY['driver'], 'Simple explanation of invoices, wallet, and receipts.', 'Payez a temps, gardez vos recus, et contactez le support si un paiement ne correspond pas.', 8, true, '[{"label":"Ouvrir Finance","required":true},{"label":"Verifier prochaine echeance","required":true}]'::jsonb, 120),
  ('driver_ownership', 'Comprendre la propriete', 'Driver Education', ARRAY['driver'], 'Simple ownership journey education.', 'La propriete depend des paiements, du score, des contrats signes et des validations finales.', 10, true, '[{"label":"Ouvrir Ownership","required":true},{"label":"Lire les conditions","required":true}]'::jsonb, 130)
ON CONFLICT (module_key) DO UPDATE
SET title=EXCLUDED.title, category=EXCLUDED.category, audience_role_keys=EXCLUDED.audience_role_keys, description=EXCLUDED.description, content_md=EXCLUDED.content_md, estimated_minutes=EXCLUDED.estimated_minutes, is_driver_education=EXCLUDED.is_driver_education, checklist_json=EXCLUDED.checklist_json, sort_order=EXCLUDED.sort_order, status='PUBLISHED', updated_at=now();

INSERT INTO public.knowledge_articles (article_key, title, category, summary, body_md, role_keys, related_routes, tags) VALUES
  ('what_should_i_do_next', 'What should I do next?', 'Administration', 'Use next-best-actions to start each shift with the highest-value work.', 'Open the Operating Experience page, review Urgent and Today actions, then complete or dismiss each item with a clear reason.', ARRAY['owner','manager','support_agent'], ARRAY['/admin/operating-experience','/admin/attention'], ARRAY['next-best-action','attention','onboarding']),
  ('empty_states_standard', 'Empty states standard', 'Administration', 'Empty screens must explain what the screen does and how to create the first record.', 'Every empty state should include: what this module does, why no records exist, and the first safe action.', ARRAY['manager','support_agent'], ARRAY['/admin/operating-experience'], ARRAY['empty-state','guidance']),
  ('disabled_states_standard', 'Disabled states standard', 'Administration', 'Disabled actions must explain why they are unavailable and how to fix them.', 'No dead buttons. A disabled control needs the missing requirement, the next fix, and a route when possible.', ARRAY['manager','support_agent'], ARRAY['/admin/operating-experience'], ARRAY['disabled-state','guidance']),
  ('driver_kyc_help', 'Driver KYC help', 'Drivers', 'How to help a driver complete KYC.', 'Check missing document, rejection reason, and profile completeness. Ask for one clear correction at a time.', ARRAY['fleet_manager','support_agent'], ARRAY['/admin/drivers'], ARRAY['drivers','kyc']),
  ('invoice_first_steps', 'Issue the first invoice', 'Finance', 'The minimum checks before issuing an invoice.', 'Confirm driver, rental or account, amount, due date, and payment channel before sending.', ARRAY['finance_manager'], ARRAY['/admin/billing','/admin/financial-operations'], ARRAY['invoice','payments']),
  ('collections_review', 'Collections review', 'Collections', 'Daily collections starting point.', 'Start with critical overdue cases, check promise state, review escalation, and record next contact.', ARRAY['collections_manager'], ARRAY['/admin/credit-collections'], ARRAY['collections','delinquency']),
  ('ownership_completion_help', 'Ownership completion help', 'Ownership', 'How to complete ownership safely.', 'Verify outstanding balance, blockers, transfer record, certificate issuance, and final approval.', ARRAY['owner','collections_manager'], ARRAY['/admin/ownership-completion'], ARRAY['ownership','certificate']),
  ('licensing_access_help', 'Why is a module locked?', 'Licensing', 'Understand entitlements, trials, and plan gates.', 'A locked module is usually missing a tenant entitlement, plan feature, or active trial. Open Platform Administration for the exact reason.', ARRAY['owner','manager'], ARRAY['/admin/platform-administration'], ARRAY['licensing','entitlement'])
ON CONFLICT (article_key) DO UPDATE
SET title=EXCLUDED.title, category=EXCLUDED.category, summary=EXCLUDED.summary, body_md=EXCLUDED.body_md, role_keys=EXCLUDED.role_keys, related_routes=EXCLUDED.related_routes, tags=EXCLUDED.tags, status='PUBLISHED', updated_at=now();

INSERT INTO public.operating_playbooks (playbook_key, title, category, owner_role_key, purpose, trigger_conditions, steps_json, empty_state_json, disabled_state_json) VALUES
  ('driver_onboarding', 'Driver onboarding', 'Drivers', 'fleet_manager', 'Create a complete driver record and move the driver to productive status.', 'New driver, incomplete profile, pending KYC, or first vehicle assignment.',
    '[{"key":"profile","label":"Create profile"},{"key":"kyc","label":"Collect and approve KYC"},{"key":"vehicle","label":"Assign vehicle"},{"key":"training","label":"Assign driver education"}]'::jsonb,
    '{"title":"No drivers yet","body":"Create the first driver before assigning vehicles, invoices, or credit workflows.","cta":"Create Driver","href":"/admin/drivers/new"}'::jsonb,
    '{"reason":"Driver cannot be activated until KYC and required profile fields are complete.","fix":"Open Driver 360 and complete missing documents."}'::jsonb),
  ('issue_invoice', 'Issue invoice', 'Finance', 'finance_manager', 'Create an invoice only when the driver and obligation are clear.', 'First invoice, weekly billing cycle, or manual adjustment.',
    '[{"key":"driver","label":"Confirm driver"},{"key":"amount","label":"Confirm amount"},{"key":"due_date","label":"Set due date"},{"key":"send","label":"Send invoice"}]'::jsonb,
    '{"title":"No invoices yet","body":"Create the first invoice after a driver or rental exists.","cta":"Open Billing","href":"/admin/billing"}'::jsonb,
    '{"reason":"Cannot issue invoice without an attached driver and amount.","fix":"Attach driver/rental and verify amount."}'::jsonb),
  ('approve_credit', 'Approve credit', 'Credit', 'risk_manager', 'Move from application to underwriting decision with clear evidence.', 'Submitted credit application or policy exception.',
    '[{"key":"application","label":"Review application"},{"key":"evidence","label":"Check evidence"},{"key":"decision","label":"Record decision"},{"key":"handoff","label":"Handoff to contract"}]'::jsonb,
    '{"title":"No credit applications","body":"Credit approvals appear after a driver applies for a product.","cta":"Open Credit","href":"/admin/credit-operations"}'::jsonb,
    '{"reason":"Cannot approve without decision evidence and policy outcome.","fix":"Run underwriting evaluation and attach review note."}'::jsonb),
  ('generate_contract', 'Generate contract', 'Credit', 'finance_manager', 'Create a contract only after approval and required terms are present.', 'Approved underwriting decision awaiting signature.',
    '[{"key":"approval","label":"Confirm approval"},{"key":"terms","label":"Verify terms"},{"key":"signers","label":"Prepare signers"},{"key":"signature","label":"Send signature"}]'::jsonb,
    '{"title":"No contracts awaiting work","body":"Contracts appear after an approved credit decision.","cta":"Open Contracts","href":"/admin/contracts"}'::jsonb,
    '{"reason":"Cannot generate contract until approval and repayment terms exist.","fix":"Complete underwriting and repayment setup."}'::jsonb),
  ('review_default', 'Review default', 'Risk', 'risk_manager', 'Review default only with evidence, notices, and explicit decision trail.', 'Default review opened or asset protection requested.',
    '[{"key":"evidence","label":"Confirm evidence"},{"key":"notice","label":"Check notice"},{"key":"decision","label":"Record decision"},{"key":"recovery","label":"Set recovery path"}]'::jsonb,
    '{"title":"No default reviews","body":"Default reviews appear when a credit account meets review triggers.","cta":"Open Default Recovery","href":"/admin/default-recovery"}'::jsonb,
    '{"reason":"Cannot complete default decision without evidence and notice state.","fix":"Attach evidence and send required notice first."}'::jsonb),
  ('complete_ownership', 'Complete ownership', 'Ownership', 'owner', 'Complete ownership only when blockers are cleared and certificate path is ready.', 'Ownership review pending final approval or certificate issuance.',
    '[{"key":"balance","label":"Confirm balance"},{"key":"blockers","label":"Clear blockers"},{"key":"transfer","label":"Record transfer"},{"key":"certificate","label":"Issue certificate"}]'::jsonb,
    '{"title":"No ownership reviews","body":"Ownership completion appears when a driver reaches eligibility.","cta":"Open Ownership","href":"/admin/ownership-completion"}'::jsonb,
    '{"reason":"Cannot complete ownership until blockers are clear and transfer evidence exists.","fix":"Open Ownership Completion and clear blocker checklist."}'::jsonb),
  ('assign_entitlement', 'Assign entitlement', 'Licensing', 'owner', 'Activate a feature through plan, trial, or manual entitlement with audit reason.', 'Tenant needs access to a locked module.',
    '[{"key":"tenant","label":"Choose tenant"},{"key":"feature","label":"Choose feature"},{"key":"reason","label":"Record reason"},{"key":"audit","label":"Verify audit"}]'::jsonb,
    '{"title":"No entitlement changes yet","body":"Plan and feature state changes are recorded here after licensing actions.","cta":"Open Platform Administration","href":"/admin/platform-administration"}'::jsonb,
    '{"reason":"Cannot assign entitlement without tenant, feature, and reason.","fix":"Select tenant and feature, then enter the commercial reason."}'::jsonb)
ON CONFLICT (playbook_key) DO UPDATE
SET title=EXCLUDED.title, category=EXCLUDED.category, owner_role_key=EXCLUDED.owner_role_key, purpose=EXCLUDED.purpose, trigger_conditions=EXCLUDED.trigger_conditions, steps_json=EXCLUDED.steps_json, empty_state_json=EXCLUDED.empty_state_json, disabled_state_json=EXCLUDED.disabled_state_json, status='PUBLISHED', updated_at=now();

INSERT INTO public.guided_workflows (workflow_key, title, category, description, target_route, owner_role_key, required_permissions, steps_json) VALUES
  ('create_driver', 'Create Driver', 'Drivers', 'Guided operator path for first safe driver creation.', '/admin/drivers/new', 'fleet_manager', ARRAY['training.view'],
    '[{"key":"profile","label":"Profile","status":"required"},{"key":"kyc","label":"KYC","status":"required"},{"key":"vehicle","label":"Vehicle","status":"optional"},{"key":"training","label":"Training","status":"recommended"}]'::jsonb),
  ('issue_invoice', 'Issue Invoice', 'Finance', 'Guided invoice creation with disabled-state reasons.', '/admin/billing', 'finance_manager', ARRAY['training.view'],
    '[{"key":"driver","label":"Driver"},{"key":"obligation","label":"Obligation"},{"key":"amount","label":"Amount"},{"key":"send","label":"Send"}]'::jsonb),
  ('approve_credit', 'Approve Credit', 'Credit', 'Review policy, evidence, decision, and handoff.', '/admin/underwriting-operations', 'risk_manager', ARRAY['training.view'],
    '[{"key":"application","label":"Application"},{"key":"policy","label":"Policy"},{"key":"evidence","label":"Evidence"},{"key":"decision","label":"Decision"}]'::jsonb),
  ('generate_contract', 'Generate Contract', 'Credit', 'Move approved credit into a signable contract.', '/admin/contracts', 'finance_manager', ARRAY['training.view'],
    '[{"key":"approval","label":"Approval"},{"key":"terms","label":"Terms"},{"key":"signers","label":"Signers"},{"key":"signature","label":"Signature"}]'::jsonb),
  ('review_default', 'Review Default', 'Risk', 'Human-reviewed default and recovery governance.', '/admin/default-recovery', 'risk_manager', ARRAY['training.view'],
    '[{"key":"trigger","label":"Trigger"},{"key":"evidence","label":"Evidence"},{"key":"notice","label":"Notice"},{"key":"decision","label":"Decision"}]'::jsonb),
  ('complete_ownership', 'Complete Ownership', 'Ownership', 'Final ownership transfer checklist.', '/admin/ownership-completion', 'owner', ARRAY['training.view'],
    '[{"key":"eligibility","label":"Eligibility"},{"key":"blockers","label":"Blockers"},{"key":"transfer","label":"Transfer"},{"key":"certificate","label":"Certificate"}]'::jsonb),
  ('assign_entitlement', 'Assign Entitlement', 'Licensing', 'Commercial feature activation with audit reason.', '/admin/platform-administration', 'owner', ARRAY['training.manage'],
    '[{"key":"tenant","label":"Tenant"},{"key":"plan","label":"Plan"},{"key":"feature","label":"Feature"},{"key":"audit","label":"Audit"}]'::jsonb)
ON CONFLICT (workflow_key) DO UPDATE
SET title=EXCLUDED.title, category=EXCLUDED.category, description=EXCLUDED.description, target_route=EXCLUDED.target_route, owner_role_key=EXCLUDED.owner_role_key, required_permissions=EXCLUDED.required_permissions, steps_json=EXCLUDED.steps_json, status='ACTIVE', updated_at=now();

INSERT INTO public.help_content (screen_key, route_pattern, title, body_md, tooltip_json, faq_json, quick_tips_json, example_json) VALUES
  ('operating_experience', '/admin/operating-experience', 'Operating Experience', 'Start here to see role homepages, next-best-actions, training, knowledge, workflows, and tenant health.', '[{"target":"refresh","text":"Regenerate actions and health score from current platform data."}]'::jsonb, '[{"q":"Where do I start?","a":"Open Urgent and Today next-best-actions first."}]'::jsonb, '["Use Role Homepage first","Search knowledge before escalating","Complete training modules tied to your role"]'::jsonb, '{"empty":"No actions means the tenant has no generated blockers. Refresh to recalculate."}'::jsonb),
  ('attention_center', '/admin/attention', 'Attention Center', 'Operational queue grouped by urgency so managers know where to start.', '[{"target":"filters","text":"Use filters to focus on overdue, today cash, risk, or pending requests."}]'::jsonb, '[{"q":"Why is an item urgent?","a":"Urgency is based on status, due date, risk, and financial impact."}]'::jsonb, '["Clear critical items first","Open source records before acting"]'::jsonb, '{}'::jsonb),
  ('driver_detail', '/admin/drivers/:id', 'Driver 360', 'Driver record, KYC, finance, fleet, growth, risk, and activity in one place.', '[{"target":"kyc","text":"KYC must be complete before activation."}]'::jsonb, '[{"q":"Why is activation disabled?","a":"A profile, KYC document, contract, or vehicle assignment requirement may be missing."}]'::jsonb, '["Check profile completeness","Review documents tab"]'::jsonb, '{}'::jsonb),
  ('platform_administration', '/admin/platform-administration', 'Platform Administration', 'Plans, features, entitlements, trials, usage limits, and immutable audit.', '[{"target":"reason","text":"High-risk entitlement actions require a reason."}]'::jsonb, '[{"q":"Why is a module locked?","a":"It is hidden, disabled, pending, expired, or missing entitlement."}]'::jsonb, '["Start trials with expiry","Export entitlement matrix for reviews"]'::jsonb, '{}'::jsonb)
ON CONFLICT (screen_key) DO UPDATE
SET route_pattern=EXCLUDED.route_pattern, title=EXCLUDED.title, body_md=EXCLUDED.body_md, tooltip_json=EXCLUDED.tooltip_json, faq_json=EXCLUDED.faq_json, quick_tips_json=EXCLUDED.quick_tips_json, example_json=EXCLUDED.example_json, status='PUBLISHED', updated_at=now();

INSERT INTO public.platform_features (feature_key, feature_name, category, module_key, status, default_flag_state, description, upgrade_copy_json) VALUES
  ('operating_experience', 'Operating Experience', 'CORE', 'guidance', 'ACTIVE', 'ENABLED', 'Role homepages, attention guidance, and operator start pages.', '{"benefits":["Reduce training time","Guide each role to the next best action"]}'::jsonb),
  ('learning_center', 'Learning Center', 'CORE', 'guidance', 'ACTIVE', 'ENABLED', 'Training modules, driver education, and completion tracking.', '{"benefits":["Track completion","Reduce support tickets"]}'::jsonb),
  ('knowledge_base', 'Knowledge Base', 'CORE', 'guidance', 'ACTIVE', 'ENABLED', 'Help articles, search, and contextual guidance.', '{"benefits":["Find answers faster","Standardize support responses"]}'::jsonb),
  ('guided_workflows', 'Guided Workflows', 'CORE', 'guidance', 'ACTIVE', 'ENABLED', 'Step-by-step workflows with saved progress.', '{"benefits":["Reduce operator mistakes","Resume work safely"]}'::jsonb),
  ('next_best_actions', 'Next Best Actions', 'CORE', 'guidance', 'ACTIVE', 'ENABLED', 'Action cards that answer what to do next.', '{"benefits":["Focus daily work","Expose blockers early"]}'::jsonb),
  ('tenant_health', 'Tenant Health Score', 'INTELLIGENCE', 'guidance', 'ACTIVE', 'ENABLED', 'Adoption and health scoring for customer success.', '{"benefits":["Measure adoption","Identify confused tenants"]}'::jsonb)
ON CONFLICT (feature_key) DO UPDATE
SET feature_name=EXCLUDED.feature_name, category=EXCLUDED.category, module_key=EXCLUDED.module_key, status=EXCLUDED.status, default_flag_state=EXCLUDED.default_flag_state, description=EXCLUDED.description, upgrade_copy_json=EXCLUDED.upgrade_copy_json, updated_at=now();

INSERT INTO public.feature_flags (flag_key, flag_value, description, is_platform_only, category, feature_id, feature_state, rollout_rules_json, status_changed_at)
SELECT 'license_' || f.feature_key, true, 'Commercial licensing state for ' || f.feature_name, false, lower(f.category), f.feature_id, 'ENABLED', '{}'::jsonb, now()
FROM public.platform_features f WHERE f.module_key = 'guidance'
ON CONFLICT (flag_key) DO UPDATE
SET description=EXCLUDED.description, category=EXCLUDED.category, feature_id=EXCLUDED.feature_id, feature_state=EXCLUDED.feature_state, flag_value=EXCLUDED.flag_value, updated_at=now(), status_changed_at=now();

INSERT INTO public.plan_features (plan_id, feature_id, feature_state, limits_json)
SELECT p.plan_id, f.feature_id, CASE WHEN p.status = 'ACTIVE' THEN 'ENABLED' ELSE 'DISABLED' END, '{}'::jsonb
FROM public.platform_plans p CROSS JOIN public.platform_features f WHERE f.module_key = 'guidance'
ON CONFLICT (plan_id, feature_id) DO UPDATE
SET feature_state=EXCLUDED.feature_state, limits_json=EXCLUDED.limits_json, updated_at=now();

INSERT INTO public.tenant_entitlements (tenant_id, plan_id, feature_id, entitlement_status, starts_at, expires_at, source, override_reason)
SELECT tpa.tenant_id, tpa.plan_id, pf.feature_id, CASE WHEN pf.feature_state IN ('ENABLED','BETA') THEN 'ACTIVE' ELSE 'DISABLED' END, now(), NULL, 'PLAN', 'Layer 3X seed from assigned plan.'
FROM public.tenant_plan_assignments tpa
JOIN public.plan_features pf ON pf.plan_id = tpa.plan_id
JOIN public.platform_features f ON f.feature_id = pf.feature_id
WHERE tpa.status = 'ACTIVE' AND f.module_key = 'guidance'
ON CONFLICT (tenant_id, feature_id) DO UPDATE
SET plan_id=EXCLUDED.plan_id, entitlement_status=EXCLUDED.entitlement_status, source=EXCLUDED.source, override_reason=EXCLUDED.override_reason, updated_at=now(), status_changed_at=now();

INSERT INTO public.customers (name, slug, is_active, settings) VALUES
  ('QA Layer 3X Operations', 'qa-layer3x-operations', true, '{"qa_layer":"3X","purpose":"operating_experience"}'::jsonb)
ON CONFLICT (slug) DO UPDATE
SET name=EXCLUDED.name, settings=public.customers.settings || EXCLUDED.settings, is_active=true, updated_at=now();

INSERT INTO public.next_best_actions (customer_id, role_key, action_type, urgency, title, description, cta_label, href, source, priority_score, metadata_json)
SELECT c.id, 'manager', 'complete_operator_onboarding', 'TRAINING_NEEDED',
       'Complete operator onboarding',
       'Assign and complete the core Layer 3X learning modules before scaling daily operations.',
       'Open Learning Center', '/admin/operating-experience?tab=learning', 'LAYER3X_SEED', 80, '{"acceptance":"AT-3X-006"}'::jsonb
FROM public.customers c WHERE c.is_active = true
ON CONFLICT DO NOTHING;

INSERT INTO public.tenant_health_scores (customer_id, health_score, feature_adoption_score, workflow_completion_score, training_completion_score, collections_efficiency_score, driver_adoption_score, score_status, scoring_json)
SELECT c.id, 72, 75, 70, 65, 75, 75, 'HEALTHY', '{"seed":"Layer 3X baseline; recalculate_tenant_health_score refreshes from live data."}'::jsonb
FROM public.customers c WHERE c.is_active = true
ON CONFLICT (customer_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.record_operating_guidance_audit_event(
  p_event_type text, p_target_type text, p_target_id text DEFAULT NULL, p_customer_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL, p_before_json jsonb DEFAULT '{}'::jsonb, p_after_json jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor public.admin_users%ROWTYPE; v_driver_id uuid; v_customer_id uuid; v_event_id uuid;
BEGIN
  IF NOT public.has_operating_experience_permission('guidance.view') THEN RAISE EXCEPTION 'forbidden: guidance.view required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_actor FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true LIMIT 1;
  v_driver_id := public.current_driver_id();
  v_customer_id := COALESCE(p_customer_id, v_actor.customer_id, public.current_customer_id());
  IF v_customer_id IS NULL AND v_driver_id IS NOT NULL THEN
    SELECT d.customer_id INTO v_customer_id FROM public.drivers d WHERE d.id = v_driver_id;
  END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT audit_event_id INTO v_event_id FROM public.operating_guidance_audit_events WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_event_id IS NOT NULL THEN RETURN v_event_id; END IF;
  END IF;
  INSERT INTO public.operating_guidance_audit_events (customer_id, actor_admin_user_id, actor_driver_id, actor_role, event_type, target_type, target_id, reason, before_json, after_json, idempotency_key)
  VALUES (v_customer_id, v_actor.id, v_driver_id, COALESCE(v_actor.role_key, CASE WHEN v_driver_id IS NOT NULL THEN 'driver' ELSE NULL END), p_event_type, p_target_type, p_target_id, p_reason, COALESCE(p_before_json, '{}'::jsonb), COALESCE(p_after_json, '{}'::jsonb), p_idempotency_key)
  RETURNING audit_event_id INTO v_event_id;
  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_learning_progress(
  p_module_key text, p_status text DEFAULT 'COMPLETED', p_progress_percent integer DEFAULT 100,
  p_customer_id uuid DEFAULT NULL, p_score integer DEFAULT NULL, p_evidence_json jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_module public.learning_modules%ROWTYPE; v_actor public.admin_users%ROWTYPE; v_driver_id uuid; v_customer_id uuid; v_progress_id uuid;
BEGIN
  IF p_status NOT IN ('NOT_STARTED','IN_PROGRESS','COMPLETED','WAIVED') THEN RAISE EXCEPTION 'invalid learning status: %', p_status USING ERRCODE = '22023'; END IF;
  IF NOT public.has_operating_experience_permission('training.view') THEN RAISE EXCEPTION 'forbidden: training.view required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_module FROM public.learning_modules WHERE module_key = p_module_key LIMIT 1;
  IF v_module.module_id IS NULL THEN RAISE EXCEPTION 'unknown learning module: %', p_module_key USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_actor FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true LIMIT 1;
  v_driver_id := public.current_driver_id();
  v_customer_id := COALESCE(p_customer_id, v_actor.customer_id, public.current_customer_id());
  IF v_customer_id IS NULL AND v_driver_id IS NOT NULL THEN
    SELECT d.customer_id INTO v_customer_id FROM public.drivers d WHERE d.id = v_driver_id;
  END IF;
  IF v_actor.id IS NULL AND v_driver_id IS NULL THEN RAISE EXCEPTION 'no operating experience actor resolved' USING ERRCODE = '42501'; END IF;
  IF v_actor.id IS NOT NULL THEN
    INSERT INTO public.learning_progress (customer_id, module_id, admin_user_id, assigned_role_key, status, progress_percent, score, started_at, completed_at, evidence_json)
    VALUES (v_customer_id, v_module.module_id, v_actor.id, v_actor.role_key, p_status, LEAST(100, GREATEST(0, p_progress_percent)), p_score,
      CASE WHEN p_status IN ('IN_PROGRESS','COMPLETED') THEN now() ELSE NULL END,
      CASE WHEN p_status = 'COMPLETED' THEN now() ELSE NULL END,
      COALESCE(p_evidence_json, '{}'::jsonb))
    ON CONFLICT (module_id, admin_user_id) WHERE admin_user_id IS NOT NULL
    DO UPDATE SET status=EXCLUDED.status, progress_percent=EXCLUDED.progress_percent, score=EXCLUDED.score,
      started_at=COALESCE(public.learning_progress.started_at, EXCLUDED.started_at),
      completed_at=EXCLUDED.completed_at, evidence_json=EXCLUDED.evidence_json, updated_at=now()
    RETURNING progress_id INTO v_progress_id;
  ELSE
    INSERT INTO public.learning_progress (customer_id, module_id, driver_id, assigned_role_key, status, progress_percent, score, started_at, completed_at, evidence_json)
    VALUES (v_customer_id, v_module.module_id, v_driver_id, 'driver', p_status, LEAST(100, GREATEST(0, p_progress_percent)), p_score,
      CASE WHEN p_status IN ('IN_PROGRESS','COMPLETED') THEN now() ELSE NULL END,
      CASE WHEN p_status = 'COMPLETED' THEN now() ELSE NULL END,
      COALESCE(p_evidence_json, '{}'::jsonb))
    ON CONFLICT (module_id, driver_id) WHERE driver_id IS NOT NULL
    DO UPDATE SET status=EXCLUDED.status, progress_percent=EXCLUDED.progress_percent, score=EXCLUDED.score,
      started_at=COALESCE(public.learning_progress.started_at, EXCLUDED.started_at),
      completed_at=EXCLUDED.completed_at, evidence_json=EXCLUDED.evidence_json, updated_at=now()
    RETURNING progress_id INTO v_progress_id;
  END IF;
  PERFORM public.record_operating_guidance_audit_event(
    CASE WHEN p_status = 'COMPLETED' THEN 'TRAINING_COMPLETED' ELSE 'TRAINING_PROGRESS_UPDATED' END,
    'learning_module', v_module.module_key, v_customer_id, 'Layer 3X learning progress update', '{}'::jsonb,
    jsonb_build_object('module_key', p_module_key, 'status', p_status, 'progress_percent', p_progress_percent));
  RETURN v_progress_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_guided_workflow(
  p_workflow_key text, p_current_step_key text, p_status text DEFAULT 'IN_PROGRESS',
  p_subject_type text DEFAULT 'tenant', p_subject_id text DEFAULT NULL, p_customer_id uuid DEFAULT NULL,
  p_context_json jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_workflow public.guided_workflows%ROWTYPE; v_actor public.admin_users%ROWTYPE; v_customer_id uuid; v_step_count integer; v_step_index integer; v_progress integer; v_progress_id uuid;
BEGIN
  IF p_status NOT IN ('NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED') THEN RAISE EXCEPTION 'invalid workflow status: %', p_status USING ERRCODE = '22023'; END IF;
  IF NOT public.has_operating_experience_permission('guidance.view') THEN RAISE EXCEPTION 'forbidden: guidance.view required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_workflow FROM public.guided_workflows WHERE workflow_key = p_workflow_key LIMIT 1;
  IF v_workflow.workflow_id IS NULL THEN RAISE EXCEPTION 'unknown guided workflow: %', p_workflow_key USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_actor FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true LIMIT 1;
  v_customer_id := COALESCE(p_customer_id, v_actor.customer_id, public.current_customer_id());
  IF v_customer_id IS NULL THEN RAISE EXCEPTION 'tenant context required for guided workflow progress' USING ERRCODE = '23502'; END IF;
  SELECT COUNT(*) INTO v_step_count FROM jsonb_array_elements(v_workflow.steps_json);
  SELECT COALESCE(ordinality, 1) INTO v_step_index
  FROM jsonb_array_elements(v_workflow.steps_json) WITH ORDINALITY AS step(value, ordinality)
  WHERE step.value ->> 'key' = p_current_step_key LIMIT 1;
  v_progress := CASE WHEN p_status = 'COMPLETED' THEN 100
    WHEN v_step_count <= 0 THEN 0
    ELSE LEAST(95, GREATEST(0, ROUND((COALESCE(v_step_index, 1)::numeric / v_step_count::numeric) * 100)::integer)) END;
  INSERT INTO public.workflow_progress (customer_id, workflow_id, actor_admin_user_id, subject_type, subject_id, current_step_key, status, progress_percent, context_json, completed_at)
  VALUES (v_customer_id, v_workflow.workflow_id, v_actor.id, p_subject_type, p_subject_id, p_current_step_key, p_status, v_progress, COALESCE(p_context_json, '{}'::jsonb),
    CASE WHEN p_status = 'COMPLETED' THEN now() ELSE NULL END)
  ON CONFLICT (customer_id, workflow_id, subject_type, (COALESCE(subject_id, 'tenant')))
  DO UPDATE SET actor_admin_user_id=EXCLUDED.actor_admin_user_id, current_step_key=EXCLUDED.current_step_key,
    status=EXCLUDED.status, progress_percent=EXCLUDED.progress_percent, context_json=EXCLUDED.context_json,
    completed_at=EXCLUDED.completed_at, updated_at=now()
  RETURNING progress_id INTO v_progress_id;
  PERFORM public.record_operating_guidance_audit_event(
    CASE WHEN p_status = 'COMPLETED' THEN 'WORKFLOW_COMPLETED' ELSE 'WORKFLOW_PROGRESS_SAVED' END,
    'guided_workflow', v_workflow.workflow_key, v_customer_id, 'Layer 3X guided workflow progress update', '{}'::jsonb,
    jsonb_build_object('workflow_key', p_workflow_key, 'step_key', p_current_step_key, 'status', p_status));
  RETURN v_progress_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_next_best_actions(p_customer_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer_id uuid := COALESCE(p_customer_id, public.current_customer_id()); v_count integer := 0; v_pending integer := 0;
BEGIN
  IF NOT (COALESCE(auth.role(), '') = 'service_role' OR public.is_platform_owner() OR public.has_operating_experience_permission('guidance.view')) THEN
    RAISE EXCEPTION 'forbidden: guidance.view required' USING ERRCODE = '42501';
  END IF;
  IF v_customer_id IS NULL THEN
    SELECT id INTO v_customer_id FROM public.customers WHERE is_active = true ORDER BY created_at LIMIT 1;
  END IF;
  IF v_customer_id IS NULL THEN RETURN 0; END IF;
  UPDATE public.next_best_actions SET status='DISMISSED', updated_at=now()
    WHERE customer_id = v_customer_id AND source = 'RULE_ENGINE' AND status = 'OPEN';
  SELECT COUNT(*) INTO v_pending FROM public.learning_modules lm
    WHERE lm.status='PUBLISHED' AND lm.is_driver_education=false
      AND NOT EXISTS (SELECT 1 FROM public.learning_progress lp WHERE lp.module_id=lm.module_id AND lp.customer_id=v_customer_id AND lp.status='COMPLETED');
  IF v_pending > 0 THEN
    INSERT INTO public.next_best_actions (customer_id, role_key, action_type, urgency, title, description, cta_label, href, source, priority_score, metadata_json)
    VALUES (v_customer_id, 'manager', 'training_needed', 'TRAINING_NEEDED', 'Complete role training', v_pending || ' operating training modules still need completion.', 'Open Learning Center', '/admin/operating-experience?tab=learning', 'RULE_ENGINE', 75, jsonb_build_object('pending_modules', v_pending))
    ON CONFLICT DO NOTHING; v_count := v_count + 1;
  END IF;
  IF to_regclass('public.kyc_submissions') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_pending FROM public.kyc_submissions k JOIN public.drivers d ON d.id=k.driver_id WHERE d.customer_id=v_customer_id AND k.status='pending';
    IF v_pending > 0 THEN
      INSERT INTO public.next_best_actions (customer_id, role_key, action_type, urgency, title, description, cta_label, href, source, priority_score, metadata_json)
      VALUES (v_customer_id, 'fleet_manager', 'driver_kyc_pending', 'URGENT', v_pending || ' driver KYC reviews pending', 'Review pending KYC before activating or assigning drivers.', 'Review KYC', '/admin/drivers', 'RULE_ENGINE', 95, jsonb_build_object('pending_kyc', v_pending))
      ON CONFLICT DO NOTHING; v_count := v_count + 1;
    END IF;
  END IF;
  IF to_regclass('public.invoice') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_pending FROM public.invoice i WHERE i.customer_id=v_customer_id AND i.status IN ('overdue','unpaid','partial') AND COALESCE(i.remaining_due, i.total_ttc - COALESCE(i.amount_paid, 0)) > 0;
    IF v_pending > 0 THEN
      INSERT INTO public.next_best_actions (customer_id, role_key, action_type, urgency, title, description, cta_label, href, source, priority_score, metadata_json)
      VALUES (v_customer_id, 'finance_manager', 'invoice_overdue', 'TODAY', v_pending || ' invoices need finance follow-up', 'Collect or resolve overdue, unpaid, and partial invoices.', 'Open Billing', '/admin/billing', 'RULE_ENGINE', 88, jsonb_build_object('invoice_count', v_pending))
      ON CONFLICT DO NOTHING; v_count := v_count + 1;
    END IF;
  END IF;
  IF to_regclass('public.credit_contracts') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_pending FROM public.credit_contracts cc WHERE cc.customer_id=v_customer_id AND cc.contract_status IN ('SENT_FOR_SIGNATURE','VIEWED','PARTIALLY_EXECUTED');
    IF v_pending > 0 THEN
      INSERT INTO public.next_best_actions (customer_id, role_key, action_type, urgency, title, description, cta_label, href, source, priority_score, metadata_json)
      VALUES (v_customer_id, 'finance_manager', 'contracts_awaiting_signature', 'TODAY', v_pending || ' contracts awaiting signature', 'Follow signature blockers so approved credit can activate.', 'Open Contracts', '/admin/contracts', 'RULE_ENGINE', 82, jsonb_build_object('contract_count', v_pending))
      ON CONFLICT DO NOTHING; v_count := v_count + 1;
    END IF;
  END IF;
  IF to_regclass('public.ownership_completion_reviews') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_pending FROM public.ownership_completion_reviews ocr WHERE ocr.customer_id=v_customer_id AND ocr.status IN ('ELIGIBLE_FOR_COMPLETION','UNDER_COMPLETION_REVIEW','AWAITING_FINAL_APPROVAL');
    IF v_pending > 0 THEN
      INSERT INTO public.next_best_actions (customer_id, role_key, action_type, urgency, title, description, cta_label, href, source, priority_score, metadata_json)
      VALUES (v_customer_id, 'owner', 'ownership_review_pending', 'THIS_WEEK', v_pending || ' ownership reviews need completion', 'Clear blockers and final approval for eligible ownership transfers.', 'Open Ownership', '/admin/ownership-completion', 'RULE_ENGINE', 78, jsonb_build_object('ownership_review_count', v_pending))
      ON CONFLICT DO NOTHING; v_count := v_count + 1;
    END IF;
  END IF;
  PERFORM public.record_operating_guidance_audit_event('NEXT_BEST_ACTIONS_REFRESHED', 'next_best_actions', v_customer_id::text, v_customer_id, 'Layer 3X next-best-actions generated', '{}'::jsonb, jsonb_build_object('generated_count', v_count));
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_tenant_health_score(p_customer_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer_id uuid := COALESCE(p_customer_id, public.current_customer_id()); v_score_id uuid;
  v_feature integer := 70; v_workflow integer := 70; v_training integer := 70; v_collections integer := 70; v_driver integer := 70;
  v_health integer; v_enabled integer := 0; v_total integer := 0; v_completed integer := 0; v_all integer := 0; v_drivers integer := 0; v_active_drivers integer := 0;
BEGIN
  IF NOT (COALESCE(auth.role(), '') = 'service_role' OR public.is_platform_owner() OR public.has_operating_experience_permission('health_score.view')) THEN
    RAISE EXCEPTION 'forbidden: health_score.view required' USING ERRCODE = '42501';
  END IF;
  IF v_customer_id IS NULL THEN SELECT id INTO v_customer_id FROM public.customers WHERE is_active = true ORDER BY created_at LIMIT 1; END IF;
  IF v_customer_id IS NULL THEN RAISE EXCEPTION 'tenant context required for health score' USING ERRCODE = '23502'; END IF;
  IF to_regclass('public.v_platform_entitlement_matrix') IS NOT NULL THEN
    SELECT COUNT(*) FILTER (WHERE access_state IN ('ENABLED','TRIAL','BETA')), COUNT(*) INTO v_enabled, v_total
    FROM public.v_platform_entitlement_matrix WHERE tenant_id = v_customer_id;
    IF v_total > 0 THEN v_feature := ROUND((v_enabled::numeric / v_total::numeric) * 100)::integer; END IF;
  END IF;
  SELECT COUNT(*) FILTER (WHERE status='COMPLETED'), COUNT(*) INTO v_completed, v_all FROM public.workflow_progress WHERE customer_id=v_customer_id;
  IF v_all > 0 THEN v_workflow := ROUND((v_completed::numeric / v_all::numeric) * 100)::integer; END IF;
  SELECT COUNT(*) FILTER (WHERE status='COMPLETED'), COUNT(*) INTO v_completed, v_all FROM public.learning_progress WHERE customer_id=v_customer_id;
  IF v_all > 0 THEN v_training := ROUND((v_completed::numeric / v_all::numeric) * 100)::integer; END IF;
  IF to_regclass('public.credit_collections_cases') IS NOT NULL THEN
    SELECT COUNT(*) FILTER (WHERE current_status IN ('RESOLVED','CLOSED')), COUNT(*) INTO v_completed, v_all FROM public.credit_collections_cases WHERE customer_id=v_customer_id;
    IF v_all > 0 THEN v_collections := GREATEST(35, ROUND((v_completed::numeric / v_all::numeric) * 100)::integer); END IF;
  END IF;
  SELECT COUNT(*) FILTER (WHERE driver_status IN ('active','verified')), COUNT(*) INTO v_active_drivers, v_drivers FROM public.drivers WHERE customer_id=v_customer_id;
  IF v_drivers > 0 THEN v_driver := ROUND((v_active_drivers::numeric / v_drivers::numeric) * 100)::integer; END IF;
  v_health := ROUND((v_feature * 0.20) + (v_workflow * 0.20) + (v_training * 0.20) + (v_collections * 0.20) + (v_driver * 0.20))::integer;
  INSERT INTO public.tenant_health_scores (customer_id, health_score, feature_adoption_score, workflow_completion_score, training_completion_score, collections_efficiency_score, driver_adoption_score, score_status, scoring_json, generated_at, next_review_at)
  VALUES (v_customer_id, v_health, v_feature, v_workflow, v_training, v_collections, v_driver,
    CASE WHEN v_health < 45 THEN 'AT_RISK' WHEN v_health < 65 THEN 'WATCH' WHEN v_health < 85 THEN 'HEALTHY' ELSE 'EXCELLENT' END,
    jsonb_build_object('feature_adoption_score', v_feature, 'workflow_completion_score', v_workflow, 'training_completion_score', v_training, 'collections_efficiency_score', v_collections, 'driver_adoption_score', v_driver),
    now(), now() + interval '7 days')
  ON CONFLICT (customer_id) DO UPDATE
  SET health_score=EXCLUDED.health_score, feature_adoption_score=EXCLUDED.feature_adoption_score, workflow_completion_score=EXCLUDED.workflow_completion_score,
    training_completion_score=EXCLUDED.training_completion_score, collections_efficiency_score=EXCLUDED.collections_efficiency_score, driver_adoption_score=EXCLUDED.driver_adoption_score,
    score_status=EXCLUDED.score_status, scoring_json=EXCLUDED.scoring_json, generated_at=EXCLUDED.generated_at, next_review_at=EXCLUDED.next_review_at, updated_at=now()
  RETURNING score_id INTO v_score_id;
  PERFORM public.record_operating_guidance_audit_event('TENANT_HEALTH_SCORE_RECALCULATED', 'tenant_health_score', v_score_id::text, v_customer_id, 'Layer 3X tenant health recalculation', '{}'::jsonb, jsonb_build_object('health_score', v_health));
  RETURN v_score_id;
END;
$$;

CREATE OR REPLACE VIEW public.v_role_experience_homepages AS
SELECT re.experience_id, re.role_key, re.role_name, re.homepage_path, re.focus_area, re.navigation_json, re.dashboard_cards_json, re.primary_actions_json, re.training_track_keys, re.status,
  COUNT(lm.module_id) FILTER (WHERE lm.status = 'PUBLISHED') AS training_module_count
FROM public.role_experiences re LEFT JOIN public.learning_modules lm ON re.role_key = ANY(lm.audience_role_keys)
GROUP BY re.experience_id;

CREATE OR REPLACE VIEW public.v_learning_center_progress AS
SELECT lm.module_id, lm.module_key, lm.title, lm.category, lm.audience_role_keys, lm.description, lm.estimated_minutes, lm.is_driver_education, lm.checklist_json, lm.status AS module_status, lm.sort_order,
  lp.progress_id, lp.customer_id, c.name AS customer_name, c.slug AS customer_slug, lp.admin_user_id, au.full_name AS admin_user_name, au.email AS admin_user_email,
  lp.driver_id, d.full_name AS driver_name, lp.assigned_role_key,
  COALESCE(lp.status, 'NOT_STARTED') AS progress_status, COALESCE(lp.progress_percent, 0) AS progress_percent,
  lp.score, lp.started_at, lp.completed_at, lp.due_at, lm.created_at, lm.updated_at
FROM public.learning_modules lm
LEFT JOIN public.learning_progress lp ON lp.module_id = lm.module_id
LEFT JOIN public.customers c ON c.id = lp.customer_id
LEFT JOIN public.admin_users au ON au.id = lp.admin_user_id
LEFT JOIN public.drivers d ON d.id = lp.driver_id;

CREATE OR REPLACE VIEW public.v_operating_next_best_actions AS
SELECT nba.action_id, nba.customer_id, c.name AS customer_name, c.slug AS customer_slug, nba.role_key, nba.action_type, nba.urgency,
  CASE nba.urgency WHEN 'URGENT' THEN 'Urgent' WHEN 'TODAY' THEN 'Today' WHEN 'THIS_WEEK' THEN 'This Week' WHEN 'OPPORTUNITY' THEN 'Opportunities' WHEN 'TRAINING_NEEDED' THEN 'Training Needed' ELSE nba.urgency END AS urgency_label,
  nba.title, nba.description, nba.entity_type, nba.entity_id, nba.cta_label, nba.href, nba.source, nba.status, nba.priority_score, nba.due_at, nba.metadata_json, nba.created_at, nba.updated_at
FROM public.next_best_actions nba JOIN public.customers c ON c.id = nba.customer_id;

CREATE OR REPLACE VIEW public.v_tenant_health_dashboard AS
SELECT ths.score_id, ths.customer_id, c.name AS customer_name, c.slug AS customer_slug, ths.health_score, ths.feature_adoption_score, ths.workflow_completion_score, ths.training_completion_score, ths.collections_efficiency_score, ths.driver_adoption_score, ths.score_status, ths.scoring_json, ths.generated_at, ths.next_review_at,
  COUNT(nba.action_id) FILTER (WHERE nba.status='OPEN') AS open_action_count,
  COUNT(nba.action_id) FILTER (WHERE nba.status='OPEN' AND nba.urgency='URGENT') AS urgent_action_count
FROM public.tenant_health_scores ths JOIN public.customers c ON c.id = ths.customer_id
LEFT JOIN public.next_best_actions nba ON nba.customer_id = ths.customer_id
GROUP BY ths.score_id, c.id;

CREATE OR REPLACE VIEW public.v_guided_workflow_status AS
SELECT gw.workflow_id, gw.workflow_key, gw.title, gw.category, gw.description, gw.target_route, gw.owner_role_key, gw.required_permissions, gw.steps_json, gw.status AS workflow_status,
  wp.progress_id, wp.customer_id, c.name AS customer_name, c.slug AS customer_slug, wp.subject_type, wp.subject_id,
  COALESCE(wp.current_step_key, (gw.steps_json -> 0 ->> 'key')) AS current_step_key,
  COALESCE(wp.status, 'NOT_STARTED') AS progress_status, COALESCE(wp.progress_percent, 0) AS progress_percent,
  wp.started_at, wp.completed_at, wp.updated_at
FROM public.guided_workflows gw LEFT JOIN public.workflow_progress wp ON wp.workflow_id = gw.workflow_id LEFT JOIN public.customers c ON c.id = wp.customer_id;

CREATE OR REPLACE VIEW public.v_contextual_help_catalog AS
SELECT hc.help_id, hc.screen_key, hc.route_pattern, hc.title, hc.body_md, hc.tooltip_json, hc.faq_json, hc.quick_tips_json, hc.example_json, hc.status,
  COALESCE(jsonb_agg(jsonb_build_object('article_key', ka.article_key, 'title', ka.title, 'category', ka.category)) FILTER (WHERE ka.article_id IS NOT NULL), '[]'::jsonb) AS related_articles_json
FROM public.help_content hc LEFT JOIN public.knowledge_articles ka ON hc.route_pattern = ANY(ka.related_routes)
GROUP BY hc.help_id;

CREATE OR REPLACE VIEW public.v_operating_search_index AS
SELECT article_id::text AS object_id, 'knowledge_article' AS object_type, article_key AS object_key, title, category, summary AS description, related_routes AS routes, tags, status, setweight(search_vector, 'A') AS search_vector, updated_at
FROM public.knowledge_articles
UNION ALL
SELECT module_id::text, 'learning_module', module_key, title, category, description, ARRAY['/admin/operating-experience?tab=learning']::text[], audience_role_keys, status, to_tsvector('simple'::regconfig, title || ' ' || description || ' ' || content_md), updated_at
FROM public.learning_modules
UNION ALL
SELECT playbook_id::text, 'operating_playbook', playbook_key, title, category, purpose, ARRAY['/admin/operating-experience?tab=playbooks']::text[], ARRAY[owner_role_key], status, to_tsvector('simple'::regconfig, title || ' ' || purpose || ' ' || trigger_conditions), updated_at
FROM public.operating_playbooks
UNION ALL
SELECT workflow_id::text, 'guided_workflow', workflow_key, title, category, description, ARRAY[target_route], ARRAY[owner_role_key], status, to_tsvector('simple'::regconfig, title || ' ' || description || ' ' || category), updated_at
FROM public.guided_workflows
UNION ALL
SELECT help_id::text, 'help_content', screen_key, title, 'Help', body_md, ARRAY[route_pattern], ARRAY['help'], status, to_tsvector('simple'::regconfig, title || ' ' || body_md), updated_at
FROM public.help_content;

CREATE OR REPLACE VIEW public.v_operating_guidance_audit_timeline AS
SELECT oga.audit_event_id, oga.customer_id, c.name AS customer_name, c.slug AS customer_slug, oga.actor_admin_user_id, au.email AS actor_email, au.full_name AS actor_name, oga.actor_driver_id, d.full_name AS driver_name, oga.actor_role, oga.event_type, oga.target_type, oga.target_id, oga.reason, oga.before_json, oga.after_json, oga.created_at
FROM public.operating_guidance_audit_events oga
LEFT JOIN public.customers c ON c.id = oga.customer_id
LEFT JOIN public.admin_users au ON au.id = oga.actor_admin_user_id
LEFT JOIN public.drivers d ON d.id = oga.actor_driver_id;

CREATE OR REPLACE FUNCTION public.search_operating_knowledge(p_query text, p_limit integer DEFAULT 20)
RETURNS TABLE (object_id text, object_type text, object_key text, title text, category text, description text, routes text[], tags text[], rank real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT osi.object_id, osi.object_type, osi.object_key, osi.title, osi.category, osi.description, osi.routes, osi.tags,
    CASE WHEN NULLIF(trim(p_query), '') IS NULL THEN 0::real ELSE ts_rank(osi.search_vector, plainto_tsquery('simple', p_query)) END AS rank
  FROM public.v_operating_search_index osi
  WHERE osi.status IN ('PUBLISHED','ACTIVE')
    AND (NULLIF(trim(p_query), '') IS NULL OR osi.search_vector @@ plainto_tsquery('simple', p_query) OR osi.title ILIKE '%' || p_query || '%' OR osi.description ILIKE '%' || p_query || '%')
  ORDER BY rank DESC, osi.updated_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
$$;

ALTER VIEW public.v_role_experience_homepages SET (security_invoker = true);
ALTER VIEW public.v_learning_center_progress SET (security_invoker = true);
ALTER VIEW public.v_operating_next_best_actions SET (security_invoker = true);
ALTER VIEW public.v_tenant_health_dashboard SET (security_invoker = true);
ALTER VIEW public.v_guided_workflow_status SET (security_invoker = true);
ALTER VIEW public.v_contextual_help_catalog SET (security_invoker = true);
ALTER VIEW public.v_operating_search_index SET (security_invoker = true);
ALTER VIEW public.v_operating_guidance_audit_timeline SET (security_invoker = true);

GRANT EXECUTE ON FUNCTION public.record_operating_guidance_audit_event(text, text, text, uuid, text, jsonb, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_learning_progress(text, text, integer, uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_guided_workflow(text, text, text, text, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_next_best_actions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_tenant_health_score(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_operating_knowledge(text, integer) TO authenticated;

DO $$ DECLARE v_customer_id uuid;
BEGIN
  SELECT id INTO v_customer_id FROM public.customers WHERE slug = 'qa-layer3x-operations' LIMIT 1;
  IF v_customer_id IS NOT NULL THEN
    PERFORM public.refresh_next_best_actions(v_customer_id);
    PERFORM public.recalculate_tenant_health_score(v_customer_id);
  END IF;
END; $$;

DO $mig$ DECLARE v_version text := '20260620120000';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=v_version) THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='supabase_migrations' AND table_name='schema_migrations' AND column_name='name')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='supabase_migrations' AND table_name='schema_migrations' AND column_name='statements') THEN
      INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES (v_version,'layer3x_operating_experience',ARRAY[]::text[]);
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='supabase_migrations' AND table_name='schema_migrations' AND column_name='statements') THEN
      INSERT INTO supabase_migrations.schema_migrations(version,statements) VALUES (v_version,ARRAY[]::text[]);
    ELSE
      INSERT INTO supabase_migrations.schema_migrations(version) VALUES (v_version);
    END IF;
  END IF;
END $mig$;