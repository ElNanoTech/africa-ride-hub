import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Download,
  Eye,
  FileText,
  RefreshCw,
  Send,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { LoadingState } from '@/components/LoadingState';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RiskBadge } from '@/components/admin/RiskBadge';
import { StatusBadge } from '@/lib/statusBadges';
import { formatCurrency, formatDateShort, formatDateTime } from '@/lib/format';
import { getPaymentRemaining } from '@/lib/financeAmounts';
import { fetchAllRows } from '@/lib/fetchAll';
import { isPaymentOverdue } from '@/lib/payments';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/routeClient';
import { useDriversRiskSummary } from '@/hooks/useDriverRisk';
import { useFinancialRealtime } from '@/hooks/useFinancialRealtime';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import type { Json } from '@/integrations/supabase/types';
import type { DriverRiskLevel } from '@/lib/driverRisk';
import {
  EXPECTED_TODAY_PAYMENT_STATUSES,
  buildCollectionsQueue,
  buildDailyRentalCommandMetrics,
  buildFinancialHealthSummary,
  buildFinancialOverviewMetrics,
  buildWalletHealthMetrics,
  dateKey,
  isRealCashReceipt,
  isWalletAutoApplyReceipt,
  type CollectionQueueRow,
  type CollectionSourcePayment,
  type FinancialHealthSummary,
  type FinancialOverviewMetrics,
  type HealthTone,
  type RiskLevel,
  type WalletHealthMetrics,
} from '@/lib/financialOperations';
import { OPEN_RENTAL_STATUSES } from '@/lib/rentals';

type UntypedQueryResult<T> = {
  data: T | null;
  error: Error | null;
};

type UntypedQueryBuilder<T = unknown> = PromiseLike<UntypedQueryResult<T>> & {
  select: (columns?: string, options?: Record<string, unknown>) => UntypedQueryBuilder<T>;
  order: (column: string, options?: Record<string, unknown>) => UntypedQueryBuilder<T>;
  range: (from: number, to: number) => UntypedQueryBuilder<T>;
  limit: (count: number) => UntypedQueryBuilder<T>;
};

const financialSupabase = supabase as unknown as {
  from: <T = unknown>(table: string) => UntypedQueryBuilder<T>;
};

type DriverMini = {
  full_name: string | null;
  phone_number: string | null;
};

type VehicleMini = {
  make?: string | null;
  model_name: string | null;
  license_plate: string | null;
};

type PaymentRow = {
  id: string;
  driver_id: string;
  customer_id: string | null;
  amount: number;
  amount_paid: number;
  due_date: string;
  paid_date: string | null;
  paid_at: string | null;
  payment_type: string;
  rental_id: string | null;
  status: string;
  wave_transaction_id: string | null;
  drivers: DriverMini | null;
  rentals: { vehicles: VehicleMini | null } | null;
  loans: { loan_type: string | null; amount_approved: number | null } | null;
};

type ReceiptRow = {
  id: string;
  payment_id: string;
  amount: number;
  method: string;
  note: string | null;
  received_at: string;
  wave_transaction_id: string | null;
  payments: {
    id: string;
    driver_id: string;
    customer_id: string | null;
    payment_type: string;
    rental_id: string | null;
    drivers: DriverMini | null;
    rentals: { vehicles: VehicleMini | null } | null;
  } | null;
};

type InvoiceRow = {
  id: string;
  customer_id: string;
  driver_id: string;
  invoice_number: string | null;
  invoice_kind: string;
  status: string;
  total_ttc: number;
  amount_paid: number;
  remaining_due: number | null;
  issued_at: string | null;
  created_at: string;
  paid_at: string | null;
  cancelled_at: string | null;
  rental_id: string | null;
  driver_snapshot_name: string | null;
  currency_code: string | null;
  source_product_id: string | null;
  source_credit_account_id: string | null;
  source_application_id: string | null;
  obligation_type: string | null;
  idempotency_key: string | null;
};

type WalletBalanceRow = {
  wallet_id: string | null;
  driver_id: string | null;
  customer_id: string | null;
  available_balance: number | null;
  total_credits: number | null;
  total_debits: number | null;
  last_transaction_at: string | null;
  transaction_count: number | null;
  driver_name?: string;
  phone?: string | null;
};

type WalletTxnRow = {
  id: string;
  driver_id: string;
  customer_id: string | null;
  invoice_id: string | null;
  payment_id: string | null;
  rental_id: string | null;
  type: string;
  direction: string | null;
  amount: number;
  balance_after: number;
  method: string | null;
  note: string | null;
  reference: string | null;
  created_at: string;
  drivers: DriverMini | null;
};

type RentalRow = {
  id: string;
  driver_id: string;
  customer_id: string | null;
  status: string;
  approved_rate: number | null;
  requested_rate: number | null;
  payment_due_at: string | null;
  drivers: DriverMini | null;
  vehicles: VehicleMini | null;
};

type InvoicePaymentLinkRow = {
  invoice_id: string;
  payment_id: string;
  customer_id: string | null;
};

type CreditScoreRow = {
  driver_id: string;
  score: number;
  calculation_week: string;
  created_at: string;
};

type DriverAuditRow = {
  driver_id: string;
  action: string;
  created_at: string;
  metadata: Json | null;
};

type InvoiceAuditRow = {
  id: string;
  invoice_id: string | null;
  action: string;
  actor_type: string | null;
  created_at: string;
  metadata: Json | null;
  invoice: { invoice_number: string | null; driver_snapshot_name: string | null } | null;
};

type SettlementAnomalyRow = {
  wallet_txn_id: string | null;
  driver_id: string | null;
  customer_id: string | null;
  invoice_id: string | null;
  payment_id: string | null;
  debited_amount: number | null;
  created_at: string | null;
  invoice_number: string | null;
  invoice_status: string | null;
  invoice_amount_paid: number | null;
  invoice_total: number | null;
  severity: string | null;
  message: string | null;
  recommended_action: string | null;
};

type CreditCollectionsRow = {
  case_id: string;
  driver_id: string;
  driver_name: string | null;
  driver_phone: string | null;
  product_name: string | null;
  current_status_label: string | null;
  delinquency_status_label: string | null;
  severity: string;
  total_past_due_amount: number;
  days_past_due: number;
  priority_score: number;
  invoice_number: string | null;
  active_promise_id: string | null;
  promised_payment_date: string | null;
  opened_at: string;
};

type ReconciliationItem = {
  id: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  title: string;
  detail: string;
  driverId: string | null;
  invoiceId: string | null;
  paymentId: string | null;
  amount: number;
  safeAction:
    | { kind: 'reconcile_invoice_status'; label: 'Repair'; invoiceId: string }
    | { kind: 'apply_wallet_credit_to_open_invoices'; label: 'Re-run Settlement'; driverId: string }
    | { kind: 'reverse_cancelled_invoice_payments'; label: 'Repair'; invoiceId: string }
    | null;
  disabledReason?: string;
};

type PaymentDetail = {
  payment: PaymentRow;
  receipts: ReceiptRow[];
  invoice: InvoiceRow | null;
};

