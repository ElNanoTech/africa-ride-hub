import {
  CREDIT_OFFERS,
  calculateOnTimeRate,
  calculateOwnershipProgress,
  getEligibilityGaps,
  type CreditOffer,
  type PaymentLike,
} from './creditJourney';
import { isPaymentOverdue } from './payments';
import { isFleetControlIssue, isKycIssue, isOpenAccident, isOpenViolation } from './trustRisk';
import type { DriverRiskLevel } from './driverRisk';

export type GrowthLifecycleStage =
  | 'Prospect'
  | 'Verified Driver'
  | 'Daily Rental Driver'
  | 'Trusted Driver'
  | 'Financing Eligible Driver'
  | 'Vehicle Owner'
  | 'Fleet Entrepreneur';

export type GrowthEligibilityState =
  | 'NOT_EVALUATED'
  | 'NOT_ELIGIBLE'
  | 'ALMOST_ELIGIBLE'
  | 'ELIGIBLE_FOR_REVIEW'
  | 'OFFER_READY'
  | 'OFFER_PUBLISHED'
  | 'APPLICATION_STARTED'
  | 'APPLICATION_SUBMITTED'
  | 'APPLICATION_APPROVED'
  | 'ACTIVATION_PENDING'
  | 'ACTIVE_OWNERSHIP_PATH'
  | 'SUSPENDED'
  | 'REJECTED'
  | 'COMPLETED';

export type DriverOfferState =
  | 'NOT_VISIBLE'
  | 'LOCKED_WITH_REASON'
  | 'AVAILABLE'
  | 'VIEWED'
  | 'STARTED'
  | 'SUBMITTED'
  | 'WITHDRAWN'
  | 'EXPIRED'
  | 'ACCEPTED_FOR_REVIEW'
  | 'MOVED_TO_CREDIT_ENGINE';

export type OfferStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'ARCHIVED';

export type GrowthBlockerSeverity = 'info' | 'warning' | 'critical';

export type GrowthDriverLike = {
  id: string;
  full_name?: string | null;
  phone_number?: string | null;
  driver_status?: string | null;
  kyc_status?: string | null;
  active_vehicle_id?: string | null;
  created_at?: string | null;
};

export type GrowthScoreLike = {
  driver_id: string;
  score?: number | null;
  tier?: string | null;
  calculation_week?: string | null;
  created_at?: string | null;
};

export type GrowthPaymentLike = PaymentLike & {
  id?: string;
  driver_id?: string | null;
  amount?: number | null;
  amount_paid?: number | null;
  paid_at?: string | null;
  payment_type?: string | null;
  created_at?: string | null;
};

export type GrowthWalletLike = {
  driver_id: string;
  balance?: number | null;
  updated_at?: string | null;
};

export type GrowthLoanLike = {
  id?: string;
  driver_id: string;
  loan_type?: string | null;
  status?: string | null;
  amount_requested?: number | null;
  amount_approved?: number | null;
  applied_at?: string | null;
  approved_at?: string | null;
  disbursed_at?: string | null;
  rejection_reason?: string | null;
};

export type GrowthContractLike = {
  id?: string;
  driver_id: string;
  vehicle_id?: string | null;
  status?: string | null;
  ownership_percentage?: number | null;
  total_paid?: number | null;
  total_price?: number | null;
  weekly_payment?: number | null;
  weeks_completed?: number | null;
  contract_duration_weeks?: number | null;
  start_date?: string | null;
  expected_end_date?: string | null;
  completed_at?: string | null;
};

export type GrowthRentalLike = {
  id?: string;
  driver_id?: string | null;
  vehicle_id?: string | null;
  status?: string | null;
  start_date?: string | null;
  created_at?: string | null;
};

export type GrowthViolationLike = {
  id?: string;
  driver_id?: string | null;
  status?: string | null;
};

export type GrowthAccidentLike = {
  id?: string;
  driver_id?: string | null;
  status?: string | null;
  severity?: string | null;
};

export type GrowthFleetControlLike = {
  id?: string;
  driver_id?: string | null;
  vehicle_id?: string | null;
  status?: string | null;
  due_at?: string | null;
  immobilization_state?: string | null;
  immobilized_at?: string | null;
};

export type GrowthVehicleLike = {
  id: string;
  status?: string | null;
  make?: string | null;
  model_name?: string | null;
  license_plate?: string | null;
};

