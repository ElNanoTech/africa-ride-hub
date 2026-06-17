import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  FileSpreadsheet,
  Link as LinkIcon,
  PauseCircle,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  WalletCards,
} from 'lucide-react';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { ListPageSkeleton } from '@/components/AdminSkeletons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { creditStatusLabel } from '@/hooks/useCreditProductEngineData';
import {
  useAdminRepaymentOperationsData,
  useAmendRepaymentSchedule,
  useGenerateRepaymentInvoice,
  useGenerateRepaymentSchedule,
  usePauseRepaymentSchedule,
  useSyncRepaymentStatuses,
  type RepaymentScheduleRow,
  type ScheduledObligationRow,
} from '@/hooks/useRepaymentOperationsData';
import { formatCurrency, formatDateShort } from '@/lib/format';

function statusVariant(status: string | null | undefined) {
  if (['ACTIVE', 'PAID', 'GENERATED', 'COMPLETED'].includes(status ?? '')) return 'verified';
  if (['OVERDUE', 'FAILED', 'CANCELLED', 'CRITICAL'].includes(status ?? '')) return 'destructive';
  if (['PAUSED', 'PARTIALLY_PAID', 'INVOICED', 'WARNING', 'PENDING', 'NOT_DUE'].includes(status ?? '')) return 'secondary';
  return 'outline';
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof WalletCards;
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
          </div>
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function obligationsFor(scheduleId: string, obligations: ScheduledObligationRow[]) {
  return obligations.filter((obligation) => obligation.schedule_id === scheduleId);
}

function ScheduleActions({
  schedule,
  firstOpenObligation,
}: {
  schedule: RepaymentScheduleRow;
  firstOpenObligation: ScheduledObligationRow | null;
}) {
  const generateInvoice = useGenerateRepaymentInvoice();
  const syncStatuses = useSyncRepaymentStatuses();
  const pauseSchedule = usePauseRepaymentSchedule();
  const amendSchedule = useAmendRepaymentSchedule();

  const askReason = (action: 'pause' | 'amend') => {
    const reason = window.prompt(action === 'pause' ? 'Reason for pausing this schedule' : 'Reason for creating a new schedule version');
    if (!reason) return;
    if (action === 'pause') pauseSchedule.mutate({ scheduleId: schedule.schedule_id, reason });
    else amendSchedule.mutate({ scheduleId: schedule.schedule_id, reason });
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={!firstOpenObligation || generateInvoice.isPending} onClick={() => firstOpenObligation && generateInvoice.mutate(firstOpenObligation.obligation_id)}>
        <ReceiptText className="h-4 w-4" />
        Generate Invoice
      </Button>
      <Button size="sm" variant="outline" disabled={syncStatuses.isPending} onClick={() => syncStatuses.mutate(schedule.schedule_id)}>
        <RefreshCw className="h-4 w-4" />
        Sync
      </Button>
      <Button size="sm" variant="outline" disabled={schedule.schedule_status !== 'ACTIVE' || pauseSchedule.isPending} onClick={() => askReason('pause')}>
        <PauseCircle className="h-4 w-4" />
        Pause
      </Button>
      <Button size="sm" variant="outline" disabled={!schedule.allow_schedule_amendment || amendSchedule.isPending} onClick={() => askReason('amend')}>
        <RotateCcw className="h-4 w-4" />
        Amend
      </Button>
    </div>
  );
}

export default function RepaymentOperations() {
  const { data, isLoading, isError, error, refetch } = useAdminRepaymentOperationsData();
  const generateSchedule = useGenerateRepaymentSchedule();

  if (isLoading) {
    return (
      <AdminLayout>
        <ListPageSkeleton />
      </AdminLayout>
    );
  }

  const schedules = data?.schedules ?? [];
  const obligations = data?.obligations ?? [];
  const invoices = data?.invoices ?? [];
  const accounts = data?.accounts ?? [];
  const anomalies = data?.anomalies ?? [];
  const auditEvents = data?.auditEvents ?? [];
  const scheduledAccountIds = new Set(schedules.map((schedule) => schedule.credit_account_id));
  const eligibleAccounts = accounts.filter((account) => account.status === 'ACTIVE' && !scheduledAccountIds.has(account.credit_account_id));
  const activeSchedules = schedules.filter((schedule) => schedule.schedule_status === 'ACTIVE');
  const openObligations = obligations.filter((obligation) => !['PAID', 'CANCELLED', 'SUPERSEDED'].includes(obligation.status));
  const linkedInvoices = invoices.filter((invoice) => Boolean((invoice as { source_schedule_id?: string | null }).source_schedule_id));

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminBreadcrumb items={[{ label: 'Dashboard', href: '/admin' }, { label: 'Repayment Operations' }]} />
        <AdminPageHeader
          title="Repayment Schedule Operations"
          description="Layer 3D schedules, obligations, invoice linkage, amendments, and reconciliation."
          action={(
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          )}
        />

        <Alert>
          <FileSpreadsheet className="h-4 w-4" />
          <AlertTitle>Financial Engine remains the payment source of truth</AlertTitle>
          <AlertDescription>
            Layer 3D creates repayment obligations and Financial Engine invoices. Wallet, Wave, ledger, collections, default, repossession, and title transfer remain outside this layer.
          </AlertDescription>
        </Alert>

        {isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load repayment operations</AlertTitle>
            <AlertDescription>{error instanceof Error ? error.message : 'Unknown error'}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={WalletCards} label="Active Schedules" value={activeSchedules.length} helper="One active schedule per credit account" />
          <MetricCard icon={CalendarClock} label="Open Obligations" value={openObligations.length} helper="Upcoming, partial, or overdue obligations" />
          <MetricCard icon={ReceiptText} label="Linked Invoices" value={linkedInvoices.length} helper="Issued through Financial Engine" />
          <MetricCard icon={AlertTriangle} label="Reconciliation" value={anomalies.length} helper="Info, warning, and critical findings" />
        </div>

        <Tabs defaultValue="schedules">
          <TabsList className="mb-4 flex h-auto flex-wrap">
            <TabsTrigger value="schedules">Schedules</TabsTrigger>
            <TabsTrigger value="obligations">Obligations</TabsTrigger>
            <TabsTrigger value="invoices">Invoice Linkage</TabsTrigger>
            <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="schedules">
            <Card>
              <CardHeader>
                <CardTitle>Schedule Queue</CardTitle>
                <CardDescription>Generate schedules only after credit account activation and fully executed contract linkage.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {eligibleAccounts.length > 0 && (
                  <div className="rounded-lg border p-3">
                    <p className="text-sm font-medium">Activated accounts without a schedule</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {eligibleAccounts.slice(0, 4).map((account) => (
                        <Button key={account.credit_account_id} size="sm" variant="outline" disabled={generateSchedule.isPending} onClick={() => generateSchedule.mutate(account.credit_account_id)}>
                          <BadgeCheck className="h-4 w-4" />
                          Generate {account.credit_account_id.slice(0, 8)}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {schedules.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No repayment schedules yet.</p>
                ) : (
                  <div className="space-y-3">
                    {schedules.map((schedule) => {
                      const scheduleObligations = obligationsFor(schedule.schedule_id, obligations);
                      const firstOpen = scheduleObligations.find((obligation) => !obligation.invoice_id && obligation.status === 'SCHEDULED') ?? null;
                      return (
                        <div key={schedule.schedule_id} className="rounded-lg border p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold">{schedule.credit_products?.name ?? schedule.credit_accounts?.credit_products?.name ?? 'Credit account'}</p>
                                <Badge variant={statusVariant(schedule.schedule_status) as never}>{creditStatusLabel(schedule.schedule_status)}</Badge>
                                <Badge variant="outline">v{schedule.schedule_version}</Badge>
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {creditStatusLabel(schedule.schedule_type)} · {schedule.term_count} terms · {formatDateShort(schedule.first_due_date)} to {formatDateShort(schedule.final_due_date)}
                              </p>
                              <p className="mt-2 text-sm">
                                Total {formatCurrency(schedule.total_repayment_amount)} · Principal {formatCurrency(schedule.financed_amount)} · Fees {formatCurrency(schedule.total_fees_amount)}
                              </p>
                            </div>
                            <ScheduleActions schedule={schedule} firstOpenObligation={firstOpen} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="obligations">
            <Card>
              <CardHeader>
                <CardTitle>Scheduled Obligations</CardTitle>
                <CardDescription>Immutable obligation dates and amounts. Status syncs from Financial Engine invoices.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Components</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Invoice</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {obligations.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No obligations yet</TableCell></TableRow>
                    ) : obligations.slice(0, 40).map((obligation) => (
                      <TableRow key={obligation.obligation_id}>
                        <TableCell>{obligation.sequence_number}</TableCell>
                        <TableCell>{formatDateShort(obligation.due_date)}</TableCell>
                        <TableCell>{formatCurrency(obligation.amount)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          P {formatCurrency(obligation.principal_amount)} · I {formatCurrency(obligation.interest_amount)} · F {formatCurrency(obligation.fee_amount)}
                        </TableCell>
                        <TableCell><Badge variant={statusVariant(obligation.status) as never}>{creditStatusLabel(obligation.status)}</Badge></TableCell>
                        <TableCell>{obligation.invoice_id ? <LinkIcon className="h-4 w-4 text-success" /> : creditStatusLabel(obligation.invoice_generation_status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices">
            <Card>
              <CardHeader>
                <CardTitle>Invoice Linkage</CardTitle>
                <CardDescription>Repayment invoices are generated through Financial Engine and remain payment-source-of-truth records.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Obligation</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linkedInvoices.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No repayment invoices yet</TableCell></TableRow>
                    ) : linkedInvoices.slice(0, 30).map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell>{invoice.invoice_number ?? invoice.id.slice(0, 8)}</TableCell>
                        <TableCell>{((invoice as { source_obligation_id?: string | null }).source_obligation_id ?? '').slice(0, 8) || '—'}</TableCell>
                        <TableCell>{creditStatusLabel(invoice.obligation_type)}</TableCell>
                        <TableCell><Badge variant={statusVariant(invoice.status.toUpperCase()) as never}>{invoice.status}</Badge></TableCell>
                        <TableCell>{formatCurrency(invoice.total_ttc)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reconciliation">
            <Card>
              <CardHeader>
                <CardTitle>Reconciliation Anomalies</CardTitle>
                <CardDescription>Schedule, obligation, and invoice mismatches detected for operations review.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Severity</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Detected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {anomalies.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No reconciliation anomalies</TableCell></TableRow>
                    ) : anomalies.slice(0, 30).map((anomaly) => (
                      <TableRow key={anomaly.anomaly_id}>
                        <TableCell><Badge variant={statusVariant(anomaly.severity) as never}>{anomaly.severity}</Badge></TableCell>
                        <TableCell>{anomaly.anomaly_type}</TableCell>
                        <TableCell>{anomaly.schedule_id?.slice(0, 8) ?? '—'}</TableCell>
                        <TableCell>{formatDateShort(anomaly.detected_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <Card>
              <CardHeader>
                <CardTitle>Repayment Audit</CardTitle>
                <CardDescription>High-risk actions require reasons and immutable audit records.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditEvents.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No repayment audit events yet</TableCell></TableRow>
                    ) : auditEvents.slice(0, 40).map((event) => (
                      <TableRow key={event.audit_event_id}>
                        <TableCell>{event.event_type}</TableCell>
                        <TableCell>{event.schedule_id?.slice(0, 8) ?? '—'}</TableCell>
                        <TableCell>{event.reason ?? '—'}</TableCell>
                        <TableCell>{formatDateShort(event.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
