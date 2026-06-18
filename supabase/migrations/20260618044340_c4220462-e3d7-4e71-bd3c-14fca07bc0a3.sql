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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_default_reviews TO authenticated;
GRANT ALL ON public.credit_default_reviews TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_default_evidence TO authenticated;
GRANT ALL ON public.credit_default_evidence TO service_role;

ALTER TABLE public.credit_default_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_default_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Default reviews viewable by authorized admins"
  ON public.credit_default_reviews FOR SELECT TO authenticated
  USING (public.has_default_permission('default.view'));

CREATE POLICY "Default reviews manageable by authorized admins"
  ON public.credit_default_reviews FOR ALL TO authenticated
  USING (public.has_default_permission('default.review'))
  WITH CHECK (public.has_default_permission('default.review'));

CREATE POLICY "Default evidence viewable by authorized admins"
  ON public.credit_default_evidence FOR SELECT TO authenticated
  USING (public.has_default_permission('default.view'));

CREATE POLICY "Default evidence manageable by authorized admins"
  ON public.credit_default_evidence FOR ALL TO authenticated
  USING (public.has_default_permission('default.review'))
  WITH CHECK (public.has_default_permission('default.review'));