export type GrowthRiskLike = {
  driver_id: string;
  level?: DriverRiskLevel | null;
  reasons?: string[] | null;
};

export type GrowthBlocker = {
  key: string;
  label: string;
  severity: GrowthBlockerSeverity;
  source: 'score' | 'payments' | 'wallet' | 'kyc' | 'risk' | 'fleet_control' | 'contraventions' | 'sinistres' | 'vehicle' | 'history';
};

export type GrowthOfferEvaluation = {
  offerType: CreditOffer['type'];
  offerName: string;
  offerStatus: OfferStatus;
  driverOfferState: DriverOfferState;
  criteriaMet: boolean;
  eligible: boolean;
  unavailableReason: string | null;
  gaps: ReturnType<typeof getEligibilityGaps>;
  terms: {
    amount: number;
    dailyPayment: number;
    termMonths: number;
    downPayment: number;
    currency: 'FCFA';
  };
  requiredDocuments: string[];
  adminApprovalRule: string;
  driverExplanation: string;
};

export type GrowthDriverProfile = {
  driverId: string;
  driverName: string;
  phone: string | null;
  lifecycleStage: GrowthLifecycleStage;
  nextStage: GrowthLifecycleStage | 'Credit Engine Review' | 'Final Ownership Transfer';
  eligibilityState: GrowthEligibilityState;
  score: number | null;
  tier: string | null;
  scoreProgress: number;
  weeksHistory: number;
  onTimeRate: number;
  walletBalance: number;
  activeRental: boolean;
  activeVehicleId: string | null;
  blockers: GrowthBlocker[];
  recommendations: string[];
  offers: GrowthOfferEvaluation[];
  currentApplication: GrowthLoanLike | null;
  ownershipContract: GrowthContractLike | null;
  riskLevel: DriverRiskLevel | null;
  riskReasons: string[];
  canPublishOffer: boolean;
  publishDisabledReason: string;
};

export type GrowthOverview = {
  totalDrivers: number;
  eligibleDrivers: number;
  closeToEligibility: number;
  blockedDrivers: number;
  ownershipPathDrivers: number;
  activeOffers: number;
  expiringOffers: number;
  riskExceptions: number;
  conversionFunnel: Record<GrowthLifecycleStage, number>;
};

export const GROWTH_STAGE_ORDER: GrowthLifecycleStage[] = [
  'Prospect',
  'Verified Driver',
  'Daily Rental Driver',
  'Trusted Driver',
  'Financing Eligible Driver',
  'Vehicle Owner',
  'Fleet Entrepreneur',
];

function normalize(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim();
}

function driverName(driver: GrowthDriverLike): string {
  return driver.full_name || 'Driver';
}

function latestScore(scores: GrowthScoreLike[]): GrowthScoreLike | null {
  return [...scores].sort((a, b) =>
    (b.calculation_week ?? b.created_at ?? '').localeCompare(a.calculation_week ?? a.created_at ?? ''),
  )[0] ?? null;
}

function activeLoan(loans: GrowthLoanLike[]): GrowthLoanLike | null {
  return [...loans].sort((a, b) => (b.applied_at ?? '').localeCompare(a.applied_at ?? ''))
    .find((loan) => ['pending', 'under_review', 'approved', 'disbursed', 'repaying'].includes(normalize(loan.status))) ?? null;
}

function activeContract(contracts: GrowthContractLike[]): GrowthContractLike | null {
  return contracts.find((contract) => ['active', 'pending', 'in_progress'].includes(normalize(contract.status)))
    ?? contracts.find((contract) => Number(contract.ownership_percentage ?? 0) > 0)
    ?? null;
}

function isCompletedContract(contract: GrowthContractLike | null): boolean {
  if (!contract) return false;
  return normalize(contract.status) === 'completed' || Number(contract.ownership_percentage ?? 0) >= 100 || !!contract.completed_at;
}

function hasActiveRental(rentals: GrowthRentalLike[]): boolean {
  return rentals.some((rental) => ['active', 'approved', 'ongoing'].includes(normalize(rental.status)));
}

function uniqueWeeks(scores: GrowthScoreLike[], payments: GrowthPaymentLike[]): number {
  const scoreWeeks = new Set(scores.map((score) => score.calculation_week?.slice(0, 10)).filter(Boolean));
  if (scoreWeeks.size > 0) return scoreWeeks.size;
  const paymentWeeks = new Set(payments.map((payment) => payment.due_date?.slice(0, 10)).filter(Boolean));
  return paymentWeeks.size;
}

