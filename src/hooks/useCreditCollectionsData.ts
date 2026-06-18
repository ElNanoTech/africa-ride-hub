import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/routeClient';
import { makeCreditIdempotencyKey } from '@/hooks/useCreditProductEngineData';
import { useDriverId } from '@/hooks/useDriverData';

type QueryResult<T> = {
  data: T | null;
  error: Error | null;
};

type CollectionsQueryBuilder<T = unknown> = PromiseLike<QueryResult<T>> & {
  select: (columns?: string, options?: Record<string, unknown>) => CollectionsQueryBuilder<T>;
  order: (column: string, options?: Record<string, unknown>) => CollectionsQueryBuilder<T>;
  eq: (column: string, value: unknown) => CollectionsQueryBuilder<T>;
  in: (column: string, values: unknown[]) => CollectionsQueryBuilder<T>;
  limit: (count: number) => CollectionsQueryBuilder<T>;
};

type CollectionsSupabaseClient = {
  from: <T = unknown>(table: string) => CollectionsQueryBuilder<T>;
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<QueryResult<T>>;
};

const collectionsClient = supabase as unknown as CollectionsSupabaseClient;

export type CollectionsSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;
export type CollectionsCaseStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_CONTACT'
  | 'PROMISE_TO_PAY'
  | 'PARTIAL_RECOVERY'
  | 'ESCALATED'
  | 'DEFAULT_REVIEW'
  | 'RESOLVED'
  | 'CLOSED'
  | string;

export type CollectionsDelinquencyStatus =
  | 'CURRENT'
  | 'DUE_SOON'
  | 'DUE_TODAY'
  | 'GRACE_PERIOD'
  | 'LATE'
  | 'COLLECTIONS_QUEUE'
  | 'PROMISE_TO_PAY'
  | 'PARTIALLY_RECOVERED'
  | 'ESCALATED_RISK'
  | 'DEFAULT_REVIEW'
  | 'RESOLVED'
  | string;

export type CreditCollectionsQueueRow = {
  case_id: string;
  customer_id: string | null;
  credit_account_id: string;
  schedule_id: string | null;
  obligation_id: string | null;
  invoice_id: string | null;
  driver_id: string;
  driver_name: string | null;
  driver_phone: string | null;
  product_id: string;
  product_type: string | null;
  product_name: string | null;
  current_status: CollectionsCaseStatus;
  current_status_label: string;
  delinquency_status: CollectionsDelinquencyStatus;
  delinquency_status_label: string;
  severity: CollectionsSeverity;
  total_past_due_amount: number;
  currency_code: string;
  days_past_due: number;
  assigned_to: string | null;
  escalation_level: number;
  risk_level: string;
  score_impact: number;
  priority_score: number;
  invoice_status: string | null;
  invoice_number: string | null;
  due_date: string | null;
  sequence_number: number | null;
  active_promise_id: string | null;
  promised_amount: number | null;
  promised_payment_date: string | null;
  promise_status: string | null;
  open_escalation_id: string | null;
  open_escalation_type: string | null;
  opened_at: string;
  created_at: string;
  updated_at: string;
};

export type CreditCollectionActionRow = {
  action_id: string;
  case_id: string;
  action_type: string;
  action_note: string | null;
  actor_id: string | null;
  driver_visible: boolean;
  created_at: string;
};

export type CreditPromiseToPayRow = {
  promise_id: string;
  case_id: string;
  driver_id: string;
  promised_amount: number;
  currency_code: string;
  promised_payment_date: string;
  promise_status: string;
  fulfilled_at: string | null;
  broken_at: string | null;
  created_at: string;
};

export type CreditReminderRow = {
  reminder_id: string;
  case_id: string | null;
  driver_id: string;
  reminder_type: string;
  channel: string;
  status: string;
  notification_id: string | null;
  sent_at: string | null;
  created_at: string;
};

export type CreditRiskEscalationRow = {
  escalation_id: string;
  case_id: string;
  credit_account_id: string;
  driver_id: string;
  escalation_type: string;
  severity: CollectionsSeverity;
  reason: string;
  status: string;
  score_event_id: string | null;
  created_at: string;
};

