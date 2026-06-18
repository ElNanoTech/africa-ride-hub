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

type OwnershipQueryBuilder<T = unknown> = PromiseLike<QueryResult<T>> & {
  select: (columns?: string, options?: Record<string, unknown>) => OwnershipQueryBuilder<T>;
  order: (column: string, options?: Record<string, unknown>) => OwnershipQueryBuilder<T>;
  eq: (column: string, value: unknown) => OwnershipQueryBuilder<T>;
  in: (column: string, values: unknown[]) => OwnershipQueryBuilder<T>;
  limit: (count: number) => OwnershipQueryBuilder<T>;
};

type OwnershipSupabaseClient = {
  from: <T = unknown>(table: string) => OwnershipQueryBuilder<T>;
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<QueryResult<T>>;
};

const ownershipClient = supabase as unknown as OwnershipSupabaseClient;

export const OWNERSHIP_COMPLETION_REALTIME_TABLES: RealtimeTableName[] = [
  'ownership_completion_reviews',
  'ownership_completion_decisions',
  'asset_transfer_records',
  'ownership_certificates',
  'ownership_completion_audit_events',
] as const;

export type OwnershipCompletionStatus =
  | 'NOT_ELIGIBLE'
  | 'ELIGIBLE_FOR_COMPLETION'
  | 'UNDER_COMPLETION_REVIEW'
  | 'AWAITING_FINAL_APPROVAL'
  | 'COMPLETED'
  | 'REVERSED'
  | 'CANCELLED'
  | string;

export type OwnershipCompletionDecision =
  | 'APPROVE_COMPLETION'
  | 'REJECT_COMPLETION'
  | 'REQUEST_REVIEW'
  | 'ESCALATE'
  | string;

export type OwnershipTransferStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'COMPLETED'
  | 'REVERSED'
  | 'CANCELLED'
  | string;

export type OwnershipCertificateStatus =
  | 'ISSUED'
  | 'ACTIVE'
  | 'REGENERATED_COPY'
  | 'REVOKED'
  | string;

export type OwnershipCompletionQueueRow = {
  completion_review_id?: string | null;
  review_id?: string | null;
  ownership_completion_review_id?: string | null;
  transfer_id?: string | null;
  certificate_id?: string | null;
  credit_account_id: string;
  driver_id: string;
  driver_name?: string | null;
  driver_phone?: string | null;
  customer_id?: string | null;
  asset_id?: string | null;
  asset_type?: string | null;
  asset_description?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  product_type?: string | null;
  completion_status?: OwnershipCompletionStatus | null;
  status?: OwnershipCompletionStatus | null;
  status_label?: string | null;
  eligibility_status?: string | null;
  eligibility_label?: string | null;
  transfer_status?: OwnershipTransferStatus | null;
  certificate_status?: OwnershipCertificateStatus | null;
  outstanding_balance?: number | null;
  principal_amount?: number | null;
  currency_code?: string | null;
  obligations_paid_count?: number | null;
  obligations_total_count?: number | null;
  paid_obligations_count?: number | null;
  total_obligations_count?: number | null;
  documentation_status?: string | null;
  product_rules_status?: string | null;
  default_review_status?: string | null;
  recovery_plan_status?: string | null;
  fraud_review_status?: string | null;
  legal_hold_status?: string | null;
  open_disputes_count?: number | null;
  blocker_count?: number | null;
  blocked_reason?: string | null;
  blocked_reasons?: string[] | null;
  blocked_reasons_json?: unknown;
  blockers_json?: unknown;
  completion_blockers_json?: unknown;
  assigned_reviewer?: string | null;
  assigned_to?: string | null;
  latest_decision?: OwnershipCompletionDecision | null;
  latest_decision_reason?: string | null;
  review_due_at?: string | null;
  decision_due_at?: string | null;
  eligible_at?: string | null;
  opened_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  priority_score?: number | null;
};

