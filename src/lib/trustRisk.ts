export type TrustRiskLevel = 'Low' | 'Moderate' | 'High' | 'Critical';
export type TrustHealthState = 'Healthy' | 'Warning' | 'Critical';
export type TrustScoreBand = 'Excellent' | 'Good' | 'Average' | 'At Risk' | 'Critical';
export type TrustEventSource = 'score' | 'payment' | 'kyc' | 'fleet_control' | 'contravention' | 'sinistre' | 'vehicle' | 'system';

export type DriverTrustLike = {
  id: string;
  full_name?: string | null;
  phone_number?: string | null;
  driver_status?: string | null;
  kyc_status?: string | null;
  permit_expiry_date?: string | null;
  active_vehicle_id?: string | null;
  created_at?: string | null;
};

export type VehicleTrustLike = {
  id: string;
  make?: string | null;
  model_name?: string | null;
  license_plate?: string | null;
  status?: string | null;
};

export type CreditScoreTrustLike = {
  driver_id: string;
  score?: number | null;
  tier?: string | null;
  calculation_week?: string | null;
  created_at?: string | null;
  driving_impact?: number | null;
  payment_impact?: number | null;
  income_impact?: number | null;
  driving_data_available?: boolean | null;
  payment_data_available?: boolean | null;
  income_data_available?: boolean | null;
};

export type DriverScoreEventTrustLike = {
  id: string;
  driver_id: string;
  delta: number;
  reason: string;
  accident_id?: string | null;
  created_at: string;
};

export type PaymentTrustLike = {
  id?: string;
  driver_id?: string | null;
  rental_id?: string | null;
  status?: string | null;
  amount?: number | null;
  amount_paid?: number | null;
  due_date?: string | null;
  paid_date?: string | null;
  paid_at?: string | null;
  payment_type?: string | null;
  created_at?: string | null;
};

export type FleetControlTrustLike = {
  id?: string;
  driver_id?: string | null;
  vehicle_id?: string | null;
  status?: string | null;
  due_at?: string | null;
  validated_at?: string | null;
  last_validated_at?: string | null;
  immobilization_state?: string | null;
  immobilized_at?: string | null;
  created_at?: string | null;
};

export type ViolationTrustLike = {
  id?: string;
  driver_id?: string | null;
  vehicle_id?: string | null;
  license_plate?: string | null;
  violation_type?: string | null;
  violation_date?: string | null;
  amount?: number | null;
  status?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
};

export type AccidentTrustLike = {
  id?: string;
  driver_id?: string | null;
  vehicle_id?: string | null;
  case_number?: string | null;
  status?: string | null;
  severity?: string | null;
  accident_datetime?: string | null;
  closed_at?: string | null;
  created_at?: string | null;
};

export type VehicleOperationRiskLike = {
  vehicle: VehicleTrustLike;
  label: string;
  health?: { state: TrustHealthState; score?: number; reasons?: string[] } | null;
  currentDriverName?: string | null;
  currentRental?: { driver_id?: string | null } | null;
  openMaintenance?: Array<{ status?: string | null }>;
  controls?: FleetControlTrustLike[];
  violations?: ViolationTrustLike[];
  accidents?: AccidentTrustLike[];
  gpsPosition?: { status?: string | null; last_update?: string | null; synced_at?: string | null } | null;
};

export type DriverRiskProfile = {
  driverId: string;
  driverName: string;
  phone: string | null;
  score: number | null;
  previousScore: number | null;
  scoreBand: TrustScoreBand;
  risk: TrustRiskLevel;
  trend: number;
  reasons: string[];
  recommendedActions: string[];
  recentEvents: TrustEvent[];
};

export type VehicleRiskProfile = {
  vehicleId: string;
  vehicleLabel: string;
  assignedDriver: string | null;
  risk: TrustRiskLevel;
  openIssues: number;
  sources: string[];
  recommendedAction: string;
};