function riskIsBlocking(level: DriverRiskLevel | null): boolean {
  return level === 'eleve' || level === 'critique';
}

function nextStageFor(stage: GrowthLifecycleStage): GrowthDriverProfile['nextStage'] {
  const index = GROWTH_STAGE_ORDER.indexOf(stage);
  if (stage === 'Financing Eligible Driver') return 'Credit Engine Review';
  if (stage === 'Vehicle Owner') return 'Fleet Entrepreneur';
  if (stage === 'Fleet Entrepreneur') return 'Final Ownership Transfer';
  return GROWTH_STAGE_ORDER[Math.min(GROWTH_STAGE_ORDER.length - 1, index + 1)];
}

export function buildLifecycleStage(input: {
  driver: GrowthDriverLike;
  score: number | null;
  weeksHistory: number;
  activeRental: boolean;
  ownershipContract: GrowthContractLike | null;
  activeLoan: GrowthLoanLike | null;
}): GrowthLifecycleStage {
  const loanStatus = normalize(input.activeLoan?.status);
  if (isCompletedContract(input.ownershipContract)) return 'Vehicle Owner';
  if (normalize(input.ownershipContract?.status) === 'active' || loanStatus === 'repaying') return 'Vehicle Owner';
  if ((input.score ?? 0) >= 850 && input.weeksHistory >= 12 && !isKycIssue(input.driver)) return 'Financing Eligible Driver';
  if ((input.score ?? 0) >= 700) return 'Trusted Driver';
  if (input.activeRental) return 'Daily Rental Driver';
  if (!isKycIssue(input.driver)) return 'Verified Driver';
  return 'Prospect';
}

export function buildGrowthBlockers(input: {
  driver: GrowthDriverLike;
  score: number | null;
  weeksHistory: number;
  onTimeRate: number;
  walletBalance: number;
  payments: GrowthPaymentLike[];
  violations: GrowthViolationLike[];
  accidents: GrowthAccidentLike[];
  controls: GrowthFleetControlLike[];
  risk: GrowthRiskLike | null;
  activeVehicleId: string | null;
  today: string;
}): GrowthBlocker[] {
  const blockers: GrowthBlocker[] = [];
  const overduePayments = input.payments.filter((payment) =>
    payment.driver_id === input.driver.id
      && payment.status
      && payment.due_date
      && isPaymentOverdue({ status: payment.status, due_date: payment.due_date }, input.today),
  ).length;
  const openViolations = input.violations.filter((violation) => violation.driver_id === input.driver.id && isOpenViolation(violation)).length;
  const openAccidents = input.accidents.filter((accident) => accident.driver_id === input.driver.id && isOpenAccident(accident)).length;
  const seriousAccidents = input.accidents.filter((accident) =>
    accident.driver_id === input.driver.id
      && isOpenAccident(accident)
      && ['major', 'severe', 'critical', 'moderate', 'SEVERE', 'MODERATE'].includes(accident.severity ?? ''),
  ).length;
  const fleetIssues = input.controls.filter((control) => control.driver_id === input.driver.id && isFleetControlIssue(control, input.today)).length;

  if (['suspended', 'blocked'].includes(normalize(input.driver.driver_status))) {
    blockers.push({ key: 'driver_suspended', label: 'Driver status blocks growth eligibility', severity: 'critical', source: 'risk' });
  }
  if (isKycIssue(input.driver)) {
    blockers.push({ key: 'kyc', label: 'KYC must be completed before ownership review', severity: 'critical', source: 'kyc' });
  }
  if ((input.score ?? 0) < 600) {
    blockers.push({ key: 'score_low', label: `KIRA Score is below the first growth threshold (${input.score ?? 'none'})`, severity: 'critical', source: 'score' });
  } else if ((input.score ?? 0) < 850) {
    blockers.push({ key: 'score_gap', label: `${850 - (input.score ?? 0)} score points needed for vehicle ownership review`, severity: 'warning', source: 'score' });
  }
  if (input.weeksHistory < 12) {
    blockers.push({ key: 'history', label: `${12 - input.weeksHistory} more scored week(s) needed for growth confidence`, severity: 'warning', source: 'history' });
  }
  if (input.onTimeRate < 90) {
    blockers.push({ key: 'payment_rate', label: `On-time payment rate must improve to 90% (current ${input.onTimeRate}%)`, severity: 'warning', source: 'payments' });
  }
  if (overduePayments > 0) {
    blockers.push({ key: 'overdue', label: `${overduePayments} overdue invoice/payment item(s) must be paid`, severity: 'critical', source: 'payments' });
  }
  if (input.walletBalance < 0) {
    blockers.push({ key: 'wallet_negative', label: 'Wallet balance is negative', severity: 'critical', source: 'wallet' });
  }
  if (openViolations > 0) {
    blockers.push({ key: 'violations', label: `${openViolations} unresolved contravention(s)`, severity: openViolations > 1 ? 'critical' : 'warning', source: 'contraventions' });
  }
  if (openAccidents > 0) {
    blockers.push({ key: 'accidents', label: seriousAccidents > 0 ? 'Unresolved serious incident requires risk review' : `${openAccidents} open sinistre(s)`, severity: seriousAccidents > 0 ? 'critical' : 'warning', source: 'sinistres' });
  }
  if (fleetIssues > 0) {
    blockers.push({ key: 'fleet_control', label: `${fleetIssues} fleet control issue(s) must be resolved`, severity: 'critical', source: 'fleet_control' });
  }
  if (riskIsBlocking(input.risk?.level ?? null)) {
    blockers.push({ key: 'risk_flag', label: 'Trust & Risk flag requires manual review', severity: 'critical', source: 'risk' });
  }
  if (!input.activeVehicleId) {
    blockers.push({ key: 'vehicle', label: 'No active vehicle assignment for ownership path', severity: 'warning', source: 'vehicle' });
  }

  return blockers;
}

