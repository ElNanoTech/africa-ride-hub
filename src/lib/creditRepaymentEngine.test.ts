import { describe, expect, it } from 'vitest';
import {
  buildRepaymentObligationPlan,
  driverRepaymentStatusLabel,
  repaymentDueDate,
  summarizeRepaymentPlan,
} from './creditRepaymentEngine';

describe('Layer 3D repayment engine', () => {
  it('builds exact integer fixed-installment obligations', () => {
    const plan = buildRepaymentObligationPlan({
      scheduleType: 'FIXED_INSTALLMENT',
      frequency: 'MONTHLY',
      termCount: 3,
      financedAmount: 1000,
      totalRepaymentAmount: 1111,
      interestAmount: 60,
      firstDueDate: '2026-07-16',
    });

    expect(plan).toHaveLength(3);
    expect(plan.map((row) => row.dueDate)).toEqual(['2026-07-16', '2026-08-16', '2026-09-16']);
    expect(summarizeRepaymentPlan(plan)).toEqual({
      amount: 1111,
      principalAmount: 1000,
      interestAmount: 60,
      feeAmount: 51,
    });
  });

  it('forces zero-interest schedules to keep all margin as fees', () => {
    const plan = buildRepaymentObligationPlan({
      scheduleType: 'ZERO_INTEREST_INSTALLMENT',
      frequency: 'MONTHLY',
      termCount: 2,
      financedAmount: 500,
      totalRepaymentAmount: 550,
      interestAmount: 25,
      firstDueDate: '2026-07-31',
    });

    expect(summarizeRepaymentPlan(plan)).toMatchObject({
      amount: 550,
      principalAmount: 500,
      interestAmount: 0,
      feeAmount: 50,
    });
    expect(plan[1].dueDate).toBe('2026-08-31');
  });

  it('supports one-time payment schedules', () => {
    const plan = buildRepaymentObligationPlan({
      scheduleType: 'ONE_TIME_PAYMENT',
      frequency: 'ONE_TIME',
      termCount: 99,
      financedAmount: 250000,
      firstDueDate: '2026-07-01',
    });

    expect(plan).toEqual([{
      sequenceNumber: 1,
      dueDate: '2026-07-01',
      amount: 250000,
      principalAmount: 250000,
      interestAmount: 0,
      feeAmount: 0,
      obligationType: 'FINAL_PAYMENT',
    }]);
  });

  it('clamps monthly due dates at month end', () => {
    expect(repaymentDueDate('2026-01-31', 'MONTHLY', 2)).toBe('2026-02-28');
    expect(repaymentDueDate('2026-01-31', 'MONTHLY', 3)).toBe('2026-03-31');
  });

  it('keeps driver status labels human-readable', () => {
    expect(driverRepaymentStatusLabel('ACTIVE')).toBe('Calendrier actif');
    expect(driverRepaymentStatusLabel('OVERDUE')).toBe('En retard');
  });
});
