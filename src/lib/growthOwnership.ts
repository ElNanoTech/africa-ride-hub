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

export type GrowthPipelineStage =
  | 'Verified'
  | 'Trusted'
  | 'Almost Eligible'
  | 'Eligible'
  | 'Offer Published'
  | 'Application Started'
  | 'Submitted'
  | 'Approved'
  | 'Ownership Active'
  | 'Fleet Entrepreneur';

export type GrowthReviewRecommendation = 'Approve' | 'Needs Review' | 'Reject' | 'Manual Override';

export type GrowthOwnershipPipelineStage =
  | 'Application Started'
  | 'Submitted'
  | 'Under Review'
  | 'Approved'
  | 'Awaiting Down Payment'
  | 'Awaiting Contract'
  | 'Awaiting Vehicle'
  | 'Ready For Activation'
  | 'Ownership Active';

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

export type GrowthFunnelStage = {
  key: string;
  label: string;
  count: number;
  route: string;
};

export type GrowthBlockerSummary = {
  key: string;
  label: string;
  source: GrowthBlocker['source'];
  severity: GrowthBlockerSeverity;
  count: number;
  route: string;
};

export type GrowthPriorityQueueItem = {
  key: string;
  label: string;
  count: number;
  priority: 'high' | 'medium' | 'low';
  route: string;
};

export type GrowthAnalytics = {
  eligibleGrowthRate: number;
  offerAcceptanceRate: number;
  applicationConversionRate: number;
  approvalRate: number;
  ownershipActivationRate: number;
  fleetEntrepreneurRate: number;
  cohortsByJoinMonth: Array<{ label: string; count: number }>;
  scoreBands: Array<{ label: string; count: number }>;
  vehicleAssignment: Array<{ label: string; count: number }>;
  funnel: GrowthFunnelStage[];
  riskBlockers: GrowthBlockerSummary[];
  averageDownPayment: number | null;
  averageOwnershipDurationDays: number | null;
  revenueByOwnershipCohortAvailable: boolean;
};

export type GrowthDriverProfile = {
  driverId: string;
  driverName: string;
  phone: string | null;
  createdAt: string | null;
  lifecycleStage: GrowthLifecycleStage;
  nextStage: GrowthLifecycleStage | 'Credit Engine Review' | 'Final Ownership Transfer';
  pipelineStage: GrowthPipelineStage;
  eligibilityState: GrowthEligibilityState;
  reviewRecommendation: GrowthReviewRecommendation;
  growthProgress: number;
  projectedEligibilityDate: string | null;
  score: number | null;
  tier: string | null;
  scoreProgress: number;
  weeksHistory: number;
  onTimeRate: number;
  walletBalance: number;
  lastPaymentDate: string | null;
  paidPaymentCount: number;
  activeRental: boolean;
  firstRentalDate: string | null;
  activeVehicleId: string | null;
  currentVehicleLabel: string | null;
  blockers: GrowthBlocker[];
  recommendations: string[];
  offers: GrowthOfferEvaluation[];
  currentApplication: GrowthLoanLike | null;
  ownershipContract: GrowthContractLike | null;
  ownershipPipelineStage: GrowthOwnershipPipelineStage | null;
  applicationDate: string | null;
  reviewer: string | null;
  daysInStage: number;
  nextAction: string;
  slaFlags: string[];
  riskLevel: DriverRiskLevel | null;
  riskReasons: string[];
  canPublishOffer: boolean;
  publishDisabledReason: string;
};

export type DriverJourneyStageStatus = 'completed' | 'current' | 'locked';
export type DriverJourneyRequirementStatus = 'met' | 'missing' | 'in_progress';
export type DriverJourneyOpportunityStatus = 'Locked' | 'Almost Ready' | 'Available' | 'In Progress' | 'Completed' | 'Expired';
export type DriverJourneyApplicationStageStatus = 'completed' | 'current' | 'locked';
export type DriverJourneyDocumentStatus = 'Missing' | 'Uploaded' | 'Under Review' | 'Approved' | 'Rejected' | 'Requires Re-upload';

export type DriverJourneyEligibilityDisplayState =
  | 'Not Eligible'
  | 'Almost Eligible'
  | 'Eligible For Review'
  | 'Offer Available'
  | 'Application In Progress'
  | 'Approved Pending Activation'
  | 'Ownership Active';

export type DriverJourneyStage = {
  stage: GrowthLifecycleStage;
  label: string;
  description: string;
  status: DriverJourneyStageStatus;
  benefits: string[];
  requirements: string[];
};

export type DriverJourneyRequirement = {
  key: string;
  label: string;
  status: DriverJourneyRequirementStatus;
  current: string;
  target: string;
  explanation: string;
  suggestion: string;
};

export type DriverJourneyAction = {
  key: string;
  label: string;
  impact: 'high' | 'medium' | 'low';
  route: string;
  explanation: string;
};

export type DriverJourneyOpportunity = {
  id: string;
  name: string;
  status: DriverJourneyOpportunityStatus;
  eligibilityLevel: string;
  benefits: string[];
  requirements: DriverJourneyRequirement[];
  expiration: string | null;
  reason: string;
  remaining: string;
  recommendedActions: DriverJourneyAction[];
  isPublishedOffer: boolean;
  canStartApplication: boolean;
  detailRoute: string;
  disclaimer: string;
  financialExpectations: {
    totalAmount: number;
    downPayment: number;
    estimatedMonthlyObligation: number;
    currency: 'FCFA';
  };
  timeline: string;
};

export type DriverJourneyApplicationStage = {
  key: string;
  label: string;
  status: DriverJourneyApplicationStageStatus;
  explanation: string;
  nextStep: string;
};

export type DriverJourneyDocument = {
  key: string;
  label: string;
  status: DriverJourneyDocumentStatus;
  explanation: string;
  rejectionReason: string | null;
};

export type DriverJourneyAchievement = {
  key: string;
  label: string;
  achieved: boolean;
  evidence: string;
};

export type DriverJourneyMilestone = {
  key: string;
  label: string;
  achieved: boolean;
  date: string | null;
  explanation: string;
};

