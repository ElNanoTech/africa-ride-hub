-- ============================================================
-- Layer 3G - Ownership Completion & Asset Transfer Engine
-- Human-reviewed completion workflow extending Layers 3A-3F.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.credit_accounts') IS NULL THEN
    RAISE EXCEPTION 'Layer 3G requires Layer 3A credit_accounts';
  END IF;
  IF to_regclass('public.financed_assets') IS NULL THEN
    RAISE EXCEPTION 'Layer 3G requires Layer 3A financed_assets';
  END IF;
  IF to_regclass('public.scheduled_obligations') IS NULL THEN
    RAISE EXCEPTION 'Layer 3G requires Layer 3D scheduled_obligations';
  END IF;
  IF to_regclass('public.credit_collections_cases') IS NULL THEN
    RAISE EXCEPTION 'Layer 3G requires Layer 3E credit_collections_cases';
  END IF;
  IF to_regclass('public.credit_default_reviews') IS NULL THEN
    RAISE EXCEPTION 'Layer 3G requires Layer 3F credit_default_reviews';
  END IF;
  IF to_regclass('public.credit_recovery_plans') IS NULL THEN
    RAISE EXCEPTION 'Layer 3G requires Layer 3F credit_recovery_plans';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.default_ownership_completion_rules()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'documents_complete', true,
    'required_documents', '[]'::jsonb,
    'product_completion_rules_satisfied', true,
    'product_completion_rules', '[]'::jsonb,
    'fraud_hold', false,
    'legal_hold', false,
    'manual_hold', false,
    'require_final_approval', true,
    'transfer_requirements', '[]'::jsonb,
    'transfer_types', jsonb_build_array(
      'OWNERSHIP_TRANSFER',
      'TITLE_RELEASE',
      'ASSET_RELEASE',
      'DIGITAL_ASSET_TRANSFER'
    )
  )
$$;

ALTER TABLE public.product_versions
  ADD COLUMN IF NOT EXISTS ownership_completion_rules_json jsonb NOT NULL DEFAULT public.default_ownership_completion_rules();

UPDATE public.product_versions
SET ownership_completion_rules_json = public.default_ownership_completion_rules()
WHERE ownership_completion_rules_json IS NULL OR ownership_completion_rules_json = '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.has_ownership_completion_permission(permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(auth.role(), '') = 'service_role'
    OR public.is_platform_owner()
    OR CASE permission
      WHEN 'ownership.view' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer','support','agent_support'])
      WHEN 'ownership.review' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer'])
      WHEN 'ownership.complete' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'ownership.transfer' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'ownership.certificate' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'ownership.reverse' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'ownership.audit' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'ownership.admin' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      ELSE false
    END
$$;

