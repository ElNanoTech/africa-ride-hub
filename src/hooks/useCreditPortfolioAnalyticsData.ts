import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/routeClient';
import type { Json } from '@/integrations/supabase/types';
import type { RealtimeTableName } from '@/hooks/useRealtimeSubscription';

type QueryResult<T> = {
  data: T | null;
  error: Error | null;
};

type AnalyticsQueryBuilder<T = unknown> = PromiseLike<QueryResult<T>> & {
  select: (columns?: string, options?: Record<string, unknown>) => AnalyticsQueryBuilder<T>;
  order: (column: string, options?: Record<string, unknown>) => AnalyticsQueryBuilder<T>;
  eq: (column: string, value: unknown) => AnalyticsQueryBuilder<T>;
  limit: (count: number) => AnalyticsQueryBuilder<T>;
};

type AnalyticsSupabaseClient = {
  from: <T = unknown>(table: string) => AnalyticsQueryBuilder<T>;
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<QueryResult<T>>;
};

const analyticsClient = supabase as unknown as AnalyticsSupabaseClient;

export const CREDIT_PORTFOLIO_ANALYTICS_REALTIME_TABLES: RealtimeTableName[] = [
  'credit_accounts',
  'credit_applications',
  'underwriting_decisions',
  'credit_contracts',
  'repayment_schedules',
  'scheduled_obligations',
  'credit_collections_cases',
  'credit_promises_to_pay',
  'credit_default_reviews',
  'credit_default_decisions',
  'ownership_completion_reviews',
  'asset_transfer_records',
  'ownership_certificates',
  'executive_attention_items',
  'analytics_exports',
  'analytics_audit_events',
] as const;

export type PortfolioHealthRow = {
  customer_id: string | null;
  active_credit_accounts: number;
  total_deployed_exposure: number;
  current_outstanding_balance: number;
  total_paid_to_date: number;
  total_past_due_amount: number;
  portfolio_at_risk_amount: number;
  portfolio_at_risk_rate: number | null;
  default_review_amount: number;
  formally_defaulted_amount: number;
  completed_ownership_count: number;
  active_product_count: number;
  last_updated_at: string;
  data_freshness_status: string;
  data_freshness_note: string;
  source_records_json: Record<string, unknown>;
  filters_applied: string;
  source_view: string;
  calculation_logic: string;
};

export type PortfolioAccountFactRow = {
  customer_id: string | null;
  credit_account_id: string;
  driver_id: string;
  driver_name: string | null;
  driver_phone: string | null;
  city: string | null;
  branch_name: string | null;
  driver_tier: string | null;
  driver_score: number | null;
  product_id: string;
  product_name: string | null;
  product_type: string | null;
  product_status: string | null;
  product_version_id: string;
  account_status: string;
  principal_amount: number;
  currency_code: string;
  activated_at: string | null;
  created_at: string;
  obligation_count: number;
  total_scheduled_amount: number;
  paid_amount: number;
  outstanding_balance: number;
  past_due_amount: number;
  days_past_due: number;
  open_collections_cases: number;
  default_reviews_open: number;
  default_review_amount: number;
  formal_default_amount: number;
  ownership_status: string | null;
  ownership_completed_at: string | null;
  asset_transferred: boolean;
  certificate_issued: boolean;
  risk_segment: string;
  source_updated_at: string;
  last_refreshed_at: string;
  data_freshness_status: string;
  source_tables: string;
  formula_description: string;
  source_records_json: Record<string, unknown>;
};

export type ProductPerformanceRow = {
  customer_id: string | null;
  product_id: string;
  product_name: string | null;
  product_type: string | null;
  product_status: string | null;
  applications_submitted: number;
  approval_rate: number | null;
  activation_rate: number | null;
  average_financed_amount: number;
  average_down_payment: number;
  average_repayment_performance: number | null;
  delinquency_rate: number | null;
  default_review_rate: number | null;
  completion_rate: number | null;
  revenue_collected: number;
  exposure_outstanding: number;
  conversion_from_eligibility_to_activation: number | null;
  contracts_signed: number;
  activated_accounts: number;
  recommended_action: string;
  risk_signal: string;
  performance_trend: string;
  last_updated_at: string;
  data_freshness_status: string;
  source_records_json: Record<string, unknown>;
  calculation_logic: string;
};

