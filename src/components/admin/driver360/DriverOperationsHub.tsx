import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Bike,
  Car,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileText,
  Gauge,
  ShieldCheck,
  UserRound,
  Wallet,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { isPaymentOverdue, todayDateString } from '@/lib/payments';
import { RiskBadge } from '@/components/admin/RiskBadge';
import { supabase } from '@/integrations/supabase/routeClient';
import { useDriverRisk } from '@/hooks/useDriverRisk';
import { useDriver360Summary, useDriverWallet, type Driver360Summary } from '@/hooks/useAdminData';
import {
  buildDriverHealthCards,
  buildLifecycleState,
  buildOwnershipReadiness,
  type HealthCard,
} from '@/lib/driverOperationsHub';
import type { Database } from '@/integrations/supabase/types';

type DriverRow = Database['public']['Tables']['drivers']['Row'] & {
  vehicles?: {
    id: string;
    model_name: string | null;
    license_plate: string | null;
    vehicle_type: string | null;
  } | null;
};
type PaymentRow = Pick<Database['public']['Tables']['payments']['Row'], 'id' | 'status' | 'due_date' | 'amount' | 'amount_paid' | 'paid_date'>;
type LoanRow = Pick<Database['public']['Tables']['loans']['Row'], 'id' | 'loan_type' | 'status' | 'amount_requested' | 'amount_approved' | 'applied_at'>;
type InspectionRow = Pick<Database['public']['Tables']['vehicle_inspections']['Row'], 'id' | 'status' | 'due_at' | 'submitted_at' | 'reviewed_at' | 'immobilization_state' | 'vehicle_id'>;
type DocumentRow = Pick<Database['public']['Tables']['driver_documents']['Row'], 'id' | 'document_type' | 'status' | 'expiry_date' | 'uploaded_at'>;
type InvoiceRow = Pick<Database['public']['Tables']['invoice']['Row'], 'id' | 'status' | 'remaining_due' | 'total_ttc'>;

interface DriverOperationsHubProps {
  driver: DriverRow;
  onEdit: () => void;
  onAssignVehicle: () => void;
  onSendMessage: () => void;
  onGenerateInvoice: () => void;
  actionMenu: React.ReactNode;
}

const HEALTH_TONE_CLASS: Record<HealthCard['tone'], string> = {
  healthy: 'border-emerald-200/70 bg-emerald-50 text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-100',
  watch: 'border-amber-200/70 bg-amber-50 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-100',
  danger: 'border-red-200/70 bg-red-50 text-red-900 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-100',
  neutral: 'border-border bg-card text-foreground',
};

const HEALTH_ICON: Record<HealthCard['key'], React.ElementType> = {
  payments: CreditCard,
  kyc: ShieldCheck,
  fleet_control: Gauge,
  vehicle: Car,
  credit: Wallet,
  risk: AlertTriangle,
};