export type CreditCollectionsAuditRow = {
  audit_event_id: string;
  case_id: string | null;
  credit_account_id: string | null;
  obligation_id: string | null;
  event_type: string;
  reason: string | null;
  created_at: string;
};

export type CreditCollectionsAnomalyRow = {
  anomaly_id: string;
  case_id: string | null;
  credit_account_id: string | null;
  obligation_id: string | null;
  invoice_id: string | null;
  severity: CollectionsSeverity;
  anomaly_type: string;
  details_json: Record<string, unknown>;
  detected_at: string;
};

export type CollectionsProductVersionRow = {
  version_id: string;
  product_id: string;
  version_number: number;
  status: string;
  collections_rules_json: Record<string, unknown>;
  credit_products?: { name?: string | null; product_type?: string | null } | null;
};

export type DriverCollectionsStatusRow = {
  case_id: string | null;
  credit_account_id: string;
  invoice_id: string | null;
  product_name: string | null;
  status_label: string;
  status_tone: 'success' | 'warning' | 'danger' | 'neutral' | string;
  late_amount: number;
  days_late: number;
  grace_period_days: number;
  next_due_amount: number;
  next_due_date: string | null;
  payment_action_label: string;
  consequence_text: string;
  can_request_promise: boolean;
  active_promise_json: Record<string, unknown>;
  recovery_progress_pct: number;
  driver_message: string;
};

export type AdminCreditCollectionsData = {
  queue: CreditCollectionsQueueRow[];
  actions: CreditCollectionActionRow[];
  promises: CreditPromiseToPayRow[];
  reminders: CreditReminderRow[];
  escalations: CreditRiskEscalationRow[];
  auditEvents: CreditCollectionsAuditRow[];
  anomalies: CreditCollectionsAnomalyRow[];
  productVersions: CollectionsProductVersionRow[];
};

export function collectionsStatusLabel(status: string | null | undefined) {
  switch (status) {
    case 'CURRENT': return 'À jour';
    case 'DUE_SOON': return 'À payer bientôt';
    case 'DUE_TODAY': return "À payer aujourd'hui";
    case 'GRACE_PERIOD': return 'Période de grâce';
    case 'LATE': return 'En retard';
    case 'COLLECTIONS_QUEUE': return 'Action requise';
    case 'PROMISE_TO_PAY': return 'Promesse de paiement';
    case 'PARTIALLY_RECOVERED': return 'Paiement partiel';
    case 'ESCALATED_RISK': return 'Suivi prioritaire';
    case 'DEFAULT_REVIEW': return 'Revue en cours';
    case 'RESOLVED': return 'Résolu';
    case 'OPEN': return 'Ouvert';
    case 'ASSIGNED': return 'Assigné';
    case 'IN_CONTACT': return 'En contact';
    case 'PARTIAL_RECOVERY': return 'Récupération partielle';
    case 'ESCALATED': return 'Escaladé';
    case 'CLOSED': return 'Fermé';
    case 'MONITOR': return 'Surveillance';
    case 'ELEVATED': return 'Élevé';
    case 'HIGH': return 'Élevé';
    case 'CRITICAL': return 'Critique';
    default: return status || 'En cours';
  }
}

export function collectionsSeverityLabel(severity: string | null | undefined) {
  switch (severity) {
    case 'CRITICAL': return 'Critique';
    case 'HIGH': return 'Élevée';
    case 'MEDIUM': return 'Moyenne';
    case 'LOW': return 'Faible';
    default: return severity || 'Standard';
  }
}

