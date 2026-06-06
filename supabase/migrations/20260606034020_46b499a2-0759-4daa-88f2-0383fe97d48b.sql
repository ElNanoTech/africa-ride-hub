
-- =========================================================
-- Phase 6: Alerts
-- =========================================================
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  source_table TEXT,
  source_id UUID,
  due_date DATE,
  dedupe_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT alerts_severity_check CHECK (severity IN ('low','medium','high','critical')),
  CONSTRAINT alerts_status_check CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  CONSTRAINT alerts_type_check CHECK (alert_type IN (
    'kyc_expiry','insurance_expiry','registration_expiry','rental_overdue',
    'payment_overdue','low_score','accident_unresolved','contravention_pending',
    'inspection_overdue','vehicle_immobilized'
  ))
);

CREATE UNIQUE INDEX alerts_dedupe_key_unique ON public.alerts (dedupe_key) WHERE status <> 'resolved';
CREATE INDEX idx_alerts_customer_status ON public.alerts (customer_id, status, created_at DESC);
CREATE INDEX idx_alerts_driver ON public.alerts (driver_id);
CREATE INDEX idx_alerts_vehicle ON public.alerts (vehicle_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owners manage all alerts"
ON public.alerts FOR ALL TO authenticated
USING (is_platform_owner())
WITH CHECK (is_platform_owner());

CREATE POLICY "Tenant admins view alerts"
ON public.alerts FOR SELECT TO authenticated
USING (is_admin() AND customer_id = current_customer_id());

CREATE POLICY "Tenant admins update alerts"
ON public.alerts FOR UPDATE TO authenticated
USING (is_admin() AND customer_id = current_customer_id())
WITH CHECK (is_admin() AND customer_id = current_customer_id());

CREATE POLICY "Tenant admins insert alerts"
ON public.alerts FOR INSERT TO authenticated
WITH CHECK (is_admin() AND customer_id = current_customer_id());

CREATE TRIGGER trg_alerts_updated_at
BEFORE UPDATE ON public.alerts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Generator function (idempotent, called by cron + on demand)
-- =========================================================
CREATE OR REPLACE FUNCTION public.generate_fleet_alerts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  -- Insurance expiry from other_charges (period_end within 30 days or passed)
  INSERT INTO public.alerts (customer_id, alert_type, severity, title, message,
    vehicle_id, source_table, source_id, due_date, dedupe_key, metadata)
  SELECT oc.customer_id,
         'insurance_expiry',
         CASE WHEN oc.period_end < CURRENT_DATE THEN 'critical'
              WHEN oc.period_end <= CURRENT_DATE + 7 THEN 'high'
              ELSE 'medium' END,
         'Assurance bientôt expirée — ' || COALESCE(v.license_plate,'véhicule'),
         'Échéance le ' || to_char(oc.period_end,'DD/MM/YYYY'),
         oc.vehicle_id, 'other_charges', oc.id, oc.period_end,
         'insurance_expiry:' || oc.id::text,
         jsonb_build_object('charge_type', oc.charge_type)
  FROM public.other_charges oc
  LEFT JOIN public.vehicles v ON v.id = oc.vehicle_id
  WHERE oc.charge_type = 'insurance'
    AND oc.period_end IS NOT NULL
    AND oc.period_end <= CURRENT_DATE + 30
  ON CONFLICT (dedupe_key) WHERE status <> 'resolved' DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Registration / vignette expiry
  INSERT INTO public.alerts (customer_id, alert_type, severity, title, message,
    vehicle_id, source_table, source_id, due_date, dedupe_key, metadata)
  SELECT oc.customer_id,
         'registration_expiry',
         CASE WHEN oc.period_end < CURRENT_DATE THEN 'critical'
              WHEN oc.period_end <= CURRENT_DATE + 7 THEN 'high'
              ELSE 'medium' END,
         'Document véhicule à renouveler — ' || COALESCE(v.license_plate,'véhicule'),
         oc.label || ' — échéance le ' || to_char(oc.period_end,'DD/MM/YYYY'),
         oc.vehicle_id, 'other_charges', oc.id, oc.period_end,
         'registration_expiry:' || oc.id::text,
         jsonb_build_object('charge_type', oc.charge_type)
  FROM public.other_charges oc
  LEFT JOIN public.vehicles v ON v.id = oc.vehicle_id
  WHERE oc.charge_type IN ('registration','vignette','technical_inspection','tax')
    AND oc.period_end IS NOT NULL
    AND oc.period_end <= CURRENT_DATE + 30
  ON CONFLICT (dedupe_key) WHERE status <> 'resolved' DO NOTHING;

  -- Overdue rentals (payment overdue)
  INSERT INTO public.alerts (customer_id, alert_type, severity, title, message,
    driver_id, vehicle_id, source_table, source_id, due_date, dedupe_key)
  SELECT r.customer_id,
         'payment_overdue',
         'high',
         'Paiement location en retard — ' || COALESCE(d.full_name,'chauffeur'),
         'Location #' || substr(r.id::text,1,8) || ' échue depuis le ' || to_char(r.payment_due_at_final::date,'DD/MM/YYYY'),
         r.driver_id, r.vehicle_id, 'rentals', r.id, r.payment_due_at_final::date,
         'payment_overdue:' || r.id::text
  FROM public.rentals r
  LEFT JOIN public.drivers d ON d.id = r.driver_id
  WHERE r.status IN ('payment_overdue','overdue_return')
  ON CONFLICT (dedupe_key) WHERE status <> 'resolved' DO NOTHING;

  -- Low DAM score
  INSERT INTO public.alerts (customer_id, alert_type, severity, title, message,
    driver_id, source_table, source_id, dedupe_key, metadata)
  SELECT d.customer_id,
         'low_score',
         CASE WHEN cs.score < 400 THEN 'critical'
              WHEN cs.score < 500 THEN 'high' ELSE 'medium' END,
         'Score DAM faible — ' || COALESCE(d.full_name,'chauffeur'),
         'Score actuel : ' || cs.score::text,
         d.id, 'credit_scores', cs.id,
         'low_score:' || d.id::text || ':' || to_char(CURRENT_DATE,'IYYY-IW'),
         jsonb_build_object('score', cs.score)
  FROM public.credit_scores cs
  JOIN public.drivers d ON d.id = cs.driver_id
  WHERE cs.score < 550
  ON CONFLICT (dedupe_key) WHERE status <> 'resolved' DO NOTHING;

  -- Unresolved accidents (>48h)
  INSERT INTO public.alerts (customer_id, alert_type, severity, title, message,
    driver_id, vehicle_id, source_table, source_id, dedupe_key)
  SELECT a.customer_id,
         'accident_unresolved',
         CASE WHEN a.severity IN ('major','severe') THEN 'critical' ELSE 'high' END,
         'Accident non résolu — ' || COALESCE(d.full_name,'chauffeur'),
         'Déclaré le ' || to_char(a.accident_date,'DD/MM/YYYY'),
         a.driver_id, a.vehicle_id, 'accidents', a.id,
         'accident_unresolved:' || a.id::text
  FROM public.accidents a
  LEFT JOIN public.drivers d ON d.id = a.driver_id
  WHERE a.status NOT IN ('closed','resolved','archived')
    AND a.created_at < now() - interval '48 hours'
  ON CONFLICT (dedupe_key) WHERE status <> 'resolved' DO NOTHING;

  -- Pending contraventions
  INSERT INTO public.alerts (customer_id, alert_type, severity, title, message,
    driver_id, vehicle_id, source_table, source_id, due_date, dedupe_key, metadata)
  SELECT tv.customer_id,
         'contravention_pending',
         CASE WHEN tv.amount >= 50000 THEN 'high' ELSE 'medium' END,
         'Contravention à régler — ' || COALESCE(tv.license_plate,''),
         'PV ' || COALESCE(tv.pv_number,'') || ' — ' || tv.amount::text || ' FCFA',
         tv.driver_id, tv.vehicle_id, 'traffic_violations', tv.id, tv.violation_date::date,
         'contravention_pending:' || tv.id::text,
         jsonb_build_object('amount', tv.amount, 'pv', tv.pv_number)
  FROM public.traffic_violations tv
  WHERE tv.status = 'pending'
    AND tv.violation_date < now() - interval '24 hours'
  ON CONFLICT (dedupe_key) WHERE status <> 'resolved' DO NOTHING;

  -- Overdue / expired inspections
  INSERT INTO public.alerts (customer_id, alert_type, severity, title, message,
    driver_id, vehicle_id, source_table, source_id, dedupe_key)
  SELECT vi.customer_id,
         'inspection_overdue',
         'high',
         'Inspection véhicule expirée',
         'Inspection ' || vi.status || ' depuis le ' || to_char(vi.created_at::date,'DD/MM/YYYY'),
         vi.driver_id, vi.vehicle_id, 'vehicle_inspections', vi.id,
         'inspection_overdue:' || vi.id::text
  FROM public.vehicle_inspections vi
  WHERE vi.status IN ('expired','overdue')
  ON CONFLICT (dedupe_key) WHERE status <> 'resolved' DO NOTHING;

  -- Auto-resolve obsolete alerts (source no longer matches)
  UPDATE public.alerts a SET status = 'resolved', resolved_at = now()
  WHERE status = 'open'
    AND alert_type = 'payment_overdue'
    AND NOT EXISTS (
      SELECT 1 FROM public.rentals r
      WHERE r.id = a.source_id AND r.status IN ('payment_overdue','overdue_return')
    );

  UPDATE public.alerts a SET status = 'resolved', resolved_at = now()
  WHERE status = 'open'
    AND alert_type = 'contravention_pending'
    AND NOT EXISTS (
      SELECT 1 FROM public.traffic_violations tv
      WHERE tv.id = a.source_id AND tv.status = 'pending'
    );

  RETURN (SELECT COUNT(*) FROM public.alerts WHERE created_at > now() - interval '1 minute');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_fleet_alerts() TO authenticated, service_role;

-- =========================================================
-- Security hardening
-- =========================================================

-- Rentals: scope admin policy to current_customer_id
DROP POLICY IF EXISTS "admin manages rentals" ON public.rentals;
CREATE POLICY "admin manages rentals"
ON public.rentals FOR ALL TO authenticated
USING (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin','manager']) AND customer_id = current_customer_id())
)
WITH CHECK (
  is_platform_owner()
  OR (has_admin_role_in(ARRAY['super_admin','manager']) AND customer_id = current_customer_id())
);

DROP POLICY IF EXISTS "driver views own rentals" ON public.rentals;
CREATE POLICY "driver views own rentals"
ON public.rentals FOR SELECT TO authenticated
USING (driver_id = current_driver_id());

-- (admin SELECT is covered by the FOR ALL policy above)

-- Rent-to-own contracts: drop unscoped admin branch from driver SELECT policy
DROP POLICY IF EXISTS "Drivers view own contracts" ON public.rent_to_own_contracts;
CREATE POLICY "Drivers view own contracts"
ON public.rent_to_own_contracts FOR SELECT TO authenticated
USING (driver_id = current_driver_id());

DROP POLICY IF EXISTS "Drivers view own milestones" ON public.contract_milestones;
CREATE POLICY "Drivers view own milestones"
ON public.contract_milestones FOR SELECT TO authenticated
USING (contract_id IN (
  SELECT id FROM public.rent_to_own_contracts WHERE driver_id = current_driver_id()
));

DROP POLICY IF EXISTS "Drivers view own contract payments" ON public.contract_payments;
CREATE POLICY "Drivers view own contract payments"
ON public.contract_payments FOR SELECT TO authenticated
USING (contract_id IN (
  SELECT id FROM public.rent_to_own_contracts WHERE driver_id = current_driver_id()
));
