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
  v_decision public.credit_decisions%ROWTYPE;
  v_reviewer_id uuid;
  v_new_status text;
BEGIN
  IF NOT public.has_credit_permission('credit.review') THEN
    RAISE EXCEPTION 'forbidden: credit.review required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;
  IF p_decision NOT IN ('APPROVED','APPROVED_WITH_CONDITIONS','DECLINED','MANUAL_REVIEW') THEN
    RAISE EXCEPTION 'invalid decision %', p_decision;
  END IF;
  SELECT * INTO v_app
  FROM public.credit_applications
  WHERE application_id = p_application_id
    AND (public.is_platform_owner() OR customer_id = public.current_customer_id())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit application not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_decision
  FROM public.credit_decisions
  WHERE idempotency_key = p_idempotency_key
    AND customer_id = v_app.customer_id
    AND application_id = v_app.application_id
  LIMIT 1;
  IF FOUND THEN
    RETURN v_decision;
  END IF;
  SELECT id INTO v_reviewer_id
  FROM public.admin_users
  WHERE user_id = auth.uid()
  LIMIT 1;
  INSERT INTO public.credit_decisions (
    customer_id, application_id, decision, explanation, conditions_json,
    reviewer_id, decision_reason_code, idempotency_key
  )
  VALUES (
    v_app.customer_id, v_app.application_id, p_decision, p_explanation,
    COALESCE(p_conditions_json, '{}'::jsonb), v_reviewer_id,
    p_decision_reason_code, p_idempotency_key
  )
  RETURNING * INTO v_decision;
  v_new_status := CASE
    WHEN p_decision IN ('APPROVED','APPROVED_WITH_CONDITIONS') THEN 'APPROVED'
    WHEN p_decision = 'DECLINED' THEN 'DECLINED'
    ELSE 'UNDER_REVIEW'
  END;
  UPDATE public.credit_applications
  SET status = v_new_status,
      updated_by = auth.uid(),
      status_changed_at = now()
  WHERE application_id = v_app.application_id;
  IF v_new_status IN ('DECLINED','WITHDRAWN','EXPIRED') THEN
    UPDATE public.credit_asset_assignments
    SET assignment_status = 'RELEASED',
        released_at = now(),
        release_reason = 'application_' || lower(v_new_status)
    WHERE application_id = v_app.application_id
      AND assignment_status = 'ACTIVE';
  END IF;
  PERFORM public.credit_log_event(
    v_app.customer_id,
    'decision_recorded',
    'credit_decision',
    v_decision.decision_id,
    to_jsonb(v_app),
    to_jsonb(v_decision),
    jsonb_build_object('application_id', v_app.application_id),
    p_idempotency_key
  );
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
  v_driver public.drivers%ROWTYPE;
  v_invoice public.invoice%ROWTYPE;
  v_settings public.customer_billing_settings%ROWTYPE;
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
  IF v_app.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'down payment invoice requires approved application';
  END IF;
  IF v_app.down_payment_amount <= 0 THEN
    RAISE EXCEPTION 'application has no down-payment obligation';
  END IF;
  SELECT * INTO v_invoice
  FROM public.invoice
  WHERE customer_id = v_app.customer_id
    AND idempotency_key = p_idempotency_key
    AND source_application_id = v_app.application_id
  LIMIT 1;
  IF FOUND THEN
    RETURN v_invoice;
  END IF;
  SELECT * INTO v_invoice
  FROM public.invoice
  WHERE source_application_id = v_app.application_id
    AND obligation_type = 'DOWN_PAYMENT'
  LIMIT 1;
  IF FOUND THEN
    RETURN v_invoice;
  END IF;
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
    'Layer 3A one-time down-payment obligation. No recurring schedule generated.',
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
    v_invoice.id, v_app.customer_id, 1, 'Apport initial credit - activation',
    1, v_app.down_payment_amount, v_app.down_payment_amount, 0, 0,
    v_app.down_payment_amount,
    jsonb_build_object('source', 'layer3a_credit', 'obligation_type', 'DOWN_PAYMENT', 'application_id', v_app.application_id)
  );
  INSERT INTO public.invoice_audit (invoice_id, customer_id, action, actor_id, actor_type, metadata)
  VALUES (
    v_invoice.id, v_app.customer_id, 'credit_obligation', auth.uid(), 'admin',
    jsonb_build_object('application_id', v_app.application_id, 'obligation_type', 'DOWN_PAYMENT', 'idempotency_key', p_idempotency_key)
  );
  PERFORM public.credit_log_event(
    v_app.customer_id,
    'down_payment_invoice_created',
    'invoice',
    v_invoice.id,
    '{}'::jsonb,
    to_jsonb(v_invoice),
    jsonb_build_object('application_id', v_app.application_id),
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
  v_decision public.credit_decisions%ROWTYPE;
  v_invoice public.invoice%ROWTYPE;
  v_fulfillment public.fulfillment_records%ROWTYPE;
  v_agreement public.credit_agreements%ROWTYPE;
  v_blockers text[] := ARRAY[]::text[];
  v_requires_physical_asset boolean := false;
  v_status text := 'READY';
  v_validation text := 'PASSED';
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
  SELECT * INTO v_package
  FROM public.activation_packages
  WHERE customer_id = v_app.customer_id
    AND application_id = v_app.application_id
    AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF FOUND THEN
    RETURN v_package;
  END IF;
  SELECT * INTO v_decision
  FROM public.credit_decisions
  WHERE application_id = v_app.application_id
  ORDER BY decision_timestamp DESC
  LIMIT 1;
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
  IF v_app.status <> 'APPROVED' THEN
    v_blockers := array_append(v_blockers, 'application_not_approved');
  END IF;
  IF v_decision.decision NOT IN ('APPROVED','APPROVED_WITH_CONDITIONS') THEN
    v_blockers := array_append(v_blockers, 'approved_decision_required');
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
    jsonb_build_object('blockers', to_jsonb(v_blockers), 'evaluated_at', now()),
    v_invoice.id, p_idempotency_key, COALESCE(p_request_hash, p_application_id::text || ':' || p_idempotency_key),
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
    jsonb_build_object('application_id', v_app.application_id),
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
  SELECT * INTO v_app
  FROM public.credit_applications
  WHERE application_id = p_application_id
    AND (public.is_platform_owner() OR customer_id = public.current_customer_id())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit application not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT ca.* INTO v_account
  FROM public.credit_accounts ca
  JOIN public.activation_packages ap ON ap.package_id = ca.activation_package_id
  WHERE ca.customer_id = v_app.customer_id
    AND ca.idempotency_key = p_idempotency_key
    AND ap.application_id = v_app.application_id
  LIMIT 1;
  IF FOUND THEN
    RETURN v_account;
  END IF;
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

GRANT EXECUTE ON FUNCTION public.review_credit_application(uuid, text, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_credit_down_payment_invoice(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_activation_package(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_credit_account(uuid, text, text) TO authenticated;