CREATE TABLE IF NOT EXISTS public.ownership_completion_reviews (
  review_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  credit_account_id uuid NOT NULL REFERENCES public.credit_accounts(credit_account_id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES public.financed_assets(asset_id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.credit_products(product_id) ON DELETE RESTRICT,
  product_version_id uuid NOT NULL REFERENCES public.product_versions(version_id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'NOT_ELIGIBLE' CHECK (status IN (
    'NOT_ELIGIBLE',
    'ELIGIBLE_FOR_COMPLETION',
    'UNDER_COMPLETION_REVIEW',
    'AWAITING_FINAL_APPROVAL',
    'COMPLETED',
    'REVERSED',
    'CANCELLED'
  )),
  eligibility_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  blocking_reasons_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  obligation_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  completion_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  product_rules_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_reviewer uuid,
  opened_at timestamptz,
  review_due_at timestamptz,
  completed_at timestamptz,
  reversed_at timestamptz,
  cancelled_at timestamptz,
  closure_reason text,
  eligibility_checked_at timestamptz NOT NULL DEFAULT now(),
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  idempotency_key text NOT NULL,
  request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ownership_review_blocking_array CHECK (jsonb_typeof(blocking_reasons_json) = 'array'),
  CONSTRAINT ownership_review_completion_dates CHECK (
    (status <> 'COMPLETED' OR completed_at IS NOT NULL)
    AND (status <> 'REVERSED' OR reversed_at IS NOT NULL)
    AND (status <> 'CANCELLED' OR cancelled_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.ownership_completion_decisions (
  decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  review_id uuid NOT NULL REFERENCES public.ownership_completion_reviews(review_id) ON DELETE RESTRICT,
  credit_account_id uuid NOT NULL REFERENCES public.credit_accounts(credit_account_id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN (
    'APPROVE_COMPLETION',
    'REJECT_COMPLETION',
    'REQUEST_REVIEW',
    'ESCALATE'
  )),
  decision_reason text NOT NULL CHECK (length(trim(decision_reason)) >= 5),
  decision_summary text,
  decided_by uuid,
  second_approver_id uuid,
  decision_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_timestamp timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL,
  request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ownership_decision_dual_approval_distinct CHECK (second_approver_id IS NULL OR second_approver_id IS DISTINCT FROM decided_by)
);

CREATE TABLE IF NOT EXISTS public.asset_transfer_records (
  transfer_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  review_id uuid NOT NULL REFERENCES public.ownership_completion_reviews(review_id) ON DELETE RESTRICT,
  decision_id uuid REFERENCES public.ownership_completion_decisions(decision_id) ON DELETE SET NULL,
  credit_account_id uuid NOT NULL REFERENCES public.credit_accounts(credit_account_id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES public.financed_assets(asset_id) ON DELETE RESTRICT,
  transfer_status text NOT NULL DEFAULT 'PENDING' CHECK (transfer_status IN ('PENDING','APPROVED','COMPLETED','REVERSED','CANCELLED')),
  transfer_type text NOT NULL DEFAULT 'OWNERSHIP_TRANSFER' CHECK (transfer_type IN (
    'OWNERSHIP_TRANSFER',
    'TITLE_RELEASE',
    'ASSET_RELEASE',
    'DIGITAL_ASSET_TRANSFER'
  )),
  approved_by uuid,
  completed_at timestamptz,
  reversed_at timestamptz,
  reversal_reason text,
  transfer_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asset_transfer_completion_dates CHECK (
    (transfer_status <> 'COMPLETED' OR completed_at IS NOT NULL)
    AND (transfer_status <> 'REVERSED' OR reversed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.ownership_certificates (
  certificate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  transfer_id uuid NOT NULL REFERENCES public.asset_transfer_records(transfer_id) ON DELETE RESTRICT,
  review_id uuid NOT NULL REFERENCES public.ownership_completion_reviews(review_id) ON DELETE RESTRICT,
  credit_account_id uuid NOT NULL REFERENCES public.credit_accounts(credit_account_id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES public.financed_assets(asset_id) ON DELETE RESTRICT,
  certificate_number text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  certificate_status text NOT NULL DEFAULT 'ISSUED' CHECK (certificate_status IN ('ISSUED','COPY','ACTIVE','REGENERATED_COPY','REVOKED')),
  document_reference text,
  issued_by uuid,
  certificate_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (certificate_number)
);

CREATE TABLE IF NOT EXISTS public.ownership_completion_audit_events (
  audit_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  review_id uuid REFERENCES public.ownership_completion_reviews(review_id) ON DELETE SET NULL,
  credit_account_id uuid REFERENCES public.credit_accounts(credit_account_id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.financed_assets(asset_id) ON DELETE SET NULL,
  event_type text NOT NULL,
  before_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  actor_id uuid,
  idempotency_key text,
  request_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ownership_completion_reviews TO authenticated;
GRANT SELECT ON public.ownership_completion_decisions TO authenticated;
GRANT SELECT ON public.asset_transfer_records TO authenticated;
GRANT SELECT ON public.ownership_certificates TO authenticated;
GRANT SELECT ON public.ownership_completion_audit_events TO authenticated;
GRANT ALL ON public.ownership_completion_reviews TO service_role;
GRANT ALL ON public.ownership_completion_decisions TO service_role;
GRANT ALL ON public.asset_transfer_records TO service_role;
GRANT ALL ON public.ownership_certificates TO service_role;
GRANT ALL ON public.ownership_completion_audit_events TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ownership_reviews_idempotency
  ON public.ownership_completion_reviews(customer_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ownership_one_active_review
  ON public.ownership_completion_reviews(credit_account_id)
  WHERE status NOT IN ('COMPLETED','REVERSED','CANCELLED');
CREATE INDEX IF NOT EXISTS idx_ownership_reviews_queue
  ON public.ownership_completion_reviews(customer_id, status, eligibility_checked_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ownership_reviews_driver
  ON public.ownership_completion_reviews(driver_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ownership_reviews_asset
  ON public.ownership_completion_reviews(asset_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ownership_decisions_idempotency
  ON public.ownership_completion_decisions(customer_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ownership_decisions_review
  ON public.ownership_completion_decisions(review_id, decision_timestamp DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_asset_transfers_idempotency
  ON public.asset_transfer_records(customer_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_asset_transfer_completed_account
  ON public.asset_transfer_records(credit_account_id)
  WHERE transfer_status = 'COMPLETED' AND transfer_type = 'OWNERSHIP_TRANSFER';
CREATE INDEX IF NOT EXISTS idx_asset_transfers_driver
  ON public.asset_transfer_records(driver_id, transfer_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_transfers_asset
  ON public.asset_transfer_records(asset_id, transfer_status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ownership_certificates_idempotency
  ON public.ownership_certificates(customer_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ownership_certificate_issued_transfer
  ON public.ownership_certificates(transfer_id)
  WHERE certificate_status = 'ISSUED';
CREATE INDEX IF NOT EXISTS idx_ownership_certificates_driver
  ON public.ownership_certificates(driver_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_ownership_certificates_asset
  ON public.ownership_certificates(asset_id, issued_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ownership_audit_idempotency
  ON public.ownership_completion_audit_events(customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ownership_audit_review
  ON public.ownership_completion_audit_events(review_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ownership_audit_account
  ON public.ownership_completion_audit_events(credit_account_id, created_at DESC);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ownership_completion_reviews',
    'ownership_completion_decisions',
    'asset_transfer_records'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'ownership_completion_audit_events',
    'ownership_certificates'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_immutable ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_credit_immutable_change()', t, t);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.ownership_completion_review_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ownership completion reviews are auditable; cancel or reverse instead of deleting';
  END IF;

  IF OLD.credit_account_id IS DISTINCT FROM NEW.credit_account_id
    OR OLD.driver_id IS DISTINCT FROM NEW.driver_id
    OR OLD.asset_id IS DISTINCT FROM NEW.asset_id
    OR OLD.product_id IS DISTINCT FROM NEW.product_id
    OR OLD.product_version_id IS DISTINCT FROM NEW.product_version_id
    OR OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    RAISE EXCEPTION 'ownership completion review identity is immutable';
  END IF;

  IF OLD.status IN ('REVERSED','CANCELLED') AND OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'terminal ownership completion reviews cannot be reopened';
  END IF;
  IF OLD.status = 'COMPLETED' AND NEW.status NOT IN ('COMPLETED','REVERSED') THEN
    RAISE EXCEPTION 'completed ownership reviews may only be reversed';
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_changed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ownership_completion_review_guard ON public.ownership_completion_reviews;
CREATE TRIGGER trg_ownership_completion_review_guard
  BEFORE UPDATE OR DELETE ON public.ownership_completion_reviews
  FOR EACH ROW EXECUTE FUNCTION public.ownership_completion_review_guard();

CREATE OR REPLACE FUNCTION public.ownership_completion_decision_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ownership completion decisions are immutable; create a follow-up decision or reversal instead';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'ownership completion decisions are immutable; create a follow-up decision or reversal instead';
  END IF;

  IF OLD.review_id IS DISTINCT FROM NEW.review_id
    OR OLD.credit_account_id IS DISTINCT FROM NEW.credit_account_id
    OR OLD.customer_id IS DISTINCT FROM NEW.customer_id
    OR OLD.decision IS DISTINCT FROM NEW.decision
    OR OLD.decision_reason IS DISTINCT FROM NEW.decision_reason
    OR OLD.decision_summary IS DISTINCT FROM NEW.decision_summary
    OR OLD.decided_by IS DISTINCT FROM NEW.decided_by
    OR OLD.second_approver_id IS DISTINCT FROM NEW.second_approver_id
    OR OLD.decision_metadata_json IS DISTINCT FROM NEW.decision_metadata_json
    OR OLD.decision_timestamp IS DISTINCT FROM NEW.decision_timestamp THEN
    RAISE EXCEPTION 'ownership completion decision content is immutable';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ownership_completion_decision_guard ON public.ownership_completion_decisions;
CREATE TRIGGER trg_ownership_completion_decision_guard
  BEFORE UPDATE OR DELETE ON public.ownership_completion_decisions
  FOR EACH ROW EXECUTE FUNCTION public.ownership_completion_decision_guard();

CREATE OR REPLACE FUNCTION public.asset_transfer_record_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'asset transfer records are auditable; create a compensating reversal instead of deleting';
  END IF;

  IF OLD.review_id IS DISTINCT FROM NEW.review_id
    OR OLD.credit_account_id IS DISTINCT FROM NEW.credit_account_id
    OR OLD.driver_id IS DISTINCT FROM NEW.driver_id
    OR OLD.asset_id IS DISTINCT FROM NEW.asset_id
    OR OLD.customer_id IS DISTINCT FROM NEW.customer_id
    OR OLD.transfer_type IS DISTINCT FROM NEW.transfer_type THEN
    RAISE EXCEPTION 'asset transfer identity is immutable';
  END IF;

  IF OLD.completed_at IS NOT NULL AND NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'asset transfer completion timestamp cannot be cleared';
  END IF;
  IF OLD.reversed_at IS NOT NULL AND NEW.reversed_at IS NULL THEN
    RAISE EXCEPTION 'asset transfer reversal timestamp cannot be cleared';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_asset_transfer_record_guard ON public.asset_transfer_records;
CREATE TRIGGER trg_asset_transfer_record_guard
  BEFORE UPDATE OR DELETE ON public.asset_transfer_records
  FOR EACH ROW EXECUTE FUNCTION public.asset_transfer_record_guard();

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ownership_completion_reviews',
    'ownership_completion_decisions',
    'asset_transfer_records',
    'ownership_certificates',
    'ownership_completion_audit_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "ownership platform owner all" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "ownership admins tenant read" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "drivers read own ownership records" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "ownership platform owner all" ON public.%I FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner())',
      t
    );
    EXECUTE format(
      'CREATE POLICY "ownership admins tenant read" ON public.%I FOR SELECT TO authenticated USING (public.has_ownership_completion_permission(''ownership.view'') AND customer_id = public.current_customer_id())',
      t
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "drivers read own ownership reviews" ON public.ownership_completion_reviews;
CREATE POLICY "drivers read own ownership reviews" ON public.ownership_completion_reviews
  FOR SELECT TO authenticated
  USING (driver_id = public.current_driver_id());

DROP POLICY IF EXISTS "drivers read own ownership transfers" ON public.asset_transfer_records;
CREATE POLICY "drivers read own ownership transfers" ON public.asset_transfer_records
  FOR SELECT TO authenticated
  USING (driver_id = public.current_driver_id() AND transfer_status IN ('COMPLETED','REVERSED'));

DROP POLICY IF EXISTS "drivers read own ownership certificates" ON public.ownership_certificates;
CREATE POLICY "drivers read own ownership certificates" ON public.ownership_certificates
  FOR SELECT TO authenticated
  USING (driver_id = public.current_driver_id());

CREATE OR REPLACE FUNCTION public.ownership_jsonb_bool(
  p_primary jsonb,
  p_fallback jsonb,
  p_key text,
  p_default boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(COALESCE(COALESCE(p_primary, '{}'::jsonb)->>p_key, COALESCE(p_fallback, '{}'::jsonb)->>p_key, ''))
    WHEN 'true' THEN true
    WHEN 'false' THEN false
    ELSE p_default
  END
$$;

CREATE OR REPLACE FUNCTION public.ownership_completion_rules_for_account(p_credit_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rules jsonb;
BEGIN
  SELECT COALESCE(pv.ownership_completion_rules_json, public.default_ownership_completion_rules())
    INTO v_rules
  FROM public.credit_accounts ca
  LEFT JOIN public.product_versions pv ON pv.version_id = ca.product_version_id
  WHERE ca.credit_account_id = p_credit_account_id;

  RETURN COALESCE(v_rules, public.default_ownership_completion_rules());
END;
$$;

CREATE OR REPLACE FUNCTION public.ownership_completion_status_label(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_status
    WHEN 'NOT_ELIGIBLE' THEN 'Pas encore eligible'
    WHEN 'ELIGIBLE_FOR_COMPLETION' THEN 'Pret pour verification'
    WHEN 'UNDER_COMPLETION_REVIEW' THEN 'Verification de propriete en cours'
    WHEN 'AWAITING_FINAL_APPROVAL' THEN 'Validation finale en attente'
    WHEN 'COMPLETED' THEN 'Vous etes proprietaire'
    WHEN 'REVERSED' THEN 'Completion annulee'
    WHEN 'CANCELLED' THEN 'Demande fermee'
    ELSE 'Statut de propriete en cours'
  END
$$;

CREATE OR REPLACE FUNCTION public.ownership_certificate_number(
  p_customer_id uuid,
  p_credit_account_id uuid,
  p_asset_id uuid
)
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'OWN-' || to_char(now(), 'YYYYMMDD') || '-' ||
         upper(substr(replace(p_customer_id::text, '-', ''), 1, 6)) || '-' ||
         upper(substr(replace(p_credit_account_id::text, '-', ''), 1, 6)) || '-' ||
         upper(substr(replace(p_asset_id::text, '-', ''), 1, 6)) || '-' ||
         upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
$$;

CREATE OR REPLACE FUNCTION public.ownership_completion_eligibility_snapshot(
  p_credit_account_id uuid,
  p_completion_metadata_json jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.credit_accounts%ROWTYPE;
  v_asset public.financed_assets%ROWTYPE;
  v_rules jsonb;
  v_metadata jsonb := COALESCE(p_completion_metadata_json, '{}'::jsonb);
  v_required_documents jsonb := '[]'::jsonb;
  v_product_rules jsonb := '[]'::jsonb;
  v_obligation_count integer := 0;
  v_paid_obligation_count integer := 0;
  v_open_obligation_count integer := 0;
  v_outstanding_balance integer := 0;
  v_active_collections_count integer := 0;
  v_active_default_count integer := 0;
  v_active_recovery_count integer := 0;
  v_documents_complete boolean;
  v_product_rules_satisfied boolean;
  v_fraud_hold boolean;
  v_legal_hold boolean;
  v_manual_hold boolean;
  v_blocking_reasons jsonb := '[]'::jsonb;
  v_is_eligible boolean := false;
BEGIN
  SELECT * INTO v_account
  FROM public.credit_accounts
  WHERE credit_account_id = p_credit_account_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'is_eligible', false,
      'lifecycle_status', 'NOT_ELIGIBLE',
      'blocking_reasons', jsonb_build_array('CREDIT_ACCOUNT_NOT_FOUND'),
      'checked_at', now()
    );
  END IF;

  IF v_account.asset_id IS NOT NULL THEN
    SELECT * INTO v_asset
    FROM public.financed_assets
    WHERE asset_id = v_account.asset_id;
  END IF;

  v_rules := public.ownership_completion_rules_for_account(v_account.credit_account_id);
  v_required_documents := CASE
    WHEN jsonb_typeof(v_metadata->'required_documents') = 'array' THEN v_metadata->'required_documents'
    WHEN jsonb_typeof(v_rules->'required_documents') = 'array' THEN v_rules->'required_documents'
    ELSE '[]'::jsonb
  END;
  v_product_rules := CASE
    WHEN jsonb_typeof(v_metadata->'product_completion_rules') = 'array' THEN v_metadata->'product_completion_rules'
    WHEN jsonb_typeof(v_rules->'product_completion_rules') = 'array' THEN v_rules->'product_completion_rules'
    ELSE '[]'::jsonb
  END;

  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE status = 'PAID')::integer,
    COUNT(*) FILTER (WHERE status NOT IN ('PAID','CANCELLED','SUPERSEDED'))::integer,
    COALESCE(SUM(amount) FILTER (WHERE status NOT IN ('PAID','CANCELLED','SUPERSEDED')), 0)::integer
    INTO v_obligation_count, v_paid_obligation_count, v_open_obligation_count, v_outstanding_balance
  FROM public.scheduled_obligations
  WHERE credit_account_id = v_account.credit_account_id;

  SELECT COUNT(*)::integer INTO v_active_collections_count
  FROM public.credit_collections_cases
  WHERE credit_account_id = v_account.credit_account_id
    AND current_status NOT IN ('RESOLVED','CLOSED');

  SELECT COUNT(*)::integer INTO v_active_default_count
  FROM public.credit_default_reviews
  WHERE credit_account_id = v_account.credit_account_id
    AND status NOT IN ('RECOVERY_COMPLETED','DEFAULT_REVERSED','WRITTEN_OFF','CLOSED');

  SELECT COUNT(*)::integer INTO v_active_recovery_count
  FROM public.credit_recovery_plans
  WHERE credit_account_id = v_account.credit_account_id
    AND plan_status IN ('PENDING_APPROVAL','ACTIVE','BROKEN');

  v_documents_complete := public.ownership_jsonb_bool(
    v_metadata,
    v_rules,
    'documents_complete',
    jsonb_array_length(v_required_documents) = 0
  );
  v_product_rules_satisfied := public.ownership_jsonb_bool(v_metadata, v_rules, 'product_completion_rules_satisfied', true);
  v_fraud_hold := public.ownership_jsonb_bool(v_metadata, v_rules, 'fraud_hold', false);
  v_legal_hold := public.ownership_jsonb_bool(v_metadata, v_rules, 'legal_hold', false);
  v_manual_hold := public.ownership_jsonb_bool(v_metadata, v_rules, 'manual_hold', false);

  IF v_account.status NOT IN ('ACTIVE','COMPLETED') THEN
    v_blocking_reasons := v_blocking_reasons || jsonb_build_array('CREDIT_ACCOUNT_NOT_ACTIVE_OR_COMPLETED');
  END IF;
  IF v_account.asset_id IS NULL OR v_asset.asset_id IS NULL THEN
    v_blocking_reasons := v_blocking_reasons || jsonb_build_array('FINANCED_ASSET_REQUIRED');
  END IF;
  IF v_obligation_count = 0 THEN
    v_blocking_reasons := v_blocking_reasons || jsonb_build_array('SCHEDULED_OBLIGATIONS_REQUIRED');
  END IF;
  IF v_open_obligation_count > 0 THEN
    v_blocking_reasons := v_blocking_reasons || jsonb_build_array('OBLIGATIONS_NOT_SATISFIED');
  END IF;
  IF v_outstanding_balance > 0 THEN
    v_blocking_reasons := v_blocking_reasons || jsonb_build_array('OUTSTANDING_BALANCE_NOT_ZERO');
  END IF;
  IF v_active_collections_count > 0 THEN
    v_blocking_reasons := v_blocking_reasons || jsonb_build_array('ACTIVE_COLLECTIONS_CASE');
  END IF;
  IF v_active_default_count > 0 THEN
    v_blocking_reasons := v_blocking_reasons || jsonb_build_array('ACTIVE_DEFAULT_REVIEW');
  END IF;
  IF v_active_recovery_count > 0 THEN
    v_blocking_reasons := v_blocking_reasons || jsonb_build_array('ACTIVE_RECOVERY_PLAN');
  END IF;
  IF v_fraud_hold THEN
    v_blocking_reasons := v_blocking_reasons || jsonb_build_array('FRAUD_HOLD');
  END IF;
  IF v_legal_hold THEN
    v_blocking_reasons := v_blocking_reasons || jsonb_build_array('LEGAL_HOLD');
  END IF;
  IF v_manual_hold THEN
    v_blocking_reasons := v_blocking_reasons || jsonb_build_array('MANUAL_COMPLETION_HOLD');
  END IF;
  IF NOT v_documents_complete THEN
    v_blocking_reasons := v_blocking_reasons || jsonb_build_array('REQUIRED_DOCUMENTATION_INCOMPLETE');
  END IF;
  IF NOT v_product_rules_satisfied THEN
    v_blocking_reasons := v_blocking_reasons || jsonb_build_array('PRODUCT_COMPLETION_RULES_UNSATISFIED');
  END IF;

  v_is_eligible := jsonb_array_length(v_blocking_reasons) = 0;

  RETURN jsonb_build_object(
    'is_eligible', v_is_eligible,
    'lifecycle_status', CASE WHEN v_is_eligible THEN 'ELIGIBLE_FOR_COMPLETION' ELSE 'NOT_ELIGIBLE' END,
    'blocking_reasons', v_blocking_reasons,
    'checked_at', now(),
    'credit_account', jsonb_build_object(
      'credit_account_id', v_account.credit_account_id,
      'status', v_account.status,
      'driver_id', v_account.driver_id,
      'asset_id', v_account.asset_id,
      'product_id', v_account.product_id,
      'product_version_id', v_account.product_version_id
    ),
    'asset', CASE WHEN v_asset.asset_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
      'asset_id', v_asset.asset_id,
      'asset_type', v_asset.asset_type,
      'status', v_asset.status,
      'possession_status', v_asset.possession_status,
      'fulfillment_status', v_asset.fulfillment_status
    ) END,
    'obligations', jsonb_build_object(
      'obligation_count', v_obligation_count,
      'paid_obligation_count', v_paid_obligation_count,
      'open_obligation_count', v_open_obligation_count,
      'outstanding_balance', v_outstanding_balance,
      'currency_code', v_account.principal_currency_code
    ),
    'holds', jsonb_build_object(
      'active_collections_count', v_active_collections_count,
      'active_default_count', v_active_default_count,
      'active_recovery_count', v_active_recovery_count,
      'fraud_hold', v_fraud_hold,
      'legal_hold', v_legal_hold,
      'manual_hold', v_manual_hold
    ),
    'documents', jsonb_build_object(
      'documents_complete', v_documents_complete,
      'required_documents', v_required_documents
    ),
    'product_completion', jsonb_build_object(
      'product_completion_rules_satisfied', v_product_rules_satisfied,
      'product_completion_rules', v_product_rules
    ),
    'rules_snapshot', v_rules,
    'metadata_snapshot', v_metadata
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ownership_completion_audit(
  p_customer_id uuid,
  p_review_id uuid,
  p_credit_account_id uuid,
  p_asset_id uuid,
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
  INSERT INTO public.ownership_completion_audit_events (
    customer_id, review_id, credit_account_id, asset_id, event_type,
    before_json, after_json, reason, actor_id, idempotency_key, request_hash
  )
  VALUES (
    p_customer_id, p_review_id, p_credit_account_id, p_asset_id, p_event_type,
    COALESCE(p_before, '{}'::jsonb), COALESCE(p_after, '{}'::jsonb),
    p_reason, auth.uid(), p_idempotency_key, p_request_hash
  )
  ON CONFLICT DO NOTHING
  RETURNING audit_event_id INTO v_id;

  IF v_id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT audit_event_id INTO v_id
    FROM public.ownership_completion_audit_events
    WHERE customer_id = p_customer_id
      AND idempotency_key = p_idempotency_key
    LIMIT 1;
    RETURN v_id;
  END IF;

  PERFORM public.credit_log_event(
    p_customer_id,
    lower(p_event_type),
    'ownership_completion',
    COALESCE(p_review_id, p_credit_account_id, p_asset_id),
    COALESCE(p_before, '{}'::jsonb),
    COALESCE(p_after, '{}'::jsonb),
    jsonb_build_object('review_id', p_review_id, 'credit_account_id', p_credit_account_id, 'asset_id', p_asset_id, 'reason', p_reason),
    p_idempotency_key
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_ownership_completion_candidates(
  p_credit_account_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 250,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS TABLE (
  review_id uuid,
  credit_account_id uuid,
  status text,
  is_eligible boolean,
  blocking_reasons_json jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_existing public.ownership_completion_reviews%ROWTYPE;
  v_review public.ownership_completion_reviews%ROWTYPE;
  v_snapshot jsonb;
  v_status text;
  v_key text;
  v_before jsonb;
BEGIN
  IF NOT public.has_ownership_completion_permission('ownership.admin') THEN
    RAISE EXCEPTION 'forbidden: ownership.admin required' USING ERRCODE = '42501';
  END IF;

  FOR v_row IN
    SELECT ca.*
    FROM public.credit_accounts ca
    WHERE ca.asset_id IS NOT NULL
      AND ca.status IN ('ACTIVE','COMPLETED')
      AND (p_credit_account_id IS NULL OR ca.credit_account_id = p_credit_account_id)
      AND (public.is_platform_owner() OR ca.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
      AND NOT EXISTS (
        SELECT 1
        FROM public.ownership_completion_reviews completed_review
        WHERE completed_review.credit_account_id = ca.credit_account_id
          AND completed_review.status = 'COMPLETED'
      )
    ORDER BY ca.updated_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 250), 1)
  LOOP
    v_snapshot := public.ownership_completion_eligibility_snapshot(v_row.credit_account_id, '{}'::jsonb);
    v_status := COALESCE(v_snapshot->>'lifecycle_status', 'NOT_ELIGIBLE');

    SELECT * INTO v_existing
    FROM public.ownership_completion_reviews r
    WHERE r.credit_account_id = v_row.credit_account_id
      AND r.status NOT IN ('COMPLETED','REVERSED','CANCELLED')
    ORDER BY r.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      v_before := to_jsonb(v_existing);
      UPDATE public.ownership_completion_reviews
      SET status = CASE
            WHEN ownership_completion_reviews.status IN ('UNDER_COMPLETION_REVIEW','AWAITING_FINAL_APPROVAL') THEN ownership_completion_reviews.status
            ELSE v_status
          END,
          eligibility_snapshot_json = v_snapshot,
          blocking_reasons_json = COALESCE(v_snapshot->'blocking_reasons', '[]'::jsonb),
          obligation_summary_json = COALESCE(v_snapshot->'obligations', '{}'::jsonb),
          product_rules_snapshot_json = COALESCE(v_snapshot->'rules_snapshot', '{}'::jsonb),
          eligibility_checked_at = now(),
          updated_by = auth.uid()
      WHERE ownership_completion_reviews.review_id = v_existing.review_id
      RETURNING * INTO v_review;

      IF v_before->>'status' IS DISTINCT FROM v_review.status
        OR v_before->'blocking_reasons_json' IS DISTINCT FROM v_review.blocking_reasons_json THEN
        PERFORM public.ownership_completion_audit(
          v_review.customer_id, v_review.review_id, v_review.credit_account_id, v_review.asset_id,
          'COMPLETION_ELIGIBILITY_CHECKED', v_before, to_jsonb(v_review),
          'ownership completion sync refreshed eligibility',
          COALESCE(p_idempotency_key, 'ownership-sync') || ':eligibility:' || v_review.credit_account_id::text || ':' || v_review.status,
          p_request_hash
        );
      END IF;
    ELSE
      v_key := COALESCE(p_idempotency_key, 'ownership-sync') || ':' || v_row.credit_account_id::text;
      INSERT INTO public.ownership_completion_reviews (
        customer_id, credit_account_id, driver_id, asset_id, product_id, product_version_id,
        status, eligibility_snapshot_json, blocking_reasons_json, obligation_summary_json,
        completion_metadata_json, product_rules_snapshot_json, created_by, updated_by,
        idempotency_key, request_hash
      )
      VALUES (
        v_row.customer_id, v_row.credit_account_id, v_row.driver_id, v_row.asset_id,
        v_row.product_id, v_row.product_version_id, v_status, v_snapshot,
        COALESCE(v_snapshot->'blocking_reasons', '[]'::jsonb),
        COALESCE(v_snapshot->'obligations', '{}'::jsonb),
        COALESCE(v_snapshot->'metadata_snapshot', '{}'::jsonb),
        COALESCE(v_snapshot->'rules_snapshot', '{}'::jsonb),
        auth.uid(), auth.uid(), v_key, p_request_hash
      )
      ON CONFLICT (customer_id, idempotency_key) DO UPDATE
      SET eligibility_snapshot_json = EXCLUDED.eligibility_snapshot_json,
          blocking_reasons_json = EXCLUDED.blocking_reasons_json,
          obligation_summary_json = EXCLUDED.obligation_summary_json,
          product_rules_snapshot_json = EXCLUDED.product_rules_snapshot_json,
          eligibility_checked_at = now(),
          updated_by = auth.uid()
      RETURNING * INTO v_review;

      PERFORM public.ownership_completion_audit(
        v_review.customer_id, v_review.review_id, v_review.credit_account_id, v_review.asset_id,
        'COMPLETION_ELIGIBILITY_CHECKED', '{}'::jsonb, to_jsonb(v_review),
        'ownership completion sync created candidate',
        v_key || ':audit',
        p_request_hash
      );
    END IF;

    review_id := v_review.review_id;
    credit_account_id := v_review.credit_account_id;
    status := v_review.status;
    is_eligible := (v_review.eligibility_snapshot_json->>'is_eligible')::boolean;
    blocking_reasons_json := v_review.blocking_reasons_json;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_ownership_completion_review(
  p_credit_account_id uuid,
  p_completion_metadata_json jsonb DEFAULT '{}'::jsonb,
  p_trigger_reason text DEFAULT NULL,
  p_review_due_at timestamptz DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.ownership_completion_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.credit_accounts%ROWTYPE;
  v_review public.ownership_completion_reviews%ROWTYPE;
  v_existing public.ownership_completion_reviews%ROWTYPE;
  v_snapshot jsonb;
  v_before jsonb;
BEGIN
  IF NOT public.has_ownership_completion_permission('ownership.review') THEN
    RAISE EXCEPTION 'forbidden: ownership.review required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
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
  FROM public.ownership_completion_reviews
  WHERE customer_id = v_account.customer_id
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  IF v_account.asset_id IS NULL THEN
    RAISE EXCEPTION 'financed asset is required for ownership completion';
  END IF;

  SELECT * INTO v_existing
  FROM public.ownership_completion_reviews r
  WHERE r.credit_account_id = v_account.credit_account_id
    AND r.status = 'COMPLETED'
  ORDER BY r.completed_at DESC NULLS LAST, r.created_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  v_snapshot := public.ownership_completion_eligibility_snapshot(v_account.credit_account_id, COALESCE(p_completion_metadata_json, '{}'::jsonb));
  IF NOT COALESCE((v_snapshot->>'is_eligible')::boolean, false) THEN
    SELECT * INTO v_existing
    FROM public.ownership_completion_reviews r
    WHERE r.credit_account_id = v_account.credit_account_id
      AND r.status NOT IN ('COMPLETED','REVERSED','CANCELLED')
    ORDER BY r.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      v_before := to_jsonb(v_existing);
      UPDATE public.ownership_completion_reviews
      SET status = 'NOT_ELIGIBLE',
          eligibility_snapshot_json = v_snapshot,
          blocking_reasons_json = COALESCE(v_snapshot->'blocking_reasons', '[]'::jsonb),
          obligation_summary_json = COALESCE(v_snapshot->'obligations', '{}'::jsonb),
          completion_metadata_json = COALESCE(p_completion_metadata_json, '{}'::jsonb),
          product_rules_snapshot_json = COALESCE(v_snapshot->'rules_snapshot', '{}'::jsonb),
          eligibility_checked_at = now(),
          updated_by = auth.uid()
      WHERE review_id = v_existing.review_id
      RETURNING * INTO v_review;
    ELSE
      INSERT INTO public.ownership_completion_reviews (
        customer_id, credit_account_id, driver_id, asset_id, product_id, product_version_id,
        status, eligibility_snapshot_json, blocking_reasons_json, obligation_summary_json,
        completion_metadata_json, product_rules_snapshot_json, created_by, updated_by,
        idempotency_key, request_hash
      )
      VALUES (
        v_account.customer_id, v_account.credit_account_id, v_account.driver_id, v_account.asset_id,
        v_account.product_id, v_account.product_version_id, 'NOT_ELIGIBLE', v_snapshot,
        COALESCE(v_snapshot->'blocking_reasons', '[]'::jsonb),
        COALESCE(v_snapshot->'obligations', '{}'::jsonb),
        COALESCE(p_completion_metadata_json, '{}'::jsonb),
        COALESCE(v_snapshot->'rules_snapshot', '{}'::jsonb),
        auth.uid(), auth.uid(), p_idempotency_key, p_request_hash
      )
      RETURNING * INTO v_review;
      v_before := '{}'::jsonb;
    END IF;

    PERFORM public.ownership_completion_audit(
      v_review.customer_id, v_review.review_id, v_review.credit_account_id, v_review.asset_id,
      'COMPLETION_ELIGIBILITY_CHECKED', COALESCE(v_before, '{}'::jsonb), to_jsonb(v_review),
      COALESCE(p_trigger_reason, 'ownership completion review blocked by eligibility'),
      p_idempotency_key || ':not-eligible', p_request_hash
    );

    RETURN v_review;
  END IF;

  SELECT * INTO v_existing
  FROM public.ownership_completion_reviews r
  WHERE r.credit_account_id = v_account.credit_account_id
    AND r.status NOT IN ('COMPLETED','REVERSED','CANCELLED')
  ORDER BY r.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_before := to_jsonb(v_existing);
    UPDATE public.ownership_completion_reviews
    SET status = 'UNDER_COMPLETION_REVIEW',
        eligibility_snapshot_json = v_snapshot,
        blocking_reasons_json = COALESCE(v_snapshot->'blocking_reasons', '[]'::jsonb),
        obligation_summary_json = COALESCE(v_snapshot->'obligations', '{}'::jsonb),
        completion_metadata_json = COALESCE(p_completion_metadata_json, '{}'::jsonb),
        product_rules_snapshot_json = COALESCE(v_snapshot->'rules_snapshot', '{}'::jsonb),
        opened_at = COALESCE(opened_at, now()),
        review_due_at = p_review_due_at,
        assigned_reviewer = COALESCE(assigned_reviewer, auth.uid()),
        eligibility_checked_at = now(),
        updated_by = auth.uid()
    WHERE review_id = v_existing.review_id
    RETURNING * INTO v_review;
  ELSE
    INSERT INTO public.ownership_completion_reviews (
      customer_id, credit_account_id, driver_id, asset_id, product_id, product_version_id,
      status, eligibility_snapshot_json, blocking_reasons_json, obligation_summary_json,
      completion_metadata_json, product_rules_snapshot_json, assigned_reviewer, opened_at,
      review_due_at, created_by, updated_by, idempotency_key, request_hash
    )
    VALUES (
      v_account.customer_id, v_account.credit_account_id, v_account.driver_id, v_account.asset_id,
      v_account.product_id, v_account.product_version_id, 'UNDER_COMPLETION_REVIEW', v_snapshot,
      COALESCE(v_snapshot->'blocking_reasons', '[]'::jsonb),
      COALESCE(v_snapshot->'obligations', '{}'::jsonb),
      COALESCE(p_completion_metadata_json, '{}'::jsonb),
      COALESCE(v_snapshot->'rules_snapshot', '{}'::jsonb),
      auth.uid(), now(), p_review_due_at, auth.uid(), auth.uid(),
      p_idempotency_key, p_request_hash
    )
    RETURNING * INTO v_review;
    v_before := '{}'::jsonb;
  END IF;

  PERFORM public.ownership_completion_audit(
    v_review.customer_id, v_review.review_id, v_review.credit_account_id, v_review.asset_id,
    'COMPLETION_REVIEW_OPENED', COALESCE(v_before, '{}'::jsonb), to_jsonb(v_review),
    COALESCE(p_trigger_reason, 'ownership completion review opened'),
    p_idempotency_key, p_request_hash
  );

  RETURN v_review;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_ownership_completion_review(
  p_review_id uuid,
  p_assigned_to uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.ownership_completion_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.ownership_completion_reviews%ROWTYPE;
  v_before jsonb;
  v_existing_audit uuid;
  v_assigned_to uuid;
BEGIN
  IF NOT public.has_ownership_completion_permission('ownership.review') THEN
    RAISE EXCEPTION 'forbidden: ownership.review required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT r.* INTO v_review
  FROM public.ownership_completion_reviews r
  WHERE r.review_id = p_review_id
    AND r.status IN ('ELIGIBLE_FOR_COMPLETION','UNDER_COMPLETION_REVIEW','AWAITING_FINAL_APPROVAL')
    AND (public.is_platform_owner() OR r.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'open ownership completion review not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT audit_event_id INTO v_existing_audit
  FROM public.ownership_completion_audit_events
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
  UPDATE public.ownership_completion_reviews
  SET assigned_reviewer = v_assigned_to,
      status = CASE
        WHEN ownership_completion_reviews.status = 'ELIGIBLE_FOR_COMPLETION' THEN 'UNDER_COMPLETION_REVIEW'
        ELSE ownership_completion_reviews.status
      END,
      opened_at = COALESCE(opened_at, now()),
      updated_by = auth.uid()
  WHERE review_id = v_review.review_id
  RETURNING * INTO v_review;

  PERFORM public.ownership_completion_audit(
    v_review.customer_id, v_review.review_id, v_review.credit_account_id, v_review.asset_id,
    'COMPLETION_REVIEW_ASSIGNED', v_before, to_jsonb(v_review),
    COALESCE(NULLIF(trim(p_note), ''), 'Ownership completion review assigned'),
    p_idempotency_key, p_request_hash
  );

  RETURN v_review;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_ownership_completion_decision(
  p_review_id uuid,
  p_decision text,
  p_decision_reason text,
  p_decision_summary text DEFAULT NULL,
  p_second_approver_id uuid DEFAULT NULL,
  p_decision_metadata_json jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.ownership_completion_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.ownership_completion_reviews%ROWTYPE;
  v_decision public.ownership_completion_decisions%ROWTYPE;
  v_before jsonb;
  v_snapshot jsonb;
  v_next_status text;
BEGIN
  IF NOT public.has_ownership_completion_permission(CASE WHEN p_decision = 'APPROVE_COMPLETION' THEN 'ownership.complete' ELSE 'ownership.review' END) THEN
    RAISE EXCEPTION 'forbidden: ownership decision permission required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;
  IF p_decision_reason IS NULL OR length(trim(p_decision_reason)) < 5 THEN
    RAISE EXCEPTION 'decision reason is required';
  END IF;

  SELECT r.* INTO v_review
  FROM public.ownership_completion_reviews r
  WHERE r.review_id = p_review_id
    AND r.status IN ('ELIGIBLE_FOR_COMPLETION','UNDER_COMPLETION_REVIEW','AWAITING_FINAL_APPROVAL')
    AND (public.is_platform_owner() OR r.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'open ownership completion review not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_decision
  FROM public.ownership_completion_decisions
  WHERE customer_id = v_review.customer_id
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_decision;
  END IF;

  IF p_decision = 'APPROVE_COMPLETION' THEN
    v_snapshot := public.ownership_completion_eligibility_snapshot(v_review.credit_account_id, v_review.completion_metadata_json);
    IF NOT COALESCE((v_snapshot->>'is_eligible')::boolean, false) THEN
      RAISE EXCEPTION 'ownership completion is no longer eligible: %', COALESCE(v_snapshot->'blocking_reasons', '[]'::jsonb);
    END IF;
    IF p_second_approver_id IS NOT NULL AND p_second_approver_id = auth.uid() THEN
      RAISE EXCEPTION 'second approver must be different from approver';
    END IF;
  END IF;

  INSERT INTO public.ownership_completion_decisions (
    customer_id, review_id, credit_account_id, decision, decision_reason,
    decision_summary, decided_by, second_approver_id, decision_metadata_json,
    idempotency_key, request_hash
  )
  VALUES (
    v_review.customer_id, v_review.review_id, v_review.credit_account_id,
    p_decision, trim(p_decision_reason), p_decision_summary, auth.uid(),
    p_second_approver_id, COALESCE(p_decision_metadata_json, '{}'::jsonb),
    p_idempotency_key, p_request_hash
  )
  RETURNING * INTO v_decision;

  v_next_status := CASE p_decision
    WHEN 'APPROVE_COMPLETION' THEN 'AWAITING_FINAL_APPROVAL'
    WHEN 'REJECT_COMPLETION' THEN 'CANCELLED'
    WHEN 'REQUEST_REVIEW' THEN 'UNDER_COMPLETION_REVIEW'
    WHEN 'ESCALATE' THEN 'AWAITING_FINAL_APPROVAL'
    ELSE v_review.status
  END;

  v_before := to_jsonb(v_review);
  UPDATE public.ownership_completion_reviews
  SET status = v_next_status,
      eligibility_snapshot_json = CASE WHEN p_decision = 'APPROVE_COMPLETION' THEN v_snapshot ELSE eligibility_snapshot_json END,
      blocking_reasons_json = CASE WHEN p_decision = 'APPROVE_COMPLETION' THEN COALESCE(v_snapshot->'blocking_reasons', '[]'::jsonb) ELSE blocking_reasons_json END,
      obligation_summary_json = CASE WHEN p_decision = 'APPROVE_COMPLETION' THEN COALESCE(v_snapshot->'obligations', '{}'::jsonb) ELSE obligation_summary_json END,
      cancelled_at = CASE WHEN v_next_status = 'CANCELLED' THEN now() ELSE cancelled_at END,
      closure_reason = CASE WHEN v_next_status = 'CANCELLED' THEN trim(p_decision_reason) ELSE closure_reason END,
      updated_by = auth.uid()
  WHERE review_id = v_review.review_id
  RETURNING * INTO v_review;

  PERFORM public.ownership_completion_audit(
    v_review.customer_id, v_review.review_id, v_review.credit_account_id, v_review.asset_id,
    CASE p_decision
      WHEN 'APPROVE_COMPLETION' THEN 'COMPLETION_APPROVED'
      WHEN 'REJECT_COMPLETION' THEN 'COMPLETION_REJECTED'
      WHEN 'REQUEST_REVIEW' THEN 'COMPLETION_REVIEW_REQUESTED'
      WHEN 'ESCALATE' THEN 'COMPLETION_ESCALATED'
      ELSE 'COMPLETION_DECISION_CREATED'
    END,
    v_before, jsonb_build_object('review', to_jsonb(v_review), 'decision', to_jsonb(v_decision)),
    p_decision_reason, p_idempotency_key, p_request_hash
  );

  RETURN v_decision;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_ownership_certificate(
  p_review_id uuid,
  p_document_reference text DEFAULT NULL,
  p_transfer_type text DEFAULT 'OWNERSHIP_TRANSFER',
  p_certificate_metadata_json jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.ownership_certificates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.ownership_completion_reviews%ROWTYPE;
  v_account public.credit_accounts%ROWTYPE;
  v_asset public.financed_assets%ROWTYPE;
  v_decision public.ownership_completion_decisions%ROWTYPE;
  v_transfer public.asset_transfer_records%ROWTYPE;
  v_certificate public.ownership_certificates%ROWTYPE;
  v_existing_audit uuid;
  v_snapshot jsonb;
  v_before jsonb;
  v_before_account jsonb;
  v_before_asset jsonb;
  v_certificate_number text;
BEGIN
  IF NOT public.has_ownership_completion_permission('ownership.certificate') THEN
    RAISE EXCEPTION 'forbidden: ownership.certificate required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;
  IF p_transfer_type NOT IN ('OWNERSHIP_TRANSFER','TITLE_RELEASE','ASSET_RELEASE','DIGITAL_ASSET_TRANSFER') THEN
    RAISE EXCEPTION 'invalid transfer type';
  END IF;

  SELECT r.* INTO v_review
  FROM public.ownership_completion_reviews r
  WHERE r.review_id = p_review_id
    AND (public.is_platform_owner() OR r.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ownership completion review not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_certificate
  FROM public.ownership_certificates
  WHERE customer_id = v_review.customer_id
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_certificate;
  END IF;

  SELECT audit_event_id INTO v_existing_audit
  FROM public.ownership_completion_audit_events
  WHERE customer_id = v_review.customer_id
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    SELECT c.* INTO v_certificate
    FROM public.ownership_certificates c
    WHERE c.review_id = v_review.review_id
    ORDER BY c.issued_at DESC
    LIMIT 1;
    IF FOUND THEN
      RETURN v_certificate;
    END IF;
  END IF;

  IF v_review.status = 'COMPLETED' THEN
    SELECT c.* INTO v_certificate
    FROM public.ownership_certificates c
    WHERE c.review_id = v_review.review_id
      AND c.certificate_status = 'ISSUED'
    ORDER BY c.issued_at DESC
    LIMIT 1;
    IF FOUND THEN
      RETURN v_certificate;
    END IF;
  END IF;

  IF v_review.status <> 'AWAITING_FINAL_APPROVAL' THEN
    RAISE EXCEPTION 'ownership completion must be awaiting final approval before certificate issuance';
  END IF;

  SELECT * INTO v_decision
  FROM public.ownership_completion_decisions
  WHERE review_id = v_review.review_id
    AND decision = 'APPROVE_COMPLETION'
  ORDER BY decision_timestamp DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval decision is required before certificate issuance';
  END IF;

  v_snapshot := public.ownership_completion_eligibility_snapshot(v_review.credit_account_id, v_review.completion_metadata_json);
  IF NOT COALESCE((v_snapshot->>'is_eligible')::boolean, false) THEN
    RAISE EXCEPTION 'ownership completion is no longer eligible: %', COALESCE(v_snapshot->'blocking_reasons', '[]'::jsonb);
  END IF;

  SELECT * INTO v_account
  FROM public.credit_accounts
  WHERE credit_account_id = v_review.credit_account_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit account not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_asset
  FROM public.financed_assets
  WHERE asset_id = v_review.asset_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'financed asset not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.asset_transfer_records (
    customer_id, review_id, decision_id, credit_account_id, driver_id, asset_id,
    transfer_status, transfer_type, approved_by, completed_at, transfer_metadata_json,
    idempotency_key, request_hash
  )
  VALUES (
    v_review.customer_id, v_review.review_id, v_decision.decision_id,
    v_review.credit_account_id, v_review.driver_id, v_review.asset_id,
    'COMPLETED', p_transfer_type, auth.uid(), now(),
    jsonb_build_object(
      'eligibility_snapshot', v_snapshot,
      'certificate_metadata', COALESCE(p_certificate_metadata_json, '{}'::jsonb),
      'financial_engine_note', 'Layer 3G does not modify ledger, invoice, or payment rows.'
    ),
    p_idempotency_key || ':transfer', p_request_hash
  )
  RETURNING * INTO v_transfer;

  v_certificate_number := public.ownership_certificate_number(v_review.customer_id, v_review.credit_account_id, v_review.asset_id);

  INSERT INTO public.ownership_certificates (
    customer_id, transfer_id, review_id, credit_account_id, driver_id, asset_id,
    certificate_number, certificate_status, document_reference, issued_by,
    certificate_metadata_json, idempotency_key, request_hash
  )
  VALUES (
    v_review.customer_id, v_transfer.transfer_id, v_review.review_id,
    v_review.credit_account_id, v_review.driver_id, v_review.asset_id,
    v_certificate_number, 'ISSUED', p_document_reference, auth.uid(),
    COALESCE(p_certificate_metadata_json, '{}'::jsonb),
    p_idempotency_key, p_request_hash
  )
  RETURNING * INTO v_certificate;

  v_before_account := to_jsonb(v_account);
  UPDATE public.credit_accounts
  SET status = 'COMPLETED',
      status_changed_at = now()
  WHERE credit_account_id = v_account.credit_account_id
  RETURNING * INTO v_account;

  v_before_asset := to_jsonb(v_asset);
  UPDATE public.financed_assets
  SET possession_status = 'RELEASED',
      updated_by = auth.uid()
  WHERE asset_id = v_asset.asset_id
  RETURNING * INTO v_asset;

  v_before := to_jsonb(v_review);
  UPDATE public.ownership_completion_reviews
  SET status = 'COMPLETED',
      eligibility_snapshot_json = v_snapshot,
      blocking_reasons_json = COALESCE(v_snapshot->'blocking_reasons', '[]'::jsonb),
      obligation_summary_json = COALESCE(v_snapshot->'obligations', '{}'::jsonb),
      completed_at = now(),
      updated_by = auth.uid()
  WHERE review_id = v_review.review_id
  RETURNING * INTO v_review;

  PERFORM public.ownership_completion_audit(
    v_review.customer_id, v_review.review_id, v_review.credit_account_id, v_review.asset_id,
    'ASSET_TRANSFERRED',
    jsonb_build_object('review', v_before, 'account', v_before_account, 'asset', v_before_asset),
    jsonb_build_object('review', to_jsonb(v_review), 'account', to_jsonb(v_account), 'asset', to_jsonb(v_asset), 'transfer', to_jsonb(v_transfer)),
    'asset transfer completed for ownership completion',
    p_idempotency_key || ':transfer-audit', p_request_hash
  );

  PERFORM public.ownership_completion_audit(
    v_review.customer_id, v_review.review_id, v_review.credit_account_id, v_review.asset_id,
    'CERTIFICATE_ISSUED', '{}'::jsonb, to_jsonb(v_certificate),
    'ownership certificate issued',
    p_idempotency_key || ':certificate-audit', p_request_hash
  );

  PERFORM public.ownership_completion_audit(
    v_review.customer_id, v_review.review_id, v_review.credit_account_id, v_review.asset_id,
    'OWNERSHIP_COMPLETED', v_before, to_jsonb(v_review),
    'ownership completion finalized',
    p_idempotency_key, p_request_hash
  );

  RETURN v_certificate;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_ownership_completion(
  p_review_id uuid,
  p_reason text,
  p_second_approver_id uuid,
  p_reopened_account_status text DEFAULT 'ACTIVE',
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.ownership_completion_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.ownership_completion_reviews%ROWTYPE;
  v_account public.credit_accounts%ROWTYPE;
  v_asset public.financed_assets%ROWTYPE;
  v_transfer public.asset_transfer_records%ROWTYPE;
  v_reversal_transfer public.asset_transfer_records%ROWTYPE;
  v_existing_audit uuid;
  v_before_review jsonb;
  v_before_account jsonb;
  v_before_asset jsonb;
  v_before_transfer jsonb;
BEGIN
  IF NOT public.has_ownership_completion_permission('ownership.reverse') THEN
    RAISE EXCEPTION 'forbidden: ownership.reverse required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reversal reason is required';
  END IF;
  IF p_second_approver_id IS NULL OR p_second_approver_id = auth.uid() THEN
    RAISE EXCEPTION 'a distinct second approver is required for ownership reversal';
  END IF;
  IF p_reopened_account_status NOT IN ('ACTIVE','PAST_DUE','SUSPENDED','COMPLETED','DEFAULTED','TERMINATED') THEN
    RAISE EXCEPTION 'invalid post-reversal account status';
  END IF;

  SELECT r.* INTO v_review
  FROM public.ownership_completion_reviews r
  WHERE r.review_id = p_review_id
    AND (public.is_platform_owner() OR r.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ownership completion review not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT audit_event_id INTO v_existing_audit
  FROM public.ownership_completion_audit_events
  WHERE customer_id = v_review.customer_id
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_review;
  END IF;

  IF v_review.status = 'REVERSED' THEN
    RETURN v_review;
  END IF;
  IF v_review.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'only completed ownership reviews can be reversed';
  END IF;

  SELECT * INTO v_transfer
  FROM public.asset_transfer_records
  WHERE review_id = v_review.review_id
    AND transfer_type = 'OWNERSHIP_TRANSFER'
    AND transfer_status = 'COMPLETED'
  ORDER BY completed_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT * INTO v_transfer
    FROM public.asset_transfer_records
    WHERE review_id = v_review.review_id
      AND transfer_status = 'COMPLETED'
    ORDER BY completed_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'completed transfer record is required for reversal';
  END IF;

  SELECT * INTO v_account
  FROM public.credit_accounts
  WHERE credit_account_id = v_review.credit_account_id
  FOR UPDATE;

  SELECT * INTO v_asset
  FROM public.financed_assets
  WHERE asset_id = v_review.asset_id
  FOR UPDATE;

  v_before_transfer := to_jsonb(v_transfer);
  UPDATE public.asset_transfer_records
  SET transfer_status = 'REVERSED',
      reversed_at = now(),
      reversal_reason = trim(p_reason)
  WHERE transfer_id = v_transfer.transfer_id
  RETURNING * INTO v_transfer;

  INSERT INTO public.asset_transfer_records (
    customer_id, review_id, decision_id, credit_account_id, driver_id, asset_id,
    transfer_status, transfer_type, approved_by, completed_at, transfer_metadata_json,
    idempotency_key, request_hash
  )
  VALUES (
    v_review.customer_id, v_review.review_id, NULL, v_review.credit_account_id,
    v_review.driver_id, v_review.asset_id, 'COMPLETED', 'ASSET_RELEASE',
    auth.uid(), now(),
    jsonb_build_object(
      'reversal', true,
      'reversed_transfer_id', v_transfer.transfer_id,
      'second_approver_id', p_second_approver_id,
      'reason', trim(p_reason)
    ),
    p_idempotency_key || ':compensating-transfer',
    p_request_hash
  )
  RETURNING * INTO v_reversal_transfer;

  v_before_account := to_jsonb(v_account);
  UPDATE public.credit_accounts
  SET status = p_reopened_account_status,
      status_changed_at = now()
  WHERE credit_account_id = v_account.credit_account_id
  RETURNING * INTO v_account;

  v_before_asset := to_jsonb(v_asset);
  UPDATE public.financed_assets
  SET possession_status = CASE WHEN possession_status = 'RELEASED' THEN 'CONFIRMED' ELSE possession_status END,
      updated_by = auth.uid()
  WHERE asset_id = v_asset.asset_id
  RETURNING * INTO v_asset;

  v_before_review := to_jsonb(v_review);
  UPDATE public.ownership_completion_reviews
  SET status = 'REVERSED',
      reversed_at = now(),
      closure_reason = trim(p_reason),
      updated_by = auth.uid()
  WHERE review_id = v_review.review_id
  RETURNING * INTO v_review;

  PERFORM public.ownership_completion_audit(
    v_review.customer_id, v_review.review_id, v_review.credit_account_id, v_review.asset_id,
    'COMPLETION_REVERSED',
    jsonb_build_object('review', v_before_review, 'account', v_before_account, 'asset', v_before_asset, 'transfer', v_before_transfer),
    jsonb_build_object('review', to_jsonb(v_review), 'account', to_jsonb(v_account), 'asset', to_jsonb(v_asset), 'transfer', to_jsonb(v_transfer), 'compensating_transfer', to_jsonb(v_reversal_transfer), 'second_approver_id', p_second_approver_id),
    p_reason, p_idempotency_key, p_request_hash
  );

  RETURN v_review;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_driver_ownership_completion_status()
RETURNS TABLE (
  review_id uuid,
  credit_account_id uuid,
  asset_id uuid,
  asset_type text,
  product_name text,
  status text,
  status_label text,
  status_tone text,
  ownership_date timestamptz,
  certificate_id uuid,
  certificate_number text,
  certificate_document_reference text,
  transfer_id uuid,
  blocking_reasons_json jsonb,
  progress_json jsonb,
  driver_message text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.review_id,
    r.credit_account_id,
    r.asset_id,
    fa.asset_type,
    cp.name AS product_name,
    lower(r.status) AS status,
    public.ownership_completion_status_label(r.status) AS status_label,
    CASE
      WHEN r.status = 'COMPLETED' THEN 'success'
      WHEN r.status IN ('ELIGIBLE_FOR_COMPLETION','UNDER_COMPLETION_REVIEW','AWAITING_FINAL_APPROVAL') THEN 'info'
      WHEN r.status IN ('REVERSED','CANCELLED') THEN 'warning'
      ELSE 'neutral'
    END AS status_tone,
    r.completed_at AS ownership_date,
    cert.certificate_id,
    cert.certificate_number,
    cert.document_reference AS certificate_document_reference,
    transfer.transfer_id,
    r.blocking_reasons_json,
    jsonb_build_object(
      'eligible', COALESCE((r.eligibility_snapshot_json->>'is_eligible')::boolean, false),
      'obligations', r.obligation_summary_json,
      'checked_at', r.eligibility_checked_at,
      'opened_at', r.opened_at,
      'completed_at', r.completed_at
    ) AS progress_json,
    CASE
      WHEN r.status = 'COMPLETED' THEN 'Felicitations. Vous etes desormais proprietaire.'
      WHEN r.status = 'AWAITING_FINAL_APPROVAL' THEN 'Votre transfert de propriete attend la validation finale.'
      WHEN r.status = 'UNDER_COMPLETION_REVIEW' THEN 'Votre dossier de propriete est en verification.'
      WHEN r.status = 'ELIGIBLE_FOR_COMPLETION' THEN 'Votre dossier est pret pour la verification de propriete.'
      WHEN r.status = 'NOT_ELIGIBLE' THEN 'Votre progression continue. La propriete sera verifiee quand toutes les conditions seront remplies.'
      ELSE 'Votre statut de propriete est suivi par l''equipe DAM.'
    END AS driver_message
  FROM public.ownership_completion_reviews r
  JOIN public.financed_assets fa ON fa.asset_id = r.asset_id
  JOIN public.credit_products cp ON cp.product_id = r.product_id
  LEFT JOIN LATERAL (
    SELECT c.*
    FROM public.ownership_certificates c
    WHERE c.review_id = r.review_id
      AND c.certificate_status = 'ISSUED'
    ORDER BY c.issued_at DESC
    LIMIT 1
  ) cert ON true
  LEFT JOIN LATERAL (
    SELECT t.*
    FROM public.asset_transfer_records t
    WHERE t.review_id = r.review_id
      AND t.transfer_status IN ('COMPLETED','REVERSED')
    ORDER BY t.completed_at DESC NULLS LAST, t.created_at DESC
    LIMIT 1
  ) transfer ON true
  WHERE r.driver_id = public.current_driver_id()
  ORDER BY r.created_at DESC;
$$;

CREATE OR REPLACE VIEW public.v_ownership_completion_queue AS
SELECT
  r.review_id,
  r.review_id AS completion_review_id,
  r.customer_id,
  r.credit_account_id,
  r.driver_id,
  d.full_name AS driver_name,
  d.phone_number AS driver_phone,
  r.asset_id,
  fa.asset_type,
  fa.description AS asset_description,
  fa.serial_number,
  fa.vin,
  fa.imei,
  r.product_id,
  cp.product_type,
  cp.name AS product_name,
  r.product_version_id,
  r.status,
  r.status AS completion_status,
  public.ownership_completion_status_label(r.status) AS status_label,
  COALESCE((r.eligibility_snapshot_json->>'is_eligible')::boolean, false) AS is_eligible,
  r.blocking_reasons_json,
  r.blocking_reasons_json AS blocked_reasons_json,
  jsonb_array_length(r.blocking_reasons_json) AS blocker_count,
  r.obligation_summary_json,
  COALESCE((r.obligation_summary_json->>'outstanding_balance')::integer, 0) AS outstanding_balance,
  COALESCE((r.obligation_summary_json->>'paid_obligation_count')::integer, 0) AS paid_obligations_count,
  COALESCE((r.obligation_summary_json->>'obligation_count')::integer, 0) AS total_obligations_count,
  COALESCE(r.obligation_summary_json->>'currency_code', ca.principal_currency_code, 'XOF') AS currency_code,
  CASE WHEN COALESCE((r.eligibility_snapshot_json #>> '{documents,documents_complete}')::boolean, false) THEN 'COMPLETE' ELSE 'INCOMPLETE' END AS documentation_status,
  CASE WHEN COALESCE((r.eligibility_snapshot_json #>> '{product_completion,product_completion_rules_satisfied}')::boolean, false) THEN 'COMPLETE' ELSE 'INCOMPLETE' END AS product_rules_status,
  CASE WHEN COALESCE((r.eligibility_snapshot_json #>> '{holds,active_default_count}')::integer, 0) > 0 THEN 'ACTIVE' ELSE 'NONE' END AS default_review_status,
  CASE WHEN COALESCE((r.eligibility_snapshot_json #>> '{holds,active_recovery_count}')::integer, 0) > 0 THEN 'ACTIVE' ELSE 'NONE' END AS recovery_plan_status,
  CASE WHEN COALESCE((r.eligibility_snapshot_json #>> '{holds,fraud_hold}')::boolean, false) THEN 'ACTIVE' ELSE 'NONE' END AS fraud_review_status,
  CASE WHEN COALESCE((r.eligibility_snapshot_json #>> '{holds,legal_hold}')::boolean, false) THEN 'ACTIVE' ELSE 'NONE' END AS legal_hold_status,
  r.assigned_reviewer,
  latest_decision.decision_id AS latest_decision_id,
  latest_decision.decision AS latest_decision,
  latest_decision.decision_timestamp,
  transfer.transfer_id,
  transfer.transfer_status,
  transfer.transfer_type,
  cert.certificate_id,
  cert.certificate_number,
  cert.issued_at AS certificate_issued_at,
  r.opened_at,
  r.review_due_at,
  r.completed_at,
  r.reversed_at,
  r.cancelled_at,
  r.closure_reason,
  r.eligibility_checked_at,
  r.status_changed_at,
  r.created_at,
  r.updated_at,
  CASE
    WHEN r.status = 'ELIGIBLE_FOR_COMPLETION' THEN 100
    WHEN r.status = 'AWAITING_FINAL_APPROVAL' THEN 90
    WHEN r.status = 'UNDER_COMPLETION_REVIEW' THEN 80
    WHEN jsonb_array_length(r.blocking_reasons_json) > 0 THEN 20
    ELSE 10
  END AS priority_score
FROM public.ownership_completion_reviews r
JOIN public.drivers d ON d.id = r.driver_id
JOIN public.financed_assets fa ON fa.asset_id = r.asset_id
JOIN public.credit_products cp ON cp.product_id = r.product_id
JOIN public.credit_accounts ca ON ca.credit_account_id = r.credit_account_id
LEFT JOIN LATERAL (
  SELECT d2.*
  FROM public.ownership_completion_decisions d2
  WHERE d2.review_id = r.review_id
  ORDER BY d2.decision_timestamp DESC
  LIMIT 1
) latest_decision ON true
LEFT JOIN LATERAL (
  SELECT t.*
  FROM public.asset_transfer_records t
  WHERE t.review_id = r.review_id
  ORDER BY t.created_at DESC
  LIMIT 1
) transfer ON true
LEFT JOIN LATERAL (
  SELECT c.*
  FROM public.ownership_certificates c
  WHERE c.review_id = r.review_id
  ORDER BY c.issued_at DESC
  LIMIT 1
) cert ON true
WHERE public.has_ownership_completion_permission('ownership.view')
  AND (
    public.is_platform_owner()
    OR r.customer_id = public.current_customer_id()
    OR COALESCE(auth.role(), '') = 'service_role'
  );

CREATE OR REPLACE VIEW public.v_driver_ownership_completion_status AS
SELECT
  r.review_id,
  r.credit_account_id,
  r.asset_id,
  fa.asset_type,
  fa.description AS asset_description,
  cp.name AS product_name,
  lower(r.status) AS status,
  public.ownership_completion_status_label(r.status) AS status_label,
  CASE
    WHEN r.status = 'COMPLETED' THEN 'success'
    WHEN r.status IN ('ELIGIBLE_FOR_COMPLETION','UNDER_COMPLETION_REVIEW','AWAITING_FINAL_APPROVAL') THEN 'info'
    WHEN r.status IN ('REVERSED','CANCELLED') THEN 'warning'
    ELSE 'neutral'
  END AS status_tone,
  r.completed_at AS ownership_date,
  cert.certificate_id,
  cert.certificate_number,
  cert.document_reference AS certificate_document_reference,
  transfer.transfer_id,
  transfer.transfer_status,
  r.blocking_reasons_json,
  r.obligation_summary_json,
  r.eligibility_checked_at,
  r.opened_at,
  r.created_at
FROM public.ownership_completion_reviews r
JOIN public.financed_assets fa ON fa.asset_id = r.asset_id
JOIN public.credit_products cp ON cp.product_id = r.product_id
LEFT JOIN LATERAL (
  SELECT c.*
  FROM public.ownership_certificates c
  WHERE c.review_id = r.review_id
    AND c.certificate_status = 'ISSUED'
  ORDER BY c.issued_at DESC
  LIMIT 1
) cert ON true
LEFT JOIN LATERAL (
  SELECT t.*
  FROM public.asset_transfer_records t
  WHERE t.review_id = r.review_id
    AND t.transfer_status IN ('COMPLETED','REVERSED')
  ORDER BY t.completed_at DESC NULLS LAST, t.created_at DESC
  LIMIT 1
) transfer ON true
WHERE r.driver_id = public.current_driver_id();

CREATE OR REPLACE VIEW public.v_ownership_completion_exceptions AS
WITH completed_without_certificate AS (
  SELECT
    r.customer_id,
    r.review_id,
    r.credit_account_id,
    r.asset_id,
    'CRITICAL'::text AS severity,
    'COMPLETED_WITHOUT_CERTIFICATE'::text AS exception_type,
    jsonb_build_object('status', r.status, 'completed_at', r.completed_at) AS details_json
  FROM public.ownership_completion_reviews r
  WHERE r.status = 'COMPLETED'
    AND NOT EXISTS (
      SELECT 1
      FROM public.ownership_certificates c
      WHERE c.review_id = r.review_id
        AND c.certificate_status = 'ISSUED'
    )
),
completed_without_transfer AS (
  SELECT
    r.customer_id,
    r.review_id,
    r.credit_account_id,
    r.asset_id,
    'CRITICAL'::text AS severity,
    'COMPLETED_WITHOUT_TRANSFER'::text AS exception_type,
    jsonb_build_object('status', r.status, 'completed_at', r.completed_at) AS details_json
  FROM public.ownership_completion_reviews r
  WHERE r.status = 'COMPLETED'
    AND NOT EXISTS (
      SELECT 1
      FROM public.asset_transfer_records t
      WHERE t.review_id = r.review_id
        AND t.transfer_status = 'COMPLETED'
    )
),
eligible_with_blocks AS (
  SELECT
    r.customer_id,
    r.review_id,
    r.credit_account_id,
    r.asset_id,
    'WARNING'::text AS severity,
    'ELIGIBLE_STATUS_WITH_BLOCKING_REASONS'::text AS exception_type,
    jsonb_build_object('blocking_reasons', r.blocking_reasons_json) AS details_json
  FROM public.ownership_completion_reviews r
  WHERE r.status IN ('ELIGIBLE_FOR_COMPLETION','UNDER_COMPLETION_REVIEW','AWAITING_FINAL_APPROVAL')
    AND jsonb_array_length(r.blocking_reasons_json) > 0
)
SELECT gen_random_uuid() AS exception_id, e.*, now() AS detected_at
FROM completed_without_certificate e
WHERE public.has_ownership_completion_permission('ownership.audit')
  AND (public.is_platform_owner() OR e.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
UNION ALL
SELECT gen_random_uuid(), e.*, now()
FROM completed_without_transfer e
WHERE public.has_ownership_completion_permission('ownership.audit')
  AND (public.is_platform_owner() OR e.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role')
UNION ALL
SELECT gen_random_uuid(), e.*, now()
FROM eligible_with_blocks e
WHERE public.has_ownership_completion_permission('ownership.audit')
  AND (public.is_platform_owner() OR e.customer_id = public.current_customer_id() OR COALESCE(auth.role(), '') = 'service_role');

GRANT SELECT ON public.v_ownership_completion_queue TO authenticated, service_role;
GRANT SELECT ON public.v_driver_ownership_completion_status TO authenticated, service_role;
GRANT SELECT ON public.v_ownership_completion_exceptions TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.default_ownership_completion_rules() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_ownership_completion_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ownership_jsonb_bool(jsonb, jsonb, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ownership_completion_rules_for_account(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ownership_completion_status_label(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ownership_certificate_number(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ownership_completion_eligibility_snapshot(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_ownership_completion_candidates(uuid, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_ownership_completion_review(uuid, jsonb, text, timestamptz, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_ownership_completion_review(uuid, uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_ownership_completion_decision(uuid, text, text, text, uuid, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_ownership_certificate(uuid, text, text, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_ownership_completion(uuid, text, uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_driver_ownership_completion_status() TO authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ownership_completion_reviews',
    'ownership_completion_decisions',
    'asset_transfer_records',
    'ownership_certificates',
    'ownership_completion_audit_events'
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

COMMENT ON TABLE public.ownership_completion_reviews IS 'Layer 3G human-reviewed ownership completion workflow. Completion is never automatic.';
COMMENT ON TABLE public.ownership_completion_decisions IS 'Layer 3G immutable reviewer decisions for ownership completion.';
COMMENT ON TABLE public.asset_transfer_records IS 'Layer 3G asset/title/digital transfer records created during completion and reversal.';
COMMENT ON TABLE public.ownership_certificates IS 'Layer 3G immutable ownership certificate records; reversal creates compensating audit, not certificate mutation.';
COMMENT ON TABLE public.ownership_completion_audit_events IS 'Layer 3G immutable audit trail for eligibility, review, transfer, certificate, completion, and reversal actions.';

NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_version text := '20260618130000';
  v_name text := 'layer3g_ownership_completion_asset_transfer';
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
