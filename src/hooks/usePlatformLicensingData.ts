import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/routeClient';
import type { Json } from '@/integrations/supabase/types';
import type { RealtimeTableName } from '@/hooks/useRealtimeSubscription';
import type { EntitlementMatrixSummary, FeatureAccessResult, UsageLimitSummary } from '@/lib/platformLicensing';

type QueryResult<T> = {
  data: T | null;
  error: Error | null;
};

type PlatformQueryBuilder<T = unknown> = PromiseLike<QueryResult<T>> & {
  select: (columns?: string, options?: Record<string, unknown>) => PlatformQueryBuilder<T>;
  order: (column: string, options?: Record<string, unknown>) => PlatformQueryBuilder<T>;
  eq: (column: string, value: unknown) => PlatformQueryBuilder<T>;
  limit: (count: number) => PlatformQueryBuilder<T>;
};

type PlatformSupabaseClient = {
  from: <T = unknown>(table: string) => PlatformQueryBuilder<T>;
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<QueryResult<T>>;
};

const platformClient = supabase as unknown as PlatformSupabaseClient;

export const PLATFORM_LICENSING_REALTIME_TABLES: RealtimeTableName[] = [
  'platform_plans',
  'platform_features',
  'plan_features',
  'tenant_plan_assignments',
  'tenant_entitlements',
  'feature_trials',
  'feature_flags',
  'usage_limits',
  'platform_add_ons',
  'tenant_add_ons',
  'platform_audit_events',
] as const;

export type PlatformPlanRow = {
  plan_id: string;
  plan_key: string;
  plan_name: string;
  description: string;
  status: string;
  is_base_plan: boolean;
  commercial_metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  status_changed_at: string;
};

export type PlatformFeatureRow = {
  feature_id: string;
  feature_key: string;
  feature_name: string;
  category: string;
  module_key: string;
  status: string;
  default_flag_state: string;
  description: string;
  upgrade_copy_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  status_changed_at: string;
};

export type PlatformTrialRow = {
  trial_id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  feature_key: string;
  feature_name: string;
  category: string;
  starts_at: string;
  expires_at: string;
  trial_status: string;
  activated_by: string | null;
  activated_by_email: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformAuditRow = {
  audit_event_id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_slug: string | null;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  event_type: string;
  target_type: string;
  target_id: string | null;
  before_json: Record<string, unknown>;
  after_json: Record<string, unknown>;
  reason: string | null;
  created_at: string;
};

export type PlatformUpgradeCatalogRow = {
  feature_id: string;
  feature_key: string;
  feature_name: string;
  category: string;
  module_key: string;
  status: string;
  default_flag_state: string;
  description: string;
  upgrade_copy_json: Record<string, unknown>;
  available_in_plans: string[] | null;
  available_add_ons: string[] | null;
};

export type PlatformAddOnRow = {
  add_on_id: string;
  add_on_key: string;
  add_on_name: string;
  feature_id: string | null;
  description: string;
  status: string;
  commercial_metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type PlatformCustomerRow = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
};

export type PlatformLicensingData = {
  plans: PlatformPlanRow[];
  features: PlatformFeatureRow[];
  entitlements: EntitlementMatrixSummary[];
  trials: PlatformTrialRow[];
  usageLimits: UsageLimitSummary[];
  addOns: PlatformAddOnRow[];
  auditEvents: PlatformAuditRow[];
  upgradeCatalog: PlatformUpgradeCatalogRow[];
  customers: PlatformCustomerRow[];
};

async function readRows<T>(table: string, orderColumn?: string, ascending = true, limit?: number) {
  let query = platformClient.from<T[]>(table).select('*');
  if (orderColumn) query = query.order(orderColumn, { ascending });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

function invalidatePlatformQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['platform-licensing'] });
  queryClient.invalidateQueries({ queryKey: ['feature-entitlement'] });
  queryClient.invalidateQueries({ queryKey: ['tenant-entitlements'] });
}

