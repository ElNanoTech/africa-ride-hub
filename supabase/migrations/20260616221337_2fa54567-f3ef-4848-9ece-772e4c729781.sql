-- ============================================================
-- Layer 3C — Contracting & E-Signature Engine
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.product_versions') IS NULL THEN
    RAISE EXCEPTION 'Layer 3C requires Layer 3A product_versions';
  END IF;
  IF to_regclass('public.underwriting_decisions') IS NULL THEN
    RAISE EXCEPTION 'Layer 3C requires Layer 3B underwriting_decisions';
  END IF;
  IF to_regclass('public.credit_agreements') IS NULL THEN
    RAISE EXCEPTION 'Layer 3C requires Layer 3A credit_agreements';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_contract_permission(permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_owner()
    OR CASE permission
      WHEN 'contracts.view' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer','support','agent_support'])
      WHEN 'contracts.generate' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer'])
      WHEN 'contracts.send' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer'])
      WHEN 'contracts.sign_admin' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'contracts.void' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'contracts.upload_manual' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'contracts.download' THEN public.has_admin_role_in(ARRAY['super_admin','manager','agent_pret','loan_officer'])
      WHEN 'contracts.audit' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      WHEN 'contracts.admin' THEN public.has_admin_role_in(ARRAY['super_admin','manager'])
      ELSE false
    END
$$;

ALTER TABLE public.product_versions
  ADD COLUMN IF NOT EXISTS contract_requirements_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.contract_templates (
  template_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.credit_products(product_id) ON DELETE CASCADE,
  product_version_id uuid REFERENCES public.product_versions(version_id) ON DELETE CASCADE,
  template_name text NOT NULL,
  template_type text NOT NULL DEFAULT 'CREDIT_AGREEMENT',
  language text NOT NULL DEFAULT 'fr-CI',
  country text NOT NULL DEFAULT 'CI',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','RETIRED','ARCHIVED')),
  template_body text NOT NULL,
  plain_language_summary text NOT NULL DEFAULT '',
  summary_version text NOT NULL DEFAULT '1',
  required_signers_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_fields_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_templates_window CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TABLE IF NOT EXISTS public.credit_contracts (
  contract_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.credit_applications(application_id) ON DELETE CASCADE,
  decision_id uuid NOT NULL REFERENCES public.underwriting_decisions(decision_id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.credit_products(product_id) ON DELETE RESTRICT,
  product_version_id uuid NOT NULL REFERENCES public.product_versions(version_id) ON DELETE RESTRICT,
  template_id uuid NOT NULL REFERENCES public.contract_templates(template_id) ON DELETE RESTRICT,
  template_version integer NOT NULL,
  contract_status text NOT NULL DEFAULT 'DRAFT_CREATED' CHECK (contract_status IN (
    'NOT_REQUIRED','DRAFT_PENDING','DRAFT_CREATED','SENT_FOR_SIGNATURE','VIEWED',
    'PARTIALLY_EXECUTED','FULLY_EXECUTED','EXPIRED','DECLINED_BY_DRIVER',
    'VOIDED','CANCELLED','SUPERSEDED'
  )),
  contract_snapshot_json jsonb NOT NULL,
  contract_hash text NOT NULL,
  snapshot_hash text NOT NULL,
  signature_hash text,
  final_pdf_hash text,
  signature_provider text NOT NULL DEFAULT 'INTERNAL' CHECK (signature_provider IN (
    'INTERNAL','DOCUSIGN_FUTURE','ADOBE_SIGN_FUTURE','LOCAL_PROVIDER_FUTURE','MANUAL_UPLOAD'
  )),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.financed_assets(asset_id) ON DELETE SET NULL,
  credit_account_id uuid REFERENCES public.credit_accounts(credit_account_id) ON DELETE SET NULL,
  sent_at timestamptz,
  viewed_at timestamptz,
  driver_signed_at timestamptz,
  admin_signed_at timestamptz,
  fully_executed_at timestamptz,
  expires_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  declined_at timestamptz,
  decline_reason text,
  superseded_by_contract_id uuid REFERENCES public.credit_contracts(contract_id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  created_by uuid,
  updated_by uuid,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.contract_audit_events (
  audit_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.credit_contracts(contract_id) ON DELETE CASCADE,
  actor_id uuid,
  actor_type text NOT NULL CHECK (actor_type IN ('SYSTEM','DRIVER','ADMIN','MANAGER','EXECUTIVE','VENDOR','WITNESS','COMPLIANCE')),
  event_type text NOT NULL,
  before_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contract_signature_events (
  signature_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.credit_contracts(contract_id) ON DELETE CASCADE,
  signer_id uuid,
  signer_type text NOT NULL CHECK (signer_type IN ('SYSTEM','DRIVER','ADMIN','MANAGER','EXECUTIVE','GUARANTOR','VENDOR','WITNESS')),
  signer_sequence integer NOT NULL DEFAULT 0 CHECK (signer_sequence >= 0),
  signature_status text NOT NULL CHECK (signature_status IN ('SENT','VIEWED','SIGNED','DECLINED','EXPIRED','VOIDED','MANUAL_UPLOADED')),
  signature_method text NOT NULL DEFAULT 'INTERNAL_CLICKWRAP',
  signature_provider text NOT NULL DEFAULT 'INTERNAL',
  event_at timestamptz NOT NULL DEFAULT now(),
  signed_at timestamptz,
  signed_contract_hash text,
  consent_text_snapshot text,
  consent_summary_version text,
  language_displayed text NOT NULL DEFAULT 'fr-CI',
  device_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address_encrypted text,
  audit_event_id uuid REFERENCES public.contract_audit_events(audit_event_id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.contract_files (
  file_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.credit_contracts(contract_id) ON DELETE CASCADE,
  file_type text NOT NULL CHECK (file_type IN ('HTML_SNAPSHOT','EXECUTED_PDF','ADMIN_COPY','DRIVER_COPY','MANUAL_UPLOAD')),
  storage_reference text NOT NULL,
  file_hash text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, file_type, file_hash)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_templates TO authenticated;
GRANT ALL ON public.contract_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_contracts TO authenticated;
GRANT ALL ON public.credit_contracts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_audit_events TO authenticated;
GRANT ALL ON public.contract_audit_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_signature_events TO authenticated;
GRANT ALL ON public.contract_signature_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_files TO authenticated;
GRANT ALL ON public.contract_files TO service_role;

ALTER TABLE public.credit_agreements
  DROP CONSTRAINT IF EXISTS credit_agreements_application_id_key;

ALTER TABLE public.credit_agreements
  ADD COLUMN IF NOT EXISTS contract_id uuid,
  ADD COLUMN IF NOT EXISTS decision_id uuid,
  ADD COLUMN IF NOT EXISTS product_id uuid,
  ADD COLUMN IF NOT EXISTS product_version_id uuid,
  ADD COLUMN IF NOT EXISTS template_id uuid,
  ADD COLUMN IF NOT EXISTS template_version integer,
  ADD COLUMN IF NOT EXISTS asset_id uuid,
  ADD COLUMN IF NOT EXISTS contract_hash text,
  ADD COLUMN IF NOT EXISTS snapshot_hash text,
  ADD COLUMN IF NOT EXISTS signature_hash text,
  ADD COLUMN IF NOT EXISTS final_pdf_hash text,
  ADD COLUMN IF NOT EXISTS agreement_status text NOT NULL DEFAULT 'ACTIVE';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'credit_agreements_contract_id_fkey'
      AND conrelid = 'public.credit_agreements'::regclass
  ) THEN
    ALTER TABLE public.credit_agreements
      ADD CONSTRAINT credit_agreements_contract_id_fkey
      FOREIGN KEY (contract_id) REFERENCES public.credit_contracts(contract_id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_contracts_current
  ON public.credit_contracts(application_id)
  WHERE contract_status IN ('DRAFT_PENDING','DRAFT_CREATED','SENT_FOR_SIGNATURE','VIEWED','PARTIALLY_EXECUTED','FULLY_EXECUTED');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_credit_agreements_contract
  ON public.credit_agreements(contract_id)
  WHERE contract_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contract_templates_product_active
  ON public.contract_templates(product_id, product_version_id, status, version DESC);
CREATE INDEX IF NOT EXISTS idx_credit_contracts_application_status
  ON public.credit_contracts(application_id, contract_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_contracts_driver_status
  ON public.credit_contracts(driver_id, contract_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_signature_events_contract
  ON public.contract_signature_events(contract_id, signer_type, signature_status, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_audit_events_contract
  ON public.contract_audit_events(contract_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_files_contract
  ON public.contract_files(contract_id, file_type);
CREATE INDEX IF NOT EXISTS idx_credit_agreements_application_signed
  ON public.credit_agreements(application_id, signed_at DESC);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contract_templates','credit_contracts']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['contract_signature_events','contract_audit_events','contract_files']
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
    'contract_templates','credit_contracts','contract_signature_events',
    'contract_audit_events','contract_files'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "contracts platform owner all" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "contracts admins tenant" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "contracts platform owner all" ON public.%I FOR ALL TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner())',
      t
    );
    EXECUTE format(
      'CREATE POLICY "contracts admins tenant" ON public.%I FOR ALL TO authenticated USING (public.has_contract_permission(''contracts.view'') AND customer_id = public.current_customer_id()) WITH CHECK (public.has_contract_permission(''contracts.generate'') AND customer_id = public.current_customer_id())',
      t
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.contract_normalize_required_signers(p_required jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '[]'::jsonb;
  v_value jsonb;
  v_ordinality integer;
  v_signer_type text;
  v_sequence integer;
  v_label text;
BEGIN
  IF jsonb_typeof(COALESCE(p_required, '[]'::jsonb)) <> 'array' THEN
    RETURN '[]'::jsonb;
  END IF;

  FOR v_value, v_ordinality IN
    SELECT value, ordinality::integer
    FROM jsonb_array_elements(p_required) WITH ORDINALITY
  LOOP
    IF jsonb_typeof(v_value) = 'string' THEN
      v_signer_type := upper(trim(both '"' FROM v_value::text));
      v_sequence := v_ordinality;
      v_label := CASE v_signer_type
        WHEN 'DRIVER' THEN 'Signature conducteur'
        WHEN 'ADMIN' THEN 'Signature equipe KIRA'
        WHEN 'MANAGER' THEN 'Validation manager'
        WHEN 'EXECUTIVE' THEN 'Validation direction'
        ELSE initcap(lower(v_signer_type))
      END;
    ELSE
      v_signer_type := upper(COALESCE(NULLIF(v_value->>'signer_type', ''), NULLIF(v_value->>'type', '')));
      v_sequence := COALESCE(NULLIF(v_value->>'sequence', '')::integer, v_ordinality);
      v_label := COALESCE(NULLIF(v_value->>'label', ''), CASE v_signer_type
        WHEN 'DRIVER' THEN 'Signature conducteur'
        WHEN 'ADMIN' THEN 'Signature equipe KIRA'
        WHEN 'MANAGER' THEN 'Validation manager'
        WHEN 'EXECUTIVE' THEN 'Validation direction'
        ELSE initcap(lower(v_signer_type))
      END);
    END IF;

    IF v_signer_type IS NOT NULL AND v_signer_type <> '' THEN
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'signer_type', v_signer_type,
        'sequence', v_sequence,
        'required', true,
        'label', v_label
      ));
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.contract_status_label(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_status
    WHEN 'NOT_REQUIRED' THEN 'Contrat non requis'
    WHEN 'DRAFT_PENDING' THEN 'Preparation du contrat'
    WHEN 'DRAFT_CREATED' THEN 'Pret a envoyer'
    WHEN 'SENT_FOR_SIGNATURE' THEN 'Pret a signer'
    WHEN 'VIEWED' THEN 'En revue conducteur'
    WHEN 'PARTIALLY_EXECUTED' THEN 'Signatures en cours'
    WHEN 'FULLY_EXECUTED' THEN 'Accord signe'
    WHEN 'EXPIRED' THEN 'Contrat expire'
    WHEN 'DECLINED_BY_DRIVER' THEN 'Signature refusee'
    WHEN 'VOIDED' THEN 'Contrat annule'
    WHEN 'CANCELLED' THEN 'Contrat annule'
    WHEN 'SUPERSEDED' THEN 'Remplace par une nouvelle version'
    ELSE 'Contrat en cours'
  END
$$;

CREATE OR REPLACE FUNCTION public.contract_encrypt_ip(p_ip text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_ip IS NULL OR length(trim(p_ip)) = 0 THEN NULL
    ELSE 'kms-envelope:v1:' || encode(convert_to(p_ip, 'UTF8'), 'base64')
  END
$$;

CREATE OR REPLACE FUNCTION public.contract_audit(
  p_contract_id uuid,
  p_actor_id uuid,
  p_actor_type text,
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
  v_contract public.credit_contracts%ROWTYPE;
  v_audit_id uuid;
BEGIN
  SELECT * INTO v_contract FROM public.credit_contracts WHERE contract_id = p_contract_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit contract not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.contract_audit_events (
    customer_id, contract_id, actor_id, actor_type, event_type,
    before_json, after_json, reason, idempotency_key
  )
  VALUES (
    v_contract.customer_id, p_contract_id, p_actor_id,
    COALESCE(NULLIF(p_actor_type, ''), 'SYSTEM'),
    p_event_type, COALESCE(p_before, '{}'::jsonb), COALESCE(p_after, '{}'::jsonb),
    p_reason, p_idempotency_key
  )
  RETURNING audit_event_id INTO v_audit_id;

  PERFORM public.credit_log_event(
    v_contract.customer_id,
    'contract_' || lower(p_event_type),
    'credit_contract',
    v_contract.contract_id,
    COALESCE(p_before, '{}'::jsonb),
    COALESCE(p_after, '{}'::jsonb),
    jsonb_build_object('actor_type', p_actor_type, 'reason', p_reason),
    p_idempotency_key
  );

  RETURN v_audit_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.contract_signer_sequence(p_contract_id uuid, p_signer_type text)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract public.credit_contracts%ROWTYPE;
  v_sequence integer;
  v_missing integer := 0;
BEGIN
  SELECT * INTO v_contract FROM public.credit_contracts WHERE contract_id = p_contract_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit contract not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT NULLIF(value->>'sequence', '')::integer INTO v_sequence
  FROM jsonb_array_elements(COALESCE(v_contract.contract_snapshot_json->'required_signers', '[]'::jsonb)) AS value
  WHERE upper(value->>'signer_type') = upper(p_signer_type)
    AND COALESCE((value->>'required')::boolean, true)
  ORDER BY NULLIF(value->>'sequence', '')::integer
  LIMIT 1;

  IF v_sequence IS NULL THEN
    RAISE EXCEPTION 'signer type % is not required for this contract', p_signer_type;
  END IF;

  SELECT COUNT(*)::integer INTO v_missing
  FROM jsonb_array_elements(COALESCE(v_contract.contract_snapshot_json->'required_signers', '[]'::jsonb)) AS required
  WHERE COALESCE((required->>'required')::boolean, true)
    AND NULLIF(required->>'sequence', '')::integer < v_sequence
    AND NOT EXISTS (
      SELECT 1
      FROM public.contract_signature_events cse
      WHERE cse.contract_id = p_contract_id
        AND cse.signature_status = 'SIGNED'
        AND cse.signer_type = upper(required->>'signer_type')
    );

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'previous required signer must sign first';
  END IF;

  RETURN v_sequence;
END;
$$;

CREATE OR REPLACE FUNCTION public.contract_apply_signature_progress(
  p_contract_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.credit_contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract public.credit_contracts%ROWTYPE;
  v_required_count integer := 0;
  v_signed_count integer := 0;
  v_signature_hash text;
  v_pdf_hash text;
  v_driver_signed_at timestamptz;
  v_admin_signed_at timestamptz;
  v_admin_signer_id uuid;
  v_before jsonb;
BEGIN
  SELECT * INTO v_contract FROM public.credit_contracts WHERE contract_id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit contract not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*)::integer INTO v_required_count
  FROM jsonb_array_elements(COALESCE(v_contract.contract_snapshot_json->'required_signers', '[]'::jsonb)) AS required
  WHERE COALESCE((required->>'required')::boolean, true);

  SELECT COUNT(DISTINCT signer_type)::integer INTO v_signed_count
  FROM public.contract_signature_events cse
  WHERE cse.contract_id = p_contract_id
    AND cse.signature_status = 'SIGNED'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(v_contract.contract_snapshot_json->'required_signers', '[]'::jsonb)) AS required
      WHERE COALESCE((required->>'required')::boolean, true)
        AND upper(required->>'signer_type') = cse.signer_type
    );

  SELECT string_agg(signature_event_id::text || ':' || signer_type || ':' || signed_at::text, '|' ORDER BY signed_at, signature_event_id)
    INTO v_signature_hash
  FROM public.contract_signature_events
  WHERE contract_id = p_contract_id
    AND signature_status = 'SIGNED';
  v_signature_hash := md5(COALESCE(v_signature_hash, p_contract_id::text));
  v_pdf_hash := md5(v_contract.contract_hash || ':' || v_signature_hash || ':executed-pdf');

  SELECT MIN(signed_at) INTO v_driver_signed_at
  FROM public.contract_signature_events
  WHERE contract_id = p_contract_id AND signer_type = 'DRIVER' AND signature_status = 'SIGNED';

  SELECT signed_at, signer_id INTO v_admin_signed_at, v_admin_signer_id
  FROM public.contract_signature_events
  WHERE contract_id = p_contract_id
    AND signer_type IN ('ADMIN','MANAGER','EXECUTIVE')
    AND signature_status = 'SIGNED'
  ORDER BY signed_at, signature_event_id
  LIMIT 1;

  v_before := to_jsonb(v_contract);
  IF v_required_count > 0 AND v_signed_count >= v_required_count THEN
    UPDATE public.credit_contracts
    SET contract_status = 'FULLY_EXECUTED',
        driver_signed_at = COALESCE(driver_signed_at, v_driver_signed_at),
        admin_signed_at = COALESCE(admin_signed_at, v_admin_signed_at),
        fully_executed_at = COALESCE(fully_executed_at, now()),
        signature_hash = v_signature_hash,
        final_pdf_hash = COALESCE(final_pdf_hash, v_pdf_hash),
        updated_by = auth.uid(),
        status_changed_at = now()
    WHERE contract_id = p_contract_id
    RETURNING * INTO v_contract;

    INSERT INTO public.credit_agreements (
      customer_id, application_id, agreement_snapshot, signed_at, signed_by_driver_at,
      signed_by_admin_id, created_by, contract_id, decision_id, product_id,
      product_version_id, template_id, template_version, asset_id, contract_hash,
      snapshot_hash, signature_hash, final_pdf_hash, agreement_status
    )
    SELECT
      v_contract.customer_id, v_contract.application_id, v_contract.contract_snapshot_json,
      v_contract.fully_executed_at, v_contract.driver_signed_at, v_admin_signer_id, auth.uid(),
      v_contract.contract_id, v_contract.decision_id, v_contract.product_id,
      v_contract.product_version_id, v_contract.template_id, v_contract.template_version,
      v_contract.asset_id, v_contract.contract_hash, v_contract.snapshot_hash,
      v_contract.signature_hash, v_contract.final_pdf_hash, 'ACTIVE'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.credit_agreements ca WHERE ca.contract_id = v_contract.contract_id
    );

    INSERT INTO public.contract_files (customer_id, contract_id, file_type, storage_reference, file_hash)
    VALUES (
      v_contract.customer_id, v_contract.contract_id, 'EXECUTED_PDF',
      'internal-contract-snapshot://' || v_contract.contract_id::text || '/executed.pdf',
      v_contract.final_pdf_hash
    )
    ON CONFLICT DO NOTHING;

    PERFORM public.contract_audit(p_contract_id, auth.uid(), 'SYSTEM', 'FULLY_EXECUTED', v_before, to_jsonb(v_contract), NULL, p_idempotency_key || ':fully-executed');
  ELSE
    UPDATE public.credit_contracts
    SET contract_status = 'PARTIALLY_EXECUTED',
        driver_signed_at = COALESCE(driver_signed_at, v_driver_signed_at),
        admin_signed_at = COALESCE(admin_signed_at, v_admin_signed_at),
        signature_hash = v_signature_hash,
        updated_by = auth.uid(),
        status_changed_at = now()
    WHERE contract_id = p_contract_id
    RETURNING * INTO v_contract;

    PERFORM public.contract_audit(p_contract_id, auth.uid(), 'SYSTEM', 'PARTIALLY_EXECUTED', v_before, to_jsonb(v_contract), NULL, p_idempotency_key || ':partially-executed');
  END IF;

  RETURN v_contract;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_credit_contract(
  p_application_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.credit_contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.credit_applications%ROWTYPE;
  v_product public.credit_products%ROWTYPE;
  v_version public.product_versions%ROWTYPE;
  v_decision public.underwriting_decisions%ROWTYPE;
  v_template public.contract_templates%ROWTYPE;
  v_snapshot public.credit_snapshots%ROWTYPE;
  v_asset public.financed_assets%ROWTYPE;
  v_existing public.credit_contracts%ROWTYPE;
  v_contract public.credit_contracts%ROWTYPE;
  v_requirements jsonb := '{}'::jsonb;
  v_required_signers jsonb := '[]'::jsonb;
  v_conditions jsonb := '[]'::jsonb;
  v_pending_conditions integer := 0;
  v_blocking_triggers integer := 0;
  v_expiration_days integer := 14;
  v_allow_before_conditions boolean := false;
  v_template_id uuid;
  v_snapshot_json jsonb;
  v_contract_hash text;
  v_snapshot_hash text;
  v_signature_provider text := 'INTERNAL';
  v_requires_contract boolean := true;
BEGIN
  IF NOT public.has_contract_permission('contracts.generate') THEN
    RAISE EXCEPTION 'forbidden: contracts.generate required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.credit_contracts
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

  SELECT * INTO v_product FROM public.credit_products WHERE product_id = v_app.product_id AND customer_id = v_app.customer_id;
  SELECT * INTO v_version FROM public.product_versions WHERE version_id = v_app.product_version_id AND product_id = v_app.product_id;
  IF v_version.version_id IS NULL THEN
    RAISE EXCEPTION 'product version not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_version.contract_requirements_json IS NULL THEN
    v_requirements := '{}'::jsonb;
  ELSE
    v_requirements := v_version.contract_requirements_json;
  END IF;

  v_requires_contract := COALESCE(NULLIF(v_requirements->>'require_contract', '')::boolean, COALESCE(NULLIF(v_product.activation_rules_json->>'requires_signed_agreement', '')::boolean, true));
  IF NOT v_requires_contract THEN
    RAISE EXCEPTION 'contract is not required for this product version';
  END IF;

  SELECT * INTO v_decision FROM public.underwriting_latest_decision(v_app.application_id);
  IF v_decision.decision_id IS NULL THEN
    RAISE EXCEPTION 'Layer 3B underwriting decision required before contract generation';
  END IF;
  IF v_decision.decision NOT IN ('APPROVED','APPROVED_WITH_CONDITIONS') THEN
    RAISE EXCEPTION 'only approved or conditionally approved decisions can generate contracts';
  END IF;
  IF v_decision.decision_valid_until IS NOT NULL AND v_decision.decision_valid_until <= now() THEN
    RAISE EXCEPTION 'underwriting decision expired; re-underwriting required';
  END IF;

  SELECT * INTO v_existing
  FROM public.credit_contracts
  WHERE application_id = v_app.application_id
    AND decision_id = v_decision.decision_id
    AND contract_status IN ('DRAFT_PENDING','DRAFT_CREATED','SENT_FOR_SIGNATURE','VIEWED','PARTIALLY_EXECUTED','FULLY_EXECUTED')
  ORDER BY created_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  SELECT COUNT(*)::integer INTO v_blocking_triggers
  FROM public.reunderwriting_triggers
  WHERE application_id = v_app.application_id
    AND status IN ('PENDING','BLOCKING');
  IF v_blocking_triggers > 0 THEN
    RAISE EXCEPTION 're-underwriting trigger must be resolved before contract generation';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'condition_id', condition_id,
      'condition_type', condition_type,
      'description', description,
      'status', status
    ) ORDER BY created_at), '[]'::jsonb),
    COUNT(*) FILTER (WHERE status = 'PENDING')::integer
    INTO v_conditions, v_pending_conditions
  FROM public.underwriting_conditions
  WHERE decision_id = v_decision.decision_id;

  v_allow_before_conditions := COALESCE(NULLIF(v_requirements->>'allow_contract_before_conditions_fulfilled', '')::boolean, true);
  IF v_pending_conditions > 0 AND NOT v_allow_before_conditions THEN
    RAISE EXCEPTION 'underwriting conditions must be fulfilled before contract generation';
  END IF;

  v_template_id := NULLIF(v_requirements->>'contract_template_id', '')::uuid;
  IF v_template_id IS NOT NULL THEN
    SELECT * INTO v_template
    FROM public.contract_templates
    WHERE template_id = v_template_id
      AND customer_id = v_app.customer_id
      AND status = 'ACTIVE'
      AND effective_from <= now()
      AND (effective_to IS NULL OR effective_to > now());
  ELSE
    SELECT * INTO v_template
    FROM public.contract_templates
    WHERE customer_id = v_app.customer_id
      AND product_id = v_app.product_id
      AND (product_version_id = v_app.product_version_id OR product_version_id IS NULL)
      AND status = 'ACTIVE'
      AND effective_from <= now()
      AND (effective_to IS NULL OR effective_to > now())
    ORDER BY (product_version_id = v_app.product_version_id) DESC, version DESC, effective_from DESC
    LIMIT 1;
  END IF;
  IF v_template.template_id IS NULL THEN
    RAISE EXCEPTION 'active contract template not found' USING ERRCODE = 'P0002';
  END IF;

  v_required_signers := public.contract_normalize_required_signers(
    CASE
      WHEN jsonb_typeof(v_requirements->'required_signers') = 'array' THEN v_requirements->'required_signers'
      ELSE v_template.required_signers_json
    END
  );
  IF jsonb_array_length(v_required_signers) = 0 THEN
    RAISE EXCEPTION 'contract requires at least one signer';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_required_signers) AS signer
    WHERE signer->>'signer_type' = 'GUARANTOR'
  ) THEN
    RAISE EXCEPTION 'guarantor signing is not supported until guarantor identity exists upstream';
  END IF;

  v_expiration_days := COALESCE(NULLIF(v_requirements->>'contract_expiration_days', '')::integer, 14);
  v_signature_provider := COALESCE(NULLIF(v_requirements->>'signature_mode', ''), 'INTERNAL');

  SELECT * INTO v_snapshot FROM public.credit_snapshots WHERE application_id = v_app.application_id;
  IF v_app.requested_asset_id IS NOT NULL THEN
    SELECT * INTO v_asset FROM public.financed_assets WHERE asset_id = v_app.requested_asset_id;
  END IF;

  v_snapshot_json := jsonb_build_object(
    'application_id', v_app.application_id,
    'driver_id', v_app.driver_id,
    'kyc_reference_id', v_app.kyc_reference_id,
    'product', jsonb_build_object(
      'product_id', v_product.product_id,
      'product_type', v_product.product_type,
      'name', v_product.name
    ),
    'product_version', jsonb_build_object(
      'version_id', v_version.version_id,
      'version_number', v_version.version_number,
      'rules_snapshot_json', v_version.rules_snapshot_json,
      'contract_requirements_json', v_requirements
    ),
    'underwriting_decision', jsonb_build_object(
      'decision_id', v_decision.decision_id,
      'decision', v_decision.decision,
      'decision_valid_until', v_decision.decision_valid_until,
      'decision_timestamp', v_decision.decision_timestamp,
      'requested_exposure_amount', v_decision.requested_exposure_amount,
      'requested_exposure_currency_code', v_decision.requested_exposure_currency_code,
      'evaluated_policy_set_id', v_decision.evaluated_policy_set_id,
      'evaluated_policy_version', v_decision.evaluated_policy_version
    ),
    'decision_conditions', v_conditions,
    'asset', CASE WHEN v_asset.asset_id IS NULL THEN NULL ELSE jsonb_build_object(
      'asset_id', v_asset.asset_id,
      'asset_type', v_asset.asset_type,
      'description', v_asset.description,
      'purchase_price_amount', v_asset.purchase_price,
      'purchase_price_currency_code', v_asset.purchase_price_currency_code,
      'residual_value_amount', v_asset.residual_value,
      'residual_value_currency_code', v_asset.residual_value_currency_code,
      'fulfillment_status', v_asset.fulfillment_status,
      'possession_status', v_asset.possession_status
    ) END,
    'money', jsonb_build_object(
      'principal_amount', v_decision.requested_exposure_amount,
      'principal_currency_code', v_decision.requested_exposure_currency_code,
      'down_payment_amount', v_app.down_payment_amount,
      'down_payment_currency_code', v_app.down_payment_currency_code
    ),
    'activation_requirements', jsonb_build_object(
      'product_activation_rules_json', v_product.activation_rules_json,
      'contract_requirements_json', v_requirements
    ),
    'template', jsonb_build_object(
      'template_id', v_template.template_id,
      'template_version', v_template.version,
      'template_name', v_template.template_name,
      'template_type', v_template.template_type,
      'language', v_template.language,
      'country', v_template.country,
      'template_body', v_template.template_body,
      'plain_language_summary', v_template.plain_language_summary,
      'summary_version', v_template.summary_version,
      'required_fields_json', v_template.required_fields_json
    ),
    'required_signers', v_required_signers,
    'source_snapshot_id', v_snapshot.snapshot_id,
    'privacy_note', 'Contract snapshot stores business/legal references and hashes, not raw identity documents.'
  );

  v_snapshot_hash := md5(v_snapshot_json::text);
  v_contract_hash := md5(v_template.template_body || ':' || v_snapshot_json::text);

  INSERT INTO public.credit_contracts (
    customer_id, application_id, decision_id, product_id, product_version_id,
    template_id, template_version, contract_status, contract_snapshot_json,
    contract_hash, snapshot_hash, signature_provider, driver_id, asset_id,
    expires_at, idempotency_key, created_by, updated_by, status_changed_at
  )
  VALUES (
    v_app.customer_id, v_app.application_id, v_decision.decision_id, v_app.product_id,
    v_app.product_version_id, v_template.template_id, v_template.version,
    'DRAFT_CREATED', v_snapshot_json, v_contract_hash, v_snapshot_hash,
    v_signature_provider, v_app.driver_id, v_app.requested_asset_id,
    now() + make_interval(days => v_expiration_days), p_idempotency_key,
    auth.uid(), auth.uid(), now()
  )
  RETURNING * INTO v_contract;

  INSERT INTO public.contract_files (customer_id, contract_id, file_type, storage_reference, file_hash)
  VALUES (
    v_contract.customer_id, v_contract.contract_id, 'HTML_SNAPSHOT',
    'internal-contract-snapshot://' || v_contract.contract_id::text || '/draft.html',
    v_contract.contract_hash
  )
  ON CONFLICT DO NOTHING;

  PERFORM public.contract_audit(v_contract.contract_id, auth.uid(), 'ADMIN', 'GENERATED', '{}'::jsonb, to_jsonb(v_contract), NULL, p_idempotency_key);

  RETURN v_contract;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_credit_contract(
  p_contract_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.credit_contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract public.credit_contracts%ROWTYPE;
  v_existing public.contract_signature_events%ROWTYPE;
  v_before jsonb;
  v_audit_id uuid;
  v_signer jsonb;
BEGIN
  IF NOT public.has_contract_permission('contracts.send') THEN
    RAISE EXCEPTION 'forbidden: contracts.send required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.contract_signature_events
  WHERE customer_id = public.current_customer_id()
    AND idempotency_key = p_idempotency_key || ':sent'
  LIMIT 1;
  IF FOUND THEN
    SELECT * INTO v_contract FROM public.credit_contracts WHERE contract_id = v_existing.contract_id;
    RETURN v_contract;
  END IF;

  SELECT * INTO v_contract
  FROM public.credit_contracts
  WHERE contract_id = p_contract_id
    AND (public.is_platform_owner() OR customer_id = public.current_customer_id())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit contract not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_contract.contract_status NOT IN ('DRAFT_CREATED','VIEWED') THEN
    RETURN v_contract;
  END IF;
  IF v_contract.expires_at IS NOT NULL AND v_contract.expires_at <= now() THEN
    UPDATE public.credit_contracts
    SET contract_status = 'EXPIRED', updated_by = auth.uid(), status_changed_at = now()
    WHERE contract_id = v_contract.contract_id
    RETURNING * INTO v_contract;
    RETURN v_contract;
  END IF;

  v_before := to_jsonb(v_contract);
  UPDATE public.credit_contracts
  SET contract_status = 'SENT_FOR_SIGNATURE',
      sent_at = COALESCE(sent_at, now()),
      updated_by = auth.uid(),
      status_changed_at = now()
  WHERE contract_id = v_contract.contract_id
  RETURNING * INTO v_contract;

  v_audit_id := public.contract_audit(p_contract_id, auth.uid(), 'ADMIN', 'SENT', v_before, to_jsonb(v_contract), NULL, p_idempotency_key);

  FOR v_signer IN SELECT value FROM jsonb_array_elements(COALESCE(v_contract.contract_snapshot_json->'required_signers', '[]'::jsonb))
  LOOP
    INSERT INTO public.contract_signature_events (
      customer_id, contract_id, signer_type, signer_sequence, signature_status,
      signature_method, signature_provider, signed_contract_hash, language_displayed,
      audit_event_id, idempotency_key
    )
    VALUES (
      v_contract.customer_id, v_contract.contract_id, upper(v_signer->>'signer_type'),
      COALESCE(NULLIF(v_signer->>'sequence', '')::integer, 0),
      'SENT', 'INTERNAL_NOTIFICATION', v_contract.signature_provider, v_contract.contract_hash,
      COALESCE(v_contract.contract_snapshot_json #>> '{template,language}', 'fr-CI'),
      v_audit_id, p_idempotency_key || ':sent:' || upper(v_signer->>'signer_type')
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN v_contract;
END;
$$;

CREATE OR REPLACE FUNCTION public.driver_view_credit_contract(
  p_contract_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.credit_contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract public.credit_contracts%ROWTYPE;
  v_existing public.contract_signature_events%ROWTYPE;
  v_sequence integer;
  v_before jsonb;
  v_audit_id uuid;
BEGIN
  IF public.current_driver_id() IS NULL THEN
    RAISE EXCEPTION 'forbidden: driver session required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.contract_signature_events
  WHERE idempotency_key = p_idempotency_key
    AND signer_type = 'DRIVER'
  LIMIT 1;
  IF FOUND THEN
    SELECT * INTO v_contract FROM public.credit_contracts WHERE contract_id = v_existing.contract_id;
    RETURN v_contract;
  END IF;

  SELECT * INTO v_contract
  FROM public.credit_contracts
  WHERE contract_id = p_contract_id
    AND driver_id = public.current_driver_id()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit contract not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_contract.contract_status NOT IN ('SENT_FOR_SIGNATURE','VIEWED','PARTIALLY_EXECUTED') THEN
    RETURN v_contract;
  END IF;

  v_sequence := public.contract_signer_sequence(p_contract_id, 'DRIVER');
  v_before := to_jsonb(v_contract);
  IF v_contract.contract_status = 'SENT_FOR_SIGNATURE' THEN
    UPDATE public.credit_contracts
    SET contract_status = 'VIEWED',
        viewed_at = COALESCE(viewed_at, now()),
        updated_by = auth.uid(),
        status_changed_at = now()
    WHERE contract_id = p_contract_id
    RETURNING * INTO v_contract;
  ELSE
    UPDATE public.credit_contracts
    SET viewed_at = COALESCE(viewed_at, now()), updated_by = auth.uid()
    WHERE contract_id = p_contract_id
    RETURNING * INTO v_contract;
  END IF;

  v_audit_id := public.contract_audit(p_contract_id, public.current_driver_id(), 'DRIVER', 'VIEWED', v_before, to_jsonb(v_contract), NULL, p_idempotency_key);
  INSERT INTO public.contract_signature_events (
    customer_id, contract_id, signer_id, signer_type, signer_sequence, signature_status,
    signature_method, signature_provider, signed_contract_hash, consent_summary_version,
    language_displayed, device_metadata_json, ip_address_encrypted, audit_event_id, idempotency_key
  )
  VALUES (
    v_contract.customer_id, v_contract.contract_id, public.current_driver_id(), 'DRIVER', v_sequence,
    'VIEWED', 'INTERNAL_REVIEW', v_contract.signature_provider, v_contract.contract_hash,
    v_contract.contract_snapshot_json #>> '{template,summary_version}',
    COALESCE(v_contract.contract_snapshot_json #>> '{template,language}', 'fr-CI'),
    '{}'::jsonb, public.contract_encrypt_ip(inet_client_addr()::text), v_audit_id, p_idempotency_key
  )
  ON CONFLICT DO NOTHING;

  RETURN v_contract;
END;
$$;

CREATE OR REPLACE FUNCTION public.driver_sign_credit_contract(
  p_contract_id uuid,
  p_consent_confirmed boolean DEFAULT false,
  p_idempotency_key text DEFAULT NULL,
  p_device_metadata_json jsonb DEFAULT '{}'::jsonb
)
RETURNS public.credit_contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract public.credit_contracts%ROWTYPE;
  v_existing public.contract_signature_events%ROWTYPE;
  v_sequence integer;
  v_audit_id uuid;
BEGIN
  IF public.current_driver_id() IS NULL THEN
    RAISE EXCEPTION 'forbidden: driver session required' USING ERRCODE = '42501';
  END IF;
  IF NOT p_consent_confirmed THEN
    RAISE EXCEPTION 'driver consent confirmation is required';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.contract_signature_events
  WHERE idempotency_key = p_idempotency_key
    AND signature_status = 'SIGNED'
  LIMIT 1;
  IF FOUND THEN
    SELECT * INTO v_contract FROM public.credit_contracts WHERE contract_id = v_existing.contract_id;
    RETURN v_contract;
  END IF;

  SELECT * INTO v_contract
  FROM public.credit_contracts
  WHERE contract_id = p_contract_id
    AND driver_id = public.current_driver_id()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit contract not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_contract.contract_status NOT IN ('SENT_FOR_SIGNATURE','VIEWED','PARTIALLY_EXECUTED') THEN
    RETURN v_contract;
  END IF;
  IF v_contract.expires_at IS NOT NULL AND v_contract.expires_at <= now() THEN
    UPDATE public.credit_contracts
    SET contract_status = 'EXPIRED', updated_by = auth.uid(), status_changed_at = now()
    WHERE contract_id = v_contract.contract_id
    RETURNING * INTO v_contract;
    RAISE EXCEPTION 'contract expired';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.contract_signature_events
    WHERE contract_id = p_contract_id AND signer_type = 'DRIVER' AND signature_status = 'SIGNED'
  ) THEN
    RETURN v_contract;
  END IF;

  v_sequence := public.contract_signer_sequence(p_contract_id, 'DRIVER');
  v_audit_id := public.contract_audit(p_contract_id, public.current_driver_id(), 'DRIVER', 'SIGNED', '{}'::jsonb, to_jsonb(v_contract), NULL, p_idempotency_key);
  INSERT INTO public.contract_signature_events (
    customer_id, contract_id, signer_id, signer_type, signer_sequence, signature_status,
    signature_method, signature_provider, signed_at, signed_contract_hash,
    consent_text_snapshot, consent_summary_version, language_displayed,
    device_metadata_json, ip_address_encrypted, audit_event_id, idempotency_key
  )
  VALUES (
    v_contract.customer_id, v_contract.contract_id, public.current_driver_id(), 'DRIVER', v_sequence,
    'SIGNED', 'INTERNAL_CLICKWRAP', v_contract.signature_provider, now(), v_contract.contract_hash,
    COALESCE(v_contract.contract_snapshot_json #>> '{template,plain_language_summary}', 'J''ai lu et compris l''accord.'),
    v_contract.contract_snapshot_json #>> '{template,summary_version}',
    COALESCE(v_contract.contract_snapshot_json #>> '{template,language}', 'fr-CI'),
    COALESCE(p_device_metadata_json, '{}'::jsonb), public.contract_encrypt_ip(inet_client_addr()::text),
    v_audit_id, p_idempotency_key
  );

  SELECT * INTO v_contract FROM public.contract_apply_signature_progress(p_contract_id, p_idempotency_key);
  RETURN v_contract;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_sign_credit_contract(
  p_contract_id uuid,
  p_signer_type text DEFAULT 'ADMIN',
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.credit_contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract public.credit_contracts%ROWTYPE;
  v_existing public.contract_signature_events%ROWTYPE;
  v_sequence integer;
  v_admin_id uuid;
  v_signer_type text := upper(COALESCE(NULLIF(p_signer_type, ''), 'ADMIN'));
  v_audit_id uuid;
BEGIN
  IF NOT public.has_contract_permission('contracts.sign_admin') THEN
    RAISE EXCEPTION 'forbidden: contracts.sign_admin required' USING ERRCODE = '42501';
  END IF;
  IF v_signer_type NOT IN ('ADMIN','MANAGER','EXECUTIVE','VENDOR','WITNESS') THEN
    RAISE EXCEPTION 'invalid admin signer type %', v_signer_type;
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required for admin countersignature';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.contract_signature_events
  WHERE customer_id = public.current_customer_id()
    AND idempotency_key = p_idempotency_key
    AND signature_status = 'SIGNED'
  LIMIT 1;
  IF FOUND THEN
    SELECT * INTO v_contract FROM public.credit_contracts WHERE contract_id = v_existing.contract_id;
    RETURN v_contract;
  END IF;

  SELECT id INTO v_admin_id FROM public.admin_users WHERE user_id = auth.uid() LIMIT 1;
  SELECT * INTO v_contract
  FROM public.credit_contracts
  WHERE contract_id = p_contract_id
    AND (public.is_platform_owner() OR customer_id = public.current_customer_id())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit contract not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_contract.contract_status NOT IN ('SENT_FOR_SIGNATURE','VIEWED','PARTIALLY_EXECUTED') THEN
    RETURN v_contract;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.contract_signature_events
    WHERE contract_id = p_contract_id AND signer_type = v_signer_type AND signature_status = 'SIGNED'
  ) THEN
    RETURN v_contract;
  END IF;

  v_sequence := public.contract_signer_sequence(p_contract_id, v_signer_type);
  v_audit_id := public.contract_audit(p_contract_id, v_admin_id, v_signer_type, 'SIGNED', '{}'::jsonb, to_jsonb(v_contract), p_reason, p_idempotency_key);
  INSERT INTO public.contract_signature_events (
    customer_id, contract_id, signer_id, signer_type, signer_sequence, signature_status,
    signature_method, signature_provider, signed_at, signed_contract_hash,
    consent_text_snapshot, consent_summary_version, language_displayed,
    device_metadata_json, ip_address_encrypted, audit_event_id, idempotency_key
  )
  VALUES (
    v_contract.customer_id, v_contract.contract_id, v_admin_id, v_signer_type, v_sequence,
    'SIGNED', 'INTERNAL_ADMIN_COUNTERSIGN', v_contract.signature_provider, now(), v_contract.contract_hash,
    COALESCE(v_contract.contract_snapshot_json #>> '{template,plain_language_summary}', 'Countersignature admin.'),
    v_contract.contract_snapshot_json #>> '{template,summary_version}',
    COALESCE(v_contract.contract_snapshot_json #>> '{template,language}', 'fr-CI'),
    jsonb_build_object('source', 'admin_contract_operations'), public.contract_encrypt_ip(inet_client_addr()::text),
    v_audit_id, p_idempotency_key
  );

  SELECT * INTO v_contract FROM public.contract_apply_signature_progress(p_contract_id, p_idempotency_key);
  RETURN v_contract;
END;
$$;

CREATE OR REPLACE FUNCTION public.driver_decline_credit_contract(
  p_contract_id uuid,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.credit_contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract public.credit_contracts%ROWTYPE;
  v_sequence integer;
  v_before jsonb;
  v_audit_id uuid;
BEGIN
  IF public.current_driver_id() IS NULL THEN
    RAISE EXCEPTION 'forbidden: driver session required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_contract
  FROM public.credit_contracts
  WHERE contract_id = p_contract_id
    AND driver_id = public.current_driver_id()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit contract not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_contract.contract_status NOT IN ('SENT_FOR_SIGNATURE','VIEWED','PARTIALLY_EXECUTED') THEN
    RETURN v_contract;
  END IF;

  v_sequence := public.contract_signer_sequence(p_contract_id, 'DRIVER');
  v_before := to_jsonb(v_contract);
  UPDATE public.credit_contracts
  SET contract_status = 'DECLINED_BY_DRIVER',
      declined_at = now(),
      decline_reason = COALESCE(NULLIF(p_reason, ''), 'driver_declined'),
      updated_by = auth.uid(),
      status_changed_at = now()
  WHERE contract_id = p_contract_id
  RETURNING * INTO v_contract;

  v_audit_id := public.contract_audit(p_contract_id, public.current_driver_id(), 'DRIVER', 'DECLINED_BY_DRIVER', v_before, to_jsonb(v_contract), p_reason, p_idempotency_key);
  INSERT INTO public.contract_signature_events (
    customer_id, contract_id, signer_id, signer_type, signer_sequence, signature_status,
    signature_method, signature_provider, signed_contract_hash, language_displayed,
    device_metadata_json, ip_address_encrypted, audit_event_id, idempotency_key
  )
  VALUES (
    v_contract.customer_id, v_contract.contract_id, public.current_driver_id(), 'DRIVER', v_sequence,
    'DECLINED', 'INTERNAL_DECLINE', v_contract.signature_provider, v_contract.contract_hash,
    COALESCE(v_contract.contract_snapshot_json #>> '{template,language}', 'fr-CI'),
    '{}'::jsonb, public.contract_encrypt_ip(inet_client_addr()::text), v_audit_id, p_idempotency_key
  )
  ON CONFLICT DO NOTHING;

  RETURN v_contract;
END;
$$;

CREATE OR REPLACE FUNCTION public.void_credit_contract(
  p_contract_id uuid,
  p_reason text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.credit_contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract public.credit_contracts%ROWTYPE;
  v_before jsonb;
  v_audit_id uuid;
BEGIN
  IF NOT public.has_contract_permission('contracts.void') THEN
    RAISE EXCEPTION 'forbidden: contracts.void required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_contract
  FROM public.credit_contracts
  WHERE contract_id = p_contract_id
    AND (public.is_platform_owner() OR customer_id = public.current_customer_id())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit contract not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_contract.contract_status IN ('VOIDED','CANCELLED','SUPERSEDED','DECLINED_BY_DRIVER') THEN
    RETURN v_contract;
  END IF;

  v_before := to_jsonb(v_contract);
  UPDATE public.credit_contracts
  SET contract_status = 'VOIDED',
      voided_at = now(),
      void_reason = p_reason,
      updated_by = auth.uid(),
      status_changed_at = now()
  WHERE contract_id = p_contract_id
  RETURNING * INTO v_contract;

  v_audit_id := public.contract_audit(p_contract_id, auth.uid(), 'ADMIN', 'VOIDED', v_before, to_jsonb(v_contract), p_reason, p_idempotency_key);
  INSERT INTO public.contract_signature_events (
    customer_id, contract_id, signer_type, signer_sequence, signature_status,
    signature_method, signature_provider, signed_contract_hash, language_displayed,
    audit_event_id, idempotency_key
  )
  VALUES (
    v_contract.customer_id, v_contract.contract_id, 'SYSTEM', 0, 'VOIDED',
    'ADMIN_VOID', v_contract.signature_provider, v_contract.contract_hash,
    COALESCE(v_contract.contract_snapshot_json #>> '{template,language}', 'fr-CI'),
    v_audit_id, p_idempotency_key || ':void-event'
  )
  ON CONFLICT DO NOTHING;

  RETURN v_contract;
END;
$$;

CREATE OR REPLACE FUNCTION public.reissue_credit_contract(
  p_contract_id uuid,
  p_reason text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.credit_contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.credit_contracts%ROWTYPE;
  v_before jsonb;
  v_new public.credit_contracts%ROWTYPE;
BEGIN
  IF NOT public.has_contract_permission('contracts.void') THEN
    RAISE EXCEPTION 'forbidden: contracts.void required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_old
  FROM public.credit_contracts
  WHERE contract_id = p_contract_id
    AND (public.is_platform_owner() OR customer_id = public.current_customer_id())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit contract not found' USING ERRCODE = 'P0002';
  END IF;

  v_before := to_jsonb(v_old);
  IF v_old.contract_status NOT IN ('VOIDED','CANCELLED','SUPERSEDED') THEN
    UPDATE public.credit_contracts
    SET contract_status = 'SUPERSEDED',
        voided_at = COALESCE(voided_at, now()),
        void_reason = p_reason,
        updated_by = auth.uid(),
        status_changed_at = now()
    WHERE contract_id = v_old.contract_id
    RETURNING * INTO v_old;
    PERFORM public.contract_audit(v_old.contract_id, auth.uid(), 'ADMIN', 'SUPERSEDED', v_before, to_jsonb(v_old), p_reason, p_idempotency_key || ':superseded');
  END IF;

  SELECT * INTO v_new FROM public.generate_credit_contract(v_old.application_id, p_idempotency_key || ':generated');
  UPDATE public.credit_contracts
  SET superseded_by_contract_id = v_new.contract_id,
      updated_by = auth.uid()
  WHERE contract_id = v_old.contract_id;

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_manual_contract_file(
  p_contract_id uuid,
  p_storage_reference text,
  p_file_hash text,
  p_reason text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.contract_files
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract public.credit_contracts%ROWTYPE;
  v_file public.contract_files%ROWTYPE;
BEGIN
  IF NOT public.has_contract_permission('contracts.upload_manual') THEN
    RAISE EXCEPTION 'forbidden: contracts.upload_manual required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT * INTO v_contract
  FROM public.credit_contracts
  WHERE contract_id = p_contract_id
    AND (public.is_platform_owner() OR customer_id = public.current_customer_id());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit contract not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.contract_files (customer_id, contract_id, file_type, storage_reference, file_hash)
  VALUES (v_contract.customer_id, v_contract.contract_id, 'MANUAL_UPLOAD', p_storage_reference, p_file_hash)
  ON CONFLICT (contract_id, file_type, file_hash) DO NOTHING
  RETURNING * INTO v_file;

  IF v_file.file_id IS NULL THEN
    SELECT * INTO v_file
    FROM public.contract_files
    WHERE contract_id = v_contract.contract_id
      AND file_type = 'MANUAL_UPLOAD'
      AND file_hash = p_file_hash
    LIMIT 1;
  END IF;

  PERFORM public.contract_audit(v_contract.contract_id, auth.uid(), 'ADMIN', 'MANUAL_UPLOAD', '{}'::jsonb, to_jsonb(v_file), p_reason, p_idempotency_key);
  RETURN v_file;
END;
$$;

CREATE OR REPLACE FUNCTION public.contract_decrypt_signature_ip(
  p_signature_event_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.contract_signature_events%ROWTYPE;
  v_ip text;
BEGIN
  IF NOT public.has_contract_permission('contracts.audit') THEN
    RAISE EXCEPTION 'forbidden: contracts.audit required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_event
  FROM public.contract_signature_events
  WHERE signature_event_id = p_signature_event_id
    AND (public.is_platform_owner() OR customer_id = public.current_customer_id());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'signature event not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_event.ip_address_encrypted IS NULL THEN
    v_ip := NULL;
  ELSE
    v_ip := convert_from(decode(replace(v_event.ip_address_encrypted, 'kms-envelope:v1:', ''), 'base64'), 'UTF8');
  END IF;

  PERFORM public.contract_audit(v_event.contract_id, auth.uid(), 'COMPLIANCE', 'IP_DECRYPTED', '{}'::jsonb, jsonb_build_object('signature_event_id', p_signature_event_id), 'permissioned IP evidence access', p_idempotency_key);
  RETURN v_ip;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_driver_contract_statuses()
RETURNS TABLE (
  contract_id uuid,
  application_id uuid,
  status_label text,
  status_tone text,
  primary_action_label text,
  can_view boolean,
  can_sign boolean,
  can_decline boolean,
  product_name text,
  asset_label text,
  summary_json jsonb,
  required_actions_json jsonb,
  expires_at timestamptz,
  signed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH mine AS (
    SELECT c.*
    FROM public.credit_contracts c
    WHERE c.driver_id = public.current_driver_id()
  ),
  signed AS (
    SELECT contract_id, jsonb_agg(DISTINCT signer_type) AS signed_signers
    FROM public.contract_signature_events
    WHERE signature_status = 'SIGNED'
    GROUP BY contract_id
  )
  SELECT
    c.contract_id,
    c.application_id,
    public.contract_status_label(c.contract_status) AS status_label,
    CASE
      WHEN c.contract_status = 'FULLY_EXECUTED' THEN 'success'
      WHEN c.contract_status IN ('SENT_FOR_SIGNATURE','VIEWED','PARTIALLY_EXECUTED') THEN 'warning'
      WHEN c.contract_status IN ('VOIDED','CANCELLED','EXPIRED','DECLINED_BY_DRIVER','SUPERSEDED') THEN 'danger'
      ELSE 'neutral'
    END AS status_tone,
    CASE
      WHEN c.contract_status IN ('SENT_FOR_SIGNATURE','VIEWED') AND NOT EXISTS (
        SELECT 1 FROM public.contract_signature_events e
        WHERE e.contract_id = c.contract_id AND e.signer_type = 'DRIVER' AND e.signature_status = 'SIGNED'
      ) THEN 'Lire et signer'
      WHEN c.contract_status = 'PARTIALLY_EXECUTED' THEN 'En attente equipe KIRA'
      WHEN c.contract_status = 'FULLY_EXECUTED' THEN 'Accord signe'
      WHEN c.contract_status = 'DRAFT_CREATED' THEN 'Preparation equipe KIRA'
      ELSE 'Voir le statut'
    END AS primary_action_label,
    c.contract_status IN ('SENT_FOR_SIGNATURE','VIEWED','PARTIALLY_EXECUTED','FULLY_EXECUTED') AS can_view,
    c.contract_status IN ('SENT_FOR_SIGNATURE','VIEWED')
      AND NOT EXISTS (
        SELECT 1 FROM public.contract_signature_events e
        WHERE e.contract_id = c.contract_id AND e.signer_type = 'DRIVER' AND e.signature_status = 'SIGNED'
      ) AS can_sign,
    c.contract_status IN ('SENT_FOR_SIGNATURE','VIEWED') AS can_decline,
    COALESCE(c.contract_snapshot_json #>> '{product,name}', 'Produit credit') AS product_name,
    COALESCE(c.contract_snapshot_json #>> '{asset,description}', 'Actif finance') AS asset_label,
    jsonb_build_object(
      'title', 'Resume de l''accord',
      'language', COALESCE(c.contract_snapshot_json #>> '{template,language}', 'fr-CI'),
      'summary_version', c.contract_snapshot_json #>> '{template,summary_version}',
      'summary_text', c.contract_snapshot_json #>> '{template,plain_language_summary}',
      'principal_amount', NULLIF(c.contract_snapshot_json #>> '{money,principal_amount}', '')::integer,
      'principal_currency_code', c.contract_snapshot_json #>> '{money,principal_currency_code}',
      'down_payment_amount', NULLIF(c.contract_snapshot_json #>> '{money,down_payment_amount}', '')::integer,
      'down_payment_currency_code', c.contract_snapshot_json #>> '{money,down_payment_currency_code}',
      'expires_at', c.expires_at
    ) AS summary_json,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'label', required->>'label',
        'status_label', CASE
          WHEN EXISTS (
            SELECT 1 FROM public.contract_signature_events e
            WHERE e.contract_id = c.contract_id
              AND e.signer_type = upper(required->>'signer_type')
              AND e.signature_status = 'SIGNED'
          ) THEN 'Complete'
          ELSE 'A faire'
        END,
        'is_pending', NOT EXISTS (
          SELECT 1 FROM public.contract_signature_events e
          WHERE e.contract_id = c.contract_id
            AND e.signer_type = upper(required->>'signer_type')
            AND e.signature_status = 'SIGNED'
        )
      ) ORDER BY NULLIF(required->>'sequence', '')::integer)
      FROM jsonb_array_elements(COALESCE(c.contract_snapshot_json->'required_signers', '[]'::jsonb)) AS required
    ), '[]'::jsonb) AS required_actions_json,
    c.expires_at,
    c.fully_executed_at AS signed_at
  FROM mine c
  LEFT JOIN signed s ON s.contract_id = c.contract_id
  ORDER BY c.created_at DESC
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
  v_product public.credit_products%ROWTYPE;
  v_version public.product_versions%ROWTYPE;
  v_package public.activation_packages%ROWTYPE;
  v_underwriting public.underwriting_decisions%ROWTYPE;
  v_invoice public.invoice%ROWTYPE;
  v_fulfillment public.fulfillment_records%ROWTYPE;
  v_agreement public.credit_agreements%ROWTYPE;
  v_blockers text[] := ARRAY[]::text[];
  v_requires_physical_asset boolean := false;
  v_requires_contract boolean := true;
  v_pending_conditions integer := 0;
  v_blocking_triggers integer := 0;
  v_status text := 'READY';
  v_validation text := 'PASSED';
  v_contract_money_amount integer;
  v_contract_money_currency text;
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

  SELECT * INTO v_product FROM public.credit_products WHERE product_id = v_app.product_id AND customer_id = v_app.customer_id;
  SELECT * INTO v_version FROM public.product_versions WHERE version_id = v_app.product_version_id;
  v_requires_contract := COALESCE(NULLIF(v_version.contract_requirements_json->>'require_contract', '')::boolean, COALESCE(NULLIF(v_product.activation_rules_json->>'requires_signed_agreement', '')::boolean, true));
  SELECT COALESCE((v_product.asset_rules_json->>'requires_possession_confirmation')::boolean, false)
    INTO v_requires_physical_asset;

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

  SELECT ca.* INTO v_agreement
  FROM public.credit_agreements ca
  JOIN public.credit_contracts cc ON cc.contract_id = ca.contract_id
  WHERE ca.application_id = v_app.application_id
    AND ca.signed_at IS NOT NULL
    AND ca.agreement_status = 'ACTIVE'
    AND cc.contract_status = 'FULLY_EXECUTED'
    AND cc.decision_id = v_underwriting.decision_id
    AND cc.product_version_id = v_app.product_version_id
    AND cc.asset_id IS NOT DISTINCT FROM v_app.requested_asset_id
    AND (cc.expires_at IS NULL OR cc.expires_at > now())
  ORDER BY ca.signed_at DESC, ca.created_at DESC
  LIMIT 1;

  v_contract_money_amount := NULLIF(v_agreement.agreement_snapshot #>> '{money,principal_amount}', '')::integer;
  v_contract_money_currency := v_agreement.agreement_snapshot #>> '{money,principal_currency_code}';

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
  IF v_requires_contract THEN
    IF v_agreement.agreement_id IS NULL OR v_agreement.signed_at IS NULL THEN
      v_blockers := array_append(v_blockers, 'signed_agreement_required');
    ELSIF v_contract_money_amount IS DISTINCT FROM v_underwriting.requested_exposure_amount
      OR v_contract_money_currency IS DISTINCT FROM v_underwriting.requested_exposure_currency_code THEN
      v_blockers := array_append(v_blockers, 'contract_money_mismatch');
    END IF;
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
    jsonb_build_object(
      'blockers', to_jsonb(v_blockers),
      'evaluated_at', now(),
      'underwriting_decision_id', v_underwriting.decision_id,
      'agreement_id', v_agreement.agreement_id,
      'contract_id', v_agreement.contract_id
    ),
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
    jsonb_build_object('application_id', v_app.application_id, 'underwriting_decision_id', v_underwriting.decision_id, 'contract_id', v_agreement.contract_id),
    p_idempotency_key
  );

  RETURN v_package;
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
  v_package public.activation_packages%ROWTYPE;
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

  SELECT * INTO v_package
  FROM public.create_activation_package(v_app.application_id, p_idempotency_key || ':activation-check', p_request_hash);
  IF v_package.status <> 'READY' THEN
    RAISE EXCEPTION 'activation package is not ready';
  END IF;

  SELECT * INTO v_account
  FROM public.activate_credit_account_3a_core(v_app.application_id, p_idempotency_key, p_request_hash);
  RETURN v_account;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_contract_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contract_normalize_required_signers(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contract_status_label(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_credit_contract(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_credit_contract(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_view_credit_contract(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_sign_credit_contract(uuid, boolean, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_decline_credit_contract(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sign_credit_contract(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_credit_contract(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reissue_credit_contract(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_manual_contract_file(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contract_decrypt_signature_ip(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_contract_statuses() TO authenticated;

COMMENT ON TABLE public.contract_templates IS 'Layer 3C versioned legal templates; active versions generate immutable credit contract snapshots.';
COMMENT ON TABLE public.credit_contracts IS 'Layer 3C contract packages and lifecycle state. credit_agreements is appended only after full execution.';
COMMENT ON TABLE public.contract_signature_events IS 'Immutable signer evidence. IP evidence is stored in an encrypted-envelope field and only exposed through audited RPC.';
