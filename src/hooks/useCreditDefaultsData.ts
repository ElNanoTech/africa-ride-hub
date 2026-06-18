import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/routeClient';
import { makeCreditIdempotencyKey } from '@/hooks/useCreditProductEngineData';
import { useDriverId } from '@/hooks/useDriverData';
import type { RealtimeTableName } from '@/hooks/useRealtimeSubscription';

type QueryResult<T> = {
  data: T | null;
  error: Error | null;
};

type DefaultQueryBuilder<T = unknown> = PromiseLike<QueryResult<T>> & {
  select: (columns?: string, options?: Record<string, unknown>) => DefaultQueryBuilder<T>;
  order: (column: string, options?: Record<string, unknown>) => DefaultQueryBuilder<T>;
  eq: (column: string, value: unknown) => DefaultQueryBuilder<T>;
  in: (column: string, values: unknown[]) => DefaultQueryBuilder<T>;
  limit: (count: number) => DefaultQueryBuilder<T>;
};

type DefaultSupabaseClient = {
  from: <T = unknown>(table: string) => DefaultQueryBuilder<T>;
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<QueryResult<T>>;
};

const defaultClient = supabase as unknown as DefaultSupabaseClient;

export const CREDIT_DEFAULTS_REALTIME_TABLES: RealtimeTableName[] = [
  'credit_default_reviews',
  'credit_default_evidence',
  'credit_default_decisions',
  'credit_recovery_plans',
  'credit_asset_protection_reviews',
  'credit_default_notices',
  'credit_default_audit_events',
] as const;

export type CreditDefaultStatus =
  | 'NOT_IN_DEFAULT'
  | 'DEFAULT_REVIEW'
  | 'EVIDENCE_GATHERING'
  | 'RECOVERY_PLAN_PENDING'
  | 'RECOVERY_PLAN_ACTIVE'
  | 'FORMAL_DEFAULT_PENDING_APPROVAL'
  | 'FORMALLY_DEFAULTED'
  | 'ASSET_PROTECTION_REVIEW'
  | 'RECOVERY_COMPLETED'
  | 'DEFAULT_REVERSED'
  | 'WRITTEN_OFF'
  | 'CLOSED'
  | string;

export type CreditDefaultDecision =
  | 'CONTINUE_COLLECTIONS'
  | 'RECOVERY_PLAN'
  | 'FORMAL_DEFAULT'
  | 'ASSET_PROTECTION_REVIEW'
  | 'RESTRUCTURE_RECOMMENDED'
  | 'WRITE_OFF_RECOMMENDED'
  | 'DEFAULT_NOT_SUPPORTED'
  | 'ESCALATE_TO_MANAGEMENT'
  | string;

export type CreditDefaultReviewRow = {
  default_review_id: string;
  customer_id: string | null;
  credit_account_id: string;
  collections_case_id: string | null;
  driver_id: string;
  driver_name: string | null;
  driver_phone: string | null;
  product_id: string;
  product_type: string | null;
  product_name: string | null;
  status: CreditDefaultStatus;
  status_label: string;
  trigger_reason: string;
  days_past_due: number;
  past_due_amount: number;
  currency_code: string;
  evidence_status: string;
  evidence_count: number;
  assigned_reviewer: string | null;
  default_decision_id: string | null;
  latest_decision: CreditDefaultDecision | null;
  decision_timestamp: string | null;
  active_recovery_plan_id: string | null;
  open_asset_review_id: string | null;
  sent_notice_count: number;
  formal_default_notice_sent: boolean;
  opened_at: string;
  decision_due_at: string | null;
  closed_at: string | null;
  closure_reason: string | null;
  status_changed_at: string;
  created_at: string;
  updated_at: string;
};

export type CreditDefaultQueueRow = CreditDefaultReviewRow;

