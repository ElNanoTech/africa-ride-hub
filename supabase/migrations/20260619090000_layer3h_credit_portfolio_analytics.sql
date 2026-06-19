-- ============================================================
-- Layer 3H - Credit Portfolio Analytics & Executive Intelligence
-- Read-only intelligence layer extending Layers 3A-3G.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.credit_products') IS NULL THEN
    RAISE EXCEPTION 'Layer 3H requires Layer 3A credit_products';
  END IF;
  IF to_regclass('public.credit_applications') IS NULL THEN
    RAISE EXCEPTION 'Layer 3H requires Layer 3A credit_applications';
  END IF;
  IF to_regclass('public.underwriting_decisions') IS NULL THEN
    RAISE EXCEPTION 'Layer 3H requires Layer 3B underwriting_decisions';
  END IF;
  IF to_regclass('public.credit_contracts') IS NULL THEN
    RAISE EXCEPTION 'Layer 3H requires Layer 3C credit_contracts';
  END IF;
  IF to_regclass('public.scheduled_obligations') IS NULL THEN
    RAISE EXCEPTION 'Layer 3H requires Layer 3D scheduled_obligations';
  END IF;
  IF to_regclass('public.credit_collections_cases') IS NULL THEN
    RAISE EXCEPTION 'Layer 3H requires Layer 3E credit_collections_cases';
  END IF;
  IF to_regclass('public.credit_default_reviews') IS NULL THEN
    RAISE EXCEPTION 'Layer 3H requires Layer 3F credit_default_reviews';
  END IF;
  IF to_regclass('public.ownership_completion_reviews') IS NULL THEN
    RAISE EXCEPTION 'Layer 3H requires Layer 3G ownership_completion_reviews';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_analytics_permission(permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(auth.role(), '') = 'service_role'
    OR public.is_platform_owner()
    OR CASE permission
      WHEN 'analytics.view' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer'])
      WHEN 'analytics.executive' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'analytics.finance' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'analytics.risk' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer'])
      WHEN 'analytics.collections' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer','agent_support','support'])
      WHEN 'analytics.export' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'analytics.audit' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'analytics.admin' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      ELSE false
    END
$$;

CREATE TABLE IF NOT EXISTS public.analytics_metric_definitions (
  metric_id text PRIMARY KEY,
  metric_name text NOT NULL,
  metric_category text NOT NULL,
  formula_description text NOT NULL,
  source_view text NOT NULL,
  refresh_cadence text NOT NULL DEFAULT 'ON_READ',
  owner_role text NOT NULL,
  known_limitations text NOT NULL DEFAULT 'No known limitations.',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analytics_snapshots (
  snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  snapshot_type text NOT NULL,
  snapshot_date date NOT NULL DEFAULT current_date,
  metric_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  data_freshness_status text NOT NULL DEFAULT 'FRESH' CHECK (data_freshness_status IN ('FRESH','DELAYED','STALE','ERROR')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.executive_attention_items (
  attention_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  severity text NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  title text NOT NULL,
  description text NOT NULL,
  source_reference_type text,
  source_reference_id text,
  source_data_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_action text NOT NULL,
  assigned_owner_role text NOT NULL DEFAULT 'manager',
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','DISMISSED','RESOLVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analytics_exports (
  export_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  export_type text NOT NULL,
  filters_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  source_timestamp timestamptz NOT NULL DEFAULT now(),
  storage_reference text,
  confidentiality_label text NOT NULL DEFAULT 'CONFIDENTIAL - DAM Africa',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analytics_audit_events (
  audit_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  actor_role text,
  event_type text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  filters_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_type text,
  export_reference uuid REFERENCES public.analytics_exports(export_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_customer_type
  ON public.analytics_snapshots(customer_id, snapshot_type, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_executive_attention_customer_status
  ON public.executive_attention_items(customer_id, status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_exports_customer_type
  ON public.analytics_exports(customer_id, export_type, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_audit_customer_event
  ON public.analytics_audit_events(customer_id, event_type, created_at DESC);

ALTER TABLE public.analytics_metric_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executive_attention_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analytics metric definitions read" ON public.analytics_metric_definitions;
CREATE POLICY "analytics metric definitions read" ON public.analytics_metric_definitions
FOR SELECT TO authenticated
USING (public.has_analytics_permission('analytics.view'));

DROP POLICY IF EXISTS "analytics snapshots tenant read" ON public.analytics_snapshots;
CREATE POLICY "analytics snapshots tenant read" ON public.analytics_snapshots
FOR SELECT TO authenticated
USING (
  public.has_analytics_permission('analytics.view')
  AND (public.is_platform_owner() OR customer_id = public.current_customer_id())
);

DROP POLICY IF EXISTS "executive attention tenant read" ON public.executive_attention_items;
CREATE POLICY "executive attention tenant read" ON public.executive_attention_items
FOR SELECT TO authenticated
USING (
  public.has_analytics_permission('analytics.executive')
  AND (public.is_platform_owner() OR customer_id = public.current_customer_id())
);

DROP POLICY IF EXISTS "analytics exports tenant read" ON public.analytics_exports;
CREATE POLICY "analytics exports tenant read" ON public.analytics_exports
FOR SELECT TO authenticated
USING (
  public.has_analytics_permission('analytics.audit')
  AND (public.is_platform_owner() OR customer_id = public.current_customer_id())
);

DROP POLICY IF EXISTS "analytics audit tenant read" ON public.analytics_audit_events;
CREATE POLICY "analytics audit tenant read" ON public.analytics_audit_events
FOR SELECT TO authenticated
USING (
  public.has_analytics_permission('analytics.audit')
  AND (public.is_platform_owner() OR customer_id = public.current_customer_id())
);

INSERT INTO public.analytics_metric_definitions (
  metric_id,
  metric_name,
  metric_category,
  formula_description,
  source_view,
  refresh_cadence,
  owner_role,
  known_limitations
) VALUES
  ('total_exposure', 'Total deployed exposure', 'portfolio_health', 'Sum principal_amount for active, past-due, suspended, completed, and defaulted credit accounts.', 'v_credit_portfolio_health', 'ON_READ', 'finance_manager', 'Principal exposure only; fees and penalties are excluded unless scheduled obligations include them.'),
  ('current_outstanding', 'Current outstanding', 'portfolio_health', 'Sum scheduled_obligations.amount where status is not PAID, CANCELLED, or SUPERSEDED.', 'v_credit_portfolio_health', 'ON_READ', 'finance_manager', 'Uses scheduled obligations as the source of truth.'),
  ('portfolio_at_risk', 'Portfolio at risk', 'risk', 'Outstanding amount for accounts with past due obligations, active collections cases, or active default review.', 'v_credit_portfolio_health', 'ON_READ', 'risk_manager', 'PAR threshold is one or more days past due.'),
  ('delinquency_rate', 'Delinquency rate', 'risk', 'Past due amount divided by outstanding amount.', 'v_credit_portfolio_health', 'ON_READ', 'risk_manager', 'Rate is null when outstanding balance is zero.'),
  ('activation_rate', 'Activation rate', 'product_performance', 'Active credit accounts divided by approved underwriting decisions for the same product.', 'v_credit_product_performance', 'ON_READ', 'operations_manager', 'Depends on applications having underwriting decisions.'),
  ('completion_rate', 'Completion rate', 'ownership', 'Completed ownership reviews divided by activated accounts.', 'v_credit_product_performance', 'ON_READ', 'operations_manager', 'Only Layer 3G ownership completion records are counted.'),
  ('default_review_rate', 'Default review rate', 'risk', 'Open default reviews divided by active accounts.', 'v_credit_product_performance', 'ON_READ', 'risk_manager', 'Closed/reversed/completed default reviews are excluded.'),
  ('recovery_rate', 'Recovery rate', 'collections', 'Resolved or closed collections past-due amount divided by all collections past-due amount.', 'v_credit_collector_performance', 'ON_READ', 'collections_manager', 'Uses collections case amounts, not bank reconciliation.'),
  ('ownership_funnel', 'Ownership funnel conversion', 'growth_ownership', 'Stage counts from eligible drivers through certificates and fleet entrepreneur candidates.', 'v_credit_growth_ownership_funnel', 'ON_READ', 'operations_manager', 'Eligibility is proxied by latest credit score tiers A/B where no explicit eligibility event exists.'),
  ('data_quality_anomalies', 'Data quality anomalies', 'data_quality', 'Union of schedule, collections, default, ownership, and analytics-specific reconciliation anomalies.', 'v_credit_reconciliation_summary', 'ON_READ', 'analytics_admin', 'Anomalies are advisory and do not mutate operational records.')
ON CONFLICT (metric_id) DO UPDATE SET
  metric_name = EXCLUDED.metric_name,
  metric_category = EXCLUDED.metric_category,
  formula_description = EXCLUDED.formula_description,
  source_view = EXCLUDED.source_view,
  refresh_cadence = EXCLUDED.refresh_cadence,
  owner_role = EXCLUDED.owner_role,
  known_limitations = EXCLUDED.known_limitations,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.record_analytics_audit_event(
  p_event_type text,
  p_target_type text,
  p_target_id text DEFAULT NULL,
  p_filters_json jsonb DEFAULT '{}'::jsonb,
  p_report_type text DEFAULT NULL,
  p_export_reference uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.admin_users%ROWTYPE;
  v_event_id uuid;
  v_required_permission text := 'analytics.view';
BEGIN
  IF p_event_type IN ('EXPORT_GENERATED','REPORT_DOWNLOADED') THEN
    v_required_permission := 'analytics.export';
  ELSIF p_event_type IN ('AUDIT_VIEWED','DATA_QUALITY_ACKNOWLEDGED') THEN
    v_required_permission := 'analytics.audit';
  END IF;

  IF NOT public.has_analytics_permission(v_required_permission) THEN
    RAISE EXCEPTION 'forbidden: % required', v_required_permission USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_actor
  FROM public.admin_users
  WHERE user_id = auth.uid()
    AND is_active = true
  LIMIT 1;

  INSERT INTO public.analytics_audit_events (
    customer_id,
    actor_id,
    actor_role,
    event_type,
    target_type,
    target_id,
    filters_json,
    report_type,
    export_reference
  ) VALUES (
    COALESCE(v_actor.customer_id, public.current_customer_id()),
    v_actor.id,
    v_actor.role_key,
    p_event_type,
    p_target_type,
    p_target_id,
    COALESCE(p_filters_json, '{}'::jsonb),
    p_report_type,
    p_export_reference
  )
  RETURNING audit_event_id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_analytics_export(
  p_export_type text,
  p_filters_json jsonb DEFAULT '{}'::jsonb,
  p_confidentiality_label text DEFAULT 'CONFIDENTIAL - DAM Africa'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.admin_users%ROWTYPE;
  v_export_id uuid;
  v_customer_id uuid;
BEGIN
  IF NOT public.has_analytics_permission('analytics.export') THEN
    RAISE EXCEPTION 'forbidden: analytics.export required' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_actor
  FROM public.admin_users
  WHERE user_id = auth.uid()
    AND is_active = true
  LIMIT 1;

  v_customer_id := COALESCE(v_actor.customer_id, public.current_customer_id());

  INSERT INTO public.analytics_exports (
    customer_id,
    export_type,
    filters_json,
    generated_by,
    source_timestamp,
    storage_reference,
    confidentiality_label
  ) VALUES (
    v_customer_id,
    p_export_type,
    COALESCE(p_filters_json, '{}'::jsonb),
    v_actor.id,
    now(),
    NULL,
    COALESCE(p_confidentiality_label, 'CONFIDENTIAL - DAM Africa')
  )
  RETURNING export_id INTO v_export_id;

  UPDATE public.analytics_exports
  SET storage_reference = 'browser-download:' || v_export_id::text
  WHERE export_id = v_export_id;

  PERFORM public.record_analytics_audit_event(
    'EXPORT_GENERATED',
    'analytics_export',
    v_export_id::text,
    COALESCE(p_filters_json, '{}'::jsonb),
    p_export_type,
    v_export_id
  );

  RETURN v_export_id;
END;
$$;

CREATE OR REPLACE VIEW public.v_credit_portfolio_account_facts
WITH (security_invoker = true)
AS
WITH obligation_totals AS (
  SELECT
    so.credit_account_id,
    COUNT(*)::integer AS obligation_count,
    COALESCE(SUM(so.amount), 0)::numeric AS total_scheduled_amount,
    COALESCE(SUM(so.amount) FILTER (WHERE so.status IN ('PAID')), 0)::numeric AS paid_amount,
    COALESCE(SUM(so.amount) FILTER (WHERE so.status NOT IN ('PAID','CANCELLED','SUPERSEDED')), 0)::numeric AS outstanding_balance,
    COALESCE(SUM(so.amount) FILTER (WHERE so.status NOT IN ('PAID','CANCELLED','SUPERSEDED') AND so.due_date < current_date), 0)::numeric AS past_due_amount,
    COALESCE(MAX(GREATEST(current_date - so.due_date, 0)) FILTER (WHERE so.status NOT IN ('PAID','CANCELLED','SUPERSEDED') AND so.due_date < current_date), 0)::integer AS max_days_past_due,
    MIN(so.due_date) FILTER (WHERE so.status NOT IN ('PAID','CANCELLED','SUPERSEDED')) AS next_due_date,
    MAX(so.updated_at) AS obligations_updated_at
  FROM public.scheduled_obligations so
  GROUP BY so.credit_account_id
),
collections_totals AS (
  SELECT
    c.credit_account_id,
    COUNT(*) FILTER (WHERE c.current_status NOT IN ('RESOLVED','CLOSED'))::integer AS open_collections_cases,
    COALESCE(SUM(c.total_past_due_amount) FILTER (WHERE c.current_status NOT IN ('RESOLVED','CLOSED')), 0)::numeric AS collections_past_due_amount,
    COALESCE(MAX(c.days_past_due) FILTER (WHERE c.current_status NOT IN ('RESOLVED','CLOSED')), 0)::integer AS collections_days_past_due,
    MAX(c.updated_at) AS collections_updated_at
  FROM public.credit_collections_cases c
  GROUP BY c.credit_account_id
),
default_totals AS (
  SELECT
    r.credit_account_id,
    COUNT(*) FILTER (WHERE r.status NOT IN ('RECOVERY_COMPLETED','DEFAULT_REVERSED','WRITTEN_OFF','CLOSED'))::integer AS default_reviews_open,
    COALESCE(SUM(r.past_due_amount) FILTER (WHERE r.status NOT IN ('RECOVERY_COMPLETED','DEFAULT_REVERSED','WRITTEN_OFF','CLOSED')), 0)::numeric AS default_review_amount,
    COALESCE(SUM(r.past_due_amount) FILTER (WHERE r.status = 'FORMALLY_DEFAULTED'), 0)::numeric AS formal_default_amount,
    MAX(r.updated_at) AS default_updated_at
  FROM public.credit_default_reviews r
  GROUP BY r.credit_account_id
)
SELECT
  ca.customer_id,
  ca.credit_account_id,
  ca.driver_id,
  d.full_name AS driver_name,
  d.phone_number AS driver_phone,
  COALESCE(d.city, 'Non defini') AS city,
  COALESCE(d.city, 'Non defini') AS branch_name,
  latest_score.tier AS driver_tier,
  latest_score.score AS driver_score,
  ca.product_id,
  cp.name AS product_name,
  cp.product_type,
  cp.status AS product_status,
  ca.product_version_id,
  ca.status AS account_status,
  ca.principal_amount::numeric AS principal_amount,
  ca.principal_currency_code AS currency_code,
  ca.activated_at,
  ca.created_at,
  COALESCE(ot.obligation_count, 0) AS obligation_count,
  COALESCE(ot.total_scheduled_amount, 0) AS total_scheduled_amount,
  COALESCE(ot.paid_amount, 0) AS paid_amount,
  COALESCE(ot.outstanding_balance, ca.principal_amount, 0)::numeric AS outstanding_balance,
  GREATEST(COALESCE(ot.past_due_amount, 0), COALESCE(ct.collections_past_due_amount, 0), COALESCE(dt.default_review_amount, 0))::numeric AS past_due_amount,
  GREATEST(COALESCE(ot.max_days_past_due, 0), COALESCE(ct.collections_days_past_due, 0))::integer AS days_past_due,
  COALESCE(ct.open_collections_cases, 0) AS open_collections_cases,
  COALESCE(dt.default_reviews_open, 0) AS default_reviews_open,
  COALESCE(dt.default_review_amount, 0) AS default_review_amount,
  COALESCE(dt.formal_default_amount, 0) AS formal_default_amount,
  ownership.status AS ownership_status,
  ownership.completed_at AS ownership_completed_at,
  COALESCE(transfer.has_completed_transfer, false) AS asset_transferred,
  COALESCE(certificate.has_issued_certificate, false) AS certificate_issued,
  CASE
    WHEN COALESCE(dt.formal_default_amount, 0) > 0 OR ca.status = 'DEFAULTED' THEN 'FORMAL_DEFAULT'
    WHEN COALESCE(dt.default_reviews_open, 0) > 0 THEN 'DEFAULT_REVIEW'
    WHEN GREATEST(COALESCE(ot.max_days_past_due, 0), COALESCE(ct.collections_days_past_due, 0)) >= 31 THEN '30_PLUS'
    WHEN GREATEST(COALESCE(ot.max_days_past_due, 0), COALESCE(ct.collections_days_past_due, 0)) >= 15 THEN '15_30'
    WHEN GREATEST(COALESCE(ot.max_days_past_due, 0), COALESCE(ct.collections_days_past_due, 0)) >= 8 THEN '8_14'
    WHEN GREATEST(COALESCE(ot.max_days_past_due, 0), COALESCE(ct.collections_days_past_due, 0)) >= 4 THEN '4_7'
    WHEN GREATEST(COALESCE(ot.max_days_past_due, 0), COALESCE(ct.collections_days_past_due, 0)) >= 1 THEN '1_3'
    WHEN ot.next_due_date = current_date THEN 'DUE_TODAY'
    ELSE 'CURRENT'
  END AS risk_segment,
  GREATEST(
    ca.updated_at,
    COALESCE(ot.obligations_updated_at, ca.updated_at),
    COALESCE(ct.collections_updated_at, ca.updated_at),
    COALESCE(dt.default_updated_at, ca.updated_at),
    COALESCE(ownership.updated_at, ca.updated_at)
  ) AS source_updated_at,
  now() AS last_refreshed_at,
  'FRESH'::text AS data_freshness_status,
  'credit_accounts, credit_products, drivers, credit_scores, scheduled_obligations, credit_collections_cases, credit_default_reviews, ownership_completion_reviews, asset_transfer_records, ownership_certificates'::text AS source_tables,
  'Outstanding = unpaid scheduled obligations; paid = PAID obligations; past due = unpaid obligations past due plus collections/default review amounts; ownership flags come from Layer 3G records.'::text AS formula_description,
  jsonb_build_object(
    'account', ca.credit_account_id,
    'driver', ca.driver_id,
    'product', ca.product_id,
    'schedule_obligations', COALESCE(ot.obligation_count, 0),
    'open_collections_cases', COALESCE(ct.open_collections_cases, 0),
    'open_default_reviews', COALESCE(dt.default_reviews_open, 0)
  ) AS source_records_json
FROM public.credit_accounts ca
JOIN public.credit_products cp ON cp.product_id = ca.product_id
JOIN public.drivers d ON d.id = ca.driver_id
LEFT JOIN obligation_totals ot ON ot.credit_account_id = ca.credit_account_id
LEFT JOIN collections_totals ct ON ct.credit_account_id = ca.credit_account_id
LEFT JOIN default_totals dt ON dt.credit_account_id = ca.credit_account_id
LEFT JOIN LATERAL (
  SELECT cs.tier, cs.score
  FROM public.credit_scores cs
  WHERE cs.driver_id = ca.driver_id
  ORDER BY cs.calculation_week DESC, cs.created_at DESC
  LIMIT 1
) latest_score ON true
LEFT JOIN LATERAL (
  SELECT r.review_id, r.status, r.completed_at, r.updated_at
  FROM public.ownership_completion_reviews r
  WHERE r.credit_account_id = ca.credit_account_id
  ORDER BY r.created_at DESC
  LIMIT 1
) ownership ON true
LEFT JOIN LATERAL (
  SELECT true AS has_completed_transfer
  FROM public.asset_transfer_records t
  WHERE t.credit_account_id = ca.credit_account_id
    AND t.transfer_status = 'COMPLETED'
  LIMIT 1
) transfer ON true
LEFT JOIN LATERAL (
  SELECT true AS has_issued_certificate
  FROM public.ownership_certificates c
  WHERE c.credit_account_id = ca.credit_account_id
    AND c.certificate_status = 'ISSUED'
  LIMIT 1
) certificate ON true
WHERE public.has_analytics_permission('analytics.view')
  AND (
    public.is_platform_owner()
    OR ca.customer_id = public.current_customer_id()
    OR COALESCE(auth.role(), '') = 'service_role'
  );

CREATE OR REPLACE VIEW public.v_credit_portfolio_health
WITH (security_invoker = true)
AS
SELECT
  f.customer_id,
  COUNT(*) FILTER (WHERE f.account_status IN ('ACTIVE','PAST_DUE','SUSPENDED'))::integer AS active_credit_accounts,
  COALESCE(SUM(f.principal_amount) FILTER (WHERE f.account_status IN ('ACTIVE','PAST_DUE','SUSPENDED','DEFAULTED','COMPLETED')), 0)::numeric AS total_deployed_exposure,
  COALESCE(SUM(f.outstanding_balance), 0)::numeric AS current_outstanding_balance,
  COALESCE(SUM(f.paid_amount), 0)::numeric AS total_paid_to_date,
  COALESCE(SUM(f.past_due_amount), 0)::numeric AS total_past_due_amount,
  COALESCE(SUM(f.outstanding_balance) FILTER (WHERE f.risk_segment NOT IN ('CURRENT','DUE_TODAY')), 0)::numeric AS portfolio_at_risk_amount,
  ROUND(
    100 * COALESCE(SUM(f.outstanding_balance) FILTER (WHERE f.risk_segment NOT IN ('CURRENT','DUE_TODAY')), 0)
    / NULLIF(COALESCE(SUM(f.outstanding_balance), 0), 0),
    2
  ) AS portfolio_at_risk_rate,
  COALESCE(SUM(f.default_review_amount), 0)::numeric AS default_review_amount,
  COALESCE(SUM(f.formal_default_amount), 0)::numeric AS formally_defaulted_amount,
  COUNT(*) FILTER (WHERE f.ownership_status = 'COMPLETED' OR f.certificate_issued)::integer AS completed_ownership_count,
  COUNT(DISTINCT f.product_id) FILTER (WHERE f.product_status IN ('ACTIVE','PUBLISHED','LIVE'))::integer AS active_product_count,
  now() AS last_updated_at,
  'FRESH'::text AS data_freshness_status,
  'Live source views are computed at query time. Scheduled snapshots are optional and recorded in analytics_snapshots.'::text AS data_freshness_note,
  jsonb_build_object(
    'credit_accounts', COUNT(*),
    'products', COUNT(DISTINCT f.product_id),
    'drivers', COUNT(DISTINCT f.driver_id),
    'past_due_accounts', COUNT(*) FILTER (WHERE f.past_due_amount > 0),
    'default_review_accounts', COUNT(*) FILTER (WHERE f.default_reviews_open > 0)
  ) AS source_records_json,
  'Filters available: date range, product type, city/branch, driver tier, account status, risk segment. This summary is the unfiltered tenant-level rollup.'::text AS filters_applied,
  'v_credit_portfolio_account_facts'::text AS source_view,
  'Active accounts, exposure, outstanding, paid-to-date, past-due, PAR, default, and ownership metrics are aggregated from account facts.'::text AS calculation_logic
FROM public.v_credit_portfolio_account_facts f
GROUP BY f.customer_id;

CREATE OR REPLACE VIEW public.v_credit_product_performance
WITH (security_invoker = true)
AS
WITH latest_decisions AS (
  SELECT DISTINCT ON (ud.application_id)
    ud.application_id,
    ud.decision,
    ud.decision_timestamp
  FROM public.underwriting_decisions ud
  ORDER BY ud.application_id, ud.decision_timestamp DESC
),
application_stats AS (
  SELECT
    a.customer_id,
    a.product_id,
    COUNT(*)::integer AS applications_submitted,
    COALESCE(AVG(a.down_payment_amount), 0)::numeric AS average_down_payment,
    COUNT(*) FILTER (WHERE a.eligibility_result IN ('ELIGIBLE','APPROVED','PASS','QUALIFIED'))::integer AS eligible_application_count,
    COUNT(*) FILTER (WHERE ld.decision IN ('APPROVED','APPROVED_WITH_CONDITIONS'))::integer AS approved_application_count
  FROM public.credit_applications a
  LEFT JOIN latest_decisions ld ON ld.application_id = a.application_id
  WHERE a.status NOT IN ('DRAFT','WITHDRAWN','EXPIRED')
  GROUP BY a.customer_id, a.product_id
),
contract_stats AS (
  SELECT
    c.customer_id,
    c.product_id,
    COUNT(*) FILTER (WHERE c.contract_status = 'FULLY_EXECUTED')::integer AS contracts_signed
  FROM public.credit_contracts c
  GROUP BY c.customer_id, c.product_id
),
account_stats AS (
  SELECT
    f.customer_id,
    f.product_id,
    COUNT(*)::integer AS activated_accounts,
    COALESCE(AVG(f.principal_amount), 0)::numeric AS average_financed_amount,
    COALESCE(SUM(f.paid_amount), 0)::numeric AS revenue_collected,
    COALESCE(SUM(f.outstanding_balance), 0)::numeric AS exposure_outstanding,
    COALESCE(SUM(f.past_due_amount), 0)::numeric AS past_due_amount,
    COUNT(*) FILTER (WHERE f.past_due_amount > 0)::integer AS delinquent_accounts,
    COUNT(*) FILTER (WHERE f.default_reviews_open > 0)::integer AS default_review_accounts,
    COUNT(*) FILTER (WHERE f.ownership_status = 'COMPLETED' OR f.certificate_issued)::integer AS completed_ownership_accounts,
    COALESCE(SUM(f.obligation_count), 0)::integer AS obligation_count
  FROM public.v_credit_portfolio_account_facts f
  GROUP BY f.customer_id, f.product_id
)
SELECT
  p.customer_id,
  p.product_id,
  p.name AS product_name,
  p.product_type,
  p.status AS product_status,
  COALESCE(app.applications_submitted, 0) AS applications_submitted,
  ROUND(100 * COALESCE(app.approved_application_count, 0)::numeric / NULLIF(app.applications_submitted, 0), 2) AS approval_rate,
  ROUND(100 * COALESCE(acct.activated_accounts, 0)::numeric / NULLIF(app.approved_application_count, 0), 2) AS activation_rate,
  COALESCE(acct.average_financed_amount, 0)::numeric AS average_financed_amount,
  COALESCE(app.average_down_payment, 0)::numeric AS average_down_payment,
  ROUND(100 * COALESCE(acct.revenue_collected, 0)::numeric / NULLIF(COALESCE(acct.revenue_collected, 0) + COALESCE(acct.exposure_outstanding, 0), 0), 2) AS average_repayment_performance,
  ROUND(100 * COALESCE(acct.past_due_amount, 0)::numeric / NULLIF(acct.exposure_outstanding, 0), 2) AS delinquency_rate,
  ROUND(100 * COALESCE(acct.default_review_accounts, 0)::numeric / NULLIF(acct.activated_accounts, 0), 2) AS default_review_rate,
  ROUND(100 * COALESCE(acct.completed_ownership_accounts, 0)::numeric / NULLIF(acct.activated_accounts, 0), 2) AS completion_rate,
  COALESCE(acct.revenue_collected, 0)::numeric AS revenue_collected,
  COALESCE(acct.exposure_outstanding, 0)::numeric AS exposure_outstanding,
  ROUND(100 * COALESCE(acct.activated_accounts, 0)::numeric / NULLIF(GREATEST(COALESCE(app.eligible_application_count, 0), COALESCE(app.applications_submitted, 0)), 0), 2) AS conversion_from_eligibility_to_activation,
  COALESCE(contracts.contracts_signed, 0) AS contracts_signed,
  COALESCE(acct.activated_accounts, 0) AS activated_accounts,
  CASE
    WHEN COALESCE(acct.activated_accounts, 0) = 0 THEN 'monitor'
    WHEN COALESCE(acct.past_due_amount, 0) / NULLIF(acct.exposure_outstanding, 0) >= 0.30 THEN 'pause_product'
    WHEN COALESCE(acct.past_due_amount, 0) / NULLIF(acct.exposure_outstanding, 0) >= 0.15 THEN 'tighten_policy'
    WHEN COALESCE(acct.default_review_accounts, 0)::numeric / NULLIF(acct.activated_accounts, 0) >= 0.10 THEN 'review_underwriting'
    WHEN COALESCE(app.approved_application_count, 0)::numeric / NULLIF(app.applications_submitted, 0) < 0.20 AND COALESCE(app.applications_submitted, 0) >= 5 THEN 'investigate_branch_product_issue'
    ELSE 'continue'
  END AS recommended_action,
  CASE
    WHEN COALESCE(acct.past_due_amount, 0) > 0 THEN 'risk_watch'
    WHEN COALESCE(acct.completed_ownership_accounts, 0) > 0 THEN 'ownership_progress'
    ELSE 'stable'
  END AS risk_signal,
  'trend_requires_snapshots'::text AS performance_trend,
  now() AS last_updated_at,
  'FRESH'::text AS data_freshness_status,
  jsonb_build_object(
    'applications', COALESCE(app.applications_submitted, 0),
    'approved_applications', COALESCE(app.approved_application_count, 0),
    'accounts', COALESCE(acct.activated_accounts, 0),
    'obligations', COALESCE(acct.obligation_count, 0)
  ) AS source_records_json,
  'Applications from credit_applications; approvals from latest underwriting_decisions; activations/exposure/repayment from v_credit_portfolio_account_facts.'::text AS calculation_logic
FROM public.credit_products p
LEFT JOIN application_stats app ON app.product_id = p.product_id AND app.customer_id IS NOT DISTINCT FROM p.customer_id
LEFT JOIN contract_stats contracts ON contracts.product_id = p.product_id AND contracts.customer_id IS NOT DISTINCT FROM p.customer_id
LEFT JOIN account_stats acct ON acct.product_id = p.product_id AND acct.customer_id IS NOT DISTINCT FROM p.customer_id
WHERE public.has_analytics_permission('analytics.view')
  AND (
    public.is_platform_owner()
    OR p.customer_id = public.current_customer_id()
    OR COALESCE(auth.role(), '') = 'service_role'
  );

CREATE OR REPLACE VIEW public.v_credit_risk_delinquency_summary
WITH (security_invoker = true)
AS
WITH segments(segment_key, segment_label, segment_order) AS (
  VALUES
    ('CURRENT','Current', 1),
    ('DUE_TODAY','Due today', 2),
    ('1_3','1-3 days late', 3),
    ('4_7','4-7 days late', 4),
    ('8_14','8-14 days late', 5),
    ('15_30','15-30 days late', 6),
    ('30_PLUS','30+ days late', 7),
    ('DEFAULT_REVIEW','Default review', 8),
    ('FORMAL_DEFAULT','Formal default', 9)
),
customers AS (
  SELECT DISTINCT customer_id FROM public.v_credit_portfolio_account_facts
)
SELECT
  c.customer_id,
  s.segment_key,
  s.segment_label,
  s.segment_order,
  COUNT(f.credit_account_id)::integer AS account_count,
  COALESCE(SUM(f.outstanding_balance), 0)::numeric AS outstanding_amount,
  COALESCE(SUM(f.past_due_amount), 0)::numeric AS past_due_amount,
  COALESCE(MAX(f.days_past_due), 0)::integer AS max_days_past_due,
  COALESCE(SUM(f.open_collections_cases), 0)::integer AS collections_cases_open,
  COALESCE(SUM(f.default_reviews_open), 0)::integer AS default_reviews_open,
  COUNT(f.credit_account_id) FILTER (WHERE f.asset_transferred = false AND f.past_due_amount > 0)::integer AS asset_protection_reviews,
  now() AS last_updated_at,
  'FRESH'::text AS data_freshness_status,
  jsonb_build_object(
    'segment', s.segment_key,
    'accounts', COUNT(f.credit_account_id),
    'records_source', 'v_credit_portfolio_account_facts'
  ) AS source_records_json,
  'Segmented from account days_past_due, collections cases, and default review status.'::text AS calculation_logic
FROM customers c
CROSS JOIN segments s
LEFT JOIN public.v_credit_portfolio_account_facts f
  ON f.customer_id IS NOT DISTINCT FROM c.customer_id
  AND f.risk_segment = s.segment_key
GROUP BY c.customer_id, s.segment_key, s.segment_label, s.segment_order;

CREATE OR REPLACE VIEW public.v_credit_growth_ownership_funnel
WITH (security_invoker = true)
AS
WITH tenant_drivers AS (
  SELECT d.customer_id, d.id AS driver_id
  FROM public.drivers d
  WHERE public.has_analytics_permission('analytics.view')
    AND (
      public.is_platform_owner()
      OR d.customer_id = public.current_customer_id()
      OR COALESCE(auth.role(), '') = 'service_role'
    )
),
eligible AS (
  SELECT DISTINCT td.customer_id, td.driver_id
  FROM tenant_drivers td
  JOIN LATERAL (
    SELECT cs.tier
    FROM public.credit_scores cs
    WHERE cs.driver_id = td.driver_id
    ORDER BY cs.calculation_week DESC, cs.created_at DESC
    LIMIT 1
  ) latest_score ON true
  WHERE latest_score.tier IN ('A','B')
),
stages AS (
  SELECT td.customer_id, 1 AS stage_order, 'eligible_driver'::text AS stage_key, 'Eligible Driver'::text AS stage_label, COUNT(DISTINCT e.driver_id)::numeric AS record_count, 'credit_scores, drivers'::text AS source_tables
  FROM tenant_drivers td
  LEFT JOIN eligible e ON e.customer_id IS NOT DISTINCT FROM td.customer_id
  GROUP BY td.customer_id
  UNION ALL
  SELECT a.customer_id, 2, 'application', 'Application', COUNT(*)::numeric, 'credit_applications'
  FROM public.credit_applications a
  WHERE public.has_analytics_permission('analytics.view')
    AND (public.is_platform_owner() OR a.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  GROUP BY a.customer_id
  UNION ALL
  SELECT a.customer_id, 3, 'approved', 'Approved', COUNT(DISTINCT a.application_id)::numeric, 'credit_applications, underwriting_decisions'
  FROM public.credit_applications a
  JOIN public.underwriting_decisions ud ON ud.application_id = a.application_id
  WHERE ud.decision IN ('APPROVED','APPROVED_WITH_CONDITIONS')
    AND public.has_analytics_permission('analytics.view')
    AND (public.is_platform_owner() OR a.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  GROUP BY a.customer_id
  UNION ALL
  SELECT c.customer_id, 4, 'contract_signed', 'Contract Signed', COUNT(*)::numeric, 'credit_contracts'
  FROM public.credit_contracts c
  WHERE c.contract_status = 'FULLY_EXECUTED'
    AND public.has_analytics_permission('analytics.view')
    AND (public.is_platform_owner() OR c.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  GROUP BY c.customer_id
  UNION ALL
  SELECT ca.customer_id, 5, 'activated', 'Activated', COUNT(*)::numeric, 'credit_accounts'
  FROM public.credit_accounts ca
  WHERE ca.status IN ('ACTIVE','PAST_DUE','SUSPENDED','COMPLETED','DEFAULTED')
    AND public.has_analytics_permission('analytics.view')
    AND (public.is_platform_owner() OR ca.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  GROUP BY ca.customer_id
  UNION ALL
  SELECT f.customer_id, 6, 'paid_successfully', 'Paid Successfully', COUNT(*) FILTER (WHERE f.outstanding_balance <= 0 OR f.account_status = 'COMPLETED')::numeric, 'scheduled_obligations, credit_accounts'
  FROM public.v_credit_portfolio_account_facts f
  GROUP BY f.customer_id
  UNION ALL
  SELECT r.customer_id, 7, 'ownership_completed', 'Ownership Completed', COUNT(*)::numeric, 'ownership_completion_reviews'
  FROM public.ownership_completion_reviews r
  WHERE r.status = 'COMPLETED'
    AND public.has_analytics_permission('analytics.view')
    AND (public.is_platform_owner() OR r.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  GROUP BY r.customer_id
  UNION ALL
  SELECT r.customer_id, 8, 'fleet_entrepreneur_candidate', 'Fleet Entrepreneur Candidate', COUNT(DISTINCT r.driver_id)::numeric, 'ownership_completion_reviews'
  FROM public.ownership_completion_reviews r
  WHERE r.status = 'COMPLETED'
    AND public.has_analytics_permission('analytics.view')
    AND (public.is_platform_owner() OR r.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  GROUP BY r.customer_id
),
normalized AS (
  SELECT
    stages.*,
    LAG(record_count) OVER (PARTITION BY customer_id ORDER BY stage_order) AS previous_count
  FROM stages
)
SELECT
  customer_id,
  stage_order,
  stage_key,
  stage_label,
  record_count::integer AS record_count,
  ROUND(100 * record_count / NULLIF(previous_count, 0), 2) AS conversion_rate,
  source_tables,
  now() AS last_updated_at,
  'FRESH'::text AS data_freshness_status,
  jsonb_build_object('stage', stage_key, 'records', record_count) AS source_records_json,
  'Funnel counts use real source records for each stage; eligible driver is proxied by latest score tier A/B until a dedicated eligibility event source exists.'::text AS calculation_logic
FROM normalized;

CREATE OR REPLACE VIEW public.v_credit_branch_performance
WITH (security_invoker = true)
AS
SELECT
  f.customer_id,
  f.branch_name,
  f.city,
  COUNT(*)::integer AS active_accounts,
  COALESCE(SUM(f.principal_amount), 0)::numeric AS deployed_exposure,
  COALESCE(SUM(f.outstanding_balance), 0)::numeric AS outstanding_balance,
  COALESCE(SUM(f.past_due_amount), 0)::numeric AS past_due_amount,
  ROUND(100 * COALESCE(SUM(f.past_due_amount), 0) / NULLIF(COALESCE(SUM(f.outstanding_balance), 0), 0), 2) AS delinquency_rate,
  COUNT(*) FILTER (WHERE f.default_reviews_open > 0)::integer AS default_review_accounts,
  COUNT(*) FILTER (WHERE f.ownership_status = 'COMPLETED' OR f.certificate_issued)::integer AS completed_ownership_count,
  CASE
    WHEN COALESCE(SUM(f.past_due_amount), 0) / NULLIF(COALESCE(SUM(f.outstanding_balance), 0), 0) >= 0.20 THEN 'branch_risk_spike'
    WHEN COUNT(*) FILTER (WHERE f.default_reviews_open > 0) > 0 THEN 'monitor_default_reviews'
    ELSE 'stable'
  END AS risk_signal,
  now() AS last_updated_at,
  'FRESH'::text AS data_freshness_status,
  jsonb_build_object('branch_source', 'drivers.city', 'account_count', COUNT(*)) AS source_records_json,
  'Branch is grouped by drivers.city because no canonical branch table exists across all credit layers.'::text AS calculation_logic
FROM public.v_credit_portfolio_account_facts f
GROUP BY f.customer_id, f.branch_name, f.city;

CREATE OR REPLACE VIEW public.v_credit_collector_performance
WITH (security_invoker = true)
AS
SELECT
  c.customer_id,
  c.assigned_to AS collector_id,
  COALESCE(au.full_name, 'Non assigne') AS collector_name,
  COUNT(*) FILTER (WHERE c.current_status NOT IN ('RESOLVED','CLOSED'))::integer AS open_cases,
  COUNT(*) FILTER (WHERE c.current_status IN ('RESOLVED','CLOSED'))::integer AS resolved_cases,
  COALESCE(SUM(c.total_past_due_amount), 0)::numeric AS total_case_amount,
  COALESCE(SUM(c.total_past_due_amount) FILTER (WHERE c.current_status IN ('RESOLVED','CLOSED')), 0)::numeric AS recovered_case_amount,
  ROUND(
    100 * COALESCE(SUM(c.total_past_due_amount) FILTER (WHERE c.current_status IN ('RESOLVED','CLOSED')), 0)
    / NULLIF(COALESCE(SUM(c.total_past_due_amount), 0), 0),
    2
  ) AS recovery_rate,
  COUNT(p.promise_id) FILTER (WHERE p.promise_status = 'BROKEN')::integer AS broken_promises,
  COUNT(p.promise_id) FILTER (WHERE p.promise_status = 'ACTIVE')::integer AS active_promises,
  now() AS last_updated_at,
  'FRESH'::text AS data_freshness_status,
  jsonb_build_object('cases', COUNT(*), 'promises', COUNT(p.promise_id)) AS source_records_json,
  'Recovery rate = closed/resolved collections amount divided by all assigned collections amount.'::text AS calculation_logic
FROM public.credit_collections_cases c
LEFT JOIN public.admin_users au ON au.id = c.assigned_to
LEFT JOIN public.credit_promises_to_pay p ON p.case_id = c.case_id
WHERE public.has_analytics_permission('analytics.collections')
  AND (
    public.is_platform_owner()
    OR c.customer_id = public.current_customer_id()
    OR COALESCE(auth.role(), '') = 'service_role'
  )
GROUP BY c.customer_id, c.assigned_to, au.full_name;

CREATE OR REPLACE VIEW public.v_credit_reconciliation_summary
WITH (security_invoker = true)
AS
WITH active_account_without_schedule AS (
  SELECT
    ca.customer_id,
    ca.credit_account_id::text AS source_reference_id,
    'CRITICAL'::text AS severity,
    'ACTIVE_ACCOUNT_WITHOUT_SCHEDULE'::text AS anomaly_type,
    jsonb_build_object('account_status', ca.status, 'activated_at', ca.activated_at) AS details_json
  FROM public.credit_accounts ca
  WHERE ca.status IN ('ACTIVE','PAST_DUE','SUSPENDED')
    AND NOT EXISTS (
      SELECT 1 FROM public.repayment_schedules rs
      WHERE rs.credit_account_id = ca.credit_account_id
        AND rs.schedule_status IN ('ACTIVE','PAUSED','COMPLETED')
    )
),
completed_account_not_ownership_completed AS (
  SELECT
    ca.customer_id,
    ca.credit_account_id::text AS source_reference_id,
    'WARNING'::text AS severity,
    'PAID_ACCOUNT_NOT_MARKED_OWNERSHIP_COMPLETED'::text AS anomaly_type,
    jsonb_build_object('account_status', ca.status) AS details_json
  FROM public.credit_accounts ca
  WHERE ca.status = 'COMPLETED'
    AND NOT EXISTS (
      SELECT 1 FROM public.ownership_completion_reviews r
      WHERE r.credit_account_id = ca.credit_account_id
        AND r.status = 'COMPLETED'
    )
),
schedule_anomalies AS (
  SELECT
    a.customer_id,
    COALESCE(a.credit_account_id::text, a.schedule_id::text, a.obligation_id::text, a.invoice_id::text) AS source_reference_id,
    a.severity,
    a.anomaly_type,
    a.details_json
  FROM public.v_credit_schedule_reconciliation_anomalies a
),
collection_anomalies AS (
  SELECT
    a.customer_id,
    COALESCE(a.credit_account_id::text, a.case_id::text, a.obligation_id::text, a.invoice_id::text) AS source_reference_id,
    a.severity,
    a.anomaly_type,
    a.details_json
  FROM public.v_credit_collections_reconciliation_anomalies a
),
default_anomalies AS (
  SELECT
    a.customer_id,
    COALESCE(a.credit_account_id::text, a.default_review_id::text) AS source_reference_id,
    a.severity,
    a.anomaly_type,
    a.details_json
  FROM public.v_credit_default_reconciliation_anomalies a
),
ownership_anomalies AS (
  SELECT
    a.customer_id,
    COALESCE(a.credit_account_id::text, a.review_id::text, a.asset_id::text) AS source_reference_id,
    a.severity,
    a.exception_type AS anomaly_type,
    a.details_json
  FROM public.v_ownership_completion_exceptions a
),
unioned AS (
  SELECT * FROM active_account_without_schedule
  UNION ALL SELECT * FROM completed_account_not_ownership_completed
  UNION ALL SELECT * FROM schedule_anomalies
  UNION ALL SELECT * FROM collection_anomalies
  UNION ALL SELECT * FROM default_anomalies
  UNION ALL SELECT * FROM ownership_anomalies
)
SELECT
  gen_random_uuid() AS anomaly_id,
  u.customer_id,
  u.source_reference_id,
  u.severity,
  u.anomaly_type,
  u.details_json,
  now() AS detected_at,
  'FRESH'::text AS data_freshness_status,
  'Union of repayment schedule, collections, default, ownership, and account lifecycle reconciliation checks.'::text AS calculation_logic
FROM unioned u
WHERE public.has_analytics_permission('analytics.audit')
  AND (
    public.is_platform_owner()
    OR u.customer_id = public.current_customer_id()
    OR COALESCE(auth.role(), '') = 'service_role'
  );

CREATE OR REPLACE VIEW public.v_credit_executive_attention_items
WITH (security_invoker = true)
AS
WITH persisted AS (
  SELECT
    e.attention_item_id,
    e.customer_id,
    e.item_type,
    e.severity,
    e.title,
    e.description,
    e.source_reference_type,
    e.source_reference_id,
    e.source_data_json,
    e.recommended_action,
    e.assigned_owner_role,
    e.status,
    e.created_at,
    e.updated_at,
    '/admin/credit-portfolio?tab=attention'::text AS record_link
  FROM public.executive_attention_items e
  WHERE e.status IN ('OPEN','ACKNOWLEDGED')
),
high_risk_account AS (
  SELECT DISTINCT ON (f.customer_id)
    gen_random_uuid() AS attention_item_id,
    f.customer_id,
    'high_value_account_at_risk'::text AS item_type,
    CASE WHEN f.days_past_due >= 30 OR f.default_reviews_open > 0 THEN 'CRITICAL' ELSE 'HIGH' END AS severity,
    'High-value account at risk'::text AS title,
    format('%s has %s outstanding with %s days past due.', COALESCE(f.driver_name, 'Driver'), f.outstanding_balance::text, f.days_past_due::text) AS description,
    'credit_account'::text AS source_reference_type,
    f.credit_account_id::text AS source_reference_id,
    f.source_records_json AS source_data_json,
    'Review collections/default posture and executive exposure.'::text AS recommended_action,
    'risk_manager'::text AS assigned_owner_role,
    'OPEN'::text AS status,
    now() AS created_at,
    now() AS updated_at,
    '/admin/credit-portfolio?tab=risk'::text AS record_link
  FROM public.v_credit_portfolio_account_facts f
  WHERE f.past_due_amount > 0
  ORDER BY f.customer_id, f.outstanding_balance DESC, f.days_past_due DESC
),
product_issue AS (
  SELECT
    gen_random_uuid(),
    p.customer_id,
    'product_underperformance',
    CASE WHEN p.recommended_action = 'pause_product' THEN 'CRITICAL' ELSE 'HIGH' END,
    'Product performance requires review',
    format('%s is flagged for %s based on current portfolio metrics.', p.product_name, p.recommended_action),
    'credit_product',
    p.product_id::text,
    p.source_records_json,
    'Use product dashboard to decide whether to continue, monitor, tighten policy, pause, or review underwriting.',
    'executive',
    'OPEN',
    now(),
    now(),
    '/admin/credit-portfolio?tab=products'
  FROM public.v_credit_product_performance p
  WHERE p.recommended_action <> 'continue'
),
data_quality_issue AS (
  SELECT DISTINCT ON (r.customer_id)
    gen_random_uuid(),
    r.customer_id,
    'reconciliation_anomaly',
    r.severity,
    'Data quality anomaly needs review',
    format('%s detected in source records.', r.anomaly_type),
    'reconciliation_anomaly',
    r.source_reference_id,
    r.details_json,
    'Review the anomaly before using affected metrics for leadership decisions.',
    'analytics_admin',
    'OPEN',
    now(),
    now(),
    '/admin/credit-portfolio?tab=quality'
  FROM public.v_credit_reconciliation_summary r
  WHERE r.severity IN ('CRITICAL','HIGH','WARNING')
  ORDER BY r.customer_id, CASE r.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 ELSE 3 END
),
ownership_backlog AS (
  SELECT
    gen_random_uuid(),
    q.customer_id,
    'ownership_completion_backlog',
    'MEDIUM',
    'Ownership completion backlog',
    format('%s ownership completion records are waiting for review or final approval.', COUNT(*)::text),
    'ownership_completion_reviews',
    NULL::text,
    jsonb_build_object('waiting_records', COUNT(*)),
    'Assign ownership reviews and issue certificates where eligible.',
    'operations_manager',
    'OPEN',
    now(),
    now(),
    '/admin/ownership-completion'
  FROM public.v_ownership_completion_queue q
  WHERE q.status IN ('ELIGIBLE_FOR_COMPLETION','UNDER_COMPLETION_REVIEW','AWAITING_FINAL_APPROVAL')
  GROUP BY q.customer_id
)
SELECT *
FROM (
  SELECT * FROM persisted
  UNION ALL SELECT * FROM high_risk_account
  UNION ALL SELECT * FROM product_issue
  UNION ALL SELECT * FROM data_quality_issue
  UNION ALL SELECT * FROM ownership_backlog
) attention
WHERE public.has_analytics_permission('analytics.executive')
  AND (
    public.is_platform_owner()
    OR attention.customer_id = public.current_customer_id()
    OR COALESCE(auth.role(), '') = 'service_role'
  );

CREATE OR REPLACE VIEW public.v_credit_analytics_freshness
WITH (security_invoker = true)
AS
WITH latest_snapshot AS (
  SELECT DISTINCT ON (s.customer_id, s.snapshot_type)
    s.customer_id,
    s.snapshot_type,
    s.generated_at,
    s.data_freshness_status
  FROM public.analytics_snapshots s
  WHERE public.has_analytics_permission('analytics.view')
    AND (public.is_platform_owner() OR s.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  ORDER BY s.customer_id, s.snapshot_type, s.generated_at DESC
)
SELECT
  h.customer_id,
  'portfolio_live'::text AS source_name,
  h.last_updated_at AS last_updated_at,
  h.data_freshness_status,
  h.data_freshness_note,
  now() AS checked_at
FROM public.v_credit_portfolio_health h
UNION ALL
SELECT
  ls.customer_id,
  ls.snapshot_type,
  ls.generated_at,
  CASE
    WHEN ls.data_freshness_status = 'ERROR' THEN 'ERROR'
    WHEN ls.generated_at < now() - interval '24 hours' THEN 'STALE'
    WHEN ls.generated_at < now() - interval '30 minutes' THEN 'DELAYED'
    ELSE 'FRESH'
  END,
  'Scheduled analytics snapshot freshness.'::text,
  now()
FROM latest_snapshot ls;

GRANT SELECT ON public.analytics_metric_definitions TO authenticated, service_role;
GRANT SELECT ON public.analytics_snapshots TO authenticated, service_role;
GRANT SELECT ON public.executive_attention_items TO authenticated, service_role;
GRANT SELECT ON public.analytics_exports TO authenticated, service_role;
GRANT SELECT ON public.analytics_audit_events TO authenticated, service_role;
GRANT SELECT ON public.v_credit_portfolio_account_facts TO authenticated, service_role;
GRANT SELECT ON public.v_credit_portfolio_health TO authenticated, service_role;
GRANT SELECT ON public.v_credit_product_performance TO authenticated, service_role;
GRANT SELECT ON public.v_credit_risk_delinquency_summary TO authenticated, service_role;
GRANT SELECT ON public.v_credit_growth_ownership_funnel TO authenticated, service_role;
GRANT SELECT ON public.v_credit_executive_attention_items TO authenticated, service_role;
GRANT SELECT ON public.v_credit_branch_performance TO authenticated, service_role;
GRANT SELECT ON public.v_credit_collector_performance TO authenticated, service_role;
GRANT SELECT ON public.v_credit_reconciliation_summary TO authenticated, service_role;
GRANT SELECT ON public.v_credit_analytics_freshness TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_analytics_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_analytics_audit_event(text, text, text, jsonb, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_analytics_export(text, jsonb, text) TO authenticated, service_role;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'executive_attention_items',
    'analytics_exports',
    'analytics_audit_events'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    EXCEPTION
      WHEN undefined_table THEN NULL;
    END;
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN duplicate_table THEN NULL;
      WHEN undefined_object THEN NULL;
    END;
  END LOOP;
END;
$$;

COMMENT ON TABLE public.analytics_metric_definitions IS 'Layer 3H reusable source-linked metric library.';
COMMENT ON TABLE public.analytics_snapshots IS 'Layer 3H optional point-in-time analytics snapshot records.';
COMMENT ON TABLE public.executive_attention_items IS 'Layer 3H executive attention metadata; generated attention also appears in v_credit_executive_attention_items.';
COMMENT ON TABLE public.analytics_exports IS 'Layer 3H audited analytics export register.';
COMMENT ON TABLE public.analytics_audit_events IS 'Layer 3H analytics access, drilldown, export, and data-quality audit trail.';

NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_version text := '20260619090000';
  v_name text := 'layer3h_credit_portfolio_analytics';
  v_has_name boolean;
  v_has_statements boolean;
BEGIN
  IF EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = v_version
  ) THEN
    RAISE NOTICE 'Migration % already marked applied', v_version;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'supabase_migrations'
      AND table_name = 'schema_migrations'
      AND column_name = 'name'
  ) INTO v_has_name;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'supabase_migrations'
      AND table_name = 'schema_migrations'
      AND column_name = 'statements'
  ) INTO v_has_statements;

  IF v_has_name AND v_has_statements THEN
    EXECUTE 'insert into supabase_migrations.schema_migrations(version, name, statements) values ($1, $2, array[]::text[])'
      USING v_version, v_name;
  ELSIF v_has_name THEN
    EXECUTE 'insert into supabase_migrations.schema_migrations(version, name) values ($1, $2)'
      USING v_version, v_name;
  ELSIF v_has_statements THEN
    EXECUTE 'insert into supabase_migrations.schema_migrations(version, statements) values ($1, array[]::text[])'
      USING v_version;
  ELSE
    EXECUTE 'insert into supabase_migrations.schema_migrations(version) values ($1)'
      USING v_version;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
