import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  UserCheck,
  WalletCards,
  XCircle,
} from 'lucide-react';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { ListPageSkeleton } from '@/components/AdminSkeletons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  OWNERSHIP_COMPLETION_REALTIME_TABLES,
  getOwnershipBlockers,
  getOwnershipReviewId,
  getOwnershipStatus,
  ownershipAuditEventLabel,
  ownershipDecisionLabel,
  ownershipStatusLabel,
  ownershipTone,
  ownershipTransferTypeLabel,
  useAdminOwnershipCompletionData,
  useAssignOwnershipCompletionReview,
  useCreateOwnershipCompletionDecision,
  useIssueOwnershipCertificate,
  useOpenOwnershipCompletionReview,
  useReverseOwnershipCompletion,
  useSyncOwnershipCompletionCandidates,
  type AdminOwnershipCompletionData,
  type AssetTransferRecordRow,
  type OwnershipCertificateRow,
  type OwnershipCompletionAuditEventRow,
  type OwnershipCompletionDecision,
  type OwnershipCompletionDecisionRow,
  type OwnershipCompletionQueueRow,
  type OwnershipCompletionReviewRow,
} from '@/hooks/useOwnershipCompletionData';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDateShort, formatDateTime } from '@/lib/format';

type BadgeVariant = BadgeProps['variant'];
type MetricTone = 'default' | 'success' | 'warning' | 'danger' | 'info';
type CompletionTab = 'queue' | 'review' | 'completed' | 'audit';

const EMPTY_QUEUE: OwnershipCompletionQueueRow[] = [];
const EMPTY_REVIEWS: OwnershipCompletionReviewRow[] = [];
const EMPTY_DECISIONS: OwnershipCompletionDecisionRow[] = [];
const EMPTY_TRANSFERS: AssetTransferRecordRow[] = [];
const EMPTY_CERTIFICATES: OwnershipCertificateRow[] = [];
const EMPTY_AUDIT: OwnershipCompletionAuditEventRow[] = [];

function badgeVariant(value: string | null | undefined): BadgeVariant {
  return ownershipTone(value) as BadgeVariant;
}

function metricToneClass(tone: MetricTone) {
  switch (tone) {
    case 'success': return 'border-success/30 bg-success/10 text-success';
    case 'warning': return 'border-warning/30 bg-warning/10 text-warning';
    case 'danger': return 'border-destructive/30 bg-destructive/10 text-destructive';
    case 'info': return 'border-primary/30 bg-primary/10 text-primary';
    default: return 'border-border bg-card text-foreground';
  }
}

function shortId(value: string | null | undefined) {
  return value ? value.slice(0, 8) : 'Non lie';
}

function dateLabel(value: string | null | undefined) {
  return value ? formatDateShort(value) : 'Non defini';
}

function dateTimeLabel(value: string | null | undefined) {
  return value ? formatDateTime(value) : 'Non defini';
}

function moneyLabel(value: number | null | undefined) {
  return formatCurrency(value ?? 0);
}

function statusOf(row: OwnershipCompletionQueueRow | null | undefined) {
  return getOwnershipStatus(row);
}

function reviewIdOf(review: OwnershipCompletionReviewRow | null | undefined) {
  return review?.completion_review_id ?? review?.review_id ?? null;
}

function reviewStatusOf(review: OwnershipCompletionReviewRow | null | undefined) {
  return review?.review_status ?? review?.status ?? null;
}

function assignedReviewerOf(review: OwnershipCompletionReviewRow | null | undefined, queueRow?: OwnershipCompletionQueueRow | null) {
  return review?.assigned_reviewer ?? review?.assigned_to ?? queueRow?.assigned_reviewer ?? queueRow?.assigned_to ?? null;
}

function isTerminalStatus(value: string | null | undefined) {
  return ['COMPLETED', 'REVERSED', 'CANCELLED'].includes(value ?? '');
}

function isTransferClosed(transfer: AssetTransferRecordRow | null | undefined) {
  return ['REVERSED', 'CANCELLED'].includes(transfer?.transfer_status ?? '');
}

function transferHasCertificate(transfer: AssetTransferRecordRow, certificates: OwnershipCertificateRow[]) {
  return certificates.some((certificate) => certificate.transfer_id === transfer.transfer_id);
}

function queueReview(row: OwnershipCompletionQueueRow | null, reviews: OwnershipCompletionReviewRow[]) {
  if (!row) return null;
  const reviewId = getOwnershipReviewId(row);
  return reviews.find((review) => (
    (reviewId && reviewIdOf(review) === reviewId)
    || review.credit_account_id === row.credit_account_id
  )) ?? null;
}

function queueTransfer(row: OwnershipCompletionQueueRow | null, transfers: AssetTransferRecordRow[]) {
  if (!row) return null;
  return transfers.find((transfer) => (
    transfer.transfer_id === row.transfer_id
    || transfer.credit_account_id === row.credit_account_id
  )) ?? null;
}

