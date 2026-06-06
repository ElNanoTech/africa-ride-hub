-- Allow new alert types
ALTER TABLE public.alerts DROP CONSTRAINT IF EXISTS alerts_type_check;
ALTER TABLE public.alerts ADD CONSTRAINT alerts_type_check CHECK (alert_type = ANY (ARRAY[
  'kyc_expiry','insurance_expiry','registration_expiry','rental_overdue','payment_overdue',
  'low_score','accident_unresolved','contravention_pending','inspection_overdue','vehicle_immobilized',
  'invoice_overdue','kyc_pending_review','kyc_rejected'
]));

CREATE OR REPLACE FUNCTION public.generate_fleet_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  -- Insurance expiry from other_charges
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
         CASE WHEN a.severity IN ('SEVERE','MODERATE') THEN 'critical' ELSE 'high' END,
         'Accident non résolu — ' || COALESCE(d.full_name,'chauffeur'),
         'Déclaré le ' || to_char(a.accident_datetime,'DD/MM/YYYY'),
         a.driver_id, a.vehicle_id, 'accidents', a.id,
         'accident_unresolved:' || a.id::text
  FROM public.accidents a
  LEFT JOIN public.drivers d ON d.id = a.driver_id
  WHERE a.status NOT IN ('CLOSED','RESOLVED_NOT_AT_FAULT','RESOLVED_AT_FAULT','CANCELLED')
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
  WHERE tv.status = 'pending_payment'
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

  -- NEW: Overdue invoices (issued, partially paid or unpaid, >7 days old)
  INSERT INTO public.alerts (customer_id, alert_type, severity, title, message,
    driver_id, source_table, source_id, due_date, dedupe_key, metadata)
  SELECT i.customer_id,
         'invoice_overdue',
         CASE
           WHEN i.issued_at < now() - interval '30 days' THEN 'critical'
           WHEN i.issued_at < now() - interval '14 days' THEN 'high'
           ELSE 'medium'
         END,
         'Facture impayée — ' || COALESCE(i.invoice_number, substr(i.id::text,1,8)),
         'Reste dû : ' || COALESCE(i.remaining_due, i.total_ttc)::text || ' FCFA — émise le ' || to_char(i.issued_at::date,'DD/MM/YYYY'),
         i.driver_id, 'invoice', i.id, i.issued_at::date,
         'invoice_overdue:' || i.id::text,
         jsonb_build_object('remaining_due', i.remaining_due, 'invoice_number', i.invoice_number)
  FROM public.invoice i
  WHERE i.status = 'issued'
    AND i.issued_at IS NOT NULL
    AND i.issued_at < now() - interval '7 days'
    AND COALESCE(i.remaining_due, i.total_ttc) > 0
  ON CONFLICT (dedupe_key) WHERE status <> 'resolved' DO NOTHING;

  -- NEW: KYC pending review > 48h
  INSERT INTO public.alerts (customer_id, alert_type, severity, title, message,
    driver_id, source_table, source_id, dedupe_key)
  SELECT ks.customer_id,
         'kyc_pending_review',
         CASE WHEN ks.submitted_at < now() - interval '7 days' THEN 'high' ELSE 'medium' END,
         'KYC en attente — ' || COALESCE(d.full_name,'chauffeur'),
         'Soumise le ' || to_char(ks.submitted_at,'DD/MM/YYYY') || ', en attente de validation.',
         ks.driver_id, 'kyc_submissions', ks.id,
         'kyc_pending_review:' || ks.id::text
  FROM public.kyc_submissions ks
  LEFT JOIN public.drivers d ON d.id = ks.driver_id
  WHERE ks.status = 'pending'
    AND ks.submitted_at < now() - interval '48 hours'
  ON CONFLICT (dedupe_key) WHERE status <> 'resolved' DO NOTHING;

  -- NEW: KYC rejected (driver action required)
  INSERT INTO public.alerts (customer_id, alert_type, severity, title, message,
    driver_id, source_table, source_id, dedupe_key, metadata)
  SELECT ks.customer_id,
         'kyc_rejected',
         'high',
         'KYC refusée — ' || COALESCE(d.full_name,'chauffeur'),
         COALESCE(ks.rejection_reason, 'Documents à représenter.'),
         ks.driver_id, 'kyc_submissions', ks.id,
         'kyc_rejected:' || ks.id::text,
         jsonb_build_object('reason', ks.rejection_reason)
  FROM public.kyc_submissions ks
  LEFT JOIN public.drivers d ON d.id = ks.driver_id
  WHERE ks.status = 'rejected'
  ON CONFLICT (dedupe_key) WHERE status <> 'resolved' DO NOTHING;

  -- Auto-resolve obsolete alerts
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
      WHERE tv.id = a.source_id AND tv.status = 'pending_payment'
    );

  UPDATE public.alerts a SET status = 'resolved', resolved_at = now()
  WHERE status = 'open'
    AND alert_type = 'invoice_overdue'
    AND NOT EXISTS (
      SELECT 1 FROM public.invoice i
      WHERE i.id = a.source_id AND i.status = 'issued' AND COALESCE(i.remaining_due, i.total_ttc) > 0
    );

  UPDATE public.alerts a SET status = 'resolved', resolved_at = now()
  WHERE status = 'open'
    AND alert_type IN ('kyc_pending_review','kyc_rejected')
    AND NOT EXISTS (
      SELECT 1 FROM public.kyc_submissions ks
      WHERE ks.id = a.source_id
        AND (
          (a.alert_type = 'kyc_pending_review' AND ks.status = 'pending')
          OR (a.alert_type = 'kyc_rejected' AND ks.status = 'rejected')
        )
    );

  RETURN (SELECT COUNT(*) FROM public.alerts WHERE created_at > now() - interval '1 minute');
END;
$function$;