export type CreditDefaultEvidenceRow = {
  evidence_id: string;
  default_review_id: string;
  evidence_type: string;
  source_reference_type: string | null;
  source_reference_id: string | null;
  evidence_summary: string;
  locked_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type CreditDefaultDecisionRow = {
  default_decision_id: string;
  default_review_id: string;
  credit_account_id: string;
  decision: CreditDefaultDecision;
  decision_reason: string;
  decision_summary: string | null;
  approved_by: string | null;
  second_approver_id: string | null;
  decision_timestamp: string;
  driver_notice_required: boolean;
  driver_notice_sent_at: string | null;
  created_at: string;
};

export type CreditRecoveryPlanRow = {
  recovery_plan_id: string;
  default_review_id: string;
  credit_account_id: string;
  driver_id: string;
  plan_status: string;
  required_action_json: Record<string, unknown>;
  due_date: string;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
};

export type CreditAssetProtectionReviewRow = {
  asset_review_id: string;
  default_review_id: string;
  credit_account_id: string;
  asset_id: string | null;
  status: string;
  trigger_reason: string;
  inspection_required: boolean;
  inspection_due_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type CreditDefaultNoticeRow = {
  notice_id: string;
  default_review_id: string;
  driver_id: string;
  notice_type: string;
  notice_status: string;
  notice_summary: string;
  reason: string | null;
  required_action: string | null;
  deadline_at: string | null;
  support_instruction: string | null;
  sent_at: string | null;
  channel: string;
  created_at: string;
};

export type CreditDefaultAuditRow = {
  audit_event_id: string;
  default_review_id: string | null;
  credit_account_id: string | null;
  event_type: string;
  reason: string | null;
  actor_id: string | null;
  created_at: string;
};

export type DriverRefRow = {
  id: string;
  full_name: string | null;
  phone_number: string | null;
};

export type CollectionsQueueRefRow = {
  case_id: string;
  credit_account_id: string;
  driver_id: string;
  driver_name: string | null;
  driver_phone: string | null;
  product_name: string | null;
  product_type: string | null;
  total_past_due_amount: number;
  days_past_due: number;
};

export type DriverDefaultStatusRow = {
  default_review_id: string;
  credit_account_id: string;
  product_name: string | null;
  status_label: string;
  status_tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | string;
  amount_affected: number;
  currency_code: string;
  days_past_due: number;
  deadline_at: string | null;
  primary_action_label: string;
  latest_notice_json: Record<string, unknown>;
  recovery_plan_json: Record<string, unknown>;
  driver_message: string;
};

export type AdminCreditDefaultsData = {
  reviews: CreditDefaultReviewRow[];
  queue: CreditDefaultReviewRow[];
  driversById: Map<string, DriverRefRow>;
  collectionsQueue: CollectionsQueueRefRow[];
  evidence: CreditDefaultEvidenceRow[];
  decisions: CreditDefaultDecisionRow[];
  recoveryPlans: CreditRecoveryPlanRow[];
  assetReviews: CreditAssetProtectionReviewRow[];
  notices: CreditDefaultNoticeRow[];
  auditEvents: CreditDefaultAuditRow[];
};

export const DEFAULT_EVIDENCE_TYPES = [
  'UNPAID_INVOICES',
  'PAYMENT_HISTORY',
  'PROMISE_TO_PAY_HISTORY',
  'DRIVER_CONTACT_ATTEMPTS',
  'ASSET_POSSESSION_STATUS',
  'ASSET_LOCATION_STATUS',
  'RISK_FLAGS',
  'INCIDENT_HISTORY',
  'CONTRACT_TERMS',
  'SIGNED_AGREEMENT',
  'NOTICES_SENT',
  'ADMIN_NOTES',
  'PHOTOS',
  'FIELD_REPORT',
  'OTHER',
] as const;

export function defaultStatusLabel(status: string | null | undefined) {
  switch (status) {
    case 'NOT_IN_DEFAULT': return 'Aucun defaut';
    case 'DEFAULT_REVIEW': return 'Dossier en revision';
    case 'EVIDENCE_GATHERING': return 'Pieces en verification';
    case 'RECOVERY_PLAN_PENDING': return 'Plan propose';
    case 'RECOVERY_PLAN_ACTIVE': return 'Plan de regularisation';
    case 'FORMAL_DEFAULT_PENDING_APPROVAL': return 'Validation requise';
    case 'FORMALLY_DEFAULTED': return 'Defaut formel confirme';
    case 'ASSET_PROTECTION_REVIEW': return 'Verification du bien finance';
    case 'RECOVERY_COMPLETED': return 'Regularisation terminee';
    case 'DEFAULT_REVERSED': return 'Decision annulee';
    case 'WRITTEN_OFF': return 'Dossier cloture direction';
    case 'CLOSED': return 'Dossier ferme';
    case 'MISSING': return 'Pieces manquantes';
    case 'PARTIAL': return 'Pieces partielles';
    case 'COMPLETE': return 'Pieces completes';
    case 'LOCKED': return 'Pieces verrouillees';
    case 'SENT': return 'Envoye';
    case 'PENDING': return 'En attente';
    case 'FAILED': return 'Echec';
    case 'OPEN': return 'Ouvert';
    case 'ACTIVE': return 'Actif';
    case 'FULFILLED': return 'Respecte';
    case 'BROKEN': return 'Non respecte';
    case 'CANCELLED': return 'Annule';
    case 'SUPERSEDED': return 'Remplace';
    default: return status?.replace(/_/g, ' ').toLowerCase() || 'En cours';
  }
}

export function defaultDecisionLabel(decision: string | null | undefined) {
  switch (decision) {
    case 'CONTINUE_COLLECTIONS': return 'Continuer collections';
    case 'RECOVERY_PLAN': return 'Plan de regularisation';
    case 'FORMAL_DEFAULT': return 'Defaut formel';
    case 'ASSET_PROTECTION_REVIEW': return 'Revue protection actif';
    case 'RESTRUCTURE_RECOMMENDED': return 'Restructuration recommandee';
    case 'WRITE_OFF_RECOMMENDED': return 'Cloture direction recommandee';
    case 'DEFAULT_NOT_SUPPORTED': return 'Defaut non justifie';
    case 'ESCALATE_TO_MANAGEMENT': return 'Escalader management';
    default: return decision?.replace(/_/g, ' ').toLowerCase() || 'Pas de decision';
  }
}

export function defaultEvidenceLabel(type: string | null | undefined) {
  switch (type) {
    case 'UNPAID_INVOICES': return 'Factures impayees';
    case 'PAYMENT_HISTORY': return 'Historique paiements';
    case 'PROMISE_TO_PAY_HISTORY': return 'Historique promesses';
    case 'DRIVER_CONTACT_ATTEMPTS': return 'Contacts conducteur';
    case 'ASSET_POSSESSION_STATUS': return 'Statut possession actif';
    case 'ASSET_LOCATION_STATUS': return 'Localisation actif';
    case 'RISK_FLAGS': return 'Signaux risque';
    case 'INCIDENT_HISTORY': return 'Historique incidents';
    case 'CONTRACT_TERMS': return 'Conditions contrat';
    case 'SIGNED_AGREEMENT': return 'Accord signe';
    case 'NOTICES_SENT': return 'Notifications envoyees';
    case 'ADMIN_NOTES': return 'Notes equipe';
    case 'PHOTOS': return 'Photos';
    case 'FIELD_REPORT': return 'Rapport terrain';
    case 'OTHER': return 'Autre piece';
    default: return type?.replace(/_/g, ' ').toLowerCase() || 'Piece';
  }
}

export function defaultNoticeLabel(type: string | null | undefined) {
  switch (type) {
    case 'DEFAULT_REVIEW_OPENED': return 'Dossier en revision';
    case 'RECOVERY_PLAN_OFFERED': return 'Plan propose';
    case 'PAYMENT_REQUIRED': return 'Paiement requis';
    case 'ASSET_INSPECTION_REQUESTED': return 'Verification du bien';
    case 'FORMAL_DEFAULT_NOTICE': return 'Avis defaut formel';
    case 'RECOVERY_COMPLETED': return 'Regularisation terminee';
    case 'REVIEW_CLOSED': return 'Dossier ferme';
    default: return type?.replace(/_/g, ' ').toLowerCase() || 'Notification';
  }
}

export function defaultTone(status: string | null | undefined) {
  if (['FORMALLY_DEFAULTED', 'FORMAL_DEFAULT_PENDING_APPROVAL', 'WRITTEN_OFF', 'FAILED'].includes(status ?? '')) return 'destructive';
  if (['RECOVERY_PLAN_ACTIVE', 'RECOVERY_COMPLETED', 'DEFAULT_REVERSED', 'CLOSED', 'SENT', 'COMPLETE'].includes(status ?? '')) return 'verified';
  if (['ASSET_PROTECTION_REVIEW', 'EVIDENCE_GATHERING', 'RECOVERY_PLAN_PENDING', 'PARTIAL', 'PENDING'].includes(status ?? '')) return 'secondary';
  return 'outline';
}

function normalizeUuid(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}

function normalizeRequiredAction(requiredAction: string | Record<string, unknown>) {
  if (typeof requiredAction === 'string') {
    return {
      action: requiredAction,
      source: 'layer3f_admin',
    };
  }
  return requiredAction;
}

export function useAdminCreditDefaultsData() {
  return useQuery({
    queryKey: ['admin-credit-defaults'],
    queryFn: async (): Promise<AdminCreditDefaultsData> => {
      const [queueRes, evidenceRes, decisionsRes, recoveryRes, assetRes, noticesRes, auditRes, driversRes, collectionsRes] = await Promise.all([
        defaultClient
          .from<CreditDefaultReviewRow[]>('v_credit_default_review_queue')
          .select('*')
          .order('decision_due_at', { ascending: true }),
        defaultClient
          .from<CreditDefaultEvidenceRow[]>('credit_default_evidence')
          .select('evidence_id, default_review_id, evidence_type, source_reference_type, source_reference_id, evidence_summary, locked_at, created_by, created_at')
          .order('created_at', { ascending: false })
          .limit(300),
        defaultClient
          .from<CreditDefaultDecisionRow[]>('credit_default_decisions')
          .select('default_decision_id, default_review_id, credit_account_id, decision, decision_reason, decision_summary, approved_by, second_approver_id, decision_timestamp, driver_notice_required, driver_notice_sent_at, created_at')
          .order('decision_timestamp', { ascending: false })
          .limit(250),
        defaultClient
          .from<CreditRecoveryPlanRow[]>('credit_recovery_plans')
          .select('recovery_plan_id, default_review_id, credit_account_id, driver_id, plan_status, required_action_json, due_date, created_by, approved_by, created_at')
          .order('created_at', { ascending: false })
          .limit(250),
        defaultClient
          .from<CreditAssetProtectionReviewRow[]>('credit_asset_protection_reviews')
          .select('asset_review_id, default_review_id, credit_account_id, asset_id, status, trigger_reason, inspection_required, inspection_due_at, created_by, created_at')
          .order('created_at', { ascending: false })
          .limit(250),
        defaultClient
          .from<CreditDefaultNoticeRow[]>('credit_default_notices')
          .select('notice_id, default_review_id, driver_id, notice_type, notice_status, notice_summary, reason, required_action, deadline_at, support_instruction, sent_at, channel, created_at')
          .order('created_at', { ascending: false })
          .limit(250),
        defaultClient
          .from<CreditDefaultAuditRow[]>('credit_default_audit_events')
          .select('audit_event_id, default_review_id, credit_account_id, event_type, reason, actor_id, created_at')
          .order('created_at', { ascending: false })
          .limit(300),
        defaultClient
          .from<DriverRefRow[]>('drivers')
          .select('id, full_name, phone_number')
          .limit(750),
        defaultClient
          .from<CollectionsQueueRefRow[]>('v_credit_collections_queue')
          .select('case_id, credit_account_id, driver_id, driver_name, driver_phone, product_name, product_type, total_past_due_amount, days_past_due')
          .limit(500),
      ]);

      for (const result of [queueRes, evidenceRes, decisionsRes, recoveryRes, assetRes, noticesRes, auditRes, driversRes, collectionsRes]) {
        if (result.error) throw result.error;
      }

      const reviews = queueRes.data ?? [];
      return {
        reviews,
        queue: reviews,
        driversById: new Map((driversRes.data ?? []).map((driver) => [driver.id, driver])),
        collectionsQueue: collectionsRes.data ?? [],
        evidence: evidenceRes.data ?? [],
        decisions: decisionsRes.data ?? [],
        recoveryPlans: recoveryRes.data ?? [],
        assetReviews: assetRes.data ?? [],
        notices: noticesRes.data ?? [],
        auditEvents: auditRes.data ?? [],
      };
    },
  });
}

export function useDriverDefaultStatus(enabled = true) {
  const { data: driverId } = useDriverId();
  return useQuery({
    queryKey: ['driver-credit-default-status', driverId],
    enabled: enabled && !!driverId,
    queryFn: async () => {
      const { data, error } = await defaultClient.rpc<DriverDefaultStatusRow[]>('get_driver_default_status');
      if (error) throw error;
      return data ?? [];
    },
  });
}

function invalidateDefaults(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['admin-credit-defaults'] });
  queryClient.invalidateQueries({ queryKey: ['admin-credit-collections'] });
  queryClient.invalidateQueries({ queryKey: ['admin-attention-center'] });
  queryClient.invalidateQueries({ queryKey: ['driver-credit-default-status'] });
  queryClient.invalidateQueries({ queryKey: ['driver-credit-collections'] });
  queryClient.invalidateQueries({ queryKey: ['trust-risk'] });
  queryClient.invalidateQueries({ queryKey: ['growth-ownership'] });
}

