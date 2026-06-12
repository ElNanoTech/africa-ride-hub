import { describe, it, expect } from 'vitest';
import { isPaymentOverdue, todayDateString } from './payments';

const TODAY = '2026-06-12';

describe('isPaymentOverdue', () => {
  it('explicit overdue status is always overdue (even with a future due date)', () => {
    expect(isPaymentOverdue({ status: 'overdue', due_date: '2099-01-01' }, TODAY)).toBe(true);
  });

  it('pending past due date is overdue', () => {
    expect(isPaymentOverdue({ status: 'pending', due_date: '2026-06-11' }, TODAY)).toBe(true);
  });

  it('partial past due date is overdue', () => {
    expect(isPaymentOverdue({ status: 'partial', due_date: '2025-12-31' }, TODAY)).toBe(true);
  });

  it('pending due today is NOT overdue (strictly past)', () => {
    expect(isPaymentOverdue({ status: 'pending', due_date: '2026-06-12' }, TODAY)).toBe(false);
  });

  it('pending with a future due date is not overdue', () => {
    expect(isPaymentOverdue({ status: 'pending', due_date: '2026-06-13' }, TODAY)).toBe(false);
  });

  it('paid / late / waived past due date are not overdue', () => {
    for (const status of ['paid', 'late', 'waived', 'overpaid']) {
      expect(isPaymentOverdue({ status, due_date: '2020-01-01' }, TODAY)).toBe(false);
    }
  });

  it('handles timestamp due_date by comparing only the date part', () => {
    expect(isPaymentOverdue({ status: 'pending', due_date: '2026-06-11T23:59:59Z' }, TODAY)).toBe(true);
    expect(isPaymentOverdue({ status: 'pending', due_date: '2026-06-12T00:00:00Z' }, TODAY)).toBe(false);
  });

  it('defaults to today', () => {
    expect(isPaymentOverdue({ status: 'pending', due_date: '2000-01-01' })).toBe(true);
    expect(todayDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
