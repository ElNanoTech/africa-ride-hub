-- =====================================================
-- Driver 360 summary RPC
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_driver_360_summary(p_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_driver public.drivers;
  v_open_statuses text[] := ARRAY[
    'pending','approved','active','paid',
    'return_pending','overdue_return','payment_overdue','vehicle_disabled'
  ];
  v_result jsonb;
  v_invoice_totals jsonb;
  v_current_rental jsonb;
  v_accidents jsonb;
  v_tickets jsonb;
  v_wallet jsonb;
  v_kyc jsonb;
  v_credit jsonb;
BEGIN
  IF NOT public.has_admin_role_in(ARRAY['super_admin','manager','support']) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_driver FROM public.drivers WHERE id = p_driver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver not found';
  END IF;

  -- Tenant guard (platform owners see all)
  IF NOT public.is_platform_owner()
     AND v_driver.customer_id IS DISTINCT FROM public.current_customer_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Invoice totals
  SELECT jsonb_build_object(
    'invoices_count', COALESCE(COUNT(*), 0),
    'paid_count', COALESCE(COUNT(*) FILTER (WHERE status = 'paid'), 0),
    'issued_count', COALESCE(COUNT(*) FILTER (WHERE status = 'issued'), 0),
    'cancelled_count', COALESCE(COUNT(*) FILTER (WHERE status = 'cancelled'), 0),
    'total_owed_fcfa', COALESCE(SUM(total_ttc) FILTER (WHERE status = 'issued'), 0),
    'total_paid_fcfa', COALESCE(SUM(total_ttc) FILTER (WHERE status = 'paid'), 0),
    'total_revenue_fcfa', COALESCE(SUM(total_ttc) FILTER (WHERE status IN ('issued','paid')), 0)
  ) INTO v_invoice_totals
  FROM public.invoice
  WHERE driver_id = p_driver_id;

  -- Current open rental (most recent)
  SELECT jsonb_build_object(
    'id', r.id,
    'vehicle_id', r.vehicle_id,
    'vehicle_plate', v.license_plate,
    'vehicle_model', v.model_name,
    'status', r.status,
    'started_at', COALESCE(r.pickup_confirmed_at, r.created_at),
    'daily_rate', COALESCE(r.final_rate, r.approved_rate, r.requested_rate),
    'return_due_at', r.return_due_at
  ) INTO v_current_rental
  FROM public.rentals r
  LEFT JOIN public.vehicles v ON v.id = r.vehicle_id
  WHERE r.driver_id = p_driver_id
    AND r.status = ANY (v_open_statuses)
  ORDER BY r.created_at DESC
  LIMIT 1;

  -- Accidents
  SELECT jsonb_build_object(
    'open_count', COALESCE(COUNT(*) FILTER (WHERE status NOT IN ('CLOSED','RESOLVED')), 0),
    'total_count', COALESCE(COUNT(*), 0),
    'last_at', MAX(accident_datetime)
  ) INTO v_accidents
  FROM public.accidents
  WHERE driver_id = p_driver_id;

  -- Support tickets
  SELECT jsonb_build_object(
    'open_count', COALESCE(COUNT(*) FILTER (WHERE status IN ('open','in_progress')), 0),
    'total_count', COALESCE(COUNT(*), 0),
    'last_at', MAX(updated_at)
  ) INTO v_tickets
  FROM public.support_tickets
  WHERE driver_id = p_driver_id;

  -- Wallet
  SELECT jsonb_build_object('balance_fcfa', COALESCE(balance, 0))
  INTO v_wallet
  FROM public.driver_wallets
  WHERE driver_id = p_driver_id
  LIMIT 1;

  IF v_wallet IS NULL THEN
    v_wallet := jsonb_build_object('balance_fcfa', 0);
  END IF;

  -- KYC
  SELECT jsonb_build_object(
    'status', v_driver.kyc_status,
    'last_submitted_at', MAX(submitted_at)
  ) INTO v_kyc
  FROM public.kyc_submissions
  WHERE driver_id = p_driver_id;

  IF v_kyc IS NULL THEN
    v_kyc := jsonb_build_object('status', v_driver.kyc_status, 'last_submitted_at', NULL);
  END IF;

  -- Credit score (latest)
  SELECT jsonb_build_object(
    'current', cs.score,
    'tier', cs.tier,
    'last_event_at', cs.created_at
  ) INTO v_credit
  FROM public.credit_scores cs
  WHERE cs.driver_id = p_driver_id
  ORDER BY cs.created_at DESC
  LIMIT 1;

  v_result := jsonb_build_object(
    'driver', jsonb_build_object(
      'id', v_driver.id,
      'full_name', v_driver.full_name,
      'phone', v_driver.phone_number,
      'status', v_driver.driver_status,
      'customer_id', v_driver.customer_id,
      'active_since', v_driver.created_at,
      'score', COALESCE((v_credit->>'current')::int, NULL)
    ),
    'totals', v_invoice_totals,
    'current_rental', v_current_rental,
    'accidents', v_accidents,
    'tickets', v_tickets,
    'wallet', v_wallet,
    'kyc', v_kyc,
    'credit_score', v_credit
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_driver_360_summary(uuid) TO authenticated;


-- =====================================================
-- Driver activity timeline RPC
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_driver_activity_timeline(
  p_driver_id uuid,
  p_limit integer DEFAULT 100
)
RETURNS TABLE(
  occurred_at timestamptz,
  source text,
  action text,
  summary text,
  reference_id uuid,
  metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_driver public.drivers;
BEGIN
  IF NOT public.has_admin_role_in(ARRAY['super_admin','manager','support']) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_driver FROM public.drivers WHERE id = p_driver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver not found';
  END IF;

  IF NOT public.is_platform_owner()
     AND v_driver.customer_id IS DISTINCT FROM public.current_customer_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH unified AS (
    -- Invoice events
    SELECT
      ia.created_at AS occurred_at,
      'invoice'::text AS source,
      ia.action AS action,
      ('Facture ' || COALESCE(inv.invoice_number, substr(inv.id::text, 1, 8))
        || ' — ' || ia.action) AS summary,
      inv.id AS reference_id,
      ia.metadata AS metadata
    FROM public.invoice_audit ia
    JOIN public.invoice inv ON inv.id = ia.invoice_id
    WHERE inv.driver_id = p_driver_id

    UNION ALL
    -- Payment status changes (use latest paid_at when paid, otherwise created_at)
    SELECT
      COALESCE(p.paid_at, p.created_at) AS occurred_at,
      'payment'::text AS source,
      p.status AS action,
      ('Paiement ' || p.payment_type || ' — ' || p.status
        || ' · ' || (p.amount::text) || ' FCFA') AS summary,
      p.id AS reference_id,
      jsonb_build_object('payment_type', p.payment_type, 'amount', p.amount, 'due_date', p.due_date) AS metadata
    FROM public.payments p
    WHERE p.driver_id = p_driver_id

    UNION ALL
    -- Accident activity
    SELECT
      aa.created_at AS occurred_at,
      'accident'::text AS source,
      aa.action_type AS action,
      ('Sinistre ' || COALESCE(a.case_number, substr(a.id::text, 1, 8))
        || ' — ' || aa.action_type) AS summary,
      a.id AS reference_id,
      aa.metadata AS metadata
    FROM public.accident_activity aa
    JOIN public.accidents a ON a.id = aa.accident_id
    WHERE a.driver_id = p_driver_id

    UNION ALL
    -- Admin actions on the driver entity
    SELECT
      al.created_at AS occurred_at,
      'admin_audit'::text AS source,
      al.action AS action,
      ('Admin — ' || al.action
        || COALESCE(' (' || al.entity_type || ')', '')) AS summary,
      al.entity_id AS reference_id,
      COALESCE(al.details, al.metadata) AS metadata
    FROM public.admin_audit_logs al
    WHERE al.entity_id = p_driver_id

    UNION ALL
    -- Driver score events
    SELECT
      se.created_at AS occurred_at,
      'score'::text AS source,
      se.reason AS action,
      ('Score ' || (CASE WHEN se.delta >= 0 THEN '+' ELSE '' END) || se.delta::text
        || ' — ' || se.reason) AS summary,
      se.id AS reference_id,
      jsonb_build_object('delta', se.delta, 'accident_id', se.accident_id) AS metadata
    FROM public.driver_score_events se
    WHERE se.driver_id = p_driver_id
  )
  SELECT * FROM unified
  ORDER BY occurred_at DESC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_driver_activity_timeline(uuid, integer) TO authenticated;