export type ScoreDimension = {
  key: 'conduite' | 'paiement' | 'revenu' | 'infractions' | 'sinistralite' | 'credit';
  label: string;
  weight: number;
  currentContribution: number;
  averageContribution: number;
};

export type ComplianceSummary = {
  kyc: TrustHealthState;
  fleetControl: TrustHealthState;
  documents: TrustHealthState;
  permits: TrustHealthState;
  insurance: TrustHealthState;
  healthyCount: number;
  warningCount: number;
  criticalCount: number;
};

export type TrustEvent = {
  id: string;
  event: string;
  driverId: string | null;
  driverName: string;
  entity: string;
  scoreImpact: number;
  timestamp: string;
  source: TrustEventSource;
  route: string;
};

export type TrustOverviewMetrics = {
  averageScore: number;
  driversAtRisk: number;
  criticalDrivers: number;
  complianceRate: number;
  openContraventions: number;
  openSinistres: number;
  kycIssues: number;
  fleetControlIssues: number;
};

export type ScoreSimulationInput = {
  score: number;
  paysOverdue?: boolean;
  accidentRemoved?: boolean;
  kycFixed?: boolean;
};

export type ScoreSimulationResult = {
  projectedScore: number;
  delta: number;
  applied: string[];
};

export const SCORE_BANDS: Record<TrustScoreBand, { min: number; max: number }> = {
  Excellent: { min: 900, max: 1000 },
  Good: { min: 800, max: 899 },
  Average: { min: 700, max: 799 },
  'At Risk': { min: 600, max: 699 },
  Critical: { min: 0, max: 599 },
};

const CLOSED_ACCIDENT_STATUSES = new Set(['draft', 'closed', 'resolved', 'cancelled', 'canceled', 'resolved_not_at_fault', 'resolved_at_fault']);
const CLOSED_CONTROL_STATUSES = new Set(['validated', 'approved', 'completed', 'ok', 'passed']);
const CLOSED_VIOLATION_STATUSES = new Set(['paid', 'liquidated', 'waived', 'cancelled', 'canceled']);
const CLOSED_PAYMENT_STATUSES = new Set(['paid', 'overpaid', 'waived', 'cancelled', 'canceled']);

function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function dateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function dateMs(value: string): number {
  return new Date(`${value}T00:00:00Z`).getTime();
}

export function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.floor((dateMs(to) - dateMs(from)) / 86_400_000));
}

export function scoreBand(score: number | null | undefined): TrustScoreBand {
  const value = Number(score ?? 0);
  if (value >= SCORE_BANDS.Excellent.min) return 'Excellent';
  if (value >= SCORE_BANDS.Good.min) return 'Good';
  if (value >= SCORE_BANDS.Average.min) return 'Average';
  if (value >= SCORE_BANDS['At Risk'].min) return 'At Risk';
  return 'Critical';
}

export function riskFromScoreAndSignals(input: {
  score: number | null;
  latePayments: number;
  openViolations: number;
  openAccidents: number;
  kycIssue: boolean;
  fleetControlIssue: boolean;
  scoreDrop: number;
}): TrustRiskLevel {
  let points = 0;
  const score = input.score ?? 500;
  if (score < 600) points += 3;
  else if (score < 700) points += 2;
  else if (score < 800) points += 1;

  if (input.latePayments >= 3) points += 2;
  else if (input.latePayments > 0) points += 1;

  if (input.openViolations >= 2) points += 2;
  else if (input.openViolations > 0) points += 1;

  if (input.openAccidents >= 2) points += 2;
  else if (input.openAccidents > 0) points += 1;

  if (input.kycIssue) points += 1;
  if (input.fleetControlIssue) points += 1;
  if (input.scoreDrop > 50) points += 2;

  if (points >= 5) return 'Critical';
  if (points >= 3) return 'High';
  if (points >= 1) return 'Moderate';
  return 'Low';
}

export function isPaymentLate(payment: PaymentTrustLike, today: string): boolean {
  const status = normalize(payment.status);
  if (CLOSED_PAYMENT_STATUSES.has(status)) return false;
  const due = dateKey(payment.due_date);
  return !!due && due < today;
}

