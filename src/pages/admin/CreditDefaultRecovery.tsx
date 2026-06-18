import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  FileWarning,
  ListChecks,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  WalletCards,
} from 'lucide-react';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { ListPageSkeleton } from '@/components/AdminSkeletons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  CREDIT_DEFAULTS_REALTIME_TABLES,
  defaultDecisionLabel,
  defaultEvidenceLabel,
  defaultNoticeLabel,
  defaultStatusLabel,
  useAdminCreditDefaultsData,
  useAssignCreditDefaultReview,
  useAttachCreditDefaultEvidence,
  useCloseCreditDefaultReview,
  useCreateCreditDefaultDecision,
  useCreateCreditRecoveryPlan,
  useDeclareFormalCreditDefault,
  useOpenCreditAssetProtectionReview,
  useReverseCreditDefault,
  useSendCreditDefaultNotice,
  type AdminCreditDefaultsData,
  type CreditDefaultDecisionRow,
  type CreditDefaultReviewRow,
} from '@/hooks/useCreditDefaultsData';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDateShort, formatDateTime } from '@/lib/format';

type BadgeVariant = BadgeProps['variant'];

const EMPTY_REVIEWS: CreditDefaultReviewRow[] = [];

const EVIDENCE_CHECKLIST = [
  'UNPAID_INVOICES',
  'PAYMENT_HISTORY',
  'PROMISE_TO_PAY_HISTORY',
  'DRIVER_CONTACT_ATTEMPTS',
  'ASSET_POSSESSION_STATUS',
  'RISK_FLAGS',
  'CONTRACT_TERMS',
  'NOTICES_SENT',
];

const EVIDENCE_OPTIONS = [
  ...EVIDENCE_CHECKLIST,
  'ASSET_LOCATION_STATUS',
  'INCIDENT_HISTORY',
  'SIGNED_AGREEMENT',
  'ADMIN_NOTES',
  'FIELD_REPORT',
  'PHOTOS',
];

const DECISION_OPTIONS = [
  'CONTINUE_COLLECTIONS',
  'RECOVERY_PLAN',
  'ASSET_PROTECTION_REVIEW',
  'RESTRUCTURE_RECOMMENDED',
  'FORMAL_DEFAULT',
  'WRITE_OFF_RECOMMENDED',
  'DEFAULT_NOT_SUPPORTED',
  'ESCALATE_TO_MANAGEMENT',
];

const NOTICE_OPTIONS = [
  'DEFAULT_REVIEW_OPENED',
  'RECOVERY_PLAN_OFFERED',
  'PAYMENT_REQUIRED',
  'ASSET_INSPECTION_REQUESTED',
  'FORMAL_DEFAULT_NOTICE',
  'RECOVERY_COMPLETED',
  'REVIEW_CLOSED',
];

function badgeVariant(value: string | null | undefined): BadgeVariant {
  if (['FORMALLY_DEFAULTED', 'FORMAL_DEFAULT', 'FORMAL_DEFAULT_PENDING_APPROVAL', 'WRITTEN_OFF', 'OVERDUE', 'FAILED'].includes(value ?? '')) return 'destructive';
  if (['DEFAULT_REVIEW', 'EVIDENCE_GATHERING', 'RECOVERY_PLAN_PENDING', 'ASSET_PROTECTION_REVIEW', 'PENDING'].includes(value ?? '')) return 'secondary';
  if (['RECOVERY_PLAN_ACTIVE', 'RECOVERY_COMPLETED', 'DEFAULT_REVERSED', 'CLOSED', 'SENT', 'COMPLETE', 'COMPLETED'].includes(value ?? '')) return 'verified';
  return 'outline';
}

function isClosed(review: CreditDefaultReviewRow | null) {
  return !!review?.closed_at || ['CLOSED', 'DEFAULT_REVERSED', 'RECOVERY_COMPLETED', 'WRITTEN_OFF'].includes(review?.status ?? '');
}

function routeTab(pathname: string) {
  if (pathname.includes('/default-reviews')) return 'decision';
  if (pathname.includes('/defaults')) return 'audit';
  return 'queue';
}

function reviewMatches(review: CreditDefaultReviewRow, data: AdminCreditDefaultsData, search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  const driver = data.driversById.get(review.driver_id);
  const collection = data.collectionsQueue.find((row) => row.case_id === review.collections_case_id || row.credit_account_id === review.credit_account_id);
  return [
    review.default_review_id,
    review.credit_account_id,
    review.collections_case_id,
    review.trigger_reason,
    driver?.full_name,
    driver?.phone_number,
    collection?.product_name,
  ].some((value) => value?.toLowerCase().includes(query));
}

