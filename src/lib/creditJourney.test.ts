import { describe, expect, it } from 'vitest';
import {
  CREDIT_OFFERS,
  calculateOnTimeRate,
  calculateOwnershipProgress,
  calculateOwnershipSimulation,
  calculatePaymentStreak,
  getAvailableOffers,
  getEligibilityGaps,
  getNextUnlock,
  getTrustLevelFromScore,
} from './creditJourney';

describe('credit journey helpers', () => {
  it('maps Part 4 score bands to the right trust levels', () => {
    expect(getTrustLevelFromScore(560).label).toBe('Débutant');
    expect(getTrustLevelFromScore(640).label).toBe('En progression');
    expect(getTrustLevelFromScore(720).label).toBe('Fiable');
    expect(getTrustLevelFromScore(880).label).toBe('Premium');
    expect(getTrustLevelFromScore(960).label).toBe('Elite');
  });

  it('computes payment rate and stops streak on a late payment', () => {
    const payments = [
      { status: 'paid', due_date: '2026-06-07', paid_date: '2026-06-07' },
      { status: 'overpaid', due_date: '2026-05-31', paid_date: '2026-05-31' },
      { status: 'late', due_date: '2026-05-24', paid_date: '2026-05-26' },
      { status: 'paid', due_date: '2026-05-17', paid_date: '2026-05-17' },
    ];

    expect(calculateOnTimeRate(payments)).toBe(75);
    expect(calculatePaymentStreak(payments)).toBe(2);
  });

  it('shows only eligible offers and chooses the nearest unlock', () => {
    const metrics = { score: 720, weeksHistory: 18, onTimeRate: 87 };

    expect(getAvailableOffers(CREDIT_OFFERS, metrics).map((offer) => offer.category)).toEqual(['Téléphone', 'TV']);

    const next = getNextUnlock(CREDIT_OFFERS, metrics);
    expect(next?.category).toBe('Moto');
    expect(getEligibilityGaps(next!, metrics)).toEqual({
      score: 30,
      weeks: 0,
      onTimeRate: 3,
    });
  });

  it('calculates ownership progress from the 500 point floor to the 850 target', () => {
    expect(calculateOwnershipProgress(500)).toBe(0);
    expect(calculateOwnershipProgress(675)).toBe(50);
    expect(calculateOwnershipProgress(850)).toBe(100);
  });

  it('simulates daily payment and ownership date from real offer terms', () => {
    const car = CREDIT_OFFERS.find((offer) => offer.type === 'car_loan')!;
    const result = calculateOwnershipSimulation(car, 500_000, 36, new Date('2026-06-14T12:00:00Z'));

    expect(result.financedAmount).toBe(3_500_000);
    expect(result.dailyPayment).toBe(3241);
    expect(result.totalPaid).toBe(4_000_280);
    expect(result.ownershipDate.toISOString().slice(0, 10)).toBe('2029-06-14');
  });
});
