import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/routeClient';
import {
  makeCreditIdempotencyKey,
  type CreditApplicationRow,
  type CreditProductRow,
} from '@/hooks/useCreditProductEngineData';

type QueryResult<T> = {
  data: T | null;
  error: Error | null;
};

type UnderwritingQueryBuilder<T = unknown> = PromiseLike<QueryResult<T>> & {
  select: (columns?: string, options?: Record<string, unknown>) => UnderwritingQueryBuilder<T>;
  order: (column: string, options?: Record<string, unknown>) => UnderwritingQueryBuilder<T>;
  eq: (column: string, value: unknown) => UnderwritingQueryBuilder<T>;
  in: (column: string, values: unknown[]) => UnderwritingQueryBuilder<T>;
  maybeSingle: () => UnderwritingQueryBuilder<T>;
};

type UnderwritingSupabaseClient = {
  from: <T = unknown>(table: string) => UnderwritingQueryBuilder<T>;
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<QueryResult<T>>;
};

const underwritingClient = supabase as unknown as UnderwritingSupabaseClient;

export type UnderwritingDecisionRow = {
  decision_id: string;
  application_id: string;
  decision: string;
  trust_assessment: string;
  financial_assessment: string;
  risk_assessment: string;
  exposure_assessment: string;
  decision_score_value: number | null;
  decision_score_grade: string | null;
  decision_risk_level: string | null;
  decision_risk_snapshot_json: Record<string, unknown>;
  requested_exposure_amount: number;
  requested_exposure_currency_code: string;
  current_exposure_amount: number;
  current_exposure_currency_code: string;
  maximum_exposure_amount: number;
  maximum_exposure_currency_code: string;
  available_exposure_amount: number;
  available_exposure_currency_code: string;
  evaluated_policy_set_id: string | null;
  evaluated_policy_version: number;
  evaluated_policy_snapshot_json: Record<string, unknown>;
  extension_results_json: Record<string, unknown>;
  reason_codes_json: string[];
  driver_explanation: string;
  admin_explanation: string;
  decision_valid_until: string | null;
  decision_timestamp: string;
};

export type UnderwritingConditionRow = {
  condition_id: string;
  decision_id: string;
  condition_type: string;
  description: string;
  status: string;
  fulfilled_at: string | null;
  created_at: string;
};

export type ReviewAssignmentRow = {
  assignment_id: string;
  application_id: string;
  reviewer_id: string | null;
  status: string;
  assigned_at: string;
  due_by: string | null;
};

export type ReunderwritingTriggerRow = {
  trigger_id: string;
  application_id: string;
  prior_decision_id: string | null;
  trigger_type: string;
  trigger_source: string;
  trigger_payload_json: Record<string, unknown>;
  required_snapshot_at: string;
  status: string;
  resolution_decision_id: string | null;
  created_at: string;
};

export type CreditPolicySetRow = {
  policy_id: string;
  product_id: string | null;
  policy_name: string;
  policy_type: string;
  status: string;
  version: number;
  rules_json: Record<string, unknown>;
  approval_authority_json: Record<string, unknown>;
  decision_matrix_json: Array<Record<string, unknown>>;
  effective_from: string;
  effective_to: string | null;
};

export type ProductUnderwritingExtensionRow = {
  extension_id: string;
  product_id: string | null;
  product_version_id: string | null;
  policy_set_id: string | null;
  extension_key: string;
  extension_config_json: Record<string, unknown>;
  status: string;
};

export type AdminUnderwritingOperationsData = {
  products: CreditProductRow[];
  applications: CreditApplicationRow[];
  decisions: UnderwritingDecisionRow[];
  conditions: UnderwritingConditionRow[];
  reviewAssignments: ReviewAssignmentRow[];
  reunderwritingTriggers: ReunderwritingTriggerRow[];
  policySets: CreditPolicySetRow[];
  extensions: ProductUnderwritingExtensionRow[];
};