export type DriverJourneySummary = {
  currentStage: GrowthLifecycleStage;
  currentStageLabel: string;
  currentStageDescription: string;
  nextStage: GrowthDriverProfile['nextStage'];
  progress: number;
  roadmap: DriverJourneyStage[];
  eligibility: {
    state: DriverJourneyEligibilityDisplayState;
    explanation: string;
    requirementsMet: DriverJourneyRequirement[];
    requirementsMissing: DriverJourneyRequirement[];
    requirementsInProgress: DriverJourneyRequirement[];
  };
  nextActions: DriverJourneyAction[];
  opportunities: DriverJourneyOpportunity[];
  activeOpportunityCount: number;
  applicationTracker: DriverJourneyApplicationStage[];
  documents: DriverJourneyDocument[];
  downPaymentReadiness: {
    required: number;
    saved: number;
    remaining: number;
    estimatedCompletionDate: string | null;
  };
  achievements: DriverJourneyAchievement[];
  milestones: DriverJourneyMilestone[];
  simulatorDisclaimer: string;
  activationVisible: boolean;
  activationReason: string;
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
  almostEligibleDrivers: number;
  offersPublished: number;
  applicationsStarted: number;
  applicationsSubmitted: number;
  applicationsApproved: number;
  ownershipActive: number;
  fleetEntrepreneurs: number;
  growthFunnel: GrowthFunnelStage[];
  topBlockers: GrowthBlockerSummary[];
  priorityQueue: GrowthPriorityQueueItem[];
  analytics: GrowthAnalytics;
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

export const GROWTH_PIPELINE_STAGES: GrowthPipelineStage[] = [
  'Verified',
  'Trusted',
  'Almost Eligible',
  'Eligible',
  'Offer Published',
  'Application Started',
  'Submitted',
  'Approved',
  'Ownership Active',
  'Fleet Entrepreneur',
];

export const OWNERSHIP_PIPELINE_STAGES: GrowthOwnershipPipelineStage[] = [
  'Application Started',
  'Submitted',
  'Under Review',
  'Approved',
  'Awaiting Down Payment',
  'Awaiting Contract',
  'Awaiting Vehicle',
  'Ready For Activation',
  'Ownership Active',
];

function normalize(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim();
}

function isoDate(value: string | null | undefined): string | null {
  return value ? value.slice(0, 10) : null;
}

function daysBetween(start: string | null | undefined, end: string): number {
  if (!start) return 0;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
  return Math.max(0, Math.floor((endTime - startTime) / 86_400_000));
}

function addDays(dateValue: string, days: number): string {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
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
    .find((loan) => ['draft', 'started', 'pending', 'under_review', 'approved', 'disbursed', 'repaying'].includes(normalize(loan.status))) ?? null;
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

function latestPaymentDate(payments: GrowthPaymentLike[]): string | null {
  return [...payments]
    .map((payment) => isoDate(payment.paid_date ?? payment.paid_at ?? payment.created_at ?? payment.due_date))
    .filter((date): date is string => Boolean(date))
    .sort((a, b) => b.localeCompare(a))[0] ?? null;
}

function paidPaymentCount(payments: GrowthPaymentLike[]): number {
  return payments.filter((payment) => ['paid', 'overpaid'].includes(normalize(payment.status))).length;
}

function firstRentalDate(rentals: GrowthRentalLike[]): string | null {
  return [...rentals]
    .map((rental) => isoDate(rental.start_date ?? rental.created_at))
    .filter((date): date is string => Boolean(date))
    .sort((a, b) => a.localeCompare(b))[0] ?? null;
}

function vehicleLabel(vehicle: GrowthVehicleLike | undefined, fallbackId: string | null): string | null {
  if (!vehicle) return fallbackId;
  return [
    vehicle.license_plate,
    [vehicle.make, vehicle.model_name].filter(Boolean).join(' '),
  ].filter(Boolean).join(' · ') || fallbackId;
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

function buildReviewRecommendation(input: {
  eligibilityState: GrowthEligibilityState;
  blockers: GrowthBlocker[];
  riskLevel: DriverRiskLevel | null;
}): GrowthReviewRecommendation {
  if (input.riskLevel === 'eleve' || input.riskLevel === 'critique') return 'Manual Override';
  if (['ELIGIBLE_FOR_REVIEW', 'OFFER_READY'].includes(input.eligibilityState)) return 'Approve';
  if (input.blockers.some((blocker) => blocker.severity === 'critical')) return 'Reject';
  return 'Needs Review';
}

function buildGrowthProgress(input: {
  score: number | null;
  weeksHistory: number;
  onTimeRate: number;
  blockers: GrowthBlocker[];
}): number {
  const scoreProgress = Math.min(100, Math.round(((input.score ?? 0) / 850) * 100));
  const historyProgress = Math.min(100, Math.round((input.weeksHistory / 12) * 100));
  const paymentProgress = Math.min(100, Math.round((input.onTimeRate / 90) * 100));
  const blockerPenalty = input.blockers.filter((blocker) => blocker.severity === 'critical').length * 15;
  return Math.max(0, Math.min(100, Math.round((scoreProgress + historyProgress + paymentProgress) / 3) - blockerPenalty));
}

function projectedEligibilityDate(input: {
  blockers: GrowthBlocker[];
  weeksHistory: number;
  today: string;
}): string | null {
  if (input.blockers.some((blocker) => blocker.severity === 'critical')) return null;
  const missingWeeks = Math.max(0, 12 - input.weeksHistory);
  if (missingWeeks === 0) return input.today;
  return addDays(input.today, missingWeeks * 7);
}

function pipelineStageFor(input: {
  lifecycleStage: GrowthLifecycleStage;
  eligibilityState: GrowthEligibilityState;
  currentApplication: GrowthLoanLike | null;
  ownershipContract: GrowthContractLike | null;
}): GrowthPipelineStage {
  const loanStatus = normalize(input.currentApplication?.status);
  if (input.lifecycleStage === 'Fleet Entrepreneur') return 'Fleet Entrepreneur';
  if (normalize(input.ownershipContract?.status) === 'active' || isCompletedContract(input.ownershipContract) || ['disbursed', 'repaying'].includes(loanStatus)) return 'Ownership Active';
  if (loanStatus === 'approved' || input.eligibilityState === 'APPLICATION_APPROVED' || input.eligibilityState === 'ACTIVATION_PENDING') return 'Approved';
  if (['pending', 'under_review'].includes(loanStatus) || input.eligibilityState === 'APPLICATION_SUBMITTED') return 'Submitted';
  if (['draft', 'started'].includes(loanStatus) || input.eligibilityState === 'APPLICATION_STARTED') return 'Application Started';
  if (input.eligibilityState === 'OFFER_PUBLISHED') return 'Offer Published';
  if (['ELIGIBLE_FOR_REVIEW', 'OFFER_READY'].includes(input.eligibilityState)) return 'Eligible';
  if (input.eligibilityState === 'ALMOST_ELIGIBLE') return 'Almost Eligible';
  if (input.lifecycleStage === 'Trusted Driver' || input.lifecycleStage === 'Financing Eligible Driver') return 'Trusted';
  return 'Verified';
}

function ownershipStageFor(input: {
  currentApplication: GrowthLoanLike | null;
  ownershipContract: GrowthContractLike | null;
  activeVehicleId: string | null;
}): GrowthOwnershipPipelineStage | null {
  const loanStatus = normalize(input.currentApplication?.status);
  const contractStatus = normalize(input.ownershipContract?.status);
  if (contractStatus === 'active' || isCompletedContract(input.ownershipContract) || ['disbursed', 'repaying'].includes(loanStatus)) return 'Ownership Active';
  if (contractStatus === 'pending') return 'Awaiting Contract';
  if (!input.activeVehicleId && loanStatus === 'approved') return 'Awaiting Vehicle';
  if (loanStatus === 'approved') return 'Approved';
  if (loanStatus === 'under_review') return 'Under Review';
  if (loanStatus === 'pending') return 'Submitted';
  if (['draft', 'started'].includes(loanStatus)) return 'Application Started';
  return null;
}

function nextActionFor(input: {
  ownershipPipelineStage: GrowthOwnershipPipelineStage | null;
  reviewRecommendation: GrowthReviewRecommendation;
  blockers: GrowthBlocker[];
  canPublishOffer: boolean;
}): string {
  if (input.ownershipPipelineStage === 'Under Review' || input.ownershipPipelineStage === 'Submitted') return 'Review application and required documents';
  if (input.ownershipPipelineStage === 'Approved') return 'Confirm down payment, contract, and vehicle readiness';
  if (input.ownershipPipelineStage === 'Awaiting Contract') return 'Route to ownership contracts';
  if (input.ownershipPipelineStage === 'Awaiting Vehicle') return 'Confirm vehicle availability';
  if (input.ownershipPipelineStage === 'Ownership Active') return 'Monitor ownership health';
  if (input.reviewRecommendation === 'Approve') return 'Review eligibility; publishing remains disabled until persistence and audit exist';
  if (input.reviewRecommendation === 'Manual Override') return 'Escalate to Trust & Risk with note and audit context';
  const blocker = input.blockers[0];
  return blocker ? blocker.label : 'Continue monitoring growth progression';
}

function slaFlagsFor(input: {
  ownershipPipelineStage: GrowthOwnershipPipelineStage | null;
  daysInStage: number;
  blockers: GrowthBlocker[];
}): string[] {
  const flags: string[] = [];
  if (input.ownershipPipelineStage && input.daysInStage >= 7) flags.push('Application stuck 7 days');
  if (input.blockers.some((blocker) => blocker.key === 'kyc') && input.daysInStage >= 14) flags.push('Missing document 14 days');
  if (input.ownershipPipelineStage === 'Approved' && input.daysInStage >= 3) flags.push('Approval not actioned');
  if (input.blockers.some((blocker) => blocker.key === 'vehicle')) flags.push('Vehicle unavailable');
  if (input.ownershipPipelineStage === 'Approved') flags.push('Down payment pending verification');
  return flags;
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
  vehicles?: GrowthVehicleLike[];
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
  const vehicleById = new Map((input.vehicles ?? []).map((vehicle) => [vehicle.id, vehicle]));

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
    const pipelineStage = pipelineStageFor({ lifecycleStage, eligibilityState, currentApplication, ownershipContract });
    const reviewRecommendation = buildReviewRecommendation({ eligibilityState, blockers, riskLevel: risk?.level ?? null });
    const ownershipPipelineStage = ownershipStageFor({ currentApplication, ownershipContract, activeVehicleId });
    const stageDate = currentApplication?.approved_at
      ?? currentApplication?.applied_at
      ?? ownershipContract?.start_date
      ?? driver.created_at
      ?? input.today;
    const daysInStage = daysBetween(stageDate, input.today);
    const growthProgress = buildGrowthProgress({ score, weeksHistory, onTimeRate, blockers });
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
      createdAt: driver.created_at ?? null,
      lifecycleStage,
      nextStage: nextStageFor(lifecycleStage),
      pipelineStage,
      eligibilityState,
      reviewRecommendation,
      growthProgress,
      projectedEligibilityDate: projectedEligibilityDate({ blockers, weeksHistory, today: input.today }),
      score,
      tier: currentScore?.tier ?? null,
      scoreProgress: calculateOwnershipProgress(score ?? 0),
      weeksHistory,
      onTimeRate,
      walletBalance,
      lastPaymentDate: latestPaymentDate(payments),
      paidPaymentCount: paidPaymentCount(payments),
      activeRental,
      firstRentalDate: firstRentalDate(driverRentals),
      activeVehicleId,
      currentVehicleLabel: vehicleLabel(activeVehicleId ? vehicleById.get(activeVehicleId) : undefined, activeVehicleId),
      blockers,
      recommendations: buildGrowthRecommendations(partialProfile),
      offers,
      currentApplication,
      ownershipContract,
      ownershipPipelineStage,
      applicationDate: currentApplication?.applied_at ?? null,
      reviewer: null,
      daysInStage,
      nextAction: nextActionFor({ ownershipPipelineStage, reviewRecommendation, blockers, canPublishOffer }),
      slaFlags: slaFlagsFor({ ownershipPipelineStage, daysInStage, blockers }),
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
  const totalDrivers = profiles.length;
  const eligibleDrivers = profiles.filter((profile) => ['ELIGIBLE_FOR_REVIEW', 'OFFER_READY'].includes(profile.eligibilityState)).length;
  const almostEligibleDrivers = profiles.filter((profile) => profile.eligibilityState === 'ALMOST_ELIGIBLE').length;
  const applicationsStarted = profiles.filter((profile) => profile.pipelineStage === 'Application Started').length;
  const applicationsSubmitted = profiles.filter((profile) => ['Submitted', 'Approved', 'Ownership Active', 'Fleet Entrepreneur'].includes(profile.pipelineStage)).length;
  const applicationsApproved = profiles.filter((profile) => ['Approved', 'Ownership Active', 'Fleet Entrepreneur'].includes(profile.pipelineStage)).length;
  const ownershipActive = profiles.filter((profile) => profile.pipelineStage === 'Ownership Active' || profile.pipelineStage === 'Fleet Entrepreneur').length;
  const fleetEntrepreneurs = profiles.filter((profile) => profile.pipelineStage === 'Fleet Entrepreneur').length;
  const growthFunnel = buildGrowthFunnel(profiles);
  const topBlockers = buildTopBlockers(profiles);
  const priorityQueue = buildPriorityQueue(profiles);
  const analytics = buildGrowthAnalytics({
    profiles,
    growthFunnel,
    topBlockers,
    eligibleDrivers,
    applicationsSubmitted,
    applicationsApproved,
    ownershipActive,
    fleetEntrepreneurs,
  });

  return {
    totalDrivers,
    eligibleDrivers,
    closeToEligibility: almostEligibleDrivers,
    blockedDrivers: profiles.filter((profile) => ['NOT_ELIGIBLE', 'SUSPENDED', 'REJECTED'].includes(profile.eligibilityState)).length,
    ownershipPathDrivers: profiles.filter((profile) => ['ACTIVATION_PENDING', 'ACTIVE_OWNERSHIP_PATH', 'COMPLETED'].includes(profile.eligibilityState)).length,
    activeOffers: 0,
    expiringOffers: 0,
    riskExceptions: profiles.filter((profile) => profile.blockers.some((blocker) => blocker.source === 'risk' || blocker.source === 'sinistres')).length,
    conversionFunnel: funnel,
    almostEligibleDrivers,
    offersPublished: 0,
    applicationsStarted,
    applicationsSubmitted,
    applicationsApproved,
    ownershipActive,
    fleetEntrepreneurs,
    growthFunnel,
    topBlockers,
    priorityQueue,
    analytics,
  };
}

const JOURNEY_STAGE_COPY: Record<GrowthLifecycleStage, {
  label: string;
  description: string;
  benefits: string[];
  requirements: string[];
}> = {
  Prospect: {
    label: 'Prospect',
    description: 'Votre profil commence son parcours KIRA.',
    benefits: ['Decouvrir les services', 'Preparer les documents'],
    requirements: ['Creer un profil', 'Completer les informations de base'],
  },
  'Verified Driver': {
    label: 'Chauffeur Verifie',
    description: 'Votre identite est confirmee et votre profil peut progresser.',
    benefits: ['Acces aux etapes chauffeur', 'Confiance de base etablie'],
    requirements: ['KYC verifie', 'Profil actif'],
  },
  'Daily Rental Driver': {
    label: 'Chauffeur Location',
    description: 'Vous construisez votre historique avec des locations et paiements suivis.',
    benefits: ['Historique de conduite', 'Score en progression'],
    requirements: ['Location active ou recente', 'Paiements suivis'],
  },
  'Trusted Driver': {
    label: 'Chauffeur de Confiance',
    description: 'Vous avez demontre une bonne regularite et un comportement fiable.',
    benefits: ['Meilleure visibilite eligibility', 'Preparation aux opportunites'],
    requirements: ['Score au-dessus de 700', 'Paiements reguliers'],
  },
  'Financing Eligible Driver': {
    label: 'Pret pour Revue',
    description: 'Votre dossier peut etre etudie par les equipes KIRA.',
    benefits: ['Revue possible', 'Prochaine etape vers un dossier structure'],
    requirements: ['Score cible atteint', 'Historique suffisant', 'Aucun blocage critique'],
  },
  'Vehicle Owner': {
    label: 'Parcours Propriete Actif',
    description: 'Un contrat ou parcours de propriete est actif et suivi.',
    benefits: ['Progression contractuelle visible', 'Responsabilites clarifiees'],
    requirements: ['Contrat signe', 'Vehicule assigne', 'Paiements suivis'],
  },
  'Fleet Entrepreneur': {
    label: 'Entrepreneur Flotte',
    description: 'Le parcours peut s etendre vers la gestion de plusieurs vehicules.',
    benefits: ['Vision entrepreneuriale', 'Suivi flotte futur'],
    requirements: ['Parcours propriete solide', 'Historique long terme'],
  },
};

const DRIVER_APPLICATION_STAGES: Array<{
  key: string;
  label: string;
  explanation: string;
  nextStep: string;
}> = [
  {
    key: 'started',
    label: 'Started',
    explanation: 'La demande existe dans le systeme.',
    nextStep: 'Verifier que les informations sont completes.',
  },
  {
    key: 'submitted',
    label: 'Submitted',
    explanation: 'La demande est envoyee pour revue.',
    nextStep: 'Attendre la premiere verification KIRA.',
  },
  {
    key: 'documents-review',
    label: 'Documents Review',
    explanation: 'Les documents requis sont controles.',
    nextStep: 'Corriger tout document manquant ou refuse.',
  },
  {
    key: 'risk-review',
    label: 'Risk Review',
    explanation: 'KIRA verifie les signaux de confiance sans exposer les regles internes.',
    nextStep: 'Garder les paiements et controles a jour.',
  },
  {
    key: 'approved',
    label: 'Approved',
    explanation: 'La demande est approuvee sous conditions operationnelles.',
    nextStep: 'Preparer l activation avec KIRA.',
  },
  {
    key: 'awaiting-down-payment',
    label: 'Awaiting Down Payment',
    explanation: 'La readiness du paiement initial doit etre confirmee.',
    nextStep: 'Suivre le montant restant dans KiraPay ou avec l equipe.',
  },
  {
    key: 'awaiting-contract',
    label: 'Awaiting Contract',
    explanation: 'Le contrat doit etre prepare et signe.',
    nextStep: 'Verifier le resume du contrat avant signature.',
  },
  {
    key: 'awaiting-vehicle',
    label: 'Awaiting Vehicle Assignment',
    explanation: 'Un vehicule doit etre assigne au dossier.',
    nextStep: 'Attendre la confirmation du vehicule.',
  },
  {
    key: 'ready',
    label: 'Ready',
    explanation: 'Toutes les conditions operationnelles sont pretes.',
    nextStep: 'L activation est lancee par le moteur credit.',
  },
  {
    key: 'ownership-active',
    label: 'Ownership Active',
    explanation: 'Le parcours de propriete est actif et suivi.',
    nextStep: 'Respecter les responsabilites et paiements.',
  },
];

function eligibilityDisplayState(state: GrowthEligibilityState): DriverJourneyEligibilityDisplayState {
  if (['ACTIVE_OWNERSHIP_PATH', 'COMPLETED'].includes(state)) return 'Ownership Active';
  if (['APPLICATION_APPROVED', 'ACTIVATION_PENDING'].includes(state)) return 'Approved Pending Activation';
  if (['APPLICATION_STARTED', 'APPLICATION_SUBMITTED'].includes(state)) return 'Application In Progress';
  if (state === 'OFFER_PUBLISHED') return 'Offer Available';
  if (['ELIGIBLE_FOR_REVIEW', 'OFFER_READY'].includes(state)) return 'Eligible For Review';
  if (state === 'ALMOST_ELIGIBLE') return 'Almost Eligible';
  return 'Not Eligible';
}

function eligibilityExplanation(profile: GrowthDriverProfile, state: DriverJourneyEligibilityDisplayState): string {
  if (state === 'Ownership Active') return 'Votre parcours de propriete est actif dans les donnees KIRA.';
  if (state === 'Approved Pending Activation') return 'Votre dossier est approuve, mais activation, contrat, paiement initial et vehicule doivent encore etre confirmes.';
  if (state === 'Application In Progress') return 'Votre demande existe et avance dans le suivi KIRA.';
  if (state === 'Offer Available') return 'Une opportunite publiee serait visible ici lorsqu elle existe dans les donnees.';
  if (state === 'Eligible For Review') return 'Votre dossier peut etre revu par KIRA, mais aucune offre conducteur n est publiee sans produit persiste et audit.';
  if (state === 'Almost Eligible') return 'Vous etes proche. Les actions ci-dessous expliquent ce qui manque.';
  const blocker = profile.blockers[0];
  return blocker ? blocker.label : 'Votre profil n a pas encore assez de signaux pour une revue.';
}

function requirementStatusFor(blockers: GrowthBlocker[], keys: string[], warningAsProgress = true): DriverJourneyRequirementStatus {
  const matching = blockers.filter((item) => keys.includes(item.key));
  if (matching.length === 0) return 'met';
  if (matching.some((blocker) => blocker.severity === 'critical')) return 'missing';
  return warningAsProgress ? 'in_progress' : 'missing';
}

function buildJourneyRequirements(profile: GrowthDriverProfile): DriverJourneyRequirement[] {
  const scoreTarget = 850;
  return [
    {
      key: 'identity',
      label: 'Identite verifiee',
      status: requirementStatusFor(profile.blockers, ['kyc'], false),
      current: profile.blockers.some((blocker) => blocker.key === 'kyc') ? 'KYC incomplet' : 'KYC verifie',
      target: 'KYC verifie',
      explanation: 'KIRA doit confirmer votre identite avant une revue de propriete.',
      suggestion: 'Completer ou corriger vos documents KYC.',
    },
    {
      key: 'score',
      label: 'Score KIRA',
      status: requirementStatusFor(profile.blockers, ['score_low', 'score_gap']),
      current: profile.score == null ? 'Aucun score' : `${profile.score} points`,
      target: `${scoreTarget} points pour la revue vehicule`,
      explanation: 'Le score resume vos signaux de confiance sans exposer les formules internes.',
      suggestion: 'Payer a temps et maintenir une conduite/operation stable.',
    },
    {
      key: 'payment-history',
      label: 'Paiements a temps',
      status: requirementStatusFor(profile.blockers, ['overdue', 'payment_rate']),
      current: `${profile.onTimeRate}% a temps`,
      target: '90% minimum, sans impaye ouvert',
      explanation: 'Les paiements reguliers construisent la confiance.',
      suggestion: 'Regler les factures ouvertes et eviter les retards.',
    },
    {
      key: 'rental-history',
      label: 'Historique de location',
      status: requirementStatusFor(profile.blockers, ['history']),
      current: `${profile.weeksHistory} semaine(s) scorees`,
      target: '12 semaines minimum pour confiance de croissance',
      explanation: 'KIRA a besoin d un historique suffisant pour evaluer la regularite.',
      suggestion: 'Continuer les locations et garder les controles a jour.',
    },
    {
      key: 'vehicle-care',
      label: 'Soin du vehicule',
      status: requirementStatusFor(profile.blockers, ['fleet_control', 'violations', 'accidents', 'vehicle']),
      current: profile.currentVehicleLabel ?? (profile.activeVehicleId ? 'Vehicule actif' : 'Aucun vehicule actif'),
      target: 'Vehicule assigne et aucun blocage operationnel',
      explanation: 'Les controles, sinistres et contraventions ouverts peuvent bloquer la progression.',
      suggestion: 'Resoudre les controles, sinistres ou contraventions ouverts.',
    },
    {
      key: 'wallet',
      label: 'Comportement portefeuille',
      status: requirementStatusFor(profile.blockers, ['wallet_negative'], false),
      current: `${Math.max(0, profile.walletBalance).toLocaleString('fr-FR')} FCFA disponible`,
      target: 'Solde non negatif',
      explanation: 'Le portefeuille aide a suivre la preparation financiere sans mouvement d argent ici.',
      suggestion: 'Garder un solde sain et eviter les soldes negatifs.',
    },
  ];
}

function actionFromBlocker(blocker: GrowthBlocker): DriverJourneyAction {
  if (blocker.key === 'overdue') {
    return {
      key: 'pay-overdue',
      label: 'Regler les paiements en retard',
      impact: 'high',
      route: '/driver/factures',
      explanation: blocker.label,
    };
  }
  if (blocker.key === 'kyc') {
    return {
      key: 'complete-kyc',
      label: 'Completer la verification identite',
      impact: 'high',
      route: '/driver/kyc',
      explanation: blocker.label,
    };
  }
  if (blocker.key === 'fleet_control') {
    return {
      key: 'complete-control',
      label: 'Finaliser le controle vehicule',
      impact: 'high',
      route: '/driver/fleet-control',
      explanation: blocker.label,
    };
  }
  if (blocker.key === 'score_low' || blocker.key === 'score_gap') {
    return {
      key: 'improve-score',
      label: 'Ameliorer le score KIRA',
      impact: blocker.key === 'score_low' ? 'high' : 'medium',
      route: '/driver/score',
      explanation: blocker.label,
    };
  }
  if (blocker.key === 'payment_rate') {
    return {
      key: 'on-time-payments',
      label: 'Payer a temps les prochaines factures',
      impact: 'medium',
      route: '/driver/factures',
      explanation: blocker.label,
    };
  }
  if (blocker.key === 'history') {
    return {
      key: 'build-history',
      label: 'Construire plus d historique',
      impact: 'medium',
      route: '/driver/rental',
      explanation: blocker.label,
    };
  }
  if (blocker.key === 'vehicle') {
    return {
      key: 'vehicle-assignment',
      label: 'Maintenir une affectation vehicule',
      impact: 'medium',
      route: '/driver/vehicles',
      explanation: blocker.label,
    };
  }
  if (blocker.key === 'wallet_negative') {
    return {
      key: 'wallet-health',
      label: 'Retablir le solde KiraPay',
      impact: 'high',
      route: '/driver/portefeuille',
      explanation: blocker.label,
    };
  }
  return {
    key: blocker.key,
    label: blocker.label,
    impact: blocker.severity === 'critical' ? 'high' : 'medium',
    route: '/journey/eligibility',
    explanation: blocker.label,
  };
}

function buildJourneyActions(profile: GrowthDriverProfile): DriverJourneyAction[] {
  const blockerActions = [...profile.blockers]
    .sort((a, b) => {
      const severityRank: Record<GrowthBlockerSeverity, number> = { critical: 0, warning: 1, info: 2 };
      return severityRank[a.severity] - severityRank[b.severity] || a.label.localeCompare(b.label);
    })
    .map(actionFromBlocker);
  const unique = new Map<string, DriverJourneyAction>();
  for (const action of blockerActions) {
    if (!unique.has(action.key)) unique.set(action.key, action);
  }
  if (unique.size === 0 && profile.currentApplication) {
    unique.set('track-application', {
      key: 'track-application',
      label: 'Suivre votre demande',
      impact: 'high',
      route: '/journey/application',
      explanation: 'Une demande existe dans les donnees KIRA.',
    });
  }
  if (unique.size === 0) {
    unique.set('maintain-trust', {
      key: 'maintain-trust',
      label: 'Maintenir les bons comportements',
      impact: 'low',
      route: '/journey/eligibility',
      explanation: 'Continuez les paiements a temps, les controles et les documents a jour.',
    });
  }
  return [...unique.values()].slice(0, 3);
}

function applicationStageKey(stage: GrowthOwnershipPipelineStage | null): string | null {
  switch (stage) {
    case 'Application Started':
      return 'started';
    case 'Submitted':
      return 'submitted';
    case 'Under Review':
      return 'risk-review';
    case 'Approved':
      return 'approved';
    case 'Awaiting Down Payment':
      return 'awaiting-down-payment';
    case 'Awaiting Contract':
      return 'awaiting-contract';
    case 'Awaiting Vehicle':
      return 'awaiting-vehicle';
    case 'Ready For Activation':
      return 'ready';
    case 'Ownership Active':
      return 'ownership-active';
    default:
      return null;
  }
}

function buildApplicationTracker(profile: GrowthDriverProfile): DriverJourneyApplicationStage[] {
  const currentKey = applicationStageKey(profile.ownershipPipelineStage);
  const currentIndex = currentKey ? DRIVER_APPLICATION_STAGES.findIndex((stage) => stage.key === currentKey) : -1;
  return DRIVER_APPLICATION_STAGES.map((stage, index) => ({
    ...stage,
    status: currentIndex === -1 ? 'locked' : index < currentIndex ? 'completed' : index === currentIndex ? 'current' : 'locked',
  }));
}

function buildJourneyDocuments(profile: GrowthDriverProfile): DriverJourneyDocument[] {
  const kycBlocked = profile.blockers.some((blocker) => blocker.key === 'kyc');
  const applicationStarted = Boolean(profile.currentApplication);
  const waitingCopy = applicationStarted
    ? 'Document attendu pour la revue du dossier.'
    : 'Ce document sera demande lorsqu une vraie demande sera ouverte.';

  return [
    {
      key: 'national-id',
      label: 'National ID',
      status: kycBlocked ? 'Missing' : 'Approved',
      explanation: kycBlocked ? 'Votre identite doit etre verifiee.' : 'Identite verifiee dans KIRA.',
      rejectionReason: null,
    },
    {
      key: 'driver-license',
      label: 'Driver License',
      status: applicationStarted ? 'Missing' : 'Missing',
      explanation: waitingCopy,
      rejectionReason: null,
    },
    {
      key: 'proof-residence',
      label: 'Proof of Residence',
      status: applicationStarted ? 'Missing' : 'Missing',
      explanation: waitingCopy,
      rejectionReason: null,
    },
    {
      key: 'income-verification',
      label: 'Income Verification',
      status: applicationStarted ? 'Missing' : 'Missing',
      explanation: waitingCopy,
      rejectionReason: profile.currentApplication?.status === 'rejected'
        ? profile.currentApplication.rejection_reason ?? 'La raison de rejet doit etre expliquee par KIRA.'
        : null,
    },
  ];
}

function buildJourneyOpportunities(
  profile: GrowthDriverProfile,
  requirements: DriverJourneyRequirement[],
  actions: DriverJourneyAction[],
): DriverJourneyOpportunity[] {
  const ownershipOffer = profile.offers.find((offer) => offer.offerType === 'car_loan') ?? profile.offers[0] ?? null;
  if (!ownershipOffer) return [];

  const isPublishedOffer = ownershipOffer.offerStatus === 'ACTIVE'
    && ownershipOffer.driverOfferState === 'AVAILABLE'
    && ownershipOffer.eligible;
  const inProgress = Boolean(profile.currentApplication);
  const completed = ['ACTIVE_OWNERSHIP_PATH', 'COMPLETED'].includes(profile.eligibilityState);
  const requirementsMissing = requirements.filter((requirement) => requirement.status !== 'met');
  const status: DriverJourneyOpportunityStatus = completed
    ? 'Completed'
    : inProgress
      ? 'In Progress'
      : isPublishedOffer
        ? 'Available'
        : requirementsMissing.length <= 2
          ? 'Almost Ready'
          : 'Locked';

  const primaryMissing = requirementsMissing[0];
  const scoreRemaining = ownershipOffer.gaps.score > 0 ? `${ownershipOffer.gaps.score} point(s)` : null;
  const historyRemaining = ownershipOffer.gaps.weeks > 0 ? `${ownershipOffer.gaps.weeks} semaine(s)` : null;
  const paymentRemaining = ownershipOffer.gaps.onTimeRate > 0 ? `${ownershipOffer.gaps.onTimeRate}% de taux paiement` : null;
  const remaining = [scoreRemaining, historyRemaining, paymentRemaining]
    .filter(Boolean)
    .join(', ') || primaryMissing?.target || 'Aucune condition restante visible';

  return [
    {
      id: 'vehicle-ownership-program',
      name: 'Vehicle Ownership Program',
      status,
      eligibilityLevel: profile.lifecycleStage,
      benefits: [
        'Comprendre le chemin vers la propriete',
        'Voir les conditions restantes',
        'Preparer les documents avant revue',
      ],
      requirements,
      expiration: null,
      reason: isPublishedOffer
        ? 'Une offre publiee et active existe dans les donnees.'
        : primaryMissing?.explanation ?? 'Aucune offre publiee n existe encore pour ce conducteur.',
      remaining,
      recommendedActions: actions,
      isPublishedOffer,
      canStartApplication: isPublishedOffer && ['ELIGIBLE_FOR_REVIEW', 'OFFER_PUBLISHED', 'OFFER_READY'].includes(profile.eligibilityState),
      detailRoute: '/journey/opportunities/vehicle-ownership-program',
      disclaimer: 'Readiness only. This is not a published offer and does not represent approval.',
      financialExpectations: {
        totalAmount: ownershipOffer.terms.amount,
        downPayment: ownershipOffer.terms.downPayment,
        estimatedMonthlyObligation: ownershipOffer.terms.dailyPayment * 30,
        currency: 'FCFA',
      },
      timeline: ownershipOffer.terms.termMonths > 0
        ? `${ownershipOffer.terms.termMonths} mois indicatifs apres approbation reelle`
        : 'Timeline disponible apres offre publiee',
    },
  ];
}

function buildJourneyAchievements(profile: GrowthDriverProfile): DriverJourneyAchievement[] {
  const trustedIndex = GROWTH_STAGE_ORDER.indexOf('Trusted Driver');
  const currentIndex = GROWTH_STAGE_ORDER.indexOf(profile.lifecycleStage);
  return [
    {
      key: 'kyc-completed',
      label: 'KYC Completed',
      achieved: !profile.blockers.some((blocker) => blocker.key === 'kyc'),
      evidence: 'Statut KYC du profil conducteur.',
    },
    {
      key: 'score-above-700',
      label: 'Score Above 700',
      achieved: (profile.score ?? 0) >= 700,
      evidence: profile.score == null ? 'Aucun score disponible.' : `Score courant ${profile.score}.`,
    },
    {
      key: 'trusted-driver',
      label: 'Trusted Driver',
      achieved: currentIndex >= trustedIndex,
      evidence: `Etape actuelle: ${profile.lifecycleStage}.`,
    },
    {
      key: 'ownership-eligible',
      label: 'Ownership Eligible',
      achieved: ['ELIGIBLE_FOR_REVIEW', 'OFFER_READY', 'OFFER_PUBLISHED'].includes(profile.eligibilityState),
      evidence: `Etat eligibility: ${profile.eligibilityState}.`,
    },
    {
      key: 'vehicle-owner',
      label: 'Vehicle Owner',
      achieved: ['Vehicle Owner', 'Fleet Entrepreneur'].includes(profile.lifecycleStage),
      evidence: profile.ownershipContract ? 'Contrat rent-to-own present.' : 'Aucun contrat actif confirme.',
    },
    {
      key: 'fleet-entrepreneur',
      label: 'Fleet Entrepreneur',
      achieved: profile.lifecycleStage === 'Fleet Entrepreneur',
      evidence: 'Etape future confirmee uniquement par donnees persistantes.',
    },
  ];
}

function buildJourneyMilestones(profile: GrowthDriverProfile, today: string): DriverJourneyMilestone[] {
  const eligible = ['ELIGIBLE_FOR_REVIEW', 'OFFER_READY', 'OFFER_PUBLISHED'].includes(profile.eligibilityState);
  const applicationSubmitted = ['APPLICATION_SUBMITTED', 'APPLICATION_APPROVED', 'ACTIVATION_PENDING', 'ACTIVE_OWNERSHIP_PATH', 'COMPLETED'].includes(profile.eligibilityState);
  return [
    {
      key: 'first-rental',
      label: 'First Rental',
      achieved: Boolean(profile.firstRentalDate),
      date: profile.firstRentalDate,
      explanation: profile.firstRentalDate ? 'Premiere location enregistree.' : 'Aucune premiere location confirmee dans les donnees.',
    },
    {
      key: 'thirty-days-active',
      label: '30 Days Active',
      achieved: daysBetween(profile.createdAt, today) >= 30,
      date: profile.createdAt,
      explanation: 'Base sur la date de creation du profil conducteur.',
    },
    {
      key: 'one-hundred-paid',
      label: '100 Invoices Paid',
      achieved: profile.paidPaymentCount >= 100,
      date: null,
      explanation: `${profile.paidPaymentCount} paiement(s) confirme(s).`,
    },
    {
      key: 'eligible-ownership',
      label: 'Eligible For Ownership',
      achieved: eligible,
      date: eligible ? profile.projectedEligibilityDate ?? new Date().toISOString().slice(0, 10) : null,
      explanation: eligible ? 'Le dossier peut etre revu.' : 'Les conditions restantes sont visibles dans eligibility.',
    },
    {
      key: 'application-submitted',
      label: 'Application Submitted',
      achieved: applicationSubmitted,
      date: profile.applicationDate,
      explanation: applicationSubmitted ? 'Demande soumise dans les donnees.' : 'Aucune demande soumise.',
    },
    {
      key: 'ownership-activated',
      label: 'Ownership Activated',
      achieved: ['ACTIVE_OWNERSHIP_PATH', 'COMPLETED'].includes(profile.eligibilityState),
      date: profile.ownershipContract?.start_date ?? null,
      explanation: 'Visible uniquement apres contrat/activation reels.',
    },
  ];
}

function buildRoadmap(profile: GrowthDriverProfile): DriverJourneyStage[] {
  const currentIndex = GROWTH_STAGE_ORDER.indexOf(profile.lifecycleStage);
  return GROWTH_STAGE_ORDER.map((stage, index) => {
    const copy = JOURNEY_STAGE_COPY[stage];
    return {
      stage,
      ...copy,
      status: index < currentIndex ? 'completed' : index === currentIndex ? 'current' : 'locked',
    };
  });
}

export function buildDriverJourney(profile: GrowthDriverProfile, today = new Date().toISOString().slice(0, 10)): DriverJourneySummary {
  const requirements = buildJourneyRequirements(profile);
  const requirementsMet = requirements.filter((requirement) => requirement.status === 'met');
  const requirementsMissing = requirements.filter((requirement) => requirement.status === 'missing');
  const requirementsInProgress = requirements.filter((requirement) => requirement.status === 'in_progress');
  const nextActions = buildJourneyActions(profile);
  const opportunities = buildJourneyOpportunities(profile, requirements, nextActions);
  const eligibilityState = eligibilityDisplayState(profile.eligibilityState);
  const ownershipOpportunity = opportunities[0];
  const downPaymentRequired = ownershipOpportunity?.financialExpectations.downPayment ?? 0;
  const saved = Math.max(0, profile.walletBalance);
  const currentStageCopy = JOURNEY_STAGE_COPY[profile.lifecycleStage];

  return {
    currentStage: profile.lifecycleStage,
    currentStageLabel: currentStageCopy.label,
    currentStageDescription: currentStageCopy.description,
    nextStage: profile.nextStage,
    progress: profile.growthProgress,
    roadmap: buildRoadmap(profile),
    eligibility: {
      state: eligibilityState,
      explanation: eligibilityExplanation(profile, eligibilityState),
      requirementsMet,
      requirementsMissing,
      requirementsInProgress,
    },
    nextActions,
    opportunities,
    activeOpportunityCount: opportunities.filter((opportunity) => opportunity.status === 'Available').length,
    applicationTracker: buildApplicationTracker(profile),
    documents: buildJourneyDocuments(profile),
    downPaymentReadiness: {
      required: downPaymentRequired,
      saved,
      remaining: Math.max(0, downPaymentRequired - saved),
      estimatedCompletionDate: saved >= downPaymentRequired && downPaymentRequired > 0 ? today : null,
    },
    achievements: buildJourneyAchievements(profile),
    milestones: buildJourneyMilestones(profile, today),
    simulatorDisclaimer: 'Simulation only. Does not represent approval. Does not guarantee financing.',
    activationVisible: profile.ownershipPipelineStage === 'Ready For Activation',
    activationReason: profile.ownershipPipelineStage === 'Ready For Activation'
      ? 'Application approved, down payment received, contract signed, and vehicle assigned.'
      : 'Activation appears only after real approval, down payment, signed contract, and vehicle assignment.',
  };
}

function percent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function buildGrowthFunnel(profiles: GrowthDriverProfile[]): GrowthFunnelStage[] {
  const stageCount = (predicate: (profile: GrowthDriverProfile) => boolean) => profiles.filter(predicate).length;
  return [
    {
      key: 'verified',
      label: 'Verified Driver',
      count: stageCount((profile) => ['Verified', 'Trusted', 'Almost Eligible', 'Eligible', 'Offer Published', 'Application Started', 'Submitted', 'Approved', 'Ownership Active', 'Fleet Entrepreneur'].includes(profile.pipelineStage)),
      route: '/admin/growth/pipeline?stage=Verified',
    },
    {
      key: 'trusted',
      label: 'Trusted Driver',
      count: stageCount((profile) => ['Trusted', 'Almost Eligible', 'Eligible', 'Offer Published', 'Application Started', 'Submitted', 'Approved', 'Ownership Active', 'Fleet Entrepreneur'].includes(profile.pipelineStage)),
      route: '/admin/growth/pipeline?stage=Trusted',
    },
    {
      key: 'eligible',
      label: 'Eligible',
      count: stageCount((profile) => ['Eligible', 'Offer Published', 'Application Started', 'Submitted', 'Approved', 'Ownership Active', 'Fleet Entrepreneur'].includes(profile.pipelineStage)),
      route: '/admin/growth/pipeline?stage=Eligible',
    },
    {
      key: 'offer-published',
      label: 'Offer Published',
      count: 0,
      route: '/admin/growth/offers',
    },
    {
      key: 'application-started',
      label: 'Application Started',
      count: stageCount((profile) => profile.pipelineStage === 'Application Started'),
      route: '/admin/growth/ownership?stage=Application%20Started',
    },
    {
      key: 'application-submitted',
      label: 'Application Submitted',
      count: stageCount((profile) => profile.pipelineStage === 'Submitted'),
      route: '/admin/growth/ownership?stage=Submitted',
    },
    {
      key: 'approved',
      label: 'Approved',
      count: stageCount((profile) => profile.pipelineStage === 'Approved'),
      route: '/admin/growth/ownership?stage=Approved',
    },
    {
      key: 'ownership-active',
      label: 'Ownership Active',
      count: stageCount((profile) => ['Ownership Active', 'Fleet Entrepreneur'].includes(profile.pipelineStage)),
      route: '/admin/growth/ownership?stage=Ownership%20Active',
    },
  ];
}

function buildTopBlockers(profiles: GrowthDriverProfile[]): GrowthBlockerSummary[] {
  const byKey = new Map<string, GrowthBlockerSummary>();
  for (const profile of profiles) {
    for (const blocker of profile.blockers) {
      const key = `${blocker.source}:${blocker.key}`;
      const current = byKey.get(key);
      if (current) {
        current.count += 1;
      } else {
        byKey.set(key, {
          key: blocker.key,
          label: blocker.label,
          source: blocker.source,
          severity: blocker.severity,
          count: 1,
          route: `/admin/growth/pipeline?blocker=${encodeURIComponent(blocker.key)}`,
        });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 8);
}

function buildPriorityQueue(profiles: GrowthDriverProfile[]): GrowthPriorityQueueItem[] {
  const eligible = profiles.filter((profile) => ['ELIGIBLE_FOR_REVIEW', 'OFFER_READY'].includes(profile.eligibilityState)).length;
  const lostEligibility = profiles.filter((profile) => profile.blockers.some((blocker) => blocker.severity === 'critical')).length;
  const awaitingReview = profiles.filter((profile) => ['Submitted', 'Application Started'].includes(profile.pipelineStage)).length;
  const awaitingDownPayment = profiles.filter((profile) => profile.pipelineStage === 'Approved').length;
  const stalledApplications = profiles.filter((profile) => profile.slaFlags.some((flag) => flag.includes('stuck'))).length;

  return [
    { key: 'eligible-now', label: 'Drivers ready for eligibility review', count: eligible, priority: eligible > 0 ? 'high' : 'low', route: '/admin/growth/reviews?recommendation=Approve' },
    { key: 'lost-eligibility', label: 'Drivers blocked from eligibility', count: lostEligibility, priority: lostEligibility > 0 ? 'high' : 'low', route: '/admin/growth/pipeline?filter=blocked' },
    { key: 'offers-expiring', label: 'Offers expiring soon', count: 0, priority: 'low', route: '/admin/growth/offers' },
    { key: 'applications-awaiting-review', label: 'Applications awaiting review', count: awaitingReview, priority: awaitingReview > 0 ? 'medium' : 'low', route: '/admin/growth/ownership' },
    { key: 'applications-awaiting-down-payment', label: 'Applications awaiting down payment', count: awaitingDownPayment, priority: awaitingDownPayment > 0 ? 'medium' : 'low', route: '/admin/growth/ownership?stage=Approved' },
    { key: 'applications-stalled', label: 'Applications stalled past SLA', count: stalledApplications, priority: stalledApplications > 0 ? 'high' : 'low', route: '/admin/growth/ownership?sla=stalled' },
  ];
}

function buildGrowthAnalytics(input: {
  profiles: GrowthDriverProfile[];
  growthFunnel: GrowthFunnelStage[];
  topBlockers: GrowthBlockerSummary[];
  eligibleDrivers: number;
  applicationsSubmitted: number;
  applicationsApproved: number;
  ownershipActive: number;
  fleetEntrepreneurs: number;
}): GrowthAnalytics {
  const totalDrivers = input.profiles.length;
  const joinMonthCounts = new Map<string, number>();
  const scoreBandCounts = new Map<string, number>();
  const vehicleCounts = new Map<string, number>();
  for (const profile of input.profiles) {
    const joinMonth = profile.createdAt?.slice(0, 7) ?? 'Unknown';
    joinMonthCounts.set(joinMonth, (joinMonthCounts.get(joinMonth) ?? 0) + 1);

    const score = profile.score ?? 0;
    const band = score >= 850 ? '850+' : score >= 700 ? '700-849' : score >= 600 ? '600-699' : 'Below 600';
    scoreBandCounts.set(band, (scoreBandCounts.get(band) ?? 0) + 1);

    const vehicleBucket = profile.currentVehicleLabel ? 'Assigned vehicle' : 'No active vehicle';
    vehicleCounts.set(vehicleBucket, (vehicleCounts.get(vehicleBucket) ?? 0) + 1);
  }

  return {
    eligibleGrowthRate: percent(input.eligibleDrivers, totalDrivers),
    offerAcceptanceRate: 0,
    applicationConversionRate: percent(input.applicationsSubmitted, Math.max(1, input.eligibleDrivers)),
    approvalRate: percent(input.applicationsApproved, input.applicationsSubmitted),
    ownershipActivationRate: percent(input.ownershipActive, input.applicationsApproved),
    fleetEntrepreneurRate: percent(input.fleetEntrepreneurs, input.ownershipActive),
    cohortsByJoinMonth: [...joinMonthCounts.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 6).map(([label, count]) => ({ label, count })),
    scoreBands: ['850+', '700-849', '600-699', 'Below 600'].map((label) => ({ label, count: scoreBandCounts.get(label) ?? 0 })),
    vehicleAssignment: ['Assigned vehicle', 'No active vehicle'].map((label) => ({ label, count: vehicleCounts.get(label) ?? 0 })),
    funnel: input.growthFunnel,
    riskBlockers: input.topBlockers.filter((blocker) => ['risk', 'sinistres', 'contraventions'].includes(blocker.source)),
    averageDownPayment: null,
    averageOwnershipDurationDays: null,
    revenueByOwnershipCohortAvailable: false,
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