export function buildOfferEvaluations(input: {
  score: number | null;
  weeksHistory: number;
  onTimeRate: number;
  blockers: GrowthBlocker[];
}): GrowthOfferEvaluation[] {
  const metrics = {
    score: input.score ?? 0,
    weeksHistory: input.weeksHistory,
    onTimeRate: input.onTimeRate,
  };
  const hardBlockers = input.blockers.filter((blocker) => blocker.severity === 'critical');

  return CREDIT_OFFERS.map((offer) => {
    const gaps = getEligibilityGaps(offer, metrics);
    const gapsClear = gaps.score === 0 && gaps.weeks === 0 && gaps.onTimeRate === 0;
    const criteriaMet = gapsClear && hardBlockers.length === 0;
    const gapReasons = [
      gaps.score > 0 ? `${gaps.score} score point(s) missing` : null,
      gaps.weeks > 0 ? `${gaps.weeks} scored week(s) missing` : null,
      gaps.onTimeRate > 0 ? `${gaps.onTimeRate}% payment-rate gap` : null,
    ].filter(Boolean);
    const unavailableReason = hardBlockers[0]?.label
      ?? gapReasons[0]
      ?? 'No persisted product offer is configured for driver visibility in Part 1.';

    return {
      offerType: offer.type,
      offerName: offer.title,
      offerStatus: 'DRAFT',
      driverOfferState: criteriaMet ? 'NOT_VISIBLE' : 'LOCKED_WITH_REASON',
      criteriaMet,
      eligible: false,
      unavailableReason: criteriaMet ? 'Part 1 is admin-only: publish requires product_offers, immutable snapshot, and audit event.' : unavailableReason,
      gaps,
      terms: {
        amount: offer.amount,
        dailyPayment: offer.dailyPayment,
        termMonths: offer.termMonths,
        downPayment: offer.downPayment,
        currency: 'FCFA',
      },
      requiredDocuments: ['KYC verified', 'Driver permit', 'Current rental record', 'Payment history'],
      adminApprovalRule: 'Admin review is required before any driver-visible offer.',
      driverExplanation: criteriaMet
        ? 'Vous êtes éligible pour faire une demande. Votre dossier peut être étudié.'
        : `Il vous manque encore des conditions: ${unavailableReason}.`,
    };
  });
}

