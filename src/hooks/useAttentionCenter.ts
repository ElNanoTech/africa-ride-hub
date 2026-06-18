import { useQuery } from '@tanstack/react-query';
import { isBefore, isSameDay, parseISO, startOfDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/routeClient';
import { formatCurrency } from '@/lib/format';

export type AttentionPriority = 'critical' | 'high' | 'medium' | 'info';
export type AttentionCategory = 'finance' | 'fleet_control' | 'drivers' | 'vehicles' | 'risk' | 'growth';
export type AttentionFilter =
  | 'all'
  | 'today_cash'
  | 'overdue'
  | 'fleet_control'
  | 'vehicles'
  | 'drivers_risk'
  | 'pending_requests';
export type AttentionPermission = 'all' | 'finance' | 'fleet' | 'drivers' | 'risk' | 'growth' | 'support';

export interface AttentionAction {
  id: string;
  priority: AttentionPriority;
  category: AttentionCategory;
  filterTags: AttentionFilter[];
  issueType: string;
  subject: string;
  impact: string;
  age: string;
  recommendedAction: string;
  ctaLabel: string;
  href: string;
  entityType: string;
  entityId: string;
  permission: AttentionPermission;
  createdAt: string | null;
  sortValue: number;
}

export interface AttentionKpi {
  key: AttentionFilter;
  label: string;
  value: string | number;
  hint: string;
  filter: AttentionFilter;
  tone: 'green' | 'blue' | 'purple' | 'yellow' | 'orange' | 'slate';
}

export interface AttentionCategorySummary {
  key: AttentionCategory;
  label: string;
  count: number;
  href: string;
  description: string;
}

export interface AttentionCenterData {
  actions: AttentionAction[];
  kpis: AttentionKpi[];
  categories: AttentionCategorySummary[];
  generatedAt: string;
  warnings: string[];
}

type DriverRef = { id: string; full_name: string | null };
type VehicleRef = { id: string; license_plate: string | null; model_name: string | null; make?: string | null };

type PaymentRow = {
  id: string;
  amount: number;
  amount_paid: number | null;
  due_date: string;
  status: string;
  payment_type: string;
  driver_id: string;
  rental_id: string | null;
  loan_id: string | null;
  drivers: DriverRef | null;
  rentals: { vehicles: VehicleRef | null } | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  invoice_kind: string;
  status: string;
  total_ttc: number;
  amount_paid: number;
  remaining_due: number | null;
  issued_at: string | null;
  period_start: string | null;
  period_end: string | null;
  driver_id: string;
  driver_snapshot_name: string | null;
  rental_id: string | null;
  created_at: string;
};

type InspectionRow = {
  id: string;
  status: string;
  due_at: string;
  submitted_at: string | null;
  rejection_reason: string | null;
  immobilization_state: string | null;
  vehicle_id: string;
  driver_id: string | null;
  vehicles: VehicleRef | null;
  drivers: DriverRef | null;
};

type KycRow = {
  id: string;
  status: string;
  submitted_at: string;
  rejection_reason: string | null;
  driver_id: string;
  drivers: DriverRef | null;
};

type DriverRow = {
  id: string;
  full_name: string | null;
  driver_status: string;
  kyc_status: string;
  active_vehicle_id: string | null;
  permit_expiry_date: string | null;
};

type VehicleRow = {
  id: string;
  license_plate: string;
  model_name: string;
  make: string | null;
  status: string;
  gps_active: boolean | null;
};

type AccidentRow = {
  id: string;
  status: string;
  severity: string;
  created_at: string;
  case_number: string | null;
  driver_id: string;
  vehicle_id: string | null;
  drivers: DriverRef | null;
  vehicles: VehicleRef | null;
};

type ViolationRow = {
  id: string;
  status: string;
  amount: number;
  violation_date: string;
  violation_type: string;
  license_plate: string;
  driver_id: string | null;
};

type MaintenanceOrderRow = {
  id: string;
  status: string;
  priority: string;
  estimated_cost: number;
  created_at: string;
  order_number: string | null;
  vehicle_id: string;
  vehicles: VehicleRef | null;
};

type LoanRow = {
  id: string;
  status: string;
  amount_requested: number;
  applied_at: string;
  driver_id: string;
  drivers: DriverRef | null;
};

type RentalRow = {
  id: string;
  status: string;
  driver_id: string;
  vehicle_id: string | null;
  payment_due_at: string | null;
  start_date: string;
  total_amount: number | null;
  drivers: DriverRef | null;
  vehicles: VehicleRef | null;
};

type RiskSummaryRow = {
  driver_id: string;
  level: string | null;
  overdue_payments: number | null;
  reasons: string[] | null;
};

type CollectionsCaseRow = {
  case_id: string;
  driver_id: string;
  driver_name: string | null;
  product_name: string | null;
  current_status: string;
  current_status_label: string | null;
  delinquency_status: string;
  delinquency_status_label: string | null;
  severity: string;
  total_past_due_amount: number;
  days_past_due: number;
  priority_score: number;
  invoice_number: string | null;
  due_date: string | null;
  active_promise_id: string | null;
  promised_payment_date: string | null;
  open_escalation_id: string | null;
  opened_at: string;
};

type DefaultReviewRow = {
  default_review_id: string;
  credit_account_id: string;
  collections_case_id: string | null;
  driver_id: string;
  driver_name: string | null;
  product_name: string | null;
  status: string;
  status_label: string | null;
  trigger_reason: string;
  past_due_amount: number;
  days_past_due: number;
  evidence_status: string;
  evidence_count: number;
  latest_decision: string | null;
  active_recovery_plan_id: string | null;
  open_asset_review_id: string | null;
  sent_notice_count: number;
  formal_default_notice_sent: boolean;
  decision_due_at: string | null;
  opened_at: string;
};

type QueryWarning = { label: string; message: string };
type QueryLike<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function safeRows<T>(label: string, query: QueryLike<T>): Promise<{ rows: T[]; warning: QueryWarning | null }> {
  try {
    const { data, error } = await query;
    if (error) return { rows: [], warning: { label, message: error.message } };
    return { rows: data ?? [], warning: null };
  } catch (error) {
    return {
      rows: [],
      warning: { label, message: error instanceof Error ? error.message : 'Données indisponibles' },
    };
  }
}

function safeRpcRows<T>(label: string, rpc: PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  return safeRows<T>(label, rpc);
}

function currency(n: number) {
  return formatCurrency(Math.max(0, Math.round(n || 0)));
}

function outstanding(amount: number, paid: number | null | undefined) {
  return Math.max(0, amount - (paid ?? 0));
}

function dateOrNull(value: string | null | undefined) {
  if (!value) return null;
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ageLabel(value: string | null | undefined) {
  const date = dateOrNull(value);
  if (!date) return 'Date non renseignée';
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return '1 jour';
  return `${days} jours`;
}

function isPastDate(value: string | null | undefined) {
  const date = dateOrNull(value);
  if (!date) return false;
  return isBefore(startOfDay(date), startOfDay(new Date()));
}

function isTodayDate(value: string | null | undefined) {
  const date = dateOrNull(value);
  return !!date && isSameDay(date, new Date());
}

function vehicleLabel(vehicle: VehicleRef | null | undefined) {
  if (!vehicle) return 'Véhicule non renseigné';
  return [vehicle.license_plate, vehicle.make, vehicle.model_name].filter(Boolean).join(' · ');
}

function driverLabel(driver: DriverRef | null | undefined, fallback = 'Chauffeur non renseigné') {
  return driver?.full_name || fallback;
}

const priorityWeight: Record<AttentionPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  info: 3,
};

function createdSort(value: string | null | undefined) {
  const date = dateOrNull(value);
  return date ? date.getTime() : Date.now();
}

function actionSort(priority: AttentionPriority, createdAt: string | null | undefined) {
  return priorityWeight[priority] * 10_000_000_000_000 + createdSort(createdAt);
}

function categoryLabel(category: AttentionCategory) {
  switch (category) {
    case 'finance': return 'Finance';
    case 'fleet_control': return 'Fleet Control';
    case 'drivers': return 'Chauffeurs';
    case 'vehicles': return 'Véhicules';
    case 'risk': return 'Risque';
    case 'growth': return 'Croissance';
  }
}

export function useAttentionCenter() {
  return useQuery({
    queryKey: ['admin-attention-center'],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<AttentionCenterData> => {
      const [
        paymentsResult,
        invoicesResult,
        inspectionsResult,
        kycResult,
        driversResult,
        vehiclesResult,
        accidentsResult,
        violationsResult,
        maintenanceResult,
        loansResult,
        rentalsResult,
        riskResult,
        collectionsResult,
        defaultsResult,
      ] = await Promise.all([
        safeRows<PaymentRow>('Paiements', supabase
          .from('payments')
          .select('id, amount, amount_paid, due_date, status, payment_type, driver_id, rental_id, loan_id, drivers(id, full_name), rentals(vehicles(id, license_plate, model_name, make))')
          .in('status', ['pending', 'overdue'])
          .order('due_date', { ascending: true })
          .limit(120) as unknown as QueryLike<PaymentRow>),
        safeRows<InvoiceRow>('Facturation', supabase
          .from('invoice')
          .select('id, invoice_number, invoice_kind, status, total_ttc, amount_paid, remaining_due, issued_at, period_start, period_end, driver_id, driver_snapshot_name, rental_id, created_at')
          .in('status', ['issued', 'partial', 'overdue', 'unpaid'])
          .order('issued_at', { ascending: false, nullsFirst: false })
          .limit(120) as unknown as QueryLike<InvoiceRow>),
        safeRows<InspectionRow>('Fleet Control', supabase
          .from('vehicle_inspections')
          .select('id, status, due_at, submitted_at, rejection_reason, immobilization_state, vehicle_id, driver_id, vehicles(id, license_plate, model_name, make), drivers(id, full_name)')
          .order('due_at', { ascending: true })
          .limit(120) as unknown as QueryLike<InspectionRow>),
        safeRows<KycRow>('KYC', supabase
          .from('kyc_submissions')
          .select('id, status, submitted_at, rejection_reason, driver_id, drivers(id, full_name)')
          .in('status', ['pending', 'rejected'])
          .order('submitted_at', { ascending: false })
          .limit(80) as unknown as QueryLike<KycRow>),
        safeRows<DriverRow>('Chauffeurs', supabase
          .from('drivers')
          .select('id, full_name, driver_status, kyc_status, active_vehicle_id, permit_expiry_date')
          .limit(200) as unknown as QueryLike<DriverRow>),
        safeRows<VehicleRow>('Véhicules', supabase
          .from('vehicles')
          .select('id, license_plate, model_name, make, status, gps_active')
          .limit(200) as unknown as QueryLike<VehicleRow>),
        safeRows<AccidentRow>('Sinistres', supabase
          .from('accidents')
          .select('id, status, severity, created_at, case_number, driver_id, vehicle_id, drivers(id, full_name), vehicles(id, license_plate, model_name, make)')
          .order('created_at', { ascending: false })
          .limit(80) as unknown as QueryLike<AccidentRow>),
        safeRows<ViolationRow>('Contraventions', supabase
          .from('traffic_violations')
          .select('id, status, amount, violation_date, violation_type, license_plate, driver_id')
          .in('status', ['pending_payment', 'contested'])
          .order('violation_date', { ascending: false })
          .limit(80) as unknown as QueryLike<ViolationRow>),
        safeRows<MaintenanceOrderRow>('Maintenance', supabase
          .from('maintenance_orders')
          .select('id, status, priority, estimated_cost, created_at, order_number, vehicle_id, vehicles(id, license_plate, model_name, make)')
          .in('status', ['to_validate', 'in_progress'])
          .order('created_at', { ascending: false })
          .limit(80) as unknown as QueryLike<MaintenanceOrderRow>),
        safeRows<LoanRow>('Prêts', supabase
          .from('loans')
          .select('id, status, amount_requested, applied_at, driver_id, drivers(id, full_name)')
          .in('status', ['pending', 'approved'])
          .order('applied_at', { ascending: false })
          .limit(80) as unknown as QueryLike<LoanRow>),
        safeRows<RentalRow>('Locations', supabase
          .from('rentals')
          .select('id, status, driver_id, vehicle_id, payment_due_at, start_date, total_amount, drivers(id, full_name), vehicles(id, license_plate, model_name, make)')
          .in('status', ['active', 'approved', 'pending'])
          .order('payment_due_at', { ascending: true, nullsFirst: false })
          .limit(120) as unknown as QueryLike<RentalRow>),
        safeRpcRows<RiskSummaryRow>('Risque chauffeur', supabase.rpc('drivers_risk_summary') as unknown as QueryLike<RiskSummaryRow>),
        safeRows<CollectionsCaseRow>('Collections crédit', supabase
          .from('v_credit_collections_queue')
          .select('case_id, driver_id, driver_name, product_name, current_status, current_status_label, delinquency_status, delinquency_status_label, severity, total_past_due_amount, days_past_due, priority_score, invoice_number, due_date, active_promise_id, promised_payment_date, open_escalation_id, opened_at')
          .order('priority_score', { ascending: false })
          .limit(80) as unknown as QueryLike<CollectionsCaseRow>),
        safeRows<DefaultReviewRow>('Default Recovery', supabase
          .from('v_credit_default_review_queue')
          .select('default_review_id, credit_account_id, collections_case_id, driver_id, driver_name, product_name, status, status_label, trigger_reason, past_due_amount, days_past_due, evidence_status, evidence_count, latest_decision, active_recovery_plan_id, open_asset_review_id, sent_notice_count, formal_default_notice_sent, decision_due_at, opened_at')
          .order('decision_due_at', { ascending: true, nullsFirst: false })
          .limit(80) as unknown as QueryLike<DefaultReviewRow>),
      ]);

      const actions: AttentionAction[] = [];
      const warnings = [
        paymentsResult.warning,
        invoicesResult.warning,
        inspectionsResult.warning,
        kycResult.warning,
        driversResult.warning,
        vehiclesResult.warning,
        accidentsResult.warning,
        violationsResult.warning,
        maintenanceResult.warning,
        loansResult.warning,
        rentalsResult.warning,
        riskResult.warning,
        collectionsResult.warning,
        defaultsResult.warning,
      ]
        .filter((w): w is QueryWarning => !!w)
        .map((w) => `${w.label}: ${w.message}`);

      for (const payment of paymentsResult.rows) {
        const dueToday = isTodayDate(payment.due_date);
        const overdue = payment.status === 'overdue' || isPastDate(payment.due_date);
        const remaining = outstanding(payment.amount, payment.amount_paid);
        if (!dueToday && !overdue) continue;
        const priority: AttentionPriority = overdue ? 'critical' : 'high';
        actions.push({
          id: `payment-${payment.id}`,
          priority,
          category: 'finance',
          filterTags: ['today_cash', ...(overdue ? ['overdue' as AttentionFilter] : [])],
          issueType: overdue ? 'Paiement en retard' : "À encaisser aujourd'hui",
          subject: driverLabel(payment.drivers),
          impact: `${currency(remaining)} · ${payment.payment_type || 'paiement'}`,
          age: overdue ? `${ageLabel(payment.due_date)} de retard` : 'Échéance aujourd’hui',
          recommendedAction: overdue ? 'Relancer le chauffeur depuis le module paiements' : 'Encaisser ou suivre le paiement',
          ctaLabel: 'Ouvrir paiement',
          href: `/admin/payments?payment=${payment.id}`,
          entityType: 'payment',
          entityId: payment.id,
          permission: 'finance',
          createdAt: payment.due_date,
          sortValue: actionSort(priority, payment.due_date),
        });
      }

      for (const invoice of invoicesResult.rows) {
        const remaining = invoice.remaining_due ?? outstanding(invoice.total_ttc, invoice.amount_paid);
        if (remaining <= 0) continue;
        const isPartial = invoice.status === 'partial';
        const priority: AttentionPriority = isPartial ? 'high' : 'medium';
        actions.push({
          id: `invoice-${invoice.id}`,
          priority,
          category: 'finance',
          filterTags: ['overdue'],
          issueType: isPartial ? 'Facture partielle' : 'Facture à régler',
          subject: invoice.driver_snapshot_name || invoice.invoice_number || 'Facture',
          impact: `${currency(remaining)} restant dû`,
          age: ageLabel(invoice.issued_at ?? invoice.created_at),
          recommendedAction: isPartial ? 'Encaisser le reste' : 'Ouvrir la facture',
          ctaLabel: 'Ouvrir facturation',
          href: `/admin/billing?invoice=${invoice.id}`,
          entityType: 'invoice',
          entityId: invoice.id,
          permission: 'finance',
          createdAt: invoice.issued_at ?? invoice.created_at,
          sortValue: actionSort(priority, invoice.issued_at ?? invoice.created_at),
        });
      }

      for (const inspection of inspectionsResult.rows) {
        const overdue = isPastDate(inspection.due_at);
        const submitted = inspection.status === 'submitted';
        const rejected = inspection.status === 'rejected';
        const blocked = inspection.status === 'blocked' || inspection.immobilization_state === 'requested';
        if (!submitted && !overdue && !rejected && !blocked) continue;
        const priority: AttentionPriority = blocked ? 'critical' : overdue ? 'high' : submitted ? 'medium' : 'info';
        actions.push({
          id: `inspection-${inspection.id}`,
          priority,
          category: 'fleet_control',
          filterTags: ['fleet_control', ...(overdue || blocked ? ['overdue' as AttentionFilter] : [])],
          issueType: submitted ? 'Contrôle à valider' : blocked ? 'Véhicule bloqué' : overdue ? 'Contrôle en retard' : 'Contrôle rejeté',
          subject: vehicleLabel(inspection.vehicles),
          impact: submitted ? 'Photos soumises' : inspection.rejection_reason || driverLabel(inspection.drivers),
          age: ageLabel(inspection.submitted_at ?? inspection.due_at),
          recommendedAction: submitted ? 'Examiner le contrôle' : 'Ouvrir Fleet Control',
          ctaLabel: 'Examiner',
          href: `/admin/fleet-control?control=${inspection.id}`,
          entityType: 'fleet_control',
          entityId: inspection.id,
          permission: 'fleet',
          createdAt: inspection.submitted_at ?? inspection.due_at,
          sortValue: actionSort(priority, inspection.submitted_at ?? inspection.due_at),
        });
      }

      for (const kyc of kycResult.rows) {
        const priority: AttentionPriority = kyc.status === 'pending' ? 'high' : 'medium';
        actions.push({
          id: `kyc-${kyc.id}`,
          priority,
          category: 'drivers',
          filterTags: ['pending_requests'],
          issueType: kyc.status === 'pending' ? 'KYC à examiner' : 'KYC rejeté',
          subject: driverLabel(kyc.drivers),
          impact: kyc.rejection_reason || 'Documents chauffeur',
          age: ageLabel(kyc.submitted_at),
          recommendedAction: kyc.status === 'pending' ? 'Examiner les documents' : 'Suivre la correction chauffeur',
          ctaLabel: 'Ouvrir dossier',
          href: `/admin/drivers/${kyc.driver_id}?tab=documents`,
          entityType: 'kyc_submission',
          entityId: kyc.id,
          permission: 'drivers',
          createdAt: kyc.submitted_at,
          sortValue: actionSort(priority, kyc.submitted_at),
        });
      }

      for (const driver of driversResult.rows) {
        const permitExpired = isPastDate(driver.permit_expiry_date);
        const suspended = ['suspended', 'blocked', 'inactive'].includes(driver.driver_status);
        const noVehicle = !driver.active_vehicle_id && ['active', 'verified'].includes(driver.driver_status);
        if (!permitExpired && !suspended && !noVehicle) continue;
        const priority: AttentionPriority = permitExpired || suspended ? 'high' : 'medium';
        actions.push({
          id: `driver-${driver.id}-${permitExpired ? 'permit' : suspended ? 'status' : 'vehicle'}`,
          priority,
          category: 'drivers',
          filterTags: ['drivers_risk', ...(noVehicle ? ['pending_requests' as AttentionFilter] : [])],
          issueType: permitExpired ? 'Permis expiré' : suspended ? 'Chauffeur suspendu' : 'Chauffeur sans véhicule',
          subject: driver.full_name || 'Chauffeur',
          impact: permitExpired ? `Échéance ${driver.permit_expiry_date}` : driver.driver_status,
          age: permitExpired ? ageLabel(driver.permit_expiry_date) : 'Action requise',
          recommendedAction: 'Ouvrir le profil chauffeur',
          ctaLabel: 'Voir chauffeur',
          href: `/admin/drivers/${driver.id}`,
          entityType: 'driver',
          entityId: driver.id,
          permission: 'drivers',
          createdAt: driver.permit_expiry_date,
          sortValue: actionSort(priority, driver.permit_expiry_date),
        });
      }

      for (const vehicle of vehiclesResult.rows) {
        const unavailable = ['maintenance', 'unavailable', 'blocked', 'inactive'].includes(vehicle.status);
        const gpsOffline = vehicle.gps_active === false;
        if (!unavailable && !gpsOffline) continue;
        const priority: AttentionPriority = unavailable ? 'high' : 'medium';
        actions.push({
          id: `vehicle-${vehicle.id}-${unavailable ? 'status' : 'gps'}`,
          priority,
          category: 'vehicles',
          filterTags: ['vehicles'],
          issueType: unavailable ? 'Véhicule indisponible' : 'GPS en attente',
          subject: `${vehicle.license_plate} · ${vehicle.model_name}`,
          impact: unavailable ? vehicle.status : 'Données GPS non actualisées',
          age: 'À vérifier',
          recommendedAction: unavailable ? 'Voir le véhicule ou la maintenance' : 'Vérifier mapping GPS',
          ctaLabel: unavailable ? 'Voir véhicule' : 'Voir GPS',
          href: unavailable ? `/admin/vehicles?vehicle=${vehicle.id}` : `/admin/vehicles/gps-mapping?vehicle=${vehicle.id}`,
          entityType: 'vehicle',
          entityId: vehicle.id,
          permission: 'fleet',
          createdAt: null,
          sortValue: actionSort(priority, null),
        });
      }

      for (const accident of accidentsResult.rows) {
        if (['closed', 'resolved', 'cancelled'].includes(accident.status)) continue;
        const priority: AttentionPriority = accident.severity === 'critical' || accident.severity === 'high' ? 'critical' : 'high';
        actions.push({
          id: `accident-${accident.id}`,
          priority,
          category: 'risk',
          filterTags: ['drivers_risk'],
          issueType: 'Sinistre ouvert',
          subject: accident.case_number || vehicleLabel(accident.vehicles),
          impact: driverLabel(accident.drivers),
          age: ageLabel(accident.created_at),
          recommendedAction: 'Ouvrir le dossier sinistre',
          ctaLabel: 'Ouvrir dossier',
          href: `/admin/sinistres/${accident.id}`,
          entityType: 'accident',
          entityId: accident.id,
          permission: 'risk',
          createdAt: accident.created_at,
          sortValue: actionSort(priority, accident.created_at),
        });
      }

      for (const violation of violationsResult.rows) {
        const priority: AttentionPriority = violation.status === 'pending_payment' ? 'medium' : 'info';
        actions.push({
          id: `violation-${violation.id}`,
          priority,
          category: 'risk',
          filterTags: ['drivers_risk'],
          issueType: 'Contravention impayée',
          subject: violation.license_plate,
          impact: `${currency(violation.amount)} · ${violation.violation_type}`,
          age: ageLabel(violation.violation_date),
          recommendedAction: 'Attribuer ou relancer',
          ctaLabel: 'Ouvrir',
          href: `/admin/contraventions?violation=${violation.id}`,
          entityType: 'traffic_violation',
          entityId: violation.id,
          permission: 'risk',
          createdAt: violation.violation_date,
          sortValue: actionSort(priority, violation.violation_date),
        });
      }

      for (const order of maintenanceResult.rows) {
        const priority: AttentionPriority = order.status === 'to_validate' ? 'medium' : 'high';
        actions.push({
          id: `maintenance-${order.id}`,
          priority,
          category: 'vehicles',
          filterTags: ['vehicles'],
          issueType: order.status === 'to_validate' ? 'Maintenance à valider' : 'Véhicule en réparation',
          subject: vehicleLabel(order.vehicles),
          impact: order.estimated_cost ? currency(order.estimated_cost) : order.priority,
          age: ageLabel(order.created_at),
          recommendedAction: 'Voir réparation',
          ctaLabel: 'Ouvrir maintenance',
          href: `/admin/maintenance?order=${order.id}`,
          entityType: 'maintenance_order',
          entityId: order.id,
          permission: 'fleet',
          createdAt: order.created_at,
          sortValue: actionSort(priority, order.created_at),
        });
      }

      for (const loan of loansResult.rows) {
        const pending = loan.status === 'pending';
        const priority: AttentionPriority = pending ? 'medium' : 'info';
        actions.push({
          id: `loan-${loan.id}`,
          priority,
          category: 'growth',
          filterTags: ['pending_requests'],
          issueType: pending ? 'Demande de prêt à examiner' : 'Prêt approuvé à suivre',
          subject: driverLabel(loan.drivers),
          impact: `${currency(loan.amount_requested)} · ${loan.status}`,
          age: ageLabel(loan.applied_at),
          recommendedAction: pending ? 'Examiner la demande' : 'Suivre le paiement initial',
          ctaLabel: 'Ouvrir prêt',
          href: `/admin/loans?loan=${loan.id}`,
          entityType: 'loan',
          entityId: loan.id,
          permission: 'growth',
          createdAt: loan.applied_at,
          sortValue: actionSort(priority, loan.applied_at),
        });
      }

      for (const rental of rentalsResult.rows) {
        const dueToday = isTodayDate(rental.payment_due_at);
        const overdue = isPastDate(rental.payment_due_at);
        const pending = rental.status === 'pending';
        const missingVehicle = !rental.vehicle_id;
        if (!dueToday && !overdue && !pending && !missingVehicle) continue;
        const priority: AttentionPriority = overdue ? 'critical' : pending || dueToday ? 'high' : 'medium';
        actions.push({
          id: `rental-${rental.id}`,
          priority,
          category: missingVehicle ? 'vehicles' : 'finance',
          filterTags: [
            ...(dueToday ? ['today_cash' as AttentionFilter] : []),
            ...(overdue ? ['overdue' as AttentionFilter] : []),
            ...(pending || missingVehicle ? ['pending_requests' as AttentionFilter] : []),
          ],
          issueType: overdue ? 'Location en retard' : dueToday ? 'Location due aujourd’hui' : missingVehicle ? 'Location sans véhicule' : 'Location à approuver',
          subject: driverLabel(rental.drivers),
          impact: rental.total_amount ? currency(rental.total_amount) : vehicleLabel(rental.vehicles),
          age: rental.payment_due_at ? ageLabel(rental.payment_due_at) : ageLabel(rental.start_date),
          recommendedAction: missingVehicle ? 'Assigner ou vérifier le véhicule' : 'Ouvrir la location',
          ctaLabel: 'Ouvrir location',
          href: `/admin/rentals?rental=${rental.id}`,
          entityType: 'rental',
          entityId: rental.id,
          permission: missingVehicle ? 'fleet' : 'finance',
          createdAt: rental.payment_due_at ?? rental.start_date,
          sortValue: actionSort(priority, rental.payment_due_at ?? rental.start_date),
        });
      }

      for (const risk of riskResult.rows) {
        const riskLevel = risk.level?.toLowerCase() ?? '';
        if (!['eleve', 'élevé', 'critique', 'high', 'critical'].includes(riskLevel)) continue;
        const driver = driversResult.rows.find((d) => d.id === risk.driver_id);
        const priority: AttentionPriority = riskLevel.includes('crit') ? 'critical' : 'high';
        const reasons = risk.reasons ?? [];
        actions.push({
          id: `risk-${risk.driver_id}`,
          priority,
          category: 'risk',
          filterTags: ['drivers_risk'],
          issueType: 'Chauffeur à risque',
          subject: driver?.full_name || risk.driver_id,
          impact: reasons.slice(0, 2).join(' · ') || `${risk.overdue_payments ?? 0} retard(s)`,
          age: 'Risque actuel',
          recommendedAction: 'Ouvrir le profil chauffeur',
          ctaLabel: 'Voir chauffeur',
          href: `/admin/drivers/${risk.driver_id}`,
          entityType: 'driver',
          entityId: risk.driver_id,
          permission: 'risk',
          createdAt: null,
          sortValue: actionSort(priority, null),
        });
      }

      for (const collectionsCase of collectionsResult.rows) {
        const priority: AttentionPriority = collectionsCase.severity === 'CRITICAL'
          ? 'critical'
          : collectionsCase.severity === 'HIGH'
            ? 'high'
            : collectionsCase.active_promise_id
              ? 'medium'
              : 'high';
        const statusLabel = collectionsCase.delinquency_status_label || collectionsCase.current_status_label || 'Suivi crédit';
        actions.push({
          id: `collections-${collectionsCase.case_id}`,
          priority,
          category: 'growth',
          filterTags: ['overdue', 'drivers_risk'],
          issueType: collectionsCase.active_promise_id ? 'Promesse de paiement à suivre' : 'Dossier crédit en retard',
          subject: collectionsCase.driver_name || collectionsCase.driver_id,
          impact: `${currency(collectionsCase.total_past_due_amount)} · ${statusLabel}`,
          age: collectionsCase.days_past_due > 0 ? `${collectionsCase.days_past_due} jour(s) de retard` : ageLabel(collectionsCase.opened_at),
          recommendedAction: collectionsCase.open_escalation_id ? 'Traiter le suivi prioritaire' : 'Ouvrir la file collections',
          ctaLabel: 'Ouvrir collections',
          href: `/admin/credit-collections?driver=${collectionsCase.driver_id}`,
          entityType: 'credit_collections_case',
          entityId: collectionsCase.case_id,
          permission: 'growth',
          createdAt: collectionsCase.due_date ?? collectionsCase.opened_at,
          sortValue: actionSort(priority, collectionsCase.due_date ?? collectionsCase.opened_at),
        });
      }

      for (const review of defaultsResult.rows) {
        const decisionDue = isPastDate(review.decision_due_at);
        const noticeMissing = review.latest_decision === 'FORMAL_DEFAULT' && !review.formal_default_notice_sent;
        const evidenceMissing = review.evidence_count === 0 || review.evidence_status === 'MISSING';
        const assetReviewOpen = !!review.open_asset_review_id || review.status === 'ASSET_PROTECTION_REVIEW';
        const formalPending = ['FORMAL_DEFAULT_PENDING_APPROVAL', 'FORMALLY_DEFAULTED'].includes(review.status);
        const priority: AttentionPriority = noticeMissing || (formalPending && evidenceMissing)
          ? 'critical'
          : decisionDue || assetReviewOpen
            ? 'high'
            : evidenceMissing
              ? 'medium'
              : 'info';
        const issueType = noticeMissing
          ? 'Avis conducteur à envoyer'
          : formalPending && evidenceMissing
            ? 'Pièces manquantes avant décision'
            : decisionDue
              ? 'Décision DAM en retard'
              : assetReviewOpen
                ? 'Revue actif à suivre'
                : review.active_recovery_plan_id
                  ? 'Plan de régularisation à suivre'
                  : 'Dossier DAM à examiner';
        actions.push({
          id: `default-${review.default_review_id}`,
          priority,
          category: assetReviewOpen || formalPending ? 'risk' : 'growth',
          filterTags: ['overdue', 'drivers_risk', 'pending_requests'],
          issueType,
          subject: review.driver_name || review.driver_id,
          impact: `${currency(review.past_due_amount)} · ${review.status_label || 'Suivi DAM'}`,
          age: review.days_past_due > 0 ? `${review.days_past_due} jour(s) de retard` : ageLabel(review.opened_at),
          recommendedAction: noticeMissing
            ? 'Envoyer la notice depuis Default Recovery'
            : assetReviewOpen
              ? 'Vérifier la revue actif sans action automatique'
              : 'Ouvrir le dossier DAM',
          ctaLabel: 'Ouvrir dossier',
          href: `/admin/default-recovery?review=${review.default_review_id}`,
          entityType: 'credit_default_review',
          entityId: review.default_review_id,
          permission: assetReviewOpen || formalPending ? 'risk' : 'growth',
          createdAt: review.decision_due_at ?? review.opened_at,
          sortValue: actionSort(priority, review.decision_due_at ?? review.opened_at),
        });
      }

      const uniqueActions = Array.from(new Map(actions.map((a) => [a.id, a])).values())
        .sort((a, b) => a.sortValue - b.sortValue)
        .slice(0, 80);

      const todayCash = paymentsResult.rows
        .filter((p) => isTodayDate(p.due_date) && ['pending', 'overdue'].includes(p.status))
        .reduce((sum, p) => sum + outstanding(p.amount, p.amount_paid), 0);
      const overdueAmount = paymentsResult.rows
        .filter((p) => p.status === 'overdue' || isPastDate(p.due_date))
        .reduce((sum, p) => sum + outstanding(p.amount, p.amount_paid), 0)
        + collectionsResult.rows.reduce((sum, row) => sum + row.total_past_due_amount, 0);
      const controlsToReview = inspectionsResult.rows.filter((i) => i.status === 'submitted').length;
      const unavailableVehicles = new Set([
        ...vehiclesResult.rows.filter((v) => ['maintenance', 'unavailable', 'blocked', 'inactive'].includes(v.status)).map((v) => v.id),
        ...maintenanceResult.rows.filter((o) => o.status === 'in_progress').map((o) => o.vehicle_id),
      ]).size;
      const riskyDrivers = uniqueActions.filter((a) => a.filterTags.includes('drivers_risk')).length;
      const pendingRequests =
        kycResult.rows.filter((k) => k.status === 'pending').length +
        loansResult.rows.filter((l) => l.status === 'pending').length +
        rentalsResult.rows.filter((r) => r.status === 'pending').length +
        defaultsResult.rows.filter((r) => ['DEFAULT_REVIEW', 'EVIDENCE_GATHERING', 'RECOVERY_PLAN_PENDING'].includes(r.status)).length;
      const openCollections = collectionsResult.rows.length;
      const openDefaults = defaultsResult.rows.length;

      const kpis: AttentionKpi[] = [
        { key: 'today_cash', label: "À encaisser aujourd'hui", value: currency(todayCash), hint: 'Paiements dus aujourd’hui', filter: 'today_cash', tone: 'green' },
        { key: 'overdue', label: 'En retard', value: currency(overdueAmount), hint: 'Paiements/factures à récupérer', filter: 'overdue', tone: 'orange' },
        { key: 'fleet_control', label: 'Contrôles à valider', value: controlsToReview, hint: 'Soumis par les chauffeurs', filter: 'fleet_control', tone: 'blue' },
        { key: 'vehicles', label: 'Véhicules indisponibles', value: unavailableVehicles, hint: 'Maintenance, blocage ou GPS', filter: 'vehicles', tone: 'purple' },
        { key: 'drivers_risk', label: 'Chauffeurs à risque', value: riskyDrivers, hint: `${openCollections} collections · ${openDefaults} default`, filter: 'drivers_risk', tone: 'yellow' },
        { key: 'pending_requests', label: 'Demandes en attente', value: pendingRequests, hint: 'KYC, prêts, locations', filter: 'pending_requests', tone: 'slate' },
      ];

      const categories: AttentionCategorySummary[] = ([
        ['finance', '/admin/finance'],
        ['fleet_control', '/admin/fleet-control'],
        ['drivers', '/admin/drivers'],
        ['vehicles', '/admin/vehicles'],
        ['risk', '/admin/scoring'],
        ['growth', '/admin/credit-collections'],
      ] as Array<[AttentionCategory, string]>).map(([key, href]) => ({
        key,
        label: categoryLabel(key),
        count: uniqueActions.filter((a) => a.category === key).length,
        href,
        description: key === 'finance'
          ? 'Encaissement, impayés, factures'
          : key === 'fleet_control'
            ? 'Contrôles soumis, retards, blocages'
            : key === 'drivers'
              ? 'KYC, permis, statut chauffeur'
              : key === 'vehicles'
                ? 'Disponibilité, maintenance, GPS'
                : key === 'risk'
                  ? 'Sinistres, contraventions, score'
                  : 'Prêts et parcours propriétaire',
      }));

      return {
        actions: uniqueActions,
        kpis,
        categories,
        generatedAt: new Date().toISOString(),
        warnings,
      };
    },
  });
}