export type OwnershipCompletionReviewRow = {
  review_id: string;
  completion_review_id?: string | null;
  credit_account_id: string;
  driver_id: string;
  asset_id: string | null;
  review_status: OwnershipCompletionStatus;
  status?: OwnershipCompletionStatus | null;
  assigned_reviewer: string | null;
  assigned_to?: string | null;
  trigger_reason: string | null;
  review_notes: string | null;
  opened_at: string | null;
  review_due_at: string | null;
  closed_at: string | null;
  closure_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type OwnershipCompletionDecisionRow = {
  decision_id: string;
  completion_decision_id?: string | null;
  review_id: string;
  completion_review_id?: string | null;
  credit_account_id: string;
  decision: OwnershipCompletionDecision;
  decision_reason: string;
  decision_summary: string | null;
  decided_by?: string | null;
  approved_by?: string | null;
  second_approver_id?: string | null;
  decision_timestamp: string;
  created_at: string;
};

export type AssetTransferRecordRow = {
  transfer_id: string;
  review_id: string;
  credit_account_id: string;
  driver_id: string;
  asset_id: string | null;
  transfer_status: OwnershipTransferStatus;
  transfer_type: string;
  approved_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OwnershipCertificateRow = {
  certificate_id: string;
  transfer_id: string;
  driver_id: string;
  asset_id: string | null;
  certificate_number: string;
  issued_at: string | null;
  certificate_status: OwnershipCertificateStatus;
  document_reference: string | null;
  created_at?: string | null;
};

export type OwnershipCompletionAuditEventRow = {
  audit_event_id: string;
  review_id?: string | null;
  completion_review_id?: string | null;
  credit_account_id: string | null;
  transfer_id?: string | null;
  certificate_id?: string | null;
  event_type: string;
  reason: string | null;
  actor_id: string | null;
  event_payload_json?: Record<string, unknown> | null;
  created_at: string;
};

export type DriverOwnershipCompletionStatusRow = {
  review_id: string;
  credit_account_id: string;
  asset_id: string;
  asset_type: string | null;
  product_name: string | null;
  status: string;
  status_label: string;
  status_tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | string;
  ownership_date: string | null;
  certificate_id: string | null;
  certificate_number: string | null;
  certificate_document_reference: string | null;
  transfer_id: string | null;
  blocking_reasons_json: unknown;
  progress_json: Record<string, unknown>;
  driver_message: string;
};

export type AdminOwnershipCompletionData = {
  queue: OwnershipCompletionQueueRow[];
  reviews: OwnershipCompletionReviewRow[];
  decisions: OwnershipCompletionDecisionRow[];
  transfers: AssetTransferRecordRow[];
  certificates: OwnershipCertificateRow[];
  auditEvents: OwnershipCompletionAuditEventRow[];
};

export function ownershipStatusLabel(status: string | null | undefined) {
  switch (status) {
    case 'NOT_ELIGIBLE': return 'Pas encore eligible';
    case 'ELIGIBLE_FOR_COMPLETION': return 'Pret pour validation';
    case 'UNDER_COMPLETION_REVIEW': return 'Revue en cours';
    case 'AWAITING_FINAL_APPROVAL': return 'Validation finale';
    case 'COMPLETED': return 'Transfert termine';
    case 'REVERSED': return 'Transfert annule';
    case 'CANCELLED': return 'Dossier annule';
    case 'PENDING': return 'En attente';
    case 'APPROVED': return 'Approuve';
    case 'ISSUED': return 'Certificat emis';
    case 'ACTIVE': return 'Actif';
    case 'BLOCKED': return 'Bloque';
    case 'COMPLETE': return 'Complet';
    case 'INCOMPLETE': return 'Incomplet';
    case 'NONE': return 'Aucun';
    default: return status?.replace(/_/g, ' ').toLowerCase() || 'En cours';
  }
}

export function ownershipDecisionLabel(decision: string | null | undefined) {
  switch (decision) {
    case 'APPROVE_COMPLETION': return 'Approuver le transfert';
    case 'REJECT_COMPLETION': return 'Refuser la completion';
    case 'REQUEST_REVIEW': return 'Demander une revue';
    case 'ESCALATE': return 'Escalader';
    default: return decision?.replace(/_/g, ' ').toLowerCase() || 'Pas de decision';
  }
}

export function ownershipTransferTypeLabel(type: string | null | undefined) {
  switch (type) {
    case 'OWNERSHIP_TRANSFER': return 'Transfert de propriete';
    case 'TITLE_RELEASE': return 'Liberation du titre';
    case 'ASSET_RELEASE': return 'Liberation de l actif';
    case 'DIGITAL_ASSET_TRANSFER': return 'Transfert digital';
    default: return type?.replace(/_/g, ' ').toLowerCase() || 'Transfert';
  }
}

export function ownershipAuditEventLabel(eventType: string | null | undefined) {
  switch (eventType) {
    case 'CANDIDATE_SYNCED': return 'Candidat synchronise';
    case 'COMPLETION_REVIEW_OPENED': return 'Revue ouverte';
    case 'COMPLETION_REVIEW_ASSIGNED': return 'Revue assignee';
    case 'COMPLETION_DECISION_CREATED': return 'Decision enregistree';
    case 'COMPLETION_APPROVED': return 'Completion approuvee';
    case 'COMPLETION_REJECTED': return 'Completion refusee';
    case 'COMPLETION_ESCALATED': return 'Completion escaladee';
    case 'TRANSFER_CREATED': return 'Transfert cree';
    case 'TRANSFER_COMPLETED': return 'Transfert termine';
    case 'CERTIFICATE_ISSUED': return 'Certificat emis';
    case 'COMPLETION_REVERSED': return 'Completion annulee';
    case 'EXCEPTION_BLOCKED': return 'Exception bloquante';
    default: return eventType?.replace(/_/g, ' ').toLowerCase() || 'Evenement';
  }
}

export function ownershipTone(status: string | null | undefined) {
  if (['REVERSED', 'CANCELLED', 'REJECT_COMPLETION', 'BLOCKED', 'FAILED'].includes(status ?? '')) return 'destructive';
  if (['COMPLETED', 'APPROVED', 'APPROVE_COMPLETION', 'ISSUED', 'ACTIVE', 'COMPLETE'].includes(status ?? '')) return 'success';
  if (['AWAITING_FINAL_APPROVAL', 'UNDER_COMPLETION_REVIEW', 'REQUEST_REVIEW', 'ESCALATE', 'PENDING', 'INCOMPLETE'].includes(status ?? '')) return 'pending';
  if (status === 'ELIGIBLE_FOR_COMPLETION') return 'approved';
  return 'outline';
}

export function getOwnershipReviewId(row: Pick<OwnershipCompletionQueueRow, 'completion_review_id' | 'review_id' | 'ownership_completion_review_id'> | null | undefined) {
  return row?.completion_review_id ?? row?.review_id ?? row?.ownership_completion_review_id ?? null;
}

export function getOwnershipStatus(row: Pick<OwnershipCompletionQueueRow, 'completion_status' | 'status'> | null | undefined) {
  return row?.completion_status ?? row?.status ?? 'NOT_ELIGIBLE';
}

export function getOwnershipBlockers(row: OwnershipCompletionQueueRow | null | undefined) {
  if (!row) return [];
  const raw = row.blocked_reasons_json ?? row.blockers_json ?? row.completion_blockers_json ?? row.blocked_reasons ?? row.blocked_reason;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((item) => String(item)).filter(Boolean);
  if (typeof raw === 'string') return [raw];
  if (typeof raw === 'object' && raw !== null) {
    if ('reasons' in raw && Array.isArray((raw as { reasons?: unknown }).reasons)) {
      return (raw as { reasons: unknown[] }).reasons.map((item) => String(item)).filter(Boolean);
    }
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, value]) => value === true || typeof value === 'string')
      .map(([key, value]) => (typeof value === 'string' ? value : key.replace(/_/g, ' ')));
  }
  return [];
}

