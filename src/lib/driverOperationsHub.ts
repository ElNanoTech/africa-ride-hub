import {
  CREDIT_OFFERS,
  OWNERSHIP_SCORE_TARGET,
  calculateOnTimeRate,
  calculateOwnershipProgress,
  getAvailableOffers,
  getEligibilityGaps,
  getNextUnlock,
  getTrustLevelFromScore,
  type CreditMetrics,
  type PaymentLike,
} from './creditJourney';
import type { DriverRiskLevel } from './driverRisk';

export type HealthTone = 'healthy' | 'watch' | 'danger' | 'neutral';

export interface HealthCard {
  key: 'payments' | 'kyc' | 'fleet_control' | 'vehicle' | 'credit' | 'risk';
  label: string;
  state: string;
  detail: string;
  tone: HealthTone;
}

export interface DriverHealthInput {
  overduePayments: number;
  unpaidInvoices: number;
  kycStatus: string | null | undefined;
  fleetControlState: 'ok' | 'due_soon' | 'submitted' | 'late' | 'blocked' | 'rejected' | 'none' | 'unknown';
  hasVehicle: boolean;
  hasActiveRental: boolean;
  eligibleOfferCount: number;
  nextOfferCategory: string | null;
  riskLevel: DriverRiskLevel | null | undefined;
}

export interface LifecycleState {
  stage: string;
  nextStage: string;
  progress: number;
  pointsRemaining: number;
  weeksHistory: number;
  trustLevel: string;
}

export interface OwnershipReadiness {
  metrics: CreditMetrics;
  eligibleCategories: string[];
  nextCategory: string | null;
  vehicleScoreGap: number;
  vehicleWeeksGap: number;
  vehiclePaymentRateGap: number;
  progress: number;
}

const RISK_TONE: Record<DriverRiskLevel, HealthTone> = {
  bon: 'healthy',
  moyen: 'watch',
  eleve: 'danger',
  critique: 'danger',
};

const RISK_LABEL: Record<DriverRiskLevel, string> = {
  bon: 'Bon',
  moyen: 'Modere',
  eleve: 'Eleve',
  critique: 'Critique',
};

export function buildDriverHealthCards(input: DriverHealthInput): HealthCard[] {
  const kycVerified = input.kycStatus === 'verified';
  const kycPending = input.kycStatus === 'pending';

  return [
    {
      key: 'payments',
      label: 'Payments',
      state: input.overduePayments > 0 ? 'A traiter' : 'Healthy',
      detail: input.overduePayments > 0
        ? `${input.overduePayments} paiement(s) en retard`
        : input.unpaidInvoices > 0
          ? `${input.unpaidInvoices} facture(s) ouverte(s)`
          : 'Aucun retard detecte',
      tone: input.overduePayments > 0 ? 'danger' : input.unpaidInvoices > 0 ? 'watch' : 'healthy',
    },
    {
      key: 'kyc',
      label: 'KYC',
      state: kycVerified ? 'Verified' : kycPending ? 'A verifier' : 'Incomplet',
      detail: kycVerified ? 'Identite validee' : kycPending ? 'Soumission en attente' : 'Verification requise',
      tone: kycVerified ? 'healthy' : kycPending ? 'watch' : 'danger',
    },
    {
      key: 'fleet_control',
      label: 'Fleet Control',
      state: fleetControlLabel(input.fleetControlState),
      detail: fleetControlDetail(input.fleetControlState),
      tone: fleetControlTone(input.fleetControlState),
    },
    {
      key: 'vehicle',
      label: 'Vehicle',
      state: input.hasVehicle ? 'Assigne' : 'Non assigne',
      detail: input.hasActiveRental ? 'Location active' : input.hasVehicle ? 'Vehicule affecte' : 'Aucun vehicule actif',
      tone: input.hasVehicle ? 'healthy' : 'watch',
    },
    {
      key: 'credit',
      label: 'Credit',
      state: input.eligibleOfferCount > 0 ? 'Eligible' : 'En construction',
      detail: input.eligibleOfferCount > 0
        ? `${input.eligibleOfferCount} offre(s) disponible(s)`
        : input.nextOfferCategory
          ? `Prochain palier: ${input.nextOfferCategory}`
          : 'Donnees insuffisantes',
      tone: input.eligibleOfferCount > 0 ? 'healthy' : 'watch',
    },
    {
      key: 'risk',
      label: 'Risk',
      state: input.riskLevel ? RISK_LABEL[input.riskLevel] : 'Non calcule',
      detail: input.riskLevel ? 'Explique dans le panneau risque' : 'RPC risque indisponible',
      tone: input.riskLevel ? RISK_TONE[input.riskLevel] : 'neutral',
    },
  ];
}

