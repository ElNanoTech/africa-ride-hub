-- =====================================================================
-- CHAUFFEURS — punch list CH-B1 / CH-B3 / CH-B4 (backend)
-- =====================================================================

-- ---------------------------------------------------------------------
-- CH-B1 — Risk model (computed, not stored — decision D-2).
--
-- driver_risk_from_factors(): pure tier math shared by driver_risk()
-- (single driver) and drivers_risk_summary() (batched list). Mirrored in
-- TS by riskLevelFromFactors() in src/lib/driverRisk.ts — keep the two in
-- sync (same weights, same French reason strings).
--
-- Scoring rule (documented here, unit-tested in src/lib/driverRisk.test.ts):
--   start at 'bon' (0 points), each factor adds tier points:
--     * overdue invoices:      1-2 → +1, 3+ → +2
--     * open accident(s):      1+  → +1   (open = status NOT IN
--       ('DRAFT','CLOSED','CANCELLED','RESOLVED_AT_FAULT','RESOLVED_NOT_AT_FAULT')
--       — a DRAFT sinistre is not yet declared, so it is not a risk factor)
--     * unpaid contraventions: 1+  → +1   (traffic_violations.status = 'pending_payment')
--     * KYC not verified:           +1   (drivers.kyc_status <> 'verified')
--     * fleet control late:         +1   (active vehicle_inspections in overdue/blocked)
--     * low score:  current_score < 450 → +1, < 350 → +2
--   level = bon(0) / moyen(1) / eleve(2) / critique(>=3).
--   reasons[] holds one French string per triggered factor; when level=bon
--   it is ['Aucun facteur de risque détecté'] — never empty.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.driver_risk_from_factors(
  p_overdue_invoices int,
  p_open_accidents int,
  p_unpaid_violations int,
  p_kyc_verified boolean,
  p_control_late boolean,
  p_score int  -- NULL when the driver has no driver_scores row
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

-- ---------------------------------------------------------------------
-- CH-B1 — driver_risk(p_driver): single-driver risk for the profile page
-- (and later the driver PWA — a driver may call it for SELF).
--
-- Factor sources:
--   * overdue invoices — `invoice` has no due_date and no overdue status
--     ('draft','issued','partial','paid','cancelled'); lateness lives on
--     the linked payment (invoice_payment_link → payments.due_date /
--     status 'overdue'/'late'). An invoice is "en retard" when it is
--     unpaid (issued/partial, remaining_due > 0) AND its linked payment is
--     overdue/late or past due_date while still unpaid.
--   * open accidents — open = status NOT IN ('DRAFT','CLOSED','CANCELLED',
--     'RESOLVED_AT_FAULT','RESOLVED_NOT_AT_FAULT'): DRAFT sinistres are not
--     yet declared, so they don't count (same rule in drivers_risk_summary()).
--   * unpaid contraventions — traffic_violations.status = 'pending_payment'.
--   * KYC — drivers.kyc_status <> 'verified'.
--   * fleet control — an active vehicle_inspections row in overdue/blocked.
--   * score — driver_scores.current_score (NULL-safe), deterministic pick:
--     prefer the row with customer_id = the driver's tenant, else the row
--     with customer_id IS NULL, else no score factor (same rule in
--     drivers_risk_summary()).
--
-- Every factor query is scoped to the driver's tenant (customer_id) —
-- identical semantics to drivers_risk_summary(), so the profile page and
-- the list never disagree.
-- ---------------------------------------------------------------------
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

  -- Tenant-scoped: admin of the driver's customer, platform owner, or the
  -- driver themself (the driver PWA reuses this RPC later). COALESCE guards
  -- the NULL trap: current_driver_id() / current_customer_id() return NULL
  -- for non-driver/tenant-less callers, and `IF NOT (... OR NULL)` would
  -- silently grant access instead of raising.
  --
  -- Authorization is checked BEFORE existence: an unauthorized caller gets
  -- the same 'not authorized' error whether or not the driver exists, so the
  -- RPC is not an existence oracle for other tenants' driver ids. (When the
  -- driver is missing, v_driver.customer_id is NULL, every branch below is
  -- false/NULL and COALESCE raises 'not authorized'.)
  IF NOT COALESCE(
    public.is_platform_owner()
    OR (public.is_admin() AND v_driver.customer_id = public.current_customer_id())
    OR public.current_driver_id() = p_driver,
    false
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF v_driver.id IS NULL THEN RAISE EXCEPTION 'driver not found'; END IF;

  -- Every factor query below is scoped to the driver's tenant
  -- (v_driver.customer_id) — same semantics as drivers_risk_summary().
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

  -- Open = not DRAFT (not yet declared) and not closed/resolved/cancelled.
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

  -- Deterministic score pick: prefer the row scoped to the driver's tenant,
  -- else the tenant-less (customer_id IS NULL) row, else no score factor.
  -- `(customer_id = tenant)` is NULL for the NULL-customer row, so
  -- DESC NULLS LAST ranks tenant row > NULL row; updated_at breaks ties.
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

-- ---------------------------------------------------------------------
-- CH-B1 — drivers_risk_summary(): batched risk for the /admin/drivers
-- list. One pass with grouped CTEs (no per-row loop) — efficient for
-- ~500 drivers. Scope: the caller's current tenant (current_customer_id());
-- platform owners get their currently active tenant too.
--
-- overdue_payments: count of the driver's overdue payments — same
-- "en retard" rule as /admin/payments (status 'overdue' OR an unpaid
-- pending/partial payment past its due_date; TS twin: isPaymentOverdue()
-- in src/lib/payments.ts). Computed here so Drivers.tsx doesn't need an
-- unbounded payments companion query (1000-row PostgREST cap).
-- ---------------------------------------------------------------------
-- DROP first: CREATE OR REPLACE cannot change the OUT-parameter list if an
-- earlier draft of this (unreleased) function exists on a dev database.
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
    -- No active tenant (e.g. platform owner without a selected customer):
    -- return honestly empty rather than leaking cross-tenant data.
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
    -- Open = not DRAFT (not yet declared) and not closed/resolved/cancelled
    -- (same rule as driver_risk()).
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
    -- Same "en retard" rule as /admin/payments (TS twin: isPaymentOverdue()
    -- in src/lib/payments.ts): explicit overdue status OR an unpaid
    -- pending/partial payment past its due date. Scoped through
    -- tenant_drivers (like the client query, which relied on RLS) so legacy
    -- payments rows with a NULL customer_id are still counted.
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
  -- Deterministic score pick (same rule as driver_risk()): prefer the row
  -- with customer_id = the tenant, else the customer_id IS NULL row, else no
  -- score factor. DESC NULLS LAST ranks tenant row > NULL row; updated_at
  -- breaks ties.
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

-- ---------------------------------------------------------------------
-- CH-B3 — Wallet auto-creation. No trigger existed (verified: only score
-- seeding triggers fire on drivers insert; wallets were created lazily by
-- record_driver_deposit / update_rental_fee upserts). Every driver now
-- gets a zero-balance wallet at creation, same tenant. Idempotent via the
-- driver_wallets.driver_id UNIQUE constraint.
-- ---------------------------------------------------------------------
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

-- One-off backfill for existing drivers without a wallet (safe re-run).
INSERT INTO public.driver_wallets (driver_id, customer_id, balance)
SELECT d.id, d.customer_id, 0
  FROM public.drivers d
ON CONFLICT (driver_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- CH-B4 — Realtime: publish driver_documents so the open profile's
-- Documents tab refreshes without manual reload. The other profile
-- subscriptions (driver_wallet_transactions, payments, invoice,
-- driver_score_events, kyc_submissions) are already in the publication
-- (migrations 20260101075639 / 20260420062345 / 20260422151812 /
-- 20260523012725). Same idempotent pattern as 20260612121500.
-- kyc_submissions is included here for REPLICA IDENTITY FULL: without it,
-- DELETE events carry only the primary key and the DriverDetail.tsx
-- subscription (matchesDriver on old.driver_id) would silently miss them.
-- ---------------------------------------------------------------------
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