export function usePlatformLicensingData() {
  return useQuery({
    queryKey: ['platform-licensing'],
    queryFn: async (): Promise<PlatformLicensingData> => {
      const [
        plans,
        features,
        entitlements,
        trials,
        usageLimits,
        addOns,
        auditEvents,
        upgradeCatalog,
        customers,
      ] = await Promise.all([
        readRows<PlatformPlanRow>('platform_plans', 'plan_key', true),
        readRows<PlatformFeatureRow>('platform_features', 'category', true),
        readRows<EntitlementMatrixSummary>('v_platform_entitlement_matrix', 'tenant_name', true),
        readRows<PlatformTrialRow>('v_platform_trial_status', 'created_at', false, 100),
        readRows<UsageLimitSummary>('v_platform_usage_limit_status', 'tenant_name', true),
        readRows<PlatformAddOnRow>('platform_add_ons', 'add_on_key', true),
        readRows<PlatformAuditRow>('v_platform_audit_timeline', 'created_at', false, 100),
        readRows<PlatformUpgradeCatalogRow>('v_platform_upgrade_catalog', 'category', true),
        readRows<PlatformCustomerRow>('customers', 'name', true),
      ]);

      return {
        plans,
        features,
        entitlements,
        trials,
        usageLimits,
        addOns,
        auditEvents,
        upgradeCatalog,
        customers,
      };
    },
    staleTime: 2 * 60 * 1000,
  });
}

export function useTenantEntitlements(customerId?: string | null) {
  return useQuery({
    queryKey: ['tenant-entitlements', customerId ?? 'current'],
    queryFn: async () => {
      const { data, error } = await platformClient.rpc<EntitlementMatrixSummary[]>('get_tenant_entitlements', {
        p_customer_id: customerId ?? null,
      });
      if (error) {
        console.debug('Layer 3I entitlement matrix unavailable', error);
        return [];
      }
      return data ?? [];
    },
    staleTime: 2 * 60 * 1000,
  });
}

export function useTenantEntitlementMap(customerId?: string | null) {
  return useQuery({
    queryKey: ['tenant-entitlement-map', customerId ?? 'current'],
    queryFn: async () => {
      const { data, error } = await platformClient.rpc<EntitlementMatrixSummary[]>('get_tenant_entitlements', {
        p_customer_id: customerId ?? null,
      });
      if (error) {
        console.debug('Layer 3I entitlement map unavailable', error);
        return {} as Record<string, EntitlementMatrixSummary>;
      }
      return (data ?? []).reduce<Record<string, EntitlementMatrixSummary>>((acc, row) => {
        acc[row.feature_key] = row;
        return acc;
      }, {});
    },
    staleTime: 2 * 60 * 1000,
  });
}

export function useFeatureEntitlement(featureKey: string, customerId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ['feature-entitlement', featureKey, customerId ?? 'current'],
    enabled: enabled && !!featureKey,
    queryFn: async (): Promise<FeatureAccessResult> => {
      const { data, error } = await platformClient.rpc<FeatureAccessResult>('check_feature_entitlement', {
        p_feature_key: featureKey,
        p_customer_id: customerId ?? null,
      });
      if (error) {
        console.debug(`Layer 3I entitlement check failed for ${featureKey}`, error);
        return {
          allowed: true,
          code: 'ENTITLEMENT_CHECK_UNAVAILABLE',
          message: 'Entitlement check unavailable; allowing existing module access.',
          feature_key: featureKey,
          access_state: 'ENABLED',
        };
      }
      return data ?? { allowed: false, code: 'FEATURE_NOT_LICENSED', feature_key: featureKey, access_state: 'LOCKED' };
    },
    staleTime: 60 * 1000,
  });
}

export function useAssignPlatformPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { customerId: string; planKey: string; reason: string }) => {
      const { data, error } = await platformClient.rpc<string>('assign_platform_plan', {
        p_customer_id: params.customerId,
        p_plan_key: params.planKey,
        p_reason: params.reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidatePlatformQueries(queryClient);
      toast.success('Plan assigned');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Plan assignment failed'),
  });
}