export function isOpenViolation(violation: ViolationTrustLike): boolean {
  return !CLOSED_VIOLATION_STATUSES.has(normalize(violation.status));
}

export function isOpenAccident(accident: AccidentTrustLike): boolean {
  return !CLOSED_ACCIDENT_STATUSES.has(normalize(accident.status));
}

export function isFleetControlIssue(control: FleetControlTrustLike, today: string): boolean {
  if (control.immobilized_at) return true;
  const immo = normalize(control.immobilization_state);
  if (immo && !['none', 'cancelled', 'canceled', 'released', 'clear'].includes(immo)) return true;
  if (CLOSED_CONTROL_STATUSES.has(normalize(control.status))) return false;
  const due = dateKey(control.due_at);
  return !!due && due < today;
}

export function isKycIssue(driver: DriverTrustLike): boolean {
  const status = normalize(driver.kyc_status);
  return !['verified', 'approved'].includes(status);
}

function driverName(driver: DriverTrustLike | null | undefined): string {
  return driver?.full_name || 'Driver';
}

function countBy<T>(rows: T[], predicate: (row: T) => boolean): number {
  return rows.reduce((sum, row) => sum + (predicate(row) ? 1 : 0), 0);
}

export function buildRiskReasons(input: {
  score: number | null;
  trend: number;
  latePayments: number;
  openViolations: number;
  openAccidents: number;
  kycIssue: boolean;
  fleetControlIssue: boolean;
}): string[] {
  const reasons: string[] = [];
  if (input.trend < -50) reasons.push(`Score dropped ${Math.abs(input.trend)} points`);
  if (input.score !== null && input.score < 600) reasons.push(`Critical score (${input.score})`);
  else if (input.score !== null && input.score < 700) reasons.push(`At-risk score (${input.score})`);
  if (input.latePayments > 0) reasons.push(input.latePayments === 1 ? '1 late payment' : `${input.latePayments} late payments`);
  if (input.openViolations > 0) reasons.push(input.openViolations === 1 ? '1 unresolved fine' : `${input.openViolations} unresolved fines`);
  if (input.openAccidents > 0) reasons.push(input.openAccidents === 1 ? 'Recent accident' : `${input.openAccidents} open accidents`);
  if (input.kycIssue) reasons.push('KYC expired or pending');
  if (input.fleetControlIssue) reasons.push('Fleet control overdue');
  return reasons.length > 0 ? reasons : ['No active risk signal'];
}

export function buildRecommendedActions(input: {
  latePayments: number;
  openViolations: number;
  openAccidents: number;
  kycIssue: boolean;
  fleetControlIssue: boolean;
  score: number | null;
  risk: TrustRiskLevel;
}): string[] {
  const actions: string[] = [];
  if (input.latePayments > 0) actions.push('Relancer paiement');
  if (input.score !== null && input.score < 650) actions.push('Suspendre financement');
  if (input.kycIssue) actions.push('Mettre à jour KYC');
  if (input.openAccidents > 0) actions.push('Examiner sinistre');
  if (input.fleetControlIssue) actions.push('Réassigner véhicule');
  if (input.openViolations > 0) actions.push('Assigner ou liquider contravention');
  if (actions.length === 0 && input.risk === 'Low') actions.push('Surveiller normalement');
  if (actions.length === 0) actions.push('Manual review required');
  return actions;
}

