import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  BellRing,
  CalendarPlus,
  CheckCircle2,
  FileWarning,
  MessageSquare,
  PhoneCall,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  UserCheck,
  WalletCards,
} from 'lucide-react';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { ListPageSkeleton } from '@/components/AdminSkeletons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  collectionsEventLabel,
  collectionsSeverityLabel,
  collectionsStatusLabel,
  useAdminCreditCollectionsData,
  useAssignCreditCollectionsCase,
  useBreakPromiseToPay,
  useCloseCreditCollectionsCase,
  useCreatePromiseToPay,
  useEscalateCreditRisk,
  useLogCreditCollectionContact,
  useOpenDefaultReview,
  useOpenCreditCollectionsCase,
  useSendCreditCollectionReminder,
  useSyncCreditCollections,
  type CreditCollectionsQueueRow,
} from '@/hooks/useCreditCollectionsData';
import { useRealtimeSubscription, type RealtimeTableName } from '@/hooks/useRealtimeSubscription';
import { formatCurrency, formatDateShort } from '@/lib/format';

type Variant = 'default' | 'secondary' | 'destructive' | 'outline' | 'verified';

const EMPTY_COLLECTIONS_QUEUE: CreditCollectionsQueueRow[] = [];
const COLLECTIONS_REALTIME_TABLES: RealtimeTableName[] = [
  'credit_collections_cases',
  'credit_collection_actions',
  'credit_promises_to_pay',
  'credit_reminders',
  'credit_risk_escalations',
];