const RISK_LABEL: Record<string, string> = {
  bon: 'Bon',
  moyen: 'Modere',
  eleve: 'Eleve',
  critique: 'Critique',
};

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function activeInspectionState(row: InspectionRow | null | undefined): Parameters<typeof buildDriverHealthCards>[0]['fleetControlState'] {
  if (!row) return 'none';
  const today = todayDateString();
  const dueDate = row.due_at.slice(0, 10);
  const daysUntilDue = Math.ceil((new Date(`${dueDate}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000);
  if (row.immobilization_state && row.immobilization_state !== 'none') return 'blocked';
  if (['blocked', 'overdue'].includes(row.status) || dueDate < today) return 'late';
  if (row.status === 'rejected') return 'rejected';
  if (row.status === 'submitted') return 'submitted';
  if (daysUntilDue <= 3) return 'due_soon';
  return 'ok';
}

function mostRecentScore(scores: Array<{ score: number; calculation_week: string }> | undefined) {
  return scores?.[0]?.score ?? null;
}

function statusLabel(status: string) {
  switch (status) {
    case 'active':
      return 'Active';
    case 'suspended':
      return 'Suspended';
    case 'blocked':
      return 'Blocked';
    case 'pending_kyc':
      return 'Pending KYC';
    case 'inactive':
      return 'Inactive';
    default:
      return status;
  }
}

function driverStatusClass(status: string) {
  switch (status) {
    case 'active':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200/70 dark:bg-emerald-950/30 dark:text-emerald-100 dark:border-emerald-800/50';
    case 'suspended':
    case 'blocked':
      return 'bg-red-100 text-red-800 border-red-200/70 dark:bg-red-950/30 dark:text-red-100 dark:border-red-800/50';
    case 'pending_kyc':
      return 'bg-amber-100 text-amber-800 border-amber-200/70 dark:bg-amber-950/30 dark:text-amber-100 dark:border-amber-800/50';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

function dailyRate(summary: Driver360Summary | undefined) {
  return summary?.current_rental?.daily_rate ?? null;
}

export function DriverOperationsHub({
  driver,
  onEdit,
  onAssignVehicle,
  onSendMessage,
  onGenerateInvoice,
  actionMenu,
}: DriverOperationsHubProps) {
  const risk = useDriverRisk(driver.id);
  const summary = useDriver360Summary(driver.id);
  const wallet = useDriverWallet(driver.id);

  const payments = useQuery({
    queryKey: ['driver-ops-payments', driver.id],
    staleTime: 60_000,
    queryFn: async (): Promise<PaymentRow[]> => {
      const { data, error } = await supabase
        .from('payments')
        .select('id, status, due_date, amount, amount_paid, paid_date')
        .eq('driver_id', driver.id)
        .order('due_date', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const invoices = useQuery({
    queryKey: ['driver-ops-invoices', driver.id],
    staleTime: 60_000,
    queryFn: async (): Promise<InvoiceRow[]> => {
      const { data, error } = await supabase
        .from('invoice')
        .select('id, status, remaining_due, total_ttc')
        .eq('driver_id', driver.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const inspections = useQuery({
    queryKey: ['driver-ops-inspections', driver.id],
    staleTime: 60_000,
    queryFn: async (): Promise<InspectionRow[]> => {
      const { data, error } = await supabase
        .from('vehicle_inspections')
        .select('id, status, due_at, submitted_at, reviewed_at, immobilization_state, vehicle_id')
        .eq('driver_id', driver.id)
        .order('due_at', { ascending: true })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const scores = useQuery({
    queryKey: ['driver-ops-scores', driver.id],
    staleTime: 60_000,
    queryFn: async (): Promise<Array<{ score: number; tier: string; calculation_week: string }>> => {
      const { data, error } = await supabase
        .from('credit_scores')
        .select('score, tier, calculation_week')
        .eq('driver_id', driver.id)
        .order('calculation_week', { ascending: false })
        .limit(52);
      if (error) throw error;
      return data ?? [];
    },
  });

  const loans = useQuery({
    queryKey: ['driver-ops-loans', driver.id],
    staleTime: 60_000,
    queryFn: async (): Promise<LoanRow[]> => {
      const { data, error } = await supabase
        .from('loans')
        .select('id, loan_type, status, amount_requested, amount_approved, applied_at')
        .eq('driver_id', driver.id)
        .order('applied_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const documents = useQuery({
    queryKey: ['driver-ops-documents', driver.id],
    staleTime: 60_000,
    queryFn: async (): Promise<DocumentRow[]> => {
      const { data, error } = await supabase
        .from('driver_documents')
        .select('id, document_type, status, expiry_date, uploaded_at')
        .eq('driver_id', driver.id)
        .order('uploaded_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const latestScore = summary.data?.credit_score?.current ?? mostRecentScore(scores.data);
  const activeInspection = (inspections.data ?? []).find((row) =>
    ['pending', 'submitted', 'rejected', 'overdue', 'blocked'].includes(row.status),
  ) ?? inspections.data?.[0] ?? null;
  const overduePayments = (payments.data ?? []).filter((payment) => isPaymentOverdue(payment)).length;
  const openInvoices = (invoices.data ?? []).filter((invoice) =>
    ['issued', 'partial', 'overdue'].includes(invoice.status) && (invoice.remaining_due ?? invoice.total_ttc) > 0,
  );
  const weeksHistory = scores.data?.length ?? 0;
  const ownership = buildOwnershipReadiness({
    score: latestScore,
    weeksHistory,
    payments: payments.data as PaymentLike[] | undefined ?? [],
  });
  const lifecycle = buildLifecycleState(latestScore, weeksHistory);
  const healthCards = buildDriverHealthCards({
    overduePayments,
    unpaidInvoices: openInvoices.length,
    kycStatus: driver.kyc_status,
    fleetControlState: activeInspectionState(activeInspection),
    hasVehicle: !!driver.active_vehicle_id || !!summary.data?.current_rental,
    hasActiveRental: !!summary.data?.current_rental,
    eligibleOfferCount: ownership.eligibleCategories.length,
    nextOfferCategory: ownership.nextCategory,
    riskLevel: risk.data?.level,
  });

  const openLoan = useMemo(
    () => (loans.data ?? []).find((loan) => ['pending', 'under_review', 'approved', 'repaying'].includes(loan.status)),
    [loans.data],
  );
  const walletBalance = wallet.data?.wallet?.balance ?? summary.data?.wallet.balance_fcfa ?? null;
  const rentalRate = dailyRate(summary.data);
  const docsNeedingReview = (documents.data ?? []).filter((doc) =>
    doc.status !== 'approved' && doc.status !== 'verified',
  ).length;
  const riskReasons = risk.data?.reasons ?? [];

  return (
    <section className="space-y-4 mb-6" data-testid="driver-operations-hub">
      <Card className="border-border/70 shadow-sm">
        <CardContent className="p-4 lg:p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 gap-4">
                  <Avatar className="h-16 w-16 border shadow-sm">
                    <AvatarImage src={driver.profile_image_url ?? undefined} alt={driver.full_name} />
                    <AvatarFallback className="text-lg font-semibold">{initials(driver.full_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-semibold tracking-normal leading-tight">{driver.full_name}</h1>
                      <Badge variant="outline" className={driverStatusClass(driver.driver_status)}>
                        {statusLabel(driver.driver_status)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">Driver 360</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span>{driver.phone_number}</span>
                      <span>Yango: {driver.yango_driver_id}</span>
                      {driver.permit_number && <span>Permis {driver.permit_number}</span>}
                      {driver.permit_expiry_date && <span>Exp. {formatDateShort(driver.permit_expiry_date)}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 md:justify-end">
                  <Button size="sm" variant="outline" onClick={onEdit}>
                    <UserRound className="h-4 w-4 mr-2" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={onAssignVehicle} disabled={driver.driver_status !== 'active'}>
                    <Car className="h-4 w-4 mr-2" /> Assign Vehicle
                  </Button>
                  <Button size="sm" variant="outline" onClick={onSendMessage}>
                    <Activity className="h-4 w-4 mr-2" /> Send Alert
                  </Button>
                  <Button size="sm" onClick={onGenerateInvoice} disabled={!driver.customer_id}>
                    <FileText className="h-4 w-4 mr-2" /> Create Invoice
                  </Button>
                  {actionMenu}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Signal label="Score" value={latestScore ?? '—'} detail={latestScore ? lifecycle.trustLevel : 'Non calcule'} icon={Gauge} loading={scores.isLoading || summary.isLoading} />
                <Signal
                  label="Risk"
                  value={risk.data?.level ? RISK_LABEL[risk.data.level] : '—'}
                  detail={riskReasons[0] ?? 'Calcul en direct'}
                  icon={AlertTriangle}
                  loading={risk.isLoading}
                />
                <Signal
                  label="Wallet"
                  value={walletBalance === null ? '—' : formatCurrency(walletBalance)}
                  detail="Solde DAM disponible"
                  icon={Wallet}
                  loading={wallet.isLoading || summary.isLoading}
                />
                <Signal
                  label="Rental"
                  value={rentalRate === null ? '—' : `${formatCurrency(rentalRate)}/day`}
                  detail={summary.data?.current_rental?.vehicle_plate ?? 'Aucune location active'}
                  icon={CreditCard}
                  loading={summary.isLoading}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {healthCards.map((card) => (
                  <HealthTile key={card.key} card={card} />
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <Card className="border-border/70">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Driver Lifecycle</CardTitle>
                  <CardDescription>Operational asset to ownership candidate</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Stage</p>
                      <p className="font-semibold">{lifecycle.stage}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase text-muted-foreground">Next</p>
                      <p className="font-semibold">{lifecycle.nextStage}</p>
                    </div>
                  </div>
                  <Progress value={lifecycle.progress} className="h-3" />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{lifecycle.progress}% complete</span>
                    <span>{lifecycle.pointsRemaining} points remaining</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/70">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Ownership Candidate</CardTitle>
                  <CardDescription>Readiness based on score, history, and payments</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <OwnershipLine icon={Bike} label="Eligible" value={ownership.eligibleCategories.length ? ownership.eligibleCategories.join(', ') : 'None yet'} />
                    <OwnershipLine icon={Car} label="Not yet eligible" value={ownership.eligibleCategories.includes('Voiture') ? '—' : 'Vehicle'} />
                  </div>
                  <div className="rounded-md border p-3 text-sm">
                    <p className="font-medium mb-1">Needs for vehicle ownership</p>
                    <div className="grid gap-1 text-muted-foreground">
                      <span>+{ownership.vehicleScoreGap} score points</span>
                      <span>{ownership.vehicleWeeksGap} more week(s)</span>
                      <span>{ownership.vehiclePaymentRateGap}% payment-rate gap</span>
                    </div>
                  </div>
                  {openLoan && (
                    <div className="flex items-center justify-between rounded-md border p-3 text-sm">
                      <span className="font-medium">Current application</span>
                      <Badge variant="outline">{openLoan.loan_type} · {openLoan.status}</Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Risk Explanation</CardTitle>
            <CardDescription>No black-box label: every risk state is explained.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <RiskBadge level={risk.data?.level} reasons={risk.data?.reasons} loading={risk.isLoading} />
              {risk.error && <span className="text-xs text-destructive">Risk RPC unavailable</span>}
            </div>
            {risk.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : riskReasons.length > 0 ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {riskReasons.map((reason) => (
                  <li key={reason} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Données de risque non disponibles.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">What Requires Action</CardTitle>
            <CardDescription>Current blocking items on this driver record.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 text-sm">
              <ActionLine active={overduePayments > 0} label={`${overduePayments} overdue payment(s)`} to={`/admin/drivers/${driver.id}?tab=finance`} />
              <ActionLine active={docsNeedingReview > 0 || driver.kyc_status !== 'verified'} label={`${docsNeedingReview} document item(s) to review`} to={`/admin/drivers/${driver.id}?tab=documents`} />
              <ActionLine active={activeInspectionState(activeInspection) !== 'ok' && activeInspectionState(activeInspection) !== 'none'} label={activeInspection ? `Fleet Control: ${activeInspection.status}` : 'No active Fleet Control cycle'} to={`/admin/drivers/${driver.id}?tab=fleet-control`} />
              <ActionLine active={ownership.vehicleScoreGap > 0 || ownership.vehicleWeeksGap > 0} label={`Ownership: ${ownership.progress}% ready`} to={`/admin/drivers/${driver.id}?tab=growth`} />
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function Signal({
  icon: Icon,
  label,
  value,
  detail,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  detail: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      {loading ? (
        <Skeleton className="h-6 w-24 mt-2" />
      ) : (
        <>
          <div className="mt-1 text-lg font-semibold truncate">{value}</div>
          <div className="text-xs text-muted-foreground truncate" title={detail}>{detail}</div>
        </>
      )}
    </div>
  );
}

function HealthTile({ card }: { card: HealthCard }) {
  const Icon = HEALTH_ICON[card.key];
  return (
    <div className={cn('rounded-md border p-3 min-h-[96px]', HEALTH_TONE_CLASS[card.tone])}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs uppercase opacity-75">{card.label}</div>
        <Icon className="h-4 w-4 shrink-0 opacity-80" />
      </div>
      <div className="mt-2 font-semibold">{card.state}</div>
      <div className="text-xs opacity-80 leading-snug">{card.detail}</div>
    </div>
  );
}

function OwnershipLine({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function ActionLine({ active, label, to }: { active: boolean; label: string; to: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-2.5">
      <span className="inline-flex min-w-0 items-center gap-2">
        {active ? (
          <Clock3 className="h-4 w-4 text-amber-500 shrink-0" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        )}
        <span className="truncate">{label}</span>
      </span>
      <Button asChild size="sm" variant="ghost">
        <Link to={to}>Open</Link>
      </Button>
    </div>
  );
}