export function useOpenCreditDefaultReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      creditAccountId,
      caseId,
      reason,
      dueAt,
    }: {
      creditAccountId: string;
      caseId?: string | null;
      reason: string;
      dueAt?: string | null;
    }) => {
      const idempotencyKey = makeCreditIdempotencyKey('default-open-review');
      const { data, error } = await defaultClient.rpc('open_credit_default_review', {
        p_credit_account_id: creditAccountId,
        p_collections_case_id: caseId ?? null,
        p_trigger_reason: reason,
        p_decision_due_at: dueAt ?? null,
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as CreditDefaultReviewRow;
    },
    onSuccess: () => {
      invalidateDefaults(queryClient);
      toast.success('Default review opened.');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to open default review'),
  });
}

export function useAssignCreditDefaultReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      defaultReviewId,
      assignedTo,
      note,
    }: {
      defaultReviewId: string;
      assignedTo?: string | null;
      note?: string | null;
    }) => {
      const idempotencyKey = makeCreditIdempotencyKey('default-assign-review');
      const { data, error } = await defaultClient.rpc('assign_credit_default_review', {
        p_default_review_id: defaultReviewId,
        p_assigned_to: assignedTo ?? null,
        p_note: note ?? 'Assigned from Default Recovery queue',
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as CreditDefaultReviewRow;
    },
    onSuccess: () => {
      invalidateDefaults(queryClient);
      toast.success('Review assigned.');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to assign review'),
  });
}