function badgeVariant(value: string | null | undefined): Variant {
  if (['CRITICAL', 'HIGH', 'ESCALATED', 'DEFAULT_REVIEW', 'ESCALATED_RISK', 'COLLECTIONS_QUEUE', 'LATE'].includes(value ?? '')) return 'destructive';
  if (['MEDIUM', 'PROMISE_TO_PAY', 'PARTIALLY_RECOVERED', 'PARTIAL_RECOVERY', 'IN_CONTACT', 'GRACE_PERIOD'].includes(value ?? '')) return 'secondary';
  if (['LOW', 'RESOLVED', 'PAID', 'CURRENT'].includes(value ?? '')) return 'verified';
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

function rowMatches(row: CreditCollectionsQueueRow, search: string) {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [
    row.driver_name,
    row.driver_phone,
    row.product_name,
    row.invoice_number,
    row.case_id,
    row.credit_account_id,
    row.obligation_id,
  ].some((value) => value?.toLowerCase().includes(q));
}

function CaseWorkbench({
  selectedCase,
  data,
}: {
  selectedCase: CreditCollectionsQueueRow | null;
  data: NonNullable<ReturnType<typeof useAdminCreditCollectionsData>['data']>;
}) {
  const assignCase = useAssignCreditCollectionsCase();
  const logContact = useLogCreditCollectionContact();
  const createPromise = useCreatePromiseToPay();
  const breakPromise = useBreakPromiseToPay();
  const sendReminder = useSendCreditCollectionReminder();
  const escalateRisk = useEscalateCreditRisk();
  const openDefaultReview = useOpenDefaultReview();
  const closeCase = useCloseCreditCollectionsCase();

  const [contactNote, setContactNote] = useState('');
  const [driverVisible, setDriverVisible] = useState(false);
  const [promiseAmount, setPromiseAmount] = useState('');
  const [promiseDate, setPromiseDate] = useState('');
  const [reminderType, setReminderType] = useState('LATE');
  const [escalationType, setEscalationType] = useState('SEVERE_DELINQUENCY');
  const [escalationReason, setEscalationReason] = useState('');
  const [closeReason, setCloseReason] = useState('');

  useEffect(() => {
    setContactNote('');
    setDriverVisible(false);
    setPromiseAmount('');
    setPromiseDate('');
    setReminderType('LATE');
    setEscalationType('SEVERE_DELINQUENCY');
    setEscalationReason('');
    setCloseReason('');
  }, [selectedCase?.case_id]);

  if (!selectedCase) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Select a case from the ranked queue to work it.
        </CardContent>
      </Card>
    );
  }

  const caseActions = data.actions.filter((action) => action.case_id === selectedCase.case_id);
  const casePromises = data.promises.filter((promise) => promise.case_id === selectedCase.case_id);
  const caseReminders = data.reminders.filter((reminder) => reminder.case_id === selectedCase.case_id);
  const caseEscalations = data.escalations.filter((escalation) => escalation.case_id === selectedCase.case_id);
  const activePromise = casePromises.find((promise) => promise.promise_status === 'ACTIVE') ?? null;

  const submitContact = () => {
    if (contactNote.trim().length < 3) return;
    logContact.mutate({
      caseId: selectedCase.case_id,
      note: contactNote.trim(),
      driverVisible,
      actionType: 'CONTACT_ATTEMPT',
    }, {
      onSuccess: () => setContactNote(''),
    });
  };

  const submitPromise = () => {
    const amount = Number(promiseAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !promiseDate) return;
    createPromise.mutate({
      caseId: selectedCase.case_id,
      amount: Math.round(amount),
      promisedDate: promiseDate,
    }, {
      onSuccess: () => {
        setPromiseAmount('');
        setPromiseDate('');
      },
    });
  };

  const submitEscalation = () => {
    if (escalationReason.trim().length < 5) return;
    escalateRisk.mutate({
      caseId: selectedCase.case_id,
      escalationType,
      reason: escalationReason.trim(),
    }, {
      onSuccess: () => setEscalationReason(''),
    });
  };

  const submitDefaultReview = () => {
    if (escalationReason.trim().length < 5) return;
    openDefaultReview.mutate({
      caseId: selectedCase.case_id,
      reason: escalationReason.trim(),
    }, {
      onSuccess: () => setEscalationReason(''),
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>{selectedCase.driver_name ?? 'Driver'} · {selectedCase.product_name ?? 'Credit product'}</CardTitle>
              <CardDescription>
                {selectedCase.invoice_number ?? selectedCase.invoice_id?.slice(0, 8) ?? 'No invoice'} · due {selectedCase.due_date ? formatDateShort(selectedCase.due_date) : 'not set'}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={badgeVariant(selectedCase.current_status) as never}>{selectedCase.current_status_label || collectionsStatusLabel(selectedCase.current_status)}</Badge>
              <Badge variant={badgeVariant(selectedCase.severity) as never}>{collectionsSeverityLabel(selectedCase.severity)}</Badge>
              <Badge variant="outline">Priority {selectedCase.priority_score}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Past due</p>
            <p className="text-lg font-semibold">{formatCurrency(selectedCase.total_past_due_amount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Days late</p>
            <p className="text-lg font-semibold">{selectedCase.days_past_due}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Risk level</p>
            <p className="text-lg font-semibold">{collectionsStatusLabel(selectedCase.risk_level)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="text-lg font-semibold">{selectedCase.delinquency_status_label || collectionsStatusLabel(selectedCase.delinquency_status)}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contact & Reminders</CardTitle>
            <CardDescription>Driver-safe notes and reminder delivery through the audit trail.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" disabled={assignCase.isPending} onClick={() => assignCase.mutate({ caseId: selectedCase.case_id })}>
              <UserCheck className="h-4 w-4" />
              Assign to me
            </Button>
            <div className="space-y-2">
              <Label htmlFor="contact-note">Contact note</Label>
              <Textarea
                id="contact-note"
                value={contactNote}
                onChange={(event) => setContactNote(event.target.value)}
                placeholder="Call outcome, next step, or driver explanation"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={driverVisible} onCheckedChange={setDriverVisible} />
                  Driver-visible note
                </label>
                <Button size="sm" disabled={contactNote.trim().length < 3 || logContact.isPending} onClick={submitContact}>
                  <PhoneCall className="h-4 w-4" />
                  Log contact
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Select value={reminderType} onValueChange={setReminderType}>
                <SelectTrigger aria-label="Reminder type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DUE_SOON">Due soon</SelectItem>
                  <SelectItem value="DUE_TODAY">Due today</SelectItem>
                  <SelectItem value="GRACE_PERIOD">Grace period</SelectItem>
                  <SelectItem value="LATE">Late payment</SelectItem>
                  <SelectItem value="PROMISE_TO_PAY_REMINDER">Promise reminder</SelectItem>
                  <SelectItem value="BROKEN_PROMISE">Broken promise</SelectItem>
                  <SelectItem value="ESCALATION_WARNING">Priority follow-up</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" disabled={sendReminder.isPending} onClick={() => sendReminder.mutate({ caseId: selectedCase.case_id, reminderType })}>
                <BellRing className="h-4 w-4" />
                Send
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Promise & Recovery</CardTitle>
            <CardDescription>Promise-to-pay records never change invoices; payments still settle through Financial Engine.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activePromise ? (
              <div className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">Active promise</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(activePromise.promised_amount)} by {formatDateShort(activePromise.promised_payment_date)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={breakPromise.isPending}
                    onClick={() => breakPromise.mutate({ promiseId: activePromise.promise_id, reason: 'Promise not met from admin queue' })}
                  >
                    Mark not met
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  type="number"
                  min="1"
                  value={promiseAmount}
                  onChange={(event) => setPromiseAmount(event.target.value)}
                  placeholder="Amount"
                />
                <Input type="date" value={promiseDate} onChange={(event) => setPromiseDate(event.target.value)} />
                <Button disabled={!promiseAmount || !promiseDate || createPromise.isPending} onClick={submitPromise}>
                  <CalendarPlus className="h-4 w-4" />
                  Save
                </Button>
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Recovery progress</span>
                <span>{selectedCase.total_past_due_amount > 0 && selectedCase.promised_amount ? Math.min(100, Math.round((selectedCase.promised_amount / selectedCase.total_past_due_amount) * 100)) : 0}%</span>
              </div>
              <Progress value={selectedCase.total_past_due_amount > 0 && selectedCase.promised_amount ? Math.min(100, Math.round((selectedCase.promised_amount / selectedCase.total_past_due_amount) * 100)) : 0} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Risk Escalation & Closure</CardTitle>
          <CardDescription>Operational risk routing only. No contract rewrite, asset action, or invoice settlement happens here.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-3">
            <Select value={escalationType} onValueChange={setEscalationType}>
              <SelectTrigger aria-label="Escalation type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SEVERE_DELINQUENCY">Severe delinquency</SelectItem>
                <SelectItem value="REPEATED_LATE_PAYMENT">Repeated late payment</SelectItem>
                <SelectItem value="BROKEN_PROMISE_TO_PAY">Broken promise-to-pay</SelectItem>
                <SelectItem value="ASSET_RISK">Asset risk</SelectItem>
                <SelectItem value="DRIVER_UNREACHABLE">Driver unreachable</SelectItem>
                <SelectItem value="MULTIPLE_OBLIGATIONS_OVERDUE">Multiple obligations overdue</SelectItem>
                <SelectItem value="DEFAULT_REVIEW_OPENED">Priority review opened</SelectItem>
              </SelectContent>
            </Select>
            <Textarea value={escalationReason} onChange={(event) => setEscalationReason(event.target.value)} placeholder="Reason and evidence" />
            <div className="flex flex-wrap gap-2">
              <Button disabled={escalationReason.trim().length < 5 || escalateRisk.isPending} onClick={submitEscalation}>
                <ShieldAlert className="h-4 w-4" />
                Escalate risk
              </Button>
              <Button variant="outline" disabled={escalationReason.trim().length < 5 || openDefaultReview.isPending} onClick={submitDefaultReview}>
                <FileWarning className="h-4 w-4" />
                Open review
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            <Textarea value={closeReason} onChange={(event) => setCloseReason(event.target.value)} placeholder="Closure reason" />
            <Button
              variant="outline"
              disabled={closeReason.trim().length < 5 || closeCase.isPending}
              onClick={() => closeCase.mutate({ caseId: selectedCase.case_id, reason: closeReason.trim() }, { onSuccess: () => setCloseReason('') })}
            >
              <CheckCircle2 className="h-4 w-4" />
              Close case
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Recent Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {caseActions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No actions logged yet.</p>
            ) : caseActions.slice(0, 6).map((action) => (
              <div key={action.action_id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{collectionsEventLabel(action.action_type)}</span>
                  <Badge variant={action.driver_visible ? 'secondary' : 'outline'}>{action.driver_visible ? 'Driver visible' : 'Internal'}</Badge>
                </div>
                {action.action_note && <p className="mt-1 text-muted-foreground">{action.action_note}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Reminders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {caseReminders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reminders yet.</p>
            ) : caseReminders.slice(0, 6).map((reminder) => (
              <div key={reminder.reminder_id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{collectionsEventLabel(reminder.reminder_type)}</span>
                  <Badge variant={badgeVariant(reminder.status) as never}>{collectionsStatusLabel(reminder.status)}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">{reminder.channel} · {reminder.sent_at ? formatDateShort(reminder.sent_at) : 'Pending'}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Escalations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {caseEscalations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open risk escalation.</p>
            ) : caseEscalations.slice(0, 6).map((escalation) => (
              <div key={escalation.escalation_id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{collectionsEventLabel(escalation.escalation_type)}</span>
                  <Badge variant={badgeVariant(escalation.severity) as never}>{collectionsSeverityLabel(escalation.severity)}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">{escalation.reason}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function CreditCollections() {
  const [searchParams] = useSearchParams();
  useRealtimeSubscription({
    tables: COLLECTIONS_REALTIME_TABLES,
    showToasts: false,
  });
  const driverFilter = searchParams.get('driver');
  const { data, isLoading, isError, error, refetch } = useAdminCreditCollectionsData();
  const syncCollections = useSyncCreditCollections();
  const openCase = useOpenCreditCollectionsCase();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const queue = data?.queue ?? EMPTY_COLLECTIONS_QUEUE;
  const filteredQueue = useMemo(() => (
    queue.filter((row) => {
      if (driverFilter && row.driver_id !== driverFilter) return false;
      if (severityFilter !== 'all' && row.severity !== severityFilter) return false;
      if (statusFilter !== 'all' && row.delinquency_status !== statusFilter && row.current_status !== statusFilter) return false;
      return rowMatches(row, search);
    })
  ), [driverFilter, queue, search, severityFilter, statusFilter]);

  useEffect(() => {
    if (!selectedCaseId && filteredQueue.length > 0) {
      setSelectedCaseId(filteredQueue[0].case_id);
    }
  }, [filteredQueue, selectedCaseId]);

  const selectedCase = filteredQueue.find((row) => row.case_id === selectedCaseId) ?? filteredQueue[0] ?? null;
  const criticalCases = queue.filter((row) => row.severity === 'CRITICAL' || row.current_status === 'DEFAULT_REVIEW');
  const promiseCases = queue.filter((row) => row.active_promise_id);
  const totalPastDue = queue.reduce((sum, row) => sum + (row.total_past_due_amount ?? 0), 0);
  const anomalies = data?.anomalies ?? [];

  if (isLoading) {
    return (
      <AdminLayout>
        <ListPageSkeleton />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminBreadcrumb items={[{ label: 'Dashboard', href: '/admin' }, { label: 'Credit Collections' }]} />
        <AdminPageHeader
          title="Credit Collections"
          description="Layer 3E delinquency, collections queue, promise-to-pay, risk escalation, and reconciliation."
          action={(
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Button disabled={syncCollections.isPending} onClick={() => syncCollections.mutate(null)}>
                <SlidersHorizontal className="h-4 w-4" />
                Sync collections
              </Button>
            </div>
          )}
        />

        <Alert>
          <WalletCards className="h-4 w-4" />
          <AlertTitle>Financial Engine remains the source of truth</AlertTitle>
          <AlertDescription>
            Collections reads obligations and invoices, records operational follow-up, and never marks invoices paid or creates new repayment schedules.
          </AlertDescription>
        </Alert>

        {isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load credit collections</AlertTitle>
            <AlertDescription>{error instanceof Error ? error.message : 'Unknown error'}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={MessageSquare} label="Open Cases" value={queue.length} helper="Ranked by severity, lateness, amount, and risk" />
          <MetricCard icon={WalletCards} label="Past Due" value={formatCurrency(totalPastDue)} helper="Unpaid Financial Engine balance" />
          <MetricCard icon={CalendarPlus} label="Promises" value={promiseCases.length} helper="Active promise-to-pay records" />
          <MetricCard icon={FileWarning} label="Critical Reviews" value={criticalCases.length} helper="Priority risk routing" />
        </div>

        <Tabs defaultValue="queue">
          <TabsList className="mb-4 flex h-auto flex-wrap">
            <TabsTrigger value="queue">Queue</TabsTrigger>
            <TabsTrigger value="workbench">Case Workbench</TabsTrigger>
            <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="queue">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <CardTitle>Ranked Collections Queue</CardTitle>
                    <CardDescription>Filter by severity, delinquency state, driver, invoice, or credit account.</CardDescription>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_160px_190px]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search queue" className="pl-9" />
                    </div>
                    <Select value={severityFilter} onValueChange={setSeverityFilter}>
                      <SelectTrigger aria-label="Severity filter"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All severity</SelectItem>
                        <SelectItem value="CRITICAL">Critical</SelectItem>
                        <SelectItem value="HIGH">High</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="LOW">Low</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger aria-label="Status filter"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="LATE">Late</SelectItem>
                        <SelectItem value="COLLECTIONS_QUEUE">Collections queue</SelectItem>
                        <SelectItem value="PROMISE_TO_PAY">Promise-to-pay</SelectItem>
                        <SelectItem value="PARTIALLY_RECOVERED">Partially recovered</SelectItem>
                        <SelectItem value="ESCALATED_RISK">Escalated risk</SelectItem>
                        <SelectItem value="DEFAULT_REVIEW">Priority review</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Past Due</TableHead>
                      <TableHead>Promise</TableHead>
                      <TableHead>Risk</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQueue.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                          No active collections cases match the current filters.
                        </TableCell>
                      </TableRow>
                    ) : filteredQueue.map((row) => (
                      <TableRow key={row.case_id} className={selectedCase?.case_id === row.case_id ? 'bg-muted/40' : undefined}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{row.driver_name ?? 'Driver'}</p>
                            <p className="text-xs text-muted-foreground">{row.product_name ?? row.product_type ?? 'Credit'} · {row.driver_phone ?? 'No phone'}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant={badgeVariant(row.delinquency_status) as never}>{row.delinquency_status_label || collectionsStatusLabel(row.delinquency_status)}</Badge>
                            <Badge variant={badgeVariant(row.current_status) as never}>{row.current_status_label || collectionsStatusLabel(row.current_status)}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{row.days_past_due} day(s) late · due {row.due_date ? formatDateShort(row.due_date) : 'n/a'}</p>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{formatCurrency(row.total_past_due_amount)}</p>
                          <p className="text-xs text-muted-foreground">{row.invoice_number ?? row.invoice_status ?? 'No invoice'}</p>
                        </TableCell>
                        <TableCell>
                          {row.active_promise_id ? (
                            <div>
                              <Badge variant="secondary">{collectionsStatusLabel(row.promise_status)}</Badge>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatCurrency(row.promised_amount ?? 0)} · {row.promised_payment_date ? formatDateShort(row.promised_payment_date) : 'date n/a'}
                              </p>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">No active promise</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={badgeVariant(row.severity) as never}>{collectionsSeverityLabel(row.severity)}</Badge>
                          <p className="mt-1 text-xs text-muted-foreground">{collectionsStatusLabel(row.risk_level)} · level {row.escalation_level}</p>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{row.priority_score}</p>
                          <p className="text-xs text-muted-foreground">score impact {row.score_impact}</p>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => setSelectedCaseId(row.case_id)}>Work</Button>
                            <Button size="sm" variant="outline" asChild>
                              <Link to={`/admin/drivers/${row.driver_id}`}>Driver 360</Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="workbench">
            {data && <CaseWorkbench selectedCase={selectedCase} data={data} />}
          </TabsContent>

          <TabsContent value="reconciliation">
            <Card>
              <CardHeader>
                <CardTitle>Collections Reconciliation</CardTitle>
                <CardDescription>Checks obligations, invoices, promises, and open cases for operational drift.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Severity</TableHead>
                      <TableHead>Anomaly</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Detected</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {anomalies.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No reconciliation findings.</TableCell>
                      </TableRow>
                    ) : anomalies.map((anomaly) => (
                      <TableRow key={anomaly.anomaly_id}>
                        <TableCell><Badge variant={badgeVariant(anomaly.severity) as never}>{collectionsSeverityLabel(anomaly.severity)}</Badge></TableCell>
                        <TableCell>
                          <p className="font-medium">{collectionsEventLabel(anomaly.anomaly_type)}</p>
                          <p className="text-xs text-muted-foreground">{JSON.stringify(anomaly.details_json)}</p>
                        </TableCell>
                        <TableCell className="text-sm">
                          {anomaly.case_id?.slice(0, 8) ?? anomaly.obligation_id?.slice(0, 8) ?? anomaly.credit_account_id?.slice(0, 8) ?? 'n/a'}
                        </TableCell>
                        <TableCell>{formatDateShort(anomaly.detected_at)}</TableCell>
                        <TableCell>
                          {anomaly.credit_account_id ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={openCase.isPending}
                              onClick={() => openCase.mutate({
                                creditAccountId: anomaly.credit_account_id as string,
                                obligationId: anomaly.obligation_id,
                                reason: anomaly.anomaly_type,
                              })}
                            >
                              Open case
                            </Button>
                          ) : (
                            <span className="text-sm text-muted-foreground">Review data</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rules">
            <Card>
              <CardHeader>
                <CardTitle>Versioned Collections Rules</CardTitle>
                <CardDescription>Collections thresholds are read from product version snapshots.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {(data?.productVersions ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No product versions found.</p>
                ) : (data?.productVersions ?? []).map((version) => (
                  <div key={version.version_id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{version.credit_products?.name ?? 'Product version'}</p>
                        <p className="text-sm text-muted-foreground">v{version.version_number} · {collectionsStatusLabel(version.status)}</p>
                      </div>
                      <Badge variant="outline">{version.credit_products?.product_type ?? 'Credit'}</Badge>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      {Object.entries(version.collections_rules_json ?? {}).map(([key, value]) => (
                        <div key={key}>
                          <dt className="text-muted-foreground">{key.replace(/_/g, ' ')}</dt>
                          <dd className="font-medium">{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <Card>
              <CardHeader>
                <CardTitle>Immutable Audit Trail</CardTitle>
                <CardDescription>Recent Layer 3E audit events and case actions.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Case</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.auditEvents ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No audit events yet.</TableCell>
                      </TableRow>
                    ) : (data?.auditEvents ?? []).map((event) => (
                      <TableRow key={event.audit_event_id}>
                        <TableCell>{collectionsEventLabel(event.event_type)}</TableCell>
                        <TableCell className="font-mono text-xs">{event.case_id?.slice(0, 8) ?? 'n/a'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{event.reason ?? 'System update'}</TableCell>
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
