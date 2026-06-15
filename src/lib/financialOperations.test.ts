import { describe, expect, it } from 'vitest';
import {
  buildCollectionsQueue,
  buildDailyRentalCommandMetrics,
  buildFinancialHealthSummary,
  buildFinancialOverviewMetrics,
  buildWalletHealthMetrics,
  isRealCashReceipt,
  isWalletAutoApplyReceipt,
  sumCollectedToday,
  sumExpectedToday,
  sumOutstandingBalance,
} from './financialOperations';

describe('financial operations metric helpers', () => {
  const today = '2026-06-15';

  it('calculates expected today from unpaid due payments only', () => {
    expect(sumExpectedToday([
      { amount: 10_000, amount_paid: 0, due_date: today, status: 'pending' },
      { amount: 12_000, amount_paid: 5_000, due_date: today, status: 'partial' },
      { amount: 9_000, amount_paid: 9_000, due_date: today, status: 'paid' },
      { amount: 8_000, amount_paid: 0, due_date: '2026-06-16', status: 'pending' },
    ], today)).toBe(17_000);
  });

  it('counts real cash-in without double-counting wallet auto-apply receipts', () => {
    const cashReceipt = { amount: 15_000, method: 'wave', note: 'Paiement Wave', received_at: `${today}T10:00:00Z` };
    const walletReceipt = {
      amount: 6_000,
      method: 'other',
      note: 'Crédit portefeuille DAM appliqué automatiquement',
      received_at: `${today}T11:00:00Z`,
    };

    expect(isWalletAutoApplyReceipt(walletReceipt)).toBe(true);
    expect(isRealCashReceipt(cashReceipt)).toBe(true);
    expect(isRealCashReceipt(walletReceipt)).toBe(false);
    expect(sumCollectedToday([cashReceipt, walletReceipt], today)).toBe(15_000);
  });

  it('uses remaining due for outstanding balance instead of invoice total', () => {
    expect(sumOutstandingBalance([
      { total_ttc: 100_000, amount_paid: 60_000, remaining_due: 40_000, status: 'partial' },
      { total_ttc: 50_000, amount_paid: 0, remaining_due: null, status: 'issued' },
      { total_ttc: 75_000, amount_paid: 0, remaining_due: 75_000, status: 'cancelled' },
    ])).toBe(90_000);
  });

  it('builds overview and daily rental metrics from shared definitions', () => {
    const payments = [
      { id: 'p1', driver_id: 'd1', amount: 10_000, amount_paid: 0, due_date: today, status: 'pending', payment_type: 'rental' },
      { id: 'p2', driver_id: 'd2', amount: 15_000, amount_paid: 5_000, due_date: '2026-06-10', status: 'partial', payment_type: 'rental', riskLevel: 'eleve' as const },
      { id: 'p3', driver_id: 'd3', amount: 25_000, amount_paid: 25_000, due_date: today, status: 'paid', payment_type: 'loan_repayment' },
      { id: 'p4', driver_id: 'd4', amount: 40_000, amount_paid: 0, due_date: '2026-06-09', status: 'pending', payment_type: 'loan_repayment', riskLevel: 'critique' as const },
    ];
    const receipts = [
      { amount: 10_000, method: 'cash', note: 'Manual', received_at: `${today}T12:00:00Z`, payment_type: 'rental' },
      { amount: 5_000, method: 'other', note: 'Crédit portefeuille DAM appliqué automatiquement', received_at: `${today}T12:05:00Z`, payment_type: 'rental' },
    ];
    const queue = buildCollectionsQueue(payments, today);

    const overview = buildFinancialOverviewMetrics({
      payments,
      receipts,
      invoices: [{ total_ttc: 40_000, amount_paid: 5_000, remaining_due: 35_000, status: 'partial' }],
      wallets: [{ available_balance: 7_000 }],
      rentals: [{ status: 'active' }, { status: 'completed' }],
      today,
    });
    const dailyRental = buildDailyRentalCommandMetrics({ payments, receipts, queue, today });

    expect(overview).toMatchObject({
      expectedToday: 10_000,
      collectedToday: 10_000,
      recoveryRate: 100,
      outstandingBalance: 35_000,
      driversOverdue: 2,
      walletBalanceExposure: 7_000,
      activeRentals: 1,
    });
    expect(dailyRental).toMatchObject({
      dueToday: 10_000,
      paidToday: 10_000,
      overdue: 10_000,
      dueTodayCount: 1,
      overdueCount: 1,
    });
    expect(dailyRental.highestRiskDrivers.map((row) => row.driverId)).not.toContain('d4');
  });

  it('sorts collections queue by risk, amount, then age and scores health', () => {
    const queue = buildCollectionsQueue([
      { id: 'low', driver_id: 'd-low', driverName: 'Low', amount: 50_000, amount_paid: 0, due_date: '2026-06-01', status: 'pending', riskLevel: 'bon' },
      { id: 'risk', driver_id: 'd-risk', driverName: 'Risk', amount: 10_000, amount_paid: 0, due_date: '2026-06-14', status: 'pending', riskLevel: 'critique' },
      { id: 'mid', driver_id: 'd-mid', driverName: 'Mid', amount: 60_000, amount_paid: 0, due_date: '2026-06-13', status: 'pending', riskLevel: 'moyen' },
    ], today);

    expect(queue.map((row) => row.driverId)).toEqual(['d-risk', 'd-mid', 'd-low']);
    expect(queue[0]).toMatchObject({ recommendedAction: 'Relancer' });

    const walletHealth = buildWalletHealthMetrics(
      [{ available_balance: 20_000 }, { available_balance: -500 }],
      [
        { direction: 'credit', type: 'overpayment_credit', amount: 5_000 },
        { direction: 'debit', type: 'rental_invoice_applied', amount: 4_000 },
        { direction: 'credit', type: 'invoice_cancellation_refund', amount: 3_000 },
      ],
    );
    expect(walletHealth).toMatchObject({
      totalBalance: 19_500,
      credits: 8_000,
      debits: 4_000,
      autoApplies: 4_000,
      refunds: 3_000,
      overpayments: 5_000,
      negativeWallets: 1,
    });

    expect(buildFinancialHealthSummary({
      recoveryRate: 82,
      anomalyCount: 2,
      overdueBalance: 30_000,
      expectedToday: 20_000,
      lateOrOverduePayments: 3,
      negativeWallets: 1,
    })).toMatchObject({
      index: 18,
      cards: [
        { key: 'collections', status: 'Critical' },
        { key: 'reconciliation', status: 'Warning' },
        { key: 'wallet', status: 'Critical' },
        { key: 'revenue', status: 'Critical' },
      ],
    });
  });
});
