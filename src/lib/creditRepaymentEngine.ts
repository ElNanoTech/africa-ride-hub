export type RepaymentScheduleType =
  | 'FIXED_INSTALLMENT'
  | 'ZERO_INTEREST_INSTALLMENT'
  | 'FLAT_FEE_INSTALLMENT'
  | 'ONE_TIME_PAYMENT';

export type RepaymentFrequency =
  | 'DAILY'
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'YEARLY'
  | 'ONE_TIME';

export type RepaymentTerms = {
  scheduleType: RepaymentScheduleType;
  frequency: RepaymentFrequency;
  termCount: number;
  financedAmount: number;
  totalRepaymentAmount?: number;
  interestAmount?: number;
  feeAmount?: number;
  firstDueDate: string;
};

export type RepaymentObligationPlan = {
  sequenceNumber: number;
  dueDate: string;
  amount: number;
  principalAmount: number;
  interestAmount: number;
  feeAmount: number;
  obligationType: 'INSTALLMENT' | 'FINAL_PAYMENT';
};

function assertIntegerMoney(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer minor-unit amount`);
  }
}

function addMonthsClamped(date: Date, months: number) {
  const day = date.getUTCDate();
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function repaymentDueDate(firstDueDate: string, frequency: RepaymentFrequency, sequenceNumber: number) {
  if (sequenceNumber <= 1) return firstDueDate;
  const first = new Date(`${firstDueDate}T00:00:00Z`);
  const offset = sequenceNumber - 1;

  switch (frequency) {
    case 'DAILY':
      first.setUTCDate(first.getUTCDate() + offset);
      return isoDate(first);
    case 'WEEKLY':
      first.setUTCDate(first.getUTCDate() + offset * 7);
      return isoDate(first);
    case 'BIWEEKLY':
      first.setUTCDate(first.getUTCDate() + offset * 14);
      return isoDate(first);
    case 'MONTHLY':
      return isoDate(addMonthsClamped(first, offset));
    case 'QUARTERLY':
      return isoDate(addMonthsClamped(first, offset * 3));
    case 'YEARLY':
      return isoDate(addMonthsClamped(first, offset * 12));
    case 'ONE_TIME':
    default:
      return firstDueDate;
  }
}

function splitAmount(total: number, count: number) {
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function buildRepaymentObligationPlan(terms: RepaymentTerms): RepaymentObligationPlan[] {
  const termCount = terms.scheduleType === 'ONE_TIME_PAYMENT' ? 1 : terms.termCount;
  if (!Number.isInteger(termCount) || termCount <= 0) throw new Error('termCount must be a positive integer');

  assertIntegerMoney(terms.financedAmount, 'financedAmount');
  assertIntegerMoney(terms.totalRepaymentAmount ?? terms.financedAmount, 'totalRepaymentAmount');
  assertIntegerMoney(terms.interestAmount ?? 0, 'interestAmount');
  assertIntegerMoney(terms.feeAmount ?? 0, 'feeAmount');

  let interest = terms.scheduleType === 'ZERO_INTEREST_INSTALLMENT' ? 0 : terms.interestAmount ?? 0;
  const requestedTotal = terms.totalRepaymentAmount ?? terms.financedAmount + interest + (terms.feeAmount ?? 0);
  const total = Math.max(requestedTotal, terms.financedAmount);
  if (total < terms.financedAmount + interest) interest = Math.max(total - terms.financedAmount, 0);
  const fees = Math.max(total - terms.financedAmount - interest, 0);

  const principals = splitAmount(terms.financedAmount, termCount);
  const interests = splitAmount(interest, termCount);
  const feeParts = splitAmount(fees, termCount);

  return principals.map((principalAmount, index) => {
    const sequenceNumber = index + 1;
    const interestAmount = interests[index] ?? 0;
    const feeAmount = feeParts[index] ?? 0;
    return {
      sequenceNumber,
      dueDate: repaymentDueDate(terms.firstDueDate, terms.scheduleType === 'ONE_TIME_PAYMENT' ? 'ONE_TIME' : terms.frequency, sequenceNumber),
      amount: principalAmount + interestAmount + feeAmount,
      principalAmount,
      interestAmount,
      feeAmount,
      obligationType: sequenceNumber === termCount ? 'FINAL_PAYMENT' : 'INSTALLMENT',
    };
  });
}

export function summarizeRepaymentPlan(plan: RepaymentObligationPlan[]) {
  return plan.reduce(
    (summary, obligation) => ({
      amount: summary.amount + obligation.amount,
      principalAmount: summary.principalAmount + obligation.principalAmount,
      interestAmount: summary.interestAmount + obligation.interestAmount,
      feeAmount: summary.feeAmount + obligation.feeAmount,
    }),
    { amount: 0, principalAmount: 0, interestAmount: 0, feeAmount: 0 },
  );
}

export function driverRepaymentStatusLabel(status: string | null | undefined) {
  switch (status) {
    case 'ACTIVE': return 'Calendrier actif';
    case 'PAUSED': return 'Calendrier suspendu';
    case 'COMPLETED': return 'Calendrier termine';
    case 'SCHEDULED': return 'Planifiee';
    case 'INVOICED': return 'Facturee';
    case 'PAID': return 'Payee';
    case 'PARTIALLY_PAID': return 'Paiement partiel';
    case 'OVERDUE': return 'En retard';
    default: return 'Calendrier de paiement';
  }
}