async function fetchProducts(): Promise<CreditProductRow[]> {
  const { data, error } = await underwritingClient
    .from<CreditProductRow[]>('credit_products')
    .select('product_id, product_type, name, description, status, rules_json, product_versions(version_id, product_id, version_number, status, effective_from, effective_to, rules_snapshot_json)')
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchApplications(): Promise<CreditApplicationRow[]> {
  const { data, error } = await underwritingClient
    .from<CreditApplicationRow[]>('credit_applications')
    .select(`
      application_id, driver_id, product_id, product_version_id, requested_asset_id,
      status, submitted_at, expires_at, eligibility_result, eligibility_explanation,
      score_snapshot, down_payment_amount, down_payment_currency_code, created_at,
      credit_products(product_id, product_type, name, description),
      product_versions(version_id, version_number, effective_from),
      financed_assets(description, asset_type, purchase_price, purchase_price_currency_code)
    `)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function fetchDecisions(): Promise<UnderwritingDecisionRow[]> {
  const { data, error } = await underwritingClient
    .from<UnderwritingDecisionRow[]>('underwriting_decisions')
    .select(`
      decision_id, application_id, decision, trust_assessment, financial_assessment,
      risk_assessment, exposure_assessment, decision_score_value, decision_score_grade,
      decision_risk_level, decision_risk_snapshot_json, requested_exposure_amount,
      requested_exposure_currency_code, current_exposure_amount, current_exposure_currency_code,
      maximum_exposure_amount, maximum_exposure_currency_code, available_exposure_amount,
      available_exposure_currency_code, evaluated_policy_set_id, evaluated_policy_version,
      evaluated_policy_snapshot_json, extension_results_json, reason_codes_json,
      driver_explanation, admin_explanation, decision_valid_until, decision_timestamp
    `)
    .order('decision_timestamp', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function latestUnderwritingDecision(applicationId: string, decisions: UnderwritingDecisionRow[]) {
  return decisions.find((decision) => decision.application_id === applicationId) ?? null;
}

export function useAdminUnderwritingOperationsData() {
  return useQuery({
    queryKey: ['admin-underwriting-operations'],
    queryFn: async (): Promise<AdminUnderwritingOperationsData> => {
      const [products, applications, decisions, conditions, reviewAssignments, reunderwritingTriggers, policySets, extensions] = await Promise.all([
        fetchProducts(),
        fetchApplications(),
        fetchDecisions(),
        underwritingClient
          .from<UnderwritingConditionRow[]>('underwriting_conditions')
          .select('condition_id, decision_id, condition_type, description, status, fulfilled_at, created_at')
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) throw error;
            return data ?? [];
          }),
        underwritingClient
          .from<ReviewAssignmentRow[]>('review_assignments')
          .select('assignment_id, application_id, reviewer_id, status, assigned_at, due_by')
          .order('assigned_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) throw error;
            return data ?? [];
          }),
        underwritingClient
          .from<ReunderwritingTriggerRow[]>('reunderwriting_triggers')
          .select('trigger_id, application_id, prior_decision_id, trigger_type, trigger_source, trigger_payload_json, required_snapshot_at, status, resolution_decision_id, created_at')
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) throw error;
            return data ?? [];
          }),
        underwritingClient
          .from<CreditPolicySetRow[]>('credit_policy_sets')
          .select('policy_id, product_id, policy_name, policy_type, status, version, rules_json, approval_authority_json, decision_matrix_json, effective_from, effective_to')
          .eq('policy_type', 'UNDERWRITING_POLICY')
          .order('version', { ascending: false })
          .then(({ data, error }) => {
            if (error) throw error;
            return data ?? [];
          }),
        underwritingClient
          .from<ProductUnderwritingExtensionRow[]>('product_underwriting_extensions')
          .select('extension_id, product_id, product_version_id, policy_set_id, extension_key, extension_config_json, status')
          .order('extension_key', { ascending: true })
          .then(({ data, error }) => {
            if (error) throw error;
            return data ?? [];
          }),
      ]);

      return { products, applications, decisions, conditions, reviewAssignments, reunderwritingTriggers, policySets, extensions };
    },
  });
}

export function useEvaluateUnderwritingDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (applicationId: string) => {
      const { data, error } = await underwritingClient.rpc('evaluate_underwriting_decision', {
        p_application_id: applicationId,
        p_idempotency_key: makeCreditIdempotencyKey('underwriting-evaluate'),
      });
      if (error) throw error;
      return data as UnderwritingDecisionRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-underwriting-operations'] });
      queryClient.invalidateQueries({ queryKey: ['admin-credit-engine'] });
      queryClient.invalidateQueries({ queryKey: ['driver-credit-engine'] });
      toast.success('Décision underwriting Layer 3B enregistrée.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur underwriting'),
  });
}

export function useReviewUnderwritingApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ applicationId, decision, driverExplanation, adminExplanation, conditions }: {
      applicationId: string;
      decision: string;
      driverExplanation: string;
      adminExplanation: string;
      conditions?: Array<{ condition_type: string; description: string }>;
    }) => {
      const { data, error } = await underwritingClient.rpc('review_underwriting_application', {
        p_application_id: applicationId,
        p_decision: decision,
        p_driver_explanation: driverExplanation,
        p_admin_explanation: adminExplanation,
        p_conditions_json: conditions ?? [],
        p_idempotency_key: makeCreditIdempotencyKey('underwriting-review'),
      });
      if (error) throw error;
      return data as UnderwritingDecisionRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-underwriting-operations'] });
      queryClient.invalidateQueries({ queryKey: ['admin-credit-engine'] });
      queryClient.invalidateQueries({ queryKey: ['driver-credit-engine'] });
      toast.success('Revue underwriting finalisée.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur revue underwriting'),
  });
}

export function useTriggerReunderwriting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ applicationId, priorDecisionId, triggerType }: {
      applicationId: string;
      priorDecisionId: string | null;
      triggerType: string;
    }) => {
      const { data, error } = await underwritingClient.rpc('trigger_reunderwriting', {
        p_application_id: applicationId,
        p_prior_decision_id: priorDecisionId,
        p_trigger_type: triggerType,
        p_trigger_source: 'admin_underwriting_operations',
        p_trigger_payload_json: {},
        p_idempotency_key: makeCreditIdempotencyKey(`reunderwriting-${triggerType.toLowerCase()}`),
      });
      if (error) throw error;
      return data as ReunderwritingTriggerRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-underwriting-operations'] });
      queryClient.invalidateQueries({ queryKey: ['driver-credit-engine'] });
      toast.success('Ré-underwriting déclenché.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur déclenchement ré-underwriting'),
  });
}

export function useFulfillUnderwritingCondition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conditionId, status }: { conditionId: string; status: 'FULFILLED' | 'WAIVED' }) => {
      const { data, error } = await underwritingClient.rpc('fulfill_underwriting_condition', {
        p_condition_id: conditionId,
        p_status: status,
        p_idempotency_key: makeCreditIdempotencyKey('underwriting-condition'),
      });
      if (error) throw error;
      return data as UnderwritingConditionRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-underwriting-operations'] });
      queryClient.invalidateQueries({ queryKey: ['admin-credit-engine'] });
      queryClient.invalidateQueries({ queryKey: ['driver-credit-engine'] });
      toast.success('Condition underwriting mise à jour.');
    },
    onError: (error: Error) => toast.error(error.message || 'Erreur condition underwriting'),
  });
}