export function useAdminOwnershipCompletionData() {
  return useQuery({
    queryKey: ['admin-ownership-completion'],
    queryFn: async (): Promise<AdminOwnershipCompletionData> => {
      const [queueRes, reviewsRes, decisionsRes, transfersRes, certificatesRes, auditRes] = await Promise.all([
        ownershipClient
          .from<OwnershipCompletionQueueRow[]>('v_ownership_completion_queue')
          .select('*')
          .limit(500),
        ownershipClient
          .from<OwnershipCompletionReviewRow[]>('ownership_completion_reviews')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(300),
        ownershipClient
          .from<OwnershipCompletionDecisionRow[]>('ownership_completion_decisions')
          .select('*')
          .order('decision_timestamp', { ascending: false })
          .limit(300),
        ownershipClient
          .from<AssetTransferRecordRow[]>('asset_transfer_records')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(300),
        ownershipClient
          .from<OwnershipCertificateRow[]>('ownership_certificates')
          .select('*')
          .order('issued_at', { ascending: false })
          .limit(300),
        ownershipClient
          .from<OwnershipCompletionAuditEventRow[]>('ownership_completion_audit_events')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(400),
      ]);

      for (const result of [queueRes, reviewsRes, decisionsRes, transfersRes, certificatesRes, auditRes]) {
        if (result.error) throw result.error;
      }

      return {
        queue: queueRes.data ?? [],
        reviews: reviewsRes.data ?? [],
        decisions: decisionsRes.data ?? [],
        transfers: transfersRes.data ?? [],
        certificates: certificatesRes.data ?? [],
        auditEvents: auditRes.data ?? [],
      };
    },
  });
}