export function buildDriverRiskProfiles(input: {
  drivers: DriverTrustLike[];
  scores: CreditScoreTrustLike[];
  payments: PaymentTrustLike[];
  violations: ViolationTrustLike[];
  accidents: AccidentTrustLike[];
  controls: FleetControlTrustLike[];
  events: TrustEvent[];
  today: string;
}): DriverRiskProfile[] {
  const scoresByDriver = new Map<string, CreditScoreTrustLike[]>();
  input.scores.forEach((score) => {
    const list = scoresByDriver.get(score.driver_id) ?? [];
    list.push(score);
    scoresByDriver.set(score.driver_id, list);
  });

  return input.drivers.map((driver) => {
    const scoreRows = [...(scoresByDriver.get(driver.id) ?? [])].sort((a, b) =>
      (dateKey(b.calculation_week ?? b.created_at) ?? '').localeCompare(dateKey(a.calculation_week ?? a.created_at) ?? ''),
    );
    const currentScore = scoreRows[0]?.score ?? null;
    const previousScore = scoreRows[1]?.score ?? null;
    const trend = currentScore !== null && previousScore !== null ? currentScore - previousScore : 0;
    const latePayments = countBy(input.payments, (payment) => payment.driver_id === driver.id && isPaymentLate(payment, input.today));
    const openViolations = countBy(input.violations, (violation) => violation.driver_id === driver.id && isOpenViolation(violation));
    const openAccidents = countBy(input.accidents, (accident) => accident.driver_id === driver.id && isOpenAccident(accident));
    const fleetControlIssue = input.controls.some((control) => control.driver_id === driver.id && isFleetControlIssue(control, input.today));
    const kycIssue = isKycIssue(driver);
    const risk = riskFromScoreAndSignals({
      score: currentScore,
      latePayments,
      openViolations,
      openAccidents,
      kycIssue,
      fleetControlIssue,
      scoreDrop: trend < 0 ? Math.abs(trend) : 0,
    });
    const reasons = buildRiskReasons({
      score: currentScore,
      trend,
      latePayments,
      openViolations,
      openAccidents,
      kycIssue,
      fleetControlIssue,
    });
    const recommendedActions = buildRecommendedActions({
      latePayments,
      openViolations,
      openAccidents,
      kycIssue,
      fleetControlIssue,
      score: currentScore,
      risk,
    });
    return {
      driverId: driver.id,
      driverName: driverName(driver),
      phone: driver.phone_number ?? null,
      score: currentScore,
      previousScore,
      scoreBand: scoreBand(currentScore),
      risk,
      trend,
      reasons,
      recommendedActions,
      recentEvents: input.events.filter((event) => event.driverId === driver.id).slice(0, 6),
    };
  }).sort((a, b) => riskRank(b.risk) - riskRank(a.risk) || (a.score ?? 0) - (b.score ?? 0) || a.driverName.localeCompare(b.driverName));
}

function riskRank(level: TrustRiskLevel): number {
  switch (level) {
    case 'Critical': return 4;
    case 'High': return 3;
    case 'Moderate': return 2;
    case 'Low': return 1;
  }
}

export function buildVehicleRiskProfiles(rows: VehicleOperationRiskLike[]): VehicleRiskProfile[] {
  return rows.map((row) => {
    const sources: string[] = [];
    const repeatedAccidents = (row.accidents ?? []).filter(isOpenAccident).length;
    if (repeatedAccidents > 0) sources.push(repeatedAccidents > 1 ? 'Repeated accidents' : 'Recent accident');
    if ((row.openMaintenance ?? []).length > 1) sources.push('Repeated maintenance');
    if ((row.controls ?? []).some((control) => isFleetControlIssue(control, new Date().toISOString().slice(0, 10)))) sources.push('Overdue control');
    if (!row.gpsPosition || normalize(row.gpsPosition.status) === 'offline') sources.push('GPS offline');
    const openFines = (row.violations ?? []).filter(isOpenViolation).length;
    if (openFines > 1) sources.push('Multiple fines');
    else if (openFines === 1) sources.push('Open fine');
    if (row.health?.state === 'Critical') sources.push(...(row.health.reasons ?? ['Critical vehicle health']));

    const uniqueSources = [...new Set(sources)];
    const risk: TrustRiskLevel =
      row.health?.state === 'Critical' || uniqueSources.length >= 3 ? 'Critical'
      : uniqueSources.length >= 2 ? 'High'
      : uniqueSources.length === 1 ? 'Moderate'
      : 'Low';

    return {
      vehicleId: row.vehicle.id,
      vehicleLabel: row.label,
      assignedDriver: row.currentDriverName ?? null,
      risk,
      openIssues: uniqueSources.length,
      sources: uniqueSources.length > 0 ? uniqueSources : ['No active vehicle risk'],
      recommendedAction: risk === 'Low' ? 'Surveiller normalement' : uniqueSources.includes('Overdue control') ? 'Open Fleet Control' : uniqueSources.includes('GPS offline') ? 'Open Tracking' : 'Manual review required',
    };
  }).sort((a, b) => riskRank(b.risk) - riskRank(a.risk) || b.openIssues - a.openIssues || a.vehicleLabel.localeCompare(b.vehicleLabel));
}