export function useGrantTenantEntitlement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      customerId: string;
      featureKey: string;
      status?: string;
      source?: string;
      expiresAt?: string | null;
      reason: string;
    }) => {
      const { data, error } = await platformClient.rpc<string>('grant_tenant_entitlement', {
        p_customer_id: params.customerId,
        p_feature_key: params.featureKey,
        p_status: params.status ?? 'ACTIVE',
        p_source: params.source ?? 'MANUAL',
        p_expires_at: params.expiresAt ?? null,
        p_reason: params.reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidatePlatformQueries(queryClient);
      toast.success('Entitlement updated');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Entitlement update failed'),
  });
}

export function useRevokeTenantEntitlement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { customerId: string; featureKey: string; reason: string }) => {
      const { data, error } = await platformClient.rpc<string>('revoke_tenant_entitlement', {
        p_customer_id: params.customerId,
        p_feature_key: params.featureKey,
        p_reason: params.reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidatePlatformQueries(queryClient);
      toast.success('Entitlement revoked');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Entitlement revoke failed'),
  });
}

export function useStartFeatureTrial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { customerId: string; featureKey: string; expiresAt?: string | null; reason?: string }) => {
      const { data, error } = await platformClient.rpc<string>('start_feature_trial', {
        p_customer_id: params.customerId,
        p_feature_key: params.featureKey,
        p_expires_at: params.expiresAt ?? null,
        p_reason: params.reason ?? 'Trial started from Platform Administration',
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidatePlatformQueries(queryClient);
      toast.success('Trial started');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Trial start failed'),
  });
}

export function useSyncExpiredTrials() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await platformClient.rpc<number>('sync_expired_feature_trials');
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: (count) => {
      invalidatePlatformQueries(queryClient);
      toast.success(`${count} expired trial${count === 1 ? '' : 's'} synced`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Trial sync failed'),
  });
}

export function useSetFeatureFlagState() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { featureKey: string; featureState: string; customerId?: string | null; reason: string }) => {
      const { data, error } = await platformClient.rpc<string>('set_feature_flag_state', {
        p_feature_key: params.featureKey,
        p_feature_state: params.featureState,
        p_customer_id: params.customerId ?? null,
        p_reason: params.reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidatePlatformQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
      toast.success('Feature state updated');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Feature state update failed'),
  });
}

export function useSetUsageLimit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      customerId: string;
      limitKey: string;
      limitValue: number;
      reason: string;
      featureKey?: string | null;
      hardLimit?: boolean;
    }) => {
      const { data, error } = await platformClient.rpc<string>('set_usage_limit', {
        p_customer_id: params.customerId,
        p_limit_key: params.limitKey,
        p_limit_value: params.limitValue,
        p_reason: params.reason,
        p_feature_key: params.featureKey ?? null,
        p_hard_limit: params.hardLimit ?? true,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidatePlatformQueries(queryClient);
      toast.success('Usage limit updated');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Usage limit update failed'),
  });
}

export function useRequestFeatureUpgrade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { featureKey: string; reason?: string }) => {
      const { data, error } = await platformClient.rpc<string>('request_feature_upgrade', {
        p_feature_key: params.featureKey,
        p_reason: params.reason ?? 'Upgrade requested from locked module',
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-licensing'] });
      toast.success('Upgrade request recorded');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Upgrade request failed'),
  });
}

export function useRecordPlatformAuditEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      eventType: string;
      targetType: string;
      targetId?: string | null;
      tenantId?: string | null;
      reason?: string | null;
      before?: Json;
      after?: Json;
      idempotencyKey?: string | null;
    }) => {
      const { data, error } = await platformClient.rpc<string>('record_platform_audit_event', {
        p_event_type: params.eventType,
        p_target_type: params.targetType,
        p_target_id: params.targetId ?? null,
        p_tenant_id: params.tenantId ?? null,
        p_reason: params.reason ?? null,
        p_before_json: params.before ?? {},
        p_after_json: params.after ?? {},
        p_idempotency_key: params.idempotencyKey ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-licensing'] });
    },
  });
}