function fleetControlLabel(state: DriverHealthInput['fleetControlState']) {
  switch (state) {
    case 'ok':
      return 'Healthy';
    case 'due_soon':
      return 'Due Soon';
    case 'submitted':
      return 'A valider';
    case 'late':
      return 'En retard';
    case 'blocked':
      return 'Bloque';
    case 'rejected':
      return 'A corriger';
    case 'none':
      return 'Aucun controle';
    default:
      return 'Non disponible';
  }
}

function fleetControlDetail(state: DriverHealthInput['fleetControlState']) {
  switch (state) {
    case 'ok':
      return 'Controle a jour';
    case 'due_soon':
      return 'Echeance proche';
    case 'submitted':
      return 'Soumis par le chauffeur';
    case 'late':
      return 'Action admin requise';
    case 'blocked':
      return 'Vehicule immobilise ou bloque';
    case 'rejected':
      return 'Correction chauffeur requise';
    case 'none':
      return 'Pas de cycle actif';
    default:
      return 'Donnees non disponibles';
  }
}

function fleetControlTone(state: DriverHealthInput['fleetControlState']): HealthTone {
  if (['late', 'blocked', 'rejected'].includes(state)) return 'danger';
  if (['due_soon', 'submitted', 'none', 'unknown'].includes(state)) return 'watch';
  return 'healthy';
}

export function buildLifecycleState(score: number | null | undefined, weeksHistory: number): LifecycleState {
  const safeScore = score ?? 0;
  const trustLevel = score === null || score === undefined ? 'Non calcule' : getTrustLevelFromScore(safeScore).label;
  const progress = score === null || score === undefined ? 0 : calculateOwnershipProgress(safeScore);
  const pointsRemaining = score === null || score === undefined
    ? OWNERSHIP_SCORE_TARGET
    : Math.max(0, OWNERSHIP_SCORE_TARGET - safeScore);

  if (score === null || score === undefined) {
    return {
      stage: 'Profil a completer',
      nextStage: 'Score initial',
      progress,
      pointsRemaining,
      weeksHistory,
      trustLevel,
    };
  }

  if (safeScore >= OWNERSHIP_SCORE_TARGET) {
    return {
      stage: 'Ownership Eligible',
      nextStage: 'Validation finale DAM',
      progress,
      pointsRemaining,
      weeksHistory,
      trustLevel,
    };
  }

  if (safeScore >= 700) {
    return {
      stage: 'Trusted Driver',
      nextStage: 'Ownership Eligible',
      progress,
      pointsRemaining,
      weeksHistory,
      trustLevel,
    };
  }

  if (safeScore >= 600) {
    return {
      stage: 'Reliable Driver',
      nextStage: 'Trusted Driver',
      progress,
      pointsRemaining,
      weeksHistory,
      trustLevel,
    };
  }

  return {
    stage: 'Building Trust',
    nextStage: 'Reliable Driver',
    progress,
    pointsRemaining,
    weeksHistory,
    trustLevel,
  };
}

export function buildOwnershipReadiness(params: {
  score: number | null | undefined;
  weeksHistory: number;
  payments: PaymentLike[];
}): OwnershipReadiness {
  const metrics: CreditMetrics = {
    score: params.score ?? 0,
    weeksHistory: params.weeksHistory,
    onTimeRate: calculateOnTimeRate(params.payments),
  };
  const available = getAvailableOffers(CREDIT_OFFERS, metrics);
  const next = getNextUnlock(CREDIT_OFFERS, metrics);
  const vehicle = CREDIT_OFFERS.find((offer) => offer.type === 'car_loan');
  const vehicleGaps = vehicle ? getEligibilityGaps(vehicle, metrics) : { score: 0, weeks: 0, onTimeRate: 0 };

  return {
    metrics,
    eligibleCategories: available.map((offer) => offer.category),
    nextCategory: next?.category ?? null,
    vehicleScoreGap: vehicleGaps.score,
    vehicleWeeksGap: vehicleGaps.weeks,
    vehiclePaymentRateGap: vehicleGaps.onTimeRate,
    progress: calculateOwnershipProgress(metrics.score),
  };
}