const TODAY = new Date().toISOString().slice(0, 10);
const CHART_COLLECTED = '#0f766e';
const CHART_EXPECTED = '#475569';
const CHART_GAP = '#b45309';
const EMPTY_PAYMENTS: PaymentRow[] = [];
const EMPTY_RECEIPTS: ReceiptRow[] = [];
const EMPTY_INVOICES: InvoiceRow[] = [];
const EMPTY_LINKS: InvoicePaymentLinkRow[] = [];
const EMPTY_WALLETS: WalletBalanceRow[] = [];
const EMPTY_WALLET_TXNS: WalletTxnRow[] = [];
const EMPTY_RENTALS: RentalRow[] = [];
const EMPTY_CREDIT_SCORES: CreditScoreRow[] = [];
const EMPTY_DRIVER_AUDIT: DriverAuditRow[] = [];
const EMPTY_INVOICE_AUDIT: InvoiceAuditRow[] = [];
const EMPTY_ANOMALIES: SettlementAnomalyRow[] = [];
const EMPTY_CREDIT_COLLECTIONS: CreditCollectionsRow[] = [];
const EXPECTED_PAYMENT_STATUS_FILTER = [...EXPECTED_TODAY_PAYMENT_STATUSES];

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function methodLabel(method: string | null | undefined) {
  switch (method) {
    case 'wave': return 'Wave';
    case 'cash': return 'Espèces';
    case 'orange': return 'Orange Money';
    case 'mtn': return 'MTN';
    case 'moov': return 'Moov';
    case 'other': return 'Autre';
    default: return method || '—';
  }
}

function paymentTypeLabel(type: string | null | undefined) {
  switch (type) {
    case 'rental': return 'Location';
    case 'loan_repayment': return 'Crédit';
    case 'wallet_topup': return 'Recharge wallet';
    default: return type || '—';
  }
}

function vehicleLabel(vehicle: VehicleMini | null | undefined) {
  if (!vehicle) return null;
  return [vehicle.license_plate, vehicle.model_name].filter(Boolean).join(' · ') || null;
}

function toneClass(tone: HealthTone) {
  if (tone === 'healthy') return 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300';
  if (tone === 'warning') return 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300';
  return 'border-destructive/30 bg-destructive/5 text-destructive';
}

function severityVariant(severity: ReconciliationItem['severity']) {
  if (severity === 'Critical' || severity === 'High') return 'destructive';
  if (severity === 'Medium') return 'high';
  return 'outline';
}

function csvEscape(value: string | number | null | undefined) {
  const s = String(value ?? '');
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function compactNumber(value: number) {
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

function isExpectedScheduledPayment(payment: PaymentRow) {
  return EXPECTED_TODAY_PAYMENT_STATUSES.includes(payment.status as typeof EXPECTED_TODAY_PAYMENT_STATUSES[number])
    && getPaymentRemaining(payment) > 0;
}

function buildTrendData(payments: PaymentRow[], receipts: ReceiptRow[], today: string, days: number) {
  const rows: Array<{ date: string; label: string; expected: number; collected: number; gap: number }> = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = addDays(today, -i);
    const expected = payments
      .filter((payment) => dateKey(payment.due_date) === date && isExpectedScheduledPayment(payment))
      .reduce((sum, payment) => sum + getPaymentRemaining(payment), 0);
    const collected = receipts
      .filter((receipt) => dateKey(receipt.received_at) === date && isRealCashReceipt(receipt))
      .reduce((sum, receipt) => sum + receipt.amount, 0);
    rows.push({
      date,
      label: new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      expected,
      collected,
      gap: expected - collected,
    });
  }
  return rows;
}

function buildWeekForecast(payments: PaymentRow[], today: string) {
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 6);
  const expectedFor = (from: string, to: string) =>
    payments
      .filter((payment) => {
        const due = dateKey(payment.due_date);
        return !!due && due >= from && due <= to && isExpectedScheduledPayment(payment);
      })
      .reduce((sum, payment) => sum + getPaymentRemaining(payment), 0);

  return [
    { label: "Aujourd'hui", value: expectedFor(today, today) },
    { label: 'Demain', value: expectedFor(tomorrow, tomorrow) },
    { label: 'Cette semaine', value: expectedFor(today, weekEnd) },
  ];
}

function deriveInvoiceAnomalies(
  invoices: InvoiceRow[],
  links: InvoicePaymentLinkRow[],
  paymentsById: Map<string, PaymentRow>,
): ReconciliationItem[] {
  const paymentIdByInvoice = new Map(links.map((link) => [link.invoice_id, link.payment_id]));
  const items: ReconciliationItem[] = [];

  for (const invoice of invoices) {
    const paymentId = paymentIdByInvoice.get(invoice.id) ?? null;
    const payment = paymentId ? paymentsById.get(paymentId) ?? null : null;
    const remaining = Number(invoice.remaining_due ?? Math.max(0, invoice.total_ttc - invoice.amount_paid));

    if (invoice.status === 'paid' && remaining > 0) {
      items.push({
        id: `invoice-paid-balance-${invoice.id}`,
        severity: 'High',
        title: 'Invoice paid but balance remains',
        detail: `${invoice.invoice_number ?? invoice.id} still shows ${formatCurrency(remaining)} remaining.`,
        driverId: invoice.driver_id,
        invoiceId: invoice.id,
        paymentId,
        amount: remaining,
        safeAction: { kind: 'reconcile_invoice_status', label: 'Repair', invoiceId: invoice.id },
      });
    }

    if (['issued', 'partial'].includes(invoice.status) && invoice.amount_paid >= invoice.total_ttc && invoice.total_ttc > 0) {
      items.push({
        id: `invoice-unclosed-paid-${invoice.id}`,
        severity: 'Medium',
        title: 'Invoice has full payment but remains open',
        detail: `${invoice.invoice_number ?? invoice.id} may need status reconciliation.`,
        driverId: invoice.driver_id,
        invoiceId: invoice.id,
        paymentId,
        amount: invoice.amount_paid,
        safeAction: { kind: 'reconcile_invoice_status', label: 'Repair', invoiceId: invoice.id },
      });
    }

    if (invoice.status === 'cancelled' && payment && !['waived', 'paid'].includes(payment.status)) {
      items.push({
        id: `cancelled-active-payment-${invoice.id}`,
        severity: 'High',
        title: 'Cancelled invoice with active payment',
        detail: `${invoice.invoice_number ?? invoice.id} is cancelled while payment ${payment.status} remains open.`,
        driverId: invoice.driver_id,
        invoiceId: invoice.id,
        paymentId,
        amount: getPaymentRemaining(payment),
        safeAction: { kind: 'reverse_cancelled_invoice_payments', label: 'Repair', invoiceId: invoice.id },
      });
    }
  }

  return items;
}

