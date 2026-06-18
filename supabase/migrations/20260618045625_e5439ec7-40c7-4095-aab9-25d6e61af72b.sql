-- ============================================================
-- Layer 3F - Default, Recovery & Ownership Protection Engine
-- Append-only foundation extending Layer 3E collections.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.credit_accounts') IS NULL THEN
    RAISE EXCEPTION 'Layer 3F requires Layer 3A credit_accounts';
  END IF;
  IF to_regclass('public.credit_collections_cases') IS NULL THEN
    RAISE EXCEPTION 'Layer 3F requires Layer 3E credit_collections_cases';
  END IF;
  IF to_regclass('public.financed_assets') IS NULL THEN
    RAISE EXCEPTION 'Layer 3F requires Layer 3A financed_assets';
  END IF;
END;
$$;

ALTER TABLE public.product_versions
  ADD COLUMN IF NOT EXISTS default_rules_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.has_default_permission(permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(auth.role(), '') = 'service_role'
    OR public.is_platform_owner()
    OR CASE permission
      WHEN 'default.view' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer','support','agent_support'])
      WHEN 'default.open_review' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer'])
      WHEN 'default.review' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer'])
      WHEN 'default.decide' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'default.formal_default' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'default.reverse' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'default.asset_protection' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer'])
      WHEN 'default.audit' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'default.admin' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      ELSE false
    END
$$;

CREATE TABLE IF NOT EXISTS public.credit_default_reviews (
  default_review_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  credit_account_id uuid NOT NULL REFERENCES public.credit_accounts(credit_account_id) ON DELETE RESTRICT,
  collections_case_id uuid NOT NULL REFERENCES public.credit_collections_cases(case_id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.credit_products(product_id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'DEFAULT_REVIEW' CHECK (status IN (
    'NOT_IN_DEFAULT','DEFAULT_REVIEW','EVIDENCE_GATHERING','RECOVERY_PLAN_PENDING',
    'RECOVERY_PLAN_ACTIVE','FORMAL_DEFAULT_PENDING_APPROVAL','FORMALLY_DEFAULTED',
    'ASSET_PROTECTION_REVIEW','RECOVERY_COMPLETED','DEFAULT_REVERSED','WRITTEN_OFF','CLOSED'
  )),
  trigger_reason text NOT NULL CHECK (length(trim(trigger_reason)) >= 5),
  days_past_due integer NOT NULL DEFAULT 0 CHECK (days_past_due >= 0),
  past_due_amount integer NOT NULL DEFAULT 0 CHECK (past_due_amount >= 0),
  currency_code text NOT NULL DEFAULT 'XOF',
  evidence_status text NOT NULL DEFAULT 'MISSING' CHECK (evidence_status IN ('MISSING','PARTIAL','COMPLETE','LOCKED')),
  assigned_reviewer uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  decision_due_at timestamptz,
  closed_at timestamptz,
  closure_reason text,
  created_by uuid,
  updated_by uuid,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL,
  request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_default_reviews_closed_reason CHECK (
    (status NOT IN ('RECOVERY_COMPLETED','DEFAULT_REVERSED','WRITTEN_OFF','CLOSED') AND closed_at IS NULL)
    OR (status IN ('RECOVERY_COMPLETED','DEFAULT_REVERSED','WRITTEN_OFF','CLOSED') AND closed_at IS NOT NULL AND closure_reason IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.credit_default_evidence (
  evidence_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  default_review_id uuid NOT NULL REFERENCES public.credit_default_reviews(default_review_id) ON DELETE RESTRICT,
  credit_account_id uuid NOT NULL REFERENCES public.credit_accounts(credit_account_id) ON DELETE RESTRICT,
  evidence_type text NOT NULL CHECK (evidence_type IN (
    'UNPAID_INVOICES','PAYMENT_HISTORY','PROMISE_TO_PAY_HISTORY','DRIVER_CONTACT_ATTEMPTS',
    'ASSET_POSSESSION_STATUS','ASSET_LOCATION_STATUS','RISK_FLAGS','INCIDENT_HISTORY',
    'CONTRACT_TERMS','SIGNED_AGREEMENT','NOTICES_SENT','ADMIN_NOTES','PHOTOS','FIELD_REPORT','OTHER'
  )),
  source_reference_type text,
  source_reference_id uuid,
  evidence_summary text NOT NULL CHECK (length(trim(evidence_summary)) >= 3),
  locked_at timestamptz,
  created_by uuid,
  idempotency_key text NOT NULL,
  request_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_default_decisions (
  default_decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  default_review_id uuid NOT NULL REFERENCES public.credit_default_reviews(default_review_id) ON DELETE RESTRICT,
  credit_account_id uuid NOT NULL REFERENCES public.credit_accounts(credit_account_id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN (
    'CONTINUE_COLLECTIONS','RECOVERY_PLAN','FORMAL_DEFAULT','ASSET_PROTECTION_REVIEW',
    'RESTRUCTURE_RECOMMENDED','WRITE_OFF_RECOMMENDED','DEFAULT_NOT_SUPPORTED','ESCALATE_TO_MANAGEMENT'
  )),
  decision_reason text NOT NULL CHECK (length(trim(decision_reason)) >= 5),
  decision_summary text,
  approved_by uuid,
  second_approver_id uuid,
  decision_timestamp timestamptz NOT NULL DEFAULT now(),
  driver_notice_required boolean NOT NULL DEFAULT true,
  driver_notice_sent_at timestamptz,
  idempotency_key text NOT NULL,
  request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_default_dual_approval_distinct CHECK (second_approver_id IS NULL OR second_approver_id IS DISTINCT FROM approved_by)
);

CREATE TABLE IF NOT EXISTS public.credit_recovery_plans (
  recovery_plan_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  default_review_id uuid NOT NULL REFERENCES public.credit_default_reviews(default_review_id) ON DELETE RESTRICT,
  credit_account_id uuid NOT NULL REFERENCES public.credit_accounts(credit_account_id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  plan_status text NOT NULL DEFAULT 'ACTIVE' CHECK (plan_status IN ('PENDING_APPROVAL','ACTIVE','FULFILLED','BROKEN','CANCELLED','SUPERSEDED')),
  required_action_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  due_date date NOT NULL,
  created_by uuid,
  approved_by uuid,
  idempotency_key text NOT NULL,
  request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_asset_protection_reviews (
  asset_review_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  default_review_id uuid NOT NULL REFERENCES public.credit_default_reviews(default_review_id) ON DELETE RESTRICT,
  credit_account_id uuid NOT NULL REFERENCES public.credit_accounts(credit_account_id) ON DELETE RESTRICT,
  asset_id uuid REFERENCES public.financed_assets(asset_id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','INSPECTION_REQUESTED','CONTACT_ATTEMPTED','REVIEWED','RECOMMENDATION_MADE','CLOSED','CANCELLED')),
  trigger_reason text NOT NULL CHECK (length(trim(trigger_reason)) >= 5),
  inspection_required boolean NOT NULL DEFAULT false,
  inspection_due_at timestamptz,
  created_by uuid,
  idempotency_key text NOT NULL,
  request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_default_notices (
  notice_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  default_review_id uuid NOT NULL REFERENCES public.credit_default_reviews(default_review_id) ON DELETE RESTRICT,
  credit_account_id uuid NOT NULL REFERENCES public.credit_accounts(credit_account_id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  notice_type text NOT NULL CHECK (notice_type IN (
    'DEFAULT_REVIEW_OPENED','RECOVERY_PLAN_OFFERED','PAYMENT_REQUIRED',
    'ASSET_INSPECTION_REQUESTED','FORMAL_DEFAULT_NOTICE','RECOVERY_COMPLETED','REVIEW_CLOSED'
  )),
  notice_status text NOT NULL DEFAULT 'PENDING' CHECK (notice_status IN ('PENDING','SENT','FAILED','CANCELLED')),
  notice_summary text NOT NULL CHECK (length(trim(notice_summary)) >= 5),
  reason text NOT NULL CHECK (length(trim(reason)) >= 5),
  amount_affected integer NOT NULL DEFAULT 0 CHECK (amount_affected >= 0),
  currency_code text NOT NULL DEFAULT 'XOF',
  required_action text NOT NULL CHECK (length(trim(required_action)) >= 3),
  deadline_at timestamptz,
  support_instruction text NOT NULL DEFAULT 'Contactez l''equipe DAM si vous avez besoin d''aide.',
  sent_at timestamptz,
  channel text NOT NULL DEFAULT 'IN_APP' CHECK (channel IN ('IN_APP','SMS','WHATSAPP','EMAIL','MANUAL_CALL_NOTE')),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_default_audit_events (
  audit_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  default_review_id uuid REFERENCES public.credit_default_reviews(default_review_id) ON DELETE SET NULL,
  credit_account_id uuid REFERENCES public.credit_accounts(credit_account_id) ON DELETE SET NULL,
  event_type text NOT NULL,
  before_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  actor_id uuid,
  idempotency_key text,
  request_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.credit_default_reviews TO authenticated;
GRANT SELECT ON public.credit_default_evidence TO authenticated;
GRANT SELECT ON public.credit_default_decisions TO authenticated;
GRANT SELECT ON public.credit_recovery_plans TO authenticated;
GRANT SELECT ON public.credit_asset_protection_reviews TO authenticated;
GRANT SELECT ON public.credit_default_notices TO authenticated;
GRANT SELECT ON public.credit_default_audit_events TO authenticated;
GRANT ALL ON public.credit_default_reviews TO service_role;
GRANT ALL ON public.credit_default_evidence TO service_role;
GRANT ALL ON public.credit_default_decisions TO service_role;
GRANT ALL ON public.credit_recovery_plans TO service_role;
GRANT ALL ON public.credit_asset_protection_reviews TO service_role;
GRANT ALL ON public.credit_default_notices TO service_role;
GRANT ALL ON public.credit_default_audit_events TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_default_reviews_idempotency
  ON public.credit_default_reviews(customer_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_default_one_active_review
  ON public.credit_default_reviews(credit_account_id)
  WHERE status NOT IN ('RECOVERY_COMPLETED','DEFAULT_REVERSED','WRITTEN_OFF','CLOSED');
CREATE INDEX IF NOT EXISTS idx_credit_default_reviews_queue
  ON public.credit_default_reviews(customer_id, status, evidence_status, decision_due_at, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_default_reviews_driver
  ON public.credit_default_reviews(driver_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_default_evidence_idempotency
  ON public.credit_default_evidence(customer_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_credit_default_evidence_review
  ON public.credit_default_evidence(default_review_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_default_decisions_idempotency
  ON public.credit_default_decisions(customer_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_credit_default_decisions_review
  ON public.credit_default_decisions(default_review_id, decision_timestamp DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_recovery_plans_idempotency
  ON public.credit_recovery_plans(customer_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_recovery_plan_active
  ON public.credit_recovery_plans(default_review_id)
  WHERE plan_status IN ('PENDING_APPROVAL','ACTIVE');
CREATE INDEX IF NOT EXISTS idx_credit_recovery_plans_due
  ON public.credit_recovery_plans(customer_id, plan_status, due_date);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_asset_protection_idempotency
  ON public.credit_asset_protection_reviews(customer_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_asset_protection_open
  ON public.credit_asset_protection_reviews(default_review_id)
  WHERE status NOT IN ('CLOSED','CANCELLED');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_default_notices_idempotency
  ON public.credit_default_notices(customer_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_credit_default_notices_review
  ON public.credit_default_notices(default_review_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_default_audit_idempotency
  ON public.credit_default_audit_events(customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_default_audit_review
  ON public.credit_default_audit_events(default_review_id, created_at DESC);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'credit_default_reviews',
    'credit_default_decisions',
    'credit_recovery_plans',
    'credit_asset_protection_reviews',
    'credit_default_notices'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['credit_default_audit_events']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_immutable ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_credit_immutable_change()', t, t);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_default_review_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'default reviews are auditable; close or reverse instead of deleting';
  END IF;

  IF OLD.credit_account_id IS DISTINCT FROM NEW.credit_account_id
    OR OLD.collections_case_id IS DISTINCT FROM NEW.collections_case_id
    OR OLD.driver_id IS DISTINCT FROM NEW.driver_id
    OR OLD.product_id IS DISTINCT FROM NEW.product_id
    OR OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    RAISE EXCEPTION 'default review identity is immutable';
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_changed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_default_review_guard ON public.credit_default_reviews;
CREATE TRIGGER trg_credit_default_review_guard
  BEFORE UPDATE OR DELETE ON public.credit_default_reviews
  FOR EACH ROW EXECUTE FUNCTION public.credit_default_review_guard();

CREATE OR REPLACE FUNCTION public.credit_default_evidence_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'default evidence is immutable; attach corrected evidence instead of deleting';
  END IF;

  IF OLD.default_review_id IS DISTINCT FROM NEW.default_review_id
    OR OLD.credit_account_id IS DISTINCT FROM NEW.credit_account_id
    OR OLD.customer_id IS DISTINCT FROM NEW.customer_id
    OR OLD.evidence_type IS DISTINCT FROM NEW.evidence_type
    OR OLD.source_reference_type IS DISTINCT FROM NEW.source_reference_type
    OR OLD.source_reference_id IS DISTINCT FROM NEW.source_reference_id THEN
    RAISE EXCEPTION 'default evidence identity is immutable';
  END IF;

  IF OLD.locked_at IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM public.credit_default_decisions d
      WHERE d.default_review_id = OLD.default_review_id
    ) THEN
    IF OLD.evidence_summary IS DISTINCT FROM NEW.evidence_summary
      OR OLD.locked_at IS NOT NULL
      OR NEW.locked_at IS NULL THEN
      RAISE EXCEPTION 'default evidence is locked after decision';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_default_evidence_guard ON public.credit_default_evidence;
CREATE TRIGGER trg_credit_default_evidence_guard
  BEFORE UPDATE OR DELETE ON public.credit_default_evidence
  FOR EACH ROW EXECUTE FUNCTION public.credit_default_evidence_guard();

CREATE OR REPLACE FUNCTION public.credit_default_decision_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'default decisions are immutable; create a reversal or follow-up decision instead';
  END IF;

  IF OLD.default_review_id IS DISTINCT FROM NEW.default_review_id
    OR OLD.credit_account_id IS DISTINCT FROM NEW.credit_account_id
    OR OLD.customer_id IS DISTINCT FROM NEW.customer_id
    OR OLD.decision IS DISTINCT FROM NEW.decision
    OR OLD.decision_reason IS DISTINCT FROM NEW.decision_reason
    OR OLD.decision_summary IS DISTINCT FROM NEW.decision_summary
    OR OLD.approved_by IS DISTINCT FROM NEW.approved_by
    OR OLD.second_approver_id IS DISTINCT FROM NEW.second_approver_id
    OR OLD.decision_timestamp IS DISTINCT FROM NEW.decision_timestamp
    OR OLD.driver_notice_required IS DISTINCT FROM NEW.driver_notice_required THEN
    RAISE EXCEPTION 'default decision content is immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_default_decision_guard ON public.credit_default_decisions;
CREATE TRIGGER trg_credit_default_decision_guard
  BEFORE UPDATE OR DELETE ON public.credit_default_decisions
  FOR EACH ROW EXECUTE FUNCTION public.credit_default_decision_guard();

CREATE OR REPLACE FUNCTION public.credit_default_child_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'default recovery/protection records are auditable; update status instead of deleting';
  END IF;

  IF OLD.default_review_id IS DISTINCT FROM NEW.default_review_id
    OR OLD.credit_account_id IS DISTINCT FROM NEW.credit_account_id
    OR OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    RAISE EXCEPTION 'default child record identity is immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_recovery_plan_guard ON public.credit_recovery_plans;
CREATE TRIGGER trg_credit_recovery_plan_guard
  BEFORE UPDATE OR DELETE ON public.credit_recovery_plans
  FOR EACH ROW EXECUTE FUNCTION public.credit_default_child_guard();

DROP TRIGGER IF EXISTS trg_credit_asset_protection_guard ON public.credit_asset_protection_reviews;
CREATE TRIGGER trg_credit_asset_protection_guard
  BEFORE UPDATE OR DELETE ON public.credit_asset_protection_reviews
  FOR EACH ROW EXECUTE FUNCTION public.credit_default_child_guard();

DROP TRIGGER IF EXISTS trg_credit_default_notice_guard ON public.credit_default_notices;
CREATE TRIGGER trg_credit_default_notice_guard
  BEFORE UPDATE OR DELETE ON public.credit_default_notices
  FOR EACH ROW EXECUTE FUNCTION public.credit_default_child_guard();

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'credit_default_reviews',
    'credit_default_evidence',
    'credit_default_decisions',
    'credit_recovery_plans',
    'credit_asset_protection_reviews',
    'credit_default_notices',
    'credit_default_audit_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "default platform owner all" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "default admins tenant read" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "default platform owner all" ON public.%I FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner())',
      t
    );
    EXECUTE format(
      'CREATE POLICY "default admins tenant read" ON public.%I FOR SELECT TO authenticated USING (public.has_default_permission(''default.view'') AND customer_id = public.current_customer_id())',
      t
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "drivers read own default notices" ON public.credit_default_notices;
CREATE POLICY "drivers read own default notices" ON public.credit_default_notices
  FOR SELECT TO authenticated
  USING (driver_id = public.current_driver_id());

CREATE OR REPLACE FUNCTION public.default_rules_for_account(p_credit_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rules jsonb;
BEGIN
  SELECT COALESCE(pv.default_rules_json, '{}'::jsonb)
    INTO v_rules
  FROM public.credit_accounts ca
  LEFT JOIN public.product_versions pv ON pv.version_id = ca.product_version_id
  WHERE ca.credit_account_id = p_credit_account_id;

  RETURN COALESCE(v_rules, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.default_status_label(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_status
    WHEN 'NOT_IN_DEFAULT' THEN 'Aucun defaut'
    WHEN 'DEFAULT_REVIEW' THEN 'Dossier en revision'
    WHEN 'EVIDENCE_GATHERING' THEN 'Verification en cours'
    WHEN 'RECOVERY_PLAN_PENDING' THEN 'Plan de regularisation propose'
    WHEN 'RECOVERY_PLAN_ACTIVE' THEN 'Plan de regularisation'
    WHEN 'FORMAL_DEFAULT_PENDING_APPROVAL' THEN 'Decision en validation'
    WHEN 'FORMALLY_DEFAULTED' THEN 'Defaut formel confirme'
    WHEN 'ASSET_PROTECTION_REVIEW' THEN 'Verification du bien finance'
    WHEN 'RECOVERY_COMPLETED' THEN 'Regularisation terminee'
    WHEN 'DEFAULT_REVERSED' THEN 'Decision annulee'
    WHEN 'WRITTEN_OFF' THEN 'Dossier cloture par la direction'
    WHEN 'CLOSED' THEN 'Dossier ferme'
    ELSE 'Dossier en cours'
  END
$$;

CREATE OR REPLACE FUNCTION public.default_notice_type_label(p_notice_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_notice_type
    WHEN 'DEFAULT_REVIEW_OPENED' THEN 'Dossier en revision'
    WHEN 'RECOVERY_PLAN_OFFERED' THEN 'Plan de regularisation propose'
    WHEN 'PAYMENT_REQUIRED' THEN 'Paiement requis'
    WHEN 'ASSET_INSPECTION_REQUESTED' THEN 'Verification du bien demandee'
    WHEN 'FORMAL_DEFAULT_NOTICE' THEN 'Avis de defaut formel'
    WHEN 'RECOVERY_COMPLETED' THEN 'Regularisation terminee'
    WHEN 'REVIEW_CLOSED' THEN 'Dossier ferme'
    ELSE 'Information credit'
  END
$$;

CREATE OR REPLACE FUNCTION public.default_audit(
  p_customer_id uuid,
  p_default_review_id uuid,
  p_credit_account_id uuid,
  p_event_type text,
  p_before jsonb DEFAULT '{}'::jsonb,
  p_after jsonb DEFAULT '{}'::jsonb,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.credit_default_audit_events (
    customer_id, default_review_id, credit_account_id, event_type,
    before_json, after_json, reason, actor_id, idempotency_key, request_hash
  )
  VALUES (
    p_customer_id, p_default_review_id, p_credit_account_id, p_event_type,
    COALESCE(p_before, '{}'::jsonb), COALESCE(p_after, '{}'::jsonb),
    p_reason, auth.uid(), p_idempotency_key, p_request_hash
  )
  ON CONFLICT DO NOTHING
  RETURNING audit_event_id INTO v_id;

  IF v_id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT audit_event_id INTO v_id
    FROM public.credit_default_audit_events
    WHERE customer_id = p_customer_id
      AND idempotency_key = p_idempotency_key
    LIMIT 1;
  END IF;

  PERFORM public.credit_log_event(
    p_customer_id,
    lower(p_event_type),
    'credit_default',
    COALESCE(p_default_review_id, p_credit_account_id),
    COALESCE(p_before, '{}'::jsonb),
    COALESCE(p_after, '{}'::jsonb),
    jsonb_build_object('default_review_id', p_default_review_id, 'credit_account_id', p_credit_account_id, 'reason', p_reason),
    p_idempotency_key
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_credit_default_review(
  p_default_review_id uuid,
  p_assigned_to uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_default_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.credit_default_reviews%ROWTYPE;
  v_before jsonb;
  v_existing_audit uuid;
  v_assigned_to uuid;
BEGIN
  IF NOT public.has_default_permission('default.review') THEN
    RAISE EXCEPTION 'forbidden: default.review required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT r.* INTO v_review
  FROM public.credit_default_reviews r
  WHERE r.default_review_id = p_default_review_id
    AND r.status NOT IN ('RECOVERY_COMPLETED','DEFAULT_REVERSED','WRITTEN_OFF','CLOSED')
    AND (public.is_platform_owner() OR r.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'open default review not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT audit_event_id INTO v_existing_audit
  FROM public.credit_default_audit_events
  WHERE customer_id = v_review.customer_id
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_review;
  END IF;

  v_assigned_to := COALESCE(p_assigned_to, auth.uid(), v_review.assigned_reviewer);
  IF v_assigned_to IS NULL THEN
    RAISE EXCEPTION 'assigned reviewer is required';
  END IF;

  v_before := to_jsonb(v_review);
  UPDATE public.credit_default_reviews
  SET assigned_reviewer = v_assigned_to,
      updated_by = auth.uid()
  WHERE default_review_id = v_review.default_review_id
  RETURNING * INTO v_review;

  PERFORM public.default_audit(
    v_review.customer_id, v_review.default_review_id, v_review.credit_account_id,
    'DEFAULT_REVIEW_ASSIGNED', v_before, to_jsonb(v_review),
    COALESCE(NULLIF(trim(p_note), ''), 'Default review assigned'),
    p_idempotency_key, p_request_hash
  );

  RETURN v_review;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_credit_default_review(
  p_credit_account_id uuid,
  p_collections_case_id uuid DEFAULT NULL,
  p_trigger_reason text DEFAULT NULL,
  p_decision_due_at timestamptz DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_default_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.credit_accounts%ROWTYPE;
  v_case public.credit_collections_cases%ROWTYPE;
  v_review public.credit_default_reviews%ROWTYPE;
  v_existing public.credit_default_reviews%ROWTYPE;
  v_before_case jsonb;
BEGIN
  IF NOT public.has_default_permission('default.open_review') THEN
    RAISE EXCEPTION 'forbidden: default.open_review required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;
  IF p_trigger_reason IS NULL OR length(trim(p_trigger_reason)) < 5 THEN
    RAISE EXCEPTION 'trigger reason is required';
  END IF;

  SELECT * INTO v_account
  FROM public.credit_accounts
  WHERE credit_account_id = p_credit_account_id
    AND (public.is_platform_owner() OR customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit account not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_existing
  FROM public.credit_default_reviews
  WHERE customer_id = v_account.customer_id
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_existing
  FROM public.credit_default_reviews
  WHERE credit_account_id = v_account.credit_account_id
    AND status NOT IN ('RECOVERY_COMPLETED','DEFAULT_REVERSED','WRITTEN_OFF','CLOSED')
  ORDER BY opened_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  IF p_collections_case_id IS NOT NULL THEN
    SELECT * INTO v_case
    FROM public.credit_collections_cases
    WHERE case_id = p_collections_case_id
      AND credit_account_id = v_account.credit_account_id
      AND customer_id = v_account.customer_id
      AND current_status NOT IN ('RESOLVED','CLOSED')
    FOR UPDATE;
  ELSE
    SELECT * INTO v_case
    FROM public.credit_collections_cases
    WHERE credit_account_id = v_account.credit_account_id
      AND customer_id = v_account.customer_id
      AND current_status NOT IN ('RESOLVED','CLOSED')
    ORDER BY
      CASE current_status WHEN 'DEFAULT_REVIEW' THEN 1 WHEN 'ESCALATED' THEN 2 ELSE 3 END,
      days_past_due DESC,
      opened_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'open collections case is required for default review' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.credit_default_reviews (
    customer_id, credit_account_id, collections_case_id, driver_id, product_id,
    status, trigger_reason, days_past_due, past_due_amount, currency_code,
    evidence_status, assigned_reviewer, decision_due_at, created_by, updated_by,
    idempotency_key, request_hash
  )
  VALUES (
    v_account.customer_id, v_account.credit_account_id, v_case.case_id, v_account.driver_id,
    v_account.product_id, 'DEFAULT_REVIEW', trim(p_trigger_reason), v_case.days_past_due,
    v_case.total_past_due_amount, COALESCE(v_case.currency_code, v_account.principal_currency_code, 'XOF'),
    'MISSING', auth.uid(), p_decision_due_at, auth.uid(), auth.uid(), p_idempotency_key, p_request_hash
  )
  RETURNING * INTO v_review;

  v_before_case := to_jsonb(v_case);
  UPDATE public.credit_collections_cases
  SET current_status = 'DEFAULT_REVIEW',
      delinquency_status = 'DEFAULT_REVIEW',
      severity = 'CRITICAL',
      risk_level = 'CRITICAL',
      escalation_level = GREATEST(escalation_level, 2),
      updated_by = auth.uid()
  WHERE case_id = v_case.case_id
  RETURNING * INTO v_case;

  PERFORM public.default_audit(
    v_review.customer_id, v_review.default_review_id, v_review.credit_account_id,
    'DEFAULT_REVIEW_OPENED', '{}'::jsonb, to_jsonb(v_review), p_trigger_reason,
    p_idempotency_key, p_request_hash
  );
  PERFORM public.collections_audit(
    v_case.customer_id, v_case.case_id, v_case.credit_account_id, v_case.obligation_id,
    'DEFAULT_REVIEW_OPENED', v_before_case, to_jsonb(v_case), p_trigger_reason,
    p_idempotency_key || ':collections', p_request_hash
  );

  RETURN v_review;
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_credit_default_evidence(
  p_default_review_id uuid,
  p_evidence_type text,
  p_evidence_summary text,
  p_source_reference_type text DEFAULT NULL,
  p_source_reference_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_default_evidence
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.credit_default_reviews%ROWTYPE;
  v_evidence public.credit_default_evidence%ROWTYPE;
  v_before jsonb;
BEGIN
  IF NOT public.has_default_permission('default.review') THEN
    RAISE EXCEPTION 'forbidden: default.review required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;
  IF p_evidence_summary IS NULL OR length(trim(p_evidence_summary)) < 3 THEN
    RAISE EXCEPTION 'evidence summary is required';
  END IF;

  SELECT r.* INTO v_review
  FROM public.credit_default_reviews r
  WHERE r.default_review_id = p_default_review_id
    AND r.status NOT IN ('RECOVERY_COMPLETED','DEFAULT_REVERSED','WRITTEN_OFF','CLOSED')
    AND (public.is_platform_owner() OR r.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'open default review not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_evidence
  FROM public.credit_default_evidence
  WHERE customer_id = v_review.customer_id
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_evidence;
  END IF;

  IF EXISTS (SELECT 1 FROM public.credit_default_decisions WHERE default_review_id = v_review.default_review_id) THEN
    RAISE EXCEPTION 'evidence is locked after a default decision';
  END IF;

  INSERT INTO public.credit_default_evidence (
    customer_id, default_review_id, credit_account_id, evidence_type,
    source_reference_type, source_reference_id, evidence_summary, created_by,
    idempotency_key, request_hash
  )
  VALUES (
    v_review.customer_id, v_review.default_review_id, v_review.credit_account_id,
    p_evidence_type, p_source_reference_type, p_source_reference_id,
    trim(p_evidence_summary), auth.uid(), p_idempotency_key, p_request_hash
  )
  RETURNING * INTO v_evidence;

  v_before := to_jsonb(v_review);
  UPDATE public.credit_default_reviews
  SET evidence_status = 'PARTIAL',
      status = CASE WHEN status = 'DEFAULT_REVIEW' THEN 'EVIDENCE_GATHERING' ELSE status END,
      updated_by = auth.uid()
  WHERE default_review_id = v_review.default_review_id
  RETURNING * INTO v_review;

  PERFORM public.default_audit(
    v_review.customer_id, v_review.default_review_id, v_review.credit_account_id,
    'EVIDENCE_ATTACHED', v_before, to_jsonb(v_evidence), p_evidence_summary,
    p_idempotency_key, p_request_hash
  );

  RETURN v_evidence;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_credit_default_decision(
  p_default_review_id uuid,
  p_decision text,
  p_decision_reason text,
  p_decision_summary text DEFAULT NULL,
  p_second_approver_id uuid DEFAULT NULL,
  p_driver_notice_required boolean DEFAULT true,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_default_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.credit_default_reviews%ROWTYPE;
  v_decision public.credit_default_decisions%ROWTYPE;
  v_before jsonb;
  v_rules jsonb;
  v_require_dual boolean;
  v_next_status text;
  v_evidence_count integer;
BEGIN
  IF NOT public.has_default_permission(CASE WHEN p_decision = 'FORMAL_DEFAULT' THEN 'default.formal_default' ELSE 'default.decide' END) THEN
    RAISE EXCEPTION 'forbidden: default decision permission required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;
  IF p_decision_reason IS NULL OR length(trim(p_decision_reason)) < 5 THEN
    RAISE EXCEPTION 'decision reason is required';
  END IF;

  SELECT r.* INTO v_review
  FROM public.credit_default_reviews r
  WHERE r.default_review_id = p_default_review_id
    AND r.status NOT IN ('RECOVERY_COMPLETED','DEFAULT_REVERSED','WRITTEN_OFF','CLOSED')
    AND (public.is_platform_owner() OR r.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'open default review not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_decision
  FROM public.credit_default_decisions
  WHERE customer_id = v_review.customer_id
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_decision;
  END IF;

  SELECT COUNT(*) INTO v_evidence_count
  FROM public.credit_default_evidence
  WHERE default_review_id = v_review.default_review_id;

  IF p_decision IN ('FORMAL_DEFAULT','WRITE_OFF_RECOMMENDED') AND v_evidence_count = 0 THEN
    RAISE EXCEPTION 'evidence is required before formal default or write-off recommendation';
  END IF;

  v_rules := public.default_rules_for_account(v_review.credit_account_id);
  v_require_dual := COALESCE(NULLIF(v_rules->>'require_dual_approval_for_formal_default', '')::boolean, false);
  IF p_decision = 'FORMAL_DEFAULT' THEN
    IF NOT COALESCE(NULLIF(v_rules->>'allow_formal_default', '')::boolean, true) THEN
      RAISE EXCEPTION 'formal default is not enabled for this product version';
    END IF;
    IF v_require_dual AND p_second_approver_id IS NULL THEN
      RAISE EXCEPTION 'second approver is required by default policy';
    END IF;
    IF p_second_approver_id IS NOT NULL AND p_second_approver_id = auth.uid() THEN
      RAISE EXCEPTION 'second approver must be different from approver';
    END IF;
  END IF;

  INSERT INTO public.credit_default_decisions (
    customer_id, default_review_id, credit_account_id, decision,
    decision_reason, decision_summary, approved_by, second_approver_id,
    driver_notice_required, idempotency_key, request_hash
  )
  VALUES (
    v_review.customer_id, v_review.default_review_id, v_review.credit_account_id,
    p_decision, trim(p_decision_reason), p_decision_summary, auth.uid(),
    p_second_approver_id, COALESCE(p_driver_notice_required, true),
    p_idempotency_key, p_request_hash
  )
  RETURNING * INTO v_decision;

  UPDATE public.credit_default_evidence
  SET locked_at = COALESCE(locked_at, now())
  WHERE default_review_id = v_review.default_review_id;

  v_next_status := CASE p_decision
    WHEN 'CONTINUE_COLLECTIONS' THEN 'DEFAULT_REVIEW'
    WHEN 'RECOVERY_PLAN' THEN 'RECOVERY_PLAN_PENDING'
    WHEN 'FORMAL_DEFAULT' THEN 'FORMAL_DEFAULT_PENDING_APPROVAL'
    WHEN 'ASSET_PROTECTION_REVIEW' THEN 'ASSET_PROTECTION_REVIEW'
    WHEN 'RESTRUCTURE_RECOMMENDED' THEN 'RECOVERY_PLAN_PENDING'
    WHEN 'WRITE_OFF_RECOMMENDED' THEN 'FORMAL_DEFAULT_PENDING_APPROVAL'
    WHEN 'DEFAULT_NOT_SUPPORTED' THEN 'CLOSED'
    WHEN 'ESCALATE_TO_MANAGEMENT' THEN 'FORMAL_DEFAULT_PENDING_APPROVAL'
    ELSE v_review.status
  END;

  v_before := to_jsonb(v_review);
  UPDATE public.credit_default_reviews
  SET status = v_next_status,
      evidence_status = CASE WHEN v_evidence_count > 0 THEN 'LOCKED' ELSE evidence_status END,
      closed_at = CASE WHEN v_next_status = 'CLOSED' THEN now() ELSE closed_at END,
      closure_reason = CASE WHEN v_next_status = 'CLOSED' THEN trim(p_decision_reason) ELSE closure_reason END,
      updated_by = auth.uid()
  WHERE default_review_id = v_review.default_review_id
  RETURNING * INTO v_review;

  PERFORM public.default_audit(
    v_review.customer_id, v_review.default_review_id, v_review.credit_account_id,
    CASE WHEN p_decision = 'WRITE_OFF_RECOMMENDED' THEN 'WRITE_OFF_RECOMMENDED' ELSE 'DEFAULT_DECISION_CREATED' END,
    v_before, to_jsonb(v_decision), p_decision_reason, p_idempotency_key, p_request_hash
  );

  RETURN v_decision;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_credit_recovery_plan(
  p_default_review_id uuid,
  p_required_action_json jsonb,
  p_due_date date,
  p_approved_by uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_recovery_plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.credit_default_reviews%ROWTYPE;
  v_plan public.credit_recovery_plans%ROWTYPE;
  v_before jsonb;
BEGIN
  IF NOT public.has_default_permission('default.decide') THEN
    RAISE EXCEPTION 'forbidden: default.decide required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;
  IF p_due_date < current_date THEN
    RAISE EXCEPTION 'recovery plan due date cannot be in the past';
  END IF;
  IF COALESCE(p_required_action_json, '{}'::jsonb) = '{}'::jsonb THEN
    RAISE EXCEPTION 'required action json is required';
  END IF;

  SELECT r.* INTO v_review
  FROM public.credit_default_reviews r
  WHERE r.default_review_id = p_default_review_id
    AND r.status NOT IN ('RECOVERY_COMPLETED','DEFAULT_REVERSED','WRITTEN_OFF','CLOSED')
    AND (public.is_platform_owner() OR r.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'open default review not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_plan
  FROM public.credit_recovery_plans
  WHERE customer_id = v_review.customer_id
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_plan;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.credit_recovery_plans
    WHERE default_review_id = v_review.default_review_id
      AND plan_status IN ('PENDING_APPROVAL','ACTIVE')
  ) THEN
    RAISE EXCEPTION 'an active recovery plan already exists for this review';
  END IF;

  INSERT INTO public.credit_recovery_plans (
    customer_id, default_review_id, credit_account_id, driver_id,
    plan_status, required_action_json, due_date, created_by, approved_by,
    idempotency_key, request_hash
  )
  VALUES (
    v_review.customer_id, v_review.default_review_id, v_review.credit_account_id,
    v_review.driver_id, 'ACTIVE', p_required_action_json, p_due_date, auth.uid(),
    COALESCE(p_approved_by, auth.uid()), p_idempotency_key, p_request_hash
  )
  RETURNING * INTO v_plan;

  v_before := to_jsonb(v_review);
  UPDATE public.credit_default_reviews
  SET status = 'RECOVERY_PLAN_ACTIVE',
      updated_by = auth.uid()
  WHERE default_review_id = v_review.default_review_id
  RETURNING * INTO v_review;

  PERFORM public.default_audit(
    v_review.customer_id, v_review.default_review_id, v_review.credit_account_id,
    'RECOVERY_PLAN_CREATED', v_before, to_jsonb(v_plan), NULL,
    p_idempotency_key, p_request_hash
  );
  PERFORM public.credit_log_event(
    v_review.customer_id,
    'recovery_plan_active',
    'credit_default',
    v_review.default_review_id,
    v_before,
    to_jsonb(v_review),
    jsonb_build_object('recovery_plan_id', v_plan.recovery_plan_id),
    p_idempotency_key || ':risk'
  );

  RETURN v_plan;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_credit_asset_protection_review(
  p_default_review_id uuid,
  p_trigger_reason text,
  p_asset_id uuid DEFAULT NULL,
  p_inspection_required boolean DEFAULT false,
  p_inspection_due_at timestamptz DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_asset_protection_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.credit_default_reviews%ROWTYPE;
  v_account public.credit_accounts%ROWTYPE;
  v_asset_review public.credit_asset_protection_reviews%ROWTYPE;
  v_before jsonb;
BEGIN
  IF NOT public.has_default_permission('default.asset_protection') THEN
    RAISE EXCEPTION 'forbidden: default.asset_protection required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;
  IF p_trigger_reason IS NULL OR length(trim(p_trigger_reason)) < 5 THEN
    RAISE EXCEPTION 'trigger reason is required';
  END IF;

  SELECT r.* INTO v_review
  FROM public.credit_default_reviews r
  WHERE r.default_review_id = p_default_review_id
    AND r.status NOT IN ('RECOVERY_COMPLETED','DEFAULT_REVERSED','WRITTEN_OFF','CLOSED')
    AND (public.is_platform_owner() OR r.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'open default review not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_asset_review
  FROM public.credit_asset_protection_reviews
  WHERE customer_id = v_review.customer_id
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_asset_review;
  END IF;

  SELECT * INTO v_account
  FROM public.credit_accounts
  WHERE credit_account_id = v_review.credit_account_id;

  INSERT INTO public.credit_asset_protection_reviews (
    customer_id, default_review_id, credit_account_id, asset_id, status,
    trigger_reason, inspection_required, inspection_due_at, created_by,
    idempotency_key, request_hash
  )
  VALUES (
    v_review.customer_id, v_review.default_review_id, v_review.credit_account_id,
    COALESCE(p_asset_id, v_account.asset_id), 'OPEN', trim(p_trigger_reason),
    COALESCE(p_inspection_required, false), p_inspection_due_at, auth.uid(),
    p_idempotency_key, p_request_hash
  )
  RETURNING * INTO v_asset_review;

  v_before := to_jsonb(v_review);
  UPDATE public.credit_default_reviews
  SET status = 'ASSET_PROTECTION_REVIEW',
      updated_by = auth.uid()
  WHERE default_review_id = v_review.default_review_id
  RETURNING * INTO v_review;

  PERFORM public.default_audit(
    v_review.customer_id, v_review.default_review_id, v_review.credit_account_id,
    'ASSET_PROTECTION_REVIEW_OPENED', v_before, to_jsonb(v_asset_review), p_trigger_reason,
    p_idempotency_key, p_request_hash
  );

  RETURN v_asset_review;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_credit_default_notice(
  p_default_review_id uuid,
  p_notice_type text,
  p_notice_summary text,
  p_reason text,
  p_required_action text,
  p_deadline_at timestamptz DEFAULT NULL,
  p_channel text DEFAULT 'IN_APP',
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_default_notices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.credit_default_reviews%ROWTYPE;
  v_notice public.credit_default_notices%ROWTYPE;
  v_notification_id uuid;
  v_title text;
  v_message text;
BEGIN
  IF NOT public.has_default_permission('default.review') THEN
    RAISE EXCEPTION 'forbidden: default.review required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT r.* INTO v_review
  FROM public.credit_default_reviews r
  WHERE r.default_review_id = p_default_review_id
    AND (public.is_platform_owner() OR r.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'default review not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_notice
  FROM public.credit_default_notices
  WHERE customer_id = v_review.customer_id
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_notice;
  END IF;

  v_title := public.default_notice_type_label(p_notice_type);
  v_message := trim(p_notice_summary) || ' Action: ' || trim(p_required_action) || ' Support: Contactez l''equipe DAM.';

  IF COALESCE(p_channel, 'IN_APP') = 'IN_APP' THEN
    INSERT INTO public.notifications (
      driver_id, customer_id, notification_type, title, message, channel, template_id, variables
    )
    VALUES (
      v_review.driver_id, v_review.customer_id, 'loan_status', v_title, v_message,
      'in_app', 'credit_default_' || lower(p_notice_type),
      jsonb_build_object('default_review_id', v_review.default_review_id, 'credit_account_id', v_review.credit_account_id)
    )
    RETURNING id INTO v_notification_id;
  END IF;

  INSERT INTO public.credit_default_notices (
    customer_id, default_review_id, credit_account_id, driver_id,
    notice_type, notice_status, notice_summary, reason, amount_affected,
    currency_code, required_action, deadline_at, support_instruction,
    sent_at, channel, notification_id, idempotency_key, request_hash
  )
  VALUES (
    v_review.customer_id, v_review.default_review_id, v_review.credit_account_id,
    v_review.driver_id, p_notice_type,
    CASE WHEN COALESCE(p_channel, 'IN_APP') IN ('IN_APP','MANUAL_CALL_NOTE') THEN 'SENT' ELSE 'PENDING' END,
    trim(p_notice_summary), trim(p_reason), v_review.past_due_amount,
    v_review.currency_code, trim(p_required_action), p_deadline_at,
    'Contactez l''equipe DAM si vous avez besoin d''aide.',
    CASE WHEN COALESCE(p_channel, 'IN_APP') IN ('IN_APP','MANUAL_CALL_NOTE') THEN now() ELSE NULL END,
    COALESCE(p_channel, 'IN_APP'), v_notification_id, p_idempotency_key, p_request_hash
  )
  RETURNING * INTO v_notice;

  IF p_notice_type = 'FORMAL_DEFAULT_NOTICE' THEN
    UPDATE public.credit_default_decisions
    SET driver_notice_sent_at = COALESCE(driver_notice_sent_at, v_notice.sent_at)
    WHERE default_review_id = v_review.default_review_id
      AND decision = 'FORMAL_DEFAULT'
      AND driver_notice_sent_at IS NULL;
  END IF;

  PERFORM public.default_audit(
    v_review.customer_id, v_review.default_review_id, v_review.credit_account_id,
    'DRIVER_NOTICE_SENT', '{}'::jsonb, to_jsonb(v_notice), p_notice_summary,
    p_idempotency_key, p_request_hash
  );

  RETURN v_notice;
END;
$$;

CREATE OR REPLACE FUNCTION public.declare_credit_formal_default(
  p_default_review_id uuid,
  p_reason text,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_default_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.credit_default_reviews%ROWTYPE;
  v_decision public.credit_default_decisions%ROWTYPE;
  v_account public.credit_accounts%ROWTYPE;
  v_existing_audit uuid;
  v_before_review jsonb;
  v_before_account jsonb;
  v_rules jsonb;
  v_require_dual boolean;
BEGIN
  IF NOT public.has_default_permission('default.formal_default') THEN
    RAISE EXCEPTION 'forbidden: default.formal_default required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'formal default reason is required';
  END IF;

  SELECT r.* INTO v_review
  FROM public.credit_default_reviews r
  WHERE r.default_review_id = p_default_review_id
    AND (public.is_platform_owner() OR r.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'default review not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT audit_event_id INTO v_existing_audit
  FROM public.credit_default_audit_events
  WHERE customer_id = v_review.customer_id
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_review;
  END IF;

  IF v_review.status = 'FORMALLY_DEFAULTED' THEN
    RETURN v_review;
  END IF;
  IF v_review.status IN ('RECOVERY_COMPLETED','DEFAULT_REVERSED','WRITTEN_OFF','CLOSED') THEN
    RAISE EXCEPTION 'closed default review cannot be formally defaulted';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.credit_default_evidence WHERE default_review_id = v_review.default_review_id) THEN
    RAISE EXCEPTION 'evidence is required before formal default';
  END IF;

  SELECT * INTO v_decision
  FROM public.credit_default_decisions
  WHERE default_review_id = v_review.default_review_id
    AND decision = 'FORMAL_DEFAULT'
  ORDER BY decision_timestamp DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'formal default decision is required before declaration';
  END IF;

  v_rules := public.default_rules_for_account(v_review.credit_account_id);
  IF NOT COALESCE(NULLIF(v_rules->>'allow_formal_default', '')::boolean, true) THEN
    RAISE EXCEPTION 'formal default is not enabled for this product version';
  END IF;
  v_require_dual := COALESCE(NULLIF(v_rules->>'require_dual_approval_for_formal_default', '')::boolean, false);
  IF v_require_dual AND v_decision.second_approver_id IS NULL THEN
    RAISE EXCEPTION 'second approver is required by default policy';
  END IF;
  IF v_decision.driver_notice_required
    AND NOT EXISTS (
      SELECT 1
      FROM public.credit_default_notices n
      WHERE n.default_review_id = v_review.default_review_id
        AND n.notice_type = 'FORMAL_DEFAULT_NOTICE'
        AND n.notice_status = 'SENT'
    ) THEN
    RAISE EXCEPTION 'formal default notice must be sent before declaration';
  END IF;

  SELECT * INTO v_account
  FROM public.credit_accounts
  WHERE credit_account_id = v_review.credit_account_id
  FOR UPDATE;

  v_before_account := to_jsonb(v_account);
  UPDATE public.credit_accounts
  SET status = 'DEFAULTED',
      status_changed_at = now()
  WHERE credit_account_id = v_account.credit_account_id
  RETURNING * INTO v_account;

  v_before_review := to_jsonb(v_review);
  UPDATE public.credit_default_reviews
  SET status = 'FORMALLY_DEFAULTED',
      evidence_status = 'LOCKED',
      updated_by = auth.uid()
  WHERE default_review_id = v_review.default_review_id
  RETURNING * INTO v_review;

  UPDATE public.credit_default_evidence
  SET locked_at = COALESCE(locked_at, now())
  WHERE default_review_id = v_review.default_review_id;

  PERFORM public.default_audit(
    v_review.customer_id, v_review.default_review_id, v_review.credit_account_id,
    'FORMAL_DEFAULT_DECLARED',
    jsonb_build_object('review', v_before_review, 'account', v_before_account),
    jsonb_build_object('review', to_jsonb(v_review), 'account', to_jsonb(v_account)),
    p_reason, p_idempotency_key, p_request_hash
  );

  RETURN v_review;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_credit_formal_default(
  p_default_review_id uuid,
  p_reason text,
  p_new_account_status text DEFAULT 'PAST_DUE',
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_default_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.credit_default_reviews%ROWTYPE;
  v_account public.credit_accounts%ROWTYPE;
  v_existing_audit uuid;
  v_before_review jsonb;
  v_before_account jsonb;
BEGIN
  IF NOT public.has_default_permission('default.reverse') THEN
    RAISE EXCEPTION 'forbidden: default.reverse required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reversal reason is required';
  END IF;
  IF p_new_account_status NOT IN ('ACTIVE','PAST_DUE','SUSPENDED','COMPLETED','TERMINATED') THEN
    RAISE EXCEPTION 'invalid post-reversal account status';
  END IF;

  SELECT r.* INTO v_review
  FROM public.credit_default_reviews r
  WHERE r.default_review_id = p_default_review_id
    AND (public.is_platform_owner() OR r.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'default review not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT audit_event_id INTO v_existing_audit
  FROM public.credit_default_audit_events
  WHERE customer_id = v_review.customer_id
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_review;
  END IF;

  IF v_review.status = 'DEFAULT_REVERSED' THEN
    RETURN v_review;
  END IF;
  IF v_review.status <> 'FORMALLY_DEFAULTED' THEN
    RAISE EXCEPTION 'only a formally defaulted review can be reversed';
  END IF;

  SELECT * INTO v_account
  FROM public.credit_accounts
  WHERE credit_account_id = v_review.credit_account_id
  FOR UPDATE;

  v_before_account := to_jsonb(v_account);
  UPDATE public.credit_accounts
  SET status = p_new_account_status,
      status_changed_at = now()
  WHERE credit_account_id = v_account.credit_account_id
  RETURNING * INTO v_account;

  v_before_review := to_jsonb(v_review);
  UPDATE public.credit_default_reviews
  SET status = 'DEFAULT_REVERSED',
      closed_at = now(),
      closure_reason = trim(p_reason),
      updated_by = auth.uid()
  WHERE default_review_id = v_review.default_review_id
  RETURNING * INTO v_review;

  UPDATE public.credit_recovery_plans
  SET plan_status = 'CANCELLED'
  WHERE default_review_id = v_review.default_review_id
    AND plan_status IN ('PENDING_APPROVAL','ACTIVE');

  UPDATE public.credit_asset_protection_reviews
  SET status = 'CANCELLED'
  WHERE default_review_id = v_review.default_review_id
    AND status NOT IN ('CLOSED','CANCELLED');

  PERFORM public.default_audit(
    v_review.customer_id, v_review.default_review_id, v_review.credit_account_id,
    'DEFAULT_REVERSED',
    jsonb_build_object('review', v_before_review, 'account', v_before_account),
    jsonb_build_object('review', to_jsonb(v_review), 'account', to_jsonb(v_account)),
    p_reason, p_idempotency_key, p_request_hash
  );

  RETURN v_review;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_credit_default_review(
  p_default_review_id uuid,
  p_closure_reason text,
  p_final_status text DEFAULT 'CLOSED',
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_default_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.credit_default_reviews%ROWTYPE;
  v_before jsonb;
  v_existing_audit uuid;
BEGIN
  IF NOT public.has_default_permission('default.review') THEN
    RAISE EXCEPTION 'forbidden: default.review required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;
  IF p_closure_reason IS NULL OR length(trim(p_closure_reason)) < 5 THEN
    RAISE EXCEPTION 'closure reason is required';
  END IF;
  IF p_final_status NOT IN ('RECOVERY_COMPLETED','WRITTEN_OFF','CLOSED') THEN
    RAISE EXCEPTION 'invalid final status for close review';
  END IF;

  SELECT r.* INTO v_review
  FROM public.credit_default_reviews r
  WHERE r.default_review_id = p_default_review_id
    AND (public.is_platform_owner() OR r.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'default review not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT audit_event_id INTO v_existing_audit
  FROM public.credit_default_audit_events
  WHERE customer_id = v_review.customer_id
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_review;
  END IF;

  IF v_review.status IN ('RECOVERY_COMPLETED','DEFAULT_REVERSED','WRITTEN_OFF','CLOSED') THEN
    RETURN v_review;
  END IF;

  v_before := to_jsonb(v_review);
  UPDATE public.credit_default_reviews
  SET status = p_final_status,
      closed_at = now(),
      closure_reason = trim(p_closure_reason),
      updated_by = auth.uid()
  WHERE default_review_id = v_review.default_review_id
  RETURNING * INTO v_review;

  UPDATE public.credit_recovery_plans
  SET plan_status = CASE WHEN p_final_status = 'RECOVERY_COMPLETED' THEN 'FULFILLED' ELSE 'CANCELLED' END
  WHERE default_review_id = v_review.default_review_id
    AND plan_status IN ('PENDING_APPROVAL','ACTIVE');

  UPDATE public.credit_asset_protection_reviews
  SET status = 'CLOSED'
  WHERE default_review_id = v_review.default_review_id
    AND status NOT IN ('CLOSED','CANCELLED');

  PERFORM public.default_audit(
    v_review.customer_id, v_review.default_review_id, v_review.credit_account_id,
    'DEFAULT_REVIEW_CLOSED', v_before, to_jsonb(v_review), p_closure_reason,
    p_idempotency_key, p_request_hash
  );

  RETURN v_review;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_driver_default_status()
RETURNS TABLE (
  default_review_id uuid,
  credit_account_id uuid,
  product_name text,
  status_label text,
  status_tone text,
  amount_affected integer,
  currency_code text,
  days_past_due integer,
  deadline_at timestamptz,
  primary_action_label text,
  latest_notice_json jsonb,
  recovery_plan_json jsonb,
  driver_message text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest_notice AS (
    SELECT DISTINCT ON (n.default_review_id)
      n.default_review_id,
      jsonb_build_object(
        'titre', public.default_notice_type_label(n.notice_type),
        'resume', n.notice_summary,
        'action_requise', n.required_action,
        'date_limite', n.deadline_at,
        'support', n.support_instruction,
        'envoye_le', n.sent_at
      ) AS notice_json,
      n.deadline_at
    FROM public.credit_default_notices n
    WHERE n.driver_id = public.current_driver_id()
      AND n.notice_status IN ('SENT','PENDING')
    ORDER BY n.default_review_id, n.created_at DESC
  ),
  active_plan AS (
    SELECT DISTINCT ON (p.default_review_id)
      p.default_review_id,
      jsonb_build_object(
        'statut', CASE p.plan_status WHEN 'ACTIVE' THEN 'Actif' WHEN 'FULFILLED' THEN 'Termine' WHEN 'BROKEN' THEN 'Non respecte' ELSE 'En cours' END,
        'actions', p.required_action_json,
        'date_limite', p.due_date
      ) AS plan_json
    FROM public.credit_recovery_plans p
    WHERE p.driver_id = public.current_driver_id()
    ORDER BY p.default_review_id, p.created_at DESC
  )
  SELECT
    r.default_review_id,
    r.credit_account_id,
    cp.name AS product_name,
    public.default_status_label(r.status) AS status_label,
    CASE
      WHEN r.status IN ('FORMALLY_DEFAULTED','FORMAL_DEFAULT_PENDING_APPROVAL') THEN 'danger'
      WHEN r.status IN ('DEFAULT_REVIEW','EVIDENCE_GATHERING','ASSET_PROTECTION_REVIEW','RECOVERY_PLAN_PENDING') THEN 'warning'
      WHEN r.status IN ('RECOVERY_PLAN_ACTIVE') THEN 'info'
      WHEN r.status IN ('RECOVERY_COMPLETED','DEFAULT_REVERSED','CLOSED') THEN 'success'
      ELSE 'neutral'
    END AS status_tone,
    r.past_due_amount AS amount_affected,
    r.currency_code,
    r.days_past_due,
    COALESCE(ln.deadline_at, r.decision_due_at) AS deadline_at,
    CASE
      WHEN r.status = 'RECOVERY_PLAN_ACTIVE' THEN 'Suivre mon plan'
      WHEN r.status IN ('DEFAULT_REVIEW','EVIDENCE_GATHERING') THEN 'Contacter DAM'
      WHEN r.status = 'ASSET_PROTECTION_REVIEW' THEN 'Confirmer le bien'
      WHEN r.status IN ('FORMAL_DEFAULT_PENDING_APPROVAL','FORMALLY_DEFAULTED') THEN 'Contacter le support'
      ELSE 'Voir le dossier'
    END AS primary_action_label,
    COALESCE(ln.notice_json, '{}'::jsonb) AS latest_notice_json,
    COALESCE(ap.plan_json, '{}'::jsonb) AS recovery_plan_json,
    CASE
      WHEN r.status = 'FORMALLY_DEFAULTED' THEN 'Votre dossier a ete confirme en defaut formel. Contactez l''equipe DAM pour comprendre les options disponibles.'
      WHEN r.status = 'RECOVERY_PLAN_ACTIVE' THEN 'Un plan de regularisation est actif. Respectez les actions convenues pour proteger votre progression.'
      WHEN r.status = 'ASSET_PROTECTION_REVIEW' THEN 'L''equipe DAM doit verifier le bien finance. Cette verification ne signifie pas une reprise automatique.'
      WHEN r.status IN ('DEFAULT_REVIEW','EVIDENCE_GATHERING') THEN 'Votre dossier est en revision. L''equipe DAM cherche une solution documentee et juste.'
      ELSE 'Votre situation credit est suivie par l''equipe DAM.'
    END AS driver_message
  FROM public.credit_default_reviews r
  JOIN public.credit_products cp ON cp.product_id = r.product_id
  LEFT JOIN latest_notice ln ON ln.default_review_id = r.default_review_id
  LEFT JOIN active_plan ap ON ap.default_review_id = r.default_review_id
  WHERE r.driver_id = public.current_driver_id()
  ORDER BY r.created_at DESC;
$$;

CREATE OR REPLACE VIEW public.v_credit_default_review_queue AS
SELECT
  r.default_review_id,
  r.customer_id,
  r.credit_account_id,
  r.collections_case_id,
  r.driver_id,
  d.full_name AS driver_name,
  d.phone_number AS driver_phone,
  r.product_id,
  cp.product_type,
  cp.name AS product_name,
  r.status,
  public.default_status_label(r.status) AS status_label,
  r.trigger_reason,
  r.days_past_due,
  r.past_due_amount,
  r.currency_code,
  r.evidence_status,
  evidence_counts.evidence_count,
  r.assigned_reviewer,
  latest_decision.default_decision_id,
  latest_decision.decision AS latest_decision,
  latest_decision.decision_timestamp,
  active_plan.recovery_plan_id AS active_recovery_plan_id,
  active_asset_review.asset_review_id AS open_asset_review_id,
  notice_counts.sent_notice_count,
  notice_counts.formal_default_notice_sent,
  r.opened_at,
  r.decision_due_at,
  r.closed_at,
  r.closure_reason,
  r.status_changed_at,
  r.created_at,
  r.updated_at
FROM public.credit_default_reviews r
JOIN public.drivers d ON d.id = r.driver_id
JOIN public.credit_products cp ON cp.product_id = r.product_id
LEFT JOIN LATERAL (
  SELECT COUNT(*)::integer AS evidence_count
  FROM public.credit_default_evidence e
  WHERE e.default_review_id = r.default_review_id
) evidence_counts ON true
LEFT JOIN LATERAL (
  SELECT d2.*
  FROM public.credit_default_decisions d2
  WHERE d2.default_review_id = r.default_review_id
  ORDER BY d2.decision_timestamp DESC
  LIMIT 1
) latest_decision ON true
LEFT JOIN LATERAL (
  SELECT p.*
  FROM public.credit_recovery_plans p
  WHERE p.default_review_id = r.default_review_id
    AND p.plan_status IN ('PENDING_APPROVAL','ACTIVE')
  ORDER BY p.created_at DESC
  LIMIT 1
) active_plan ON true
LEFT JOIN LATERAL (
  SELECT a.*
  FROM public.credit_asset_protection_reviews a
  WHERE a.default_review_id = r.default_review_id
    AND a.status NOT IN ('CLOSED','CANCELLED')
  ORDER BY a.created_at DESC
  LIMIT 1
) active_asset_review ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE n.notice_status = 'SENT')::integer AS sent_notice_count,
    COALESCE(bool_or(n.notice_type = 'FORMAL_DEFAULT_NOTICE' AND n.notice_status = 'SENT'), false) AS formal_default_notice_sent
  FROM public.credit_default_notices n
  WHERE n.default_review_id = r.default_review_id
) notice_counts ON true
WHERE r.status NOT IN ('RECOVERY_COMPLETED','DEFAULT_REVERSED','WRITTEN_OFF','CLOSED');

GRANT SELECT ON public.v_credit_default_review_queue TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_credit_default_reconciliation_anomalies AS
WITH missing_evidence AS (
  SELECT
    r.customer_id,
    r.default_review_id,
    r.credit_account_id,
    'CRITICAL'::text AS severity,
    'FORMAL_DEFAULT_READY_WITHOUT_EVIDENCE'::text AS anomaly_type,
    jsonb_build_object('status', r.status) AS details_json
  FROM public.credit_default_reviews r
  WHERE r.status IN ('FORMAL_DEFAULT_PENDING_APPROVAL','FORMALLY_DEFAULTED')
    AND NOT EXISTS (SELECT 1 FROM public.credit_default_evidence e WHERE e.default_review_id = r.default_review_id)
),
missing_notice AS (
  SELECT
    r.customer_id,
    r.default_review_id,
    r.credit_account_id,
    'WARNING'::text AS severity,
    'FORMAL_DEFAULT_DECISION_WITHOUT_SENT_NOTICE'::text AS anomaly_type,
    jsonb_build_object('decision_id', d.default_decision_id) AS details_json
  FROM public.credit_default_reviews r
  JOIN public.credit_default_decisions d ON d.default_review_id = r.default_review_id AND d.decision = 'FORMAL_DEFAULT' AND d.driver_notice_required
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.credit_default_notices n
    WHERE n.default_review_id = r.default_review_id
      AND n.notice_type = 'FORMAL_DEFAULT_NOTICE'
      AND n.notice_status = 'SENT'
  )
),
writeoff_not_executed AS (
  SELECT
    r.customer_id,
    r.default_review_id,
    r.credit_account_id,
    'INFO'::text AS severity,
    'WRITE_OFF_RECOMMENDATION_ONLY'::text AS anomaly_type,
    jsonb_build_object('decision_id', d.default_decision_id, 'note', 'Layer 3F does not execute accounting write-off') AS details_json
  FROM public.credit_default_decisions d
  JOIN public.credit_default_reviews r ON r.default_review_id = d.default_review_id
  WHERE d.decision = 'WRITE_OFF_RECOMMENDED'
)
SELECT gen_random_uuid() AS anomaly_id, *, now() AS detected_at FROM missing_evidence
UNION ALL SELECT gen_random_uuid(), *, now() FROM missing_notice
UNION ALL SELECT gen_random_uuid(), *, now() FROM writeoff_not_executed;

GRANT SELECT ON public.v_credit_default_reconciliation_anomalies TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.has_default_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.default_rules_for_account(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.default_status_label(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.default_notice_type_label(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_credit_default_review(uuid, uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_credit_default_review(uuid, uuid, text, timestamptz, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attach_credit_default_evidence(uuid, text, text, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_credit_default_decision(uuid, text, text, text, uuid, boolean, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_credit_recovery_plan(uuid, jsonb, date, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_credit_asset_protection_review(uuid, text, uuid, boolean, timestamptz, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_credit_default_notice(uuid, text, text, text, text, timestamptz, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.declare_credit_formal_default(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_credit_formal_default(uuid, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_credit_default_review(uuid, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_driver_default_status() TO authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'credit_default_reviews',
    'credit_default_evidence',
    'credit_default_decisions',
    'credit_recovery_plans',
    'credit_asset_protection_reviews',
    'credit_default_notices',
    'credit_default_audit_events'
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

COMMENT ON TABLE public.credit_default_reviews IS 'Layer 3F default governance case. One active review per credit account; formal default requires evidence and elevated permission.';
COMMENT ON TABLE public.credit_default_evidence IS 'Layer 3F evidence checklist. Evidence locks after a decision; corrections are added as new evidence.';
COMMENT ON TABLE public.credit_default_decisions IS 'Layer 3F human decision log. Write-off decisions are recommendations only and do not execute accounting write-off.';
COMMENT ON TABLE public.credit_recovery_plans IS 'Layer 3F operational recovery plan. Does not create or amend repayment schedules.';
COMMENT ON TABLE public.credit_asset_protection_reviews IS 'Layer 3F asset protection review. Does not automate repossession, legal action, title transfer, or debt sale.';
COMMENT ON TABLE public.credit_default_notices IS 'Layer 3F French-first driver notice log for default and recovery workflows.';
COMMENT ON TABLE public.credit_default_audit_events IS 'Layer 3F immutable audit trail for default, recovery, and reversal actions.';

NOTIFY pgrst, 'reload schema';