import { getInvoiceRemainingDue, getPaymentRemaining } from './financeAmounts';
import { isPaymentOverdue } from './payments';
import { OPEN_RENTAL_STATUSES } from './rentals';

export const EXPECTED_TODAY_PAYMENT_STATUSES = ['pending', 'partial', 'late', 'overdue'] as const;

const EXPECTED_STATUS_SET = new Set<string>(EXPECTED_TODAY_PAYMENT_STATUSES);
const CLOSED_PAYMENT_STATUSES = new Set(['paid', 'overpaid', 'waived']);
const WALLET_AUTO_APPLY_NOTE = 'credit portefeuille dam applique automatiquement';

export type RiskLevel = 'bon' | 'moyen' | 'eleve' | 'critique';
export type HealthTone = 'healthy' | 'warning' | 'critical';

export type PaymentMetricLike = {
  id?: string;
  driver_id?: string | null;
  customer_id?: string | null;
  amount?: number | null;
  amount_paid?: number | null;
  due_date?: string | null;
  paid_date?: string | null;
  status?: string | null;
  payment_type?: string | null;
};

export type ReceiptMetricLike = {
  amount?: number | null;
  method?: string | null;
  note?: string | null;
  received_at?: string | null;
};

export type InvoiceMetricLike = {
  total_ttc?: number | null;
  amount_paid?: number | null;
  remaining_due?: number | null;
  status?: string | null;
  paid_at?: string | null;
  cancelled_at?: string | null;
};

export type WalletBalanceMetricLike = {
  available_balance?: number | null;
  total_credits?: number | null;
  total_debits?: number | null;
};

export type WalletTransactionMetricLike = {
  amount?: number | null;
  direction?: string | null;
  type?: string | null;
  created_at?: string | null;
};

export type RentalMetricLike = {
  status?: string | null;
};

export type FinancialOverviewMetrics = {
  collectedToday: number;
  expectedToday: number;
  recoveryRate: number;
  outstandingBalance: number;
  driversOverdue: number;
  walletBalanceExposure: number;
  activeRentals: number;
  overdueBalance: number;
};

export type CollectionSourcePayment = PaymentMetricLike & {
  driverName?: string | null;
  driverPhone?: string | null;
  vehicleLabel?: string | null;
  score?: number | null;
  riskLevel?: RiskLevel | null;
  lastReminderAt?: string | null;
};

export type CollectionQueueRow = {
  driverId: string;
  customerId: string | null;
  driverName: string;
  driverPhone: string | null;
  vehicleLabel: string | null;
  amountDue: number;
  oldestDueDate: string;
  daysOverdue: number;
  score: number | null;
  riskLevel: RiskLevel | null;
  lastReminderAt: string | null;
  recommendedAction: 'Relancer' | 'Encaisser' | 'Voir';
  primaryPaymentId: string | null;
  paymentCount: number;
};

export type WalletHealthMetrics = {
  totalBalance: number;
  credits: number;
  debits: number;
  autoApplies: number;
  refunds: number;
  overpayments: number;
  negativeWallets: number;
};

export type DailyRentalCommandMetrics = {
  dueToday: number;
  paidToday: number;
  overdue: number;
  dueTodayCount: number;
  overdueCount: number;
  highestRiskDrivers: CollectionQueueRow[];
};

export type HealthCard = {
  key: 'collections' | 'reconciliation' | 'wallet' | 'revenue';
  label: string;
  status: 'Healthy' | 'Warning' | 'Critical';
  tone: HealthTone;
  detail: string;
};

export type FinancialHealthSummary = {
  index: number;
  cards: HealthCard[];
};