export function collectionsEventLabel(eventType: string | null | undefined) {
  switch (eventType) {
    case 'CONTACT_ATTEMPT': return 'Contact tenté';
    case 'MANUAL_CALL_NOTE': return 'Note d’appel';
    case 'NOTE': return 'Note';
    case 'ASSIGNMENT': return 'Assignation';
    case 'PROMISE_CREATED': return 'Promesse créée';
    case 'PROMISE_FULFILLED': return 'Promesse respectée';
    case 'PROMISE_BROKEN': return 'Promesse non respectée';
    case 'REMINDER_SENT': return 'Rappel envoyé';
    case 'RISK_ESCALATION': return 'Risque escaladé';
    case 'DEFAULT_REVIEW': return 'Revue ouverte';
    case 'CASE_CLOSED': return 'Dossier fermé';
    case 'PAYMENT_SYNC': return 'Paiement synchronisé';
    case 'COLLECTIONS_CASE_CREATED': return 'Dossier créé';
    case 'DELINQUENCY_STATUS_CHANGED': return 'Statut mis à jour';
    case 'PROMISE_TO_PAY_CREATED': return 'Promesse créée';
    case 'PROMISE_TO_PAY_BROKEN': return 'Promesse non respectée';
    case 'RISK_ESCALATED': return 'Risque escaladé';
    case 'DEFAULT_REVIEW_OPENED': return 'Revue ouverte';
    case 'CASE_RESOLVED': return 'Dossier résolu';
    case 'CREDIT_PAYMENT_LATE': return 'Paiement en retard';
    case 'COLLECTIONS_ESCALATED': return 'Suivi prioritaire';
    case 'CREDIT_PAYMENT_RECOVERED': return 'Paiement récupéré';
    default: return eventType?.replace(/_/g, ' ').toLowerCase() || 'Événement';
  }
}

export function collectionsScoreReasonLabel(reason: string | null | undefined) {
  if (!reason) return 'Événement crédit';
  const [eventType] = reason.split(':');
  return collectionsEventLabel(eventType);
}

export function useAdminCreditCollectionsData() {
  return useQuery({
    queryKey: ['admin-credit-collections'],
    queryFn: async (): Promise<AdminCreditCollectionsData> => {
      const [queueRes, actionsRes, promisesRes, remindersRes, escalationsRes, auditRes, anomaliesRes, versionsRes] = await Promise.all([
        collectionsClient
          .from<CreditCollectionsQueueRow[]>('v_credit_collections_queue')
          .select('*')
          .order('priority_score', { ascending: false }),
        collectionsClient
          .from<CreditCollectionActionRow[]>('credit_collection_actions')
          .select('action_id, case_id, action_type, action_note, actor_id, driver_visible, created_at')
          .order('created_at', { ascending: false })
          .limit(250),
        collectionsClient
          .from<CreditPromiseToPayRow[]>('credit_promises_to_pay')
          .select('promise_id, case_id, driver_id, promised_amount, currency_code, promised_payment_date, promise_status, fulfilled_at, broken_at, created_at')
          .order('created_at', { ascending: false })
          .limit(250),
        collectionsClient
          .from<CreditReminderRow[]>('credit_reminders')
          .select('reminder_id, case_id, driver_id, reminder_type, channel, status, notification_id, sent_at, created_at')
          .order('created_at', { ascending: false })
          .limit(250),
        collectionsClient
          .from<CreditRiskEscalationRow[]>('credit_risk_escalations')
          .select('escalation_id, case_id, credit_account_id, driver_id, escalation_type, severity, reason, status, score_event_id, created_at')
          .order('created_at', { ascending: false })
          .limit(250),
        collectionsClient
          .from<CreditCollectionsAuditRow[]>('credit_collections_audit_events')
          .select('audit_event_id, case_id, credit_account_id, obligation_id, event_type, reason, created_at')
          .order('created_at', { ascending: false })
          .limit(250),
        collectionsClient
          .from<CreditCollectionsAnomalyRow[]>('v_credit_collections_reconciliation_anomalies')
          .select('anomaly_id, case_id, credit_account_id, obligation_id, invoice_id, severity, anomaly_type, details_json, detected_at')
          .order('detected_at', { ascending: false }),
        collectionsClient
          .from<CollectionsProductVersionRow[]>('product_versions')
          .select('version_id, product_id, version_number, status, collections_rules_json, credit_products(name, product_type)')
          .order('version_number', { ascending: false }),
      ]);

      for (const result of [queueRes, actionsRes, promisesRes, remindersRes, escalationsRes, auditRes, anomaliesRes, versionsRes]) {
        if (result.error) throw result.error;
      }

      return {
        queue: queueRes.data ?? [],
        actions: actionsRes.data ?? [],
        promises: promisesRes.data ?? [],
        reminders: remindersRes.data ?? [],
        escalations: escalationsRes.data ?? [],
        auditEvents: auditRes.data ?? [],
        anomalies: anomaliesRes.data ?? [],
        productVersions: versionsRes.data ?? [],
      };
    },
  });
}