export function useAttachCreditDefaultEvidence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      defaultReviewId,
      reviewId,
      evidenceType,
      summary,
      sourceReferenceType,
      sourceReferenceId,
      sourceType,
      sourceId,
    }: {
      defaultReviewId?: string;
      reviewId?: string;
      evidenceType: string;
      summary: string;
      sourceReferenceType?: string | null;
      sourceReferenceId?: string | null;
      sourceType?: string | null;
      sourceId?: string | null;
    }) => {
      const idempotencyKey = makeCreditIdempotencyKey('default-evidence');
      const { data, error } = await defaultClient.rpc('attach_credit_default_evidence', {
        p_default_review_id: defaultReviewId ?? reviewId,
        p_evidence_type: evidenceType,
        p_evidence_summary: summary,
        p_source_reference_type: sourceReferenceType ?? sourceType ?? null,
        p_source_reference_id: normalizeUuid(sourceReferenceId ?? sourceId),
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as CreditDefaultEvidenceRow;
    },
    onSuccess: () => {
      invalidateDefaults(queryClient);
      toast.success('Evidence attached.');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to attach evidence'),
  });
}

export function useCreateCreditDefaultDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      defaultReviewId,
      reviewId,
      decision,
      reason,
      summary,
      driverNoticeRequired,
      noticeRequired,
      secondApproverId,
    }: {
      defaultReviewId?: string;
      reviewId?: string;
      decision: string;
      reason: string;
      summary?: string | null;
      driverNoticeRequired?: boolean;
      noticeRequired?: boolean;
      secondApproverId?: string | null;
    }) => {
      const idempotencyKey = makeCreditIdempotencyKey('default-decision');
      const { data, error } = await defaultClient.rpc('create_credit_default_decision', {
        p_default_review_id: defaultReviewId ?? reviewId,
        p_decision: decision,
        p_decision_reason: reason,
        p_decision_summary: summary ?? null,
        p_second_approver_id: secondApproverId || null,
        p_driver_notice_required: driverNoticeRequired ?? noticeRequired ?? true,
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as CreditDefaultDecisionRow;
    },
    onSuccess: () => {
      invalidateDefaults(queryClient);
      toast.success('Decision recorded.');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to record decision'),
  });
}

export function useCreateCreditRecoveryPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      defaultReviewId,
      reviewId,
      requiredAction,
      dueDate,
      approvedBy,
    }: {
      defaultReviewId?: string;
      reviewId?: string;
      requiredAction: string | Record<string, unknown>;
      dueDate: string;
      approvedBy?: string | null;
    }) => {
      const idempotencyKey = makeCreditIdempotencyKey('default-recovery-plan');
      const { data, error } = await defaultClient.rpc('create_credit_recovery_plan', {
        p_default_review_id: defaultReviewId ?? reviewId,
        p_required_action_json: normalizeRequiredAction(requiredAction),
        p_due_date: dueDate,
        p_approved_by: approvedBy ?? null,
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as CreditRecoveryPlanRow;
    },
    onSuccess: () => {
      invalidateDefaults(queryClient);
      toast.success('Recovery plan activated.');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to create recovery plan'),
  });
}

export function useOpenCreditAssetProtectionReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      defaultReviewId,
      reviewId,
      triggerReason,
      reason,
      assetId,
      inspectionRequired,
      inspectionDueAt,
    }: {
      defaultReviewId?: string;
      reviewId?: string;
      triggerReason?: string;
      reason?: string;
      assetId?: string | null;
      inspectionRequired: boolean;
      inspectionDueAt?: string | null;
    }) => {
      const idempotencyKey = makeCreditIdempotencyKey('default-asset-protection');
      const { data, error } = await defaultClient.rpc('open_credit_asset_protection_review', {
        p_default_review_id: defaultReviewId ?? reviewId,
        p_trigger_reason: triggerReason ?? reason,
        p_asset_id: normalizeUuid(assetId),
        p_inspection_required: inspectionRequired,
        p_inspection_due_at: inspectionDueAt || null,
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as CreditAssetProtectionReviewRow;
    },
    onSuccess: () => {
      invalidateDefaults(queryClient);
      toast.success('Asset protection review opened.');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to open asset review'),
  });
}

