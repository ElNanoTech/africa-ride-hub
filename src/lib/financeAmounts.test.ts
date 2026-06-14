import { describe, expect, it } from 'vitest';
import { getInvoicePaidAmount, getInvoiceRemainingDue, getPaymentRemaining, isInvoicePayable } from './financeAmounts';

describe('financeAmounts', () => {
  it('uses linked payment remaining due for partial invoices', () => {
    const invoice = {
      total_ttc: 100_000,
      amount_paid: 20_000,
      remaining_due: 90_000,
      status: 'partial',
      paid_at: null,
      cancelled_at: null,
    };
    const payment = { amount: 100_000, amount_paid: 45_000, status: 'partial' };

    expect(getPaymentRemaining(payment)).toBe(55_000);
    expect(getInvoiceRemainingDue(invoice, payment)).toBe(55_000);
    expect(getInvoicePaidAmount(invoice, payment)).toBe(45_000);
    expect(isInvoicePayable(invoice, payment)).toBe(true);
  });

  it('falls back to invoice remaining due when there is no linked payment', () => {
    const invoice = {
      total_ttc: 100_000,
      amount_paid: 25_000,
      remaining_due: null,
      status: 'issued',
      paid_at: null,
      cancelled_at: null,
    };

    expect(getInvoiceRemainingDue(invoice)).toBe(75_000);
  });

  it('does not treat paid or cancelled invoices as payable', () => {
    expect(getInvoiceRemainingDue({ total_ttc: 50_000, amount_paid: 0, status: 'paid' })).toBe(0);
    expect(isInvoicePayable({ total_ttc: 50_000, amount_paid: 0, status: 'cancelled' })).toBe(false);
  });
});