export function useDriverCollectionsStatus(enabled = true) {
  const { data: driverId } = useDriverId();

  return useQuery({
    queryKey: ['driver-credit-collections', driverId],
    enabled: enabled && !!driverId,
    queryFn: async () => {
      const { data, error } = await collectionsClient.rpc<DriverCollectionsStatusRow[]>('get_driver_collections_status');
      if (error) throw error;
      return data ?? [];
    },
  });
}

function invalidateCollections(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['admin-credit-collections'] });
  queryClient.invalidateQueries({ queryKey: ['admin-repayment-operations'] });
  queryClient.invalidateQueries({ queryKey: ['admin-attention-center'] });
  queryClient.invalidateQueries({ queryKey: ['driver-credit-collections'] });
  queryClient.invalidateQueries({ queryKey: ['driver-credit-engine'] });
  queryClient.invalidateQueries({ queryKey: ['trust-risk'] });
}

export function useSyncCreditCollections() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (creditAccountId?: string | null) => {
      const { data, error } = await collectionsClient.rpc('sync_credit_collections', {
        p_credit_account_id: creditAccountId ?? null,
        p_idempotency_key: makeCreditIdempotencyKey('collections-sync'),
      });
      if (error) throw error;
      return data as Array<{ case_id: string; obligation_id: string; delinquency_status: string; case_status: string }>;
    },
    onSuccess: (rows) => {
      invalidateCollections(queryClient);
      toast.success(`${rows?.length ?? 0} dossier(s) collections synchronisé(s).`);
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur synchronisation collections'),
  });
}

export function useOpenCreditCollectionsCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ creditAccountId, obligationId, reason }: { creditAccountId: string; obligationId?: string | null; reason?: string | null }) => {
      const idempotencyKey = makeCreditIdempotencyKey('collections-open-case');
      const { data, error } = await collectionsClient.rpc('open_credit_collections_case', {
        p_credit_account_id: creditAccountId,
        p_obligation_id: obligationId ?? null,
        p_reason: reason ?? 'Manual collections review',
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as CreditCollectionsQueueRow;
    },
    onSuccess: () => {
      invalidateCollections(queryClient);
      toast.success('Dossier collections ouvert.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur ouverture dossier'),
  });
}

export function useAssignCreditCollectionsCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, note }: { caseId: string; note?: string | null }) => {
      const { data: userData } = await supabase.auth.getUser();
      const idempotencyKey = makeCreditIdempotencyKey('collections-assign');
      const { data, error } = await collectionsClient.rpc('assign_credit_collections_case', {
        p_case_id: caseId,
        p_assigned_to: userData.user?.id ?? null,
        p_note: note ?? 'Assigned from collections queue',
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as CreditCollectionsQueueRow;
    },
    onSuccess: () => {
      invalidateCollections(queryClient);
      toast.success('Dossier assigné.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur assignation'),
  });
}

export function useLogCreditCollectionContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      caseId,
      note,
      driverVisible,
      actionType,
    }: {
      caseId: string;
      note: string;
      driverVisible?: boolean;
      actionType?: string;
    }) => {
      const idempotencyKey = makeCreditIdempotencyKey('collections-contact');
      const { data, error } = await collectionsClient.rpc('log_credit_collection_contact', {
        p_case_id: caseId,
        p_action_note: note,
        p_driver_visible: driverVisible ?? false,
        p_action_type: actionType ?? 'CONTACT_ATTEMPT',
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as CreditCollectionActionRow;
    },
    onSuccess: () => {
      invalidateCollections(queryClient);
      toast.success('Contact enregistré.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur contact collections'),
  });
}

