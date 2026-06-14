export type TrustLevel = {
  min: number;
  max: number;
  label: string;
  tone: 'red' | 'orange' | 'blue' | 'green';
};

export type CreditOffer = {
  type: 'phone_loan' | 'tv_loan' | 'bike_loan' | 'car_loan';
  title: string;
  category: 'Téléphone' | 'TV' | 'Moto' | 'Voiture';
  amount: number;
  dailyPayment: number;
  termMonths: number;
  requiredScore: number;
  requiredWeeks: number;
  requiredOnTimeRate: number;
  downPayment: number;
  commitment: string;
};

export type CreditMetrics = {
  score: number;
  weeksHistory: number;
  onTimeRate: number;
};

export type PaymentLike = {
  status?: string | null;
  due_date?: string | null;
  paid_date?: string | null;
};

export const OWNERSHIP_SCORE_TARGET = 850;
export const SCORE_RANGE_MIN = 500;
export const SCORE_RANGE_MAX = 1000;

export const TRUST_LEVELS: TrustLevel[] = [
  { min: 950, max: 1000, label: 'Elite', tone: 'green' },
  { min: 850, max: 949, label: 'Premium', tone: 'green' },
  { min: 700, max: 849, label: 'Fiable', tone: 'blue' },
  { min: 600, max: 699, label: 'En progression', tone: 'orange' },
  { min: 500, max: 599, label: 'Débutant', tone: 'red' },
];

export const CREDIT_OFFERS: CreditOffer[] = [
  {
    type: 'phone_loan',
    title: 'Téléphone Pro',
    category: 'Téléphone',
    amount: 250_000,
    dailyPayment: 8_500,
    termMonths: 12,
    requiredScore: 600,
    requiredWeeks: 3,
    requiredOnTimeRate: 80,
    downPayment: 20_000,
    commitment: 'Usage professionnel, remboursement automatique selon contrat.',
  },
  {
    type: 'tv_loan',
    title: 'TV familiale',
    category: 'TV',
    amount: 300_000,
    dailyPayment: 10_000,
    termMonths: 12,
    requiredScore: 650,
    requiredWeeks: 3,
    requiredOnTimeRate: 85,
    downPayment: 25_000,
    commitment: 'Financement équipement, suivi par l’équipe crédit DAM.',
  },
  {
    type: 'bike_loan',
    title: 'Moto Yamaha',
    category: 'Moto',
    amount: 1_000_000,
    dailyPayment: 17_000,
    termMonths: 24,
    requiredScore: 750,
    requiredWeeks: 12,
    requiredOnTimeRate: 90,
    downPayment: 100_000,
    commitment: 'Usage transport, contrôles véhicule à maintenir à jour.',
  },
  {
    type: 'car_loan',
    title: 'Suzuki Alto',
    category: 'Voiture',
    amount: 4_000_000,
    dailyPayment: 20_000,
    termMonths: 36,
    requiredScore: OWNERSHIP_SCORE_TARGET,
    requiredWeeks: 26,
    requiredOnTimeRate: 95,
    downPayment: 500_000,
    commitment: 'Parcours vers propriété, validation finale par DAM Africa.',
  },
];

export function getTrustLevelFromScore(score: number): TrustLevel {
  return TRUST_LEVELS.find((level) => score >= level.min && score <= level.max) ?? TRUST_LEVELS[TRUST_LEVELS.length - 1];
}

export function getScoreBand(score: number): TrustLevel['tone'] {
  if (score >= 850) return 'green';
  if (score >= 700) return 'blue';
  if (score >= 600) return 'orange';
  return 'red';
}

export function calculateOnTimeRate(payments: PaymentLike[]): number {
  const evaluated = payments.filter((payment) => {
    const status = payment.status ?? '';
    return ['paid', 'overpaid', 'late', 'overdue'].includes(status);
  });
  if (evaluated.length === 0) return 0;
  const onTime = evaluated.filter((payment) => ['paid', 'overpaid'].includes(payment.status ?? '')).length;
  return Math.round((onTime / evaluated.length) * 100);
}

