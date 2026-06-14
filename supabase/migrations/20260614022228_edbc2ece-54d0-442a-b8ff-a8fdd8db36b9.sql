-- =====================================================================
-- CHAUFFEURS — punch list CH-B1 / CH-B3 / CH-B4 (backend)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.driver_risk_from_factors(
  p_overdue_invoices int,
  p_open_accidents int,
  p_unpaid_violations int,
  p_kyc_verified boolean,
  p_control_late boolean,
  p_score int
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_points int := 0;
  v_reasons text[] := ARRAY[]::text[];
  v_level text;
BEGIN
  IF COALESCE(p_overdue_invoices, 0) >= 3 THEN
    v_points := v_points + 2;
    v_reasons := v_reasons || (p_overdue_invoices || ' factures en retard');
  ELSIF COALESCE(p_overdue_invoices, 0) >= 1 THEN
    v_points := v_points + 1;
    v_reasons := v_reasons || (CASE WHEN p_overdue_invoices = 1
      THEN '1 facture en retard'
      ELSE p_overdue_invoices || ' factures en retard' END);
  END IF;

  IF COALESCE(p_open_accidents, 0) >= 1 THEN
    v_points := v_points + 1;
    v_reasons := v_reasons || (CASE WHEN p_open_accidents = 1
      THEN 'Sinistre ouvert'
      ELSE p_open_accidents || ' sinistres ouverts' END);
  END IF;

  IF COALESCE(p_unpaid_violations, 0) >= 1 THEN
    v_points := v_points + 1;
    v_reasons := v_reasons || (CASE WHEN p_unpaid_violations = 1
      THEN '1 contravention impayée'
      ELSE p_unpaid_violations || ' contraventions impayées' END);
  END IF;

  IF NOT COALESCE(p_kyc_verified, false) THEN
    v_points := v_points + 1;
    v_reasons := v_reasons || 'KYC manquant/expiré'::text;
  END IF;

  IF COALESCE(p_control_late, false) THEN
    v_points := v_points + 1;
    v_reasons := v_reasons || 'Contrôle véhicule en retard'::text;
  END IF;

  IF p_score IS NOT NULL AND p_score < 350 THEN
    v_points := v_points + 2;
    v_reasons := v_reasons || ('Score faible (' || p_score || ')');
  ELSIF p_score IS NOT NULL AND p_score < 450 THEN
    v_points := v_points + 1;
    v_reasons := v_reasons || ('Score faible (' || p_score || ')');
  END IF;

  v_level := CASE
    WHEN v_points >= 3 THEN 'critique'
    WHEN v_points = 2 THEN 'eleve'
    WHEN v_points = 1 THEN 'moyen'
    ELSE 'bon'
  END;

  IF v_level = 'bon' THEN
    v_reasons := ARRAY['Aucun facteur de risque détecté'];
  END IF;

  RETURN jsonb_build_object('level', v_level, 'reasons', to_jsonb(v_reasons));
END;
$fn$;

REVOKE ALL ON FUNCTION public.driver_risk_from_factors(int,int,int,boolean,boolean,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_risk_from_factors(int,int,int,boolean,boolean,int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.driver_risk(p_driver uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_driver public.drivers;
  v_overdue_invoices int;
  v_open_accidents int;
  v_unpaid_violations int;
  v_control_late boolean;
  v_score int;
  v_result jsonb;
BEGIN
  SELECT * INTO v_driver FROM public.drivers WHERE id = p_driver;

  IF NOT COALESCE(
    public.is_platform_owner()
    OR (public.is_admin() AND v_driver.customer_id = public.current_customer_id())
    OR public.current_driver_id() = p_driver,
    false
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF v_driver.id IS NULL THEN RAISE EXCEPTION 'driver not found'; END IF;

  SELECT COUNT(DISTINCT i.id) INTO v_overdue_invoices
    FROM public.invoice i
    JOIN public.invoice_payment_link ipl ON ipl.invoice_id = i.id
    JOIN public.payments p ON p.id = ipl.payment_id
   WHERE i.driver_id = p_driver
     AND i.customer_id = v_driver.customer_id
     AND i.status IN ('issued','partial')
     AND COALESCE(i.remaining_due, 0) > 0
     AND (p.status IN ('overdue','late')
          OR (p.status IN ('pending','partial','overpaid') AND p.due_date < CURRENT_DATE));

  SELECT COUNT(*) INTO v_open_accidents
    FROM public.accidents a
   WHERE a.driver_id = p_driver
     AND a.customer_id = v_driver.customer_id
     AND a.status NOT IN ('DRAFT','CLOSED','CANCELLED','RESOLVED_AT_FAULT','RESOLVED_NOT_AT_FAULT');

  SELECT COUNT(*) INTO v_unpaid_violations
    FROM public.traffic_violations tv
   WHERE tv.driver_id = p_driver
     AND tv.customer_id = v_driver.customer_id
     AND tv.status = 'pending_payment';

  SELECT EXISTS (
    SELECT 1 FROM public.vehicle_inspections vi
     WHERE vi.driver_id = p_driver
       AND vi.customer_id = v_driver.customer_id
       AND vi.status IN ('overdue','blocked')
  ) INTO v_control_late;

  SELECT ds.current_score INTO v_score
    FROM public.driver_scores ds
   WHERE ds.driver_id = p_driver
     AND (ds.customer_id = v_driver.customer_id OR ds.customer_id IS NULL)
   ORDER BY (ds.customer_id = v_driver.customer_id) DESC NULLS LAST,
            ds.updated_at DESC
   LIMIT 1;

  v_result := public.driver_risk_from_factors(
    v_overdue_invoices,
    v_open_accidents,
    v_unpaid_violations,
    v_driver.kyc_status = 'verified',
    v_control_late,
    v_score
  );

  RETURN v_result || jsonb_build_object('computed_at', now());
END;
$fn$;

REVOKE ALL ON FUNCTION public.driver_risk(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_risk(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.drivers_risk_summary();

CREATE FUNCTION public.drivers_risk_summary()
RETURNS TABLE(driver_id uuid, level text, reasons text[], overdue_payments integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_customer uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.is_platform_owner() OR public.is_admin()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  v_customer := public.current_customer_id();
  IF v_customer IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH tenant_drivers AS (
    SELECT d.id, d.kyc_status
      FROM public.drivers d
     WHERE d.customer_id = v_customer
  ),
  overdue_inv AS (
    SELECT i.driver_id AS d_id, COUNT(DISTINCT i.id)::int AS n
      FROM public.invoice i
      JOIN public.invoice_payment_link ipl ON ipl.invoice_id = i.id
      JOIN public.payments p ON p.id = ipl.payment_id
     WHERE i.customer_id = v_customer
       AND i.status IN ('issued','partial')
       AND COALESCE(i.remaining_due, 0) > 0
       AND (p.status IN ('overdue','late')
            OR (p.status IN ('pending','partial','overpaid') AND p.due_date < CURRENT_DATE))
     GROUP BY i.driver_id
  ),
  open_acc AS (
    SELECT a.driver_id AS d_id, COUNT(*)::int AS n
      FROM public.accidents a
     WHERE a.customer_id = v_customer
       AND a.status NOT IN ('DRAFT','CLOSED','CANCELLED','RESOLVED_AT_FAULT','RESOLVED_NOT_AT_FAULT')
     GROUP BY a.driver_id
  ),
  unpaid_tv AS (
    SELECT tv.driver_id AS d_id, COUNT(*)::int AS n
      FROM public.traffic_violations tv
     WHERE tv.customer_id = v_customer
       AND tv.driver_id IS NOT NULL
       AND tv.status = 'pending_payment'
     GROUP BY tv.driver_id
  ),
  late_fc AS (
    SELECT DISTINCT vi.driver_id AS d_id
      FROM public.vehicle_inspections vi
     WHERE vi.customer_id = v_customer
       AND vi.driver_id IS NOT NULL
       AND vi.status IN ('overdue','blocked')
  ),
  overdue_pay AS (
    SELECT p.driver_id AS d_id, COUNT(*)::int AS n
      FROM public.payments p
      JOIN tenant_drivers tdp ON tdp.id = p.driver_id
     WHERE p.status = 'overdue'
        OR (p.status IN ('pending','partial') AND p.due_date < CURRENT_DATE)
     GROUP BY p.driver_id
  )
  SELECT
    td.id AS driver_id,
    (r.value ->> 'level')::text AS level,
    ARRAY(SELECT jsonb_array_elements_text(r.value -> 'reasons'))::text[] AS reasons,
    COALESCE(op.n, 0) AS overdue_payments
  FROM tenant_drivers td
  LEFT JOIN overdue_inv oi ON oi.d_id = td.id
  LEFT JOIN open_acc oa ON oa.d_id = td.id
  LEFT JOIN unpaid_tv ut ON ut.d_id = td.id
  LEFT JOIN late_fc lf ON lf.d_id = td.id
  LEFT JOIN overdue_pay op ON op.d_id = td.id
  LEFT JOIN LATERAL (
    SELECT ds.current_score::int AS score
      FROM public.driver_scores ds
     WHERE ds.driver_id = td.id
       AND (ds.customer_id = v_customer OR ds.customer_id IS NULL)
     ORDER BY (ds.customer_id = v_customer) DESC NULLS LAST,
              ds.updated_at DESC
     LIMIT 1
  ) sc ON TRUE
  CROSS JOIN LATERAL (
    SELECT public.driver_risk_from_factors(
      COALESCE(oi.n, 0),
      COALESCE(oa.n, 0),
      COALESCE(ut.n, 0),
      td.kyc_status = 'verified',
      lf.d_id IS NOT NULL,
      sc.score
    ) AS value
  ) r;
END;
$fn$;

REVOKE ALL ON FUNCTION public.drivers_risk_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.drivers_risk_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_driver_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.driver_wallets (driver_id, customer_id, balance)
  VALUES (NEW.id, NEW.customer_id, 0)
  ON CONFLICT (driver_id) DO NOTHING;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_create_driver_wallet ON public.drivers;
CREATE TRIGGER trg_create_driver_wallet
  AFTER INSERT ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.create_driver_wallet();

INSERT INTO public.driver_wallets (driver_id, customer_id, balance)
SELECT d.id, d.customer_id, 0
  FROM public.drivers d
ON CONFLICT (driver_id) DO NOTHING;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['driver_documents','kyc_submissions'] LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';