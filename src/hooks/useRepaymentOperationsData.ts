import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/routeClient';
import {
  makeCreditIdempotencyKey,
  type CreditAccountRow,
  type CreditInvoiceRow,
  type CreditProductRow,
} from '@/hooks/useCreditProductEngineData';
import type { CreditContractRow } from '@/hooks/useContractingOperationsData';
import { useDriverId } from '@/hooks/useDriverData';

type QueryResult<T> = {
  data: T | null;
  error: Error | null;
};

type RepaymentQueryBuilder<T = unknown> = PromiseLike<QueryResult<T>> & {
  select: (columns?: string, options?: Record<string, unknown>) => RepaymentQueryBuilder<T>;
  order: (column: string, options?: Record<string, unknown>) => RepaymentQueryBuilder<T>;
  eq: (column: string, value: unknown) => RepaymentQueryBuilder<T>;
  in: (column: string, values: unknown[]) => RepaymentQueryBuilder<T>;
  maybeSingle: () => RepaymentQueryBuilder<T>;
};

type RepaymentSupabaseClient = {
  from: <T = unknown>(table: string) => RepaymentQueryBuilder<T>;
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<QueryResult<T>>;
};

const repaymentClient = supabase as unknown as RepaymentSupabaseClient;

export type RepaymentScheduleRow = {
  schedule_id: string;
  credit_account_id: string;
  application_id: string;
  contract_id: string;
  product_id: string;
  product_version_id: string;
  schedule_version: number;
  schedule_status: string;
  schedule_type: string;
  currency_code: string;
  financed_amount: number;
  total_repayment_amount: number;
  total_fees_amount: number;
  total_interest_amount: number;
  term_count: number;
  frequency: string;
  first_due_date: string;
  final_due_date: string;
  grace_period_days: number;
  invoice_generation_days_before_due: number;
  allow_prepayment: boolean;
  allow_schedule_amendment: boolean;
  generated_from_contract_hash: string;
  generated_from_policy_snapshot_id: string | null;
  terms_snapshot_json: Record<string, unknown>;
  source_snapshot_json: Record<string, unknown>;
  superseded_by_schedule_id: string | null;
  created_at: string;
  credit_accounts?: CreditAccountRow | null;
  credit_products?: Pick<CreditProductRow, 'name' | 'product_type'> | null;
};

export type ScheduledObligationRow = {
  obligation_id: string;
  schedule_id: string;
  credit_account_id: string;
  sequence_number: number;
  obligation_type: string;
  due_date: string;
  amount: number;
  currency_code: string;
  principal_amount: number;
  interest_amount: number;
  fee_amount: number;
  status: string;
  invoice_id: string | null;
  invoice_generation_status: string;
  created_at: string;
};

export type RepaymentAuditEventRow = {
  audit_event_id: string;
  credit_account_id: string | null;
  schedule_id: string | null;
  obligation_id: string | null;
  event_type: string;
  reason: string | null;
  created_at: string;
};

export type RepaymentAnomalyRow = {
  anomaly_id: string;
  schedule_id: string | null;
  credit_account_id: string | null;
  obligation_id: string | null;
  invoice_id: string | null;
  severity: string;
  anomaly_type: string;
  details_json: Record<string, unknown>;
  detected_at: string;
};

export type DriverRepaymentScheduleRow = {
  schedule_id: string;
  credit_account_id: string;
  product_name: string;
  schedule_label: string;
  schedule_status_label: string;
  status_tone: 'success' | 'warning' | 'danger' | 'neutral' | string;
  next_due_amount: number;
  next_due_date: string | null;
  paid_installments: number;
  remaining_installments: number;
  remaining_balance: number;
  currency_code: string;
  allow_prepayment: boolean;
  obligations_json: Array<{
    sequence_number?: number;
    due_date?: string;
    amount?: number;
    currency_code?: string;
    status_label?: string;
    invoice_id?: string | null;
    invoice_number?: string | null;
    can_pay?: boolean;
  }>;
};