export function buildScoreDistribution(profiles: DriverRiskProfile[]): Record<TrustScoreBand, number> {
  return profiles.reduce((acc, profile) => {
    acc[profile.scoreBand] += 1;
    return acc;
  }, { Excellent: 0, Good: 0, Average: 0, 'At Risk': 0, Critical: 0 } as Record<TrustScoreBand, number>);
}

export function buildScoreDimensions(scores: CreditScoreTrustLike[]): ScoreDimension[] {
  const latest = scores.slice(0, Math.max(1, Math.min(scores.length, 250)));
  const avg = (values: Array<number | null | undefined>) => {
    const usable = values.map((value) => Number(value ?? 0));
    if (usable.length === 0) return 0;
    return Math.round(usable.reduce((sum, value) => sum + value, 0) / usable.length);
  };
  const payment = avg(latest.map((score) => score.payment_impact));
  const driving = avg(latest.map((score) => score.driving_impact));
  const income = avg(latest.map((score) => score.income_impact));

  return [
    { key: 'conduite', label: 'Conduite', weight: 25, currentContribution: driving, averageContribution: driving },
    { key: 'paiement', label: 'Paiement', weight: 25, currentContribution: payment, averageContribution: payment },
    { key: 'revenu', label: 'Revenu', weight: 15, currentContribution: income, averageContribution: income },
    { key: 'infractions', label: 'Infractions', weight: 15, currentContribution: 0, averageContribution: 0 },
    { key: 'sinistralite', label: 'Sinistralité', weight: 15, currentContribution: 0, averageContribution: 0 },
    { key: 'credit', label: 'Crédit', weight: 5, currentContribution: avg(latest.map((score) => score.score)) - 500, averageContribution: avg(latest.map((score) => score.score)) - 500 },
  ];
}

export function buildComplianceSummary(input: {
  drivers: DriverTrustLike[];
  controls: FleetControlTrustLike[];
  today: string;
}): ComplianceSummary {
  const kycIssues = input.drivers.filter(isKycIssue).length;
  const permitIssues = input.drivers.filter((driver) => {
    const permit = dateKey(driver.permit_expiry_date);
    return !!permit && permit < input.today;
  }).length;
  const fleetIssues = input.controls.filter((control) => isFleetControlIssue(control, input.today)).length;
  const states: TrustHealthState[] = [
    kycIssues === 0 ? 'Healthy' : kycIssues <= 2 ? 'Warning' : 'Critical',
    fleetIssues === 0 ? 'Healthy' : fleetIssues <= 2 ? 'Warning' : 'Critical',
    permitIssues === 0 ? 'Healthy' : permitIssues <= 2 ? 'Warning' : 'Critical',
    permitIssues === 0 ? 'Healthy' : 'Warning',
    'Healthy',
  ];

  return {
    kyc: states[0],
    fleetControl: states[1],
    documents: states[2],
    permits: states[3],
    insurance: states[4],
    healthyCount: states.filter((state) => state === 'Healthy').length,
    warningCount: states.filter((state) => state === 'Warning').length,
    criticalCount: states.filter((state) => state === 'Critical').length,
  };
}

