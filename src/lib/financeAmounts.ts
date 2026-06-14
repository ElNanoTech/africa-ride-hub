type InvoiceAmountLike = {
  total_ttc?: number | null;
  amount_paid?: number | null;
  remaining_due?: number | null;
  status?: string | null;
  paid_at?: string | null;
  cancelled_at?: string | null;
};

type PaymentAmountLike = {
  amount?: number | null;
  amount_paid?: number | null;
  status?: string | null;
};

const CLOSED_INVOICE_STATUSES = new Set(['paid', 'cancelled', 'void']);

export function getPaymentRemaining(payment?: PaymentAmountLike | null) {
  if (!payment) return 0;
  return Math.max(0, Number(payment.amount ?? 0) - Number(payment.amount_paid ?? 0));
}

export function getInvoiceRemainingDue(
  invoice: InvoiceAmountLike,
  linkedPayment?: PaymentAmountLike | null,
) {
  if (invoice.cancelled_at || CLOSED_INVOICE_STATUSES.has(invoice.status ?? '')) return 0;
  if (linkedPayment) return getPaymentRemaining(linkedPayment);
  if (invoice.remaining_due != null) return Math.max(0, Number(invoice.remaining_due));
  return Math.max(0, Number(invoice.total_ttc ?? 0) - Number(invoice.amount_paid ?? 0));
}

export function getInvoicePaidAmount(
  invoice: InvoiceAmountLike,
  linkedPayment?: PaymentAmountLike | null,
) {
  return Math.max(
    0,
    Number(invoice.amount_paid ?? 0),
    Number(linkedPayment?.amount_paid ?? 0),
  );
}

export function isInvoicePayable(
  invoice: InvoiceAmountLike,
  linkedPayment?: PaymentAmountLike | null,
) {
  if (invoice.cancelled_at || invoice.paid_at) return false;
  if (!['issued', 'partial', 'overdue'].includes(invoice.status ?? '')) return false;
  return getInvoiceRemainingDue(invoice, linkedPayment) > 0;
}
