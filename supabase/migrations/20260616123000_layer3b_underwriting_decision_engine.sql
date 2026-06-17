-- ============================================================
-- Layer 3B — Underwriting & Decision Engine
-- Policy-driven, deterministic, audited underwriting ownership.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF to_regclass('public.credit_exposure_profiles') IS NULL THEN
    RAISE EXCEPTION 'Layer 3B requires Layer 3A credit_exposure_profiles';
  END IF;
  IF to_regclass('public.credit_policy_sets') IS NULL THEN
    RAISE EXCEPTION 'Layer 3B requires Layer 3A credit_policy_sets';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_underwriting_permission(permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_owner()
    OR CASE permission
      WHEN 'underwriting.view' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer','support','agent_support'])
      WHEN 'underwriting.review' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer'])
      WHEN 'underwriting.approve' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'underwriting.override' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'underwriting.audit' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'underwriting.admin' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      ELSE false
    END
$$;

ALTER TABLE public.credit_policy_sets
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.credit_products(product_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS approval_authority_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS decision_matrix_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.credit_policy_sets
  DROP CONSTRAINT IF EXISTS credit_policy_sets_status_check;

ALTER TABLE public.credit_policy_sets
  ADD CONSTRAINT credit_policy_sets_status_check
  CHECK (status IN ('DRAFT','ACTIVE','PAUSED','RETIRED','ARCHIVED'));

ALTER TABLE public.credit_applications
  DROP CONSTRAINT IF EXISTS credit_applications_status_check;

ALTER TABLE public.credit_applications
  ADD CONSTRAINT credit_applications_status_check
  CHECK (status IN (
    'DRAFT','STARTED','SUBMITTED','UNDER_REVIEW','APPROVED','DECLINED','WITHDRAWN','EXPIRED',
    'UNDERWRITING_APPROVED','UNDERWRITING_CONDITIONAL','UNDERWRITING_DECLINED',
    'UNDERWRITING_REVIEW','UNDERWRITING_ESCALATED'
  ));

CREATE TABLE IF NOT EXISTS public.underwriting_decisions (
  decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.credit_applications(application_id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('APPROVED','APPROVED_WITH_CONDITIONS','MANUAL_REVIEW','DECLINED','ESCALATED')),
  trust_assessment text NOT NULL CHECK (trust_assessment IN ('LOW','MEDIUM','HIGH','EXCEPTIONAL','UNKNOWN')),
  financial_assessment text NOT NULL CHECK (financial_assessment IN ('LOW','MEDIUM','HIGH','UNKNOWN')),
  risk_assessment text NOT NULL CHECK (risk_assessment IN ('LOW','MEDIUM','HIGH','CRITICAL','UNKNOWN')),
  exposure_assessment text NOT NULL CHECK (exposure_assessment IN ('WITHIN_LIMIT','EXCEEDS_LIMIT','MANUAL_REVIEW','UNKNOWN')),
  decision_score_value integer CHECK (decision_score_value IS NULL OR (decision_score_value >= 0 AND decision_score_value <= 1000)),
  decision_score_grade text CHECK (decision_score_grade IS NULL OR decision_score_grade IN ('A','B','C','D','E')),
  decision_risk_level text,
  decision_risk_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_exposure_amount integer NOT NULL DEFAULT 0 CHECK (requested_exposure_amount >= 0),
  requested_exposure_currency_code text NOT NULL DEFAULT 'XOF',
  current_exposure_amount integer NOT NULL DEFAULT 0 CHECK (current_exposure_amount >= 0),
  current_exposure_currency_code text NOT NULL DEFAULT 'XOF',
  maximum_exposure_amount integer NOT NULL DEFAULT 0 CHECK (maximum_exposure_amount >= 0),
  maximum_exposure_currency_code text NOT NULL DEFAULT 'XOF',
  available_exposure_amount integer NOT NULL DEFAULT 0 CHECK (available_exposure_amount >= 0),
  available_exposure_currency_code text NOT NULL DEFAULT 'XOF',
  evaluated_policy_set_id uuid REFERENCES public.credit_policy_sets(policy_id) ON DELETE SET NULL,
  evaluated_policy_version integer NOT NULL DEFAULT 1,
  evaluated_policy_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  extension_results_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason_codes_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  driver_explanation text NOT NULL,
  admin_explanation text NOT NULL,
  decision_valid_until timestamptz,
  idempotency_key text NOT NULL,
  reviewer_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  decision_timestamp timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.underwriting_conditions (
  condition_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL REFERENCES public.underwriting_decisions(decision_id) ON DELETE CASCADE,
  condition_type text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','FULFILLED','WAIVED')),
  fulfilled_at timestamptz,
  fulfilled_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  idempotency_key text,
  created_by uuid,
  updated_by uuid,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.review_assignments (
  assignment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.credit_applications(application_id) ON DELETE CASCADE,
  reviewer_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_REVIEW','RESOLVED','EXPIRED','CANCELLED')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  due_by timestamptz,
  idempotency_key text NOT NULL,
  created_by uuid,
  updated_by uuid,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.reunderwriting_triggers (
  trigger_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.credit_applications(application_id) ON DELETE CASCADE,
  prior_decision_id uuid REFERENCES public.underwriting_decisions(decision_id) ON DELETE SET NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'DECISION_EXPIRED','APPLICATION_CHANGED','SCORE_GRADE_CHANGED','RISK_STATUS_CHANGED',
    'EXPOSURE_CHANGED','POLICY_CHANGED','KYC_OR_DOCUMENT_CHANGED'
  )),
  trigger_source text NOT NULL DEFAULT 'system',
  trigger_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  required_snapshot_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','BLOCKING','RESOLVED','CANCELLED')),
  resolution_decision_id uuid REFERENCES public.underwriting_decisions(decision_id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  created_by uuid,
  updated_by uuid,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, application_id, prior_decision_id, trigger_type, status)
);

CREATE TABLE IF NOT EXISTS public.product_underwriting_extensions (
  extension_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.credit_products(product_id) ON DELETE CASCADE,
  product_version_id uuid REFERENCES public.product_versions(version_id) ON DELETE CASCADE,
  policy_set_id uuid REFERENCES public.credit_policy_sets(policy_id) ON DELETE CASCADE,
  extension_key text NOT NULL,
  extension_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','PAUSED','RETIRED','ARCHIVED')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.underwriting_overrides (
  override_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL REFERENCES public.underwriting_decisions(decision_id) ON DELETE CASCADE,
  reason text NOT NULL,
  reviewer_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  second_approver_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  before_state_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  affected_policies_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key text NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, idempotency_key),
  CONSTRAINT underwriting_override_distinct_approvers CHECK (second_approver_id IS NULL OR second_approver_id <> reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_underwriting_decisions_application
  ON public.underwriting_decisions(application_id, decision_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_underwriting_decisions_customer_decision
  ON public.underwriting_decisions(customer_id, decision, decision_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_underwriting_conditions_decision
  ON public.underwriting_conditions(decision_id, status);
CREATE INDEX IF NOT EXISTS idx_review_assignments_application
  ON public.review_assignments(application_id, status);
CREATE INDEX IF NOT EXISTS idx_reunderwriting_triggers_application
  ON public.reunderwriting_triggers(application_id, status);
CREATE INDEX IF NOT EXISTS idx_product_underwriting_extensions_policy
  ON public.product_underwriting_extensions(policy_set_id, status);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'underwriting_decisions','underwriting_conditions','review_assignments',
    'reunderwriting_triggers','product_underwriting_extensions','underwriting_overrides'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'underwriting_decisions','underwriting_conditions','review_assignments',
    'reunderwriting_triggers','product_underwriting_extensions','underwriting_overrides'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "underwriting platform owner all" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "underwriting admins tenant" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "underwriting platform owner all" ON public.%I FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner())',
      t
    );
    EXECUTE format(
      'CREATE POLICY "underwriting admins tenant" ON public.%I FOR ALL TO authenticated USING (public.has_underwriting_permission(''underwriting.view'') AND customer_id = public.current_customer_id()) WITH CHECK (public.has_underwriting_permission(''underwriting.review'') AND customer_id = public.current_customer_id())',
      t
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.underwriting_application_status(p_decision text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_decision
    WHEN 'APPROVED' THEN 'UNDERWRITING_APPROVED'
    WHEN 'APPROVED_WITH_CONDITIONS' THEN 'UNDERWRITING_CONDITIONAL'
    WHEN 'DECLINED' THEN 'UNDERWRITING_DECLINED'
    WHEN 'ESCALATED' THEN 'UNDERWRITING_ESCALATED'
    ELSE 'UNDERWRITING_REVIEW'
  END
$$;

CREATE OR REPLACE FUNCTION public.underwriting_trust_assessment(p_grade text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_grade
    WHEN 'A' THEN 'EXCEPTIONAL'
    WHEN 'B' THEN 'HIGH'
    WHEN 'C' THEN 'MEDIUM'
    WHEN 'D' THEN 'LOW'
    WHEN 'E' THEN 'LOW'
    ELSE 'UNKNOWN'
  END
$$;

CREATE OR REPLACE FUNCTION public.underwriting_risk_assessment(p_risk_level text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(COALESCE(p_risk_level, ''))
    WHEN 'bon' THEN 'LOW'
    WHEN 'low' THEN 'LOW'
    WHEN 'moyen' THEN 'MEDIUM'
    WHEN 'moderate' THEN 'MEDIUM'
    WHEN 'eleve' THEN 'HIGH'
    WHEN 'high' THEN 'HIGH'
    WHEN 'critique' THEN 'CRITICAL'
    WHEN 'critical' THEN 'CRITICAL'
    ELSE 'UNKNOWN'
  END
$$;

CREATE OR REPLACE FUNCTION public.underwriting_financial_assessment(p_application_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_late integer := 0;
BEGIN
  SELECT COUNT(*)::integer INTO v_late
  FROM public.payments p
  JOIN public.credit_applications ca ON ca.driver_id = p.driver_id
  WHERE ca.application_id = p_application_id
    AND (p.status IN ('overdue','late') OR (p.status IN ('pending','partial') AND p.due_date < current_date));

  RETURN CASE
    WHEN v_late >= 3 THEN 'LOW'
    WHEN v_late >= 1 THEN 'MEDIUM'
    ELSE 'HIGH'
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.underwriting_matrix_outcome(
  p_matrix jsonb,
  p_trust text,
  p_financial text,
  p_risk text,
  p_exposure text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_trust jsonb;
  v_financial jsonb;
  v_risk jsonb;
  v_exposure jsonb;
BEGIN
  IF jsonb_typeof(p_matrix) <> 'array' THEN
    RETURN 'MANUAL_REVIEW';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_matrix)
  LOOP
    v_trust := COALESCE(v_row->'trust', '["ANY"]'::jsonb);
    v_financial := COALESCE(v_row->'financial', '["ANY"]'::jsonb);
    v_risk := COALESCE(v_row->'risk', '["ANY"]'::jsonb);
    v_exposure := COALESCE(v_row->'exposure', '["ANY"]'::jsonb);

    IF (v_trust ? p_trust OR v_trust ? 'ANY')
      AND (v_financial ? p_financial OR v_financial ? 'ANY')
      AND (v_risk ? p_risk OR v_risk ? 'ANY')
      AND (v_exposure ? p_exposure OR v_exposure ? 'ANY') THEN
      RETURN COALESCE(NULLIF(v_row->>'outcome', ''), 'MANUAL_REVIEW');
    END IF;
  END LOOP;

  RETURN 'MANUAL_REVIEW';
END;
$$;

CREATE OR REPLACE FUNCTION public.underwriting_apply_product_extensions(
  p_application_id uuid,
  p_policy_set_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.credit_applications%ROWTYPE;
  v_product public.credit_products%ROWTYPE;
  v_asset public.financed_assets%ROWTYPE;
  v_required_asset_type text;
  v_reasons text[] := ARRAY[]::text[];
  v_conditions jsonb := '[]'::jsonb;
  v_review_flags jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_app FROM public.credit_applications WHERE application_id = p_application_id;
  SELECT * INTO v_product FROM public.credit_products WHERE product_id = v_app.product_id;
  IF v_app.requested_asset_id IS NOT NULL THEN
    SELECT * INTO v_asset FROM public.financed_assets WHERE asset_id = v_app.requested_asset_id;
  END IF;

  v_required_asset_type := NULLIF(v_product.asset_rules_json->>'asset_type', '');

  IF v_required_asset_type IS NOT NULL AND v_app.requested_asset_id IS NOT NULL AND v_asset.asset_type IS DISTINCT FROM v_required_asset_type THEN
    v_reasons := array_append(v_reasons, 'PRODUCT_ASSET_TYPE_MISMATCH');
    v_review_flags := v_review_flags || jsonb_build_array('product_asset_type_mismatch');
  END IF;

  IF COALESCE((v_product.asset_rules_json->>'requires_possession_confirmation')::boolean, false) THEN
    v_conditions := v_conditions || jsonb_build_array(jsonb_build_object(
      'condition_type', 'POSSESSION_CONFIRMATION',
      'description', 'Confirmer la remise et la possession du véhicule avant activation.'
    ));
  END IF;

  IF v_product.vendor_id IS NOT NULL THEN
    v_conditions := v_conditions || jsonb_build_array(jsonb_build_object(
      'condition_type', 'VENDOR_CONFIRMATION',
      'description', 'Confirmation fournisseur requise avant contractualisation.'
    ));
  END IF;

  RETURN jsonb_build_object(
    'gate_results', jsonb_build_object('product_asset_type', CASE WHEN array_position(v_reasons, 'PRODUCT_ASSET_TYPE_MISMATCH') IS NULL THEN 'PASSED' ELSE 'REVIEW' END),
    'conditions', v_conditions,
    'review_flags', v_review_flags,
    'reason_codes', to_jsonb(v_reasons),
    'driver_explanation_inputs', jsonb_build_object('product', v_product.name),
    'admin_explanation_inputs', jsonb_build_object('policy_set_id', p_policy_set_id, 'product_type', v_product.product_type)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.underwriting_latest_decision(p_application_id uuid)
RETURNS public.underwriting_decisions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.underwriting_decisions
  WHERE application_id = p_application_id
  ORDER BY decision_timestamp DESC, created_at DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.evaluate_underwriting_decision(
  p_application_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.underwriting_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.credit_applications%ROWTYPE;
  v_snapshot public.credit_snapshots%ROWTYPE;
  v_product public.credit_products%ROWTYPE;
  v_policy public.credit_policy_sets%ROWTYPE;
  v_score_row public.driver_scores%ROWTYPE;
  v_credit_score public.credit_scores%ROWTYPE;
  v_exposure public.credit_exposure_profiles%ROWTYPE;
  v_existing public.underwriting_decisions%ROWTYPE;
  v_decision public.underwriting_decisions%ROWTYPE;
  v_risk jsonb := '{}'::jsonb;
  v_risk_level text := 'UNKNOWN';
  v_trust text := 'UNKNOWN';
  v_financial text := 'UNKNOWN';
  v_risk_assessment text := 'UNKNOWN';
  v_exposure_assessment text := 'UNKNOWN';
  v_requested_amount integer := 0;
  v_currency text := 'XOF';
  v_outcome text := 'MANUAL_REVIEW';
  v_app_status text;
  v_reason_codes text[] := ARRAY[]::text[];
  v_driver_explanation text;
  v_admin_explanation text;
  v_policy_snapshot jsonb;
  v_extension jsonb;
  v_conditions jsonb := '[]'::jsonb;
  v_condition jsonb;
  v_reviewer_id uuid;
  v_valid_days integer := 30;
BEGIN
  IF NOT public.has_underwriting_permission('underwriting.review') THEN
    RAISE EXCEPTION 'forbidden: underwriting.review required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.underwriting_decisions
  WHERE customer_id = public.current_customer_id()
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_app
  FROM public.credit_applications
  WHERE application_id = p_application_id
    AND (public.is_platform_owner() OR customer_id = public.current_customer_id())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit application not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_app.expires_at IS NOT NULL AND v_app.expires_at <= now() THEN
    UPDATE public.credit_applications
    SET status = 'EXPIRED', updated_by = auth.uid(), status_changed_at = now()
    WHERE application_id = v_app.application_id;
    PERFORM public.credit_log_event(v_app.customer_id, 'review_expired', 'credit_application', v_app.application_id, to_jsonb(v_app), jsonb_build_object('status','EXPIRED'), '{}'::jsonb, p_idempotency_key || ':expired');
    RAISE EXCEPTION 'credit application expired before underwriting';
  END IF;

  SELECT * INTO v_snapshot FROM public.credit_snapshots WHERE application_id = v_app.application_id;
  SELECT * INTO v_product FROM public.credit_products WHERE product_id = v_app.product_id AND customer_id = v_app.customer_id;

  SELECT * INTO v_policy
  FROM public.credit_policy_sets
  WHERE customer_id = v_app.customer_id
    AND status = 'ACTIVE'
    AND policy_type = 'UNDERWRITING_POLICY'
    AND (product_id = v_app.product_id OR product_id IS NULL)
    AND effective_from <= now()
    AND (effective_to IS NULL OR effective_to > now())
  ORDER BY CASE WHEN product_id = v_app.product_id THEN 0 ELSE 1 END, version DESC, effective_from DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active underwriting policy not found' USING ERRCODE = 'P0002';
  END IF;

  v_policy_snapshot := jsonb_build_object(
    'policy_id', v_policy.policy_id,
    'policy_name', v_policy.policy_name,
    'policy_type', v_policy.policy_type,
    'version', v_policy.version,
    'rules_json', v_policy.rules_json,
    'approval_authority_json', v_policy.approval_authority_json,
    'decision_matrix_json', v_policy.decision_matrix_json,
    'policy_json', v_policy.policy_json,
    'effective_from', v_policy.effective_from,
    'effective_to', v_policy.effective_to
  );
  v_valid_days := COALESCE(NULLIF(v_policy.rules_json->>'decision_valid_days', '')::integer, 30);

  SELECT * INTO v_score_row
  FROM public.driver_scores
  WHERE driver_id = v_app.driver_id
    AND (customer_id = v_app.customer_id OR customer_id IS NULL)
  ORDER BY (customer_id = v_app.customer_id) DESC NULLS LAST, updated_at DESC
  LIMIT 1;

  SELECT * INTO v_credit_score
  FROM public.credit_scores
  WHERE driver_id = v_app.driver_id
    AND (customer_id = v_app.customer_id OR customer_id IS NULL)
    AND status = 'active'
  ORDER BY calculation_week DESC, created_at DESC
  LIMIT 1;

  IF v_score_row.current_score IS NULL THEN
    v_reason_codes := array_append(v_reason_codes, 'SCORE_UNAVAILABLE');
  END IF;
  IF v_credit_score.tier IS NULL THEN
    v_reason_codes := array_append(v_reason_codes, 'SCORE_GRADE_UNAVAILABLE');
  END IF;
  v_trust := public.underwriting_trust_assessment(v_credit_score.tier);

  v_financial := public.underwriting_financial_assessment(v_app.application_id);

  v_risk := public.driver_risk(v_app.driver_id);
  v_risk_level := COALESCE(v_risk->>'level', 'UNKNOWN');
  v_risk_assessment := public.underwriting_risk_assessment(v_risk_level);

  IF v_app.requested_asset_id IS NOT NULL THEN
    SELECT COALESCE(fa.purchase_price, 0), COALESCE(fa.purchase_price_currency_code, v_app.down_payment_currency_code, 'XOF')
      INTO v_requested_amount, v_currency
    FROM public.financed_assets fa
    WHERE fa.asset_id = v_app.requested_asset_id;
  ELSE
    v_requested_amount := COALESCE(NULLIF(v_snapshot.snapshot_json #>> '{financial_snapshot,asset_price}', '')::integer, 0);
    v_currency := COALESCE(v_snapshot.snapshot_json #>> '{financial_snapshot,currency_code}', v_app.down_payment_currency_code, 'XOF');
  END IF;

  SELECT * INTO v_exposure
  FROM public.credit_exposure_profiles
  WHERE driver_id = v_app.driver_id
    AND customer_id = v_app.customer_id
    AND currency_code = v_currency
  LIMIT 1;
  IF NOT FOUND THEN
    v_exposure := public.credit_recompute_exposure(v_app.driver_id, v_app.customer_id, v_currency);
  END IF;

  IF COALESCE(v_exposure.maximum_exposure_limit, 0) <= 0 THEN
    v_exposure_assessment := 'MANUAL_REVIEW';
    v_reason_codes := array_append(v_reason_codes, 'EXPOSURE_LIMIT_UNCONFIGURED');
  ELSIF v_requested_amount > COALESCE(v_exposure.available_exposure, 0) THEN
    v_exposure_assessment := 'EXCEEDS_LIMIT';
    v_reason_codes := array_append(v_reason_codes, 'EXPOSURE_EXCEEDS_LIMIT');
  ELSE
    v_exposure_assessment := 'WITHIN_LIMIT';
  END IF;

  v_extension := public.underwriting_apply_product_extensions(v_app.application_id, v_policy.policy_id);
  v_conditions := COALESCE(v_extension->'conditions', '[]'::jsonb);
  IF jsonb_array_length(COALESCE(v_extension->'review_flags', '[]'::jsonb)) > 0 THEN
    v_reason_codes := array_append(v_reason_codes, 'PRODUCT_EXTENSION_REVIEW');
  END IF;

  IF v_product.status <> 'ACTIVE' THEN
    v_outcome := 'DECLINED';
    v_reason_codes := array_append(v_reason_codes, 'PRODUCT_NOT_ACTIVE');
  ELSIF v_app.eligibility_result = 'NOT_ELIGIBLE' THEN
    v_outcome := 'DECLINED';
    v_reason_codes := array_append(v_reason_codes, 'APPLICATION_NOT_ELIGIBLE');
  ELSIF v_risk_assessment = 'CRITICAL' THEN
    v_outcome := 'ESCALATED';
    v_reason_codes := array_append(v_reason_codes, 'CRITICAL_RISK_ESCALATION');
  ELSIF v_exposure_assessment = 'EXCEEDS_LIMIT' THEN
    v_outcome := 'MANUAL_REVIEW';
  ELSIF array_position(v_reason_codes, 'SCORE_GRADE_UNAVAILABLE') IS NOT NULL THEN
    v_outcome := 'MANUAL_REVIEW';
  ELSE
    v_outcome := public.underwriting_matrix_outcome(v_policy.decision_matrix_json, v_trust, v_financial, v_risk_assessment, v_exposure_assessment);
  END IF;

  IF v_outcome = 'APPROVED' AND jsonb_array_length(v_conditions) > 0 THEN
    v_outcome := 'APPROVED_WITH_CONDITIONS';
    v_reason_codes := array_append(v_reason_codes, 'PRODUCT_CONDITIONS_REQUIRED');
  END IF;

  v_driver_explanation := CASE v_outcome
    WHEN 'APPROVED' THEN 'Votre demande est approuvée. Les étapes d’activation restent à compléter.'
    WHEN 'APPROVED_WITH_CONDITIONS' THEN 'Votre demande est pré-approuvée avec des actions à compléter avant activation.'
    WHEN 'DECLINED' THEN 'Votre demande n’est pas retenue pour le moment. Continuez à améliorer votre score KIRA et vos paiements.'
    WHEN 'ESCALATED' THEN 'Votre demande nécessite une revue renforcée par notre équipe.'
    ELSE 'Votre demande est en revue manuelle. Nous vous informerons des prochaines étapes.'
  END;
  v_admin_explanation := 'Layer 3B policy ' || v_policy.policy_name || ' v' || v_policy.version::text ||
    ' evaluated trust=' || v_trust || ', financial=' || v_financial || ', risk=' || v_risk_assessment ||
    ', exposure=' || v_exposure_assessment || '.';

  SELECT id INTO v_reviewer_id FROM public.admin_users WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO public.underwriting_decisions (
    customer_id, application_id, decision, trust_assessment, financial_assessment,
    risk_assessment, exposure_assessment, decision_score_value, decision_score_grade,
    decision_risk_level, decision_risk_snapshot_json, requested_exposure_amount,
    requested_exposure_currency_code, current_exposure_amount, current_exposure_currency_code,
    maximum_exposure_amount, maximum_exposure_currency_code, available_exposure_amount,
    available_exposure_currency_code, evaluated_policy_set_id, evaluated_policy_version,
    evaluated_policy_snapshot_json, extension_results_json, reason_codes_json,
    driver_explanation, admin_explanation, decision_valid_until, idempotency_key,
    reviewer_id, created_by, updated_by, status_changed_at
  )
  VALUES (
    v_app.customer_id, v_app.application_id, v_outcome, v_trust, v_financial,
    v_risk_assessment, v_exposure_assessment, v_score_row.current_score, v_credit_score.tier,
    v_risk_level, COALESCE(v_risk, '{}'::jsonb), v_requested_amount,
    v_currency, COALESCE(v_exposure.current_exposure, 0), COALESCE(v_exposure.currency_code, v_currency),
    COALESCE(v_exposure.maximum_exposure_limit, 0), COALESCE(v_exposure.currency_code, v_currency),
    COALESCE(v_exposure.available_exposure, 0), COALESCE(v_exposure.currency_code, v_currency),
    v_policy.policy_id, v_policy.version, v_policy_snapshot, COALESCE(v_extension, '{}'::jsonb),
    to_jsonb(v_reason_codes), v_driver_explanation, v_admin_explanation,
    CASE WHEN v_outcome = 'DECLINED' THEN NULL ELSE now() + make_interval(days => v_valid_days) END,
    p_idempotency_key, v_reviewer_id, auth.uid(), auth.uid(), now()
  )
  RETURNING * INTO v_decision;

  FOR v_condition IN SELECT value FROM jsonb_array_elements(v_conditions)
  LOOP
    INSERT INTO public.underwriting_conditions (
      customer_id, decision_id, condition_type, description, status,
      idempotency_key, created_by, updated_by
    )
    VALUES (
      v_app.customer_id, v_decision.decision_id,
      COALESCE(NULLIF(v_condition->>'condition_type', ''), 'UNDERWRITING_CONDITION'),
      COALESCE(NULLIF(v_condition->>'description', ''), 'Condition underwriting à compléter.'),
      'PENDING', p_idempotency_key || ':condition:' || COALESCE(v_condition->>'condition_type', gen_random_uuid()::text),
      auth.uid(), auth.uid()
    );
  END LOOP;

  v_app_status := public.underwriting_application_status(v_outcome);
  UPDATE public.credit_applications
  SET status = v_app_status,
      updated_by = auth.uid(),
      status_changed_at = now()
  WHERE application_id = v_app.application_id;

  UPDATE public.reunderwriting_triggers
  SET status = 'RESOLVED',
      resolution_decision_id = v_decision.decision_id,
      updated_by = auth.uid(),
      status_changed_at = now(),
      updated_at = now()
  WHERE application_id = v_app.application_id
    AND status IN ('PENDING','BLOCKING');

  IF v_outcome IN ('MANUAL_REVIEW','ESCALATED') THEN
    INSERT INTO public.review_assignments (
      customer_id, application_id, reviewer_id, status, due_by,
      idempotency_key, created_by, updated_by
    )
    VALUES (
      v_app.customer_id, v_app.application_id, v_reviewer_id,
      CASE WHEN v_outcome = 'ESCALATED' THEN 'IN_REVIEW' ELSE 'OPEN' END,
      LEAST(COALESCE(v_app.expires_at, now() + interval '7 days'), now() + interval '48 hours'),
      p_idempotency_key || ':review', auth.uid(), auth.uid()
    )
    ON CONFLICT (customer_id, idempotency_key) DO NOTHING;
  END IF;

  IF v_outcome IN ('DECLINED','ESCALATED') THEN
    UPDATE public.credit_asset_assignments
    SET assignment_status = CASE WHEN v_outcome = 'DECLINED' THEN 'RELEASED' ELSE assignment_status END,
        released_at = CASE WHEN v_outcome = 'DECLINED' THEN now() ELSE released_at END,
        release_reason = CASE WHEN v_outcome = 'DECLINED' THEN 'underwriting_declined' ELSE release_reason END
    WHERE application_id = v_app.application_id
      AND assignment_status = 'ACTIVE';
  END IF;

  PERFORM public.credit_log_event(
    v_app.customer_id,
    'underwriting_decision_created',
    'underwriting_decision',
    v_decision.decision_id,
    to_jsonb(v_app),
    to_jsonb(v_decision),
    jsonb_build_object('policy_id', v_policy.policy_id, 'policy_version', v_policy.version, 'application_status', v_app_status),
    p_idempotency_key
  );

  RETURN v_decision;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_underwriting_application(
  p_application_id uuid,
  p_decision text,
  p_driver_explanation text,
  p_admin_explanation text,
  p_conditions_json jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.underwriting_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.credit_applications%ROWTYPE;
  v_prior public.underwriting_decisions%ROWTYPE;
  v_decision public.underwriting_decisions%ROWTYPE;
  v_reviewer_id uuid;
  v_condition jsonb;
BEGIN
  IF NOT public.has_underwriting_permission('underwriting.approve') THEN
    RAISE EXCEPTION 'forbidden: underwriting.approve required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;
  IF p_decision NOT IN ('APPROVED','APPROVED_WITH_CONDITIONS','MANUAL_REVIEW','DECLINED','ESCALATED') THEN
    RAISE EXCEPTION 'invalid underwriting decision %', p_decision;
  END IF;

  SELECT * INTO v_decision
  FROM public.underwriting_decisions
  WHERE customer_id = public.current_customer_id()
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_decision;
  END IF;

  SELECT * INTO v_app
  FROM public.credit_applications
  WHERE application_id = p_application_id
    AND (public.is_platform_owner() OR customer_id = public.current_customer_id())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit application not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_prior FROM public.underwriting_latest_decision(v_app.application_id);
  IF v_prior.decision_id IS NULL THEN
    RAISE EXCEPTION 'system underwriting decision required before manual finalization';
  END IF;

  SELECT id INTO v_reviewer_id FROM public.admin_users WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO public.underwriting_decisions (
    customer_id, application_id, decision, trust_assessment, financial_assessment,
    risk_assessment, exposure_assessment, decision_score_value, decision_score_grade,
    decision_risk_level, decision_risk_snapshot_json, requested_exposure_amount,
    requested_exposure_currency_code, current_exposure_amount, current_exposure_currency_code,
    maximum_exposure_amount, maximum_exposure_currency_code, available_exposure_amount,
    available_exposure_currency_code, evaluated_policy_set_id, evaluated_policy_version,
    evaluated_policy_snapshot_json, extension_results_json, reason_codes_json,
    driver_explanation, admin_explanation, decision_valid_until, idempotency_key,
    reviewer_id, created_by, updated_by, status_changed_at
  )
  VALUES (
    v_app.customer_id, v_app.application_id, p_decision, v_prior.trust_assessment, v_prior.financial_assessment,
    v_prior.risk_assessment, v_prior.exposure_assessment, v_prior.decision_score_value, v_prior.decision_score_grade,
    v_prior.decision_risk_level, v_prior.decision_risk_snapshot_json, v_prior.requested_exposure_amount,
    v_prior.requested_exposure_currency_code, v_prior.current_exposure_amount, v_prior.current_exposure_currency_code,
    v_prior.maximum_exposure_amount, v_prior.maximum_exposure_currency_code, v_prior.available_exposure_amount,
    v_prior.available_exposure_currency_code, v_prior.evaluated_policy_set_id, v_prior.evaluated_policy_version,
    v_prior.evaluated_policy_snapshot_json, v_prior.extension_results_json,
    jsonb_build_array('MANUAL_REVIEW_FINALIZED'),
    p_driver_explanation, p_admin_explanation,
    CASE WHEN p_decision = 'DECLINED' THEN NULL ELSE now() + interval '30 days' END,
    p_idempotency_key, v_reviewer_id, auth.uid(), auth.uid(), now()
  )
  RETURNING * INTO v_decision;

  FOR v_condition IN SELECT value FROM jsonb_array_elements(COALESCE(p_conditions_json, '[]'::jsonb))
  LOOP
    INSERT INTO public.underwriting_conditions (
      customer_id, decision_id, condition_type, description, status,
      idempotency_key, created_by, updated_by
    )
    VALUES (
      v_app.customer_id, v_decision.decision_id,
      COALESCE(NULLIF(v_condition->>'condition_type', ''), 'UNDERWRITING_CONDITION'),
      COALESCE(NULLIF(v_condition->>'description', ''), 'Condition underwriting à compléter.'),
      'PENDING', p_idempotency_key || ':condition:' || COALESCE(v_condition->>'condition_type', gen_random_uuid()::text),
      auth.uid(), auth.uid()
    );
  END LOOP;

  UPDATE public.credit_applications
  SET status = public.underwriting_application_status(p_decision),
      updated_by = auth.uid(),
      status_changed_at = now()
  WHERE application_id = v_app.application_id;

  UPDATE public.reunderwriting_triggers
  SET status = 'RESOLVED',
      resolution_decision_id = v_decision.decision_id,
      updated_by = auth.uid(),
      status_changed_at = now(),
      updated_at = now()
  WHERE application_id = v_app.application_id
    AND status IN ('PENDING','BLOCKING');

  UPDATE public.review_assignments
  SET status = 'RESOLVED',
      updated_by = auth.uid(),
      status_changed_at = now()
  WHERE application_id = v_app.application_id
    AND status IN ('OPEN','IN_REVIEW');

  PERFORM public.credit_log_event(
    v_app.customer_id,
    'underwriting_manual_review_action',
    'underwriting_decision',
    v_decision.decision_id,
    to_jsonb(v_prior),
    to_jsonb(v_decision),
    jsonb_build_object('application_id', v_app.application_id),
    p_idempotency_key
  );

  RETURN v_decision;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_reunderwriting(
  p_application_id uuid,
  p_prior_decision_id uuid,
  p_trigger_type text,
  p_trigger_source text DEFAULT 'system',
  p_trigger_payload_json jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.reunderwriting_triggers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.credit_applications%ROWTYPE;
  v_trigger public.reunderwriting_triggers%ROWTYPE;
BEGIN
  IF NOT (public.has_underwriting_permission('underwriting.review') OR public.current_driver_id() IS NOT NULL) THEN
    RAISE EXCEPTION 'forbidden: underwriting.review required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;
  IF p_trigger_type NOT IN ('DECISION_EXPIRED','APPLICATION_CHANGED','SCORE_GRADE_CHANGED','RISK_STATUS_CHANGED','EXPOSURE_CHANGED','POLICY_CHANGED','KYC_OR_DOCUMENT_CHANGED') THEN
    RAISE EXCEPTION 'invalid re-underwriting trigger %', p_trigger_type;
  END IF;

  SELECT * INTO v_app
  FROM public.credit_applications
  WHERE application_id = p_application_id
    AND (
      public.is_platform_owner()
      OR customer_id = public.current_customer_id()
      OR driver_id = public.current_driver_id()
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit application not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_trigger
  FROM public.reunderwriting_triggers
  WHERE customer_id = v_app.customer_id
    AND application_id = v_app.application_id
    AND prior_decision_id IS NOT DISTINCT FROM p_prior_decision_id
    AND trigger_type = p_trigger_type
    AND status IN ('PENDING','BLOCKING')
  LIMIT 1;
  IF FOUND THEN
    RETURN v_trigger;
  END IF;

  INSERT INTO public.reunderwriting_triggers (
    customer_id, application_id, prior_decision_id, trigger_type, trigger_source,
    trigger_payload_json, required_snapshot_at, status, idempotency_key,
    created_by, updated_by, status_changed_at
  )
  VALUES (
    v_app.customer_id, v_app.application_id, p_prior_decision_id, p_trigger_type,
    COALESCE(NULLIF(p_trigger_source, ''), 'system'), COALESCE(p_trigger_payload_json, '{}'::jsonb),
    now(), 'BLOCKING', p_idempotency_key, auth.uid(), auth.uid(), now()
  )
  RETURNING * INTO v_trigger;

  UPDATE public.credit_applications
  SET status = 'UNDERWRITING_REVIEW',
      updated_by = auth.uid(),
      status_changed_at = now()
  WHERE application_id = v_app.application_id
    AND status IN ('UNDERWRITING_APPROVED','UNDERWRITING_CONDITIONAL','APPROVED');

  PERFORM public.credit_log_event(
    v_app.customer_id,
    'reunderwriting_triggered',
    'reunderwriting_trigger',
    v_trigger.trigger_id,
    to_jsonb(v_app),
    to_jsonb(v_trigger),
    jsonb_build_object('trigger_type', p_trigger_type, 'prior_decision_id', p_prior_decision_id),
    p_idempotency_key
  );

  RETURN v_trigger;
END;
$$;

CREATE OR REPLACE FUNCTION public.fulfill_underwriting_condition(
  p_condition_id uuid,
  p_status text DEFAULT 'FULFILLED',
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.underwriting_conditions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_condition public.underwriting_conditions%ROWTYPE;
  v_admin_id uuid;
BEGIN
  IF NOT public.has_underwriting_permission('underwriting.review') THEN
    RAISE EXCEPTION 'forbidden: underwriting.review required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('FULFILLED','WAIVED') THEN
    RAISE EXCEPTION 'invalid condition status %', p_status;
  END IF;

  SELECT id INTO v_admin_id FROM public.admin_users WHERE user_id = auth.uid() LIMIT 1;
  UPDATE public.underwriting_conditions
  SET status = p_status,
      fulfilled_at = now(),
      fulfilled_by = v_admin_id,
      idempotency_key = COALESCE(p_idempotency_key, idempotency_key),
      updated_by = auth.uid(),
      status_changed_at = now()
  WHERE condition_id = p_condition_id
    AND (public.is_platform_owner() OR customer_id = public.current_customer_id())
  RETURNING * INTO v_condition;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'underwriting condition not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.credit_log_event(
    v_condition.customer_id,
    'underwriting_condition_' || lower(p_status),
    'underwriting_condition',
    v_condition.condition_id,
    '{}'::jsonb,
    to_jsonb(v_condition),
    '{}'::jsonb,
    p_idempotency_key
  );

  RETURN v_condition;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_driver_underwriting_decisions()
RETURNS TABLE (
  decision_id uuid,
  application_id uuid,
  decision_label text,
  driver_explanation text,
  decision_valid_until timestamptz,
  decision_timestamp timestamptz,
  required_actions_json jsonb,
  pending_conditions integer,
  is_reunderwriting_required boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ud.decision_id,
    ud.application_id,
    CASE ud.decision
      WHEN 'APPROVED' THEN 'Approuve'
      WHEN 'APPROVED_WITH_CONDITIONS' THEN 'Approuve avec conditions'
      WHEN 'DECLINED' THEN 'Refuse'
      WHEN 'MANUAL_REVIEW' THEN 'En revue'
      WHEN 'ESCALATED' THEN 'Escalade'
      ELSE 'En revue'
    END AS decision_label,
    ud.driver_explanation,
    ud.decision_valid_until,
    ud.decision_timestamp,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'description', uc.description,
          'status_label', CASE uc.status
            WHEN 'PENDING' THEN 'Action requise'
            WHEN 'FULFILLED' THEN 'Complete'
            WHEN 'WAIVED' THEN 'Dispensee'
            ELSE 'Action requise'
          END,
          'is_pending', uc.status = 'PENDING'
        )
        ORDER BY uc.created_at
      ) FILTER (WHERE uc.condition_id IS NOT NULL),
      '[]'::jsonb
    ) AS required_actions_json,
    COUNT(uc.condition_id) FILTER (WHERE uc.status = 'PENDING')::integer AS pending_conditions,
    (
      ud.decision_valid_until IS NOT NULL
      AND ud.decision_valid_until <= now()
    ) OR EXISTS (
      SELECT 1 FROM public.reunderwriting_triggers rt
      WHERE rt.application_id = ud.application_id
        AND rt.prior_decision_id = ud.decision_id
        AND rt.status IN ('PENDING','BLOCKING')
    ) AS is_reunderwriting_required
  FROM public.underwriting_decisions ud
  JOIN public.credit_applications ca ON ca.application_id = ud.application_id
  LEFT JOIN public.underwriting_conditions uc ON uc.decision_id = ud.decision_id
  WHERE ca.driver_id = public.current_driver_id()
    AND ud.decision_timestamp = (
      SELECT MAX(ud2.decision_timestamp)
      FROM public.underwriting_decisions ud2
      WHERE ud2.application_id = ud.application_id
    )
  GROUP BY ud.decision_id, ud.application_id, ud.decision, ud.driver_explanation,
    ud.decision_valid_until, ud.decision_timestamp
  ORDER BY ud.decision_timestamp DESC
$$;

CREATE OR REPLACE FUNCTION public.review_credit_application(
  p_application_id uuid,
  p_decision text,
  p_decision_reason_code text,
  p_explanation text,
  p_conditions_json jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.credit_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.credit_applications%ROWTYPE;
  v_underwriting public.underwriting_decisions%ROWTYPE;
  v_decision public.credit_decisions%ROWTYPE;
BEGIN
  IF NOT public.has_underwriting_permission('underwriting.review') THEN
    RAISE EXCEPTION 'forbidden: underwriting.review required' USING ERRCODE = '42501';
  END IF;

  v_underwriting := public.evaluate_underwriting_decision(p_application_id, COALESCE(p_idempotency_key, gen_random_uuid()::text));

  SELECT * INTO v_app FROM public.credit_applications WHERE application_id = p_application_id;

  INSERT INTO public.credit_decisions (
    customer_id, application_id, decision, explanation, conditions_json,
    reviewer_id, decision_reason_code, idempotency_key
  )
  VALUES (
    v_app.customer_id, v_app.application_id,
    CASE WHEN v_underwriting.decision = 'ESCALATED' THEN 'MANUAL_REVIEW' ELSE v_underwriting.decision END,
    v_underwriting.driver_explanation,
    jsonb_build_object('layer3b_underwriting_decision_id', v_underwriting.decision_id),
    v_underwriting.reviewer_id,
    'LAYER3B_UNDERWRITING_OWNER',
    COALESCE(p_idempotency_key, gen_random_uuid()::text) || ':legacy-mirror'
  )
  ON CONFLICT (customer_id, idempotency_key) DO UPDATE
    SET explanation = EXCLUDED.explanation,
        updated_at = now()
  RETURNING * INTO v_decision;

  RETURN v_decision;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_credit_down_payment_invoice(
  p_application_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.invoice
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.credit_applications%ROWTYPE;
  v_underwriting public.underwriting_decisions%ROWTYPE;
  v_driver public.drivers%ROWTYPE;
  v_invoice public.invoice%ROWTYPE;
  v_settings public.customer_billing_settings%ROWTYPE;
  v_blocking_triggers integer := 0;
BEGIN
  IF NOT public.has_credit_permission('credit.activate') THEN
    RAISE EXCEPTION 'forbidden: credit.activate required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_invoice
  FROM public.invoice
  WHERE customer_id = public.current_customer_id()
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN RETURN v_invoice; END IF;

  SELECT * INTO v_app
  FROM public.credit_applications
  WHERE application_id = p_application_id
    AND customer_id = public.current_customer_id()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit application not found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_underwriting FROM public.underwriting_latest_decision(v_app.application_id);
  IF v_underwriting.decision_id IS NULL OR v_underwriting.decision NOT IN ('APPROVED','APPROVED_WITH_CONDITIONS') THEN
    RAISE EXCEPTION 'down payment invoice requires Layer 3B approved underwriting decision';
  END IF;
  SELECT COUNT(*)::integer INTO v_blocking_triggers
  FROM public.reunderwriting_triggers
  WHERE application_id = v_app.application_id
    AND status IN ('PENDING','BLOCKING');
  IF v_blocking_triggers > 0 THEN
    RAISE EXCEPTION 're-underwriting trigger must be resolved before down payment invoice';
  END IF;
  IF v_underwriting.decision_valid_until IS NOT NULL AND v_underwriting.decision_valid_until <= now() THEN
    PERFORM public.trigger_reunderwriting(v_app.application_id, v_underwriting.decision_id, 'DECISION_EXPIRED', 'create_credit_down_payment_invoice', '{}'::jsonb, p_idempotency_key || ':expired');
    RAISE EXCEPTION 'underwriting decision expired; re-underwriting required';
  END IF;
  IF v_app.down_payment_amount <= 0 THEN
    RAISE EXCEPTION 'application has no down-payment obligation';
  END IF;

  SELECT * INTO v_invoice
  FROM public.invoice
  WHERE source_application_id = v_app.application_id
    AND obligation_type = 'DOWN_PAYMENT'
  LIMIT 1;
  IF FOUND THEN RETURN v_invoice; END IF;

  SELECT * INTO v_driver FROM public.drivers WHERE id = v_app.driver_id;
  SELECT * INTO v_settings FROM public.customer_billing_settings WHERE customer_id = v_app.customer_id;

  INSERT INTO public.invoice (
    customer_id, driver_id, status, invoice_kind,
    driver_snapshot_name, driver_snapshot_phone,
    subtotal_ht, vat_amount, total_ttc,
    vat_rate_snapshot, vat_enabled_snapshot,
    legal_name_snapshot, legal_nif_snapshot, legal_rccm_snapshot,
    legal_address_snapshot, legal_footer_snapshot,
    notes, currency_code, source_product_id, source_application_id,
    obligation_type, idempotency_key
  )
  VALUES (
    v_app.customer_id, v_app.driver_id, 'issued', 'invoice',
    v_driver.full_name, v_driver.phone_number,
    v_app.down_payment_amount, 0, v_app.down_payment_amount,
    0, false,
    v_settings.legal_name, v_settings.legal_nif, v_settings.legal_rccm,
    v_settings.legal_address, v_settings.legal_footer,
    'Layer 3B approved one-time down-payment obligation. No recurring schedule generated.',
    v_app.down_payment_currency_code, v_app.product_id, v_app.application_id,
    'DOWN_PAYMENT', p_idempotency_key
  )
  RETURNING * INTO v_invoice;

  INSERT INTO public.invoice_line (
    invoice_id, customer_id, position, designation, quantity,
    unit_price, line_total_ht, vat_rate, line_vat, line_total_ttc,
    metadata
  )
  VALUES (
    v_invoice.id, v_app.customer_id, 1, 'Apport initial crédit - activation',
    1, v_app.down_payment_amount, v_app.down_payment_amount, 0, 0,
    v_app.down_payment_amount,
    jsonb_build_object('source', 'layer3b_underwriting', 'obligation_type', 'DOWN_PAYMENT', 'application_id', v_app.application_id, 'underwriting_decision_id', v_underwriting.decision_id)
  );

  INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
  VALUES (
    v_invoice.id, v_app.customer_id, 'credit_obligation', auth.uid(), 'admin',
    jsonb_build_object('application_id', v_app.application_id, 'underwriting_decision_id', v_underwriting.decision_id, 'obligation_type', 'DOWN_PAYMENT', 'idempotency_key', p_idempotency_key)
  );

  PERFORM public.credit_log_event(
    v_app.customer_id,
    'down_payment_invoice_created',
    'invoice',
    v_invoice.id,
    '{}'::jsonb,
    to_jsonb(v_invoice),
    jsonb_build_object('application_id', v_app.application_id, 'underwriting_decision_id', v_underwriting.decision_id),
    p_idempotency_key
  );

  RETURN v_invoice;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_activation_package(
  p_application_id uuid,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.activation_packages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.credit_applications%ROWTYPE;
  v_package public.activation_packages%ROWTYPE;
  v_underwriting public.underwriting_decisions%ROWTYPE;
  v_invoice public.invoice%ROWTYPE;
  v_fulfillment public.fulfillment_records%ROWTYPE;
  v_agreement public.credit_agreements%ROWTYPE;
  v_blockers text[] := ARRAY[]::text[];
  v_requires_physical_asset boolean := false;
  v_pending_conditions integer := 0;
  v_blocking_triggers integer := 0;
  v_status text := 'READY';
  v_validation text := 'PASSED';
BEGIN
  IF NOT public.has_credit_permission('credit.activate') THEN
    RAISE EXCEPTION 'forbidden: credit.activate required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_package
  FROM public.activation_packages
  WHERE customer_id = public.current_customer_id()
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN RETURN v_package; END IF;

  SELECT * INTO v_app
  FROM public.credit_applications
  WHERE application_id = p_application_id
    AND customer_id = public.current_customer_id()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit application not found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_underwriting FROM public.underwriting_latest_decision(v_app.application_id);
  SELECT COUNT(*)::integer INTO v_pending_conditions
  FROM public.underwriting_conditions
  WHERE decision_id = v_underwriting.decision_id
    AND status = 'PENDING';

  SELECT COUNT(*)::integer INTO v_blocking_triggers
  FROM public.reunderwriting_triggers
  WHERE application_id = v_app.application_id
    AND status IN ('PENDING','BLOCKING');

  SELECT * INTO v_invoice
  FROM public.invoice
  WHERE source_application_id = v_app.application_id
    AND obligation_type = 'DOWN_PAYMENT'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT * INTO v_fulfillment
  FROM public.fulfillment_records
  WHERE application_id = v_app.application_id
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT * INTO v_agreement
  FROM public.credit_agreements
  WHERE application_id = v_app.application_id
  LIMIT 1;

  SELECT COALESCE((asset_rules_json->>'requires_possession_confirmation')::boolean, false)
    INTO v_requires_physical_asset
  FROM public.credit_products
  WHERE product_id = v_app.product_id
    AND customer_id = v_app.customer_id;

  IF v_underwriting.decision_id IS NULL THEN
    v_blockers := array_append(v_blockers, 'layer3b_underwriting_decision_required');
  ELSIF v_underwriting.decision NOT IN ('APPROVED','APPROVED_WITH_CONDITIONS') THEN
    v_blockers := array_append(v_blockers, 'layer3b_approval_required');
  END IF;
  IF v_underwriting.decision_valid_until IS NOT NULL AND v_underwriting.decision_valid_until <= now() THEN
    PERFORM public.trigger_reunderwriting(v_app.application_id, v_underwriting.decision_id, 'DECISION_EXPIRED', 'create_activation_package', '{}'::jsonb, p_idempotency_key || ':expired');
    v_blockers := array_append(v_blockers, 'reunderwriting_required');
  END IF;
  IF v_blocking_triggers > 0 THEN
    v_blockers := array_append(v_blockers, 'reunderwriting_required');
  END IF;
  IF v_pending_conditions > 0 THEN
    v_blockers := array_append(v_blockers, 'underwriting_conditions_pending');
  END IF;
  IF v_agreement.agreement_id IS NULL OR v_agreement.signed_at IS NULL THEN
    v_blockers := array_append(v_blockers, 'signed_agreement_required');
  END IF;
  IF v_app.down_payment_amount > 0 AND (v_invoice.id IS NULL OR v_invoice.status <> 'paid') THEN
    v_blockers := array_append(v_blockers, 'down_payment_not_settled');
  END IF;
  IF v_requires_physical_asset AND v_app.requested_asset_id IS NULL THEN
    v_blockers := array_append(v_blockers, 'asset_assignment_required');
  END IF;
  IF v_requires_physical_asset OR v_app.requested_asset_id IS NOT NULL THEN
    IF v_fulfillment.status IN ('DAMAGED_BEFORE_POSSESSION','LOST_BEFORE_POSSESSION') THEN
      v_blockers := array_append(v_blockers, lower(v_fulfillment.status));
    END IF;
    IF v_fulfillment.status IS DISTINCT FROM 'POSSESSION_CONFIRMED' OR v_fulfillment.possession_confirmed_at IS NULL THEN
      v_blockers := array_append(v_blockers, 'possession_confirmation_required');
    END IF;
  END IF;

  IF array_length(v_blockers, 1) IS NOT NULL THEN
    v_status := 'BLOCKED';
    v_validation := 'FAILED';
  END IF;

  INSERT INTO public.activation_packages (
    customer_id, application_id, status, validation_status, validation_results_json,
    down_payment_invoice_id, idempotency_key, request_hash, created_by, updated_by, status_changed_at
  )
  VALUES (
    v_app.customer_id, v_app.application_id, v_status, v_validation,
    jsonb_build_object('blockers', to_jsonb(v_blockers), 'evaluated_at', now(), 'underwriting_decision_id', v_underwriting.decision_id),
    v_invoice.id, p_idempotency_key, COALESCE(p_request_hash, md5(p_application_id::text || p_idempotency_key)),
    auth.uid(), auth.uid(), now()
  )
  ON CONFLICT (application_id) DO UPDATE
    SET status = EXCLUDED.status,
        validation_status = EXCLUDED.validation_status,
        validation_results_json = EXCLUDED.validation_results_json,
        down_payment_invoice_id = EXCLUDED.down_payment_invoice_id,
        updated_by = auth.uid(),
        status_changed_at = now(),
        updated_at = now()
  RETURNING * INTO v_package;

  PERFORM public.credit_log_event(
    v_app.customer_id,
    'activation_package_evaluated',
    'activation_package',
    v_package.package_id,
    '{}'::jsonb,
    to_jsonb(v_package),
    jsonb_build_object('application_id', v_app.application_id, 'underwriting_decision_id', v_underwriting.decision_id),
    p_idempotency_key
  );

  RETURN v_package;
END;
$$;

-- Preserve the Layer 3A activation implementation behind a private core wrapper
-- when this migration is applied after Layer 3A. If the helper already exists,
-- leave the operational implementation in place.
CREATE OR REPLACE FUNCTION public.activate_credit_account_3a_core(
  p_application_id uuid,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.credit_applications%ROWTYPE;
  v_package public.activation_packages%ROWTYPE;
  v_account public.credit_accounts%ROWTYPE;
  v_asset public.financed_assets%ROWTYPE;
  v_requires_physical_asset boolean := false;
  v_principal integer := 0;
  v_currency text := 'XOF';
BEGIN
  IF NOT public.has_credit_permission('credit.activate') THEN
    RAISE EXCEPTION 'forbidden: credit.activate required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_account
  FROM public.credit_accounts
  WHERE customer_id = public.current_customer_id()
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN RETURN v_account; END IF;

  SELECT * INTO v_app
  FROM public.credit_applications
  WHERE application_id = p_application_id
    AND customer_id = public.current_customer_id()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit application not found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_package
  FROM public.activation_packages
  WHERE application_id = v_app.application_id
  FOR UPDATE;
  IF NOT FOUND OR v_package.status <> 'READY' THEN
    UPDATE public.activation_packages
    SET status = 'BLOCKED',
        validation_status = 'FAILED',
        validation_results_json = jsonb_build_object('blockers', jsonb_build_array('activation_package_not_ready'), 'evaluated_at', now()),
        updated_by = auth.uid(),
        status_changed_at = now()
    WHERE application_id = v_app.application_id;
    RAISE EXCEPTION 'activation package is not ready';
  END IF;

  SELECT COALESCE((asset_rules_json->>'requires_possession_confirmation')::boolean, false)
    INTO v_requires_physical_asset
  FROM public.credit_products
  WHERE product_id = v_app.product_id
    AND customer_id = v_app.customer_id;

  IF v_requires_physical_asset AND v_app.requested_asset_id IS NULL THEN
    UPDATE public.activation_packages
    SET status = 'BLOCKED',
        validation_status = 'FAILED',
        validation_results_json = jsonb_build_object('blockers', jsonb_build_array('asset_assignment_required'), 'evaluated_at', now()),
        updated_by = auth.uid(),
        status_changed_at = now()
    WHERE application_id = v_app.application_id;
    RAISE EXCEPTION 'asset assignment is required before activation';
  END IF;

  IF v_app.requested_asset_id IS NOT NULL THEN
    SELECT * INTO v_asset
    FROM public.financed_assets
    WHERE asset_id = v_app.requested_asset_id
    FOR UPDATE;
    v_principal := COALESCE(v_asset.purchase_price, 0);
    v_currency := COALESCE(v_asset.purchase_price_currency_code, v_app.down_payment_currency_code, 'XOF');
  ELSE
    v_principal := COALESCE((SELECT NULLIF(snapshot_json #>> '{financial_snapshot,asset_price}','')::integer FROM public.credit_snapshots WHERE application_id = v_app.application_id), 0);
    v_currency := v_app.down_payment_currency_code;
  END IF;

  INSERT INTO public.credit_accounts (
    customer_id, driver_id, product_id, product_version_id, asset_id,
    activation_package_id, principal_amount, principal_currency_code,
    status, idempotency_key, activated_at, status_changed_at
  )
  VALUES (
    v_app.customer_id, v_app.driver_id, v_app.product_id, v_app.product_version_id, v_app.requested_asset_id,
    v_package.package_id, v_principal, v_currency, 'ACTIVE', p_idempotency_key, now(), now()
  )
  RETURNING * INTO v_account;

  UPDATE public.invoice
  SET source_credit_account_id = v_account.credit_account_id
  WHERE source_application_id = v_app.application_id
    AND source_credit_account_id IS NULL;

  UPDATE public.activation_packages
  SET status = 'ACTIVATED',
      validation_status = 'PASSED',
      updated_by = auth.uid(),
      status_changed_at = now()
  WHERE package_id = v_package.package_id;

  IF v_app.requested_asset_id IS NOT NULL THEN
    UPDATE public.credit_asset_assignments
    SET credit_account_id = v_account.credit_account_id,
        updated_at = now()
    WHERE application_id = v_app.application_id
      AND assignment_status = 'ACTIVE';

    UPDATE public.financed_assets
    SET status = 'ACTIVE',
        fulfillment_status = 'POSSESSION_CONFIRMED',
        possession_status = 'CONFIRMED',
        updated_by = auth.uid()
    WHERE asset_id = v_app.requested_asset_id;
  END IF;

  PERFORM public.credit_recompute_exposure(v_app.driver_id, v_app.customer_id, v_currency);

  PERFORM public.credit_log_event(
    v_app.customer_id,
    'credit_account_activated',
    'credit_account',
    v_account.credit_account_id,
    to_jsonb(v_package),
    to_jsonb(v_account),
    jsonb_build_object('application_id', v_app.application_id, 'request_hash', COALESCE(p_request_hash, v_package.request_hash)),
    p_idempotency_key
  );

  RETURN v_account;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_credit_account(
  p_application_id uuid,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.credit_applications%ROWTYPE;
  v_underwriting public.underwriting_decisions%ROWTYPE;
  v_pending_conditions integer := 0;
  v_blocking_triggers integer := 0;
  v_account public.credit_accounts%ROWTYPE;
BEGIN
  IF NOT public.has_credit_permission('credit.activate') THEN
    RAISE EXCEPTION 'forbidden: credit.activate required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_app
  FROM public.credit_applications
  WHERE application_id = p_application_id
    AND (public.is_platform_owner() OR customer_id = public.current_customer_id())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit application not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_underwriting FROM public.underwriting_latest_decision(v_app.application_id);
  IF v_underwriting.decision_id IS NULL OR v_underwriting.decision NOT IN ('APPROVED','APPROVED_WITH_CONDITIONS') THEN
    RAISE EXCEPTION 'Layer 3B approved underwriting decision is required';
  END IF;
  IF v_underwriting.decision_valid_until IS NOT NULL AND v_underwriting.decision_valid_until <= now() THEN
    PERFORM public.trigger_reunderwriting(v_app.application_id, v_underwriting.decision_id, 'DECISION_EXPIRED', 'activate_credit_account', '{}'::jsonb, p_idempotency_key || ':expired');
    RAISE EXCEPTION 'underwriting decision expired; re-underwriting required';
  END IF;

  SELECT COUNT(*)::integer INTO v_pending_conditions
  FROM public.underwriting_conditions
  WHERE decision_id = v_underwriting.decision_id
    AND status = 'PENDING';
  IF v_pending_conditions > 0 THEN
    RAISE EXCEPTION 'underwriting conditions must be fulfilled before activation';
  END IF;

  SELECT COUNT(*)::integer INTO v_blocking_triggers
  FROM public.reunderwriting_triggers
  WHERE application_id = v_app.application_id
    AND status IN ('PENDING','BLOCKING');
  IF v_blocking_triggers > 0 THEN
    RAISE EXCEPTION 're-underwriting trigger must be resolved before activation';
  END IF;

  SELECT * INTO v_account
  FROM public.activate_credit_account_3a_core(v_app.application_id, p_idempotency_key, p_request_hash);
  RETURN v_account;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_underwriting_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_underwriting_decision(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_underwriting_application(uuid, text, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_reunderwriting(uuid, uuid, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_underwriting_condition(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_underwriting_decisions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.underwriting_latest_decision(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.activate_credit_account_3a_core(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.activate_credit_account_3a_core(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.activate_credit_account_3a_core(uuid, text, text) FROM authenticated;

INSERT INTO public.credit_policy_sets (
  policy_id, customer_id, product_id, policy_name, policy_type, status, version,
  rules_json, approval_authority_json, decision_matrix_json, policy_json, effective_from
)
VALUES
  (
    '35000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',
    'Layer 3B Vehicle Ownership Underwriting',
    'UNDERWRITING_POLICY',
    'ACTIVE',
    1,
    '{
      "decision_valid_days":30,
      "reunderwriting_triggers":["DECISION_EXPIRED","APPLICATION_CHANGED","SCORE_GRADE_CHANGED","RISK_STATUS_CHANGED","EXPOSURE_CHANGED","POLICY_CHANGED","KYC_OR_DOCUMENT_CHANGED"],
      "hard_gates":["CRITICAL_RISK_ESCALATION","PRODUCT_NOT_ACTIVE"],
      "driver_masking":"driver_explanation_only"
    }'::jsonb,
    '{
      "currency_code":"XOF",
      "dual_approval_threshold_amount":2000000,
      "routes":[
        {"max_amount":500000,"authority":"Manager"},
        {"min_amount":500001,"max_amount":2000000,"authority":"Regional Manager"},
        {"min_amount":2000001,"authority":"Executive","dual_approval":true}
      ]
    }'::jsonb,
    '[
      {"trust":["EXCEPTIONAL","HIGH"],"financial":["HIGH"],"risk":["LOW"],"exposure":["WITHIN_LIMIT"],"outcome":"APPROVED"},
      {"trust":["HIGH"],"financial":["MEDIUM"],"risk":["MEDIUM"],"exposure":["WITHIN_LIMIT"],"outcome":"APPROVED_WITH_CONDITIONS"},
      {"trust":["MEDIUM"],"financial":["HIGH","MEDIUM"],"risk":["LOW","MEDIUM"],"exposure":["WITHIN_LIMIT"],"outcome":"MANUAL_REVIEW"},
      {"trust":["LOW"],"financial":["ANY"],"risk":["HIGH","CRITICAL"],"exposure":["ANY"],"outcome":"DECLINED"},
      {"trust":["ANY"],"financial":["ANY"],"risk":["CRITICAL"],"exposure":["ANY"],"outcome":"ESCALATED"}
    ]'::jsonb,
    '{"evaluation_layer":"3B","default_matrix_seed":true,"product_extension":"vehicle_ownership"}'::jsonb,
    '2026-06-16T00:00:00Z'::timestamptz
  )
ON CONFLICT (policy_id) DO UPDATE
  SET status = EXCLUDED.status,
      version = EXCLUDED.version,
      rules_json = EXCLUDED.rules_json,
      approval_authority_json = EXCLUDED.approval_authority_json,
      decision_matrix_json = EXCLUDED.decision_matrix_json,
      policy_json = EXCLUDED.policy_json,
      updated_at = now();

INSERT INTO public.product_underwriting_extensions (
  extension_id, customer_id, product_id, product_version_id, policy_set_id,
  extension_key, extension_config_json, status
)
VALUES (
  '36000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000001',
  '35000000-0000-0000-0000-000000000001',
  'vehicle_ownership',
  '{"required_gates":["asset_type","vendor_confirmation","possession_confirmation"],"output_only":["gate_results","conditions","review_flags","reason_codes"]}'::jsonb,
  'ACTIVE'
)
ON CONFLICT (extension_id) DO UPDATE
  SET extension_config_json = EXCLUDED.extension_config_json,
      status = EXCLUDED.status,
      updated_at = now();