export function buildTrustOverview(input: {
  profiles: DriverRiskProfile[];
  drivers: DriverTrustLike[];
  violations: ViolationTrustLike[];
  accidents: AccidentTrustLike[];
  controls: FleetControlTrustLike[];
  today: string;
}): TrustOverviewMetrics {
  const scored = input.profiles.filter((profile) => profile.score !== null);
  const averageScore = scored.length
    ? Math.round(scored.reduce((sum, profile) => sum + Number(profile.score ?? 0), 0) / scored.length)
    : 0;
  const complianceSummary = buildComplianceSummary({ drivers: input.drivers, controls: input.controls, today: input.today });
  const complianceRate = input.drivers.length > 0
    ? Math.round(((input.drivers.length - input.drivers.filter(isKycIssue).length) / input.drivers.length) * 100)
    : 100;

  return {
    averageScore,
    driversAtRisk: input.profiles.filter((profile) => ['High', 'Critical'].includes(profile.risk)).length,
    criticalDrivers: input.profiles.filter((profile) => profile.risk === 'Critical').length,
    complianceRate: Math.min(100, Math.max(0, complianceRate - complianceSummary.criticalCount * 5)),
    openContraventions: input.violations.filter(isOpenViolation).length,
    openSinistres: input.accidents.filter(isOpenAccident).length,
    kycIssues: input.drivers.filter(isKycIssue).length,
    fleetControlIssues: input.controls.filter((control) => isFleetControlIssue(control, input.today)).length,
  };
}

function scoreEventReasonLabel(reason: string | null | undefined) {
  const eventType = reason?.split(':')[0];
  switch (eventType) {
    case 'CREDIT_PAYMENT_LATE':
      return 'Credit Payment Late';
    case 'PROMISE_TO_PAY_BROKEN':
      return 'Promise To Pay Not Met';
    case 'COLLECTIONS_ESCALATED':
      return 'Collections Escalated';
    case 'DEFAULT_REVIEW_OPENED':
      return 'Priority Credit Review Opened';
    case 'CREDIT_PAYMENT_RECOVERED':
      return 'Credit Payment Recovered';
    default:
      return reason || 'Score Change';
  }
}