export type AdminRepaymentOperationsData = {
  schedules: RepaymentScheduleRow[];
  obligations: ScheduledObligationRow[];
  invoices: CreditInvoiceRow[];
  contracts: CreditContractRow[];
  accounts: CreditAccountRow[];
  anomalies: RepaymentAnomalyRow[];
  auditEvents: RepaymentAuditEventRow[];
};

export function useAdminRepaymentOperationsData() {
  return useQuery({
    queryKey: ['admin-repayment-operations'],
    queryFn: async (): Promise<AdminRepaymentOperationsData> => {
      const [schedulesRes, obligationsRes, invoicesRes, contractsRes, accountsRes, anomaliesRes, auditRes] = await Promise.all([
        repaymentClient
          .from<RepaymentScheduleRow[]>('repayment_schedules')
          .select(`
            schedule_id, credit_account_id, application_id, contract_id, product_id, product_version_id,
            schedule_version, schedule_status, schedule_type, currency_code, financed_amount,
            total_repayment_amount, total_fees_amount, total_interest_amount, term_count,
            frequency, first_due_date, final_due_date, grace_period_days,
            invoice_generation_days_before_due, allow_prepayment, allow_schedule_amendment,
            generated_from_contract_hash, generated_from_policy_snapshot_id,
            terms_snapshot_json, source_snapshot_json, superseded_by_schedule_id, created_at,
            credit_accounts(credit_account_id, driver_id, product_id, asset_id, status, principal_amount, principal_currency_code, activated_at, credit_products(name, product_type)),
            credit_products(name, product_type)
          `)
          .order('created_at', { ascending: false }),
        repaymentClient
          .from<ScheduledObligationRow[]>('scheduled_obligations')
          .select('obligation_id, schedule_id, credit_account_id, sequence_number, obligation_type, due_date, amount, currency_code, principal_amount, interest_amount, fee_amount, status, invoice_id, invoice_generation_status, created_at')
          .order('due_date', { ascending: true }),
        repaymentClient
          .from<CreditInvoiceRow[]>('invoice')
          .select('id, source_application_id, source_credit_account_id, source_product_id, source_schedule_id, source_obligation_id, obligation_type, currency_code, status, total_ttc, amount_paid, remaining_due, invoice_number, created_at')
          .order('created_at', { ascending: false }),
        repaymentClient
          .from<CreditContractRow[]>('credit_contracts')
          .select('contract_id, application_id, decision_id, product_id, product_version_id, template_id, template_version, contract_status, contract_snapshot_json, contract_hash, snapshot_hash, signature_hash, final_pdf_hash, signature_provider, driver_id, asset_id, credit_account_id, sent_at, viewed_at, driver_signed_at, admin_signed_at, fully_executed_at, expires_at, voided_at, void_reason, declined_at, decline_reason, superseded_by_contract_id, created_at')
          .order('created_at', { ascending: false }),
        repaymentClient
          .from<CreditAccountRow[]>('credit_accounts')
          .select('credit_account_id, driver_id, product_id, asset_id, status, principal_amount, principal_currency_code, activated_at, credit_products(name, product_type)')
          .order('created_at', { ascending: false }),
        repaymentClient
          .from<RepaymentAnomalyRow[]>('v_credit_schedule_reconciliation_anomalies')
          .select('anomaly_id, schedule_id, credit_account_id, obligation_id, invoice_id, severity, anomaly_type, details_json, detected_at')
          .order('detected_at', { ascending: false }),
        repaymentClient
          .from<RepaymentAuditEventRow[]>('repayment_audit_events')
          .select('audit_event_id, credit_account_id, schedule_id, obligation_id, event_type, reason, created_at')
          .order('created_at', { ascending: false }),
      ]);

      for (const result of [schedulesRes, obligationsRes, invoicesRes, contractsRes, accountsRes, anomaliesRes, auditRes]) {
        if (result.error) throw result.error;
      }

      return {
        schedules: schedulesRes.data ?? [],
        obligations: obligationsRes.data ?? [],
        invoices: invoicesRes.data ?? [],
        contracts: contractsRes.data ?? [],
        accounts: accountsRes.data ?? [],
        anomalies: anomaliesRes.data ?? [],
        auditEvents: auditRes.data ?? [],
      };
    },
  });
}