export function useDriverOwnershipCompletionStatus(enabled = true) {
  const { data: driverId } = useDriverId();
  return useQuery({
    queryKey: ['driver-ownership-completion-status', driverId],
    enabled: enabled && !!driverId,
    queryFn: async () => {
      const { data, error } = await ownershipClient.rpc<DriverOwnershipCompletionStatusRow[]>('get_driver_ownership_completion_status');
      if (error) throw error;
      return data ?? [];
    },
  });
}

function invalidateOwnershipCompletion(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['admin-ownership-completion'] });
  queryClient.invalidateQueries({ queryKey: ['admin-attention-center'] });
  queryClient.invalidateQueries({ queryKey: ['growth-ownership'] });
  queryClient.invalidateQueries({ queryKey: ['driver-credit-engine'] });
  queryClient.invalidateQueries({ queryKey: ['driver-ownership-completion-status'] });
  queryClient.invalidateQueries({ queryKey: ['trust-risk'] });
}

function mutationCount(data: unknown) {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object' && 'synced_count' in data) return Number((data as { synced_count?: unknown }).synced_count ?? 0);
  if (data && typeof data === 'object' && 'count' in data) return Number((data as { count?: unknown }).count ?? 0);
  return 0;
}

export function useSyncOwnershipCompletionCandidates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (creditAccountId?: string | null) => {
      const idempotencyKey = makeCreditIdempotencyKey('ownership-completion-sync');
      const { data, error } = await ownershipClient.rpc('sync_ownership_completion_candidates', {
        p_credit_account_id: creditAccountId ?? null,
        p_limit: 250,
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      invalidateOwnershipCompletion(queryClient);
      toast.success(`${mutationCount(data)} dossier(s) de completion synchronise(s).`);
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to sync ownership candidates'),
  });
}

export function useOpenOwnershipCompletionReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      creditAccountId,
      reason,
      reviewDueAt,
    }: {
      creditAccountId: string;
      reason: string;
      reviewDueAt?: string | null;
    }) => {
      const idempotencyKey = makeCreditIdempotencyKey('ownership-completion-open-review');
      const { data, error } = await ownershipClient.rpc('open_ownership_completion_review', {
        p_credit_account_id: creditAccountId,
        p_trigger_reason: reason,
        p_review_due_at: reviewDueAt ?? null,
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as OwnershipCompletionReviewRow;
    },
    onSuccess: () => {
      invalidateOwnershipCompletion(queryClient);
      toast.success('Revue de completion ouverte.');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to open ownership review'),
  });
}

export function useAssignOwnershipCompletionReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      completionReviewId,
      assignedTo,
      note,
    }: {
      completionReviewId: string;
      assignedTo?: string | null;
      note?: string | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const idempotencyKey = makeCreditIdempotencyKey('ownership-completion-assign-review');
      const { data, error } = await ownershipClient.rpc('assign_ownership_completion_review', {
        p_review_id: completionReviewId,
        p_assigned_to: assignedTo ?? auth.user?.id ?? null,
        p_note: note ?? 'Assigned from Ownership Completion Center',
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as OwnershipCompletionReviewRow;
    },
    onSuccess: () => {
      invalidateOwnershipCompletion(queryClient);
      toast.success('Revue assignee.');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to assign ownership review'),
  });
}

export function useCreateOwnershipCompletionDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      completionReviewId,
      decision,
      reason,
      summary,
      secondApproverId,
    }: {
      completionReviewId: string;
      decision: OwnershipCompletionDecision;
      reason: string;
      summary?: string | null;
      secondApproverId?: string | null;
    }) => {
      const idempotencyKey = makeCreditIdempotencyKey('ownership-completion-decision');
      const { data, error } = await ownershipClient.rpc('create_ownership_completion_decision', {
        p_review_id: completionReviewId,
        p_decision: decision,
        p_decision_reason: reason,
        p_decision_summary: summary ?? null,
        p_second_approver_id: secondApproverId ?? null,
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as OwnershipCompletionDecisionRow;
    },
    onSuccess: () => {
      invalidateOwnershipCompletion(queryClient);
      toast.success('Decision de completion enregistree.');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to record ownership decision'),
  });
}

export function useIssueOwnershipCertificate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      reviewId,
      documentReference,
    }: {
      reviewId: string;
      documentReference?: string | null;
    }) => {
      const idempotencyKey = makeCreditIdempotencyKey('ownership-certificate-issue');
      const { data, error } = await ownershipClient.rpc('issue_ownership_certificate', {
        p_review_id: reviewId,
        p_document_reference: documentReference ?? null,
        p_transfer_type: 'OWNERSHIP_TRANSFER',
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as OwnershipCertificateRow;
    },
    onSuccess: () => {
      invalidateOwnershipCompletion(queryClient);
      toast.success('Certificat de propriete emis.');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to issue ownership certificate'),
  });
}

export function useReverseOwnershipCompletion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      reviewId,
      reason,
      secondApproverId,
      reopenedAccountStatus,
    }: {
      reviewId: string;
      reason: string;
      secondApproverId: string;
      reopenedAccountStatus?: string;
    }) => {
      const idempotencyKey = makeCreditIdempotencyKey('ownership-completion-reverse');
      const { data, error } = await ownershipClient.rpc('reverse_ownership_completion', {
        p_review_id: reviewId,
        p_reason: reason,
        p_second_approver_id: secondApproverId,
        p_reopened_account_status: reopenedAccountStatus ?? 'ACTIVE',
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as OwnershipCompletionReviewRow;
    },
    onSuccess: () => {
      invalidateOwnershipCompletion(queryClient);
      toast.success('Completion de propriete annulee.');
    },
    onError: (error: Error) => toast.error(error.message || 'Unable to reverse ownership completion'),
  });
}
