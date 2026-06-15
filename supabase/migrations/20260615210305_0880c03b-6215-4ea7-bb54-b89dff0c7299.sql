-- ============================================================
-- Layer 3A — Credit Product Engine Foundation
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_driver_customer_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT customer_id
  FROM public.drivers
  WHERE id = public.current_driver_id()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.has_credit_permission(permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_owner()
    OR CASE permission
      WHEN 'credit.view' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer','support','agent_support'])
      WHEN 'credit.review' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer'])
      WHEN 'credit.approve' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'credit.activate' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'credit.fulfillment' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer'])
      WHEN 'credit.audit' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'credit.admin' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      ELSE false
    END
$$;

CREATE TABLE IF NOT EXISTS public.vendors (
  vendor_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  vendor_name text NOT NULL,
  vendor_type text NOT NULL CHECK (vendor_type IN (
    'FLEET_PROVIDER','VEHICLE_DEALER','MOTORCYCLE_DEALER','PHONE_RETAILER',
    'APPLIANCE_RETAILER','EQUIPMENT_SUPPLIER','FINANCING_PARTNER','OTHER'
  )),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','RETIRED','ARCHIVED')),
  country text NOT NULL DEFAULT 'CI',
  contact_information_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;

CREATE TABLE IF NOT EXISTS public.credit_products (
  product_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES public.vendors(vendor_id) ON DELETE SET NULL,
  product_type text NOT NULL CHECK (product_type IN (
    'CAR_OWNERSHIP','MOTORCYCLE_FINANCING','PHONE_FINANCING','TV_APPLIANCE_FINANCING',
    'EQUIPMENT_FINANCING','FLEET_EXPANSION','OTHER'
  )),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','PAUSED','RETIRED','ARCHIVED')),
  rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  eligibility_rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  term_rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  down_payment_rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  asset_rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  activation_rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility_rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_products_other_draft CHECK (product_type <> 'OTHER' OR status = 'DRAFT')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_products TO authenticated;
GRANT ALL ON public.credit_products TO service_role;

CREATE TABLE IF NOT EXISTS public.product_versions (
  version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.credit_products(product_id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','RETIRED','ARCHIVED')),
  rules_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, version_number),
  CONSTRAINT product_versions_effective_window CHECK (effective_to IS NULL OR effective_to > effective_from)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_versions TO authenticated;
GRANT ALL ON public.product_versions TO service_role;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_product_versions_one_active ON public.product_versions(product_id) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS public.financed_assets (
  asset_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  asset_type text NOT NULL CHECK (asset_type IN ('VEHICLE','MOTORCYCLE','PHONE','APPLIANCE','EQUIPMENT','SERVICE','OTHER')),
  description text NOT NULL,
  serial_number text,
  vin text,
  imei text,
  vendor_id uuid REFERENCES public.vendors(vendor_id) ON DELETE SET NULL,
  purchase_price integer NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  purchase_price_currency_code text NOT NULL DEFAULT 'XOF',
  residual_value integer NOT NULL DEFAULT 0 CHECK (residual_value >= 0),
  residual_value_currency_code text NOT NULL DEFAULT 'XOF',
  asset_condition text NOT NULL DEFAULT 'NEW',
  fulfillment_status text NOT NULL DEFAULT 'PENDING' CHECK (fulfillment_status IN (
    'PENDING','ORDERED','ASSIGNED','INSPECTED','READY_FOR_HANDOVER','DELIVERED',
    'POSSESSION_CONFIRMED','DAMAGED_BEFORE_POSSESSION','LOST_BEFORE_POSSESSION',
    'REPLACEMENT_REQUIRED','CANCELLED','FAILED'
  )),
  possession_status text NOT NULL DEFAULT 'NOT_POSSESSED' CHECK (possession_status IN ('NOT_POSSESSED','PENDING_CONFIRMATION','CONFIRMED','RELEASED')),
  status text NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','ASSIGNED','ACTIVE','RETIRED','ARCHIVED','LOST','DAMAGED')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financed_assets TO authenticated;
GRANT ALL ON public.financed_assets TO service_role;

CREATE TABLE IF NOT EXISTS public.credit_applications (
  application_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.credit_products(product_id) ON DELETE RESTRICT,
  product_version_id uuid NOT NULL REFERENCES public.product_versions(version_id) ON DELETE RESTRICT,
  requested_asset_id uuid REFERENCES public.financed_assets(asset_id) ON DELETE SET NULL,
  requested_terms_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','STARTED','SUBMITTED','UNDER_REVIEW','APPROVED','DECLINED','WITHDRAWN','EXPIRED')),
  snapshot_id uuid,
  kyc_reference_id uuid,
  submitted_at timestamptz,
  expires_at timestamptz,
  idempotency_key text NOT NULL,
  eligibility_result text NOT NULL DEFAULT 'MANUAL_REVIEW' CHECK (eligibility_result IN ('NOT_ELIGIBLE','ALMOST_ELIGIBLE','ELIGIBLE_FOR_REVIEW','ELIGIBLE','MANUAL_REVIEW')),
  eligibility_explanation text NOT NULL DEFAULT 'En attente de vérification.',
  score_snapshot integer CHECK (score_snapshot IS NULL OR (score_snapshot >= 0 AND score_snapshot <= 1000)),
  down_payment_amount integer NOT NULL DEFAULT 0 CHECK (down_payment_amount >= 0),
  down_payment_currency_code text NOT NULL DEFAULT 'XOF',
  created_by uuid,
  updated_by uuid,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, idempotency_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_applications TO authenticated;
GRANT ALL ON public.credit_applications TO service_role;

CREATE TABLE IF NOT EXISTS public.credit_snapshots (
  snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  application_id uuid NOT NULL UNIQUE REFERENCES public.credit_applications(application_id) ON DELETE CASCADE,
  snapshot_json jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_snapshots TO authenticated;
GRANT ALL ON public.credit_snapshots TO service_role;

ALTER TABLE public.credit_applications DROP CONSTRAINT IF EXISTS credit_applications_snapshot_fk;
ALTER TABLE public.credit_applications ADD CONSTRAINT credit_applications_snapshot_fk FOREIGN KEY (snapshot_id) REFERENCES public.credit_snapshots(snapshot_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.credit_asset_assignments (
  assignment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.financed_assets(asset_id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.credit_applications(application_id) ON DELETE CASCADE,
  credit_account_id uuid,
  assignment_status text NOT NULL DEFAULT 'ACTIVE' CHECK (assignment_status IN ('ACTIVE','RELEASED','CANCELLED')),
  idempotency_key text NOT NULL,
  assigned_by uuid,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, idempotency_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_asset_assignments TO authenticated;
GRANT ALL ON public.credit_asset_assignments TO service_role;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_asset_assignment_active ON public.credit_asset_assignments(asset_id) WHERE assignment_status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS public.credit_decisions (
  decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.credit_applications(application_id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('APPROVED','APPROVED_WITH_CONDITIONS','DECLINED','MANUAL_REVIEW')),
  explanation text NOT NULL,
  conditions_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewer_id uuid,
  decision_timestamp timestamptz NOT NULL DEFAULT now(),
  decision_reason_code text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, idempotency_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_decisions TO authenticated;
GRANT ALL ON public.credit_decisions TO service_role;

CREATE TABLE IF NOT EXISTS public.credit_agreements (
  agreement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  application_id uuid NOT NULL UNIQUE REFERENCES public.credit_applications(application_id) ON DELETE CASCADE,
  agreement_snapshot jsonb NOT NULL,
  signed_at timestamptz,
  signed_by_driver_at timestamptz,
  signed_by_admin_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_agreements TO authenticated;
GRANT ALL ON public.credit_agreements TO service_role;

CREATE TABLE IF NOT EXISTS public.fulfillment_records (
  fulfillment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.credit_applications(application_id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.financed_assets(asset_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ORDERED','ASSIGNED','INSPECTED','READY_FOR_HANDOVER','DELIVERED','POSSESSION_CONFIRMED','DAMAGED_BEFORE_POSSESSION','LOST_BEFORE_POSSESSION','REPLACEMENT_REQUIRED','CANCELLED','FAILED')),
  vendor_id uuid REFERENCES public.vendors(vendor_id) ON DELETE SET NULL,
  tracking_reference text,
  possession_confirmed_at timestamptz,
  possession_confirmed_by uuid,
  admin_confirmed_by uuid,
  asset_condition_at_handover text,
  handover_location text,
  handover_photos_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, asset_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fulfillment_records TO authenticated;
GRANT ALL ON public.fulfillment_records TO service_role;

CREATE TABLE IF NOT EXISTS public.activation_packages (
  package_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  application_id uuid NOT NULL UNIQUE REFERENCES public.credit_applications(application_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','READY','BLOCKED','ACTIVATED','FAILED','CANCELLED')),
  validation_status text NOT NULL DEFAULT 'PENDING' CHECK (validation_status IN ('PENDING','PASSED','FAILED')),
  validation_results_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  down_payment_invoice_id uuid REFERENCES public.invoice(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  created_by uuid,
  updated_by uuid,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, idempotency_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activation_packages TO authenticated;
GRANT ALL ON public.activation_packages TO service_role;

CREATE TABLE IF NOT EXISTS public.credit_accounts (
  credit_account_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.credit_products(product_id) ON DELETE RESTRICT,
  product_version_id uuid NOT NULL REFERENCES public.product_versions(version_id) ON DELETE RESTRICT,
  asset_id uuid REFERENCES public.financed_assets(asset_id) ON DELETE SET NULL,
  activation_package_id uuid NOT NULL UNIQUE REFERENCES public.activation_packages(package_id) ON DELETE RESTRICT,
  principal_amount integer NOT NULL DEFAULT 0 CHECK (principal_amount >= 0),
  principal_currency_code text NOT NULL DEFAULT 'XOF',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAST_DUE','SUSPENDED','COMPLETED','DEFAULTED','TERMINATED')),
  idempotency_key text NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, idempotency_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_accounts TO authenticated;
GRANT ALL ON public.credit_accounts TO service_role;

ALTER TABLE public.credit_asset_assignments DROP CONSTRAINT IF EXISTS credit_asset_assignments_account_fk;
ALTER TABLE public.credit_asset_assignments ADD CONSTRAINT credit_asset_assignments_account_fk FOREIGN KEY (credit_account_id) REFERENCES public.credit_accounts(credit_account_id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_account_active_asset ON public.credit_accounts(asset_id) WHERE asset_id IS NOT NULL AND status IN ('ACTIVE','PAST_DUE','SUSPENDED');

CREATE TABLE IF NOT EXISTS public.credit_exposure_profiles (
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  maximum_exposure_limit integer NOT NULL DEFAULT 0 CHECK (maximum_exposure_limit >= 0),
  current_exposure integer NOT NULL DEFAULT 0 CHECK (current_exposure >= 0),
  available_exposure integer NOT NULL DEFAULT 0 CHECK (available_exposure >= 0),
  currency_code text NOT NULL DEFAULT 'XOF',
  last_calculated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, driver_id, currency_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_exposure_profiles TO authenticated;
GRANT ALL ON public.credit_exposure_profiles TO service_role;

CREATE TABLE IF NOT EXISTS public.credit_policy_sets (
  policy_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  policy_name text NOT NULL,
  policy_type text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','PAUSED','RETIRED','ARCHIVED')),
  policy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_policy_sets TO authenticated;
GRANT ALL ON public.credit_policy_sets TO service_role;

CREATE TABLE IF NOT EXISTS public.credit_audit_events (
  audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_type text NOT NULL DEFAULT 'system',
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_audit_events TO authenticated;
GRANT ALL ON public.credit_audit_events TO service_role;

ALTER TABLE public.invoice
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'XOF',
  ADD COLUMN IF NOT EXISTS source_product_id uuid REFERENCES public.credit_products(product_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_credit_account_id uuid REFERENCES public.credit_accounts(credit_account_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_application_id uuid REFERENCES public.credit_applications(application_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS obligation_type text,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

ALTER TABLE public.invoice DROP CONSTRAINT IF EXISTS invoice_credit_obligation_type_check;
ALTER TABLE public.invoice ADD CONSTRAINT invoice_credit_obligation_type_check CHECK (obligation_type IS NULL OR obligation_type IN ('DOWN_PAYMENT','CREDIT_FEE','ACTIVATION_FEE','OWNERSHIP_INSTALLMENT','MOTORCYCLE_INSTALLMENT','PHONE_INSTALLMENT','EQUIPMENT_INSTALLMENT'));

CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_credit_idempotency ON public.invoice(customer_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_credit_application ON public.invoice(source_application_id) WHERE source_application_id IS NOT NULL;

ALTER TABLE public.invoice_audit DROP CONSTRAINT IF EXISTS audit_action_check;
ALTER TABLE public.invoice_audit ADD CONSTRAINT audit_action_check CHECK (action IN ('created','issued','paid','partial','overpaid','cancelled','refunded','draft','wallet_auto_apply','status_changed','updated','reissued','note','fee_changed','regenerated_link','auto_generated','credit_obligation'));

CREATE INDEX IF NOT EXISTS idx_credit_products_customer_status ON public.credit_products(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_product_versions_product_status ON public.product_versions(product_id, status);
CREATE INDEX IF NOT EXISTS idx_financed_assets_customer_status ON public.financed_assets(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_applications_driver ON public.credit_applications(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_applications_customer_status ON public.credit_applications(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_decisions_application ON public.credit_decisions(application_id, decision_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activation_packages_customer_status ON public.activation_packages(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_accounts_driver ON public.credit_accounts(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fulfillment_records_status ON public.fulfillment_records(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_audit_events_entity ON public.credit_audit_events(entity_type, entity_id, created_at DESC);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vendors','credit_products','product_versions','financed_assets','credit_applications','credit_asset_assignments','credit_decisions','fulfillment_records','activation_packages','credit_accounts','credit_exposure_profiles','credit_policy_sets']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_credit_immutable_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Immutable credit business record cannot be updated or deleted'; END; $$;

DROP TRIGGER IF EXISTS trg_credit_snapshots_immutable_update ON public.credit_snapshots;
CREATE TRIGGER trg_credit_snapshots_immutable_update BEFORE UPDATE OR DELETE ON public.credit_snapshots FOR EACH ROW EXECUTE FUNCTION public.prevent_credit_immutable_change();
DROP TRIGGER IF EXISTS trg_credit_agreements_immutable_update ON public.credit_agreements;
CREATE TRIGGER trg_credit_agreements_immutable_update BEFORE UPDATE OR DELETE ON public.credit_agreements FOR EACH ROW EXECUTE FUNCTION public.prevent_credit_immutable_change();

CREATE OR REPLACE FUNCTION public.credit_log_event(
  p_customer_id uuid, p_action text, p_entity_type text, p_entity_id uuid,
  p_before jsonb DEFAULT '{}'::jsonb, p_after jsonb DEFAULT '{}'::jsonb,
  p_metadata jsonb DEFAULT '{}'::jsonb, p_idempotency_key text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.credit_audit_events (customer_id, actor_id, actor_type, action, entity_type, entity_id, before_state, after_state, metadata, idempotency_key)
  VALUES (p_customer_id, auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'authenticated' END, p_action, p_entity_type, p_entity_id, COALESCE(p_before,'{}'::jsonb), COALESCE(p_after,'{}'::jsonb), COALESCE(p_metadata,'{}'::jsonb), p_idempotency_key)
  RETURNING audit_id INTO v_id;
  RETURN v_id;
END; $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vendors','credit_products','product_versions','financed_assets','credit_applications','credit_snapshots','credit_asset_assignments','credit_decisions','credit_agreements','fulfillment_records','activation_packages','credit_accounts','credit_exposure_profiles','credit_policy_sets','credit_audit_events']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "credit platform owner all" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "credit admins manage tenant" ON public.%I', t);
    EXECUTE format('CREATE POLICY "credit platform owner all" ON public.%I FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner())', t);
    EXECUTE format('CREATE POLICY "credit admins manage tenant" ON public.%I FOR ALL TO authenticated USING (public.has_credit_permission(''credit.admin'') AND customer_id = public.current_customer_id()) WITH CHECK (public.has_credit_permission(''credit.admin'') AND customer_id = public.current_customer_id())', t);
  END LOOP;
END; $$;

DROP POLICY IF EXISTS "drivers read active credit products" ON public.credit_products;
CREATE POLICY "drivers read active credit products" ON public.credit_products FOR SELECT TO authenticated USING (status = 'ACTIVE' AND customer_id = public.current_driver_customer_id());
DROP POLICY IF EXISTS "drivers read active product versions" ON public.product_versions;
CREATE POLICY "drivers read active product versions" ON public.product_versions FOR SELECT TO authenticated USING (status = 'ACTIVE' AND customer_id = public.current_driver_customer_id());
DROP POLICY IF EXISTS "drivers read own credit applications" ON public.credit_applications;
CREATE POLICY "drivers read own credit applications" ON public.credit_applications FOR SELECT TO authenticated USING (driver_id = public.current_driver_id());
DROP POLICY IF EXISTS "drivers read own credit snapshots" ON public.credit_snapshots;
CREATE POLICY "drivers read own credit snapshots" ON public.credit_snapshots FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.credit_applications ca WHERE ca.application_id = credit_snapshots.application_id AND ca.driver_id = public.current_driver_id()));
DROP POLICY IF EXISTS "drivers read own credit decisions" ON public.credit_decisions;
CREATE POLICY "drivers read own credit decisions" ON public.credit_decisions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.credit_applications ca WHERE ca.application_id = credit_decisions.application_id AND ca.driver_id = public.current_driver_id()));
DROP POLICY IF EXISTS "drivers read own activation packages" ON public.activation_packages;
CREATE POLICY "drivers read own activation packages" ON public.activation_packages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.credit_applications ca WHERE ca.application_id = activation_packages.application_id AND ca.driver_id = public.current_driver_id()));
DROP POLICY IF EXISTS "drivers read own credit accounts" ON public.credit_accounts;
CREATE POLICY "drivers read own credit accounts" ON public.credit_accounts FOR SELECT TO authenticated USING (driver_id = public.current_driver_id());
DROP POLICY IF EXISTS "drivers read own fulfillment" ON public.fulfillment_records;
CREATE POLICY "drivers read own fulfillment" ON public.fulfillment_records FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.credit_applications ca WHERE ca.application_id = fulfillment_records.application_id AND ca.driver_id = public.current_driver_id()));
DROP POLICY IF EXISTS "drivers read assigned financed assets" ON public.financed_assets;
CREATE POLICY "drivers read assigned financed assets" ON public.financed_assets FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.credit_applications ca WHERE ca.requested_asset_id = financed_assets.asset_id AND ca.driver_id = public.current_driver_id()) OR EXISTS (SELECT 1 FROM public.credit_accounts cc WHERE cc.asset_id = financed_assets.asset_id AND cc.driver_id = public.current_driver_id()));
DROP POLICY IF EXISTS "drivers read own exposure" ON public.credit_exposure_profiles;
CREATE POLICY "drivers read own exposure" ON public.credit_exposure_profiles FOR SELECT TO authenticated USING (driver_id = public.current_driver_id());

CREATE OR REPLACE FUNCTION public.credit_recompute_exposure(p_driver_id uuid, p_customer_id uuid, p_currency_code text DEFAULT 'XOF')
RETURNS public.credit_exposure_profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_current integer := 0; v_pending integer := 0; v_maximum integer := 0; v_profile public.credit_exposure_profiles;
BEGIN
  SELECT COALESCE(SUM(principal_amount),0)::integer INTO v_current FROM public.credit_accounts WHERE driver_id = p_driver_id AND customer_id = p_customer_id AND principal_currency_code = p_currency_code AND status IN ('ACTIVE','PAST_DUE','SUSPENDED');
  SELECT COALESCE(SUM(fa.purchase_price),0)::integer INTO v_pending FROM public.activation_packages ap JOIN public.credit_applications ca ON ca.application_id = ap.application_id LEFT JOIN public.financed_assets fa ON fa.asset_id = ca.requested_asset_id WHERE ca.driver_id = p_driver_id AND ca.customer_id = p_customer_id AND ca.status = 'APPROVED' AND ap.status IN ('PENDING','READY','BLOCKED') AND COALESCE(fa.purchase_price_currency_code, ca.down_payment_currency_code, p_currency_code) = p_currency_code AND NOT EXISTS (SELECT 1 FROM public.credit_accounts cc WHERE cc.activation_package_id = ap.package_id);
  v_current := v_current + v_pending;
  SELECT COALESCE(maximum_exposure_limit,0) INTO v_maximum FROM public.credit_exposure_profiles WHERE driver_id = p_driver_id AND customer_id = p_customer_id AND currency_code = p_currency_code;
  INSERT INTO public.credit_exposure_profiles (driver_id, customer_id, maximum_exposure_limit, current_exposure, available_exposure, currency_code, last_calculated_at)
  VALUES (p_driver_id, p_customer_id, COALESCE(v_maximum,0), v_current, GREATEST(COALESCE(v_maximum,0) - v_current, 0), p_currency_code, now())
  ON CONFLICT (customer_id, driver_id, currency_code) DO UPDATE SET current_exposure = EXCLUDED.current_exposure, available_exposure = EXCLUDED.available_exposure, last_calculated_at = EXCLUDED.last_calculated_at, updated_at = now()
  RETURNING * INTO v_profile;
  RETURN v_profile;
END; $$;

CREATE OR REPLACE FUNCTION public.submit_credit_application(p_product_id uuid, p_requested_asset_id uuid DEFAULT NULL, p_requested_terms_json jsonb DEFAULT '{}'::jsonb, p_kyc_reference_id uuid DEFAULT NULL, p_idempotency_key text DEFAULT NULL)
RETURNS public.credit_applications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_driver public.drivers%ROWTYPE; v_product public.credit_products%ROWTYPE; v_version public.product_versions%ROWTYPE;
  v_asset public.financed_assets%ROWTYPE; v_score_row public.driver_scores%ROWTYPE; v_application public.credit_applications%ROWTYPE;
  v_snapshot_id uuid; v_rules jsonb; v_score integer; v_min_score integer; v_review_score integer; v_gap integer := 0;
  v_eligibility text; v_explanation text; v_down_payment_rule jsonb; v_purchase_amount integer := 0; v_currency text := 'XOF'; v_down_payment integer := 0;
BEGIN
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_driver FROM public.drivers WHERE id = public.current_driver_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'driver profile required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_application FROM public.credit_applications WHERE customer_id = v_driver.customer_id AND idempotency_key = p_idempotency_key LIMIT 1;
  IF FOUND THEN RETURN v_application; END IF;
  SELECT * INTO v_product FROM public.credit_products WHERE product_id = p_product_id AND customer_id = v_driver.customer_id AND status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'active credit product not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_version FROM public.product_versions WHERE product_id = p_product_id AND customer_id = v_driver.customer_id AND status = 'ACTIVE' AND effective_from <= now() AND (effective_to IS NULL OR effective_to > now()) ORDER BY version_number DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'active product version not found' USING ERRCODE = 'P0002'; END IF;
  v_rules := COALESCE(v_version.rules_snapshot_json, v_product.rules_json, '{}'::jsonb);
  IF p_requested_asset_id IS NOT NULL THEN
    SELECT * INTO v_asset FROM public.financed_assets WHERE asset_id = p_requested_asset_id AND customer_id = v_driver.customer_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'financed asset not found' USING ERRCODE = 'P0002'; END IF;
    IF v_asset.status NOT IN ('AVAILABLE','ASSIGNED') THEN RAISE EXCEPTION 'financed asset is not available for assignment' USING ERRCODE = '23514'; END IF;
    v_purchase_amount := v_asset.purchase_price; v_currency := v_asset.purchase_price_currency_code;
  ELSE
    v_purchase_amount := COALESCE(NULLIF(v_rules->>'default_asset_price','')::integer, 0);
    v_currency := COALESCE(NULLIF(v_rules->>'currency_code',''), 'XOF');
  END IF;
  SELECT * INTO v_score_row FROM public.driver_scores WHERE driver_id = v_driver.id ORDER BY updated_at DESC LIMIT 1;
  v_score := v_score_row.current_score;
  v_min_score := COALESCE(NULLIF(v_rules->>'min_score','')::integer, NULL);
  v_review_score := COALESCE(NULLIF(v_rules->>'manual_review_below_score','')::integer, NULL);
  IF v_score IS NULL OR v_min_score IS NULL THEN
    v_eligibility := 'MANUAL_REVIEW'; v_explanation := 'Le score KIRA confirmé doit être disponible avant la revue crédit.';
  ELSE
    v_gap := GREATEST(v_min_score - v_score, 0);
    IF v_gap = 0 THEN v_eligibility := 'ELIGIBLE'; v_explanation := COALESCE(v_rules->>'eligibility_explanation', 'Votre score KIRA confirmé atteint le minimum du produit.');
    ELSIF v_review_score IS NOT NULL AND v_score >= v_review_score THEN v_eligibility := 'ELIGIBLE_FOR_REVIEW'; v_explanation := 'Votre score KIRA confirmé est proche du minimum. Revue manuelle requise.';
    ELSIF v_gap <= 75 THEN v_eligibility := 'ALMOST_ELIGIBLE'; v_explanation := 'Non éligible - voir conditions. Il manque ' || v_gap::text || ' point(s).';
    ELSE v_eligibility := 'NOT_ELIGIBLE'; v_explanation := 'Non éligible - voir conditions. Score minimum requis : ' || v_min_score::text || '.';
    END IF;
  END IF;
  v_down_payment_rule := COALESCE(v_rules->'down_payment', v_product.down_payment_rules_json, '{}'::jsonb);
  IF COALESCE(v_down_payment_rule->>'type','') = 'FIXED' THEN
    v_down_payment := COALESCE(NULLIF(v_down_payment_rule->>'amount','')::integer, 0);
    v_currency := COALESCE(NULLIF(v_down_payment_rule->>'currency_code',''), v_currency);
  ELSIF COALESCE(v_down_payment_rule->>'type','') = 'PERCENTAGE' THEN
    v_down_payment := ROUND(v_purchase_amount * COALESCE(NULLIF(v_down_payment_rule->>'percent','')::numeric, 0) / 100)::integer;
    v_currency := COALESCE(NULLIF(v_down_payment_rule->>'currency_code',''), v_currency);
  ELSE v_down_payment := 0;
  END IF;
  INSERT INTO public.credit_applications (customer_id, driver_id, product_id, product_version_id, requested_asset_id, requested_terms_json, status, kyc_reference_id, submitted_at, expires_at, idempotency_key, eligibility_result, eligibility_explanation, score_snapshot, down_payment_amount, down_payment_currency_code, created_by, updated_by)
  VALUES (v_driver.customer_id, v_driver.id, v_product.product_id, v_version.version_id, p_requested_asset_id, COALESCE(p_requested_terms_json,'{}'::jsonb), 'SUBMITTED', p_kyc_reference_id, now(), now() + interval '30 days', p_idempotency_key, v_eligibility, v_explanation, v_score, v_down_payment, v_currency, auth.uid(), auth.uid())
  RETURNING * INTO v_application;
  IF p_requested_asset_id IS NOT NULL THEN
    INSERT INTO public.credit_asset_assignments (customer_id, asset_id, application_id, assignment_status, idempotency_key, assigned_by) VALUES (v_driver.customer_id, p_requested_asset_id, v_application.application_id, 'ACTIVE', p_idempotency_key || ':asset', auth.uid());
    UPDATE public.financed_assets SET status = 'ASSIGNED', fulfillment_status = CASE WHEN fulfillment_status = 'PENDING' THEN 'ASSIGNED' ELSE fulfillment_status END, updated_by = auth.uid() WHERE asset_id = p_requested_asset_id;
  END IF;
  INSERT INTO public.credit_snapshots (customer_id, application_id, snapshot_json, created_by)
  VALUES (v_driver.customer_id, v_application.application_id, jsonb_build_object('application_id', v_application.application_id, 'driver_id', v_driver.id, 'submitted_at', v_application.submitted_at, 'product_snapshot', jsonb_build_object('product_id', v_product.product_id, 'product_type', v_product.product_type, 'product_name', v_product.name, 'product_status', v_product.status), 'product_version_snapshot', jsonb_build_object('version_id', v_version.version_id, 'version_number', v_version.version_number, 'effective_from', v_version.effective_from, 'effective_to', v_version.effective_to, 'rules_snapshot_json', v_rules), 'eligibility_snapshot', jsonb_build_object('result', v_eligibility, 'explanation', v_explanation, 'score', v_score, 'min_score', v_min_score, 'gap', v_gap, 'source', 'driver_scores.current_score'), 'financial_snapshot', jsonb_build_object('asset_price', v_purchase_amount, 'down_payment_amount', v_down_payment, 'currency_code', v_currency), 'asset_snapshot', CASE WHEN p_requested_asset_id IS NULL THEN NULL ELSE jsonb_build_object('asset_id', v_asset.asset_id, 'asset_type', v_asset.asset_type, 'vendor_id', v_asset.vendor_id, 'purchase_price', v_asset.purchase_price, 'purchase_price_currency_code', v_asset.purchase_price_currency_code, 'asset_condition', v_asset.asset_condition) END, 'kyc_reference_id', p_kyc_reference_id, 'privacy_note', 'Snapshot keeps decision records and references; raw personal documents remain in controlled storage.'), auth.uid())
  RETURNING snapshot_id INTO v_snapshot_id;
  UPDATE public.credit_applications SET snapshot_id = v_snapshot_id WHERE application_id = v_application.application_id RETURNING * INTO v_application;
  PERFORM public.credit_log_event(v_driver.customer_id, 'application_submitted', 'credit_application', v_application.application_id, '{}'::jsonb, to_jsonb(v_application), jsonb_build_object('product_version_id', v_version.version_id, 'score_source', 'driver_scores.current_score'), p_idempotency_key);
  RETURN v_application;
END; $$;

CREATE OR REPLACE FUNCTION public.review_credit_application(p_application_id uuid, p_decision text, p_decision_reason_code text, p_explanation text, p_conditions_json jsonb DEFAULT '{}'::jsonb, p_idempotency_key text DEFAULT NULL)
RETURNS public.credit_decisions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_app public.credit_applications%ROWTYPE; v_decision public.credit_decisions%ROWTYPE; v_reviewer_id uuid; v_new_status text;
BEGIN
  IF NOT public.has_credit_permission('credit.review') THEN RAISE EXCEPTION 'forbidden: credit.review required' USING ERRCODE = '42501'; END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023'; END IF;
  IF p_decision NOT IN ('APPROVED','APPROVED_WITH_CONDITIONS','DECLINED','MANUAL_REVIEW') THEN RAISE EXCEPTION 'invalid decision %', p_decision; END IF;
  SELECT * INTO v_decision FROM public.credit_decisions WHERE idempotency_key = p_idempotency_key AND customer_id = public.current_customer_id() LIMIT 1;
  IF FOUND THEN RETURN v_decision; END IF;
  SELECT * INTO v_app FROM public.credit_applications WHERE application_id = p_application_id AND customer_id = public.current_customer_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit application not found' USING ERRCODE = 'P0002'; END IF;
  SELECT id INTO v_reviewer_id FROM public.admin_users WHERE user_id = auth.uid() LIMIT 1;
  INSERT INTO public.credit_decisions (customer_id, application_id, decision, explanation, conditions_json, reviewer_id, decision_reason_code, idempotency_key)
  VALUES (v_app.customer_id, v_app.application_id, p_decision, p_explanation, COALESCE(p_conditions_json,'{}'::jsonb), v_reviewer_id, p_decision_reason_code, p_idempotency_key)
  RETURNING * INTO v_decision;
  v_new_status := CASE WHEN p_decision IN ('APPROVED','APPROVED_WITH_CONDITIONS') THEN 'APPROVED' WHEN p_decision = 'DECLINED' THEN 'DECLINED' ELSE 'UNDER_REVIEW' END;
  UPDATE public.credit_applications SET status = v_new_status, updated_by = auth.uid(), status_changed_at = now() WHERE application_id = v_app.application_id;
  IF v_new_status IN ('DECLINED','WITHDRAWN','EXPIRED') THEN UPDATE public.credit_asset_assignments SET assignment_status = 'RELEASED', released_at = now(), release_reason = 'application_' || lower(v_new_status) WHERE application_id = v_app.application_id AND assignment_status = 'ACTIVE'; END IF;
  PERFORM public.credit_log_event(v_app.customer_id, 'decision_recorded', 'credit_decision', v_decision.decision_id, to_jsonb(v_app), to_jsonb(v_decision), jsonb_build_object('application_id', v_app.application_id), p_idempotency_key);
  RETURN v_decision;
END; $$;

CREATE OR REPLACE FUNCTION public.create_credit_down_payment_invoice(p_application_id uuid, p_idempotency_key text DEFAULT NULL)
RETURNS public.invoice LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_app public.credit_applications%ROWTYPE; v_driver public.drivers%ROWTYPE; v_invoice public.invoice%ROWTYPE; v_settings public.customer_billing_settings%ROWTYPE;
BEGIN
  IF NOT public.has_credit_permission('credit.activate') THEN RAISE EXCEPTION 'forbidden: credit.activate required' USING ERRCODE = '42501'; END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_invoice FROM public.invoice WHERE customer_id = public.current_customer_id() AND idempotency_key = p_idempotency_key LIMIT 1;
  IF FOUND THEN RETURN v_invoice; END IF;
  SELECT * INTO v_app FROM public.credit_applications WHERE application_id = p_application_id AND customer_id = public.current_customer_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit application not found' USING ERRCODE = 'P0002'; END IF;
  IF v_app.status <> 'APPROVED' THEN RAISE EXCEPTION 'down payment invoice requires approved application'; END IF;
  IF v_app.down_payment_amount <= 0 THEN RAISE EXCEPTION 'application has no down-payment obligation'; END IF;
  SELECT * INTO v_invoice FROM public.invoice WHERE source_application_id = v_app.application_id AND obligation_type = 'DOWN_PAYMENT' LIMIT 1;
  IF FOUND THEN RETURN v_invoice; END IF;
  SELECT * INTO v_driver FROM public.drivers WHERE id = v_app.driver_id;
  SELECT * INTO v_settings FROM public.customer_billing_settings WHERE customer_id = v_app.customer_id;
  INSERT INTO public.invoice (customer_id, driver_id, status, invoice_kind, driver_snapshot_name, driver_snapshot_phone, subtotal_ht, vat_amount, total_ttc, vat_rate_snapshot, vat_enabled_snapshot, legal_name_snapshot, legal_nif_snapshot, legal_rccm_snapshot, legal_address_snapshot, legal_footer_snapshot, notes, currency_code, source_product_id, source_application_id, obligation_type, idempotency_key)
  VALUES (v_app.customer_id, v_app.driver_id, 'issued', 'invoice', v_driver.full_name, v_driver.phone_number, v_app.down_payment_amount, 0, v_app.down_payment_amount, 0, false, v_settings.legal_name, v_settings.legal_nif, v_settings.legal_rccm, v_settings.legal_address, v_settings.legal_footer, 'Layer 3A one-time down-payment obligation. No recurring schedule generated.', v_app.down_payment_currency_code, v_app.product_id, v_app.application_id, 'DOWN_PAYMENT', p_idempotency_key)
  RETURNING * INTO v_invoice;
  INSERT INTO public.invoice_line (invoice_id, customer_id, position, designation, quantity, unit_price, line_total_ht, vat_rate, line_vat, line_total_ttc, metadata)
  VALUES (v_invoice.id, v_app.customer_id, 1, 'Apport initial crédit - activation', 1, v_app.down_payment_amount, v_app.down_payment_amount, 0, 0, v_app.down_payment_amount, jsonb_build_object('source','layer3a_credit','obligation_type','DOWN_PAYMENT','application_id', v_app.application_id));
  INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata) VALUES (v_invoice.id, v_app.customer_id, 'credit_obligation', auth.uid(), 'admin', jsonb_build_object('application_id', v_app.application_id, 'obligation_type', 'DOWN_PAYMENT', 'idempotency_key', p_idempotency_key));
  PERFORM public.credit_log_event(v_app.customer_id, 'down_payment_invoice_created', 'invoice', v_invoice.id, '{}'::jsonb, to_jsonb(v_invoice), jsonb_build_object('application_id', v_app.application_id), p_idempotency_key);
  RETURN v_invoice;
END; $$;

CREATE OR REPLACE FUNCTION public.create_activation_package(p_application_id uuid, p_idempotency_key text DEFAULT NULL, p_request_hash text DEFAULT NULL)
RETURNS public.activation_packages LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_app public.credit_applications%ROWTYPE; v_package public.activation_packages%ROWTYPE; v_decision public.credit_decisions%ROWTYPE; v_invoice public.invoice%ROWTYPE; v_fulfillment public.fulfillment_records%ROWTYPE; v_agreement public.credit_agreements%ROWTYPE; v_blockers text[] := ARRAY[]::text[]; v_requires_physical_asset boolean := false; v_status text := 'READY'; v_validation text := 'PASSED';
BEGIN
  IF NOT public.has_credit_permission('credit.activate') THEN RAISE EXCEPTION 'forbidden: credit.activate required' USING ERRCODE = '42501'; END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_package FROM public.activation_packages WHERE customer_id = public.current_customer_id() AND idempotency_key = p_idempotency_key LIMIT 1;
  IF FOUND THEN RETURN v_package; END IF;
  SELECT * INTO v_app FROM public.credit_applications WHERE application_id = p_application_id AND customer_id = public.current_customer_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit application not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_decision FROM public.credit_decisions WHERE application_id = v_app.application_id ORDER BY decision_timestamp DESC LIMIT 1;
  SELECT * INTO v_invoice FROM public.invoice WHERE source_application_id = v_app.application_id AND obligation_type = 'DOWN_PAYMENT' ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO v_fulfillment FROM public.fulfillment_records WHERE application_id = v_app.application_id ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO v_agreement FROM public.credit_agreements WHERE application_id = v_app.application_id LIMIT 1;
  SELECT COALESCE((asset_rules_json->>'requires_possession_confirmation')::boolean, false) INTO v_requires_physical_asset FROM public.credit_products WHERE product_id = v_app.product_id AND customer_id = v_app.customer_id;
  IF v_app.status <> 'APPROVED' THEN v_blockers := array_append(v_blockers, 'application_not_approved'); END IF;
  IF v_decision.decision NOT IN ('APPROVED','APPROVED_WITH_CONDITIONS') THEN v_blockers := array_append(v_blockers, 'approved_decision_required'); END IF;
  IF v_agreement.agreement_id IS NULL OR v_agreement.signed_at IS NULL THEN v_blockers := array_append(v_blockers, 'signed_agreement_required'); END IF;
  IF v_app.down_payment_amount > 0 AND (v_invoice.id IS NULL OR v_invoice.status <> 'paid') THEN v_blockers := array_append(v_blockers, 'down_payment_not_settled'); END IF;
  IF v_requires_physical_asset AND v_app.requested_asset_id IS NULL THEN v_blockers := array_append(v_blockers, 'asset_assignment_required'); END IF;
  IF v_requires_physical_asset OR v_app.requested_asset_id IS NOT NULL THEN
    IF v_fulfillment.status IN ('DAMAGED_BEFORE_POSSESSION','LOST_BEFORE_POSSESSION') THEN v_blockers := array_append(v_blockers, lower(v_fulfillment.status)); END IF;
    IF v_fulfillment.status IS DISTINCT FROM 'POSSESSION_CONFIRMED' OR v_fulfillment.possession_confirmed_at IS NULL THEN v_blockers := array_append(v_blockers, 'possession_confirmation_required'); END IF;
  END IF;
  IF array_length(v_blockers, 1) IS NOT NULL THEN v_status := 'BLOCKED'; v_validation := 'FAILED'; END IF;
  INSERT INTO public.activation_packages (customer_id, application_id, status, validation_status, validation_results_json, down_payment_invoice_id, idempotency_key, request_hash, created_by, updated_by, status_changed_at)
  VALUES (v_app.customer_id, v_app.application_id, v_status, v_validation, jsonb_build_object('blockers', to_jsonb(v_blockers), 'evaluated_at', now()), v_invoice.id, p_idempotency_key, COALESCE(p_request_hash, encode(digest(p_application_id::text || p_idempotency_key, 'sha256'), 'hex')), auth.uid(), auth.uid(), now())
  ON CONFLICT (application_id) DO UPDATE SET status = EXCLUDED.status, validation_status = EXCLUDED.validation_status, validation_results_json = EXCLUDED.validation_results_json, down_payment_invoice_id = EXCLUDED.down_payment_invoice_id, updated_by = auth.uid(), status_changed_at = now(), updated_at = now()
  RETURNING * INTO v_package;
  PERFORM public.credit_log_event(v_app.customer_id, 'activation_package_evaluated', 'activation_package', v_package.package_id, '{}'::jsonb, to_jsonb(v_package), jsonb_build_object('application_id', v_app.application_id), p_idempotency_key);
  RETURN v_package;
END; $$;

CREATE OR REPLACE FUNCTION public.activate_credit_account(p_application_id uuid, p_idempotency_key text DEFAULT NULL, p_request_hash text DEFAULT NULL)
RETURNS public.credit_accounts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_app public.credit_applications%ROWTYPE; v_package public.activation_packages%ROWTYPE; v_account public.credit_accounts%ROWTYPE; v_asset public.financed_assets%ROWTYPE; v_requires_physical_asset boolean := false; v_principal integer := 0; v_currency text := 'XOF';
BEGIN
  IF NOT public.has_credit_permission('credit.activate') THEN RAISE EXCEPTION 'forbidden: credit.activate required' USING ERRCODE = '42501'; END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_account FROM public.credit_accounts WHERE customer_id = public.current_customer_id() AND idempotency_key = p_idempotency_key LIMIT 1;
  IF FOUND THEN RETURN v_account; END IF;
  SELECT * INTO v_app FROM public.credit_applications WHERE application_id = p_application_id AND customer_id = public.current_customer_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit application not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_package FROM public.activation_packages WHERE application_id = v_app.application_id FOR UPDATE;
  IF NOT FOUND OR v_package.status <> 'READY' THEN
    UPDATE public.activation_packages SET status = 'BLOCKED', validation_status = 'FAILED', validation_results_json = jsonb_build_object('blockers', jsonb_build_array('activation_package_not_ready'), 'evaluated_at', now()), updated_by = auth.uid(), status_changed_at = now() WHERE application_id = v_app.application_id;
    RAISE EXCEPTION 'activation package is not ready';
  END IF;
  SELECT COALESCE((asset_rules_json->>'requires_possession_confirmation')::boolean, false) INTO v_requires_physical_asset FROM public.credit_products WHERE product_id = v_app.product_id AND customer_id = v_app.customer_id;
  IF v_requires_physical_asset AND v_app.requested_asset_id IS NULL THEN
    UPDATE public.activation_packages SET status = 'BLOCKED', validation_status = 'FAILED', validation_results_json = jsonb_build_object('blockers', jsonb_build_array('asset_assignment_required'), 'evaluated_at', now()), updated_by = auth.uid(), status_changed_at = now() WHERE application_id = v_app.application_id;
    RAISE EXCEPTION 'asset assignment is required before activation';
  END IF;
  IF v_app.requested_asset_id IS NOT NULL THEN
    SELECT * INTO v_asset FROM public.financed_assets WHERE asset_id = v_app.requested_asset_id FOR UPDATE;
    v_principal := COALESCE(v_asset.purchase_price, 0); v_currency := COALESCE(v_asset.purchase_price_currency_code, v_app.down_payment_currency_code, 'XOF');
  ELSE
    v_principal := COALESCE((SELECT NULLIF(snapshot_json #>> '{financial_snapshot,asset_price}','')::integer FROM public.credit_snapshots WHERE application_id = v_app.application_id), 0);
    v_currency := v_app.down_payment_currency_code;
  END IF;
  INSERT INTO public.credit_accounts (customer_id, driver_id, product_id, product_version_id, asset_id, activation_package_id, principal_amount, principal_currency_code, status, idempotency_key, activated_at, status_changed_at)
  VALUES (v_app.customer_id, v_app.driver_id, v_app.product_id, v_app.product_version_id, v_app.requested_asset_id, v_package.package_id, v_principal, v_currency, 'ACTIVE', p_idempotency_key, now(), now())
  RETURNING * INTO v_account;
  UPDATE public.invoice SET source_credit_account_id = v_account.credit_account_id WHERE source_application_id = v_app.application_id AND source_credit_account_id IS NULL;
  UPDATE public.activation_packages SET status = 'ACTIVATED', validation_status = 'PASSED', updated_by = auth.uid(), status_changed_at = now() WHERE package_id = v_package.package_id;
  IF v_app.requested_asset_id IS NOT NULL THEN
    UPDATE public.credit_asset_assignments SET credit_account_id = v_account.credit_account_id, updated_at = now() WHERE application_id = v_app.application_id AND assignment_status = 'ACTIVE';
    UPDATE public.financed_assets SET status = 'ACTIVE', fulfillment_status = 'POSSESSION_CONFIRMED', possession_status = 'CONFIRMED', updated_by = auth.uid() WHERE asset_id = v_app.requested_asset_id;
  END IF;
  PERFORM public.credit_recompute_exposure(v_app.driver_id, v_app.customer_id, v_currency);
  PERFORM public.credit_log_event(v_app.customer_id, 'credit_account_activated', 'credit_account', v_account.credit_account_id, to_jsonb(v_package), to_jsonb(v_account), jsonb_build_object('application_id', v_app.application_id, 'request_hash', COALESCE(p_request_hash, v_package.request_hash)), p_idempotency_key);
  RETURN v_account;
END; $$;

GRANT EXECUTE ON FUNCTION public.submit_credit_application(uuid, uuid, jsonb, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_credit_application(uuid, text, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_credit_down_payment_invoice(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_activation_package(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_credit_account(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.credit_recompute_exposure(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_credit_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_driver_customer_id() TO authenticated, service_role;

INSERT INTO public.vendors (vendor_id, customer_id, vendor_name, vendor_type, status, country, contact_information_json) VALUES
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'DAM Africa Fleet', 'FLEET_PROVIDER', 'ACTIVE', 'CI', '{"email":"ops@damafrica.example"}'::jsonb),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Moobi Partner Dealer', 'MOTORCYCLE_DEALER', 'ACTIVE', 'CI', '{}'::jsonb),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Orange CI Retail', 'PHONE_RETAILER', 'ACTIVE', 'CI', '{}'::jsonb)
ON CONFLICT (vendor_id) DO UPDATE SET vendor_name = EXCLUDED.vendor_name, vendor_type = EXCLUDED.vendor_type, status = EXCLUDED.status, updated_at = now();

INSERT INTO public.credit_products (product_id, customer_id, vendor_id, product_type, name, description, status, rules_json, eligibility_rules_json, down_payment_rules_json, asset_rules_json, activation_rules_json, visibility_rules_json) VALUES
  ('31000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'CAR_OWNERSHIP', 'Vehicle Ownership Program', 'Launch path for trusted drivers moving from rental readiness to vehicle ownership.', 'ACTIVE',
   '{"min_score":720,"manual_review_below_score":650,"default_asset_price":4000000,"currency_code":"XOF","down_payment":{"type":"PERCENTAGE","percent":10,"currency_code":"XOF"},"required_documents":["KYC_REFERENCE","DRIVER_LICENSE","PAYMENT_HISTORY"]}'::jsonb,
   '{"min_score":720,"score_source":"driver_scores.current_score"}'::jsonb,
   '{"type":"PERCENTAGE","percent":10,"currency_code":"XOF"}'::jsonb,
   '{"asset_type":"VEHICLE","requires_possession_confirmation":true}'::jsonb,
   '{"requires_signed_agreement":true,"requires_down_payment_paid":true,"requires_possession_confirmed":true}'::jsonb,
   '{"driver_visible":true}'::jsonb),
  ('31000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'MOTORCYCLE_FINANCING', 'Motorcycle Financing', 'Configurable motorcycle financing foundation.', 'ACTIVE',
   '{"min_score":650,"manual_review_below_score":600,"default_asset_price":1500000,"currency_code":"XOF","down_payment":{"type":"PERCENTAGE","percent":15,"currency_code":"XOF"}}'::jsonb,
   '{"min_score":650,"score_source":"driver_scores.current_score"}'::jsonb,
   '{"type":"PERCENTAGE","percent":15,"currency_code":"XOF"}'::jsonb,
   '{"asset_type":"MOTORCYCLE","requires_possession_confirmation":true}'::jsonb,
   '{"requires_signed_agreement":true,"requires_down_payment_paid":true,"requires_possession_confirmed":true}'::jsonb,
   '{"driver_visible":true}'::jsonb),
  ('31000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'PHONE_FINANCING', 'Phone Financing', 'Configurable professional phone financing foundation.', 'ACTIVE',
   '{"min_score":600,"manual_review_below_score":550,"default_asset_price":500000,"currency_code":"XOF","down_payment":{"type":"PERCENTAGE","percent":10,"currency_code":"XOF"}}'::jsonb,
   '{"min_score":600,"score_source":"driver_scores.current_score"}'::jsonb,
   '{"type":"PERCENTAGE","percent":10,"currency_code":"XOF"}'::jsonb,
   '{"asset_type":"PHONE","requires_possession_confirmation":true}'::jsonb,
   '{"requires_signed_agreement":true,"requires_down_payment_paid":true,"requires_possession_confirmed":true}'::jsonb,
   '{"driver_visible":true}'::jsonb),
  ('31000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', NULL, 'TV_APPLIANCE_FINANCING', 'TV & Appliance Financing', 'Configurable consumer goods financing foundation.', 'ACTIVE',
   '{"min_score":600,"manual_review_below_score":550,"default_asset_price":400000,"currency_code":"XOF","down_payment":{"type":"PERCENTAGE","percent":10,"currency_code":"XOF"}}'::jsonb,
   '{"min_score":600,"score_source":"driver_scores.current_score"}'::jsonb,
   '{"type":"PERCENTAGE","percent":10,"currency_code":"XOF"}'::jsonb,
   '{"asset_type":"APPLIANCE","requires_possession_confirmation":true}'::jsonb,
   '{"requires_signed_agreement":true,"requires_down_payment_paid":true,"requires_possession_confirmed":true}'::jsonb,
   '{"driver_visible":true}'::jsonb),
  ('31000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', NULL, 'EQUIPMENT_FINANCING', 'Equipment Financing', 'Configurable equipment financing foundation.', 'DRAFT',
   '{"min_score":650,"manual_review_below_score":600,"default_asset_price":800000,"currency_code":"XOF","down_payment":{"type":"PERCENTAGE","percent":20,"currency_code":"XOF"}}'::jsonb,
   '{"min_score":650,"score_source":"driver_scores.current_score"}'::jsonb,
   '{"type":"PERCENTAGE","percent":20,"currency_code":"XOF"}'::jsonb,
   '{"asset_type":"EQUIPMENT","requires_possession_confirmation":true}'::jsonb,
   '{"requires_signed_agreement":true,"requires_down_payment_paid":true,"requires_possession_confirmed":true}'::jsonb,
   '{"driver_visible":false}'::jsonb)
ON CONFLICT (product_id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, status = EXCLUDED.status, rules_json = EXCLUDED.rules_json, eligibility_rules_json = EXCLUDED.eligibility_rules_json, down_payment_rules_json = EXCLUDED.down_payment_rules_json, asset_rules_json = EXCLUDED.asset_rules_json, activation_rules_json = EXCLUDED.activation_rules_json, visibility_rules_json = EXCLUDED.visibility_rules_json, updated_at = now();

INSERT INTO public.product_versions (version_id, customer_id, product_id, version_number, effective_from, effective_to, status, rules_snapshot_json)
SELECT seeded.version_id, cp.customer_id, cp.product_id, 1, '2026-06-15T00:00:00Z'::timestamptz, NULL, 'ACTIVE', cp.rules_json
FROM (VALUES
    ('32000000-0000-0000-0000-000000000001'::uuid, '31000000-0000-0000-0000-000000000001'::uuid),
    ('32000000-0000-0000-0000-000000000002'::uuid, '31000000-0000-0000-0000-000000000002'::uuid),
    ('32000000-0000-0000-0000-000000000003'::uuid, '31000000-0000-0000-0000-000000000003'::uuid),
    ('32000000-0000-0000-0000-000000000004'::uuid, '31000000-0000-0000-0000-000000000004'::uuid),
    ('32000000-0000-0000-0000-000000000005'::uuid, '31000000-0000-0000-0000-000000000005'::uuid)
) AS seeded(version_id, product_id)
JOIN public.credit_products cp ON cp.product_id = seeded.product_id
ON CONFLICT (version_id) DO UPDATE SET rules_snapshot_json = EXCLUDED.rules_snapshot_json, status = EXCLUDED.status, updated_at = now();

INSERT INTO public.financed_assets (asset_id, customer_id, asset_type, description, vendor_id, purchase_price, purchase_price_currency_code, residual_value, residual_value_currency_code, asset_condition, fulfillment_status, possession_status, status) VALUES
  ('33000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'VEHICLE', 'Suzuki Dzire', '30000000-0000-0000-0000-000000000001', 4000000, 'XOF', 1200000, 'XOF', 'NEW', 'PENDING', 'NOT_POSSESSED', 'AVAILABLE'),
  ('33000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'MOTORCYCLE', 'Motorcycle launch asset', '30000000-0000-0000-0000-000000000002', 1500000, 'XOF', 300000, 'XOF', 'NEW', 'PENDING', 'NOT_POSSESSED', 'AVAILABLE'),
  ('33000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'PHONE', 'iPhone 13', '30000000-0000-0000-0000-000000000003', 500000, 'XOF', 100000, 'XOF', 'NEW', 'PENDING', 'NOT_POSSESSED', 'AVAILABLE')
ON CONFLICT (asset_id) DO UPDATE SET description = EXCLUDED.description, vendor_id = EXCLUDED.vendor_id, purchase_price = EXCLUDED.purchase_price, purchase_price_currency_code = EXCLUDED.purchase_price_currency_code, residual_value = EXCLUDED.residual_value, residual_value_currency_code = EXCLUDED.residual_value_currency_code, updated_at = now();

INSERT INTO public.credit_policy_sets (policy_id, customer_id, policy_name, policy_type, status, policy_json, effective_from) VALUES
  ('34000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Layer 3A Exposure Foundation', 'EXPOSURE_POLICY', 'DRAFT', '{"evaluation_layer":"3B","note":"Stored in 3A, not enforced until policy engine layer."}'::jsonb, '2026-06-15T00:00:00Z'::timestamptz)
ON CONFLICT (policy_id) DO UPDATE SET policy_json = EXCLUDED.policy_json, status = EXCLUDED.status, updated_at = now();