function deriveReconciliationItems(input: {
  anomalies: SettlementAnomalyRow[];
  invoices: InvoiceRow[];
  links: InvoicePaymentLinkRow[];
  paymentsById: Map<string, PaymentRow>;
  wallets: WalletBalanceRow[];
}): ReconciliationItem[] {
  const walletItems = input.anomalies.map((row): ReconciliationItem => ({
    id: `wallet-${row.wallet_txn_id ?? row.invoice_id ?? row.payment_id}`,
    severity: row.severity === 'critical' ? 'Critical' : 'High',
    title: 'Wallet debit without receipt',
    detail: row.message ?? 'Wallet settlement is missing its receipt trail.',
    driverId: row.driver_id,
    invoiceId: row.invoice_id,
    paymentId: row.payment_id,
    amount: Number(row.debited_amount ?? 0),
    safeAction: row.driver_id
      ? { kind: 'apply_wallet_credit_to_open_invoices', label: 'Re-run Settlement', driverId: row.driver_id }
      : null,
    disabledReason: row.driver_id ? undefined : 'No driver is attached to this anomaly.',
  }));
  const invoiceItems = deriveInvoiceAnomalies(input.invoices, input.links, input.paymentsById);
  const walletBalanceItems = input.wallets
    .filter((wallet) => Number(wallet.available_balance ?? 0) < 0)
    .map((wallet): ReconciliationItem => ({
      id: `negative-wallet-${wallet.wallet_id ?? wallet.driver_id}`,
      severity: 'Medium',
      title: 'Negative wallet balance',
      detail: `${wallet.driver_name ?? 'Driver'} has ${formatCurrency(Number(wallet.available_balance ?? 0))}.`,
      driverId: wallet.driver_id,
      invoiceId: null,
      paymentId: null,
      amount: Math.abs(Number(wallet.available_balance ?? 0)),
      safeAction: null,
      disabledReason: 'No safe repair RPC exists for negative wallet balances.',
    }));

  return [...walletItems, ...invoiceItems, ...walletBalanceItems].sort((a, b) => {
    const rank = { Critical: 4, High: 3, Medium: 2, Low: 1 };
    return rank[b.severity] - rank[a.severity] || b.amount - a.amount;
  });
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Banknote;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  return (
    <Card className="min-h-[132px]">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <Icon className={cn(
            'h-4 w-4',
            tone === 'success' && 'text-emerald-600',
            tone === 'warning' && 'text-amber-600',
            tone === 'danger' && 'text-destructive',
            tone === 'default' && 'text-primary',
          )} />
        </div>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function DailyRentalCommandCenter({
  metrics,
}: {
  metrics: ReturnType<typeof buildDailyRentalCommandMetrics>;
}) {
  return (
    <section className="rounded-md border bg-card p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Daily Rental Command Center</h2>
          <p className="text-sm text-muted-foreground">Loyer journalier first: due, paid, overdue, and highest-risk drivers.</p>
        </div>
        <Badge variant={metrics.overdue > 0 ? 'destructive' : 'success'}>
          {metrics.overdueCount} overdue rental item(s)
        </Badge>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Due Today</p>
          <p className="text-xl font-semibold">{formatCurrency(metrics.dueToday)}</p>
          <p className="text-xs text-muted-foreground">{metrics.dueTodayCount} rental due item(s)</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Paid Today</p>
          <p className="text-xl font-semibold text-emerald-600">{formatCurrency(metrics.paidToday)}</p>
          <p className="text-xs text-muted-foreground">Real cash receipts only</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Overdue</p>
          <p className="text-xl font-semibold text-destructive">{formatCurrency(metrics.overdue)}</p>
          <p className="text-xs text-muted-foreground">Existing shared overdue rule</p>
        </div>
      </div>
      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Highest Risk Drivers</p>
        <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {metrics.highestRiskDrivers.length === 0 ? (
            <p className="text-sm text-muted-foreground md:col-span-2 xl:col-span-5">No high-risk rental collection items right now.</p>
          ) : metrics.highestRiskDrivers.map((row) => (
            <Link
              key={row.driverId}
              to={`/admin/drivers/${row.driverId}?tab=finance`}
              className="rounded-md border p-3 transition hover:bg-muted/50"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{row.driverName}</p>
                {row.riskLevel && <RiskBadge level={row.riskLevel as DriverRiskLevel} />}
              </div>
              <p className="mt-1 text-sm font-semibold">{formatCurrency(row.amountDue)}</p>
              <p className="text-xs text-muted-foreground">{row.daysOverdue} day(s) overdue</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function HealthCards({ health }: { health: FinancialHealthSummary }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      {health.cards.map((card) => (
        <Card key={card.key} className={cn('border', toneClass(card.tone))}>
          <CardContent className="min-h-[116px] p-4">
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm font-medium">{card.label}</p>
              <Badge className="w-fit whitespace-nowrap" variant={card.tone === 'healthy' ? 'success' : card.tone === 'warning' ? 'high' : 'destructive'}>
                {card.status}
              </Badge>
            </div>
            <p className="mt-3 text-xs leading-relaxed opacity-80">{card.detail}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function AdminFinancialOperations() {
  const queryClient = useQueryClient();
  const guard = useRoleGuard();
  const canAccessFinancialOps = !guard.isLoading && guard.canManagePayments();
  useFinancialRealtime({ scope: 'admin', enabled: canAccessFinancialOps });
  const [selectedDrivers, setSelectedDrivers] = useState<Set<string>>(new Set());
  const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const fromDate = useMemo(() => addDays(TODAY, -90), []);
  const olderFromDate = useMemo(() => addDays(TODAY, -180), []);
  const toDate = useMemo(() => addDays(TODAY, 30), []);

  const paymentsQuery = useQuery({
    queryKey: ['financial-operations', 'payments', olderFromDate, toDate],
    enabled: canAccessFinancialOps,
    queryFn: async () => {
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from('payments')
          .select(`
            id, driver_id, customer_id, amount, amount_paid, due_date, paid_date, paid_at,
            payment_type, rental_id, status, wave_transaction_id,
            drivers(full_name, phone_number),
            rentals(vehicles(model_name, license_plate)),
            loans(loan_type, amount_approved)
          `)
          .gte('due_date', olderFromDate)
          .lte('due_date', toDate)
          .order('due_date', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows as unknown as PaymentRow[];
    },
  });

  const metricPaymentsQuery = useQuery({
    queryKey: ['financial-operations', 'metric-payments', toDate],
    enabled: canAccessFinancialOps,
    queryFn: async () => {
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from('payments')
          .select(`
            id, driver_id, customer_id, amount, amount_paid, due_date, paid_date, paid_at,
            payment_type, rental_id, status, wave_transaction_id,
            drivers(full_name, phone_number),
            rentals(vehicles(model_name, license_plate)),
            loans(loan_type, amount_approved)
          `)
          .in('status', EXPECTED_PAYMENT_STATUS_FILTER)
          .lte('due_date', toDate)
          .order('due_date', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows as unknown as PaymentRow[];
    },
  });

  const receiptsQuery = useQuery({
    queryKey: ['financial-operations', 'receipts', fromDate],
    enabled: canAccessFinancialOps,
    queryFn: async () => {
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from('payment_receipts')
          .select(`
            id, payment_id, amount, method, note, received_at, wave_transaction_id,
            payments(
              id, driver_id, customer_id, payment_type, rental_id,
              drivers(full_name, phone_number),
              rentals(vehicles(model_name, license_plate))
            )
          `)
          .gte('received_at', `${fromDate}T00:00:00Z`)
          .order('received_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows as unknown as ReceiptRow[];
    },
  });

  const invoicesQuery = useQuery({
    queryKey: ['financial-operations', 'invoices'],
    enabled: canAccessFinancialOps,
    queryFn: async () => {
      const rows = await fetchAllRows((from, to) =>
        financialSupabase
          .from<InvoiceRow[]>('invoice')
          .select('id, customer_id, driver_id, invoice_number, invoice_kind, status, total_ttc, amount_paid, remaining_due, issued_at, created_at, paid_at, cancelled_at, rental_id, driver_snapshot_name, currency_code, source_product_id, source_credit_account_id, source_application_id, obligation_type, idempotency_key')
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows as InvoiceRow[];
    },
  });

  const linksQuery = useQuery({
    queryKey: ['financial-operations', 'invoice-links'],
    enabled: canAccessFinancialOps,
    queryFn: async () => {
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from('invoice_payment_link')
          .select('invoice_id, payment_id, customer_id')
          .order('invoice_id', { ascending: true })
          .order('payment_id', { ascending: true })
          .range(from, to),
      );
      return rows as InvoicePaymentLinkRow[];
    },
  });

  const walletBalancesQuery = useQuery({
    queryKey: ['financial-operations', 'wallet-balances'],
    enabled: canAccessFinancialOps,
    queryFn: async () => {
      const [walletRows, driverRows] = await Promise.all([
        fetchAllRows((from, to) => supabase
          .from('wallet_balance_view')
          .select('*')
          .order('driver_id', { ascending: true, nullsFirst: false })
          .order('wallet_id', { ascending: true, nullsFirst: false })
          .range(from, to)),
        fetchAllRows((from, to) => supabase
          .from('drivers')
          .select('id, full_name, phone_number')
          .order('id', { ascending: true })
          .range(from, to)),
      ]);
      const driverMap = new Map(driverRows.map((driver) => [
        driver.id,
        { full_name: driver.full_name, phone_number: driver.phone_number },
      ]));
      return (walletRows as WalletBalanceRow[]).map((wallet) => ({
        ...wallet,
        driver_name: wallet.driver_id ? driverMap.get(wallet.driver_id)?.full_name ?? '—' : '—',
        phone: wallet.driver_id ? driverMap.get(wallet.driver_id)?.phone_number ?? null : null,
      }));
    },
  });

  const walletTxnsQuery = useQuery({
    queryKey: ['financial-operations', 'wallet-transactions', fromDate],
    enabled: canAccessFinancialOps,
    queryFn: async () => {
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from('driver_wallet_transactions')
          .select('id, driver_id, customer_id, invoice_id, payment_id, rental_id, type, direction, amount, balance_after, method, note, reference, created_at, drivers(full_name, phone_number)')
          .gte('created_at', `${fromDate}T00:00:00Z`)
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows as unknown as WalletTxnRow[];
    },
  });

  const rentalsQuery = useQuery({
    queryKey: ['financial-operations', 'rentals'],
    enabled: canAccessFinancialOps,
    queryFn: async () => {
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from('rentals')
          .select('id, driver_id, customer_id, status, approved_rate, requested_rate, payment_due_at, drivers(full_name, phone_number), vehicles(make, model_name, license_plate)')
          .in('status', OPEN_RENTAL_STATUSES)
          .order('payment_due_at', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows as unknown as RentalRow[];
    },
  });

  const creditScoresQuery = useQuery({
    queryKey: ['financial-operations', 'credit-scores'],
    enabled: canAccessFinancialOps,
    queryFn: async () => {
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from('credit_scores')
          .select('driver_id, score, calculation_week, created_at')
          .order('calculation_week', { ascending: false })
          .order('driver_id', { ascending: true })
          .range(from, to),
      );
      return rows as CreditScoreRow[];
    },
  });

  const driverAuditQuery = useQuery({
    queryKey: ['financial-operations', 'driver-audit-reminders'],
    enabled: canAccessFinancialOps,
    queryFn: async () => {
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from('driver_audit')
          .select('driver_id, action, created_at, metadata')
          .eq('action', 'financial_reminder_sent')
          .order('created_at', { ascending: false })
          .order('driver_id', { ascending: true })
          .range(from, to),
      );
      return rows as DriverAuditRow[];
    },
  });

  const invoiceAuditQuery = useQuery({
    queryKey: ['financial-operations', 'invoice-audit'],
    enabled: canAccessFinancialOps,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_audit')
        .select('id, invoice_id, action, actor_type, created_at, metadata, invoice(invoice_number, driver_snapshot_name)')
        .order('created_at', { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data ?? []) as unknown as InvoiceAuditRow[];
    },
  });

  const anomaliesQuery = useQuery({
    queryKey: ['financial-operations', 'settlement-anomalies'],
    enabled: canAccessFinancialOps,
    queryFn: async () => {
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from('v_wallet_settlement_anomalies')
          .select('*')
          .order('created_at', { ascending: false, nullsFirst: false })
          .order('wallet_txn_id', { ascending: true, nullsFirst: false })
          .range(from, to),
      );
      return rows as SettlementAnomalyRow[];
    },
  });

  const creditCollectionsQuery = useQuery({
    queryKey: ['financial-operations', 'credit-collections'],
    enabled: canAccessFinancialOps,
    queryFn: async () => {
      const { data, error } = await financialSupabase
        .from<CreditCollectionsRow[]>('v_credit_collections_queue')
        .select('case_id, driver_id, driver_name, driver_phone, product_name, current_status_label, delinquency_status_label, severity, total_past_due_amount, days_past_due, priority_score, invoice_number, active_promise_id, promised_payment_date, opened_at')
        .order('priority_score', { ascending: false })
        .limit(120);
      if (error) throw error;
      return data ?? [];
    },
  });

  const riskSummary = useDriversRiskSummary(canAccessFinancialOps);

  const payments = paymentsQuery.data ?? EMPTY_PAYMENTS;
  const metricPayments = metricPaymentsQuery.data ?? EMPTY_PAYMENTS;
  const receipts = receiptsQuery.data ?? EMPTY_RECEIPTS;
  const invoices = invoicesQuery.data ?? EMPTY_INVOICES;
  const links = linksQuery.data ?? EMPTY_LINKS;
  const wallets = walletBalancesQuery.data ?? EMPTY_WALLETS;
  const walletTxns = walletTxnsQuery.data ?? EMPTY_WALLET_TXNS;
  const rentals = rentalsQuery.data ?? EMPTY_RENTALS;
  const creditScores = creditScoresQuery.data ?? EMPTY_CREDIT_SCORES;
  const driverAudit = driverAuditQuery.data ?? EMPTY_DRIVER_AUDIT;
  const invoiceAudit = invoiceAuditQuery.data ?? EMPTY_INVOICE_AUDIT;
  const settlementAnomalies = anomaliesQuery.data ?? EMPTY_ANOMALIES;
  const creditCollections = creditCollectionsQuery.data ?? EMPTY_CREDIT_COLLECTIONS;
  const creditCollectionsPastDue = creditCollections.reduce((sum, row) => sum + row.total_past_due_amount, 0);
  const criticalCreditCollections = creditCollections.filter((row) => ['CRITICAL', 'HIGH'].includes(row.severity)).length;

  const paymentsById = useMemo(() => {
    const map = new Map<string, PaymentRow>();
    for (const payment of payments) map.set(payment.id, payment);
    for (const payment of metricPayments) map.set(payment.id, payment);
    return map;
  }, [payments, metricPayments]);
  const receiptsByPaymentId = useMemo(() => {
    const map = new Map<string, ReceiptRow[]>();
    for (const receipt of receipts) {
      const list = map.get(receipt.payment_id) ?? [];
      list.push(receipt);
      map.set(receipt.payment_id, list);
    }
    return map;
  }, [receipts]);
  const invoiceByPaymentId = useMemo(() => {
    const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));
    const map = new Map<string, InvoiceRow>();
    for (const link of links) {
      const invoice = invoiceMap.get(link.invoice_id);
      if (invoice) map.set(link.payment_id, invoice);
    }
    return map;
  }, [invoices, links]);

  const scoreByDriver = useMemo(() => {
    const map = new Map<string, number>();
    for (const score of creditScores) {
      if (!map.has(score.driver_id)) map.set(score.driver_id, score.score);
    }
    return map;
  }, [creditScores]);

  const riskByDriver = useMemo(() => {
    const map = new Map<string, RiskLevel>();
    for (const risk of riskSummary.data ?? []) {
      map.set(risk.driver_id, risk.level as RiskLevel);
    }
    return map;
  }, [riskSummary.data]);

  const lastReminderByDriver = useMemo(() => {
    const map = new Map<string, string>();
    for (const audit of driverAudit) {
      if (!map.has(audit.driver_id)) map.set(audit.driver_id, audit.created_at);
    }
    return map;
  }, [driverAudit]);

  const collectionSourcePayments: CollectionSourcePayment[] = useMemo(() => metricPayments.map((payment) => ({
    ...payment,
    driverName: payment.drivers?.full_name ?? null,
    driverPhone: payment.drivers?.phone_number ?? null,
    vehicleLabel: vehicleLabel(payment.rentals?.vehicles),
    score: scoreByDriver.get(payment.driver_id) ?? null,
    riskLevel: riskByDriver.get(payment.driver_id) ?? null,
    lastReminderAt: lastReminderByDriver.get(payment.driver_id) ?? null,
  })), [metricPayments, riskByDriver, scoreByDriver, lastReminderByDriver]);

  const collectionQueue = useMemo(
    () => buildCollectionsQueue(collectionSourcePayments, TODAY),
    [collectionSourcePayments],
  );

  const receiptMetrics = useMemo(
    () => receipts.map((receipt) => ({ ...receipt, payment_type: receipt.payments?.payment_type ?? null })),
    [receipts],
  );

  const overview: FinancialOverviewMetrics = useMemo(() => buildFinancialOverviewMetrics({
    payments: metricPayments,
    receipts,
    invoices,
    wallets,
    rentals,
    today: TODAY,
  }), [metricPayments, receipts, invoices, wallets, rentals]);

  const dailyRental = useMemo(() => buildDailyRentalCommandMetrics({
    payments: collectionSourcePayments,
    receipts: receiptMetrics,
    queue: collectionQueue,
    today: TODAY,
  }), [collectionSourcePayments, receiptMetrics, collectionQueue]);

  const walletHealth: WalletHealthMetrics = useMemo(
    () => buildWalletHealthMetrics(wallets, walletTxns),
    [wallets, walletTxns],
  );

  const reconciliationItems = useMemo(() => deriveReconciliationItems({
    anomalies: settlementAnomalies,
    invoices,
    links,
    paymentsById,
    wallets,
  }), [settlementAnomalies, invoices, links, paymentsById, wallets]);

  const health = useMemo(() => buildFinancialHealthSummary({
    recoveryRate: overview.recoveryRate,
    anomalyCount: reconciliationItems.length,
    overdueBalance: overview.overdueBalance,
    expectedToday: overview.expectedToday,
    lateOrOverduePayments: metricPayments.filter((payment) => ['late', 'overdue'].includes(payment.status)).length,
    negativeWallets: walletHealth.negativeWallets,
  }), [overview, reconciliationItems.length, metricPayments, walletHealth.negativeWallets]);

  const trend7 = useMemo(() => buildTrendData(metricPayments, receipts, TODAY, 7), [metricPayments, receipts]);
  const trend30 = useMemo(() => buildTrendData(metricPayments, receipts, TODAY, 30), [metricPayments, receipts]);
  const weekForecast = useMemo(() => buildWeekForecast(metricPayments, TODAY), [metricPayments]);

  const selectedQueueRows = useMemo(() =>
    collectionQueue.filter((row) => selectedDrivers.has(row.driverId)),
  [collectionQueue, selectedDrivers]);

  const paymentDetail: PaymentDetail | null = useMemo(() => {
    if (!selectedPayment) return null;
    return {
      payment: selectedPayment,
      receipts: receiptsByPaymentId.get(selectedPayment.id) ?? [],
      invoice: invoiceByPaymentId.get(selectedPayment.id) ?? null,
    };
  }, [selectedPayment, receiptsByPaymentId, invoiceByPaymentId]);

  const sendReminder = useMutation({
    mutationFn: async (rows: CollectionQueueRow[]) => {
      if (rows.length === 0) throw new Error('Select at least one driver.');
      const notifications = rows.map((row) => ({
        driver_id: row.driverId,
        customer_id: row.customerId,
        title: 'Rappel de paiement',
        message: `Votre solde à régulariser est de ${formatCurrency(row.amountDue)}. Merci de payer ou contacter DAM Africa.`,
        notification_type: 'payment_reminder',
        channel: 'in_app',
        send_status: 'sent',
        variables: {
          source: 'financial_operations_center',
          amount_due: row.amountDue,
          oldest_due_date: row.oldestDueDate,
        },
      }));
      const { error } = await supabase.from('notifications').insert(notifications);
      if (error) throw error;
      await Promise.all(rows.map((row) =>
        supabase.rpc('driver_log', {
          p_driver: row.driverId,
          p_action: 'financial_reminder_sent',
          p_metadata: {
            source: 'financial_operations_center',
            amount_due: row.amountDue,
            oldest_due_date: row.oldestDueDate,
          },
        }),
      ));
    },
    onSuccess: (_, rows) => {
      toast.success('Reminder sent', { description: `${rows.length} driver(s) notified.` });
      setSelectedDrivers(new Set());
      queryClient.invalidateQueries({ queryKey: ['financial-operations'] });
      queryClient.invalidateQueries({ queryKey: ['driver-audit'] });
    },
    onError: (error: Error) => {
      toast.error('Reminder failed', { description: error.message });
    },
  });

  const safeReconciliation = useMutation({
    mutationFn: async (item: ReconciliationItem) => {
      if (!item.safeAction) throw new Error(item.disabledReason ?? 'No safe action is available.');
      if (item.safeAction.kind === 'reconcile_invoice_status') {
        const { error } = await supabase.rpc('reconcile_invoice_status', { p_invoice_id: item.safeAction.invoiceId });
        if (error) throw error;
        return;
      }
      if (item.safeAction.kind === 'apply_wallet_credit_to_open_invoices') {
        const { error } = await supabase.rpc('apply_wallet_credit_to_open_invoices', { p_driver_id: item.safeAction.driverId });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.rpc('reverse_cancelled_invoice_payments', { p_invoice_id: item.safeAction.invoiceId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Safe reconciliation action completed');
      queryClient.invalidateQueries({ queryKey: ['financial-operations'] });
      queryClient.invalidateQueries({ queryKey: ['admin-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['admin-wallets-list'] });
    },
    onError: (error: Error) => {
      toast.error('Action unavailable', { description: error.message });
    },
  });

  const isLoading = guard.isLoading || paymentsQuery.isLoading || metricPaymentsQuery.isLoading || receiptsQuery.isLoading || invoicesQuery.isLoading || walletBalancesQuery.isLoading || rentalsQuery.isLoading || creditCollectionsQuery.isLoading;

  const toggleDriver = (driverId: string, checked: boolean) => {
    setSelectedDrivers((prev) => {
      const next = new Set(prev);
      if (checked) next.add(driverId);
      else next.delete(driverId);
      return next;
    });
  };

  const toggleAllVisible = (checked: boolean) => {
    setSelectedDrivers(checked ? new Set(collectionQueue.map((row) => row.driverId)) : new Set());
  };

  const exportCollections = () => {
    const rows = selectedQueueRows.length > 0 ? selectedQueueRows : collectionQueue;
    downloadCsv(`financial-collections-${TODAY}.csv`, [
      ['driver', 'phone', 'vehicle', 'amount_due', 'days_overdue', 'score', 'risk', 'last_reminder'],
      ...rows.map((row) => [
        row.driverName,
        row.driverPhone,
        row.vehicleLabel,
        row.amountDue,
        row.daysOverdue,
        row.score,
        row.riskLevel,
        row.lastReminderAt,
      ]),
    ]);
  };

  if (!guard.isLoading && !canAccessFinancialOps) {
    return (
      <AdminLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="text-destructive">Accès refusé</CardTitle>
              <CardDescription>Layer 2C Financial Operations is limited to super_admin and manager roles.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-5">
        <AdminBreadcrumb items={[{ label: 'Financial Operations' }]} />
        <AdminPageHeader
          title="Financial Operations"
          description="Daily rental collections, payment activity, KiraPay exposure, reconciliation, and cash flow in one operator view."
          action={(
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link to="/admin/billing"><FileText className="mr-2 h-4 w-4" /> Billing</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/admin/payments"><CircleDollarSign className="mr-2 h-4 w-4" /> Payments</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/admin/credit-collections"><ShieldCheck className="mr-2 h-4 w-4" /> Credit Collections</Link>
              </Button>
            </div>
          )}
        />

        {isLoading ? (
          <LoadingState message="Loading financial operations..." />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                label="Collected Today"
                value={formatCurrency(overview.collectedToday)}
                detail="Real cash-in only; wallet auto-apply excluded"
                icon={Banknote}
                tone="success"
              />
              <MetricCard
                label="Expected Today"
                value={formatCurrency(overview.expectedToday)}
                detail="Due today with pending, partial, late, overdue statuses"
                icon={Clock}
                tone={overview.expectedToday > overview.collectedToday ? 'warning' : 'default'}
              />
              <MetricCard
                label="Recovery Rate"
                value={`${overview.recoveryRate}%`}
                detail="Collected today divided by expected today"
                icon={TrendingUp}
                tone={overview.recoveryRate >= 95 ? 'success' : overview.recoveryRate >= 85 ? 'warning' : 'danger'}
              />
              <MetricCard
                label="Outstanding Balance"
                value={formatCurrency(overview.outstandingBalance)}
                detail="Remaining due, not invoice total"
                icon={AlertTriangle}
                tone={overview.outstandingBalance > 0 ? 'danger' : 'success'}
              />
              <MetricCard
                label="Credit Collections"
                value={formatCurrency(creditCollectionsPastDue)}
                detail={`${creditCollections.length} open case(s), ${criticalCreditCollections} high priority`}
                icon={ShieldCheck}
                tone={creditCollectionsPastDue > 0 ? 'warning' : 'success'}
              />
            </div>

            <DailyRentalCommandCenter metrics={dailyRental} />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="collections">Collections</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
                <TabsTrigger value="wallet">Wallet Operations</TabsTrigger>
                <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
                <TabsTrigger value="cash-flow">Cash Flow</TabsTrigger>
                <TabsTrigger value="health">Financial Health</TabsTrigger>
                <TabsTrigger value="audit">Audit</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <MetricCard label="Drivers Overdue" value={String(overview.driversOverdue)} detail="Existing shared overdue rule" icon={AlertTriangle} tone={overview.driversOverdue > 0 ? 'danger' : 'success'} />
                  <MetricCard label="Wallet Balance Exposure" value={formatCurrency(overview.walletBalanceExposure)} detail="Positive wallet credit outstanding" icon={Wallet} tone="warning" />
                  <MetricCard label="Active Rentals" value={String(overview.activeRentals)} detail="Open rental statuses only" icon={ShieldCheck} />
                </div>
                {creditCollections.length > 0 && (
                  <Card>
                    <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <CardTitle className="text-base">Credit Collections Snapshot</CardTitle>
                        <CardDescription>Open Layer 3E cases tied to Financial Engine invoices.</CardDescription>
                      </div>
                      <Button variant="outline" asChild>
                        <Link to="/admin/credit-collections">Open queue <ArrowRight className="ml-2 h-4 w-4" /></Link>
                      </Button>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-3">
                      {creditCollections.slice(0, 3).map((row) => (
                        <div key={row.case_id} className="rounded-lg border p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">{row.driver_name ?? 'Driver'}</p>
                              <p className="text-xs text-muted-foreground">{row.product_name ?? 'Credit'} · {row.invoice_number ?? 'No invoice number'}</p>
                            </div>
                            <Badge variant={row.severity === 'CRITICAL' || row.severity === 'HIGH' ? 'destructive' : 'secondary'}>
                              {row.delinquency_status_label ?? row.current_status_label ?? 'Open'}
                            </Badge>
                          </div>
                          <p className="mt-3 text-lg font-bold">{formatCurrency(row.total_past_due_amount)}</p>
                          <p className="text-xs text-muted-foreground">{row.days_past_due} day(s) late · priority {row.priority_score}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">7-Day Collection Trend</CardTitle>
                      <CardDescription>Expected vs real cash-in.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={trend7}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                          <YAxis tickFormatter={compactNumber} tick={{ fontSize: 12 }} />
                          <Tooltip formatter={(value: number) => formatCurrency(value)} />
                          <Bar dataKey="expected" name="Expected" fill={CHART_EXPECTED} radius={[4, 4, 0, 0]} />
                          <Bar dataKey="collected" name="Collected" fill={CHART_COLLECTED} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Financial Health Index</CardTitle>
                      <CardDescription>Informational score from recovery, anomalies, overdue balance, and late payments.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-end justify-between gap-4">
                        <div>
                          <p className="text-4xl font-semibold">{health.index}</p>
                          <p className="text-sm text-muted-foreground">out of 100</p>
                        </div>
                        <Badge variant={health.index >= 85 ? 'success' : health.index >= 65 ? 'high' : 'destructive'}>
                          {health.index >= 85 ? 'Healthy' : health.index >= 65 ? 'Warning' : 'Critical'}
                        </Badge>
                      </div>
                      <Progress value={health.index} />
                      <HealthCards health={health} />
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="collections" className="space-y-4">
                <DailyRentalCommandCenter metrics={dailyRental} />
                <Card>
                  <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-base">Collections Queue</CardTitle>
                      <CardDescription>Sorted by risk, balance, then oldest overdue item.</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => sendReminder.mutate(selectedQueueRows)}
                        disabled={selectedQueueRows.length === 0 || sendReminder.isPending}
                      >
                        <Send className="mr-2 h-4 w-4" /> Send Reminder
                      </Button>
                      <Button variant="outline" onClick={exportCollections}>
                        <Download className="mr-2 h-4 w-4" /> Export
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">
                              <Checkbox
                                checked={collectionQueue.length > 0 && selectedDrivers.size === collectionQueue.length}
                                onCheckedChange={(checked) => toggleAllVisible(checked === true)}
                                aria-label="Select all collection rows"
                              />
                            </TableHead>
                            <TableHead>Driver</TableHead>
                            <TableHead>Vehicle</TableHead>
                            <TableHead className="text-right">Amount Due</TableHead>
                            <TableHead>Days Overdue</TableHead>
                            <TableHead>Score</TableHead>
                            <TableHead>Risk</TableHead>
                            <TableHead>Last Reminder</TableHead>
                            <TableHead>Recommended Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {collectionQueue.length === 0 ? (
                            <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">No collection items right now.</TableCell></TableRow>
                          ) : collectionQueue.map((row) => (
                            <TableRow key={row.driverId}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedDrivers.has(row.driverId)}
                                  onCheckedChange={(checked) => toggleDriver(row.driverId, checked === true)}
                                  aria-label={`Select ${row.driverName}`}
                                />
                              </TableCell>
                              <TableCell>
                                <Link to={`/admin/drivers/${row.driverId}?tab=finance`} className="font-medium hover:underline">
                                  {row.driverName}
                                </Link>
                                <p className="text-xs text-muted-foreground">{row.driverPhone ?? '—'}</p>
                              </TableCell>
                              <TableCell>{row.vehicleLabel ?? '—'}</TableCell>
                              <TableCell className="text-right font-semibold">{formatCurrency(row.amountDue)}</TableCell>
                              <TableCell>{row.daysOverdue}</TableCell>
                              <TableCell>{row.score ?? '—'}</TableCell>
                              <TableCell>{row.riskLevel ? <RiskBadge level={row.riskLevel as DriverRiskLevel} /> : '—'}</TableCell>
                              <TableCell>{row.lastReminderAt ? formatDateShort(row.lastReminderAt) : '—'}</TableCell>
                              <TableCell>
                                {row.recommendedAction === 'Relancer' ? (
                                  <Button size="sm" variant="outline" onClick={() => sendReminder.mutate([row])}>
                                    Relancer
                                  </Button>
                                ) : row.recommendedAction === 'Encaisser' && row.primaryPaymentId ? (
                                  <Button size="sm" asChild>
                                    <Link to={`/admin/payments?payment_id=${row.primaryPaymentId}`}>Encaisser</Link>
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="outline" asChild>
                                    <Link to={`/admin/drivers/${row.driverId}?tab=finance`}>Voir</Link>
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="payments" className="space-y-4">
                <Card>
                  <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="text-base">Payment Feed</CardTitle>
                      <CardDescription>Wave, manual receipts, wallet settlements, and loan repayment activity.</CardDescription>
                    </div>
                    <Button variant="outline" asChild>
                      <Link to="/admin/payments">Open Payments Engine <ArrowRight className="ml-2 h-4 w-4" /></Link>
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Driver</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Method</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Linked Invoice</TableHead>
                            <TableHead aria-label="actions" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payments.slice(0, 80).map((payment) => {
                            const invoice = invoiceByPaymentId.get(payment.id);
                            const paymentReceipts = receiptsByPaymentId.get(payment.id) ?? [];
                            const primaryMethod = paymentReceipts.find(isRealCashReceipt)?.method ?? (paymentReceipts.some(isWalletAutoApplyReceipt) ? 'wallet' : null);
                            return (
                              <TableRow key={payment.id}>
                                <TableCell>{formatDateShort(payment.due_date)}</TableCell>
                                <TableCell>
                                  <Link to={`/admin/drivers/${payment.driver_id}?tab=finance`} className="font-medium hover:underline">
                                    {payment.drivers?.full_name ?? 'Conducteur'}
                                  </Link>
                                  <p className="text-xs text-muted-foreground">{paymentTypeLabel(payment.payment_type)}</p>
                                </TableCell>
                                <TableCell>
                                  <div className="font-medium">{formatCurrency(payment.amount)}</div>
                                  {payment.amount_paid > 0 && <p className="text-xs text-muted-foreground">Paid {formatCurrency(payment.amount_paid)}</p>}
                                </TableCell>
                                <TableCell>{primaryMethod === 'wallet' ? 'Wallet' : methodLabel(primaryMethod)}</TableCell>
                                <TableCell><StatusBadge kind="payment" status={payment.status} /></TableCell>
                                <TableCell>{invoice ? invoice.invoice_number ?? invoice.id.slice(0, 8) : '—'}</TableCell>
                                <TableCell className="text-right">
                                  <Button size="sm" variant="ghost" aria-label="View payment detail" onClick={() => setSelectedPayment(payment)}>
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="wallet" className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <MetricCard label="Total Wallet Balance" value={formatCurrency(walletHealth.totalBalance)} detail="Current available credit" icon={Wallet} tone="warning" />
                  <MetricCard label="Credits" value={formatCurrency(walletHealth.credits)} detail="Last 90 days" icon={TrendingUp} tone="success" />
                  <MetricCard label="Debits" value={formatCurrency(walletHealth.debits)} detail="Last 90 days" icon={TrendingDown} />
                  <MetricCard label="Auto-Applies" value={formatCurrency(walletHealth.autoApplies)} detail="Internal settlement, not cash-in" icon={RefreshCw} />
                  <MetricCard label="Refunds" value={formatCurrency(walletHealth.refunds)} detail="Cancellation/refund credits" icon={CheckCircle2} tone="success" />
                  <MetricCard label="Overpayments" value={formatCurrency(walletHealth.overpayments)} detail="Surplus converted to DAM credit" icon={Banknote} />
                </div>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Wallet Timeline</CardTitle>
                      <CardDescription>Credits, debits, auto-applies, refunds, and overpayments.</CardDescription>
                    </CardHeader>
                    <CardContent className="max-h-[560px] overflow-y-auto">
                      <div className="space-y-3">
                        {walletTxns.slice(0, 80).map((txn) => (
                          <div key={txn.id} className="flex items-start justify-between gap-4 border-b pb-3 last:border-0">
                            <div>
                              <p className="font-medium">{txn.drivers?.full_name ?? 'Conducteur'}</p>
                              <p className="text-sm text-muted-foreground">{txn.note || txn.type}</p>
                              <p className="text-xs text-muted-foreground">{formatDateTime(txn.created_at)}</p>
                            </div>
                            <div className="text-right">
                              <p className={cn('font-semibold', txn.direction === 'credit' ? 'text-emerald-600' : 'text-destructive')}>
                                {txn.direction === 'credit' ? '+' : '-'}{formatCurrency(txn.amount)}
                              </p>
                              <p className="text-xs text-muted-foreground">Balance {formatCurrency(txn.balance_after)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Wallet Anomalies</CardTitle>
                      <CardDescription>Integrated with the reconciliation queue.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {reconciliationItems.filter((item) => item.title.toLowerCase().includes('wallet')).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No wallet anomalies detected.</p>
                      ) : reconciliationItems.filter((item) => item.title.toLowerCase().includes('wallet')).map((item) => (
                        <div key={item.id} className="rounded-md border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium">{item.title}</p>
                            <Badge variant={severityVariant(item.severity)}>{item.severity}</Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="reconciliation" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Reconciliation Queue</CardTitle>
                    <CardDescription>Safe actions only. Unsupported repairs are disabled with a reason.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Severity</TableHead>
                            <TableHead>Issue</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reconciliationItems.length === 0 ? (
                            <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No reconciliation anomalies detected.</TableCell></TableRow>
                          ) : reconciliationItems.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell><Badge variant={severityVariant(item.severity)}>{item.severity}</Badge></TableCell>
                              <TableCell>
                                <div className="font-medium">{item.title}</div>
                                <p className="text-sm text-muted-foreground">{item.detail}</p>
                                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                                  {item.invoiceId && <Link className="text-primary hover:underline" to={`/admin/billing?invoice=${item.invoiceId}`}>View invoice</Link>}
                                  {item.paymentId && <Link className="text-primary hover:underline" to={`/admin/payments?payment_id=${item.paymentId}`}>View payment</Link>}
                                  {item.driverId && <Link className="text-primary hover:underline" to={`/admin/drivers/${item.driverId}?tab=finance`}>Driver finance</Link>}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(item.amount)}</TableCell>
                              <TableCell>
                                {item.safeAction ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={safeReconciliation.isPending}
                                    onClick={() => safeReconciliation.mutate(item)}
                                  >
                                    {item.safeAction.label}
                                  </Button>
                                ) : (
                                  <TooltipProvider>
                                    <UiTooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="sm" variant="outline" disabled>Escalate</Button>
                                      </TooltipTrigger>
                                      <TooltipContent>{item.disabledReason ?? 'No safe RPC exists.'}</TooltipContent>
                                    </UiTooltip>
                                  </TooltipProvider>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="cash-flow" className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {weekForecast.map((item) => (
                    <MetricCard key={item.label} label={item.label} value={formatCurrency(item.value)} detail="Forecast from unpaid scheduled payments" icon={Clock} />
                  ))}
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">30-Day Cash Flow Trend</CardTitle>
                    <CardDescription>Expected, collected, and gap.</CardDescription>
                  </CardHeader>
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trend30}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="label" interval={4} tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={compactNumber} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        <Area type="monotone" dataKey="expected" name="Expected" stroke={CHART_EXPECTED} fill={CHART_EXPECTED} fillOpacity={0.12} />
                        <Area type="monotone" dataKey="collected" name="Collected" stroke={CHART_COLLECTED} fill={CHART_COLLECTED} fillOpacity={0.18} />
                        <Area type="monotone" dataKey="gap" name="Gap" stroke={CHART_GAP} fill={CHART_GAP} fillOpacity={0.12} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="health" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Financial Health Index</CardTitle>
                    <CardDescription>Informational only, derived from recovery rate, anomalies, overdue balance, and late payments.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                      <div>
                        <p className="text-5xl font-semibold">{health.index}</p>
                        <p className="text-sm text-muted-foreground">Range 0-100</p>
                      </div>
                      <div className="w-full md:max-w-xl">
                        <Progress value={health.index} />
                      </div>
                    </div>
                    <HealthCards health={health} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="audit" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Financial Audit</CardTitle>
                    <CardDescription>Invoice audit and financial reminder activity.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {invoiceAudit.slice(0, 60).map((entry) => (
                        <div key={entry.id} className="flex items-start justify-between gap-4 border-b pb-3 last:border-0">
                          <div>
                            <p className="font-medium">{entry.action.replace(/_/g, ' ')}</p>
                            <p className="text-sm text-muted-foreground">
                              {entry.invoice?.invoice_number ?? entry.invoice_id ?? 'Invoice'} · {entry.invoice?.driver_snapshot_name ?? 'Driver'}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline">{entry.actor_type ?? 'system'}</Badge>
                            <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(entry.created_at)}</p>
                          </div>
                        </div>
                      ))}
                      {invoiceAudit.length === 0 && <p className="text-sm text-muted-foreground">No financial audit entries found.</p>}
                    </div>
                    <Separator className="my-4" />
                    <Button variant="outline" asChild>
                      <Link to="/admin/billing">Open Billing <ArrowRight className="ml-2 h-4 w-4" /></Link>
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      <Sheet open={!!paymentDetail} onOpenChange={(open) => !open && setSelectedPayment(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {paymentDetail && (
            <>
              <SheetHeader>
                <SheetTitle>Payment Detail</SheetTitle>
                <SheetDescription>
                  Invoice, wallet applied, Wave portion, remaining due, and receipt timeline.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-5 space-y-4">
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{paymentDetail.payment.drivers?.full_name ?? 'Conducteur'}</p>
                        <p className="text-sm text-muted-foreground">{paymentTypeLabel(paymentDetail.payment.payment_type)}</p>
                      </div>
                      <StatusBadge kind="payment" status={paymentDetail.payment.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Invoice</p>
                        <p className="font-medium">{paymentDetail.invoice?.invoice_number ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Remaining Due</p>
                        <p className="font-medium">{formatCurrency(getPaymentRemaining(paymentDetail.payment))}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Wallet Applied</p>
                        <p className="font-medium">
                          {formatCurrency(paymentDetail.receipts.filter(isWalletAutoApplyReceipt).reduce((sum, receipt) => sum + receipt.amount, 0))}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Wave Portion</p>
                        <p className="font-medium">
                          {formatCurrency(paymentDetail.receipts.filter((receipt) => receipt.method === 'wave').reduce((sum, receipt) => sum + receipt.amount, 0))}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Timeline</p>
                  {paymentDetail.receipts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No receipts recorded yet.</p>
                  ) : paymentDetail.receipts.map((receipt) => (
                    <div key={receipt.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{methodLabel(receipt.method)}</p>
                        <p className="font-semibold">{formatCurrency(receipt.amount)}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">{receipt.note ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(receipt.received_at)}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link to={`/admin/payments?payment_id=${paymentDetail.payment.id}`}>Open Payment</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to={`/admin/drivers/${paymentDetail.payment.driver_id}?tab=finance`}>Driver Finance</Link>
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}