export function useDriverRepaymentSchedules(enabled = true) {
  const { data: driverId } = useDriverId();

  return useQuery({
    queryKey: ['driver-repayment-schedules', driverId],
    enabled: enabled && !!driverId,
    queryFn: async () => {
      const { data, error } = await repaymentClient.rpc<DriverRepaymentScheduleRow[]>('get_driver_repayment_schedules');
      if (error) throw error;
      return data ?? [];
    },
  });
}

function invalidateRepayment(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['admin-repayment-operations'] });
  queryClient.invalidateQueries({ queryKey: ['admin-credit-engine'] });
  queryClient.invalidateQueries({ queryKey: ['driver-credit-engine'] });
  queryClient.invalidateQueries({ queryKey: ['driver-repayment-schedules'] });
}

export function useGenerateRepaymentSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (creditAccountId: string) => {
      const { data, error } = await repaymentClient.rpc('generate_repayment_schedule', {
        p_credit_account_id: creditAccountId,
        p_idempotency_key: makeCreditIdempotencyKey('repayment-schedule'),
      });
      if (error) throw error;
      return data as RepaymentScheduleRow;
    },
    onSuccess: () => {
      invalidateRepayment(queryClient);
      toast.success('Calendrier de remboursement généré.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur calendrier remboursement'),
  });
}

export function useGenerateRepaymentInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (obligationId: string) => {
      const { data, error } = await repaymentClient.rpc('generate_repayment_invoice', {
        p_obligation_id: obligationId,
        p_idempotency_key: makeCreditIdempotencyKey('repayment-invoice'),
      });
      if (error) throw error;
      return data as CreditInvoiceRow;
    },
    onSuccess: () => {
      invalidateRepayment(queryClient);
      toast.success('Facture générée via Financial Engine.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur génération facture'),
  });
}

export function useSyncRepaymentStatuses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (scheduleId: string) => {
      const { data, error } = await repaymentClient.rpc('sync_repayment_obligation_statuses', {
        p_schedule_id: scheduleId,
        p_idempotency_key: makeCreditIdempotencyKey('repayment-sync'),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateRepayment(queryClient);
      toast.success('Statuts synchronisés depuis Financial Engine.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur synchronisation'),
  });
}

export function usePauseRepaymentSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ scheduleId, reason }: { scheduleId: string; reason: string }) => {
      const { data, error } = await repaymentClient.rpc('pause_repayment_schedule', {
        p_schedule_id: scheduleId,
        p_reason: reason,
        p_idempotency_key: makeCreditIdempotencyKey('repayment-pause'),
      });
      if (error) throw error;
      return data as RepaymentScheduleRow;
    },
    onSuccess: () => {
      invalidateRepayment(queryClient);
      toast.success('Calendrier suspendu.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur suspension calendrier'),
  });
}

export function useAmendRepaymentSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ scheduleId, reason }: { scheduleId: string; reason: string }) => {
      const { data, error } = await repaymentClient.rpc('amend_repayment_schedule', {
        p_schedule_id: scheduleId,
        p_amendment_type: 'BUSINESS_APPROVED_RESTRUCTURE',
        p_reason: reason,
        p_new_terms_json: {},
        p_idempotency_key: makeCreditIdempotencyKey('repayment-amend'),
      });
      if (error) throw error;
      return data as RepaymentScheduleRow;
    },
    onSuccess: () => {
      invalidateRepayment(queryClient);
      toast.success('Nouvelle version du calendrier créée.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur amendement calendrier'),
  });
}