function queueCertificates(row: OwnershipCompletionQueueRow | null, certificates: OwnershipCertificateRow[], transfers: AssetTransferRecordRow[]) {
  if (!row) return [];
  const transfer = queueTransfer(row, transfers);
  return certificates.filter((certificate) => (
    certificate.transfer_id === transfer?.transfer_id
    || certificate.certificate_id === row.certificate_id
    || certificate.driver_id === row.driver_id
  ));
}

function queueDecisions(row: OwnershipCompletionQueueRow | null, decisions: OwnershipCompletionDecisionRow[], reviews: OwnershipCompletionReviewRow[]) {
  if (!row) return [];
  const review = queueReview(row, reviews);
  const reviewId = reviewIdOf(review) ?? getOwnershipReviewId(row);
  return decisions.filter((decision) => (
    (reviewId && (decision.review_id === reviewId || decision.completion_review_id === reviewId))
    || decision.credit_account_id === row.credit_account_id
  ));
}

function queueAudit(row: OwnershipCompletionQueueRow | null, auditEvents: OwnershipCompletionAuditEventRow[], reviews: OwnershipCompletionReviewRow[], transfers: AssetTransferRecordRow[]) {
  if (!row) return [];
  const review = queueReview(row, reviews);
  const transfer = queueTransfer(row, transfers);
  const reviewId = reviewIdOf(review) ?? getOwnershipReviewId(row);
  return auditEvents.filter((event) => (
    event.credit_account_id === row.credit_account_id
    || (!!reviewId && (event.review_id === reviewId || event.completion_review_id === reviewId))
    || (!!transfer?.transfer_id && event.transfer_id === transfer.transfer_id)
  ));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function queueMatches(row: OwnershipCompletionQueueRow, search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return [
    row.credit_account_id,
    row.driver_id,
    row.driver_name,
    row.driver_phone,
    row.asset_description,
    row.product_name,
    row.product_type,
    row.asset_type,
    row.status_label,
  ].some((value) => value?.toLowerCase().includes(query));
}

function completionProgress(row: OwnershipCompletionQueueRow | null | undefined) {
  if (!row) return 0;
  const paid = row.paid_obligations_count ?? row.obligations_paid_count ?? 0;
  const total = row.total_obligations_count ?? row.obligations_total_count ?? 0;
  if (total <= 0) return statusOf(row) === 'COMPLETED' ? 100 : 0;
  return Math.min(100, Math.round((paid / total) * 100));
}

function blockerLabel(blocker: string) {
  return blocker.replace(/_/g, ' ').toLowerCase();
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof WalletCards;
  tone?: MetricTone;
}) {
  return (
    <Card className={cn('border', metricToneClass(tone))}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>
          </div>
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background/80', metricToneClass(tone))}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function ActionButton({
  reason,
  children,
  ...props
}: ButtonProps & {
  reason?: string | null;
}) {
  const button = (
    <Button {...props} disabled={props.disabled || !!reason}>
      {children}
    </Button>
  );

  if (!reason) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex" tabIndex={0}>{button}</span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

function SummaryStrip({
  row,
  review,
  transfer,
  certificates,
}: {
  row: OwnershipCompletionQueueRow | null;
  review: OwnershipCompletionReviewRow | null;
  transfer: AssetTransferRecordRow | null;
  certificates: OwnershipCertificateRow[];
}) {
  if (!row) return null;
  const status = statusOf(row);
  const progress = completionProgress(row);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <CardTitle>{row.driver_name ?? 'Conducteur'}</CardTitle>
            <CardDescription>
              {row.product_name ?? row.product_type ?? 'Produit finance'} · {row.asset_description ?? row.asset_type ?? 'Actif a transferer'}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={badgeVariant(status)}>{row.status_label ?? ownershipStatusLabel(status)}</Badge>
            {review && <Badge variant={badgeVariant(reviewStatusOf(review))}>{ownershipStatusLabel(reviewStatusOf(review))}</Badge>}
            {transfer && <Badge variant={badgeVariant(transfer.transfer_status)}>{ownershipStatusLabel(transfer.transfer_status)}</Badge>}
            {certificates.length > 0 && <Badge variant="success">Certificat pret</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Solde restant</p>
            <p className="text-lg font-semibold">{moneyLabel(row.outstanding_balance)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Obligations payees</p>
            <p className="text-lg font-semibold">{row.paid_obligations_count ?? row.obligations_paid_count ?? 0}/{row.total_obligations_count ?? row.obligations_total_count ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Revue</p>
            <p className="font-mono text-sm">{shortId(reviewIdOf(review) ?? getOwnershipReviewId(row))}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Transfert</p>
            <p className="font-mono text-sm">{shortId(transfer?.transfer_id ?? row.transfer_id)}</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progression obligations</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>
      </CardContent>
    </Card>
  );
}

function QueueTable({
  rows,
  selectedAccountId,
  data,
  onSelect,
  onOpenReview,
  onAssignReview,
  opening,
  assigning,
}: {
  rows: OwnershipCompletionQueueRow[];
  selectedAccountId: string | null;
  data: AdminOwnershipCompletionData;
  onSelect: (row: OwnershipCompletionQueueRow) => void;
  onOpenReview: (row: OwnershipCompletionQueueRow) => void;
  onAssignReview: (row: OwnershipCompletionQueueRow) => void;
  opening: boolean;
  assigning: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Queue de completion</CardTitle>
        <CardDescription>Dossiers ou le paiement ne suffit pas: l equipe verifie les obligations avant le transfert.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conducteur</TableHead>
                <TableHead>Actif</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Solde</TableHead>
                <TableHead>Blocages</TableHead>
                <TableHead>Echeance</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                    Aucun dossier ne correspond aux filtres.
                  </TableCell>
                </TableRow>
              ) : rows.map((row) => {
                const review = queueReview(row, data.reviews);
                const reviewId = reviewIdOf(review) ?? getOwnershipReviewId(row);
                const blockers = getOwnershipBlockers(row);
                const status = statusOf(row);
                const openReason = reviewId
                  ? 'Une revue existe deja.'
                  : blockers.length > 0
                    ? 'Le dossier contient encore des blocages.'
                    : status !== 'ELIGIBLE_FOR_COMPLETION'
                      ? 'Le dossier doit etre eligible avant ouverture.'
                      : null;
                const assignReason = !reviewId
                  ? 'Ouvrez une revue avant assignation.'
                  : isTerminalStatus(status)
                    ? 'Le dossier est deja ferme.'
                    : null;

                return (
                  <TableRow
                    key={`${row.credit_account_id}-${reviewId ?? 'candidate'}`}
                    className={cn('cursor-pointer', selectedAccountId === row.credit_account_id && 'bg-muted/60')}
                    onClick={() => onSelect(row)}
                  >
                    <TableCell>
                      <div className="font-medium">{row.driver_name ?? 'Conducteur'}</div>
                      <div className="text-xs text-muted-foreground">{row.driver_phone ?? shortId(row.driver_id)}</div>
                    </TableCell>
                    <TableCell>
                      <div>{row.asset_description ?? row.product_name ?? 'Actif finance'}</div>
                      <div className="text-xs text-muted-foreground">{row.asset_type ?? row.product_type ?? shortId(row.asset_id)}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={badgeVariant(status)}>{row.status_label ?? ownershipStatusLabel(status)}</Badge>
                    </TableCell>
                    <TableCell>{moneyLabel(row.outstanding_balance)}</TableCell>
                    <TableCell>
                      {blockers.length === 0 ? (
                        <Badge variant="success">Aucun</Badge>
                      ) : (
                        <Badge variant="high">{blockers.length} a lever</Badge>
                      )}
                    </TableCell>
                    <TableCell>{dateLabel(row.review_due_at ?? row.decision_due_at)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <ActionButton
                          size="sm"
                          variant="outline"
                          reason={openReason}
                          disabled={opening}
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenReview(row);
                          }}
                        >
                          <ClipboardCheck className="h-4 w-4" />
                        </ActionButton>
                        <ActionButton
                          size="sm"
                          variant="outline"
                          reason={assignReason}
                          disabled={assigning}
                          onClick={(event) => {
                            event.stopPropagation();
                            onAssignReview(row);
                          }}
                        >
                          <UserCheck className="h-4 w-4" />
                        </ActionButton>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewDecisionPanel({
  selected,
  review,
  decisions,
  transfer,
  certificates,
  blockers,
  decisionReason,
  decisionSummary,
  certificateReference,
  reverseReason,
  secondApproverId,
  onDecisionReasonChange,
  onDecisionSummaryChange,
  onCertificateReferenceChange,
  onReverseReasonChange,
  onSecondApproverIdChange,
  onCreateDecision,
  onIssueCertificate,
  onReverse,
  decisionPending,
  certificatePending,
  reversePending,
}: {
  selected: OwnershipCompletionQueueRow | null;
  review: OwnershipCompletionReviewRow | null;
  decisions: OwnershipCompletionDecisionRow[];
  transfer: AssetTransferRecordRow | null;
  certificates: OwnershipCertificateRow[];
  blockers: string[];
  decisionReason: string;
  decisionSummary: string;
  certificateReference: string;
  reverseReason: string;
  secondApproverId: string;
  onDecisionReasonChange: (value: string) => void;
  onDecisionSummaryChange: (value: string) => void;
  onCertificateReferenceChange: (value: string) => void;
  onReverseReasonChange: (value: string) => void;
  onSecondApproverIdChange: (value: string) => void;
  onCreateDecision: (decision: OwnershipCompletionDecision) => void;
  onIssueCertificate: () => void;
  onReverse: () => void;
  decisionPending: boolean;
  certificatePending: boolean;
  reversePending: boolean;
}) {
  if (!selected) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Selectionnez un dossier pour ouvrir le paquet de revue.</CardContent>
      </Card>
    );
  }

  const reviewId = reviewIdOf(review) ?? getOwnershipReviewId(selected);
  const reviewStatus = reviewStatusOf(review) ?? statusOf(selected);
  const latestDecision = decisions[0];
  const terminal = isTerminalStatus(statusOf(selected));
  const decisionBaseReason = !reviewId
    ? 'Ouvrez une revue avant decision.'
    : terminal
      ? 'Le dossier est deja ferme.'
      : decisionReason.trim().length < 8
        ? 'Ajoutez une note de decision claire.'
        : null;
  const approveReason = decisionBaseReason ?? (blockers.length > 0 ? 'Les blocages doivent etre leves avant approbation.' : null);
  const issueReason = certificates.length > 0 || (transfer && transferHasCertificate(transfer, certificates))
    ? 'Un certificat existe deja pour ce transfert.'
    : !reviewId
      ? 'Ouvrez une revue avant certificat.'
      : reviewStatus !== 'AWAITING_FINAL_APPROVAL'
        ? 'Une approbation doit placer le dossier en validation finale.'
        : null;
  const secondApproverReason = secondApproverId.trim().length === 0
    ? 'Second approver requis.'
    : !isUuid(secondApproverId)
      ? 'UUID approbateur invalide.'
      : null;
  const reverseReasonText = !reviewId
    ? 'Aucune revue a annuler.'
    : !transfer?.transfer_id
      ? 'Aucun transfert a annuler.'
      : isTransferClosed(transfer)
        ? 'Ce transfert est deja ferme.'
        : reverseReason.trim().length < 12
          ? 'Une raison detaillee est requise.'
          : secondApproverReason;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_390px]">
      <Card>
        <CardHeader>
          <CardTitle>Paquet de revue</CardTitle>
          <CardDescription>Verification humaine des obligations, documents et risques avant liberation de l actif.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Documents</p>
              <p className="mt-1 font-semibold">{ownershipStatusLabel(selected.documentation_status)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Defaut / recouvrement</p>
              <p className="mt-1 font-semibold">{ownershipStatusLabel(selected.default_review_status ?? selected.recovery_plan_status ?? 'NONE')}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Fraude / hold legal</p>
              <p className="mt-1 font-semibold">{ownershipStatusLabel(selected.fraud_review_status ?? selected.legal_hold_status ?? 'NONE')}</p>
            </div>
          </div>

          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">Conditions de completion</p>
                <p className="text-xs text-muted-foreground">Paiement complet, aucun litige ouvert, dossier conducteur lisible.</p>
              </div>
              <Badge variant={blockers.length === 0 ? 'success' : 'high'}>{blockers.length === 0 ? 'Pret' : `${blockers.length} blocage(s)`}</Badge>
            </div>
            {blockers.length > 0 && (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {blockers.map((blocker) => (
                  <div key={blocker} className="flex gap-2 rounded-md bg-muted/50 p-2 text-sm">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <span>{blockerLabel(blocker)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Historique decisions</h3>
            <div className="space-y-2">
              {decisions.length === 0 ? (
                <div className="rounded-md border p-3 text-sm text-muted-foreground">Aucune decision enregistree.</div>
              ) : decisions.map((decision) => (
                <div key={decision.decision_id ?? decision.completion_decision_id ?? `${decision.review_id ?? decision.completion_review_id}-${decision.decision_timestamp}`} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{ownershipDecisionLabel(decision.decision)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{decision.decision_reason}</p>
                    </div>
                    <Badge variant={badgeVariant(decision.decision)}>{dateTimeLabel(decision.decision_timestamp)}</Badge>
                  </div>
                  {decision.decision_summary && <p className="mt-2 text-sm">{decision.decision_summary}</p>}
                </div>
              ))}
            </div>
          </div>

          {latestDecision && (
            <Alert>
              <LockKeyhole className="h-4 w-4" />
              <AlertTitle>Decision immutable</AlertTitle>
              <AlertDescription>Les corrections passent par une nouvelle action controlee ou une annulation motivee du transfert.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Actions de revue</CardTitle>
            <CardDescription>Chaque action exige une note exploitable par l equipe et le conducteur.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="decision-reason">Note de decision</Label>
              <Textarea
                id="decision-reason"
                value={decisionReason}
                onChange={(event) => onDecisionReasonChange(event.target.value)}
                placeholder="Ex: obligations confirmees, titre verifie, aucun litige ouvert"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="decision-summary">Resume interne</Label>
              <Textarea
                id="decision-summary"
                value={decisionSummary}
                onChange={(event) => onDecisionSummaryChange(event.target.value)}
                placeholder="Contexte supplementaire pour audit"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton reason={approveReason} disabled={decisionPending} onClick={() => onCreateDecision('APPROVE_COMPLETION')}>
                <CheckCircle2 className="h-4 w-4" />
                Approuver
              </ActionButton>
              <ActionButton variant="outline" reason={decisionBaseReason} disabled={decisionPending} onClick={() => onCreateDecision('REQUEST_REVIEW')}>
                <FileText className="h-4 w-4" />
                Revoir
              </ActionButton>
              <ActionButton variant="outline" reason={decisionBaseReason} disabled={decisionPending} onClick={() => onCreateDecision('ESCALATE')}>
                <AlertTriangle className="h-4 w-4" />
                Escalader
              </ActionButton>
              <ActionButton variant="destructive" reason={decisionBaseReason} disabled={decisionPending} onClick={() => onCreateDecision('REJECT_COMPLETION')}>
                <XCircle className="h-4 w-4" />
                Refuser
              </ActionButton>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Certificat & annulation</CardTitle>
            <CardDescription>Emission du certificat permanent et annulation controlee si une exception est confirmee.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="certificate-reference">Reference document</Label>
              <Input
                id="certificate-reference"
                value={certificateReference}
                onChange={(event) => onCertificateReferenceChange(event.target.value)}
                placeholder="Lien ou reference du document signe"
              />
            </div>
            <ActionButton className="w-full" reason={issueReason} disabled={certificatePending} onClick={onIssueCertificate}>
              <FileCheck2 className="h-4 w-4" />
              Emettre transfert & certificat
            </ActionButton>
            <div className="space-y-2">
              <Label htmlFor="reverse-reason">Raison d annulation</Label>
              <Textarea
                id="reverse-reason"
                value={reverseReason}
                onChange={(event) => onReverseReasonChange(event.target.value)}
                placeholder="Raison obligatoire avant toute annulation"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reverse-second-approver">Second approver</Label>
              <Input
                id="reverse-second-approver"
                value={secondApproverId}
                onChange={(event) => onSecondApproverIdChange(event.target.value)}
                placeholder="UUID approbateur distinct"
              />
            </div>
            <ActionButton className="w-full" variant="destructive" reason={reverseReasonText} disabled={reversePending} onClick={onReverse}>
              <RotateCcw className="h-4 w-4" />
              Annuler le transfert
            </ActionButton>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CompletedTransfers({
  transfers,
  certificates,
  certificateReference,
  reverseReason,
  secondApproverId,
  onCertificateReferenceChange,
  onReverseReasonChange,
  onSecondApproverIdChange,
  onIssueCertificate,
  onReverse,
  certificatePending,
  reversePending,
}: {
  transfers: AssetTransferRecordRow[];
  certificates: OwnershipCertificateRow[];
  certificateReference: string;
  reverseReason: string;
  secondApproverId: string;
  onCertificateReferenceChange: (value: string) => void;
  onReverseReasonChange: (value: string) => void;
  onSecondApproverIdChange: (value: string) => void;
  onIssueCertificate: (transfer: AssetTransferRecordRow) => void;
  onReverse: (transfer: AssetTransferRecordRow) => void;
  certificatePending: boolean;
  reversePending: boolean;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_390px]">
      <Card>
        <CardHeader>
          <CardTitle>Transferts completes</CardTitle>
          <CardDescription>Suivi des actifs liberes et des certificats associes.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transfert</TableHead>
                  <TableHead>Actif</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Certificat</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                      Aucun transfert finalise pour le moment.
                    </TableCell>
                  </TableRow>
                ) : transfers.map((transfer) => {
                  const certificate = certificates.find((item) => item.transfer_id === transfer.transfer_id);
                  const issueReason = certificate
                    ? 'Certificat deja emis.'
                    : !['APPROVED', 'COMPLETED'].includes(transfer.transfer_status)
                      ? 'Transfert non pret.'
                      : null;
                  const reverseReasonText = isTransferClosed(transfer)
                    ? 'Transfert deja ferme.'
                    : reverseReason.trim().length < 12
                      ? 'Raison detaillee requise.'
                      : !isUuid(secondApproverId)
                        ? 'Second approver UUID requis.'
                        : null;

                  return (
                    <TableRow key={transfer.transfer_id}>
                      <TableCell className="font-mono text-sm">{shortId(transfer.transfer_id)}</TableCell>
                      <TableCell>
                        <div className="font-mono text-sm">{shortId(transfer.asset_id)}</div>
                        <div className="text-xs text-muted-foreground">{shortId(transfer.credit_account_id)}</div>
                      </TableCell>
                      <TableCell>{ownershipTransferTypeLabel(transfer.transfer_type)}</TableCell>
                      <TableCell><Badge variant={badgeVariant(transfer.transfer_status)}>{ownershipStatusLabel(transfer.transfer_status)}</Badge></TableCell>
                      <TableCell>{certificate ? certificate.certificate_number : 'Non emis'}</TableCell>
                      <TableCell>{dateTimeLabel(transfer.completed_at ?? transfer.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <ActionButton size="sm" variant="outline" reason={issueReason} disabled={certificatePending} onClick={() => onIssueCertificate(transfer)}>
                            <FileCheck2 className="h-4 w-4" />
                          </ActionButton>
                          <ActionButton size="sm" variant="destructive" reason={reverseReasonText} disabled={reversePending} onClick={() => onReverse(transfer)}>
                            <RotateCcw className="h-4 w-4" />
                          </ActionButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Emission rapide</CardTitle>
            <CardDescription>Ces champs s appliquent aux actions de ligne ci-contre.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="completed-certificate-reference">Reference document</Label>
              <Input
                id="completed-certificate-reference"
                value={certificateReference}
                onChange={(event) => onCertificateReferenceChange(event.target.value)}
                placeholder="Reference du certificat"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="completed-reverse-reason">Raison d annulation</Label>
              <Textarea
                id="completed-reverse-reason"
                value={reverseReason}
                onChange={(event) => onReverseReasonChange(event.target.value)}
                placeholder="Raison obligatoire pour annuler"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="completed-second-approver">Second approver</Label>
              <Input
                id="completed-second-approver"
                value={secondApproverId}
                onChange={(event) => onSecondApproverIdChange(event.target.value)}
                placeholder="UUID approbateur distinct"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Certificats</CardTitle>
            <CardDescription>Preuve permanente de la completion conducteur.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {certificates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun certificat emis.</p>
            ) : certificates.slice(0, 8).map((certificate) => (
              <div key={certificate.certificate_id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{certificate.certificate_number}</p>
                    <p className="text-xs text-muted-foreground">{dateTimeLabel(certificate.issued_at)}</p>
                  </div>
                  <Badge variant={badgeVariant(certificate.certificate_status)}>{ownershipStatusLabel(certificate.certificate_status)}</Badge>
                </div>
                {certificate.document_reference && <p className="mt-2 text-xs text-muted-foreground">{certificate.document_reference}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AuditWorkspace({
  auditEvents,
  blockedRows,
  reversedTransfers,
}: {
  auditEvents: OwnershipCompletionAuditEventRow[];
  blockedRows: OwnershipCompletionQueueRow[];
  reversedTransfers: AssetTransferRecordRow[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_390px]">
      <Card>
        <CardHeader>
          <CardTitle>Audit & evenements</CardTitle>
          <CardDescription>Historique conserve pour expliquer chaque approbation, exception et annulation.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evenement</TableHead>
                  <TableHead>Dossier</TableHead>
                  <TableHead>Raison</TableHead>
                  <TableHead>Acteur</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditEvents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                      Aucun evenement d audit disponible.
                    </TableCell>
                  </TableRow>
                ) : auditEvents.map((event) => (
                  <TableRow key={event.audit_event_id}>
                    <TableCell>
                      <div className="font-medium">{ownershipAuditEventLabel(event.event_type)}</div>
                      <div className="text-xs text-muted-foreground">{event.event_type}</div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{shortId(event.credit_account_id ?? event.review_id ?? event.completion_review_id)}</TableCell>
                    <TableCell className="max-w-sm truncate">{event.reason ?? 'Non renseignee'}</TableCell>
                    <TableCell className="font-mono text-sm">{shortId(event.actor_id)}</TableCell>
                    <TableCell>{dateTimeLabel(event.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Exceptions ouvertes</CardTitle>
            <CardDescription>Blocages a clarifier avant toute liberation d actif.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {blockedRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune exception bloquante active.</p>
            ) : blockedRows.slice(0, 8).map((row) => (
              <div key={row.credit_account_id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{row.driver_name ?? 'Conducteur'}</p>
                    <p className="text-xs text-muted-foreground">{row.product_name ?? row.asset_description ?? shortId(row.credit_account_id)}</p>
                  </div>
                  <Badge variant="high">{getOwnershipBlockers(row).length}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{getOwnershipBlockers(row).map(blockerLabel).join(', ')}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Annulations</CardTitle>
            <CardDescription>Transferts revenus en controle apres validation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {reversedTransfers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune annulation enregistree.</p>
            ) : reversedTransfers.slice(0, 8).map((transfer) => (
              <div key={transfer.transfer_id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm">{shortId(transfer.transfer_id)}</p>
                    <p className="text-xs text-muted-foreground">{dateTimeLabel(transfer.updated_at ?? transfer.completed_at ?? transfer.created_at)}</p>
                  </div>
                  <Badge variant="destructive">{ownershipStatusLabel(transfer.transfer_status)}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function OwnershipCompletion() {
  const [searchParams] = useSearchParams();
  const { data, isLoading, error } = useAdminOwnershipCompletionData();
  const syncCandidates = useSyncOwnershipCompletionCandidates();
  const openReview = useOpenOwnershipCompletionReview();
  const assignReview = useAssignOwnershipCompletionReview();
  const createDecision = useCreateOwnershipCompletionDecision();
  const issueCertificate = useIssueOwnershipCertificate();
  const reverseCompletion = useReverseOwnershipCompletion();

  useRealtimeSubscription({
    tables: OWNERSHIP_COMPLETION_REALTIME_TABLES,
    showToasts: true,
  });

  const [activeTab, setActiveTab] = useState<CompletionTab>('queue');
  const [search, setSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState('Verification humaine avant transfert de propriete.');
  const [assignmentNote, setAssignmentNote] = useState('Pris en charge depuis Ownership Completion.');
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionSummary, setDecisionSummary] = useState('');
  const [certificateReference, setCertificateReference] = useState('');
  const [reverseReason, setReverseReason] = useState('');
  const [secondApproverId, setSecondApproverId] = useState('');

  const queue = data?.queue ?? EMPTY_QUEUE;
  const reviews = data?.reviews ?? EMPTY_REVIEWS;
  const decisions = data?.decisions ?? EMPTY_DECISIONS;
  const transfers = data?.transfers ?? EMPTY_TRANSFERS;
  const certificates = data?.certificates ?? EMPTY_CERTIFICATES;
  const auditEvents = data?.auditEvents ?? EMPTY_AUDIT;
  const reviewParam = searchParams.get('review');

  const sortedQueue = useMemo(() => (
    [...queue]
      .filter((row) => queueMatches(row, search))
      .sort((a, b) => {
        const aScore = a.priority_score ?? (statusOf(a) === 'ELIGIBLE_FOR_COMPLETION' ? 100 : 0);
        const bScore = b.priority_score ?? (statusOf(b) === 'ELIGIBLE_FOR_COMPLETION' ? 100 : 0);
        return bScore - aScore;
      })
  ), [queue, search]);

  useEffect(() => {
    if (!selectedAccountId && sortedQueue.length > 0) {
      setSelectedAccountId(sortedQueue[0].credit_account_id);
    }
  }, [selectedAccountId, sortedQueue]);

  useEffect(() => {
    if (!reviewParam) return;
    const row = queue.find((item) => getOwnershipReviewId(item) === reviewParam)
      ?? queue.find((item) => queueReview(item, reviews)?.review_id === reviewParam);
    if (row) {
      setSelectedAccountId(row.credit_account_id);
      setActiveTab('review');
    }
  }, [queue, reviewParam, reviews]);

  useEffect(() => {
    setDecisionReason('');
    setDecisionSummary('');
    setCertificateReference('');
    setReverseReason('');
    setSecondApproverId('');
  }, [selectedAccountId]);

  const selected = useMemo(() => (
    queue.find((row) => row.credit_account_id === selectedAccountId) ?? sortedQueue[0] ?? null
  ), [queue, selectedAccountId, sortedQueue]);

  const selectedReview = useMemo(() => queueReview(selected, reviews), [selected, reviews]);
  const selectedTransfer = useMemo(() => queueTransfer(selected, transfers), [selected, transfers]);
  const selectedCertificates = useMemo(() => queueCertificates(selected, certificates, transfers), [selected, certificates, transfers]);
  const selectedDecisions = useMemo(() => queueDecisions(selected, decisions, reviews), [selected, decisions, reviews]);
  const selectedAudit = useMemo(() => queueAudit(selected, auditEvents, reviews, transfers), [selected, auditEvents, reviews, transfers]);
  const selectedBlockers = getOwnershipBlockers(selected);

  const eligibleCount = queue.filter((row) => statusOf(row) === 'ELIGIBLE_FOR_COMPLETION').length;
  const inReviewCount = queue.filter((row) => ['UNDER_COMPLETION_REVIEW', 'AWAITING_FINAL_APPROVAL'].includes(statusOf(row))).length;
  const completedCount = transfers.filter((transfer) => ['APPROVED', 'COMPLETED'].includes(transfer.transfer_status)).length;
  const exceptionCount = queue.filter((row) => getOwnershipBlockers(row).length > 0).length;
  const blockedRows = queue.filter((row) => getOwnershipBlockers(row).length > 0);
  const reversedTransfers = transfers.filter((transfer) => transfer.transfer_status === 'REVERSED');
  const completedTransfers = transfers.filter((transfer) => ['APPROVED', 'COMPLETED', 'REVERSED'].includes(transfer.transfer_status));

  const handleOpenReview = (row: OwnershipCompletionQueueRow) => {
    openReview.mutate({
      creditAccountId: row.credit_account_id,
      reason: reviewReason.trim() || 'Verification humaine avant transfert de propriete.',
      reviewDueAt: row.review_due_at ?? row.decision_due_at ?? null,
    });
    setSelectedAccountId(row.credit_account_id);
    setActiveTab('review');
  };

  const handleAssignReview = (row: OwnershipCompletionQueueRow) => {
    const review = queueReview(row, reviews);
    const reviewId = reviewIdOf(review) ?? getOwnershipReviewId(row);
    if (!reviewId) return;
    assignReview.mutate({
      completionReviewId: reviewId,
      note: assignmentNote.trim() || 'Pris en charge depuis Ownership Completion.',
    });
    setSelectedAccountId(row.credit_account_id);
    setActiveTab('review');
  };

  const handleDecision = (decision: OwnershipCompletionDecision) => {
    const reviewId = reviewIdOf(selectedReview) ?? getOwnershipReviewId(selected);
    if (!reviewId) return;
    createDecision.mutate({
      completionReviewId: reviewId,
      decision,
      reason: decisionReason.trim(),
      summary: decisionSummary.trim() || null,
    }, {
      onSuccess: () => {
        setDecisionReason('');
        setDecisionSummary('');
      },
    });
  };

  const handleIssueCertificate = (transfer = selectedTransfer) => {
    const reviewId = transfer?.review_id ?? reviewIdOf(selectedReview) ?? getOwnershipReviewId(selected);
    if (!reviewId) return;
    issueCertificate.mutate({
      reviewId,
      documentReference: certificateReference.trim() || null,
    }, {
      onSuccess: () => setCertificateReference(''),
    });
  };

  const handleReverse = (transfer = selectedTransfer) => {
    const reviewId = transfer?.review_id ?? reviewIdOf(selectedReview) ?? getOwnershipReviewId(selected);
    if (!reviewId) return;
    reverseCompletion.mutate({
      reviewId,
      reason: reverseReason.trim(),
      secondApproverId: secondApproverId.trim(),
    }, {
      onSuccess: () => {
        setReverseReason('');
        setSecondApproverId('');
      },
    });
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <ListPageSkeleton columns={7} rows={8} />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[
        { label: 'Growth', href: '/admin/growth' },
        { label: 'Ownership Completion' },
      ]} />

      <AdminPageHeader
        title="Ownership Completion"
        description="Centre operationnel pour valider humainement la fin de financement, liberer l actif et emettre la preuve de propriete."
        action={(
          <Button onClick={() => syncCandidates.mutate(null)} disabled={syncCandidates.isPending}>
            <RefreshCw className={cn('h-4 w-4', syncCandidates.isPending && 'animate-spin')} />
            Sync candidates
          </Button>
        )}
      />

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Impossible de charger la completion</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Prets a valider" value={eligibleCount} detail="Paiement termine, revue humaine requise." icon={BadgeCheck} tone={eligibleCount > 0 ? 'success' : 'default'} />
        <MetricCard label="En revue" value={inReviewCount} detail="Dossiers assignes ou en validation finale." icon={ClipboardCheck} tone="info" />
        <MetricCard label="Transferts" value={completedCount} detail="Actifs approuves, completes ou certifiables." icon={WalletCards} tone="success" />
        <MetricCard label="Exceptions" value={exceptionCount} detail="Blocages a lever avant transfert." icon={ShieldAlert} tone={exceptionCount > 0 ? 'warning' : 'default'} />
      </div>

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_330px_330px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
                placeholder="Rechercher conducteur, actif, compte credit..."
              />
            </div>
            <Input
              value={reviewReason}
              onChange={(event) => setReviewReason(event.target.value)}
              placeholder="Raison ouverture revue"
            />
            <Input
              value={assignmentNote}
              onChange={(event) => setAssignmentNote(event.target.value)}
              placeholder="Note assignation"
            />
          </div>
        </CardContent>
      </Card>

      <SummaryStrip
        row={selected}
        review={selectedReview}
        transfer={selectedTransfer}
        certificates={selectedCertificates}
      />

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as CompletionTab)} className="mt-4 space-y-4">
        <TabsList className="grid h-auto grid-cols-2 lg:grid-cols-4">
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="review">Review Details</TabsTrigger>
          <TabsTrigger value="completed">Transfers & Certs</TabsTrigger>
          <TabsTrigger value="audit">Audit & Reversals</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4">
          <QueueTable
            rows={sortedQueue}
            selectedAccountId={selectedAccountId}
            data={data ?? {
              queue: EMPTY_QUEUE,
              reviews: EMPTY_REVIEWS,
              decisions: EMPTY_DECISIONS,
              transfers: EMPTY_TRANSFERS,
              certificates: EMPTY_CERTIFICATES,
              auditEvents: EMPTY_AUDIT,
            }}
            onSelect={(row) => setSelectedAccountId(row.credit_account_id)}
            onOpenReview={handleOpenReview}
            onAssignReview={handleAssignReview}
            opening={openReview.isPending}
            assigning={assignReview.isPending}
          />
        </TabsContent>

        <TabsContent value="review" className="space-y-4">
          <ReviewDecisionPanel
            selected={selected}
            review={selectedReview}
            decisions={selectedDecisions}
            transfer={selectedTransfer}
            certificates={selectedCertificates}
            blockers={selectedBlockers}
            decisionReason={decisionReason}
            decisionSummary={decisionSummary}
            certificateReference={certificateReference}
            reverseReason={reverseReason}
            secondApproverId={secondApproverId}
            onDecisionReasonChange={setDecisionReason}
            onDecisionSummaryChange={setDecisionSummary}
            onCertificateReferenceChange={setCertificateReference}
            onReverseReasonChange={setReverseReason}
            onSecondApproverIdChange={setSecondApproverId}
            onCreateDecision={handleDecision}
            onIssueCertificate={() => handleIssueCertificate()}
            onReverse={() => handleReverse()}
            decisionPending={createDecision.isPending}
            certificatePending={issueCertificate.isPending}
            reversePending={reverseCompletion.isPending}
          />

          <Card>
            <CardHeader>
              <CardTitle>Audit du dossier selectionne</CardTitle>
              <CardDescription>Derniers evenements lies au compte, a la revue ou au transfert.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {selectedAudit.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun evenement pour ce dossier.</p>
              ) : selectedAudit.slice(0, 6).map((event) => (
                <div key={event.audit_event_id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                  <div>
                    <p className="font-medium">{ownershipAuditEventLabel(event.event_type)}</p>
                    <p className="text-sm text-muted-foreground">{event.reason ?? 'Sans note additionnelle'}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{dateTimeLabel(event.created_at)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <CompletedTransfers
            transfers={completedTransfers}
            certificates={certificates}
            certificateReference={certificateReference}
            reverseReason={reverseReason}
            secondApproverId={secondApproverId}
            onCertificateReferenceChange={setCertificateReference}
            onReverseReasonChange={setReverseReason}
            onSecondApproverIdChange={setSecondApproverId}
            onIssueCertificate={handleIssueCertificate}
            onReverse={handleReverse}
            certificatePending={issueCertificate.isPending}
            reversePending={reverseCompletion.isPending}
          />
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <AuditWorkspace
            auditEvents={auditEvents}
            blockedRows={blockedRows}
            reversedTransfers={reversedTransfers}
          />
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