export type RiskDelinquencyRow = {
  customer_id: string | null;
  segment_key: string;
  segment_label: string;
  segment_order: number;
  account_count: number;
  outstanding_amount: number;
  past_due_amount: number;
  max_days_past_due: number;
  collections_cases_open: number;
  default_reviews_open: number;
  asset_protection_reviews: number;
  last_updated_at: string;
  data_freshness_status: string;
  source_records_json: Record<string, unknown>;
  calculation_logic: string;
};

export type OwnershipFunnelRow = {
  customer_id: string | null;
  stage_order: number;
  stage_key: string;
  stage_label: string;
  record_count: number;
  conversion_rate: number | null;
  source_tables: string;
  last_updated_at: string;
  data_freshness_status: string;
  source_records_json: Record<string, unknown>;
  calculation_logic: string;
};

export type ExecutiveAttentionRow = {
  attention_item_id: string;
  customer_id: string | null;
  item_type: string;
  severity: string;
  title: string;
  description: string;
  source_reference_type: string | null;
  source_reference_id: string | null;
  source_data_json: Record<string, unknown>;
  recommended_action: string;
  assigned_owner_role: string;
  status: string;
  created_at: string;
  updated_at: string;
  record_link: string | null;
};

export type BranchPerformanceRow = {
  customer_id: string | null;
  branch_name: string | null;
  city: string | null;
  active_accounts: number;
  deployed_exposure: number;
  outstanding_balance: number;
  past_due_amount: number;
  delinquency_rate: number | null;
  default_review_accounts: number;
  completed_ownership_count: number;
  risk_signal: string;
  last_updated_at: string;
  data_freshness_status: string;
  source_records_json: Record<string, unknown>;
  calculation_logic: string;
};

export type CollectorPerformanceRow = {
  customer_id: string | null;
  collector_id: string | null;
  collector_name: string | null;
  open_cases: number;
  resolved_cases: number;
  total_case_amount: number;
  recovered_case_amount: number;
  recovery_rate: number | null;
  broken_promises: number;
  active_promises: number;
  last_updated_at: string;
  data_freshness_status: string;
  source_records_json: Record<string, unknown>;
  calculation_logic: string;
};

export type ReconciliationSummaryRow = {
  anomaly_id: string;
  customer_id: string | null;
  source_reference_id: string | null;
  severity: string;
  anomaly_type: string;
  details_json: Record<string, unknown>;
  detected_at: string;
  data_freshness_status: string;
  calculation_logic: string;
};

export type MetricDefinitionRow = {
  metric_id: string;
  metric_name: string;
  metric_category: string;
  formula_description: string;
  source_view: string;
  refresh_cadence: string;
  owner_role: string;
  known_limitations: string;
  created_at: string;
  updated_at: string;
};

export type AnalyticsExportRow = {
  export_id: string;
  customer_id: string | null;
  export_type: string;
  filters_json: Record<string, unknown>;
  generated_by: string | null;
  generated_at: string;
  source_timestamp: string;
  storage_reference: string | null;
  confidentiality_label: string;
  created_at: string;
};

export type AnalyticsAuditEventRow = {
  audit_event_id: string;
  customer_id: string | null;
  actor_id: string | null;
  actor_role: string | null;
  event_type: string;
  target_type: string;
  target_id: string | null;
  filters_json: Record<string, unknown>;
  report_type: string | null;
  export_reference: string | null;
  created_at: string;
};

export type AnalyticsFreshnessRow = {
  customer_id: string | null;
  source_name: string;
  last_updated_at: string;
  data_freshness_status: string;
  data_freshness_note: string;
  checked_at: string;
};