export function deriveEligibilityState(input: {
  blockers: GrowthBlocker[];
  offers: GrowthOfferEvaluation[];
  currentApplication: GrowthLoanLike | null;
  ownershipContract: GrowthContractLike | null;
}): GrowthEligibilityState {
  const status = normalize(input.currentApplication?.status);
  if (input.blockers.some((blocker) => blocker.key === 'driver_suspended')) return 'SUSPENDED';
  if (isCompletedContract(input.ownershipContract)) return 'COMPLETED';
  if (normalize(input.ownershipContract?.status) === 'active' || status === 'repaying' || status === 'disbursed') return 'ACTIVE_OWNERSHIP_PATH';
  if (status === 'approved') return 'ACTIVATION_PENDING';
  if (status === 'pending' || status === 'under_review') return 'APPLICATION_SUBMITTED';
  if (status === 'rejected') return 'REJECTED';
  if (input.blockers.some((blocker) => blocker.severity === 'critical')) return 'NOT_ELIGIBLE';
  if (input.offers.some((offer) => offer.criteriaMet)) return 'ELIGIBLE_FOR_REVIEW';
  const warningCount = input.blockers.filter((blocker) => blocker.severity === 'warning').length;
  return warningCount <= 3 ? 'ALMOST_ELIGIBLE' : 'NOT_ELIGIBLE';
}

export function buildGrowthRecommendations(profile: {
  eligibilityState: GrowthEligibilityState;
  blockers: GrowthBlocker[];
  offers: GrowthOfferEvaluation[];
}): string[] {
  const recommendations: string[] = [];
  const blockers = new Set(profile.blockers.map((blocker) => blocker.key));
  if (blockers.has('overdue')) recommendations.push('Clear overdue invoice before ownership review.');
  if (blockers.has('kyc')) recommendations.push('Request missing KYC documents.');
  if (blockers.has('risk_flag') || blockers.has('accidents')) recommendations.push('Escalate to Trust & Risk review.');
  if (blockers.has('fleet_control')) recommendations.push('Resolve Fleet Control issue.');
  if (blockers.has('score_gap')) recommendations.push('Maintain on-time rental payments to improve score.');
  if (profile.offers.some((offer) => offer.criteriaMet)) recommendations.push('Review eligibility and prepare persisted offer configuration in Phase 2.');
  if (profile.eligibilityState === 'ACTIVATION_PENDING') recommendations.push('Confirm down payment, contract signature, vehicle assignment, and Financial Engine activation.');
  if (recommendations.length === 0) recommendations.push('Continue monitoring growth progression.');
  return recommendations;
}

export function buildGrowthProfiles(input: {
  drivers: GrowthDriverLike[];
  scores: GrowthScoreLike[];
  payments: GrowthPaymentLike[];
  wallets: GrowthWalletLike[];
  loans: GrowthLoanLike[];
  contracts: GrowthContractLike[];
  rentals: GrowthRentalLike[];
  violations: GrowthViolationLike[];
  accidents: GrowthAccidentLike[];
  controls: GrowthFleetControlLike[];
  risks: GrowthRiskLike[];
  today: string;
}): GrowthDriverProfile[] {
  const scoresByDriver = groupBy(input.scores, (row) => row.driver_id);
  const paymentsByDriver = groupBy(input.payments, (row) => row.driver_id ?? '');
  const loansByDriver = groupBy(input.loans, (row) => row.driver_id);
  const contractsByDriver = groupBy(input.contracts, (row) => row.driver_id);
  const rentalsByDriver = groupBy(input.rentals, (row) => row.driver_id ?? '');
  const walletByDriver = new Map(input.wallets.map((wallet) => [wallet.driver_id, wallet]));
  const riskByDriver = new Map(input.risks.map((risk) => [risk.driver_id, risk]));

  return input.drivers.map((driver) => {
    const driverScores = scoresByDriver.get(driver.id) ?? [];
    const currentScore = latestScore(driverScores);
    const payments = paymentsByDriver.get(driver.id) ?? [];
    const driverLoans = loansByDriver.get(driver.id) ?? [];
    const driverContracts = contractsByDriver.get(driver.id) ?? [];
    const driverRentals = rentalsByDriver.get(driver.id) ?? [];
    const currentApplication = activeLoan(driverLoans);
    const ownershipContract = activeContract(driverContracts);
    const activeRental = hasActiveRental(driverRentals);
    const score = currentScore?.score ?? null;
    const weeksHistory = uniqueWeeks(driverScores, payments);
    const onTimeRate = calculateOnTimeRate(payments);
    const walletBalance = Number(walletByDriver.get(driver.id)?.balance ?? 0);
    const activeVehicleId = driver.active_vehicle_id ?? driverRentals.find((rental) => rental.vehicle_id)?.vehicle_id ?? ownershipContract?.vehicle_id ?? null;
    const risk = riskByDriver.get(driver.id) ?? null;
    const blockers = buildGrowthBlockers({
      driver,
      score,
      weeksHistory,
      onTimeRate,
      walletBalance,
      payments,
      violations: input.violations,
      accidents: input.accidents,
      controls: input.controls,
      risk,
      activeVehicleId,
      today: input.today,
    });
    const offers = buildOfferEvaluations({ score, weeksHistory, onTimeRate, blockers });
    const eligibilityState = deriveEligibilityState({ blockers, offers, currentApplication, ownershipContract });
    const lifecycleStage = buildLifecycleStage({ driver, score, weeksHistory, activeRental, ownershipContract, activeLoan: currentApplication });
    const criticalBlocker = blockers.find((blocker) => blocker.severity === 'critical');
    const canPublishOffer = false;
    const publishDisabledReason = ['ELIGIBLE_FOR_REVIEW', 'OFFER_READY'].includes(eligibilityState) && offers.some((offer) => offer.criteriaMet)
      ? 'Part 1 is admin-only: publishing requires persisted product offer, immutable snapshot, and audit event.'
      : criticalBlocker?.label ?? offers.find((offer) => !offer.criteriaMet)?.unavailableReason ?? 'Driver is not eligible for review yet.';
    const partialProfile = { eligibilityState, blockers, offers };

    return {
      driverId: driver.id,
      driverName: driverName(driver),
      phone: driver.phone_number ?? null,
      lifecycleStage,
      nextStage: nextStageFor(lifecycleStage),
      eligibilityState,
      score,
      tier: currentScore?.tier ?? null,
      scoreProgress: calculateOwnershipProgress(score ?? 0),
      weeksHistory,
      onTimeRate,
      walletBalance,
      activeRental,
      activeVehicleId,
      blockers,
      recommendations: buildGrowthRecommendations(partialProfile),
      offers,
      currentApplication,
      ownershipContract,
      riskLevel: risk?.level ?? null,
      riskReasons: risk?.reasons ?? [],
      canPublishOffer,
      publishDisabledReason,
    };
  }).sort((a, b) => eligibilityRank(b.eligibilityState) - eligibilityRank(a.eligibilityState) || (b.score ?? 0) - (a.score ?? 0) || a.driverName.localeCompare(b.driverName));
}