function normalize(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function dateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

export function isExpectedTodayPayment(payment: PaymentMetricLike, today: string): boolean {
  if (dateKey(payment.due_date) !== today) return false;
  if (!EXPECTED_STATUS_SET.has(payment.status ?? '')) return false;
  return getPaymentRemaining(payment) > 0;
}

export function isOpenPayment(payment: PaymentMetricLike): boolean {
  const status = payment.status ?? '';
  return !CLOSED_PAYMENT_STATUSES.has(status) && getPaymentRemaining(payment) > 0;
}

export function isWalletAutoApplyReceipt(receipt: ReceiptMetricLike): boolean {
  const method = normalize(receipt.method);
  const note = normalize(receipt.note);
  return (
    method === 'wallet' ||
    method === 'dam_wallet' ||
    note.includes(WALLET_AUTO_APPLY_NOTE) ||
    note.includes('wallet_auto_apply')
  );
}

export function isRealCashReceipt(receipt: ReceiptMetricLike): boolean {
  return Number(receipt.amount ?? 0) > 0 && !isWalletAutoApplyReceipt(receipt);
}

export function sumExpectedToday(payments: PaymentMetricLike[], today: string): number {
  return payments
    .filter((payment) => isExpectedTodayPayment(payment, today))
    .reduce((sum, payment) => sum + getPaymentRemaining(payment), 0);
}

export function sumCollectedToday(receipts: ReceiptMetricLike[], today: string): number {
  return receipts
    .filter((receipt) => dateKey(receipt.received_at) === today && isRealCashReceipt(receipt))
    .reduce((sum, receipt) => sum + Number(receipt.amount ?? 0), 0);
}

export function sumOutstandingBalance(invoices: InvoiceMetricLike[]): number {
  return invoices.reduce((sum, invoice) => sum + getInvoiceRemainingDue(invoice), 0);
}

export function countDriversOverdue(payments: PaymentMetricLike[], today: string): number {
  const drivers = new Set(
    payments
      .filter((payment) => payment.driver_id && isPaymentOverdue({
        status: payment.status ?? '',
        due_date: payment.due_date ?? today,
      }, today))
      .map((payment) => payment.driver_id),
  );
  return drivers.size;
}

export function buildFinancialOverviewMetrics(input: {
  payments: PaymentMetricLike[];
  receipts: ReceiptMetricLike[];
  invoices: InvoiceMetricLike[];
  wallets: WalletBalanceMetricLike[];
  rentals: RentalMetricLike[];
  today: string;
}): FinancialOverviewMetrics {
  const expectedToday = sumExpectedToday(input.payments, input.today);
  const collectedToday = sumCollectedToday(input.receipts, input.today);
  const overduePayments = input.payments.filter((payment) =>
    isPaymentOverdue({
      status: payment.status ?? '',
      due_date: payment.due_date ?? input.today,
    }, input.today),
  );

  return {
    collectedToday,
    expectedToday,
    recoveryRate: expectedToday > 0 ? Math.round((collectedToday / expectedToday) * 100) : 0,
    outstandingBalance: sumOutstandingBalance(input.invoices),
    driversOverdue: countDriversOverdue(input.payments, input.today),
    walletBalanceExposure: input.wallets.reduce((sum, wallet) => sum + Math.max(0, Number(wallet.available_balance ?? 0)), 0),
    activeRentals: input.rentals.filter((rental) => OPEN_RENTAL_STATUSES.includes(rental.status ?? '')).length,
    overdueBalance: overduePayments.reduce((sum, payment) => sum + getPaymentRemaining(payment), 0),
  };
}

function daysBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function riskRank(level: RiskLevel | null | undefined): number {
  switch (level) {
    case 'critique': return 4;
    case 'eleve': return 3;
    case 'moyen': return 2;
    case 'bon': return 1;
    default: return 0;
  }
}

function chooseRecommendedAction(row: Pick<CollectionQueueRow, 'amountDue' | 'daysOverdue' | 'riskLevel'>): CollectionQueueRow['recommendedAction'] {
  if (row.daysOverdue >= 1 || row.riskLevel === 'critique' || row.riskLevel === 'eleve') return 'Relancer';
  if (row.amountDue > 0) return 'Encaisser';
  return 'Voir';
}

export function buildCollectionsQueue(payments: CollectionSourcePayment[], today: string): CollectionQueueRow[] {
  const rows = new Map<string, CollectionQueueRow>();

  for (const payment of payments) {
    if (!payment.driver_id || !isOpenPayment(payment)) continue;
    const remaining = getPaymentRemaining(payment);
    const dueDate = dateKey(payment.due_date) ?? today;
    const existing = rows.get(payment.driver_id);

    if (!existing) {
      rows.set(payment.driver_id, {
        driverId: payment.driver_id,
        customerId: payment.customer_id ?? null,
        driverName: payment.driverName || 'Conducteur',
        driverPhone: payment.driverPhone ?? null,
        vehicleLabel: payment.vehicleLabel ?? null,
        amountDue: remaining,
        oldestDueDate: dueDate,
        daysOverdue: daysBetween(dueDate, today),
        score: payment.score ?? null,
        riskLevel: payment.riskLevel ?? null,
        lastReminderAt: payment.lastReminderAt ?? null,
        recommendedAction: 'Voir',
        primaryPaymentId: payment.id ?? null,
        paymentCount: 1,
      });
      continue;
    }

    existing.amountDue += remaining;
    existing.paymentCount += 1;
    if (dueDate < existing.oldestDueDate) {
      existing.oldestDueDate = dueDate;
      existing.daysOverdue = daysBetween(dueDate, today);
      existing.primaryPaymentId = payment.id ?? existing.primaryPaymentId;
    }
    if (!existing.vehicleLabel && payment.vehicleLabel) existing.vehicleLabel = payment.vehicleLabel;
    if (riskRank(payment.riskLevel) > riskRank(existing.riskLevel)) existing.riskLevel = payment.riskLevel ?? null;
    if ((payment.score ?? -1) > (existing.score ?? -1)) existing.score = payment.score ?? existing.score;
  }

  return Array.from(rows.values())
    .map((row) => ({ ...row, recommendedAction: chooseRecommendedAction(row) }))
    .sort((a, b) =>
      riskRank(b.riskLevel) - riskRank(a.riskLevel) ||
      b.amountDue - a.amountDue ||
      b.daysOverdue - a.daysOverdue,
    );
}

export function buildWalletHealthMetrics(
  wallets: WalletBalanceMetricLike[],
  transactions: WalletTransactionMetricLike[],
): WalletHealthMetrics {
  return {
    totalBalance: wallets.reduce((sum, wallet) => sum + Number(wallet.available_balance ?? 0), 0),
    credits: transactions
      .filter((txn) => txn.direction === 'credit')
      .reduce((sum, txn) => sum + Number(txn.amount ?? 0), 0),
    debits: transactions
      .filter((txn) => txn.direction === 'debit')
      .reduce((sum, txn) => sum + Number(txn.amount ?? 0), 0),
    autoApplies: transactions
      .filter((txn) => ['rental_invoice_applied', 'wallet_auto_invoice_payment'].includes(txn.type ?? ''))
      .reduce((sum, txn) => sum + Number(txn.amount ?? 0), 0),
    refunds: transactions
      .filter((txn) => normalize(txn.type).includes('refund') || normalize(txn.type).includes('remboursement'))
      .reduce((sum, txn) => sum + Number(txn.amount ?? 0), 0),
    overpayments: transactions
      .filter((txn) => txn.type === 'overpayment_credit')
      .reduce((sum, txn) => sum + Number(txn.amount ?? 0), 0),
    negativeWallets: wallets.filter((wallet) => Number(wallet.available_balance ?? 0) < 0).length,
  };
}

export function buildDailyRentalCommandMetrics(input: {
  payments: CollectionSourcePayment[];
  receipts: Array<ReceiptMetricLike & { payment_type?: string | null }>;
  queue: CollectionQueueRow[];
  today: string;
}): DailyRentalCommandMetrics {
  const rentalPayments = input.payments.filter((payment) => payment.payment_type === 'rental');
  const rentalDriverIds = new Set(rentalPayments.map((payment) => payment.driver_id).filter(Boolean));
  const dueTodayRows = rentalPayments.filter((payment) => isExpectedTodayPayment(payment, input.today));
  const overdueRows = rentalPayments.filter((payment) =>
    isPaymentOverdue({
      status: payment.status ?? '',
      due_date: payment.due_date ?? input.today,
    }, input.today),
  );
  const paidToday = input.receipts
    .filter((receipt) => receipt.payment_type === 'rental' && dateKey(receipt.received_at) === input.today && isRealCashReceipt(receipt))
    .reduce((sum, receipt) => sum + Number(receipt.amount ?? 0), 0);

  return {
    dueToday: dueTodayRows.reduce((sum, payment) => sum + getPaymentRemaining(payment), 0),
    paidToday,
    overdue: overdueRows.reduce((sum, payment) => sum + getPaymentRemaining(payment), 0),
    dueTodayCount: dueTodayRows.length,
    overdueCount: overdueRows.length,
    highestRiskDrivers: input.queue
      .filter((row) => rentalDriverIds.has(row.driverId))
      .filter((row) => row.riskLevel === 'critique' || row.riskLevel === 'eleve' || row.daysOverdue > 0)
      .slice(0, 5),
  };
}

function healthStatus(tone: HealthTone): HealthCard['status'] {
  if (tone === 'healthy') return 'Healthy';
  if (tone === 'warning') return 'Warning';
  return 'Critical';
}

function collectionTone(recoveryRate: number): HealthTone {
  if (recoveryRate >= 95) return 'healthy';
  if (recoveryRate >= 85) return 'warning';
  return 'critical';
}

function anomalyTone(count: number): HealthTone {
  if (count === 0) return 'healthy';
  if (count <= 3) return 'warning';
  return 'critical';
}

export function buildFinancialHealthSummary(input: {
  recoveryRate: number;
  anomalyCount: number;
  overdueBalance: number;
  expectedToday: number;
  lateOrOverduePayments: number;
  negativeWallets: number;
}): FinancialHealthSummary {
  const collectionsTone = collectionTone(input.recoveryRate);
  const reconciliationTone = anomalyTone(input.anomalyCount);
  const walletTone = input.negativeWallets > 0 ? 'critical' : input.anomalyCount > 0 ? 'warning' : 'healthy';
  const revenueTone = input.expectedToday === 0
    ? 'warning'
    : input.overdueBalance === 0
      ? 'healthy'
      : input.overdueBalance <= input.expectedToday
        ? 'warning'
        : 'critical';

  const cards: HealthCard[] = [
    {
      key: 'collections',
      label: 'Collections',
      tone: collectionsTone,
      status: healthStatus(collectionsTone),
      detail: `${input.recoveryRate}% recovery today`,
    },
    {
      key: 'reconciliation',
      label: 'Reconciliation',
      tone: reconciliationTone,
      status: healthStatus(reconciliationTone),
      detail: `${input.anomalyCount} anomaly item(s)`,
    },
    {
      key: 'wallet',
      label: 'Wallet',
      tone: walletTone,
      status: healthStatus(walletTone),
      detail: input.negativeWallets > 0 ? `${input.negativeWallets} negative wallet(s)` : 'Wallet balances stable',
    },
    {
      key: 'revenue',
      label: 'Revenue',
      tone: revenueTone,
      status: healthStatus(revenueTone),
      detail: `${input.lateOrOverduePayments} late or overdue item(s)`,
    },
  ];

  const score =
    100 -
    (collectionsTone === 'critical' ? 25 : collectionsTone === 'warning' ? 10 : 0) -
    Math.min(25, input.anomalyCount * 8) -
    (revenueTone === 'critical' ? 20 : revenueTone === 'warning' ? 8 : 0) -
    Math.min(10, input.lateOrOverduePayments * 2) -
    (input.negativeWallets > 0 ? 15 : 0);

  return {
    index: Math.max(0, Math.min(100, Math.round(score))),
    cards,
  };
}