export type AdminCreditPortfolioAnalyticsData = {
  health: PortfolioHealthRow | null;
  accounts: PortfolioAccountFactRow[];
  products: ProductPerformanceRow[];
  risk: RiskDelinquencyRow[];
  funnel: OwnershipFunnelRow[];
  attention: ExecutiveAttentionRow[];
  branches: BranchPerformanceRow[];
  collectors: CollectorPerformanceRow[];
  reconciliation: ReconciliationSummaryRow[];
  metricDefinitions: MetricDefinitionRow[];
  exports: AnalyticsExportRow[];
  auditEvents: AnalyticsAuditEventRow[];
  freshness: AnalyticsFreshnessRow[];
};

async function readRows<T>(table: string, orderColumn?: string, ascending = true, limit?: number) {
  let query = analyticsClient.from<T[]>(table).select('*');
  if (orderColumn) query = query.order(orderColumn, { ascending });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export function useCreditPortfolioAnalyticsData() {
  return useQuery({
    queryKey: ['admin-credit-portfolio-analytics'],
    queryFn: async (): Promise<AdminCreditPortfolioAnalyticsData> => {
      const [
        health,
        accounts,
        products,
        risk,
        funnel,
        attention,
        branches,
        collectors,
        reconciliation,
        metricDefinitions,
        exports,
        auditEvents,
        freshness,
      ] = await Promise.all([
        readRows<PortfolioHealthRow>('v_credit_portfolio_health', 'last_updated_at', false, 1),
        readRows<PortfolioAccountFactRow>('v_credit_portfolio_account_facts', 'past_due_amount', false, 100),
        readRows<ProductPerformanceRow>('v_credit_product_performance', 'exposure_outstanding', false, 100),
        readRows<RiskDelinquencyRow>('v_credit_risk_delinquency_summary', 'segment_order', true),
        readRows<OwnershipFunnelRow>('v_credit_growth_ownership_funnel', 'stage_order', true),
        readRows<ExecutiveAttentionRow>('v_credit_executive_attention_items', 'created_at', false, 50),
        readRows<BranchPerformanceRow>('v_credit_branch_performance', 'past_due_amount', false, 50),
        readRows<CollectorPerformanceRow>('v_credit_collector_performance', 'open_cases', false, 50),
        readRows<ReconciliationSummaryRow>('v_credit_reconciliation_summary', 'detected_at', false, 100),
        readRows<MetricDefinitionRow>('analytics_metric_definitions', 'metric_category', true),
        readRows<AnalyticsExportRow>('analytics_exports', 'generated_at', false, 25),
        readRows<AnalyticsAuditEventRow>('analytics_audit_events', 'created_at', false, 50),
        readRows<AnalyticsFreshnessRow>('v_credit_analytics_freshness', 'checked_at', false),
      ]);

      return {
        health: health[0] ?? null,
        accounts,
        products,
        risk,
        funnel,
        attention,
        branches,
        collectors,
        reconciliation,
        metricDefinitions,
        exports,
        auditEvents,
        freshness,
      };
    },
    staleTime: 2 * 60 * 1000,
  });
}

export function useRecordAnalyticsAuditEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      eventType: string;
      targetType: string;
      targetId?: string | null;
      filters?: Json;
      reportType?: string | null;
      exportReference?: string | null;
    }) => {
      const { data, error } = await analyticsClient.rpc<string>('record_analytics_audit_event', {
        p_event_type: params.eventType,
        p_target_type: params.targetType,
        p_target_id: params.targetId ?? null,
        p_filters_json: params.filters ?? {},
        p_report_type: params.reportType ?? null,
        p_export_reference: params.exportReference ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-credit-portfolio-analytics'] });
    },
  });
}

export function useRecordAnalyticsExport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      exportType: string;
      filters?: Json;
      confidentialityLabel?: string;
    }) => {
      const { data, error } = await analyticsClient.rpc<string>('record_analytics_export', {
        p_export_type: params.exportType,
        p_filters_json: params.filters ?? {},
        p_confidentiality_label: params.confidentialityLabel ?? 'CONFIDENTIAL - DAM Africa',
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-credit-portfolio-analytics'] });
      toast.success('Export analytics audite');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "L'export analytics a echoue");
    },
  });
}
