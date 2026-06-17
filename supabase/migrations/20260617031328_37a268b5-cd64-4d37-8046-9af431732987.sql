-- ============================================================
-- Layer 3E - Delinquency, Collections & Credit Risk Operations
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.credit_accounts') IS NULL THEN
    RAISE EXCEPTION 'Layer 3E requires Layer 3A credit_accounts';
  END IF;
  IF to_regclass('public.repayment_schedules') IS NULL THEN
    RAISE EXCEPTION 'Layer 3E requires Layer 3D repayment_schedules';
  END IF;
  IF to_regclass('public.scheduled_obligations') IS NULL THEN
    RAISE EXCEPTION 'Layer 3E requires Layer 3D scheduled_obligations';
  END IF;
  IF to_regclass('public.invoice') IS NULL THEN
    RAISE EXCEPTION 'Layer 3E requires the Financial Engine invoice table';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.default_collections_rules()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'grace_period_days', 3,
    'due_soon_days', 3,
    'late_after_days', 1,
    'collections_queue_after_days', 3,
    'risk_escalation_after_days', 10,
    'default_review_after_days', 30,
    'allow_promise_to_pay', true,
    'allow_partial_recovery', true
  )
$$;

ALTER TABLE public.product_versions
  ADD COLUMN IF NOT EXISTS collections_rules_json jsonb NOT NULL DEFAULT public.default_collections_rules();

UPDATE public.product_versions
SET collections_rules_json = public.default_collections_rules()
WHERE collections_rules_json IS NULL OR collections_rules_json = '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.has_collections_permission(permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_owner()
    OR CASE permission
      WHEN 'collections.view' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer','support','agent_support'])
      WHEN 'collections.assign' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer'])
      WHEN 'collections.contact' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer','support','agent_support'])
      WHEN 'collections.promise' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer','support','agent_support'])
      WHEN 'collections.escalate' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer'])
      WHEN 'collections.close' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer'])
      WHEN 'collections.audit' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'collections.admin' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      ELSE false
    END
$$;

