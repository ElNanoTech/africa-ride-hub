import { describe, expect, it } from 'vitest';
import {
  buildDriverHealthCards,
  buildLifecycleState,
  buildOwnershipReadiness,
} from './driverOperationsHub';

describe('driver operations hub helpers', () => {
  it('builds action-oriented health cards from live-state inputs', () => {
    const cards = buildDriverHealthCards({
      overduePayments: 2,
      unpaidInvoices: 3,
      kycStatus: 'pending',
      fleetControlState: 'due_soon',
      hasVehicle: true,
      hasActiveRental: true,
      eligibleOfferCount: 1,
      nextOfferCategory: 'Moto',
      riskLevel: 'moyen',
    });

    expect(cards.find((card) => card.key === 'payments')).toMatchObject({
      state: 'A traiter',
      tone: 'danger',
    });
    expect(cards.find((card) => card.key === 'kyc')).toMatchObject({
      state: 'A verifier',
      tone: 'watch',
    });
    expect(cards.find((card) => card.key === 'credit')).toMatchObject({
      state: 'Eligible',
      tone: 'healthy',
    });
  });

  it('maps score into lifecycle stages and ownership progress', () => {
    expect(buildLifecycleState(null, 0)).toMatchObject({
      stage: 'Profil a completer',
      nextStage: 'Score initial',
      progress: 0,
    });

    expect(buildLifecycleState(720, 18)).toMatchObject({
      stage: 'Trusted Driver',
      nextStage: 'Ownership Eligible',
      pointsRemaining: 130,
      trustLevel: 'Fiable',
    });

    expect(buildLifecycleState(870, 30)).toMatchObject({
      stage: 'Ownership Eligible',
      progress: 100,
      pointsRemaining: 0,
    });
  });

  it('summarizes ownership readiness without inventing offers', () => {
    const readiness = buildOwnershipReadiness({
      score: 720,
      weeksHistory: 18,
      payments: [
        { status: 'paid', due_date: '2026-06-01', paid_date: '2026-06-01' },
        { status: 'paid', due_date: '2026-05-25', paid_date: '2026-05-25' },
        { status: 'paid', due_date: '2026-05-18', paid_date: '2026-05-18' },
        { status: 'paid', due_date: '2026-05-11', paid_date: '2026-05-11' },
        { status: 'paid', due_date: '2026-05-04', paid_date: '2026-05-04' },
        { status: 'paid', due_date: '2026-04-27', paid_date: '2026-04-27' },
        { status: 'paid', due_date: '2026-04-20', paid_date: '2026-04-20' },
        { status: 'paid', due_date: '2026-04-13', paid_date: '2026-04-13' },
        { status: 'overdue', due_date: '2026-04-06' },
      ],
    });

    expect(readiness.eligibleCategories).toEqual(['Téléphone', 'TV']);
    expect(readiness.nextCategory).toBe('Moto');
    expect(readiness.vehicleScoreGap).toBe(130);
    expect(readiness.vehicleWeeksGap).toBe(8);
    expect(readiness.vehiclePaymentRateGap).toBe(6);
  });
});
