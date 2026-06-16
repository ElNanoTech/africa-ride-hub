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
    v_invoice.id,
    p_idempotency_key,
    COALESCE(p_request_hash, encode(digest(convert_to(p_application_id::text || p_idempotency_key, 'UTF8'), 'sha256'::text), 'hex')),
    auth.uid(),
    auth.uid(),
    now()
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

GRANT EXECUTE ON FUNCTION public.create_activation_package(uuid, text, text) TO authenticated;