export function useCreatePromiseToPay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, amount, promisedDate }: { caseId: string; amount: number; promisedDate: string }) => {
      const idempotencyKey = makeCreditIdempotencyKey('collections-promise');
      const { data, error } = await collectionsClient.rpc('create_promise_to_pay', {
        p_case_id: caseId,
        p_promised_amount: amount,
        p_promised_payment_date: promisedDate,
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as CreditPromiseToPayRow;
    },
    onSuccess: () => {
      invalidateCollections(queryClient);
      toast.success('Promesse de paiement enregistrée.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur promesse de paiement'),
  });
}

export function useBreakPromiseToPay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ promiseId, reason }: { promiseId: string; reason?: string | null }) => {
      const idempotencyKey = makeCreditIdempotencyKey('collections-break-promise');
      const { data, error } = await collectionsClient.rpc('break_promise_to_pay', {
        p_promise_id: promiseId,
        p_reason: reason ?? 'Promise not respected',
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as CreditPromiseToPayRow;
    },
    onSuccess: () => {
      invalidateCollections(queryClient);
      toast.success('Promesse marquée non respectée.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur promesse'),
  });
}

export function useSendCreditCollectionReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, reminderType, channel }: { caseId: string; reminderType: string; channel?: string }) => {
      const idempotencyKey = makeCreditIdempotencyKey('collections-reminder');
      const { data, error } = await collectionsClient.rpc('send_credit_collection_reminder', {
        p_case_id: caseId,
        p_reminder_type: reminderType,
        p_channel: channel ?? 'IN_APP',
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as CreditReminderRow;
    },
    onSuccess: () => {
      invalidateCollections(queryClient);
      toast.success('Rappel envoyé.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur rappel'),
  });
}

export function useEscalateCreditRisk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, escalationType, reason }: { caseId: string; escalationType: string; reason: string }) => {
      const idempotencyKey = makeCreditIdempotencyKey('collections-risk-escalation');
      const { data, error } = await collectionsClient.rpc('escalate_credit_risk', {
        p_case_id: caseId,
        p_escalation_type: escalationType,
        p_reason: reason,
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as CreditRiskEscalationRow;
    },
    onSuccess: () => {
      invalidateCollections(queryClient);
      toast.success('Risque escaladé.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur escalade risque'),
  });
}

export function useOpenDefaultReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ creditAccountId, caseId, reason }: { creditAccountId: string; caseId: string; reason: string }) => {
      const idempotencyKey = makeCreditIdempotencyKey('collections-default-review');
      const { data, error } = await collectionsClient.rpc('open_credit_default_review', {
        p_credit_account_id: creditAccountId,
        p_collections_case_id: caseId,
        p_trigger_reason: reason,
        p_decision_due_at: null,
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as CreditCollectionsQueueRow;
    },
    onSuccess: () => {
      invalidateCollections(queryClient);
      queryClient.invalidateQueries({ queryKey: ['admin-credit-defaults'] });
      toast.success('Revue prioritaire ouverte.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur revue prioritaire'),
  });
}

export function useCloseCreditCollectionsCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, reason }: { caseId: string; reason: string }) => {
      const idempotencyKey = makeCreditIdempotencyKey('collections-close-case');
      const { data, error } = await collectionsClient.rpc('close_credit_collections_case', {
        p_case_id: caseId,
        p_closure_reason: reason,
        p_idempotency_key: idempotencyKey,
        p_request_hash: idempotencyKey,
      });
      if (error) throw error;
      return data as CreditCollectionsQueueRow;
    },
    onSuccess: () => {
      invalidateCollections(queryClient);
      toast.success('Dossier fermé.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur fermeture dossier'),
  });
}