export function buildGrowthOverview(profiles: GrowthDriverProfile[]): GrowthOverview {
  const funnel = GROWTH_STAGE_ORDER.reduce((acc, stage) => {
    acc[stage] = profiles.filter((profile) => profile.lifecycleStage === stage).length;
    return acc;
  }, {} as Record<GrowthLifecycleStage, number>);

  return {
    totalDrivers: profiles.length,
    eligibleDrivers: profiles.filter((profile) => ['ELIGIBLE_FOR_REVIEW', 'OFFER_READY'].includes(profile.eligibilityState)).length,
    closeToEligibility: profiles.filter((profile) => profile.eligibilityState === 'ALMOST_ELIGIBLE').length,
    blockedDrivers: profiles.filter((profile) => ['NOT_ELIGIBLE', 'SUSPENDED', 'REJECTED'].includes(profile.eligibilityState)).length,
    ownershipPathDrivers: profiles.filter((profile) => ['ACTIVATION_PENDING', 'ACTIVE_OWNERSHIP_PATH', 'COMPLETED'].includes(profile.eligibilityState)).length,
    activeOffers: 0,
    expiringOffers: 0,
    riskExceptions: profiles.filter((profile) => profile.blockers.some((blocker) => blocker.source === 'risk' || blocker.source === 'sinistres')).length,
    conversionFunnel: funnel,
  };
}

export function eligibilityRank(state: GrowthEligibilityState): number {
  switch (state) {
    case 'COMPLETED': return 12;
    case 'ACTIVE_OWNERSHIP_PATH': return 11;
    case 'ACTIVATION_PENDING': return 10;
    case 'APPLICATION_APPROVED': return 9;
    case 'APPLICATION_SUBMITTED': return 8;
    case 'OFFER_PUBLISHED': return 7;
    case 'OFFER_READY': return 6;
    case 'ELIGIBLE_FOR_REVIEW': return 5;
    case 'ALMOST_ELIGIBLE': return 4;
    case 'NOT_ELIGIBLE': return 3;
    case 'SUSPENDED': return 2;
    case 'REJECTED': return 1;
    default: return 0;
  }
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}