export function useSendCreditDefaultNotice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      defaultReviewId,
      reviewId,
      noticeType,
      summary,
      reason,
      requiredAction,
      deadlineAt,
      channel,
    }: {
      defaultReviewId?: string;
      reviewId?: string;
      noticeType: string;
      summary: string;
      reason?: string | null;
      requiredAction?: string | null;
      deadlineAt?: string | null;
      channel?: string;
    }) => {
      const idempotencyKey = makeCreditIdempotencyKey('default-notice');
      const driverAction = (requiredAction ?? summary).trim();
      const noticeReason = (reason ?? summary).trim();
      const { data, error } = await defaultClient.rpc('send_credit_default_notice', {
        p_default_review_id: defaultReviewId ?? reviewId,
        p_notice_type: noticeType,
        p_notice_summary: summary,
        p_reason: noticeReason,
        p_required_action: driverAction,
        p_deadline_at: deadlineAt ?? null,
        p_channel: channel ?? 'IN_APP',
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as CreditDefaultNoticeRow;
    },
    onSuccess: () => {
      invalidateDefaults(queryClient);
      toast.success('Driver notice recorded.');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to send notice'),
  });
}

export function useDeclareFormalCreditDefault() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ defaultReviewId, reviewId, reason }: { defaultReviewId?: string; reviewId?: string; reason: string }) => {
      const idempotencyKey = makeCreditIdempotencyKey('default-formal-declare');
      const { data, error } = await defaultClient.rpc('declare_credit_formal_default', {
        p_default_review_id: defaultReviewId ?? reviewId,
        p_reason: reason,
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as CreditDefaultReviewRow;
    },
    onSuccess: () => {
      invalidateDefaults(queryClient);
      toast.success('Formal default declared.');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to declare formal default'),
  });
}

export function useReverseCreditDefault() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      defaultReviewId,
      reviewId,
      reason,
      restoreStatus,
    }: {
      defaultReviewId?: string;
      reviewId?: string;
      reason: string;
      restoreStatus?: string;
    }) => {
      const idempotencyKey = makeCreditIdempotencyKey('default-reverse');
      const { data, error } = await defaultClient.rpc('reverse_credit_formal_default', {
        p_default_review_id: defaultReviewId ?? reviewId,
        p_reason: reason,
        p_new_account_status: restoreStatus ?? 'PAST_DUE',
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as CreditDefaultReviewRow;
    },
    onSuccess: () => {
      invalidateDefaults(queryClient);
      toast.success('Default reversed.');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to reverse default'),
  });
}

export function useCloseCreditDefaultReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      defaultReviewId,
      reviewId,
      reason,
      finalStatus,
    }: {
      defaultReviewId?: string;
      reviewId?: string;
      reason: string;
      finalStatus?: string;
    }) => {
      const idempotencyKey = makeCreditIdempotencyKey('default-close-review');
      const { data, error } = await defaultClient.rpc('close_credit_default_review', {
        p_default_review_id: defaultReviewId ?? reviewId,
        p_closure_reason: reason,
        p_final_status: finalStatus ?? 'CLOSED',
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as CreditDefaultReviewRow;
    },
    onSuccess: () => {
      invalidateDefaults(queryClient);
      toast.success('Default review closed.');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to close review'),
  });
}