function latestDecision(decisions: CreditDefaultDecisionRow[]) {
  return decisions[0] ?? null;
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

function actionText(value: unknown) {
  if (!value) return 'Action a confirmer avec le conducteur';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'action' in value) return String((value as { action?: unknown }).action ?? 'Action a confirmer');
  return JSON.stringify(value);
}

function ReviewSummary({
  review,
  data,
}: {
  review: CreditDefaultReviewRow;
  data: AdminCreditDefaultsData;
}) {
  const driver = data.driversById.get(review.driver_id);
  const collection = data.collectionsQueue.find((row) => row.case_id === review.collections_case_id || row.credit_account_id === review.credit_account_id);
  const decisions = data.decisions.filter((decision) => decision.default_review_id === review.default_review_id);
  const decision = latestDecision(decisions);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>{driver?.full_name ?? collection?.driver_name ?? 'Conducteur'}</CardTitle>
            <CardDescription>
              {collection?.product_name ?? collection?.product_type ?? 'Produit credit'} · ouvert le {formatDateShort(review.opened_at)}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={badgeVariant(review.status)}>{defaultStatusLabel(review.status)}</Badge>
            <Badge variant={badgeVariant(review.evidence_status)}>{defaultStatusLabel(review.evidence_status)}</Badge>
            {decision && <Badge variant={badgeVariant(decision.decision)}>{defaultDecisionLabel(decision.decision)}</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Montant concerne</p>
          <p className="text-lg font-semibold">{formatCurrency(review.past_due_amount ?? collection?.total_past_due_amount ?? 0)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Retard</p>
          <p className="text-lg font-semibold">{review.days_past_due ?? collection?.days_past_due ?? 0} jour(s)</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Echeance decision</p>
          <p className="text-lg font-semibold">{review.decision_due_at ? formatDateShort(review.decision_due_at) : 'Non definie'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Lien collections</p>
          <p className="font-mono text-sm">{review.collections_case_id?.slice(0, 8) ?? 'Non lie'}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EvidenceChecklist({
  review,
  data,
}: {
  review: CreditDefaultReviewRow | null;
  data: AdminCreditDefaultsData;
}) {
  const attachEvidence = useAttachCreditDefaultEvidence();
  const [evidenceType, setEvidenceType] = useState(EVIDENCE_OPTIONS[0]);
  const [summary, setSummary] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [sourceId, setSourceId] = useState('');

  useEffect(() => {
    setEvidenceType(EVIDENCE_OPTIONS[0]);
    setSummary('');
    setSourceType('');
    setSourceId('');
  }, [review?.default_review_id]);

  if (!review) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Selectionnez un dossier pour verifier les pieces.</CardContent></Card>;
  }

  const evidence = data.evidence.filter((item) => item.default_review_id === review.default_review_id);
  const evidenceTypes = new Set(evidence.map((item) => item.evidence_type));
  const completed = EVIDENCE_CHECKLIST.filter((type) => evidenceTypes.has(type)).length;
  const locked = evidence.some((item) => item.locked_at) || data.decisions.some((decision) => decision.default_review_id === review.default_review_id);
  const addReason = locked
    ? 'Les pieces sont verrouillees apres decision.'
    : isClosed(review)
      ? 'Le dossier est ferme.'
      : summary.trim().length < 6
        ? 'Ajoutez un resume exploitable.'
        : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <CardTitle>Evidence Checklist</CardTitle>
          <CardDescription>Pieces requises avant toute decision formelle. Les pieces se verrouillent apres decision.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progression</span>
              <span>{completed}/{EVIDENCE_CHECKLIST.length}</span>
            </div>
            <Progress value={Math.round((completed / EVIDENCE_CHECKLIST.length) * 100)} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {EVIDENCE_CHECKLIST.map((type) => {
              const item = evidence.find((row) => row.evidence_type === type);
              return (
                <div key={type} className={cn('rounded-lg border p-3', item ? 'border-primary/30 bg-primary/5' : 'bg-muted/20')}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{defaultEvidenceLabel(type)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item?.evidence_summary ?? 'Piece attendue pour completer la revue.'}</p>
                    </div>
                    {item ? <FileCheck2 className="h-5 w-5 text-primary" /> : <ListChecks className="h-5 w-5 text-muted-foreground" />}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ajouter une piece</CardTitle>
          <CardDescription>Referencez la source sans modifier les donnees d origine.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={evidenceType} onValueChange={setEvidenceType}>
            <SelectTrigger aria-label="Type de piece"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EVIDENCE_OPTIONS.map((type) => <SelectItem key={type} value={type}>{defaultEvidenceLabel(type)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Resume factuel de la piece" />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={sourceType} onChange={(event) => setSourceType(event.target.value)} placeholder="Source: invoice, contract..." />
            <Input value={sourceId} onChange={(event) => setSourceId(event.target.value)} placeholder="Reference source" />
          </div>
          {locked && (
            <Alert>
              <LockKeyhole className="h-4 w-4" />
              <AlertTitle>Pieces verrouillees</AlertTitle>
              <AlertDescription>Une decision existe deja; l historique reste conserve.</AlertDescription>
            </Alert>
          )}
          <ActionButton
            reason={addReason}
            disabled={attachEvidence.isPending}
            onClick={() => attachEvidence.mutate({
              defaultReviewId: review.default_review_id,
              evidenceType,
              summary: summary.trim(),
              sourceReferenceType: sourceType.trim() || null,
              sourceReferenceId: sourceId.trim() || null,
            }, { onSuccess: () => setSummary('') })}
          >
            <FileCheck2 className="h-4 w-4" />
            Ajouter au dossier
          </ActionButton>
        </CardContent>
      </Card>
    </div>
  );
}

function DecisionScreen({
  review,
  data,
}: {
  review: CreditDefaultReviewRow | null;
  data: AdminCreditDefaultsData;
}) {
  const createDecision = useCreateCreditDefaultDecision();
  const [decision, setDecision] = useState('RECOVERY_PLAN');
  const [reason, setReason] = useState('');
  const [summary, setSummary] = useState('');
  const [noticeRequired, setNoticeRequired] = useState(true);

  useEffect(() => {
    setDecision('RECOVERY_PLAN');
    setReason('');
    setSummary('');
    setNoticeRequired(true);
  }, [review?.default_review_id]);

  if (!review) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Selectionnez un dossier pour preparer une decision.</CardContent></Card>;
  }

  const decisions = data.decisions.filter((item) => item.default_review_id === review.default_review_id);
  const existingDecision = latestDecision(decisions);
  const evidence = data.evidence.filter((item) => item.default_review_id === review.default_review_id);
  const evidenceTypes = new Set(evidence.map((item) => item.evidence_type));
  const completed = EVIDENCE_CHECKLIST.filter((type) => evidenceTypes.has(type)).length;
  const evidenceComplete = completed === EVIDENCE_CHECKLIST.length || review.evidence_status === 'COMPLETE';
  const decisionReason = existingDecision
    ? 'Une decision existe deja pour ce dossier.'
    : isClosed(review)
      ? 'Le dossier est ferme.'
      : reason.trim().length < 10
        ? 'Expliquez la decision avec au moins 10 caracteres.'
        : decision === 'FORMAL_DEFAULT' && !evidenceComplete
          ? 'Defaut formel bloque tant que les pieces requises ne sont pas completes.'
          : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <Card>
        <CardHeader>
          <CardTitle>Decision Screen</CardTitle>
          <CardDescription>Decision humaine, auditable, et separee de toute action juridique ou reprise automatique.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {existingDecision ? (
            <div className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{defaultDecisionLabel(existingDecision.decision)}</p>
                  <p className="text-sm text-muted-foreground">{existingDecision.decision_reason}</p>
                </div>
                <Badge variant={badgeVariant(existingDecision.decision)}>{formatDateShort(existingDecision.decision_timestamp)}</Badge>
              </div>
              {existingDecision.decision_summary && <p className="mt-3 text-sm">{existingDecision.decision_summary}</p>}
            </div>
          ) : (
            <>
              <Select value={decision} onValueChange={setDecision}>
                <SelectTrigger aria-label="Decision"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DECISION_OPTIONS.map((option) => <SelectItem key={option} value={option}>{defaultDecisionLabel(option)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Raison factuelle de la decision" />
              <Textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Resume interne et notice conducteur si applicable" />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={noticeRequired} onCheckedChange={(checked) => setNoticeRequired(checked === true)} />
                Notification conducteur requise
              </label>
              {decision === 'FORMAL_DEFAULT' && (
                <Alert variant={evidenceComplete ? 'default' : 'destructive'}>
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle>Controle defaut formel</AlertTitle>
                  <AlertDescription>
                    Cette decision exige les pieces completes et une permission elevee cote backend.
                  </AlertDescription>
                </Alert>
              )}
              {decision === 'WRITE_OFF_RECOMMENDED' && (
                <Alert>
                  <WalletCards className="h-4 w-4" />
                  <AlertTitle>Recommandation seulement</AlertTitle>
                  <AlertDescription>Aucune radiation comptable n est executee depuis cette page.</AlertDescription>
                </Alert>
              )}
              <ActionButton
                reason={decisionReason}
                disabled={createDecision.isPending}
                onClick={() => createDecision.mutate({
                  defaultReviewId: review.default_review_id,
                  decision,
                  reason: reason.trim(),
                  summary: summary.trim() || null,
                  driverNoticeRequired: noticeRequired,
                })}
              >
                <ShieldCheck className="h-4 w-4" />
                Enregistrer la decision
              </ActionButton>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Controles actifs</CardTitle>
          <CardDescription>Pourquoi certaines actions sont bloquees.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span>Pieces requises</span>
            <Badge variant={evidenceComplete ? 'verified' : 'secondary'}>{completed}/{EVIDENCE_CHECKLIST.length}</Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Dossier ouvert</span>
            <Badge variant={isClosed(review) ? 'outline' : 'verified'}>{isClosed(review) ? 'Non' : 'Oui'}</Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Decision existante</span>
            <Badge variant={existingDecision ? 'secondary' : 'outline'}>{existingDecision ? 'Oui' : 'Non'}</Badge>
          </div>
          <p className="text-muted-foreground">
            Le backend reste responsable des permissions: defaut formel, double validation, annulation, et audit immutable.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function RecoveryAndAssetReview({
  review,
  data,
}: {
  review: CreditDefaultReviewRow | null;
  data: AdminCreditDefaultsData;
}) {
  const createPlan = useCreateCreditRecoveryPlan();
  const openAssetReview = useOpenCreditAssetProtectionReview();
  const [requiredAction, setRequiredAction] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assetReason, setAssetReason] = useState('');
  const [inspectionRequired, setInspectionRequired] = useState(true);
  const [inspectionDue, setInspectionDue] = useState('');

  useEffect(() => {
    setRequiredAction('');
    setDueDate('');
    setAssetReason('');
    setInspectionRequired(true);
    setInspectionDue('');
  }, [review?.default_review_id]);

  if (!review) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Selectionnez un dossier pour suivre le plan.</CardContent></Card>;
  }

  const plans = data.recoveryPlans.filter((plan) => plan.default_review_id === review.default_review_id);
  const assetReviews = data.assetReviews.filter((asset) => asset.default_review_id === review.default_review_id);
  const activePlan = plans.find((plan) => ['ACTIVE', 'PENDING', 'RECOVERY_PLAN_ACTIVE'].includes(plan.plan_status)) ?? plans[0] ?? null;
  const activeAssetReview = assetReviews.find((asset) => !['CLOSED', 'COMPLETED'].includes(asset.status)) ?? assetReviews[0] ?? null;
  const planReason = activePlan
    ? 'Un plan existe deja pour ce dossier.'
    : isClosed(review)
      ? 'Le dossier est ferme.'
      : requiredAction.trim().length < 8
        ? 'Precisez l action attendue du conducteur.'
        : !dueDate
          ? 'Choisissez une date limite.'
          : null;
  const assetReasonDisabled = activeAssetReview
    ? 'Une revue actif existe deja.'
    : isClosed(review)
      ? 'Le dossier est ferme.'
      : assetReason.trim().length < 8
        ? 'Precisez la raison de protection actif.'
        : inspectionRequired && !inspectionDue
          ? 'Choisissez une date de controle.'
          : null;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Recovery Plan</CardTitle>
          <CardDescription>Plan operationnel. Il ne cree pas de nouvel echeancier de remboursement.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {activePlan ? (
            <div className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{actionText(activePlan.required_action_json)}</p>
                <Badge variant={badgeVariant(activePlan.plan_status)}>{defaultStatusLabel(activePlan.plan_status)}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Echeance: {activePlan.due_date ? formatDateShort(activePlan.due_date) : 'Non definie'}</p>
            </div>
          ) : (
            <>
              <Textarea value={requiredAction} onChange={(event) => setRequiredAction(event.target.value)} placeholder="Ex: Payer 50 000 FCFA avant vendredi et confirmer le rendez-vous DAM." />
              <div className="space-y-2">
                <Label htmlFor="recovery-due-date">Date limite</Label>
                <Input id="recovery-due-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </div>
              <ActionButton
                reason={planReason}
                disabled={createPlan.isPending}
                onClick={() => createPlan.mutate({ defaultReviewId: review.default_review_id, requiredAction: requiredAction.trim(), dueDate })}
              >
                <CalendarClock className="h-4 w-4" />
                Creer le plan
              </ActionButton>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Asset Protection Review</CardTitle>
          <CardDescription>Controle de protection seulement; aucune reprise automatique n est declenchee.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeAssetReview ? (
            <div className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{activeAssetReview.trigger_reason}</p>
                <Badge variant={badgeVariant(activeAssetReview.status)}>{defaultStatusLabel(activeAssetReview.status)}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Controle: {activeAssetReview.inspection_required ? activeAssetReview.inspection_due_at ? formatDateShort(activeAssetReview.inspection_due_at) : 'requis' : 'non requis'}
              </p>
            </div>
          ) : (
            <>
              <Textarea value={assetReason} onChange={(event) => setAssetReason(event.target.value)} placeholder="Raison: conducteur injoignable, localisation a confirmer, etat du vehicule inconnu..." />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={inspectionRequired} onCheckedChange={(checked) => setInspectionRequired(checked === true)} />
                Controle vehicule requis
              </label>
              {inspectionRequired && (
                <div className="space-y-2">
                  <Label htmlFor="inspection-due-date">Date limite du controle</Label>
                  <Input id="inspection-due-date" type="date" value={inspectionDue} onChange={(event) => setInspectionDue(event.target.value)} />
                </div>
              )}
              <ActionButton
                reason={assetReasonDisabled}
                disabled={openAssetReview.isPending}
                onClick={() => openAssetReview.mutate({
                  defaultReviewId: review.default_review_id,
                  triggerReason: assetReason.trim(),
                  inspectionRequired,
                  inspectionDueAt: inspectionRequired ? inspectionDue : null,
                })}
              >
                <ShieldAlert className="h-4 w-4" />
                Ouvrir revue actif
              </ActionButton>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NoticeAndClosure({
  review,
  data,
}: {
  review: CreditDefaultReviewRow | null;
  data: AdminCreditDefaultsData;
}) {
  const sendNotice = useSendCreditDefaultNotice();
  const declareDefault = useDeclareFormalCreditDefault();
  const reverseDefault = useReverseCreditDefault();
  const closeReview = useCloseCreditDefaultReview();
  const [noticeType, setNoticeType] = useState('DEFAULT_REVIEW_OPENED');
  const [noticeSummary, setNoticeSummary] = useState('');
  const [channel, setChannel] = useState('IN_APP');
  const [formalReason, setFormalReason] = useState('');
  const [reverseReason, setReverseReason] = useState('');
  const [closeReason, setCloseReason] = useState('');

  useEffect(() => {
    setNoticeType('DEFAULT_REVIEW_OPENED');
    setNoticeSummary('');
    setChannel('IN_APP');
    setFormalReason('');
    setReverseReason('');
    setCloseReason('');
  }, [review?.default_review_id]);

  if (!review) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Selectionnez un dossier pour les notifications et clotures.</CardContent></Card>;
  }

  const notices = data.notices.filter((notice) => notice.default_review_id === review.default_review_id);
  const decisions = data.decisions.filter((decision) => decision.default_review_id === review.default_review_id);
  const decision = latestDecision(decisions);
  const hasFormalDefaultDecision = decision?.decision === 'FORMAL_DEFAULT';
  const isFormallyDefaulted = review.status === 'FORMALLY_DEFAULTED';
  const formalNoticeSent = notices.some((notice) => notice.notice_type === 'FORMAL_DEFAULT_NOTICE' && notice.notice_status === 'SENT');
  const noticeReason = isClosed(review)
    ? 'Le dossier est ferme.'
    : noticeSummary.trim().length < 12
      ? 'Redigez un message conducteur clair en francais.'
      : noticeType === 'FORMAL_DEFAULT_NOTICE' && !hasFormalDefaultDecision
        ? 'Avis formel disponible seulement apres decision de defaut formel.'
        : null;
  const declareDisabledReason = isFormallyDefaulted
    ? 'Le defaut formel est deja confirme.'
    : !hasFormalDefaultDecision
      ? 'Decision de defaut formel requise.'
      : decision?.driver_notice_required && !formalNoticeSent
        ? 'Envoyez d abord l avis conducteur formel.'
        : formalReason.trim().length < 10
          ? 'Expliquez la confirmation avec au moins 10 caracteres.'
          : null;
  const reverseDisabledReason = !isFormallyDefaulted
    ? 'Annulation disponible seulement apres defaut formel confirme.'
    : reverseReason.trim().length < 10
      ? 'Expliquez la raison de l annulation.'
      : null;
  const closeDisabledReason = isClosed(review)
    ? 'Le dossier est deja ferme.'
    : closeReason.trim().length < 8
      ? 'Ajoutez une raison de cloture.'
      : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <Card>
        <CardHeader>
          <CardTitle>Driver Notice Log</CardTitle>
          <CardDescription>Messages conducteur francais-first, non intimidants, et lies a l audit.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <Select value={noticeType} onValueChange={setNoticeType}>
              <SelectTrigger aria-label="Type de notification"><SelectValue /></SelectTrigger>
              <SelectContent>
                {NOTICE_OPTIONS.map((option) => <SelectItem key={option} value={option}>{defaultNoticeLabel(option)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger aria-label="Canal"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="IN_APP">In-app</SelectItem>
                <SelectItem value="SMS">SMS</SelectItem>
                <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                <SelectItem value="EMAIL">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={noticeSummary}
            onChange={(event) => setNoticeSummary(event.target.value)}
            placeholder="Votre dossier est en revision. Montant concerne, action attendue, date limite et contact DAM..."
          />
          <ActionButton
            reason={noticeReason}
            disabled={sendNotice.isPending}
            onClick={() => sendNotice.mutate({
              defaultReviewId: review.default_review_id,
              noticeType,
              summary: noticeSummary.trim(),
              channel,
            }, { onSuccess: () => setNoticeSummary('') })}
          >
            <BellRing className="h-4 w-4" />
            Enregistrer notification
          </ActionButton>

          <div className="space-y-3">
            {notices.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune notification enregistree.</p>
            ) : notices.map((notice) => (
              <div key={notice.notice_id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{defaultNoticeLabel(notice.notice_type)}</span>
                  <Badge variant={badgeVariant(notice.notice_status)}>{defaultStatusLabel(notice.notice_status)}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">{notice.notice_summary ?? 'Message conserve dans le journal.'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{notice.channel ?? 'IN_APP'} · {notice.sent_at ? formatDateTime(notice.sent_at) : formatDateTime(notice.created_at)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Formal Default Confirmation</CardTitle>
            <CardDescription>Confirmation finale auditee apres decision et notification conducteur.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={formalReason} onChange={(event) => setFormalReason(event.target.value)} placeholder="Raison de confirmation finale, preuves verifiees et notice conducteur envoyee..." />
            <ActionButton
              variant="outline"
              reason={declareDisabledReason}
              disabled={declareDefault.isPending}
              onClick={() => declareDefault.mutate({ defaultReviewId: review.default_review_id, reason: formalReason.trim() }, { onSuccess: () => setFormalReason('') })}
            >
              <ShieldAlert className="h-4 w-4" />
              Confirmer le defaut formel
            </ActionButton>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reversal Workflow</CardTitle>
            <CardDescription>Annulation avec raison, approbation backend, et historique conserve.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} placeholder="Paiement confirme, erreur de piece, ou validation management..." />
            <ActionButton
              variant="outline"
              reason={reverseDisabledReason}
              disabled={reverseDefault.isPending}
              onClick={() => reverseDefault.mutate({ defaultReviewId: review.default_review_id, reason: reverseReason.trim() })}
            >
              <RotateCcw className="h-4 w-4" />
              Annuler le defaut
            </ActionButton>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Close Controls</CardTitle>
            <CardDescription>Cloture explicite; aucune fermeture silencieuse.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={closeReason} onChange={(event) => setCloseReason(event.target.value)} placeholder="Raison de cloture du dossier" />
            <ActionButton
              variant="outline"
              reason={closeDisabledReason}
              disabled={closeReview.isPending}
              onClick={() => closeReview.mutate({ defaultReviewId: review.default_review_id, reason: closeReason.trim() })}
            >
              <CheckCircle2 className="h-4 w-4" />
              Fermer le dossier
            </ActionButton>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AuditTrail({
  review,
  data,
}: {
  review: CreditDefaultReviewRow | null;
  data: AdminCreditDefaultsData;
}) {
  const events = review
    ? data.auditEvents.filter((event) => event.default_review_id === review.default_review_id)
    : data.auditEvents;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Trail</CardTitle>
        <CardDescription>Evenements Layer 3F recents. L historique n est jamais supprime depuis l interface.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Evenement</TableHead>
              <TableHead>Dossier</TableHead>
              <TableHead>Raison</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">Aucun evenement audit pour cette selection.</TableCell>
              </TableRow>
            ) : events.map((event) => (
              <TableRow key={event.audit_event_id}>
                <TableCell>{defaultStatusLabel(event.event_type)}</TableCell>
                <TableCell className="font-mono text-xs">{event.default_review_id?.slice(0, 8) ?? event.credit_account_id?.slice(0, 8) ?? 'n/a'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{event.reason ?? 'Mise a jour systeme'}</TableCell>
                <TableCell>{formatDateTime(event.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function CreditDefaultRecovery() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, isLoading, isError, error, refetch } = useAdminCreditDefaultsData();
  const assignReview = useAssignCreditDefaultReview();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useRealtimeSubscription({
    tables: CREDIT_DEFAULTS_REALTIME_TABLES,
    showToasts: false,
  });

  const reviews = data?.reviews ?? EMPTY_REVIEWS;
  const filteredReviews = useMemo(() => {
    if (!data) return EMPTY_REVIEWS;
    return reviews.filter((review) => {
      if (statusFilter !== 'all' && review.status !== statusFilter) return false;
      return reviewMatches(review, data, search);
    });
  }, [data, reviews, search, statusFilter]);

  const selectedReviewId = searchParams.get('review');
  const selectedCollectionsCaseId = searchParams.get('case');
  const selectedReview = filteredReviews.find((review) => review.default_review_id === selectedReviewId)
    ?? filteredReviews.find((review) => review.collections_case_id === selectedCollectionsCaseId)
    ?? filteredReviews[0]
    ?? null;

  useEffect(() => {
    if (!selectedReviewId && !selectedCollectionsCaseId && filteredReviews[0]) {
      setSearchParams((params) => {
        params.set('review', filteredReviews[0].default_review_id);
        return params;
      }, { replace: true });
    }
  }, [filteredReviews, selectedCollectionsCaseId, selectedReviewId, setSearchParams]);

  const openReviews = reviews.filter((review) => !isClosed(review));
  const formalDefaults = reviews.filter((review) => review.status === 'FORMALLY_DEFAULTED');
  const assetReviewsNeeded = reviews.filter((review) => review.status === 'ASSET_PROTECTION_REVIEW' || review.trigger_reason?.includes('ASSET'));
  const pastDueTotal = reviews.reduce((sum, review) => sum + (review.past_due_amount ?? 0), 0);

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
        <AdminBreadcrumb items={[{ label: 'Default Recovery' }]} />
        <AdminPageHeader
          title="Default Recovery"
          description="Layer 3F default governance, recovery planning, asset protection review, notices, and reversal controls."
          action={(
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Button variant="outline" asChild>
                <Link to="/admin/credit-collections">
                  <FileWarning className="h-4 w-4" />
                  Collections
                </Link>
              </Button>
            </div>
          )}
        />

        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Controle humain obligatoire</AlertTitle>
          <AlertDescription>
            Cette surface organise la revue, les pieces, le plan de regularisation et les notifications. Elle ne lance ni reprise automatique, ni action juridique, ni radiation comptable.
          </AlertDescription>
        </Alert>

        {isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Chargement impossible</AlertTitle>
            <AlertDescription>{error instanceof Error ? error.message : 'Erreur inconnue'}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={FileWarning} label="Revues ouvertes" value={openReviews.length} helper="Dossiers actifs sous gouvernance" />
          <MetricCard icon={WalletCards} label="Montant concerne" value={formatCurrency(pastDueTotal)} helper="Lecture des dossiers Layer 3F" />
          <MetricCard icon={ShieldAlert} label="Protection actif" value={assetReviewsNeeded.length} helper="Revue ou signal actif requis" />
          <MetricCard icon={LockKeyhole} label="Defauts formels" value={formalDefaults.length} helper="Seulement apres validation autorisee" />
        </div>

        {selectedReview && data && <ReviewSummary review={selectedReview} data={data} />}

        <Tabs defaultValue={routeTab(location.pathname)}>
          <TabsList className="mb-4 flex h-auto flex-wrap">
            <TabsTrigger value="queue">Queue</TabsTrigger>
            <TabsTrigger value="evidence">Evidence</TabsTrigger>
            <TabsTrigger value="decision">Decision</TabsTrigger>
            <TabsTrigger value="recovery">Recovery & Asset</TabsTrigger>
            <TabsTrigger value="notices">Notices & Close</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="queue">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <CardTitle>Default Review Queue</CardTitle>
                    <CardDescription>Dossiers classes pour decision humaine, evidence et plan de regularisation.</CardDescription>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_210px]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher dossier, conducteur, produit" className="pl-9" />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger aria-label="Filtre statut"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous statuts</SelectItem>
                        <SelectItem value="DEFAULT_REVIEW">Dossier en revision</SelectItem>
                        <SelectItem value="EVIDENCE_GATHERING">Pieces en verification</SelectItem>
                        <SelectItem value="RECOVERY_PLAN_PENDING">Plan a valider</SelectItem>
                        <SelectItem value="RECOVERY_PLAN_ACTIVE">Plan actif</SelectItem>
                        <SelectItem value="FORMAL_DEFAULT_PENDING_APPROVAL">Validation defaut</SelectItem>
                        <SelectItem value="FORMALLY_DEFAULTED">Defaut formel</SelectItem>
                        <SelectItem value="ASSET_PROTECTION_REVIEW">Protection actif</SelectItem>
                        <SelectItem value="CLOSED">Ferme</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Conducteur</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Exposition</TableHead>
                      <TableHead>Pieces</TableHead>
                      <TableHead>Echeance</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReviews.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Aucun dossier Default Recovery pour ces filtres.</TableCell>
                      </TableRow>
                    ) : filteredReviews.map((review) => {
                      const driver = data?.driversById.get(review.driver_id);
                      const collection = data?.collectionsQueue.find((row) => row.case_id === review.collections_case_id || row.credit_account_id === review.credit_account_id);
                      const reviewEvidence = data?.evidence.filter((item) => item.default_review_id === review.default_review_id) ?? [];
                      const evidenceCount = new Set(reviewEvidence.map((item) => item.evidence_type)).size;
                      return (
                        <TableRow key={review.default_review_id} className={selectedReview?.default_review_id === review.default_review_id ? 'bg-muted/40' : undefined}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{driver?.full_name ?? collection?.driver_name ?? 'Conducteur'}</p>
                              <p className="text-xs text-muted-foreground">{driver?.phone_number ?? collection?.driver_phone ?? 'Telephone non renseigne'} · {collection?.product_name ?? 'Produit credit'}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={badgeVariant(review.status)}>{defaultStatusLabel(review.status)}</Badge>
                            <p className="mt-1 text-xs text-muted-foreground">{review.trigger_reason}</p>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{formatCurrency(review.past_due_amount ?? collection?.total_past_due_amount ?? 0)}</p>
                            <p className="text-xs text-muted-foreground">{review.days_past_due ?? collection?.days_past_due ?? 0} jour(s) de retard</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant={evidenceCount >= EVIDENCE_CHECKLIST.length ? 'verified' : 'secondary'}>{evidenceCount}/{EVIDENCE_CHECKLIST.length}</Badge>
                          </TableCell>
                          <TableCell>{review.decision_due_at ? formatDateShort(review.decision_due_at) : 'Non definie'}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSearchParams((params) => {
                                  params.set('review', review.default_review_id);
                                  return params;
                                })}
                              >
                                Ouvrir
                              </Button>
                              <ActionButton
                                size="sm"
                                variant="outline"
                                reason={isClosed(review) ? 'Dossier ferme.' : null}
                                disabled={assignReview.isPending}
                                onClick={() => assignReview.mutate({ defaultReviewId: review.default_review_id })}
                              >
                                <UserCheck className="h-4 w-4" />
                                Assigner
                              </ActionButton>
                              <Button size="sm" variant="outline" asChild>
                                <Link to={`/admin/drivers/${review.driver_id}`}>Driver 360</Link>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="evidence">
            {data && <EvidenceChecklist review={selectedReview} data={data} />}
          </TabsContent>

          <TabsContent value="decision">
            {data && <DecisionScreen review={selectedReview} data={data} />}
          </TabsContent>

          <TabsContent value="recovery">
            {data && <RecoveryAndAssetReview review={selectedReview} data={data} />}
          </TabsContent>

          <TabsContent value="notices">
            {data && <NoticeAndClosure review={selectedReview} data={data} />}
          </TabsContent>

          <TabsContent value="audit">
            {data && <AuditTrail review={selectedReview} data={data} />}
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
