-- ============================================================
-- Layer 3D — Repayment Schedule & Credit Account Terms Engine
-- Product-configured repayment schedules, scheduled obligations,
-- Financial Engine invoice linkage, reconciliation, and driver-safe DTOs.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.credit_accounts') IS NULL THEN
    RAISE EXCEPTION 'Layer 3D requires Layer 3A credit_accounts';
  END IF;
  IF to_regclass('public.underwriting_decisions') IS NULL THEN
    RAISE EXCEPTION 'Layer 3D requires Layer 3B underwriting_decisions';
  END IF;
  IF to_regclass('public.credit_contracts') IS NULL THEN
    RAISE EXCEPTION 'Layer 3D requires Layer 3C credit_contracts';
  END IF;
  IF to_regclass('public.invoice') IS NULL THEN
    RAISE EXCEPTION 'Layer 3D requires the Financial Engine invoice table';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_repayment_permission(permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_owner()
    OR CASE permission
      WHEN 'repayment.view' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer','support','agent_support'])
      WHEN 'repayment.generate_schedule' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer'])
      WHEN 'repayment.generate_invoice' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer'])
      WHEN 'repayment.pause' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'repayment.amend' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'repayment.audit' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'repayment.admin' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      ELSE false
    END
$$;

ALTER TABLE public.product_versions
  ADD COLUMN IF NOT EXISTS repayment_terms_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.repayment_schedules (
  schedule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  credit_account_id uuid NOT NULL REFERENCES public.credit_accounts(credit_account_id) ON DELETE RESTRICT,
  application_id uuid NOT NULL REFERENCES public.credit_applications(application_id) ON DELETE RESTRICT,
  contract_id uuid NOT NULL REFERENCES public.credit_contracts(contract_id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.credit_products(product_id) ON DELETE RESTRICT,
  product_version_id uuid NOT NULL REFERENCES public.product_versions(version_id) ON DELETE RESTRICT,
  schedule_version integer NOT NULL DEFAULT 1 CHECK (schedule_version > 0),
  schedule_status text NOT NULL DEFAULT 'DRAFT' CHECK (schedule_status IN ('DRAFT','ACTIVE','PAUSED','SUPERSEDED','COMPLETED','CANCELLED')),
  schedule_type text NOT NULL CHECK (schedule_type IN (
    'FIXED_INSTALLMENT','ZERO_INTEREST_INSTALLMENT','FLAT_FEE_INSTALLMENT',
    'BALLOON_PAYMENT','MANUAL_SCHEDULE','ONE_TIME_PAYMENT',
    'DECLINING_BALANCE','VARIABLE_INSTALLMENT','REVENUE_SHARE','RENT_TO_OWN_DAILY_CREDIT'
  )),
  currency_code text NOT NULL DEFAULT 'XOF',
  financed_amount integer NOT NULL DEFAULT 0 CHECK (financed_amount >= 0),
  total_repayment_amount integer NOT NULL DEFAULT 0 CHECK (total_repayment_amount >= 0),
  total_fees_amount integer NOT NULL DEFAULT 0 CHECK (total_fees_amount >= 0),
  total_interest_amount integer NOT NULL DEFAULT 0 CHECK (total_interest_amount >= 0),
  term_count integer NOT NULL DEFAULT 1 CHECK (term_count > 0),
  frequency text NOT NULL DEFAULT 'MONTHLY' CHECK (frequency IN ('DAILY','WEEKLY','BIWEEKLY','MONTHLY','QUARTERLY','YEARLY','ONE_TIME','MANUAL')),
  first_due_date date NOT NULL,
  final_due_date date NOT NULL,
  grace_period_days integer NOT NULL DEFAULT 0 CHECK (grace_period_days >= 0),
  invoice_generation_days_before_due integer NOT NULL DEFAULT 3 CHECK (invoice_generation_days_before_due >= 0),
  allow_prepayment boolean NOT NULL DEFAULT true,
  allow_schedule_amendment boolean NOT NULL DEFAULT true,
  generated_from_contract_hash text NOT NULL,
  generated_from_policy_snapshot_id uuid,
  terms_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  superseded_by_schedule_id uuid REFERENCES public.repayment_schedules(schedule_id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  created_by uuid,
  updated_by uuid,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT repayment_schedule_due_window CHECK (final_due_date >= first_due_date),
  CONSTRAINT repayment_schedule_totals CHECK (total_repayment_amount >= financed_amount)
);

CREATE TABLE IF NOT EXISTS public.scheduled_obligations (
  obligation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.repayment_schedules(schedule_id) ON DELETE RESTRICT,
  credit_account_id uuid NOT NULL REFERENCES public.credit_accounts(credit_account_id) ON DELETE RESTRICT,
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  obligation_type text NOT NULL CHECK (obligation_type IN ('INSTALLMENT','FINAL_PAYMENT','BALLOON_PAYMENT','SERVICE_FEE','MANUAL_ADJUSTMENT')),
  due_date date NOT NULL,
  amount integer NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency_code text NOT NULL DEFAULT 'XOF',
  principal_amount integer NOT NULL DEFAULT 0 CHECK (principal_amount >= 0),
  interest_amount integer NOT NULL DEFAULT 0 CHECK (interest_amount >= 0),
  fee_amount integer NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','INVOICED','PAID','PARTIALLY_PAID','OVERDUE','CANCELLED','SUPERSEDED')),
  invoice_id uuid REFERENCES public.invoice(id) ON DELETE SET NULL,
  invoice_generation_status text NOT NULL DEFAULT 'PENDING' CHECK (invoice_generation_status IN ('PENDING','NOT_DUE','GENERATED','RETRY_REQUIRED','FAILED','CANCELLED')),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduled_obligation_component_sum CHECK (amount = principal_amount + interest_amount + fee_amount),
  UNIQUE (schedule_id, sequence_number),
  UNIQUE (customer_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.repayment_schedule_amendments (
  amendment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  original_schedule_id uuid NOT NULL REFERENCES public.repayment_schedules(schedule_id) ON DELETE RESTRICT,
  new_schedule_id uuid REFERENCES public.repayment_schedules(schedule_id) ON DELETE SET NULL,
  credit_account_id uuid NOT NULL REFERENCES public.credit_accounts(credit_account_id) ON DELETE RESTRICT,
  amendment_reason text NOT NULL,
  amendment_type text NOT NULL DEFAULT 'BUSINESS_APPROVED_RESTRUCTURE' CHECK (amendment_type IN (
    'PRODUCT_CORRECTION','CONTRACT_CORRECTION','BUSINESS_APPROVED_RESTRUCTURE',
    'ASSET_REPLACEMENT','ADMIN_ERROR','LEGAL_ADJUSTMENT'
  )),
  approved_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.repayment_audit_events (
  audit_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  credit_account_id uuid REFERENCES public.credit_accounts(credit_account_id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES public.repayment_schedules(schedule_id) ON DELETE SET NULL,
  obligation_id uuid REFERENCES public.scheduled_obligations(obligation_id) ON DELETE SET NULL,
  actor_id uuid,
  actor_type text NOT NULL DEFAULT 'ADMIN' CHECK (actor_type IN ('SYSTEM','DRIVER','ADMIN','MANAGER','COMPLIANCE')),
  event_type text NOT NULL,
  before_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice
  ADD COLUMN IF NOT EXISTS source_schedule_id uuid REFERENCES public.repayment_schedules(schedule_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_obligation_id uuid REFERENCES public.scheduled_obligations(obligation_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS due_date date;

ALTER TABLE public.invoice DROP CONSTRAINT IF EXISTS invoice_credit_obligation_type_check;
ALTER TABLE public.invoice ADD CONSTRAINT invoice_credit_obligation_type_check
  CHECK (
    obligation_type IS NULL OR obligation_type IN (
      'DOWN_PAYMENT','CREDIT_FEE','ACTIVATION_FEE',
      'OWNERSHIP_INSTALLMENT','MOTORCYCLE_INSTALLMENT','PHONE_INSTALLMENT','EQUIPMENT_INSTALLMENT',
      'REPAYMENT_INSTALLMENT','FINAL_PAYMENT','BALLOON_PAYMENT','SERVICE_FEE','MANUAL_ADJUSTMENT','ONE_TIME_REPAYMENT'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS uniq_repayment_schedule_active_account
  ON public.repayment_schedules(credit_account_id)
  WHERE schedule_status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_repayment_schedule_version
  ON public.repayment_schedules(credit_account_id, schedule_version);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_repayment_schedule_idempotency
  ON public.repayment_schedules(customer_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_repayment_schedules_account_status
  ON public.repayment_schedules(credit_account_id, schedule_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repayment_schedules_application
  ON public.repayment_schedules(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scheduled_obligations_schedule_due
  ON public.scheduled_obligations(schedule_id, due_date, sequence_number);
CREATE INDEX IF NOT EXISTS idx_scheduled_obligations_invoice
  ON public.scheduled_obligations(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_repayment_schedule
  ON public.invoice(source_schedule_id) WHERE source_schedule_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_repayment_obligation
  ON public.invoice(source_obligation_id)
  WHERE source_obligation_id IS NOT NULL AND status <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_repayment_audit_schedule
  ON public.repayment_audit_events(schedule_id, created_at DESC);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['repayment_schedules','scheduled_obligations']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['repayment_schedule_amendments','repayment_audit_events']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_immutable ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_credit_immutable_change()', t, t);
  END LOOP;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'repayment_schedules','scheduled_obligations',
    'repayment_schedule_amendments','repayment_audit_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "repayment platform owner all" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "repayment admins tenant" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "repayment platform owner all" ON public.%I FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner())',
      t
    );
    EXECUTE format(
      'CREATE POLICY "repayment admins tenant" ON public.%I FOR ALL TO authenticated USING (public.has_repayment_permission(''repayment.view'') AND customer_id = public.current_customer_id()) WITH CHECK (public.has_repayment_permission(''repayment.generate_schedule'') AND customer_id = public.current_customer_id())',
      t
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "drivers read own repayment schedules" ON public.repayment_schedules;
CREATE POLICY "drivers read own repayment schedules" ON public.repayment_schedules
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.credit_accounts ca
    WHERE ca.credit_account_id = repayment_schedules.credit_account_id
      AND ca.driver_id = public.current_driver_id()
  ));

DROP POLICY IF EXISTS "drivers read own scheduled obligations" ON public.scheduled_obligations;
CREATE POLICY "drivers read own scheduled obligations" ON public.scheduled_obligations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.credit_accounts ca
    WHERE ca.credit_account_id = scheduled_obligations.credit_account_id
      AND ca.driver_id = public.current_driver_id()
  ));

CREATE OR REPLACE FUNCTION public.repayment_schedule_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'repayment schedules are immutable; supersede or cancel instead';
  END IF;

  IF OLD.schedule_status IN ('ACTIVE','PAUSED','SUPERSEDED','COMPLETED','CANCELLED') THEN
    IF OLD.credit_account_id IS DISTINCT FROM NEW.credit_account_id
      OR OLD.application_id IS DISTINCT FROM NEW.application_id
      OR OLD.contract_id IS DISTINCT FROM NEW.contract_id
      OR OLD.product_id IS DISTINCT FROM NEW.product_id
      OR OLD.product_version_id IS DISTINCT FROM NEW.product_version_id
      OR OLD.schedule_version IS DISTINCT FROM NEW.schedule_version
      OR OLD.schedule_type IS DISTINCT FROM NEW.schedule_type
      OR OLD.currency_code IS DISTINCT FROM NEW.currency_code
      OR OLD.financed_amount IS DISTINCT FROM NEW.financed_amount
      OR OLD.total_repayment_amount IS DISTINCT FROM NEW.total_repayment_amount
      OR OLD.total_fees_amount IS DISTINCT FROM NEW.total_fees_amount
      OR OLD.total_interest_amount IS DISTINCT FROM NEW.total_interest_amount
      OR OLD.term_count IS DISTINCT FROM NEW.term_count
      OR OLD.frequency IS DISTINCT FROM NEW.frequency
      OR OLD.first_due_date IS DISTINCT FROM NEW.first_due_date
      OR OLD.final_due_date IS DISTINCT FROM NEW.final_due_date
      OR OLD.terms_snapshot_json IS DISTINCT FROM NEW.terms_snapshot_json
      OR OLD.source_snapshot_json IS DISTINCT FROM NEW.source_snapshot_json
    THEN
      RAISE EXCEPTION 'active repayment schedule terms are immutable; create an amendment';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_repayment_schedule_guard ON public.repayment_schedules;
CREATE TRIGGER trg_repayment_schedule_guard
  BEFORE UPDATE OR DELETE ON public.repayment_schedules
  FOR EACH ROW EXECUTE FUNCTION public.repayment_schedule_guard();

CREATE OR REPLACE FUNCTION public.scheduled_obligation_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_schedule_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'scheduled obligations are immutable; cancel or supersede instead';
  END IF;

  SELECT schedule_status INTO v_schedule_status
  FROM public.repayment_schedules
  WHERE schedule_id = OLD.schedule_id;

  IF v_schedule_status IS DISTINCT FROM 'DRAFT' THEN
    IF OLD.schedule_id IS DISTINCT FROM NEW.schedule_id
      OR OLD.credit_account_id IS DISTINCT FROM NEW.credit_account_id
      OR OLD.sequence_number IS DISTINCT FROM NEW.sequence_number
      OR OLD.obligation_type IS DISTINCT FROM NEW.obligation_type
      OR OLD.due_date IS DISTINCT FROM NEW.due_date
      OR OLD.amount IS DISTINCT FROM NEW.amount
      OR OLD.currency_code IS DISTINCT FROM NEW.currency_code
      OR OLD.principal_amount IS DISTINCT FROM NEW.principal_amount
      OR OLD.interest_amount IS DISTINCT FROM NEW.interest_amount
      OR OLD.fee_amount IS DISTINCT FROM NEW.fee_amount
    THEN
      RAISE EXCEPTION 'scheduled obligation amounts and dates are immutable after activation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_scheduled_obligation_guard ON public.scheduled_obligations;
CREATE TRIGGER trg_scheduled_obligation_guard
  BEFORE UPDATE OR DELETE ON public.scheduled_obligations
  FOR EACH ROW EXECUTE FUNCTION public.scheduled_obligation_guard();

CREATE OR REPLACE FUNCTION public.repayment_audit(
  p_customer_id uuid,
  p_credit_account_id uuid,
  p_schedule_id uuid,
  p_obligation_id uuid,
  p_event_type text,
  p_before jsonb DEFAULT '{}'::jsonb,
  p_after jsonb DEFAULT '{}'::jsonb,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.repayment_audit_events (
    customer_id, credit_account_id, schedule_id, obligation_id,
    actor_id, actor_type, event_type, before_json, after_json,
    reason, idempotency_key
  )
  VALUES (
    p_customer_id, p_credit_account_id, p_schedule_id, p_obligation_id,
    auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'SYSTEM' ELSE 'ADMIN' END,
    p_event_type, COALESCE(p_before, '{}'::jsonb), COALESCE(p_after, '{}'::jsonb),
    p_reason, p_idempotency_key
  )
  RETURNING audit_event_id INTO v_id;

  PERFORM public.credit_log_event(
    p_customer_id,
    lower(p_event_type),
    COALESCE(CASE WHEN p_obligation_id IS NULL THEN 'repayment_schedule' ELSE 'scheduled_obligation' END, 'repayment_schedule'),
    COALESCE(p_obligation_id, p_schedule_id, p_credit_account_id),
    COALESCE(p_before, '{}'::jsonb),
    COALESCE(p_after, '{}'::jsonb),
    jsonb_build_object('credit_account_id', p_credit_account_id, 'schedule_id', p_schedule_id, 'obligation_id', p_obligation_id, 'reason', p_reason),
    p_idempotency_key
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.repayment_due_date(
  p_first_due_date date,
  p_frequency text,
  p_sequence integer
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_sequence <= 1 THEN
    RETURN p_first_due_date;
  END IF;

  RETURN CASE p_frequency
    WHEN 'DAILY' THEN p_first_due_date + (p_sequence - 1)
    WHEN 'WEEKLY' THEN p_first_due_date + ((p_sequence - 1) * 7)
    WHEN 'BIWEEKLY' THEN p_first_due_date + ((p_sequence - 1) * 14)
    WHEN 'MONTHLY' THEN (p_first_due_date + make_interval(months => p_sequence - 1))::date
    WHEN 'QUARTERLY' THEN (p_first_due_date + make_interval(months => (p_sequence - 1) * 3))::date
    WHEN 'YEARLY' THEN (p_first_due_date + make_interval(years => p_sequence - 1))::date
    ELSE p_first_due_date
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.repayment_status_label(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_status
    WHEN 'DRAFT' THEN 'Brouillon'
    WHEN 'ACTIVE' THEN 'Calendrier actif'
    WHEN 'PAUSED' THEN 'Calendrier suspendu'
    WHEN 'SUPERSEDED' THEN 'Calendrier remplace'
    WHEN 'COMPLETED' THEN 'Calendrier termine'
    WHEN 'CANCELLED' THEN 'Calendrier annule'
    WHEN 'SCHEDULED' THEN 'Planifiee'
    WHEN 'INVOICED' THEN 'Facturee'
    WHEN 'PAID' THEN 'Payee'
    WHEN 'PARTIALLY_PAID' THEN 'Paiement partiel'
    WHEN 'OVERDUE' THEN 'En retard'
    ELSE COALESCE(p_status, 'En cours')
  END
$$;

CREATE OR REPLACE FUNCTION public.repayment_invoice_obligation_type(
  p_product_type text,
  p_obligation_type text,
  p_sequence integer,
  p_term_count integer
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_obligation_type = 'BALLOON_PAYMENT' THEN 'BALLOON_PAYMENT'
    WHEN p_obligation_type = 'SERVICE_FEE' THEN 'SERVICE_FEE'
    WHEN p_obligation_type = 'MANUAL_ADJUSTMENT' THEN 'MANUAL_ADJUSTMENT'
    WHEN p_obligation_type = 'FINAL_PAYMENT' OR p_sequence = p_term_count THEN 'FINAL_PAYMENT'
    WHEN p_product_type = 'CAR_OWNERSHIP' THEN 'OWNERSHIP_INSTALLMENT'
    WHEN p_product_type = 'MOTORCYCLE_FINANCING' THEN 'MOTORCYCLE_INSTALLMENT'
    WHEN p_product_type = 'PHONE_FINANCING' THEN 'PHONE_INSTALLMENT'
    WHEN p_product_type IN ('TV_APPLIANCE_FINANCING','EQUIPMENT_FINANCING','FLEET_EXPANSION') THEN 'EQUIPMENT_INSTALLMENT'
    ELSE 'REPAYMENT_INSTALLMENT'
  END
$$;

CREATE OR REPLACE FUNCTION public.generate_repayment_schedule(
  p_credit_account_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.repayment_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.credit_accounts%ROWTYPE;
  v_app public.credit_applications%ROWTYPE;
  v_product public.credit_products%ROWTYPE;
  v_version public.product_versions%ROWTYPE;
  v_package public.activation_packages%ROWTYPE;
  v_underwriting public.underwriting_decisions%ROWTYPE;
  v_contract public.credit_contracts%ROWTYPE;
  v_agreement public.credit_agreements%ROWTYPE;
  v_existing public.repayment_schedules%ROWTYPE;
  v_schedule public.repayment_schedules%ROWTYPE;
  v_terms jsonb := '{}'::jsonb;
  v_schedule_type text;
  v_frequency text;
  v_term_count integer;
  v_grace_days integer;
  v_invoice_days integer;
  v_allow_prepayment boolean;
  v_allow_amendment boolean;
  v_financed integer;
  v_interest integer := 0;
  v_fees integer := 0;
  v_config_fees integer := 0;
  v_total integer;
  v_principal_base integer;
  v_principal_remainder integer;
  v_interest_base integer;
  v_interest_remainder integer;
  v_fee_base integer;
  v_fee_remainder integer;
  v_first_due date;
  v_final_due date;
  v_sequence integer;
  v_amount integer;
  v_principal integer;
  v_interest_part integer;
  v_fee_part integer;
  v_due date;
  v_schedule_version integer;
  v_policy_snapshot_id uuid;
  v_pending_conditions integer := 0;
  v_blocking_triggers integer := 0;
BEGIN
  IF NOT public.has_repayment_permission('repayment.generate_schedule') THEN
    RAISE EXCEPTION 'forbidden: repayment.generate_schedule required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.repayment_schedules
  WHERE customer_id = public.current_customer_id()
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_account
  FROM public.credit_accounts
  WHERE credit_account_id = p_credit_account_id
    AND (public.is_platform_owner() OR customer_id = public.current_customer_id())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active credit account required before schedule generation' USING ERRCODE = 'P0002';
  END IF;
  IF v_account.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'credit account must be ACTIVE before schedule generation';
  END IF;

  SELECT * INTO v_existing
  FROM public.repayment_schedules
  WHERE credit_account_id = v_account.credit_account_id
    AND schedule_status = 'ACTIVE'
  ORDER BY created_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_package
  FROM public.activation_packages
  WHERE package_id = v_account.activation_package_id
    AND customer_id = v_account.customer_id;
  IF v_package.package_id IS NULL OR v_package.status <> 'ACTIVATED' THEN
    RAISE EXCEPTION 'activation package must be ACTIVATED before schedule generation';
  END IF;

  SELECT * INTO v_app
  FROM public.credit_applications
  WHERE application_id = v_package.application_id
    AND customer_id = v_account.customer_id;
  IF v_app.application_id IS NULL THEN
    RAISE EXCEPTION 'credit application not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_product
  FROM public.credit_products
  WHERE product_id = v_account.product_id
    AND customer_id = v_account.customer_id;
  SELECT * INTO v_version
  FROM public.product_versions
  WHERE version_id = v_account.product_version_id
    AND product_id = v_account.product_id;
  IF v_version.version_id IS NULL THEN
    RAISE EXCEPTION 'product version not found' USING ERRCODE = 'P0002';
  END IF;

  v_terms := COALESCE(v_version.repayment_terms_json, '{}'::jsonb);
  IF NOT COALESCE(NULLIF(v_terms->>'requires_repayment_schedule', '')::boolean, false) THEN
    RAISE EXCEPTION 'product version does not require a repayment schedule';
  END IF;

  SELECT * INTO v_underwriting FROM public.underwriting_latest_decision(v_app.application_id);
  IF v_underwriting.decision_id IS NULL OR v_underwriting.decision NOT IN ('APPROVED','APPROVED_WITH_CONDITIONS') THEN
    RAISE EXCEPTION 'Layer 3B approved underwriting decision is required';
  END IF;
  IF v_underwriting.decision_valid_until IS NOT NULL AND v_underwriting.decision_valid_until <= now() THEN
    RAISE EXCEPTION 'underwriting decision expired; re-underwriting required';
  END IF;

  SELECT COUNT(*)::integer INTO v_pending_conditions
  FROM public.underwriting_conditions
  WHERE decision_id = v_underwriting.decision_id
    AND status = 'PENDING';
  IF v_pending_conditions > 0 THEN
    RAISE EXCEPTION 'underwriting conditions must be fulfilled before schedule generation';
  END IF;

  SELECT COUNT(*)::integer INTO v_blocking_triggers
  FROM public.reunderwriting_triggers
  WHERE application_id = v_app.application_id
    AND status IN ('PENDING','BLOCKING');
  IF v_blocking_triggers > 0 THEN
    RAISE EXCEPTION 're-underwriting trigger must be resolved before schedule generation';
  END IF;

  SELECT cc.* INTO v_contract
  FROM public.credit_contracts cc
  WHERE cc.application_id = v_app.application_id
    AND cc.contract_status = 'FULLY_EXECUTED'
    AND cc.decision_id = v_underwriting.decision_id
    AND cc.product_version_id = v_account.product_version_id
    AND cc.asset_id IS NOT DISTINCT FROM v_account.asset_id
    AND (cc.expires_at IS NULL OR cc.expires_at > now())
  ORDER BY cc.fully_executed_at DESC, cc.created_at DESC
  LIMIT 1;
  IF v_contract.contract_id IS NULL THEN
    RAISE EXCEPTION 'latest valid fully executed contract required before schedule generation';
  END IF;

  SELECT ca.* INTO v_agreement
  FROM public.credit_agreements ca
  WHERE ca.contract_id = v_contract.contract_id
    AND ca.application_id = v_app.application_id
    AND ca.agreement_status = 'ACTIVE'
    AND ca.signed_at IS NOT NULL
  ORDER BY ca.signed_at DESC
  LIMIT 1;
  IF v_agreement.agreement_id IS NULL THEN
    RAISE EXCEPTION 'latest valid signed agreement required before schedule generation';
  END IF;

  v_schedule_type := COALESCE(NULLIF(v_terms->>'schedule_type', ''), 'FIXED_INSTALLMENT');
  v_frequency := COALESCE(NULLIF(v_terms->>'frequency', ''), CASE WHEN v_schedule_type = 'ONE_TIME_PAYMENT' THEN 'ONE_TIME' ELSE 'MONTHLY' END);
  v_term_count := COALESCE(NULLIF(v_terms->>'term_count', '')::integer, CASE WHEN v_schedule_type = 'ONE_TIME_PAYMENT' THEN 1 ELSE 24 END);
  IF v_schedule_type = 'ONE_TIME_PAYMENT' THEN
    v_term_count := 1;
    v_frequency := 'ONE_TIME';
  END IF;
  IF v_schedule_type NOT IN ('FIXED_INSTALLMENT','ZERO_INTEREST_INSTALLMENT','ONE_TIME_PAYMENT','FLAT_FEE_INSTALLMENT') THEN
    RAISE EXCEPTION 'schedule type % is not supported for launch generation', v_schedule_type;
  END IF;
  IF v_term_count <= 0 THEN
    RAISE EXCEPTION 'term_count must be greater than zero';
  END IF;

  v_grace_days := COALESCE(NULLIF(v_terms->>'grace_period_days', '')::integer, 3);
  v_invoice_days := COALESCE(NULLIF(v_terms->>'invoice_generation_days_before_due', '')::integer, 3);
  v_allow_prepayment := COALESCE(NULLIF(v_terms->>'allow_prepayment', '')::boolean, true);
  v_allow_amendment := COALESCE(NULLIF(v_terms->>'allow_schedule_amendment', '')::boolean, true);
  v_financed := COALESCE(v_account.principal_amount, 0);
  v_config_fees := GREATEST(COALESCE(NULLIF(v_terms->>'flat_fee_amount', '')::integer, 0), 0)
    + GREATEST(COALESCE(NULLIF(v_terms->>'service_fee_amount', '')::integer, 0), 0)
    + GREATEST(COALESCE(NULLIF(v_terms->>'activation_fee_amount', '')::integer, 0), 0);
  v_interest := CASE
    WHEN v_schedule_type = 'ZERO_INTEREST_INSTALLMENT' THEN 0
    WHEN COALESCE(NULLIF(v_terms->>'interest_model', ''), 'ZERO_INTEREST') = 'ZERO_INTEREST' THEN 0
    ELSE GREATEST(COALESCE(NULLIF(v_terms->>'interest_amount', '')::integer, 0), 0)
  END;
  v_total := GREATEST(COALESCE(NULLIF(v_terms->>'total_repayment_amount', '')::integer, v_financed + v_config_fees + v_interest), v_financed);
  IF v_total < v_financed + v_interest THEN
    v_interest := GREATEST(v_total - v_financed, 0);
  END IF;
  v_fees := GREATEST(v_total - v_financed - v_interest, 0);

  v_first_due := CASE COALESCE(NULLIF(v_terms->>'first_due_date_rule', ''), 'NEXT_MONTH_SAME_DAY')
    WHEN 'TODAY' THEN current_date
    WHEN 'TOMORROW' THEN current_date + 1
    WHEN 'NEXT_WEEK' THEN current_date + 7
    WHEN 'NEXT_MONTH_FIRST_DAY' THEN (date_trunc('month', COALESCE(v_account.activated_at, now())) + interval '1 month')::date
    ELSE (COALESCE(v_account.activated_at, now())::date + interval '1 month')::date
  END;
  IF v_terms ? 'first_due_date' THEN
    v_first_due := (v_terms->>'first_due_date')::date;
  END IF;
  v_final_due := public.repayment_due_date(v_first_due, v_frequency, v_term_count);
  v_policy_snapshot_id := NULLIF(v_contract.contract_snapshot_json #>> '{underwriting_decision,evaluated_policy_set_id}', '')::uuid;

  SELECT COALESCE(MAX(schedule_version), 0) + 1 INTO v_schedule_version
  FROM public.repayment_schedules
  WHERE credit_account_id = v_account.credit_account_id;

  INSERT INTO public.repayment_schedules (
    customer_id, credit_account_id, application_id, contract_id, product_id,
    product_version_id, schedule_version, schedule_status, schedule_type,
    currency_code, financed_amount, total_repayment_amount, total_fees_amount,
    total_interest_amount, term_count, frequency, first_due_date, final_due_date,
    grace_period_days, invoice_generation_days_before_due, allow_prepayment,
    allow_schedule_amendment, generated_from_contract_hash,
    generated_from_policy_snapshot_id, terms_snapshot_json, source_snapshot_json,
    idempotency_key, created_by, updated_by, status_changed_at
  )
  VALUES (
    v_account.customer_id, v_account.credit_account_id, v_app.application_id,
    v_contract.contract_id, v_account.product_id, v_account.product_version_id,
    v_schedule_version, 'DRAFT', v_schedule_type, v_account.principal_currency_code,
    v_financed, v_total, v_fees, v_interest, v_term_count, v_frequency,
    v_first_due, v_final_due, v_grace_days, v_invoice_days, v_allow_prepayment,
    v_allow_amendment, v_contract.contract_hash, v_policy_snapshot_id,
    v_terms, jsonb_build_object(
      'credit_account_id', v_account.credit_account_id,
      'application_id', v_app.application_id,
      'contract_id', v_contract.contract_id,
      'agreement_id', v_agreement.agreement_id,
      'underwriting_decision_id', v_underwriting.decision_id,
      'activation_package_id', v_package.package_id
    ),
    p_idempotency_key, auth.uid(), auth.uid(), now()
  )
  RETURNING * INTO v_schedule;

  v_principal_base := v_financed / v_term_count;
  v_principal_remainder := v_financed % v_term_count;
  v_interest_base := v_interest / v_term_count;
  v_interest_remainder := v_interest % v_term_count;
  v_fee_base := v_fees / v_term_count;
  v_fee_remainder := v_fees % v_term_count;

  FOR v_sequence IN 1..v_term_count LOOP
    v_due := public.repayment_due_date(v_first_due, v_frequency, v_sequence);
    v_principal := v_principal_base + CASE WHEN v_sequence <= v_principal_remainder THEN 1 ELSE 0 END;
    v_interest_part := v_interest_base + CASE WHEN v_sequence <= v_interest_remainder THEN 1 ELSE 0 END;
    v_fee_part := v_fee_base + CASE WHEN v_sequence <= v_fee_remainder THEN 1 ELSE 0 END;
    v_amount := v_principal + v_interest_part + v_fee_part;

    INSERT INTO public.scheduled_obligations (
      customer_id, schedule_id, credit_account_id, sequence_number, obligation_type,
      due_date, amount, currency_code, principal_amount, interest_amount, fee_amount,
      status, invoice_generation_status, idempotency_key
    )
    VALUES (
      v_account.customer_id, v_schedule.schedule_id, v_account.credit_account_id,
      v_sequence,
      CASE WHEN v_schedule_type = 'ONE_TIME_PAYMENT' THEN 'FINAL_PAYMENT'
        WHEN v_sequence = v_term_count THEN 'FINAL_PAYMENT'
        ELSE 'INSTALLMENT'
      END,
      v_due, v_amount, v_account.principal_currency_code, v_principal,
      v_interest_part,
      v_fee_part,
      'SCHEDULED',
      CASE WHEN v_due <= current_date + v_invoice_days THEN 'PENDING' ELSE 'NOT_DUE' END,
      p_idempotency_key || ':obligation:' || v_sequence::text
    );
  END LOOP;

  UPDATE public.repayment_schedules
  SET schedule_status = 'ACTIVE',
      status_changed_at = now(),
      updated_by = auth.uid()
  WHERE schedule_id = v_schedule.schedule_id
  RETURNING * INTO v_schedule;

  UPDATE public.credit_contracts
  SET credit_account_id = v_account.credit_account_id,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE contract_id = v_contract.contract_id
    AND credit_account_id IS NULL;

  PERFORM public.repayment_audit(
    v_account.customer_id, v_account.credit_account_id, v_schedule.schedule_id,
    NULL, 'SCHEDULE_GENERATED', '{}'::jsonb, to_jsonb(v_schedule), NULL,
    p_idempotency_key
  );
  PERFORM public.repayment_audit(
    v_account.customer_id, v_account.credit_account_id, v_schedule.schedule_id,
    NULL, 'SCHEDULE_ACTIVATED', '{}'::jsonb, to_jsonb(v_schedule), NULL,
    p_idempotency_key || ':activate'
  );

  RETURN v_schedule;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_repayment_invoice(
  p_obligation_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.invoice
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_obligation public.scheduled_obligations%ROWTYPE;
  v_schedule public.repayment_schedules%ROWTYPE;
  v_account public.credit_accounts%ROWTYPE;
  v_app public.credit_applications%ROWTYPE;
  v_product public.credit_products%ROWTYPE;
  v_driver public.drivers%ROWTYPE;
  v_settings public.customer_billing_settings%ROWTYPE;
  v_invoice public.invoice%ROWTYPE;
  v_before jsonb;
  v_invoice_obligation_type text;
  v_payment_id uuid;
BEGIN
  IF NOT public.has_repayment_permission('repayment.generate_invoice') THEN
    RAISE EXCEPTION 'forbidden: repayment.generate_invoice required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_invoice
  FROM public.invoice
  WHERE customer_id = public.current_customer_id()
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_invoice;
  END IF;

  SELECT * INTO v_obligation
  FROM public.scheduled_obligations
  WHERE obligation_id = p_obligation_id
    AND (public.is_platform_owner() OR customer_id = public.current_customer_id())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'scheduled obligation not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_obligation.status IN ('CANCELLED','SUPERSEDED') THEN
    RAISE EXCEPTION 'cancelled or superseded obligations cannot be invoiced';
  END IF;

  IF v_obligation.invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice FROM public.invoice WHERE id = v_obligation.invoice_id;
    IF FOUND THEN
      RETURN v_invoice;
    END IF;
  END IF;

  SELECT * INTO v_invoice
  FROM public.invoice
  WHERE source_obligation_id = v_obligation.obligation_id
    AND status <> 'cancelled'
  ORDER BY created_at DESC
  LIMIT 1;
  IF FOUND THEN
    UPDATE public.scheduled_obligations
    SET invoice_id = v_invoice.id,
        invoice_generation_status = 'GENERATED',
        status = CASE WHEN status = 'SCHEDULED' THEN 'INVOICED' ELSE status END
    WHERE obligation_id = v_obligation.obligation_id;
    RETURN v_invoice;
  END IF;

  SELECT * INTO v_schedule FROM public.repayment_schedules WHERE schedule_id = v_obligation.schedule_id;
  IF v_schedule.schedule_status NOT IN ('ACTIVE','PAUSED') THEN
    RAISE EXCEPTION 'schedule must be active before invoice generation';
  END IF;
  SELECT * INTO v_account FROM public.credit_accounts WHERE credit_account_id = v_obligation.credit_account_id;
  SELECT * INTO v_app FROM public.credit_applications WHERE application_id = v_schedule.application_id;
  SELECT * INTO v_product FROM public.credit_products WHERE product_id = v_schedule.product_id;
  SELECT * INTO v_driver FROM public.drivers WHERE id = v_account.driver_id;
  SELECT * INTO v_settings FROM public.customer_billing_settings WHERE customer_id = v_account.customer_id;

  v_before := to_jsonb(v_obligation);
  v_invoice_obligation_type := public.repayment_invoice_obligation_type(
    v_product.product_type, v_obligation.obligation_type, v_obligation.sequence_number, v_schedule.term_count
  );

  INSERT INTO public.invoice (
    customer_id, driver_id, status, invoice_kind,
    driver_snapshot_name, driver_snapshot_phone,
    subtotal_ht, vat_amount, total_ttc, amount_paid,
    vat_rate_snapshot, vat_enabled_snapshot,
    legal_name_snapshot, legal_nif_snapshot, legal_rccm_snapshot,
    legal_address_snapshot, legal_footer_snapshot,
    period_start, period_end, due_date,
    notes, currency_code, source_product_id, source_credit_account_id,
    source_application_id, source_schedule_id, source_obligation_id,
    obligation_type, idempotency_key
  )
  VALUES (
    v_account.customer_id, v_account.driver_id, 'issued', 'invoice',
    v_driver.full_name, v_driver.phone_number,
    v_obligation.amount, 0, v_obligation.amount, 0,
    0, false,
    v_settings.legal_name, v_settings.legal_nif, v_settings.legal_rccm,
    v_settings.legal_address, v_settings.legal_footer,
    v_obligation.due_date, v_obligation.due_date, v_obligation.due_date,
    'Layer 3D repayment obligation generated through the Financial Engine.',
    v_obligation.currency_code, v_schedule.product_id, v_account.credit_account_id,
    v_schedule.application_id, v_schedule.schedule_id, v_obligation.obligation_id,
    v_invoice_obligation_type, p_idempotency_key
  )
  RETURNING * INTO v_invoice;

  INSERT INTO public.invoice_line (
    invoice_id, customer_id, position, designation, quantity,
    unit_price, line_total_ht, vat_rate, line_vat, line_total_ttc,
    metadata
  )
  VALUES (
    v_invoice.id, v_account.customer_id, 1,
    CASE
      WHEN v_obligation.obligation_type = 'FINAL_PAYMENT' AND v_schedule.term_count = 1 THEN 'Paiement unique credit'
      ELSE 'Echeance credit ' || v_obligation.sequence_number::text || '/' || v_schedule.term_count::text
    END,
    1, v_obligation.amount, v_obligation.amount, 0, 0, v_obligation.amount,
    jsonb_build_object(
      'source', 'layer3d_repayment',
      'schedule_id', v_schedule.schedule_id,
      'obligation_id', v_obligation.obligation_id,
      'obligation_type', v_obligation.obligation_type,
      'due_date', v_obligation.due_date
    )
  );

  INSERT INTO public.payments (
    driver_id, customer_id, amount, amount_paid, payment_type, due_date, status
  )
  VALUES (
    v_account.driver_id, v_account.customer_id, v_obligation.amount, 0,
    'loan_repayment', v_obligation.due_date, 'pending'
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO public.invoice_payment_link (invoice_id, payment_id, customer_id)
  VALUES (v_invoice.id, v_payment_id, v_account.customer_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
  VALUES (
    v_invoice.id, v_account.customer_id, 'credit_obligation', auth.uid(), 'admin',
    jsonb_build_object(
      'source', 'layer3d_repayment',
      'schedule_id', v_schedule.schedule_id,
      'obligation_id', v_obligation.obligation_id,
      'payment_id', v_payment_id,
      'idempotency_key', p_idempotency_key
    )
  );

  UPDATE public.scheduled_obligations
  SET invoice_id = v_invoice.id,
      invoice_generation_status = 'GENERATED',
      status = CASE WHEN status = 'SCHEDULED' THEN 'INVOICED' ELSE status END
  WHERE obligation_id = v_obligation.obligation_id
  RETURNING * INTO v_obligation;

  PERFORM public.repayment_audit(
    v_account.customer_id, v_account.credit_account_id, v_schedule.schedule_id,
    v_obligation.obligation_id, 'INVOICE_GENERATED', v_before, to_jsonb(v_obligation),
    NULL, p_idempotency_key
  );

  RETURN v_invoice;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_due_repayment_invoices(
  p_schedule_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TABLE (obligation_id uuid, invoice_id uuid, invoice_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule public.repayment_schedules%ROWTYPE;
  v_obligation public.scheduled_obligations%ROWTYPE;
  v_invoice public.invoice%ROWTYPE;
BEGIN
  IF NOT public.has_repayment_permission('repayment.generate_invoice') THEN
    RAISE EXCEPTION 'forbidden: repayment.generate_invoice required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_schedule
  FROM public.repayment_schedules
  WHERE schedule_id = p_schedule_id
    AND (public.is_platform_owner() OR customer_id = public.current_customer_id());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'repayment schedule not found' USING ERRCODE = 'P0002';
  END IF;

  FOR v_obligation IN
    SELECT *
    FROM public.scheduled_obligations
    WHERE schedule_id = v_schedule.schedule_id
      AND invoice_id IS NULL
      AND status = 'SCHEDULED'
      AND due_date <= current_date + v_schedule.invoice_generation_days_before_due
    ORDER BY due_date, sequence_number
  LOOP
    SELECT * INTO v_invoice
    FROM public.generate_repayment_invoice(
      v_obligation.obligation_id,
      p_idempotency_key || ':obligation:' || v_obligation.sequence_number::text
    );
    obligation_id := v_obligation.obligation_id;
    invoice_id := v_invoice.id;
    invoice_status := v_invoice.status;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_repayment_obligation_statuses(
  p_schedule_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TABLE (obligation_id uuid, old_status text, new_status text, invoice_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule public.repayment_schedules%ROWTYPE;
  v_row record;
  v_mapped_status text;
BEGIN
  IF NOT public.has_repayment_permission('repayment.view') THEN
    RAISE EXCEPTION 'forbidden: repayment.view required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_schedule
  FROM public.repayment_schedules
  WHERE schedule_id = p_schedule_id
    AND (public.is_platform_owner() OR customer_id = public.current_customer_id());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'repayment schedule not found' USING ERRCODE = 'P0002';
  END IF;

  FOR v_row IN
    SELECT so.*, i.status AS invoice_status, i.remaining_due, i.amount_paid
    FROM public.scheduled_obligations so
    LEFT JOIN public.invoice i ON i.id = so.invoice_id
    WHERE so.schedule_id = v_schedule.schedule_id
    ORDER BY so.sequence_number
  LOOP
    v_mapped_status := CASE
      WHEN v_row.status IN ('CANCELLED','SUPERSEDED') THEN v_row.status
      WHEN v_row.invoice_id IS NULL AND v_row.due_date + v_schedule.grace_period_days < current_date THEN 'OVERDUE'
      WHEN v_row.invoice_status IN ('paid','overpaid') THEN 'PAID'
      WHEN v_row.invoice_status = 'partial' OR COALESCE(v_row.amount_paid, 0) > 0 THEN 'PARTIALLY_PAID'
      WHEN v_row.invoice_status IN ('issued','draft') THEN
        CASE WHEN v_row.due_date + v_schedule.grace_period_days < current_date THEN 'OVERDUE' ELSE 'INVOICED' END
      WHEN v_row.due_date + v_schedule.grace_period_days < current_date THEN 'OVERDUE'
      ELSE v_row.status
    END;

    IF v_mapped_status IS DISTINCT FROM v_row.status THEN
      UPDATE public.scheduled_obligations
      SET status = v_mapped_status
      WHERE public.scheduled_obligations.obligation_id = v_row.obligation_id;
      PERFORM public.repayment_audit(
        v_row.customer_id, v_row.credit_account_id, v_row.schedule_id, v_row.obligation_id,
        'OBLIGATION_STATUS_SYNCED',
        jsonb_build_object('status', v_row.status, 'invoice_status', v_row.invoice_status),
        jsonb_build_object('status', v_mapped_status, 'invoice_status', v_row.invoice_status),
        NULL,
        COALESCE(p_idempotency_key, 'sync') || ':' || v_row.obligation_id::text
      );
    END IF;

    obligation_id := v_row.obligation_id;
    old_status := v_row.status;
    new_status := v_mapped_status;
    invoice_id := v_row.invoice_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.pause_repayment_schedule(
  p_schedule_id uuid,
  p_reason text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.repayment_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule public.repayment_schedules%ROWTYPE;
  v_before jsonb;
BEGIN
  IF NOT public.has_repayment_permission('repayment.pause') THEN
    RAISE EXCEPTION 'forbidden: repayment.pause required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT * INTO v_schedule
  FROM public.repayment_schedules
  WHERE schedule_id = p_schedule_id
    AND (public.is_platform_owner() OR customer_id = public.current_customer_id())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'repayment schedule not found' USING ERRCODE = 'P0002';
  END IF;
  v_before := to_jsonb(v_schedule);
  IF v_schedule.schedule_status = 'PAUSED' THEN
    RETURN v_schedule;
  END IF;
  IF v_schedule.schedule_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'only active schedules can be paused';
  END IF;

  UPDATE public.repayment_schedules
  SET schedule_status = 'PAUSED',
      status_changed_at = now(),
      updated_by = auth.uid()
  WHERE schedule_id = p_schedule_id
  RETURNING * INTO v_schedule;

  PERFORM public.repayment_audit(
    v_schedule.customer_id, v_schedule.credit_account_id, v_schedule.schedule_id,
    NULL, 'SCHEDULE_PAUSED', v_before, to_jsonb(v_schedule), p_reason,
    p_idempotency_key
  );
  RETURN v_schedule;
END;
$$;

CREATE OR REPLACE FUNCTION public.amend_repayment_schedule(
  p_schedule_id uuid,
  p_amendment_type text,
  p_reason text,
  p_new_terms_json jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.repayment_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.repayment_schedules%ROWTYPE;
  v_new public.repayment_schedules%ROWTYPE;
  v_before jsonb;
  v_terms jsonb;
  v_sequence integer;
  v_due date;
  v_amount integer;
  v_term_count integer;
  v_total integer;
  v_principal_total integer;
  v_principal_base integer;
  v_principal_remainder integer;
  v_interest_total integer;
  v_interest_base integer;
  v_interest_remainder integer;
  v_fee_total integer;
  v_fee_base integer;
  v_fee_remainder integer;
  v_principal integer;
  v_interest_part integer;
  v_fee_part integer;
BEGIN
  IF NOT public.has_repayment_permission('repayment.amend') THEN
    RAISE EXCEPTION 'forbidden: repayment.amend required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reason is required for schedule amendment';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_new
  FROM public.repayment_schedules
  WHERE customer_id = public.current_customer_id()
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_new;
  END IF;

  SELECT * INTO v_old
  FROM public.repayment_schedules
  WHERE schedule_id = p_schedule_id
    AND (public.is_platform_owner() OR customer_id = public.current_customer_id())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'repayment schedule not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_old.allow_schedule_amendment THEN
    RAISE EXCEPTION 'schedule amendment is not allowed for this product version';
  END IF;
  IF v_old.schedule_status NOT IN ('ACTIVE','PAUSED') THEN
    RAISE EXCEPTION 'only active or paused schedules can be amended';
  END IF;

  v_before := to_jsonb(v_old);
  v_terms := v_old.terms_snapshot_json || COALESCE(p_new_terms_json, '{}'::jsonb);
  v_term_count := COALESCE(NULLIF(v_terms->>'term_count', '')::integer, v_old.term_count);
  v_total := COALESCE(NULLIF(v_terms->>'total_repayment_amount', '')::integer, v_old.total_repayment_amount);
  v_principal_total := v_old.financed_amount;
  v_interest_total := COALESCE(NULLIF(v_terms->>'interest_amount', '')::integer, v_old.total_interest_amount);
  IF v_total < v_principal_total + v_interest_total THEN
    v_interest_total := GREATEST(v_total - v_principal_total, 0);
  END IF;
  v_fee_total := GREATEST(v_total - v_principal_total - v_interest_total, 0);

  UPDATE public.repayment_schedules
  SET schedule_status = 'SUPERSEDED',
      status_changed_at = now(),
      updated_by = auth.uid()
  WHERE schedule_id = v_old.schedule_id
  RETURNING * INTO v_old;

  UPDATE public.scheduled_obligations
  SET status = 'SUPERSEDED'
  WHERE schedule_id = v_old.schedule_id
    AND invoice_id IS NULL
    AND status IN ('SCHEDULED','OVERDUE');

  INSERT INTO public.repayment_schedules (
    customer_id, credit_account_id, application_id, contract_id, product_id,
    product_version_id, schedule_version, schedule_status, schedule_type,
    currency_code, financed_amount, total_repayment_amount, total_fees_amount,
    total_interest_amount, term_count, frequency, first_due_date, final_due_date,
    grace_period_days, invoice_generation_days_before_due, allow_prepayment,
    allow_schedule_amendment, generated_from_contract_hash,
    generated_from_policy_snapshot_id, terms_snapshot_json, source_snapshot_json,
    idempotency_key, created_by, updated_by, status_changed_at
  )
  VALUES (
    v_old.customer_id, v_old.credit_account_id, v_old.application_id,
    v_old.contract_id, v_old.product_id, v_old.product_version_id,
    v_old.schedule_version + 1, 'ACTIVE', COALESCE(NULLIF(v_terms->>'schedule_type', ''), v_old.schedule_type),
    v_old.currency_code, v_old.financed_amount, v_total,
    v_fee_total, v_interest_total, v_term_count,
    COALESCE(NULLIF(v_terms->>'frequency', ''), v_old.frequency),
    COALESCE(NULLIF(v_terms->>'first_due_date', '')::date, v_old.first_due_date),
    public.repayment_due_date(COALESCE(NULLIF(v_terms->>'first_due_date', '')::date, v_old.first_due_date), COALESCE(NULLIF(v_terms->>'frequency', ''), v_old.frequency), v_term_count),
    COALESCE(NULLIF(v_terms->>'grace_period_days', '')::integer, v_old.grace_period_days),
    COALESCE(NULLIF(v_terms->>'invoice_generation_days_before_due', '')::integer, v_old.invoice_generation_days_before_due),
    COALESCE(NULLIF(v_terms->>'allow_prepayment', '')::boolean, v_old.allow_prepayment),
    COALESCE(NULLIF(v_terms->>'allow_schedule_amendment', '')::boolean, v_old.allow_schedule_amendment),
    v_old.generated_from_contract_hash, v_old.generated_from_policy_snapshot_id,
    v_terms, v_old.source_snapshot_json || jsonb_build_object('amended_from_schedule_id', v_old.schedule_id),
    p_idempotency_key, auth.uid(), auth.uid(), now()
  )
  RETURNING * INTO v_new;

  v_principal_base := v_principal_total / v_term_count;
  v_principal_remainder := v_principal_total % v_term_count;
  v_interest_base := v_interest_total / v_term_count;
  v_interest_remainder := v_interest_total % v_term_count;
  v_fee_base := v_fee_total / v_term_count;
  v_fee_remainder := v_fee_total % v_term_count;

  FOR v_sequence IN 1..v_term_count LOOP
    v_due := public.repayment_due_date(v_new.first_due_date, v_new.frequency, v_sequence);
    v_principal := v_principal_base + CASE WHEN v_sequence <= v_principal_remainder THEN 1 ELSE 0 END;
    v_interest_part := v_interest_base + CASE WHEN v_sequence <= v_interest_remainder THEN 1 ELSE 0 END;
    v_fee_part := v_fee_base + CASE WHEN v_sequence <= v_fee_remainder THEN 1 ELSE 0 END;
    v_amount := v_principal + v_interest_part + v_fee_part;

    INSERT INTO public.scheduled_obligations (
      customer_id, schedule_id, credit_account_id, sequence_number,
      obligation_type, due_date, amount, currency_code, principal_amount,
      interest_amount, fee_amount, status, invoice_generation_status, idempotency_key
    )
    VALUES (
      v_new.customer_id, v_new.schedule_id, v_new.credit_account_id, v_sequence,
      CASE WHEN v_sequence = v_term_count THEN 'FINAL_PAYMENT' ELSE 'INSTALLMENT' END,
      v_due, v_amount, v_new.currency_code, v_principal, v_interest_part, v_fee_part,
      'SCHEDULED',
      CASE WHEN v_due <= current_date + v_new.invoice_generation_days_before_due THEN 'PENDING' ELSE 'NOT_DUE' END,
      p_idempotency_key || ':obligation:' || v_sequence::text
    );
  END LOOP;

  UPDATE public.repayment_schedules
  SET superseded_by_schedule_id = v_new.schedule_id
  WHERE schedule_id = v_old.schedule_id;

  INSERT INTO public.repayment_schedule_amendments (
    customer_id, original_schedule_id, new_schedule_id, credit_account_id,
    amendment_reason, amendment_type, approved_by, created_by
  )
  VALUES (
    v_old.customer_id, v_old.schedule_id, v_new.schedule_id, v_old.credit_account_id,
    p_reason, COALESCE(NULLIF(p_amendment_type, ''), 'BUSINESS_APPROVED_RESTRUCTURE'),
    auth.uid(), auth.uid()
  );

  PERFORM public.repayment_audit(
    v_old.customer_id, v_old.credit_account_id, v_old.schedule_id,
    NULL, 'SCHEDULE_SUPERSEDED', v_before, to_jsonb(v_old), p_reason,
    p_idempotency_key || ':supersede'
  );
  PERFORM public.repayment_audit(
    v_new.customer_id, v_new.credit_account_id, v_new.schedule_id,
    NULL, 'SCHEDULE_AMENDED', '{}'::jsonb, to_jsonb(v_new), p_reason,
    p_idempotency_key
  );

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_driver_repayment_schedules()
RETURNS TABLE (
  schedule_id uuid,
  credit_account_id uuid,
  product_name text,
  schedule_label text,
  schedule_status_label text,
  status_tone text,
  next_due_amount integer,
  next_due_date date,
  paid_installments integer,
  remaining_installments integer,
  remaining_balance integer,
  currency_code text,
  allow_prepayment boolean,
  obligations_json jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH mine AS (
    SELECT rs.*, cp.name AS product_name
    FROM public.repayment_schedules rs
    JOIN public.credit_accounts ca ON ca.credit_account_id = rs.credit_account_id
    JOIN public.credit_products cp ON cp.product_id = rs.product_id
    WHERE ca.driver_id = public.current_driver_id()
      AND rs.schedule_status IN ('ACTIVE','PAUSED','COMPLETED')
  ),
  obligations AS (
    SELECT
      so.schedule_id,
      COUNT(*) FILTER (WHERE so.status = 'PAID')::integer AS paid_count,
      COUNT(*) FILTER (WHERE so.status NOT IN ('PAID','CANCELLED','SUPERSEDED'))::integer AS remaining_count,
      COALESCE(SUM(so.amount) FILTER (WHERE so.status NOT IN ('PAID','CANCELLED','SUPERSEDED')), 0)::integer AS remaining_amount,
      (
        SELECT jsonb_build_object(
          'amount', nx.amount,
          'due_date', nx.due_date,
          'status_label', public.repayment_status_label(nx.status),
          'invoice_id', nx.invoice_id,
          'invoice_number', inv.invoice_number
        )
        FROM public.scheduled_obligations nx
        LEFT JOIN public.invoice inv ON inv.id = nx.invoice_id
        WHERE nx.schedule_id = so.schedule_id
          AND nx.status NOT IN ('PAID','CANCELLED','SUPERSEDED')
        ORDER BY nx.due_date, nx.sequence_number
        LIMIT 1
      ) AS next_json,
      jsonb_agg(jsonb_build_object(
        'sequence_number', so.sequence_number,
        'due_date', so.due_date,
        'amount', so.amount,
        'currency_code', so.currency_code,
        'status_label', public.repayment_status_label(so.status),
        'invoice_id', so.invoice_id,
        'invoice_number', i.invoice_number,
        'can_pay', so.invoice_id IS NOT NULL AND i.status IN ('issued','partial','overdue')
      ) ORDER BY so.sequence_number) AS obligations_json
    FROM public.scheduled_obligations so
    LEFT JOIN public.invoice i ON i.id = so.invoice_id
    GROUP BY so.schedule_id
  )
  SELECT
    m.schedule_id,
    m.credit_account_id,
    m.product_name,
    'Calendrier de paiement'::text AS schedule_label,
    public.repayment_status_label(m.schedule_status) AS schedule_status_label,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.scheduled_obligations so
        WHERE so.schedule_id = m.schedule_id AND so.status = 'OVERDUE'
      ) THEN 'danger'
      WHEN m.schedule_status = 'PAUSED' THEN 'warning'
      WHEN m.schedule_status = 'COMPLETED' THEN 'success'
      ELSE 'neutral'
    END AS status_tone,
    COALESCE((o.next_json->>'amount')::integer, 0) AS next_due_amount,
    NULLIF(o.next_json->>'due_date', '')::date AS next_due_date,
    COALESCE(o.paid_count, 0) AS paid_installments,
    COALESCE(o.remaining_count, 0) AS remaining_installments,
    COALESCE(o.remaining_amount, 0) AS remaining_balance,
    m.currency_code,
    m.allow_prepayment,
    COALESCE(o.obligations_json, '[]'::jsonb) AS obligations_json
  FROM mine m
  LEFT JOIN obligations o ON o.schedule_id = m.schedule_id
  ORDER BY m.created_at DESC
$$;

CREATE OR REPLACE VIEW public.v_credit_schedule_reconciliation_anomalies AS
WITH schedule_totals AS (
  SELECT
    rs.customer_id,
    rs.schedule_id,
    rs.credit_account_id,
    rs.total_repayment_amount,
    rs.currency_code,
    COALESCE(SUM(so.amount), 0)::integer AS obligation_total,
    COUNT(*)::integer AS obligation_count
  FROM public.repayment_schedules rs
  LEFT JOIN public.scheduled_obligations so ON so.schedule_id = rs.schedule_id
  GROUP BY rs.customer_id, rs.schedule_id, rs.credit_account_id, rs.total_repayment_amount, rs.currency_code
),
duplicate_invoices AS (
  SELECT
    i.customer_id,
    i.source_schedule_id AS schedule_id,
    i.source_credit_account_id AS credit_account_id,
    i.source_obligation_id AS obligation_id,
    COUNT(*)::integer AS invoice_count
  FROM public.invoice i
  WHERE i.source_obligation_id IS NOT NULL
    AND i.status <> 'cancelled'
  GROUP BY i.customer_id, i.source_schedule_id, i.source_credit_account_id, i.source_obligation_id
  HAVING COUNT(*) > 1
)
SELECT
  gen_random_uuid() AS anomaly_id,
  st.customer_id,
  st.schedule_id,
  st.credit_account_id,
  NULL::uuid AS obligation_id,
  NULL::uuid AS invoice_id,
  'CRITICAL'::text AS severity,
  'SCHEDULE_TOTAL_MISMATCH'::text AS anomaly_type,
  jsonb_build_object('schedule_total', st.total_repayment_amount, 'obligation_total', st.obligation_total) AS details_json,
  now() AS detected_at
FROM schedule_totals st
WHERE st.total_repayment_amount <> st.obligation_total
UNION ALL
SELECT
  gen_random_uuid(),
  so.customer_id,
  so.schedule_id,
  so.credit_account_id,
  so.obligation_id,
  so.invoice_id,
  'WARNING',
  'OBLIGATION_WITH_NO_INVOICE_AFTER_GENERATION_DATE',
  jsonb_build_object('due_date', so.due_date, 'invoice_generation_status', so.invoice_generation_status),
  now()
FROM public.scheduled_obligations so
JOIN public.repayment_schedules rs ON rs.schedule_id = so.schedule_id
WHERE so.invoice_id IS NULL
  AND so.status = 'SCHEDULED'
  AND so.due_date <= current_date + rs.invoice_generation_days_before_due
UNION ALL
SELECT
  gen_random_uuid(),
  i.customer_id,
  i.source_schedule_id,
  i.source_credit_account_id,
  i.source_obligation_id,
  i.id,
  'CRITICAL',
  'INVOICE_WITHOUT_MATCHING_OBLIGATION',
  jsonb_build_object('invoice_status', i.status, 'total_ttc', i.total_ttc),
  now()
FROM public.invoice i
LEFT JOIN public.scheduled_obligations so ON so.obligation_id = i.source_obligation_id
WHERE i.source_schedule_id IS NOT NULL
  AND so.obligation_id IS NULL
UNION ALL
SELECT
  gen_random_uuid(),
  so.customer_id,
  so.schedule_id,
  so.credit_account_id,
  so.obligation_id,
  i.id,
  'WARNING',
  'PAID_INVOICE_BUT_UNPAID_OBLIGATION',
  jsonb_build_object('invoice_status', i.status, 'obligation_status', so.status),
  now()
FROM public.scheduled_obligations so
JOIN public.invoice i ON i.id = so.invoice_id
WHERE i.status IN ('paid','overpaid')
  AND so.status <> 'PAID'
UNION ALL
SELECT
  gen_random_uuid(),
  so.customer_id,
  so.schedule_id,
  so.credit_account_id,
  so.obligation_id,
  i.id,
  'WARNING',
  'OBLIGATION_MARKED_PAID_BUT_INVOICE_UNPAID',
  jsonb_build_object('invoice_status', i.status, 'obligation_status', so.status),
  now()
FROM public.scheduled_obligations so
JOIN public.invoice i ON i.id = so.invoice_id
WHERE so.status = 'PAID'
  AND i.status NOT IN ('paid','overpaid')
UNION ALL
SELECT
  gen_random_uuid(),
  di.customer_id,
  di.schedule_id,
  di.credit_account_id,
  di.obligation_id,
  NULL::uuid,
  'CRITICAL',
  'DUPLICATE_INVOICE_FOR_OBLIGATION',
  jsonb_build_object('invoice_count', di.invoice_count),
  now()
FROM duplicate_invoices di
UNION ALL
SELECT
  gen_random_uuid(),
  so.customer_id,
  so.schedule_id,
  so.credit_account_id,
  so.obligation_id,
  i.id,
  'CRITICAL',
  'CURRENCY_MISMATCH',
  jsonb_build_object('obligation_currency', so.currency_code, 'invoice_currency', i.currency_code),
  now()
FROM public.scheduled_obligations so
JOIN public.invoice i ON i.id = so.invoice_id
WHERE so.currency_code IS DISTINCT FROM i.currency_code;

GRANT SELECT ON public.v_credit_schedule_reconciliation_anomalies TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.has_repayment_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.repayment_due_date(date, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.repayment_status_label(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.repayment_invoice_obligation_type(text, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_repayment_schedule(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_repayment_invoice(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_due_repayment_invoices(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_repayment_obligation_statuses(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pause_repayment_schedule(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.amend_repayment_schedule(uuid, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_repayment_schedules() TO authenticated;

COMMENT ON TABLE public.repayment_schedules IS 'Layer 3D immutable repayment schedules generated from active credit accounts and fully executed contracts.';
COMMENT ON TABLE public.scheduled_obligations IS 'Layer 3D scheduled repayment obligations. Payment state is synchronized from Financial Engine invoices.';
COMMENT ON VIEW public.v_credit_schedule_reconciliation_anomalies IS 'Layer 3D reconciliation anomaly view across schedules, obligations, and Financial Engine invoices.';