export function calculatePaymentStreak(payments: PaymentLike[]): number {
  const sorted = [...payments]
    .filter((payment) => payment.status)
    .sort((a, b) => {
      const aTime = new Date(a.paid_date || a.due_date || 0).getTime();
      const bTime = new Date(b.paid_date || b.due_date || 0).getTime();
      return bTime - aTime;
    });

  let streak = 0;
  for (const payment of sorted) {
    if (['paid', 'overpaid'].includes(payment.status ?? '')) {
      streak += 1;
      continue;
    }
    if (['late', 'overdue'].includes(payment.status ?? '')) break;
  }
  return Math.min(streak, 52);
}

export function getEligibilityGaps(offer: CreditOffer, metrics: CreditMetrics) {
  return {
    score: Math.max(0, offer.requiredScore - metrics.score),
    weeks: Math.max(0, offer.requiredWeeks - metrics.weeksHistory),
    onTimeRate: Math.max(0, offer.requiredOnTimeRate - metrics.onTimeRate),
  };
}

export function isOfferEligible(offer: CreditOffer, metrics: CreditMetrics): boolean {
  const gaps = getEligibilityGaps(offer, metrics);
  return gaps.score === 0 && gaps.weeks === 0 && gaps.onTimeRate === 0;
}

export function getAvailableOffers(offers: CreditOffer[], metrics: CreditMetrics): CreditOffer[] {
  return offers.filter((offer) => isOfferEligible(offer, metrics));
}

export function getNextUnlock(offers: CreditOffer[], metrics: CreditMetrics): CreditOffer | null {
  const locked = offers.filter((offer) => !isOfferEligible(offer, metrics));
  if (locked.length === 0) return null;

  return [...locked].sort((a, b) => {
    const aGaps = getEligibilityGaps(a, metrics);
    const bGaps = getEligibilityGaps(b, metrics);
    const aWeight = aGaps.score + aGaps.weeks * 10 + aGaps.onTimeRate * 3;
    const bWeight = bGaps.score + bGaps.weeks * 10 + bGaps.onTimeRate * 3;
    return aWeight - bWeight;
  })[0];
}

export function calculateOwnershipProgress(score: number, target = OWNERSHIP_SCORE_TARGET): number {
  const span = Math.max(1, target - SCORE_RANGE_MIN);
  const raw = ((score - SCORE_RANGE_MIN) / span) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function calculateOwnershipSimulation(
  offer: CreditOffer,
  downPayment: number,
  termMonths: number,
  startDate = new Date(),
) {
  const safeTerm = Math.max(1, termMonths);
  const safeDownPayment = Math.max(0, Math.min(downPayment, offer.amount));
  const financedAmount = offer.amount - safeDownPayment;
  const dailyPayment = Math.ceil(financedAmount / (safeTerm * 30));
  const totalPaid = safeDownPayment + dailyPayment * safeTerm * 30;
  const ownershipDate = new Date(startDate);
  ownershipDate.setMonth(ownershipDate.getMonth() + safeTerm);

  return {
    financedAmount,
    dailyPayment,
    totalPaid,
    ownershipDate,
  };
}

export function getLoanStatusDisplay(status: string | null | undefined, rejectionReason?: string | null) {
  switch (status) {
    case 'draft':
      return { label: 'Brouillon', explanation: 'La demande n’a pas encore été envoyée.', variant: 'outline' as const };
    case 'pending':
      return { label: 'Soumise', explanation: 'Votre demande est reçue et attend l’étude DAM.', variant: 'pending' as const };
    case 'under_review':
      return { label: 'En étude', explanation: 'L’équipe crédit analyse votre score et vos paiements.', variant: 'pending' as const };
    case 'approved':
      return { label: 'Approuvée', explanation: 'Votre demande est approuvée. DAM prépare la suite.', variant: 'approved' as const };
    case 'rejected':
      return {
        label: 'Pas encore éligible',
        explanation: rejectionReason ? `Raison : ${rejectionReason}` : 'La décision est expliquée par votre score, vos paiements ou vos contrôles.',
        variant: 'rejected' as const,
      };
    case 'repaying':
      return { label: 'Convertie en prêt', explanation: 'Le financement est actif et en remboursement.', variant: 'active' as const };
    case 'completed':
      return { label: 'Terminée', explanation: 'Le financement est clôturé.', variant: 'verified' as const };
    default:
      return { label: status || 'Soumise', explanation: 'Statut en cours de synchronisation.', variant: 'outline' as const };
  }
}