CREATE TABLE IF NOT EXISTS public.credit_collections_cases (
  case_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  credit_account_id uuid NOT NULL REFERENCES public.credit_accounts(credit_account_id) ON DELETE RESTRICT,
  schedule_id uuid REFERENCES public.repayment_schedules(schedule_id) ON DELETE SET NULL,
  obligation_id uuid REFERENCES public.scheduled_obligations(obligation_id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoice(id) ON DELETE SET NULL,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.credit_products(product_id) ON DELETE RESTRICT,
  product_version_id uuid REFERENCES public.product_versions(version_id) ON DELETE SET NULL,
  current_status text NOT NULL DEFAULT 'OPEN' CHECK (current_status IN ('OPEN','ASSIGNED','IN_CONTACT','PROMISE_TO_PAY','PARTIAL_RECOVERY','ESCALATED','DEFAULT_REVIEW','RESOLVED','CLOSED')),
  delinquency_status text NOT NULL DEFAULT 'COLLECTIONS_QUEUE' CHECK (delinquency_status IN ('CURRENT','DUE_SOON','DUE_TODAY','GRACE_PERIOD','LATE','COLLECTIONS_QUEUE','PROMISE_TO_PAY','PARTIALLY_RECOVERED','ESCALATED_RISK','DEFAULT_REVIEW','RESOLVED')),
  severity text NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  total_past_due_amount integer NOT NULL DEFAULT 0 CHECK (total_past_due_amount >= 0),
  currency_code text NOT NULL DEFAULT 'XOF',
  days_past_due integer NOT NULL DEFAULT 0 CHECK (days_past_due >= 0),
  assigned_to uuid,
  escalation_level integer NOT NULL DEFAULT 0 CHECK (escalation_level >= 0),
  risk_level text NOT NULL DEFAULT 'MONITOR' CHECK (risk_level IN ('MONITOR','ELEVATED','HIGH','CRITICAL')),
  score_impact integer NOT NULL DEFAULT 0,
  priority_score integer NOT NULL DEFAULT 0,
  rules_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  request_hash text,
  created_by uuid,
  updated_by uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closure_reason text,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collections_case_closed_reason CHECK (
    (current_status NOT IN ('RESOLVED','CLOSED') AND closed_at IS NULL)
    OR (current_status IN ('RESOLVED','CLOSED') AND closed_at IS NOT NULL AND closure_reason IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.credit_collection_actions (
  action_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.credit_collections_cases(case_id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('CONTACT_ATTEMPT','MANUAL_CALL_NOTE','NOTE','ASSIGNMENT','PROMISE_CREATED','PROMISE_FULFILLED','PROMISE_BROKEN','REMINDER_SENT','RISK_ESCALATION','DEFAULT_REVIEW','CASE_CLOSED','PAYMENT_SYNC','DRIVER_EXPLANATION')),
  actor_id uuid,
  action_note text,
  driver_visible boolean NOT NULL DEFAULT false,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_promises_to_pay (
  promise_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.credit_collections_cases(case_id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  promised_amount integer NOT NULL CHECK (promised_amount > 0),
  currency_code text NOT NULL DEFAULT 'XOF',
  promised_payment_date date NOT NULL,
  promise_status text NOT NULL DEFAULT 'ACTIVE' CHECK (promise_status IN ('ACTIVE','FULFILLED','BROKEN','CANCELLED')),
  created_by uuid,
  fulfilled_at timestamptz,
  broken_at timestamptz,
  idempotency_key text NOT NULL,
  request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_reminders (
  reminder_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.credit_collections_cases(case_id) ON DELETE SET NULL,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  obligation_id uuid REFERENCES public.scheduled_obligations(obligation_id) ON DELETE SET NULL,
  reminder_type text NOT NULL CHECK (reminder_type IN ('DUE_SOON','DUE_TODAY','GRACE_PERIOD','LATE','PROMISE_TO_PAY_REMINDER','BROKEN_PROMISE','ESCALATION_WARNING')),
  channel text NOT NULL DEFAULT 'IN_APP' CHECK (channel IN ('IN_APP','SMS','WHATSAPP','EMAIL','MANUAL_CALL_NOTE')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED','CANCELLED')),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  sent_at timestamptz,
  idempotency_key text NOT NULL,
  request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_risk_escalations (
  escalation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.credit_collections_cases(case_id) ON DELETE CASCADE,
  credit_account_id uuid NOT NULL REFERENCES public.credit_accounts(credit_account_id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  escalation_type text NOT NULL CHECK (escalation_type IN ('SEVERE_DELINQUENCY','REPEATED_LATE_PAYMENT','BROKEN_PROMISE_TO_PAY','FRAUD_FLAG','ASSET_RISK','DRIVER_UNREACHABLE','MULTIPLE_OBLIGATIONS_OVERDUE','DEFAULT_REVIEW_OPENED','RESTRUCTURE_CANDIDATE')),
  severity text NOT NULL DEFAULT 'HIGH' CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED','CANCELLED')),
  score_event_id uuid REFERENCES public.driver_score_events(id) ON DELETE SET NULL,
  created_by uuid,
  idempotency_key text NOT NULL,
  request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_collections_audit_events (
  audit_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.credit_collections_cases(case_id) ON DELETE SET NULL,
  credit_account_id uuid REFERENCES public.credit_accounts(credit_account_id) ON DELETE SET NULL,
  obligation_id uuid REFERENCES public.scheduled_obligations(obligation_id) ON DELETE SET NULL,
  event_type text NOT NULL,
  before_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  actor_id uuid,
  idempotency_key text,
  request_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.credit_collections_cases TO authenticated;
GRANT SELECT ON public.credit_collection_actions TO authenticated;
GRANT SELECT ON public.credit_promises_to_pay TO authenticated;
GRANT SELECT ON public.credit_reminders TO authenticated;
GRANT SELECT ON public.credit_risk_escalations TO authenticated;
GRANT SELECT ON public.credit_collections_audit_events TO authenticated;
GRANT ALL ON public.credit_collections_cases TO service_role;
GRANT ALL ON public.credit_collection_actions TO service_role;
GRANT ALL ON public.credit_promises_to_pay TO service_role;
GRANT ALL ON public.credit_reminders TO service_role;
GRANT ALL ON public.credit_risk_escalations TO service_role;
GRANT ALL ON public.credit_collections_audit_events TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_collections_case_idempotency
  ON public.credit_collections_cases(customer_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_collections_open_case
  ON public.credit_collections_cases(customer_id, credit_account_id, (COALESCE(obligation_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  WHERE current_status NOT IN ('RESOLVED','CLOSED');
CREATE INDEX IF NOT EXISTS idx_credit_collections_cases_queue
  ON public.credit_collections_cases(customer_id, current_status, severity, priority_score DESC, days_past_due DESC);
CREATE INDEX IF NOT EXISTS idx_credit_collections_cases_driver
  ON public.credit_collections_cases(driver_id, current_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_collection_actions_case
  ON public.credit_collection_actions(case_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_collection_action_idempotency
  ON public.credit_collection_actions(customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_promises_idempotency
  ON public.credit_promises_to_pay(customer_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_promises_active_case
  ON public.credit_promises_to_pay(case_id)
  WHERE promise_status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_credit_promises_due
  ON public.credit_promises_to_pay(promise_status, promised_payment_date);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_reminders_idempotency
  ON public.credit_reminders(customer_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_credit_reminders_case
  ON public.credit_reminders(case_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_risk_escalations_idempotency
  ON public.credit_risk_escalations(customer_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_credit_risk_escalations_case
  ON public.credit_risk_escalations(case_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_collections_audit_case
  ON public.credit_collections_audit_events(case_id, created_at DESC);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'credit_collections_cases',
    'credit_promises_to_pay',
    'credit_reminders',
    'credit_risk_escalations'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['credit_collection_actions','credit_collections_audit_events']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_immutable ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_credit_immutable_change()', t, t);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_collections_case_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'collections cases are auditable; close instead of deleting';
  END IF;

  IF OLD.credit_account_id IS DISTINCT FROM NEW.credit_account_id
    OR OLD.driver_id IS DISTINCT FROM NEW.driver_id
    OR OLD.product_id IS DISTINCT FROM NEW.product_id
    OR OLD.product_version_id IS DISTINCT FROM NEW.product_version_id
    OR OLD.obligation_id IS DISTINCT FROM NEW.obligation_id
    OR OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
    RAISE EXCEPTION 'collections case identity is immutable';
  END IF;

  IF OLD.current_status IS DISTINCT FROM NEW.current_status THEN
    NEW.status_changed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_collections_case_guard ON public.credit_collections_cases;
CREATE TRIGGER trg_credit_collections_case_guard
  BEFORE UPDATE OR DELETE ON public.credit_collections_cases
  FOR EACH ROW EXECUTE FUNCTION public.credit_collections_case_guard();

CREATE OR REPLACE FUNCTION public.credit_promise_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'promise-to-pay records are immutable; cancel or break instead';
  END IF;
  IF OLD.case_id IS DISTINCT FROM NEW.case_id
    OR OLD.driver_id IS DISTINCT FROM NEW.driver_id
    OR OLD.promised_amount IS DISTINCT FROM NEW.promised_amount
    OR OLD.currency_code IS DISTINCT FROM NEW.currency_code
    OR OLD.promised_payment_date IS DISTINCT FROM NEW.promised_payment_date THEN
    RAISE EXCEPTION 'promise-to-pay amount/date are immutable after creation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_promise_guard ON public.credit_promises_to_pay;
CREATE TRIGGER trg_credit_promise_guard
  BEFORE UPDATE OR DELETE ON public.credit_promises_to_pay
  FOR EACH ROW EXECUTE FUNCTION public.credit_promise_guard();

CREATE OR REPLACE FUNCTION public.credit_risk_escalation_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'risk escalations are auditable; resolve or cancel instead';
  END IF;
  IF OLD.case_id IS DISTINCT FROM NEW.case_id
    OR OLD.credit_account_id IS DISTINCT FROM NEW.credit_account_id
    OR OLD.driver_id IS DISTINCT FROM NEW.driver_id
    OR OLD.escalation_type IS DISTINCT FROM NEW.escalation_type THEN
    RAISE EXCEPTION 'risk escalation identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_risk_escalation_guard ON public.credit_risk_escalations;
CREATE TRIGGER trg_credit_risk_escalation_guard
  BEFORE UPDATE OR DELETE ON public.credit_risk_escalations
  FOR EACH ROW EXECUTE FUNCTION public.credit_risk_escalation_guard();

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'credit_collections_cases',
    'credit_collection_actions',
    'credit_promises_to_pay',
    'credit_reminders',
    'credit_risk_escalations',
    'credit_collections_audit_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "collections platform owner all" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "collections admins tenant read" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "collections platform owner all" ON public.%I FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner())',
      t
    );
    EXECUTE format(
      'CREATE POLICY "collections admins tenant read" ON public.%I FOR SELECT TO authenticated USING (public.has_collections_permission(''collections.view'') AND customer_id = public.current_customer_id())',
      t
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.collections_rules_for_account(p_credit_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rules jsonb;
BEGIN
  SELECT COALESCE(pv.collections_rules_json, public.default_collections_rules())
    INTO v_rules
  FROM public.credit_accounts ca
  LEFT JOIN public.product_versions pv ON pv.version_id = ca.product_version_id
  WHERE ca.credit_account_id = p_credit_account_id;

  RETURN COALESCE(v_rules, public.default_collections_rules());
END;
$$;

CREATE OR REPLACE FUNCTION public.collections_days_past_due(p_due_date date)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT GREATEST(current_date - p_due_date, 0)
$$;

CREATE OR REPLACE FUNCTION public.collections_delinquency_status(
  p_due_date date,
  p_invoice_status text,
  p_remaining_due integer,
  p_amount_paid integer,
  p_rules jsonb
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_days_past integer := GREATEST(current_date - p_due_date, 0);
  v_days_to_due integer := p_due_date - current_date;
  v_grace integer := COALESCE(NULLIF(p_rules->>'grace_period_days', '')::integer, 0);
  v_due_soon integer := COALESCE(NULLIF(p_rules->>'due_soon_days', '')::integer, 0);
  v_late_after integer := COALESCE(NULLIF(p_rules->>'late_after_days', '')::integer, 1);
  v_queue_after integer := COALESCE(NULLIF(p_rules->>'collections_queue_after_days', '')::integer, 3);
  v_risk_after integer := COALESCE(NULLIF(p_rules->>'risk_escalation_after_days', '')::integer, 10);
  v_default_after integer := COALESCE(NULLIF(p_rules->>'default_review_after_days', '')::integer, 30);
BEGIN
  IF p_due_date IS NULL THEN
    RETURN 'CURRENT';
  END IF;
  IF p_invoice_status IN ('paid','overpaid') OR COALESCE(p_remaining_due, 0) <= 0 THEN
    RETURN 'RESOLVED';
  END IF;
  IF v_days_past >= v_default_after THEN
    RETURN 'DEFAULT_REVIEW';
  END IF;
  IF v_days_past >= v_risk_after THEN
    RETURN 'ESCALATED_RISK';
  END IF;
  IF COALESCE(p_amount_paid, 0) > 0 AND COALESCE(p_remaining_due, 0) > 0 AND v_days_past > 0 THEN
    RETURN 'PARTIALLY_RECOVERED';
  END IF;
  IF v_days_past >= v_queue_after THEN
    RETURN 'COLLECTIONS_QUEUE';
  END IF;
  IF v_days_past > 0 AND v_days_past <= v_grace THEN
    RETURN 'GRACE_PERIOD';
  END IF;
  IF v_days_past >= v_late_after THEN
    RETURN 'LATE';
  END IF;
  IF v_days_to_due = 0 THEN
    RETURN 'DUE_TODAY';
  END IF;
  IF v_days_to_due > 0 AND v_days_to_due <= v_due_soon THEN
    RETURN 'DUE_SOON';
  END IF;
  RETURN 'CURRENT';
END;
$$;

CREATE OR REPLACE FUNCTION public.collections_status_label(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_status
    WHEN 'CURRENT' THEN 'A jour'
    WHEN 'DUE_SOON' THEN 'A payer bientot'
    WHEN 'DUE_TODAY' THEN 'A payer aujourd''hui'
    WHEN 'GRACE_PERIOD' THEN 'En periode de grace'
    WHEN 'LATE' THEN 'En retard'
    WHEN 'COLLECTIONS_QUEUE' THEN 'Action requise'
    WHEN 'PROMISE_TO_PAY' THEN 'Promesse de paiement'
    WHEN 'PARTIALLY_RECOVERED' THEN 'Paiement partiel'
    WHEN 'ESCALATED_RISK' THEN 'Suivi prioritaire'
    WHEN 'DEFAULT_REVIEW' THEN 'Revue en cours'
    WHEN 'RESOLVED' THEN 'Resolu'
    ELSE 'En cours'
  END
$$;

CREATE OR REPLACE FUNCTION public.collections_case_status_label(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_status
    WHEN 'OPEN' THEN 'Ouvert'
    WHEN 'ASSIGNED' THEN 'Assigne'
    WHEN 'IN_CONTACT' THEN 'En contact'
    WHEN 'PROMISE_TO_PAY' THEN 'Promesse de paiement'
    WHEN 'PARTIAL_RECOVERY' THEN 'Recuperation partielle'
    WHEN 'ESCALATED' THEN 'Escalade'
    WHEN 'DEFAULT_REVIEW' THEN 'Revue prioritaire'
    WHEN 'RESOLVED' THEN 'Resolu'
    WHEN 'CLOSED' THEN 'Ferme'
    ELSE 'En cours'
  END
$$;

CREATE OR REPLACE FUNCTION public.collections_severity(p_status text, p_days_past_due integer, p_amount integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_status = 'DEFAULT_REVIEW' THEN 'CRITICAL'
    WHEN p_status = 'ESCALATED_RISK' OR p_days_past_due >= 10 OR p_amount >= 500000 THEN 'HIGH'
    WHEN p_status IN ('COLLECTIONS_QUEUE','PARTIALLY_RECOVERED','LATE') OR p_amount >= 150000 THEN 'MEDIUM'
    ELSE 'LOW'
  END
$$;

CREATE OR REPLACE FUNCTION public.collections_priority_score(
  p_severity text,
  p_days_past_due integer,
  p_amount integer,
  p_broken_promise boolean DEFAULT false,
  p_active_asset boolean DEFAULT false,
  p_multiple_overdue boolean DEFAULT false
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    (CASE p_severity WHEN 'CRITICAL' THEN 1000 WHEN 'HIGH' THEN 700 WHEN 'MEDIUM' THEN 400 ELSE 100 END)
    + LEAST(GREATEST(COALESCE(p_days_past_due, 0), 0) * 12, 360)
    + LEAST(GREATEST(COALESCE(p_amount, 0), 0) / 1000, 500)
    + CASE WHEN p_broken_promise THEN 250 ELSE 0 END
    + CASE WHEN p_active_asset THEN 100 ELSE 0 END
    + CASE WHEN p_multiple_overdue THEN 150 ELSE 0 END
$$;

CREATE OR REPLACE FUNCTION public.collections_audit(
  p_customer_id uuid,
  p_case_id uuid,
  p_credit_account_id uuid,
  p_obligation_id uuid,
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
  v_entity uuid;
BEGIN
  INSERT INTO public.credit_collections_audit_events (
    customer_id, case_id, credit_account_id, obligation_id,
    event_type, before_json, after_json, reason, actor_id,
    idempotency_key, request_hash
  )
  VALUES (
    p_customer_id, p_case_id, p_credit_account_id, p_obligation_id,
    p_event_type, COALESCE(p_before, '{}'::jsonb), COALESCE(p_after, '{}'::jsonb),
    p_reason, auth.uid(), p_idempotency_key, p_request_hash
  )
  RETURNING audit_event_id INTO v_id;

  v_entity := COALESCE(p_case_id, p_obligation_id, p_credit_account_id);
  IF v_entity IS NOT NULL THEN
    PERFORM public.credit_log_event(
      p_customer_id,
      lower(p_event_type),
      'credit_collections',
      v_entity,
      COALESCE(p_before, '{}'::jsonb),
      COALESCE(p_after, '{}'::jsonb),
      jsonb_build_object('case_id', p_case_id, 'credit_account_id', p_credit_account_id, 'obligation_id', p_obligation_id, 'reason', p_reason),
      p_idempotency_key
    );
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.collections_emit_score_event(
  p_customer_id uuid,
  p_driver_id uuid,
  p_event_type text,
  p_delta integer,
  p_entity_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text := p_event_type || ':' || p_entity_id::text;
  v_existing uuid;
  v_id uuid;
BEGIN
  SELECT id INTO v_existing
  FROM public.driver_score_events
  WHERE driver_id = p_driver_id
    AND reason = v_reason
  LIMIT 1;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.driver_score_events (customer_id, driver_id, delta, reason, created_by)
  VALUES (p_customer_id, p_driver_id, p_delta, v_reason, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_credit_collections_case(
  p_credit_account_id uuid,
  p_obligation_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_collections_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.credit_accounts%ROWTYPE;
  v_obligation public.scheduled_obligations%ROWTYPE;
  v_schedule public.repayment_schedules%ROWTYPE;
  v_invoice public.invoice%ROWTYPE;
  v_existing public.credit_collections_cases%ROWTYPE;
  v_case public.credit_collections_cases%ROWTYPE;
  v_rules jsonb;
  v_remaining integer := 0;
  v_days integer := 0;
  v_status text;
  v_case_status text := 'OPEN';
  v_severity text;
  v_priority integer;
  v_multiple boolean := false;
BEGIN
  IF NOT public.has_collections_permission('collections.admin') THEN
    RAISE EXCEPTION 'forbidden: collections.admin required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.credit_collections_cases
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
    RAISE EXCEPTION 'credit account not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_obligation_id IS NOT NULL THEN
    SELECT * INTO v_obligation
    FROM public.scheduled_obligations
    WHERE obligation_id = p_obligation_id
      AND credit_account_id = p_credit_account_id
      AND customer_id = v_account.customer_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'scheduled obligation not found' USING ERRCODE = 'P0002';
    END IF;
    SELECT * INTO v_schedule FROM public.repayment_schedules WHERE schedule_id = v_obligation.schedule_id;
    IF v_obligation.invoice_id IS NOT NULL THEN
      SELECT * INTO v_invoice FROM public.invoice WHERE id = v_obligation.invoice_id;
    END IF;
  ELSE
    SELECT so.* INTO v_obligation
    FROM public.scheduled_obligations so
    LEFT JOIN public.invoice i ON i.id = so.invoice_id
    WHERE so.credit_account_id = p_credit_account_id
      AND so.customer_id = v_account.customer_id
      AND so.status NOT IN ('PAID','CANCELLED','SUPERSEDED')
      AND so.due_date <= current_date
      AND (i.id IS NULL OR i.status NOT IN ('paid','cancelled'))
    ORDER BY so.due_date, so.sequence_number
    LIMIT 1;
    IF FOUND THEN
      SELECT * INTO v_schedule FROM public.repayment_schedules WHERE schedule_id = v_obligation.schedule_id;
      IF v_obligation.invoice_id IS NOT NULL THEN
        SELECT * INTO v_invoice FROM public.invoice WHERE id = v_obligation.invoice_id;
      END IF;
    END IF;
  END IF;

  SELECT * INTO v_existing
  FROM public.credit_collections_cases
  WHERE customer_id = v_account.customer_id
    AND credit_account_id = v_account.credit_account_id
    AND obligation_id IS NOT DISTINCT FROM v_obligation.obligation_id
    AND current_status NOT IN ('RESOLVED','CLOSED')
  LIMIT 1;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  v_rules := public.collections_rules_for_account(v_account.credit_account_id);
  IF v_obligation.obligation_id IS NOT NULL THEN
    v_remaining := CASE
      WHEN v_invoice.id IS NOT NULL THEN COALESCE(v_invoice.remaining_due, GREATEST(v_invoice.total_ttc - v_invoice.amount_paid, 0))
      ELSE v_obligation.amount
    END;
    v_days := public.collections_days_past_due(v_obligation.due_date);
    v_status := public.collections_delinquency_status(v_obligation.due_date, v_invoice.status, v_remaining, COALESCE(v_invoice.amount_paid, 0), v_rules);
  ELSE
    v_status := 'COLLECTIONS_QUEUE';
  END IF;

  IF v_status = 'DEFAULT_REVIEW' THEN
    v_case_status := 'DEFAULT_REVIEW';
  ELSIF v_status = 'ESCALATED_RISK' THEN
    v_case_status := 'ESCALATED';
  ELSIF v_status = 'PARTIALLY_RECOVERED' THEN
    v_case_status := 'PARTIAL_RECOVERY';
  END IF;

  SELECT COUNT(*) > 1 INTO v_multiple
  FROM public.scheduled_obligations so
  LEFT JOIN public.invoice i ON i.id = so.invoice_id
  WHERE so.credit_account_id = v_account.credit_account_id
    AND so.status NOT IN ('PAID','CANCELLED','SUPERSEDED')
    AND so.due_date < current_date
    AND (i.id IS NULL OR i.status NOT IN ('paid','cancelled'));

  v_severity := public.collections_severity(v_status, v_days, v_remaining);
  v_priority := public.collections_priority_score(v_severity, v_days, v_remaining, false, v_account.asset_id IS NOT NULL, v_multiple);

  INSERT INTO public.credit_collections_cases (
    customer_id, credit_account_id, schedule_id, obligation_id, invoice_id,
    driver_id, product_id, product_version_id, current_status, delinquency_status,
    severity, total_past_due_amount, currency_code, days_past_due,
    escalation_level, risk_level, priority_score, rules_snapshot_json,
    idempotency_key, request_hash, created_by, updated_by
  )
  VALUES (
    v_account.customer_id, v_account.credit_account_id, v_schedule.schedule_id,
    v_obligation.obligation_id,
    v_invoice.id,
    v_account.driver_id, v_account.product_id, v_account.product_version_id,
    v_case_status, v_status, v_severity, v_remaining,
    COALESCE(v_obligation.currency_code, v_account.principal_currency_code, 'XOF'),
    v_days,
    CASE WHEN v_case_status IN ('ESCALATED','DEFAULT_REVIEW') THEN 1 ELSE 0 END,
    CASE v_severity WHEN 'CRITICAL' THEN 'CRITICAL' WHEN 'HIGH' THEN 'HIGH' WHEN 'MEDIUM' THEN 'ELEVATED' ELSE 'MONITOR' END,
    v_priority, v_rules,
    p_idempotency_key, p_request_hash, auth.uid(), auth.uid()
  )
  RETURNING * INTO v_case;

  PERFORM public.collections_audit(
    v_case.customer_id, v_case.case_id, v_case.credit_account_id, v_case.obligation_id,
    'COLLECTIONS_CASE_CREATED', '{}'::jsonb, to_jsonb(v_case), p_reason,
    p_idempotency_key, p_request_hash
  );
  PERFORM public.collections_emit_score_event(v_case.customer_id, v_case.driver_id, 'CREDIT_PAYMENT_LATE', -10, v_case.case_id);

  RETURN v_case;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_credit_collections(
  p_credit_account_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TABLE (case_id uuid, obligation_id uuid, delinquency_status text, case_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_case public.credit_collections_cases%ROWTYPE;
  v_rules jsonb;
  v_status text;
  v_case_status text;
  v_remaining integer;
  v_days integer;
  v_amount_paid integer;
  v_severity text;
  v_priority integer;
  v_multiple boolean;
  v_before jsonb;
  v_key text;
  v_active_promise public.credit_promises_to_pay%ROWTYPE;
BEGIN
  IF NOT public.has_collections_permission('collections.admin') THEN
    RAISE EXCEPTION 'forbidden: collections.admin required' USING ERRCODE = '42501';
  END IF;

  FOR v_row IN
    SELECT
      so.*,
      rs.product_id,
      rs.product_version_id,
      rs.schedule_status,
      ca.driver_id,
      ca.asset_id,
      ca.principal_currency_code,
      i.id AS invoice_id,
      i.status AS invoice_status,
      i.total_ttc,
      i.amount_paid,
      i.remaining_due
    FROM public.scheduled_obligations so
    JOIN public.repayment_schedules rs ON rs.schedule_id = so.schedule_id
    JOIN public.credit_accounts ca ON ca.credit_account_id = so.credit_account_id
    LEFT JOIN public.invoice i ON i.id = so.invoice_id
    WHERE rs.schedule_status IN ('ACTIVE','PAUSED')
      AND so.status NOT IN ('CANCELLED','SUPERSEDED')
      AND (p_credit_account_id IS NULL OR so.credit_account_id = p_credit_account_id)
      AND (public.is_platform_owner() OR so.customer_id = public.current_customer_id())
    ORDER BY so.due_date, so.sequence_number
  LOOP
    v_case := NULL;
    v_active_promise := NULL;

    v_rules := public.collections_rules_for_account(v_row.credit_account_id);
    v_amount_paid := COALESCE(v_row.amount_paid, 0);
    v_remaining := CASE
      WHEN v_row.invoice_id IS NOT NULL THEN COALESCE(v_row.remaining_due, GREATEST(COALESCE(v_row.total_ttc, v_row.amount) - v_amount_paid, 0))
      ELSE v_row.amount
    END;
    IF v_row.invoice_status IN ('paid','overpaid') THEN
      v_remaining := 0;
    END IF;

    v_days := public.collections_days_past_due(v_row.due_date);
    v_status := public.collections_delinquency_status(v_row.due_date, v_row.invoice_status, v_remaining, v_amount_paid, v_rules);

    SELECT * INTO v_case
    FROM public.credit_collections_cases c
    WHERE c.customer_id = v_row.customer_id
      AND c.credit_account_id = v_row.credit_account_id
      AND c.obligation_id IS NOT DISTINCT FROM v_row.obligation_id
      AND c.current_status NOT IN ('RESOLVED','CLOSED')
    ORDER BY c.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      SELECT * INTO v_active_promise
      FROM public.credit_promises_to_pay p
      WHERE p.case_id = v_case.case_id
        AND p.promise_status = 'ACTIVE'
      ORDER BY p.created_at DESC
      LIMIT 1
      FOR UPDATE;

      IF FOUND AND v_remaining > 0 THEN
        IF v_active_promise.promised_payment_date < current_date THEN
          v_before := to_jsonb(v_active_promise);
          UPDATE public.credit_promises_to_pay
          SET promise_status = 'BROKEN',
              broken_at = now()
          WHERE promise_id = v_active_promise.promise_id
          RETURNING * INTO v_active_promise;

          INSERT INTO public.credit_collection_actions (customer_id, case_id, action_type, actor_id, action_note, driver_visible, idempotency_key)
          VALUES (v_case.customer_id, v_case.case_id, 'PROMISE_BROKEN', auth.uid(), 'Promise-to-pay broken during collections sync.', false, COALESCE(p_idempotency_key, 'sync') || ':promise-broken:' || v_active_promise.promise_id::text)
          ON CONFLICT DO NOTHING;

          PERFORM public.collections_audit(
            v_case.customer_id, v_case.case_id, v_case.credit_account_id, v_case.obligation_id,
            'PROMISE_TO_PAY_BROKEN', v_before, to_jsonb(v_active_promise), 'promise date passed without payment',
            COALESCE(p_idempotency_key, 'sync') || ':promise-broken:' || v_active_promise.promise_id::text,
            NULL
          );
          PERFORM public.collections_emit_score_event(v_case.customer_id, v_case.driver_id, 'PROMISE_TO_PAY_BROKEN', -20, v_case.case_id);
          v_status := 'ESCALATED_RISK';
        ELSE
          v_status := 'PROMISE_TO_PAY';
        END IF;
      END IF;
    END IF;

    IF v_remaining <= 0 OR v_status = 'RESOLVED' THEN
      IF v_case.case_id IS NOT NULL THEN
        v_before := to_jsonb(v_case);
        UPDATE public.credit_collections_cases
        SET current_status = 'RESOLVED',
            delinquency_status = 'RESOLVED',
            severity = 'LOW',
            total_past_due_amount = 0,
            days_past_due = 0,
            priority_score = 0,
            closed_at = now(),
            closure_reason = 'paid_invoice_synced',
            updated_by = auth.uid()
        WHERE credit_collections_cases.case_id = v_case.case_id
        RETURNING * INTO v_case;

        UPDATE public.credit_promises_to_pay
        SET promise_status = 'FULFILLED',
            fulfilled_at = now()
        WHERE case_id = v_case.case_id
          AND promise_status = 'ACTIVE';

        INSERT INTO public.credit_collection_actions (customer_id, case_id, action_type, actor_id, action_note, driver_visible, idempotency_key)
        VALUES (v_case.customer_id, v_case.case_id, 'PAYMENT_SYNC', auth.uid(), 'Financial Engine payment resolved the collections case.', false, COALESCE(p_idempotency_key, 'sync') || ':resolved:' || v_case.case_id::text)
        ON CONFLICT DO NOTHING;

        PERFORM public.collections_audit(
          v_case.customer_id, v_case.case_id, v_case.credit_account_id, v_case.obligation_id,
          'CASE_RESOLVED', v_before, to_jsonb(v_case), 'Financial Engine invoice paid',
          COALESCE(p_idempotency_key, 'sync') || ':resolved:' || v_case.case_id::text,
          NULL
        );
        PERFORM public.collections_emit_score_event(v_case.customer_id, v_case.driver_id, 'CREDIT_PAYMENT_RECOVERED', 8, v_case.case_id);

        case_id := v_case.case_id;
        obligation_id := v_row.obligation_id;
        delinquency_status := 'RESOLVED';
        case_status := v_case.current_status;
        RETURN NEXT;
      END IF;
      CONTINUE;
    END IF;

    IF v_status NOT IN ('LATE','COLLECTIONS_QUEUE','PROMISE_TO_PAY','PARTIALLY_RECOVERED','ESCALATED_RISK','DEFAULT_REVIEW') THEN
      CONTINUE;
    END IF;

    SELECT COUNT(*) > 1 INTO v_multiple
    FROM public.scheduled_obligations so
    LEFT JOIN public.invoice i ON i.id = so.invoice_id
    WHERE so.credit_account_id = v_row.credit_account_id
      AND so.status NOT IN ('PAID','CANCELLED','SUPERSEDED')
      AND so.due_date < current_date
      AND (i.id IS NULL OR i.status NOT IN ('paid','cancelled'));

    v_case_status := CASE v_status
      WHEN 'PROMISE_TO_PAY' THEN 'PROMISE_TO_PAY'
      WHEN 'PARTIALLY_RECOVERED' THEN 'PARTIAL_RECOVERY'
      WHEN 'ESCALATED_RISK' THEN 'ESCALATED'
      WHEN 'DEFAULT_REVIEW' THEN 'DEFAULT_REVIEW'
      ELSE COALESCE(v_case.current_status, 'OPEN')
    END;
    IF v_case_status IN ('RESOLVED','CLOSED') THEN
      v_case_status := 'OPEN';
    END IF;
    v_severity := public.collections_severity(v_status, v_days, v_remaining);
    v_priority := public.collections_priority_score(v_severity, v_days, v_remaining, v_status = 'ESCALATED_RISK', v_row.asset_id IS NOT NULL, v_multiple);

    IF v_case.case_id IS NULL THEN
      v_key := COALESCE(p_idempotency_key, 'collections-sync') || ':' || v_row.obligation_id::text;
      INSERT INTO public.credit_collections_cases (
        customer_id, credit_account_id, schedule_id, obligation_id, invoice_id,
        driver_id, product_id, product_version_id, current_status, delinquency_status,
        severity, total_past_due_amount, currency_code, days_past_due,
        escalation_level, risk_level, score_impact, priority_score, rules_snapshot_json,
        idempotency_key, created_by, updated_by
      )
      VALUES (
        v_row.customer_id, v_row.credit_account_id, v_row.schedule_id, v_row.obligation_id, v_row.invoice_id,
        v_row.driver_id, v_row.product_id, v_row.product_version_id, v_case_status, v_status,
        v_severity, v_remaining, COALESCE(v_row.currency_code, v_row.principal_currency_code, 'XOF'), v_days,
        CASE WHEN v_case_status IN ('ESCALATED','DEFAULT_REVIEW') THEN 1 ELSE 0 END,
        CASE v_severity WHEN 'CRITICAL' THEN 'CRITICAL' WHEN 'HIGH' THEN 'HIGH' WHEN 'MEDIUM' THEN 'ELEVATED' ELSE 'MONITOR' END,
        CASE WHEN v_status = 'DEFAULT_REVIEW' THEN -35 WHEN v_status = 'ESCALATED_RISK' THEN -25 ELSE -10 END,
        v_priority, v_rules, v_key, auth.uid(), auth.uid()
      )
      RETURNING * INTO v_case;

      PERFORM public.collections_audit(v_case.customer_id, v_case.case_id, v_case.credit_account_id, v_case.obligation_id, 'COLLECTIONS_CASE_CREATED', '{}'::jsonb, to_jsonb(v_case), NULL, v_key, NULL);
      PERFORM public.collections_emit_score_event(v_case.customer_id, v_case.driver_id, 'CREDIT_PAYMENT_LATE', -10, v_case.case_id);
    ELSE
      v_before := to_jsonb(v_case);
      UPDATE public.credit_collections_cases
      SET current_status = v_case_status,
          delinquency_status = v_status,
          severity = v_severity,
          total_past_due_amount = v_remaining,
          days_past_due = v_days,
          escalation_level = CASE WHEN v_case_status = 'DEFAULT_REVIEW' THEN GREATEST(escalation_level, 2) WHEN v_case_status = 'ESCALATED' THEN GREATEST(escalation_level, 1) ELSE escalation_level END,
          risk_level = CASE v_severity WHEN 'CRITICAL' THEN 'CRITICAL' WHEN 'HIGH' THEN 'HIGH' WHEN 'MEDIUM' THEN 'ELEVATED' ELSE 'MONITOR' END,
          score_impact = CASE WHEN v_status = 'DEFAULT_REVIEW' THEN -35 WHEN v_status = 'ESCALATED_RISK' THEN -25 ELSE score_impact END,
          priority_score = v_priority,
          rules_snapshot_json = v_rules,
          updated_by = auth.uid()
      WHERE credit_collections_cases.case_id = v_case.case_id
      RETURNING * INTO v_case;

      IF v_before->>'delinquency_status' IS DISTINCT FROM v_case.delinquency_status
        OR v_before->>'current_status' IS DISTINCT FROM v_case.current_status THEN
        PERFORM public.collections_audit(
          v_case.customer_id, v_case.case_id, v_case.credit_account_id, v_case.obligation_id,
          'DELINQUENCY_STATUS_CHANGED', v_before, to_jsonb(v_case), NULL,
          COALESCE(p_idempotency_key, 'sync') || ':status:' || v_case.case_id::text || ':' || v_case.delinquency_status,
          NULL
        );
      END IF;
    END IF;

    IF v_status = 'ESCALATED_RISK' THEN
      PERFORM public.collections_emit_score_event(v_case.customer_id, v_case.driver_id, 'COLLECTIONS_ESCALATED', -25, v_case.case_id);
    ELSIF v_status = 'DEFAULT_REVIEW' THEN
      PERFORM public.collections_emit_score_event(v_case.customer_id, v_case.driver_id, 'DEFAULT_REVIEW_OPENED', -35, v_case.case_id);
    END IF;

    case_id := v_case.case_id;
    obligation_id := v_row.obligation_id;
    delinquency_status := v_status;
    case_status := v_case.current_status;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_credit_collections_case(
  p_case_id uuid,
  p_assigned_to uuid,
  p_note text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_collections_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case public.credit_collections_cases%ROWTYPE;
  v_before jsonb;
BEGIN
  IF NOT public.has_collections_permission('collections.assign') THEN
    RAISE EXCEPTION 'forbidden: collections.assign required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT c.* INTO v_case
  FROM public.credit_collections_cases c
  WHERE c.case_id = p_case_id
    AND (public.is_platform_owner() OR c.customer_id = public.current_customer_id())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'collections case not found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.credit_collection_actions WHERE customer_id = v_case.customer_id AND idempotency_key = p_idempotency_key) THEN
    RETURN v_case;
  END IF;

  v_before := to_jsonb(v_case);
  UPDATE public.credit_collections_cases
  SET assigned_to = p_assigned_to,
      current_status = CASE WHEN current_status = 'OPEN' THEN 'ASSIGNED' ELSE current_status END,
      updated_by = auth.uid()
  WHERE case_id = p_case_id
  RETURNING * INTO v_case;

  INSERT INTO public.credit_collection_actions (customer_id, case_id, action_type, actor_id, action_note, driver_visible, idempotency_key)
  VALUES (v_case.customer_id, v_case.case_id, 'ASSIGNMENT', auth.uid(), p_note, false, p_idempotency_key);
  PERFORM public.collections_audit(v_case.customer_id, v_case.case_id, v_case.credit_account_id, v_case.obligation_id, 'CASE_ASSIGNED', v_before, to_jsonb(v_case), p_note, p_idempotency_key, p_request_hash);
  RETURN v_case;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_credit_collection_contact(
  p_case_id uuid,
  p_action_note text,
  p_driver_visible boolean DEFAULT false,
  p_action_type text DEFAULT 'CONTACT_ATTEMPT',
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_collection_actions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case public.credit_collections_cases%ROWTYPE;
  v_action public.credit_collection_actions%ROWTYPE;
  v_before jsonb;
BEGIN
  IF NOT public.has_collections_permission('collections.contact') THEN
    RAISE EXCEPTION 'forbidden: collections.contact required' USING ERRCODE = '42501';
  END IF;
  IF p_action_note IS NULL OR length(trim(p_action_note)) < 3 THEN
    RAISE EXCEPTION 'contact note is required';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT c.* INTO v_case
  FROM public.credit_collections_cases c
  WHERE c.case_id = p_case_id
    AND (public.is_platform_owner() OR c.customer_id = public.current_customer_id())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'collections case not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_action
  FROM public.credit_collection_actions
  WHERE customer_id = v_case.customer_id
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_action;
  END IF;

  v_before := to_jsonb(v_case);
  UPDATE public.credit_collections_cases
  SET current_status = CASE WHEN current_status IN ('OPEN','ASSIGNED') THEN 'IN_CONTACT' ELSE current_status END,
      updated_by = auth.uid()
  WHERE case_id = v_case.case_id
  RETURNING * INTO v_case;

  INSERT INTO public.credit_collection_actions (customer_id, case_id, action_type, actor_id, action_note, driver_visible, idempotency_key)
  VALUES (v_case.customer_id, v_case.case_id, COALESCE(NULLIF(p_action_type, ''), 'CONTACT_ATTEMPT'), auth.uid(), trim(p_action_note), COALESCE(p_driver_visible, false), p_idempotency_key)
  RETURNING * INTO v_action;

  PERFORM public.collections_audit(v_case.customer_id, v_case.case_id, v_case.credit_account_id, v_case.obligation_id, 'CONTACT_ATTEMPT_LOGGED', v_before, to_jsonb(v_case), p_action_note, p_idempotency_key, p_request_hash);
  RETURN v_action;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_promise_to_pay(
  p_case_id uuid,
  p_promised_amount integer,
  p_promised_payment_date date,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_promises_to_pay
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case public.credit_collections_cases%ROWTYPE;
  v_promise public.credit_promises_to_pay%ROWTYPE;
  v_rules jsonb;
  v_before jsonb;
BEGIN
  IF NOT public.has_collections_permission('collections.promise') THEN
    RAISE EXCEPTION 'forbidden: collections.promise required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;
  IF p_promised_amount <= 0 THEN
    RAISE EXCEPTION 'promised amount must be positive';
  END IF;
  IF p_promised_payment_date < current_date THEN
    RAISE EXCEPTION 'promised payment date cannot be in the past';
  END IF;

  SELECT * INTO v_promise
  FROM public.credit_promises_to_pay
  WHERE customer_id = public.current_customer_id()
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_promise;
  END IF;

  SELECT c.* INTO v_case
  FROM public.credit_collections_cases c
  WHERE c.case_id = p_case_id
    AND c.current_status NOT IN ('RESOLVED','CLOSED')
    AND (public.is_platform_owner() OR c.customer_id = public.current_customer_id())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'open collections case not found' USING ERRCODE = 'P0002';
  END IF;

  v_rules := COALESCE(NULLIF(v_case.rules_snapshot_json, '{}'::jsonb), public.collections_rules_for_account(v_case.credit_account_id));
  IF NOT COALESCE(NULLIF(v_rules->>'allow_promise_to_pay', '')::boolean, true) THEN
    RAISE EXCEPTION 'promise-to-pay is not enabled for this product version';
  END IF;
  IF EXISTS (SELECT 1 FROM public.credit_promises_to_pay WHERE case_id = p_case_id AND promise_status = 'ACTIVE') THEN
    RAISE EXCEPTION 'an active promise-to-pay already exists for this case';
  END IF;

  INSERT INTO public.credit_promises_to_pay (
    customer_id, case_id, driver_id, promised_amount, currency_code,
    promised_payment_date, created_by, idempotency_key, request_hash
  )
  VALUES (
    v_case.customer_id, v_case.case_id, v_case.driver_id, p_promised_amount,
    v_case.currency_code, p_promised_payment_date, auth.uid(), p_idempotency_key,
    p_request_hash
  )
  RETURNING * INTO v_promise;

  v_before := to_jsonb(v_case);
  UPDATE public.credit_collections_cases
  SET current_status = 'PROMISE_TO_PAY',
      delinquency_status = 'PROMISE_TO_PAY',
      priority_score = GREATEST(priority_score, public.collections_priority_score(severity, days_past_due, total_past_due_amount, false, true, false)),
      updated_by = auth.uid()
  WHERE case_id = v_case.case_id
  RETURNING * INTO v_case;

  INSERT INTO public.credit_collection_actions (customer_id, case_id, action_type, actor_id, action_note, driver_visible, idempotency_key)
  VALUES (
    v_case.customer_id, v_case.case_id, 'PROMISE_CREATED', auth.uid(),
    'Promise-to-pay created for ' || p_promised_amount::text || ' ' || v_case.currency_code || ' on ' || p_promised_payment_date::text,
    true, p_idempotency_key || ':action'
  );

  PERFORM public.collections_audit(v_case.customer_id, v_case.case_id, v_case.credit_account_id, v_case.obligation_id, 'PROMISE_TO_PAY_CREATED', v_before, to_jsonb(v_promise), NULL, p_idempotency_key, p_request_hash);
  RETURN v_promise;
END;
$$;

CREATE OR REPLACE FUNCTION public.break_promise_to_pay(
  p_promise_id uuid,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_promises_to_pay
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_promise public.credit_promises_to_pay%ROWTYPE;
  v_case public.credit_collections_cases%ROWTYPE;
  v_before_promise jsonb;
  v_before_case jsonb;
BEGIN
  IF NOT public.has_collections_permission('collections.promise') THEN
    RAISE EXCEPTION 'forbidden: collections.promise required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT p.* INTO v_promise
  FROM public.credit_promises_to_pay p
  WHERE p.promise_id = p_promise_id
    AND (public.is_platform_owner() OR p.customer_id = public.current_customer_id())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'promise-to-pay not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_promise.promise_status = 'BROKEN' THEN
    RETURN v_promise;
  END IF;
  IF v_promise.promise_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'only active promises can be broken';
  END IF;

  SELECT * INTO v_case
  FROM public.credit_collections_cases
  WHERE case_id = v_promise.case_id
  FOR UPDATE;

  v_before_promise := to_jsonb(v_promise);
  UPDATE public.credit_promises_to_pay
  SET promise_status = 'BROKEN',
      broken_at = now()
  WHERE promise_id = v_promise.promise_id
  RETURNING * INTO v_promise;

  v_before_case := to_jsonb(v_case);
  UPDATE public.credit_collections_cases
  SET current_status = CASE WHEN current_status = 'DEFAULT_REVIEW' THEN current_status ELSE 'ESCALATED' END,
      delinquency_status = CASE WHEN delinquency_status = 'DEFAULT_REVIEW' THEN delinquency_status ELSE 'ESCALATED_RISK' END,
      severity = CASE WHEN severity = 'CRITICAL' THEN severity ELSE 'HIGH' END,
      risk_level = CASE WHEN risk_level = 'CRITICAL' THEN risk_level ELSE 'HIGH' END,
      escalation_level = GREATEST(escalation_level, 1),
      priority_score = priority_score + 250,
      updated_by = auth.uid()
  WHERE case_id = v_case.case_id
  RETURNING * INTO v_case;

  INSERT INTO public.credit_collection_actions (customer_id, case_id, action_type, actor_id, action_note, driver_visible, idempotency_key)
  VALUES (v_case.customer_id, v_case.case_id, 'PROMISE_BROKEN', auth.uid(), COALESCE(p_reason, 'Promise-to-pay broken'), false, p_idempotency_key || ':action')
  ON CONFLICT DO NOTHING;

  PERFORM public.collections_audit(v_case.customer_id, v_case.case_id, v_case.credit_account_id, v_case.obligation_id, 'PROMISE_TO_PAY_BROKEN', v_before_promise, to_jsonb(v_promise), p_reason, p_idempotency_key, p_request_hash);
  PERFORM public.collections_audit(v_case.customer_id, v_case.case_id, v_case.credit_account_id, v_case.obligation_id, 'RISK_ESCALATED', v_before_case, to_jsonb(v_case), 'broken promise-to-pay', p_idempotency_key || ':case', p_request_hash);
  PERFORM public.collections_emit_score_event(v_case.customer_id, v_case.driver_id, 'PROMISE_TO_PAY_BROKEN', -20, v_case.case_id);

  RETURN v_promise;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_credit_collection_reminder(
  p_case_id uuid,
  p_reminder_type text,
  p_channel text DEFAULT 'IN_APP',
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_reminders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case public.credit_collections_cases%ROWTYPE;
  v_reminder public.credit_reminders%ROWTYPE;
  v_title text;
  v_message text;
  v_notification_id uuid;
BEGIN
  IF NOT public.has_collections_permission('collections.contact') THEN
    RAISE EXCEPTION 'forbidden: collections.contact required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_reminder
  FROM public.credit_reminders
  WHERE customer_id = public.current_customer_id()
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_reminder;
  END IF;

  SELECT c.* INTO v_case
  FROM public.credit_collections_cases c
  WHERE c.case_id = p_case_id
    AND (public.is_platform_owner() OR c.customer_id = public.current_customer_id());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'collections case not found' USING ERRCODE = 'P0002';
  END IF;

  v_title := CASE p_reminder_type
    WHEN 'DUE_SOON' THEN 'Paiement a venir'
    WHEN 'DUE_TODAY' THEN 'Paiement attendu aujourd''hui'
    WHEN 'GRACE_PERIOD' THEN 'Periode de grace active'
    WHEN 'LATE' THEN 'Paiement en retard'
    WHEN 'PROMISE_TO_PAY_REMINDER' THEN 'Rappel de promesse de paiement'
    WHEN 'BROKEN_PROMISE' THEN 'Promesse de paiement non respectee'
    WHEN 'ESCALATION_WARNING' THEN 'Suivi prioritaire'
    ELSE 'Rappel paiement'
  END;
  v_message := CASE p_reminder_type
    WHEN 'DUE_SOON' THEN 'Votre prochaine echeance credit approche. Vous pouvez payer via Wave.'
    WHEN 'DUE_TODAY' THEN 'Votre paiement credit est attendu aujourd''hui. Vous pouvez payer maintenant via Wave.'
    WHEN 'GRACE_PERIOD' THEN 'Votre paiement est en periode de grace. Contactez l''equipe DAM si vous avez besoin d''aide.'
    WHEN 'LATE' THEN 'Votre paiement est en retard. Vous pouvez payer maintenant via Wave ou contacter l''equipe DAM.'
    WHEN 'PROMISE_TO_PAY_REMINDER' THEN 'Rappel: votre promesse de paiement arrive bientot.'
    WHEN 'BROKEN_PROMISE' THEN 'Votre promesse de paiement n''a pas ete respectee. Contactez l''equipe DAM pour trouver une solution.'
    WHEN 'ESCALATION_WARNING' THEN 'Votre dossier demande un suivi prioritaire. Contactez l''equipe DAM si vous avez besoin d''aide.'
    ELSE 'Rappel concernant votre paiement credit.'
  END;

  IF COALESCE(p_channel, 'IN_APP') = 'IN_APP' THEN
    INSERT INTO public.notifications (driver_id, customer_id, notification_type, title, message, channel, template_id, variables)
    VALUES (
      v_case.driver_id, v_case.customer_id, 'payment_reminder', v_title, v_message, 'in_app',
      'credit_collections_' || lower(p_reminder_type),
      jsonb_build_object('case_id', v_case.case_id, 'credit_account_id', v_case.credit_account_id, 'obligation_id', v_case.obligation_id)
    )
    RETURNING id INTO v_notification_id;
  END IF;

  INSERT INTO public.credit_reminders (
    customer_id, case_id, driver_id, obligation_id, reminder_type, channel,
    status, notification_id, sent_at, idempotency_key, request_hash
  )
  VALUES (
    v_case.customer_id, v_case.case_id, v_case.driver_id, v_case.obligation_id,
    p_reminder_type, COALESCE(p_channel, 'IN_APP'),
    CASE WHEN COALESCE(p_channel, 'IN_APP') = 'IN_APP' THEN 'SENT' ELSE 'PENDING' END,
    v_notification_id,
    CASE WHEN COALESCE(p_channel, 'IN_APP') = 'IN_APP' THEN now() ELSE NULL END,
    p_idempotency_key, p_request_hash
  )
  RETURNING * INTO v_reminder;

  INSERT INTO public.credit_collection_actions (customer_id, case_id, action_type, actor_id, action_note, driver_visible, idempotency_key)
  VALUES (v_case.customer_id, v_case.case_id, 'REMINDER_SENT', auth.uid(), v_title || ': ' || v_message, false, p_idempotency_key || ':action')
  ON CONFLICT DO NOTHING;

  PERFORM public.collections_audit(v_case.customer_id, v_case.case_id, v_case.credit_account_id, v_case.obligation_id, 'REMINDER_SENT', '{}'::jsonb, to_jsonb(v_reminder), v_message, p_idempotency_key, p_request_hash);
  RETURN v_reminder;
END;
$$;

CREATE OR REPLACE FUNCTION public.escalate_credit_risk(
  p_case_id uuid,
  p_escalation_type text,
  p_reason text,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_risk_escalations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case public.credit_collections_cases%ROWTYPE;
  v_escalation public.credit_risk_escalations%ROWTYPE;
  v_before jsonb;
  v_score_event uuid;
  v_new_status text;
BEGIN
  IF NOT public.has_collections_permission('collections.escalate') THEN
    RAISE EXCEPTION 'forbidden: collections.escalate required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reason is required';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_escalation
  FROM public.credit_risk_escalations
  WHERE customer_id = public.current_customer_id()
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_escalation;
  END IF;

  SELECT c.* INTO v_case
  FROM public.credit_collections_cases c
  WHERE c.case_id = p_case_id
    AND c.current_status NOT IN ('RESOLVED','CLOSED')
    AND (public.is_platform_owner() OR c.customer_id = public.current_customer_id())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'open collections case not found' USING ERRCODE = 'P0002';
  END IF;

  v_new_status := CASE WHEN p_escalation_type = 'DEFAULT_REVIEW_OPENED' THEN 'DEFAULT_REVIEW' ELSE 'ESCALATED' END;
  v_score_event := public.collections_emit_score_event(
    v_case.customer_id,
    v_case.driver_id,
    CASE WHEN p_escalation_type = 'DEFAULT_REVIEW_OPENED' THEN 'DEFAULT_REVIEW_OPENED' ELSE 'COLLECTIONS_ESCALATED' END,
    CASE WHEN p_escalation_type = 'DEFAULT_REVIEW_OPENED' THEN -35 ELSE -25 END,
    v_case.case_id
  );

  INSERT INTO public.credit_risk_escalations (
    customer_id, case_id, credit_account_id, driver_id, escalation_type,
    severity, reason, status, score_event_id, created_by, idempotency_key, request_hash
  )
  VALUES (
    v_case.customer_id, v_case.case_id, v_case.credit_account_id, v_case.driver_id,
    p_escalation_type,
    CASE WHEN p_escalation_type = 'DEFAULT_REVIEW_OPENED' THEN 'CRITICAL' ELSE 'HIGH' END,
    trim(p_reason), 'OPEN', v_score_event, auth.uid(), p_idempotency_key, p_request_hash
  )
  RETURNING * INTO v_escalation;

  v_before := to_jsonb(v_case);
  UPDATE public.credit_collections_cases
  SET current_status = v_new_status,
      delinquency_status = CASE WHEN v_new_status = 'DEFAULT_REVIEW' THEN 'DEFAULT_REVIEW' ELSE 'ESCALATED_RISK' END,
      severity = CASE WHEN v_new_status = 'DEFAULT_REVIEW' THEN 'CRITICAL' ELSE 'HIGH' END,
      risk_level = CASE WHEN v_new_status = 'DEFAULT_REVIEW' THEN 'CRITICAL' ELSE 'HIGH' END,
      escalation_level = CASE WHEN v_new_status = 'DEFAULT_REVIEW' THEN GREATEST(escalation_level, 2) ELSE GREATEST(escalation_level, 1) END,
      priority_score = priority_score + CASE WHEN v_new_status = 'DEFAULT_REVIEW' THEN 350 ELSE 250 END,
      updated_by = auth.uid()
  WHERE case_id = v_case.case_id
  RETURNING * INTO v_case;

  INSERT INTO public.credit_collection_actions (customer_id, case_id, action_type, actor_id, action_note, driver_visible, idempotency_key)
  VALUES (
    v_case.customer_id, v_case.case_id,
    CASE WHEN v_new_status = 'DEFAULT_REVIEW' THEN 'DEFAULT_REVIEW' ELSE 'RISK_ESCALATION' END,
    auth.uid(), trim(p_reason), false, p_idempotency_key || ':action'
  )
  ON CONFLICT DO NOTHING;

  PERFORM public.collections_audit(
    v_case.customer_id, v_case.case_id, v_case.credit_account_id, v_case.obligation_id,
    CASE WHEN v_new_status = 'DEFAULT_REVIEW' THEN 'DEFAULT_REVIEW_OPENED' ELSE 'RISK_ESCALATED' END,
    v_before, to_jsonb(v_case), p_reason, p_idempotency_key, p_request_hash
  );

  RETURN v_escalation;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_default_review(
  p_case_id uuid,
  p_reason text,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_collections_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case public.credit_collections_cases%ROWTYPE;
  v_escalation public.credit_risk_escalations%ROWTYPE;
BEGIN
  SELECT * INTO v_escalation
  FROM public.escalate_credit_risk(
    p_case_id,
    'DEFAULT_REVIEW_OPENED',
    p_reason,
    p_idempotency_key,
    p_request_hash
  );

  SELECT * INTO v_case
  FROM public.credit_collections_cases
  WHERE case_id = p_case_id;

  RETURN v_case;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_credit_collections_case(
  p_case_id uuid,
  p_closure_reason text,
  p_idempotency_key text DEFAULT NULL,
  p_request_hash text DEFAULT NULL
)
RETURNS public.credit_collections_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case public.credit_collections_cases%ROWTYPE;
  v_before jsonb;
BEGIN
  IF NOT public.has_collections_permission('collections.close') THEN
    RAISE EXCEPTION 'forbidden: collections.close required' USING ERRCODE = '42501';
  END IF;
  IF p_closure_reason IS NULL OR length(trim(p_closure_reason)) < 5 THEN
    RAISE EXCEPTION 'closure reason is required';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT c.* INTO v_case
  FROM public.credit_collections_cases c
  WHERE c.case_id = p_case_id
    AND (public.is_platform_owner() OR c.customer_id = public.current_customer_id())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'collections case not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_case.current_status IN ('RESOLVED','CLOSED') THEN
    RETURN v_case;
  END IF;

  v_before := to_jsonb(v_case);
  UPDATE public.credit_collections_cases
  SET current_status = 'CLOSED',
      closed_at = now(),
      closure_reason = trim(p_closure_reason),
      updated_by = auth.uid()
  WHERE case_id = v_case.case_id
  RETURNING * INTO v_case;

  INSERT INTO public.credit_collection_actions (customer_id, case_id, action_type, actor_id, action_note, driver_visible, idempotency_key)
  VALUES (v_case.customer_id, v_case.case_id, 'CASE_CLOSED', auth.uid(), trim(p_closure_reason), false, p_idempotency_key || ':action')
  ON CONFLICT DO NOTHING;

  PERFORM public.collections_audit(v_case.customer_id, v_case.case_id, v_case.credit_account_id, v_case.obligation_id, 'CASE_CLOSED', v_before, to_jsonb(v_case), p_closure_reason, p_idempotency_key, p_request_hash);
  RETURN v_case;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_driver_collections_status()
RETURNS TABLE (
  case_id uuid,
  credit_account_id uuid,
  invoice_id uuid,
  product_name text,
  status_label text,
  status_tone text,
  late_amount integer,
  days_late integer,
  grace_period_days integer,
  next_due_amount integer,
  next_due_date date,
  payment_action_label text,
  consequence_text text,
  can_request_promise boolean,
  active_promise_json jsonb,
  recovery_progress_pct integer,
  driver_message text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH rows AS (
    SELECT
      c.case_id,
      ca.credit_account_id,
      so.obligation_id,
      i.id AS invoice_id,
      cp.name AS product_name,
      COALESCE(c.rules_snapshot_json, public.collections_rules_for_account(ca.credit_account_id)) AS rules_json,
      so.due_date,
      so.amount,
      COALESCE(i.amount_paid, 0) AS amount_paid,
      CASE
        WHEN i.id IS NOT NULL THEN COALESCE(i.remaining_due, GREATEST(i.total_ttc - i.amount_paid, 0))
        ELSE so.amount
      END AS remaining_due,
      i.status AS invoice_status,
      COALESCE(c.delinquency_status, public.collections_delinquency_status(
        so.due_date,
        i.status,
        CASE WHEN i.id IS NOT NULL THEN COALESCE(i.remaining_due, GREATEST(i.total_ttc - i.amount_paid, 0)) ELSE so.amount END,
        COALESCE(i.amount_paid, 0),
        public.collections_rules_for_account(ca.credit_account_id)
      )) AS computed_status,
      c.current_status,
      c.days_past_due,
      p.promise_id,
      p.promised_amount,
      p.promised_payment_date,
      p.promise_status
    FROM public.credit_accounts ca
    JOIN public.credit_products cp ON cp.product_id = ca.product_id
    JOIN public.repayment_schedules rs ON rs.credit_account_id = ca.credit_account_id AND rs.schedule_status IN ('ACTIVE','PAUSED','COMPLETED')
    JOIN public.scheduled_obligations so ON so.schedule_id = rs.schedule_id
    LEFT JOIN public.invoice i ON i.id = so.invoice_id
    LEFT JOIN public.credit_collections_cases c ON c.obligation_id = so.obligation_id AND c.current_status NOT IN ('RESOLVED','CLOSED')
    LEFT JOIN public.credit_promises_to_pay p ON p.case_id = c.case_id AND p.promise_status = 'ACTIVE'
    WHERE ca.driver_id = public.current_driver_id()
      AND so.status NOT IN ('PAID','CANCELLED','SUPERSEDED')
  ),
  ranked AS (
    SELECT *,
      row_number() OVER (
        PARTITION BY credit_account_id
        ORDER BY
          CASE computed_status
            WHEN 'DEFAULT_REVIEW' THEN 1
            WHEN 'ESCALATED_RISK' THEN 2
            WHEN 'PROMISE_TO_PAY' THEN 3
            WHEN 'PARTIALLY_RECOVERED' THEN 4
            WHEN 'COLLECTIONS_QUEUE' THEN 5
            WHEN 'LATE' THEN 6
            WHEN 'GRACE_PERIOD' THEN 7
            WHEN 'DUE_TODAY' THEN 8
            WHEN 'DUE_SOON' THEN 9
            ELSE 10
          END,
          due_date
      ) AS rn
    FROM rows
    WHERE computed_status <> 'CURRENT'
  )
  SELECT
    r.case_id,
    r.credit_account_id,
    r.invoice_id,
    r.product_name,
    public.collections_status_label(r.computed_status) AS status_label,
    CASE
      WHEN r.computed_status IN ('DEFAULT_REVIEW','ESCALATED_RISK','COLLECTIONS_QUEUE','LATE') THEN 'danger'
      WHEN r.computed_status IN ('PROMISE_TO_PAY','PARTIALLY_RECOVERED','GRACE_PERIOD','DUE_TODAY') THEN 'warning'
      WHEN r.computed_status = 'RESOLVED' THEN 'success'
      ELSE 'neutral'
    END AS status_tone,
    GREATEST(COALESCE(r.remaining_due, 0), 0)::integer AS late_amount,
    GREATEST(current_date - r.due_date, 0)::integer AS days_late,
    COALESCE(NULLIF(r.rules_json->>'grace_period_days', '')::integer, 0) AS grace_period_days,
    GREATEST(COALESCE(r.remaining_due, r.amount, 0), 0)::integer AS next_due_amount,
    r.due_date AS next_due_date,
    CASE WHEN r.invoice_id IS NOT NULL THEN 'Payer via Wave' ELSE 'Contacter l''equipe DAM' END AS payment_action_label,
    CASE
      WHEN r.computed_status = 'DEFAULT_REVIEW' THEN 'Votre dossier est en revue. L''equipe DAM vous contactera pour trouver la meilleure suite.'
      WHEN r.computed_status = 'ESCALATED_RISK' THEN 'Votre dossier demande un suivi prioritaire. Contactez l''equipe DAM si vous avez besoin d''aide.'
      WHEN r.computed_status IN ('COLLECTIONS_QUEUE','LATE') THEN 'Un retard peut limiter les nouvelles opportunites de credit. Vous pouvez regulariser maintenant.'
      WHEN r.computed_status = 'GRACE_PERIOD' THEN 'Vous etes encore en periode de grace. Regularisez des que possible.'
      ELSE 'Gardez vos paiements a jour pour proteger votre progression.'
    END AS consequence_text,
    COALESCE(NULLIF(r.rules_json->>'allow_promise_to_pay', '')::boolean, true)
      AND r.case_id IS NOT NULL
      AND r.promise_id IS NULL
      AND r.computed_status IN ('LATE','COLLECTIONS_QUEUE','PARTIALLY_RECOVERED','ESCALATED_RISK') AS can_request_promise,
    CASE WHEN r.promise_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
      'label', 'Promesse active',
      'promised_amount', r.promised_amount,
      'promised_payment_date', r.promised_payment_date,
      'message', 'Promesse de paiement enregistree'
    ) END AS active_promise_json,
    CASE
      WHEN COALESCE(r.amount, 0) <= 0 THEN 0
      ELSE LEAST(100, GREATEST(0, round((COALESCE(r.amount_paid, 0)::numeric / r.amount::numeric) * 100)::integer))
    END AS recovery_progress_pct,
    CASE
      WHEN GREATEST(current_date - r.due_date, 0) > 0 THEN 'Votre paiement est en retard de ' || GREATEST(current_date - r.due_date, 0)::text || ' jour(s).'
      WHEN r.due_date = current_date THEN 'Votre paiement est attendu aujourd''hui.'
      ELSE 'Votre prochaine echeance arrive bientot.'
    END AS driver_message
  FROM ranked r
  WHERE r.rn = 1
  ORDER BY r.due_date;
$$;

CREATE OR REPLACE VIEW public.v_credit_collections_queue AS
SELECT
  c.case_id,
  c.customer_id,
  c.credit_account_id,
  c.schedule_id,
  c.obligation_id,
  c.invoice_id,
  c.driver_id,
  d.full_name AS driver_name,
  d.phone_number AS driver_phone,
  c.product_id,
  cp.product_type,
  cp.name AS product_name,
  c.current_status,
  public.collections_case_status_label(c.current_status) AS current_status_label,
  c.delinquency_status,
  public.collections_status_label(c.delinquency_status) AS delinquency_status_label,
  c.severity,
  c.total_past_due_amount,
  c.currency_code,
  c.days_past_due,
  c.assigned_to,
  c.escalation_level,
  c.risk_level,
  c.score_impact,
  c.priority_score,
  i.status AS invoice_status,
  i.invoice_number,
  i.due_date,
  so.sequence_number,
  p.promise_id AS active_promise_id,
  p.promised_amount,
  p.promised_payment_date,
  p.promise_status,
  e.escalation_id AS open_escalation_id,
  e.escalation_type AS open_escalation_type,
  c.opened_at,
  c.created_at,
  c.updated_at
FROM public.credit_collections_cases c
JOIN public.drivers d ON d.id = c.driver_id
JOIN public.credit_products cp ON cp.product_id = c.product_id
LEFT JOIN public.invoice i ON i.id = c.invoice_id
LEFT JOIN public.scheduled_obligations so ON so.obligation_id = c.obligation_id
LEFT JOIN public.credit_promises_to_pay p ON p.case_id = c.case_id AND p.promise_status = 'ACTIVE'
LEFT JOIN LATERAL (
  SELECT re.*
  FROM public.credit_risk_escalations re
  WHERE re.case_id = c.case_id
    AND re.status = 'OPEN'
  ORDER BY re.created_at DESC
  LIMIT 1
) e ON true
WHERE c.current_status NOT IN ('RESOLVED','CLOSED');

GRANT SELECT ON public.v_credit_collections_queue TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_credit_collections_reconciliation_anomalies AS
WITH overdue_without_case AS (
  SELECT
    so.customer_id,
    NULL::uuid AS case_id,
    so.credit_account_id,
    so.obligation_id,
    so.invoice_id,
    'WARNING'::text AS severity,
    'OVERDUE_INVOICE_WITHOUT_COLLECTION_STATUS'::text AS anomaly_type,
    jsonb_build_object('due_date', so.due_date, 'invoice_status', i.status, 'remaining_due', COALESCE(i.remaining_due, so.amount)) AS details_json
  FROM public.scheduled_obligations so
  JOIN public.repayment_schedules rs ON rs.schedule_id = so.schedule_id
  LEFT JOIN public.invoice i ON i.id = so.invoice_id
  LEFT JOIN public.credit_collections_cases c ON c.obligation_id = so.obligation_id AND c.current_status NOT IN ('RESOLVED','CLOSED')
  WHERE rs.schedule_status IN ('ACTIVE','PAUSED')
    AND so.status NOT IN ('PAID','CANCELLED','SUPERSEDED')
    AND so.due_date < current_date
    AND (i.id IS NULL OR i.status IN ('issued','partial'))
    AND c.case_id IS NULL
),
paid_invoice_open_case AS (
  SELECT
    c.customer_id,
    c.case_id,
    c.credit_account_id,
    c.obligation_id,
    c.invoice_id,
    'CRITICAL'::text AS severity,
    'PAID_INVOICE_WITH_OPEN_COLLECTION_CASE'::text AS anomaly_type,
    jsonb_build_object('case_status', c.current_status, 'invoice_status', i.status) AS details_json
  FROM public.credit_collections_cases c
  JOIN public.invoice i ON i.id = c.invoice_id
  WHERE c.current_status NOT IN ('RESOLVED','CLOSED')
    AND i.status IN ('paid','overpaid')
),
broken_promise_paid_invoice AS (
  SELECT
    c.customer_id,
    c.case_id,
    c.credit_account_id,
    c.obligation_id,
    c.invoice_id,
    'WARNING'::text AS severity,
    'BROKEN_PROMISE_BUT_PAID_INVOICE'::text AS anomaly_type,
    jsonb_build_object('promise_id', p.promise_id, 'invoice_status', i.status) AS details_json
  FROM public.credit_promises_to_pay p
  JOIN public.credit_collections_cases c ON c.case_id = p.case_id
  JOIN public.invoice i ON i.id = c.invoice_id
  WHERE p.promise_status = 'BROKEN'
    AND i.status IN ('paid','overpaid')
),
resolved_unpaid AS (
  SELECT
    c.customer_id,
    c.case_id,
    c.credit_account_id,
    c.obligation_id,
    c.invoice_id,
    'WARNING'::text AS severity,
    'RESOLVED_CASE_WITH_UNPAID_INVOICE'::text AS anomaly_type,
    jsonb_build_object('case_status', c.current_status, 'invoice_status', i.status, 'remaining_due', COALESCE(i.remaining_due, i.total_ttc - i.amount_paid)) AS details_json
  FROM public.credit_collections_cases c
  JOIN public.invoice i ON i.id = c.invoice_id
  WHERE c.current_status IN ('RESOLVED','CLOSED')
    AND i.status NOT IN ('paid','overpaid','cancelled')
    AND COALESCE(i.remaining_due, i.total_ttc - i.amount_paid) > 0
),
case_without_account AS (
  SELECT
    c.customer_id,
    c.case_id,
    c.credit_account_id,
    c.obligation_id,
    c.invoice_id,
    'CRITICAL'::text AS severity,
    'COLLECTION_CASE_WITHOUT_LINKED_CREDIT_ACCOUNT'::text AS anomaly_type,
    jsonb_build_object('case_status', c.current_status) AS details_json
  FROM public.credit_collections_cases c
  LEFT JOIN public.credit_accounts ca ON ca.credit_account_id = c.credit_account_id
  WHERE ca.credit_account_id IS NULL
),
duplicate_open AS (
  SELECT
    c.customer_id,
    NULL::uuid AS case_id,
    c.credit_account_id,
    c.obligation_id,
    NULL::uuid AS invoice_id,
    'CRITICAL'::text AS severity,
    'DUPLICATE_OPEN_CASE_FOR_OBLIGATION'::text AS anomaly_type,
    jsonb_build_object('open_case_count', COUNT(*)) AS details_json
  FROM public.credit_collections_cases c
  WHERE c.current_status NOT IN ('RESOLVED','CLOSED')
  GROUP BY c.customer_id, c.credit_account_id, c.obligation_id
  HAVING COUNT(*) > 1
)
SELECT gen_random_uuid() AS anomaly_id, *, now() AS detected_at FROM overdue_without_case
UNION ALL SELECT gen_random_uuid(), *, now() FROM paid_invoice_open_case
UNION ALL SELECT gen_random_uuid(), *, now() FROM broken_promise_paid_invoice
UNION ALL SELECT gen_random_uuid(), *, now() FROM resolved_unpaid
UNION ALL SELECT gen_random_uuid(), *, now() FROM case_without_account
UNION ALL SELECT gen_random_uuid(), *, now() FROM duplicate_open;

GRANT SELECT ON public.v_credit_collections_reconciliation_anomalies TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.default_collections_rules() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_collections_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.collections_rules_for_account(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.collections_days_past_due(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.collections_delinquency_status(date, text, integer, integer, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.collections_status_label(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.collections_case_status_label(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.collections_severity(text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.collections_priority_score(text, integer, integer, boolean, boolean, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_credit_collections_case(uuid, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_credit_collections(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_credit_collections_case(uuid, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_credit_collection_contact(uuid, text, boolean, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_promise_to_pay(uuid, integer, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.break_promise_to_pay(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_credit_collection_reminder(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.escalate_credit_risk(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_default_review(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_credit_collections_case(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_collections_status() TO authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'credit_collections_cases',
    'credit_collection_actions',
    'credit_promises_to_pay',
    'credit_reminders',
    'credit_risk_escalations',
    'credit_collections_audit_events'
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

COMMENT ON TABLE public.credit_collections_cases IS 'Layer 3E collections cases. Operational state only; Financial Engine invoices remain payment source of truth.';
COMMENT ON TABLE public.credit_promises_to_pay IS 'Layer 3E structured promise-to-pay records. Promises do not mark invoices paid or pause the ledger.';
COMMENT ON TABLE public.credit_reminders IS 'Layer 3E auditable reminder log for in-app and future channels.';
COMMENT ON TABLE public.credit_risk_escalations IS 'Layer 3E risk attention records. Does not declare default or trigger repossession.';
COMMENT ON VIEW public.v_credit_collections_reconciliation_anomalies IS 'Layer 3E reconciliation anomalies between obligations, invoices, promises, and collections cases.';

NOTIFY pgrst, 'reload schema';