export function buildTrustEvents(input: {
  drivers: DriverTrustLike[];
  scores: CreditScoreTrustLike[];
  scoreEvents?: DriverScoreEventTrustLike[];
  payments: PaymentTrustLike[];
  violations: ViolationTrustLike[];
  accidents: AccidentTrustLike[];
  controls: FleetControlTrustLike[];
  today: string;
}): TrustEvent[] {
  const driverById = new Map(input.drivers.map((driver) => [driver.id, driver]));
  const events: TrustEvent[] = [];

  input.scores.forEach((score) => {
    events.push({
      id: `score-${score.driver_id}-${score.calculation_week ?? score.created_at}`,
      event: 'Score Updated',
      driverId: score.driver_id,
      driverName: driverName(driverById.get(score.driver_id)),
      entity: `${score.score ?? 0}`,
      scoreImpact: 0,
      timestamp: score.created_at ?? score.calculation_week ?? input.today,
      source: 'score',
      route: `/admin/drivers/${score.driver_id}?tab=risk`,
    });
  });

  (input.scoreEvents ?? []).forEach((scoreEvent) => {
    events.push({
      id: `score-event-${scoreEvent.id}`,
      event: scoreEventReasonLabel(scoreEvent.reason),
      driverId: scoreEvent.driver_id,
      driverName: driverName(driverById.get(scoreEvent.driver_id)),
      entity: scoreEvent.accident_id ? `Accident ${scoreEvent.accident_id}` : 'Driver score',
      scoreImpact: scoreEvent.delta,
      timestamp: scoreEvent.created_at,
      source: 'score',
      route: scoreEvent.accident_id ? `/admin/sinistres/${scoreEvent.accident_id}` : `/admin/drivers/${scoreEvent.driver_id}?tab=risk`,
    });
  });

  input.payments.forEach((payment) => {
    const late = payment.status === 'overdue' || isPaymentLate(payment, input.today);
    if (!late && normalize(payment.status) !== 'paid') return;
    events.push({
      id: `payment-${payment.id ?? payment.driver_id}`,
      event: late ? 'Late Payment' : 'Good Week',
      driverId: payment.driver_id ?? null,
      driverName: driverName(driverById.get(payment.driver_id ?? '')),
      entity: `${Number(payment.amount ?? 0).toLocaleString('fr-FR')} FCFA`,
      scoreImpact: late ? -10 : 5,
      timestamp: payment.paid_at ?? payment.paid_date ?? payment.due_date ?? payment.created_at ?? input.today,
      source: 'payment',
      route: '/admin/financial-operations',
    });
  });

  input.violations.forEach((violation) => {
    events.push({
      id: `violation-${violation.id}`,
      event: isOpenViolation(violation) ? 'Contravention Added' : 'Contravention Cleared',
      driverId: violation.driver_id ?? null,
      driverName: driverName(driverById.get(violation.driver_id ?? '')),
      entity: violation.violation_type ?? violation.license_plate ?? 'Contravention',
      scoreImpact: isOpenViolation(violation) ? -8 : 4,
      timestamp: violation.violation_date ?? violation.created_at ?? input.today,
      source: 'contravention',
      route: '/admin/contraventions',
    });
  });

  input.accidents.forEach((accident) => {
    events.push({
      id: `accident-${accident.id}`,
      event: 'Accident Reported',
      driverId: accident.driver_id ?? null,
      driverName: driverName(driverById.get(accident.driver_id ?? '')),
      entity: accident.case_number ?? accident.severity ?? 'Sinistre',
      scoreImpact: isOpenAccident(accident) ? -30 : 0,
      timestamp: accident.accident_datetime ?? accident.created_at ?? input.today,
      source: 'sinistre',
      route: accident.id ? `/admin/sinistres/${accident.id}` : '/admin/sinistres',
    });
  });

  input.controls.forEach((control) => {
    const issue = isFleetControlIssue(control, input.today);
    events.push({
      id: `control-${control.id}`,
      event: issue ? 'Fleet Control Overdue' : 'Fleet Control Approved',
      driverId: control.driver_id ?? null,
      driverName: driverName(driverById.get(control.driver_id ?? '')),
      entity: control.vehicle_id ?? 'Fleet Control',
      scoreImpact: issue ? -8 : 4,
      timestamp: control.validated_at ?? control.last_validated_at ?? control.due_at ?? control.created_at ?? input.today,
      source: 'fleet_control',
      route: '/admin/fleet-control',
    });
  });

  input.drivers.forEach((driver) => {
    if (!driver.kyc_status) return;
    events.push({
      id: `kyc-${driver.id}-${driver.kyc_status}`,
      event: isKycIssue(driver) ? 'KYC Expired' : 'KYC Verified',
      driverId: driver.id,
      driverName: driverName(driver),
      entity: driver.kyc_status,
      scoreImpact: isKycIssue(driver) ? -5 : 5,
      timestamp: driver.created_at ?? input.today,
      source: 'kyc',
      route: `/admin/drivers/${driver.id}?tab=risk`,
    });
  });

  return events
    .filter((event) => !!dateKey(event.timestamp))
    .sort((a, b) => (dateKey(b.timestamp) ?? '').localeCompare(dateKey(a.timestamp) ?? ''));
}

export function simulateTrustScore(input: ScoreSimulationInput): ScoreSimulationResult {
  const applied: string[] = [];
  let delta = 0;
  if (input.paysOverdue) {
    delta += 20;
    applied.push('What if driver pays? +20');
  }
  if (input.accidentRemoved) {
    delta += 30;
    applied.push('What if accident removed? +30');
  }
  if (input.kycFixed) {
    delta += 10;
    applied.push('What if KYC fixed? +10');
  }
  const projectedScore = Math.max(0, Math.min(1000, Math.round(input.score + delta)));
  return { projectedScore, delta, applied: applied.length > 0 ? applied : ['No simulation changes selected'] };
}
