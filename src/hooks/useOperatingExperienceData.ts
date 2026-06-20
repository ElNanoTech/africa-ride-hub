import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/routeClient';
import type { Json } from '@/integrations/supabase/types';
import type { RealtimeTableName } from '@/hooks/useRealtimeSubscription';

type QueryResult<T> = {
  data: T | null;
  error: Error | null;
};

type OperatingQueryBuilder<T = unknown> = PromiseLike<QueryResult<T>> & {
  select: (columns?: string, options?: Record<string, unknown>) => OperatingQueryBuilder<T>;
  order: (column: string, options?: Record<string, unknown>) => OperatingQueryBuilder<T>;
  eq: (column: string, value: unknown) => OperatingQueryBuilder<T>;
  limit: (count: number) => OperatingQueryBuilder<T>;
};

type OperatingSupabaseClient = {
  from: <T = unknown>(table: string) => OperatingQueryBuilder<T>;
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<QueryResult<T>>;
};

const operatingClient = supabase as unknown as OperatingSupabaseClient;

export const OPERATING_EXPERIENCE_REALTIME_TABLES: RealtimeTableName[] = [
  'role_experiences',
  'learning_modules',
  'learning_progress',
  'knowledge_articles',
  'operating_playbooks',
  'guided_workflows',
  'workflow_progress',
  'next_best_actions',
  'tenant_health_scores',
  'adoption_metrics',
  'help_content',
  'operating_guidance_audit_events',
] as const;

export type RoleExperienceHomepageRow = {
  experience_id: string;
  role_key: string;
  role_name: string;
  homepage_path: string;
  focus_area: string;
  navigation_json: Array<Record<string, unknown>>;
  dashboard_cards_json: Array<Record<string, unknown>>;
  primary_actions_json: Array<Record<string, unknown>>;
  training_track_keys: string[];
  status: string;
  training_module_count: number;
};

export type LearningCenterProgressRow = {
  module_id: string;
  module_key: string;
  title: string;
  category: string;
  audience_role_keys: string[];
  description: string;
  estimated_minutes: number;
  is_driver_education: boolean;
  checklist_json: Array<Record<string, unknown>>;
  module_status: string;
  sort_order: number;
  progress_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_slug: string | null;
  admin_user_id: string | null;
  admin_user_name: string | null;
  admin_user_email: string | null;
  driver_id: string | null;
  driver_name: string | null;
  assigned_role_key: string | null;
  progress_status: string;
  progress_percent: number;
  score: number | null;
  started_at: string | null;
  completed_at: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OperatingNextBestActionRow = {
  action_id: string;
  customer_id: string;
  customer_name: string;
  customer_slug: string;
  role_key: string;
  action_type: string;
  urgency: string;
  urgency_label: string;
  title: string;
  description: string;
  entity_type: string | null;
  entity_id: string | null;
  cta_label: string;
  href: string;
  source: string;
  status: string;
  priority_score: number;
  due_at: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TenantHealthDashboardRow = {
  score_id: string;
  customer_id: string;
  customer_name: string;
  customer_slug: string;
  health_score: number;
  feature_adoption_score: number;
  workflow_completion_score: number;
  training_completion_score: number;
  collections_efficiency_score: number;
  driver_adoption_score: number;
  score_status: string;
  scoring_json: Record<string, unknown>;
  generated_at: string;
  next_review_at: string;
  open_action_count: number;
  urgent_action_count: number;
};

export type GuidedWorkflowStatusRow = {
  workflow_id: string;
  workflow_key: string;
  title: string;
  category: string;
  description: string;
  target_route: string;
  owner_role_key: string;
  required_permissions: string[];
  steps_json: Array<Record<string, unknown>>;
  workflow_status: string;
  progress_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_slug: string | null;
  subject_type: string | null;
  subject_id: string | null;
  current_step_key: string | null;
  progress_status: string;
  progress_percent: number;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
};

export type OperatingPlaybookRow = {
  playbook_id: string;
  playbook_key: string;
  title: string;
  category: string;
  owner_role_key: string;
  purpose: string;
  trigger_conditions: string;
  steps_json: Array<Record<string, unknown>>;
  empty_state_json: Record<string, unknown>;
  disabled_state_json: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ContextualHelpRow = {
  help_id: string;
  screen_key: string;
  route_pattern: string;
  title: string;
  body_md: string;
  tooltip_json: Array<Record<string, unknown>>;
  faq_json: Array<Record<string, unknown>>;
  quick_tips_json: string[] | Array<Record<string, unknown>>;
  example_json: Record<string, unknown>;
  status: string;
  related_articles_json: Array<Record<string, unknown>>;
};

export type OperatingAuditRow = {
  audit_event_id: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_slug: string | null;
  actor_admin_user_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  actor_driver_id: string | null;
  driver_name: string | null;
  actor_role: string | null;
  event_type: string;
  target_type: string;
  target_id: string | null;
  reason: string | null;
  before_json: Record<string, unknown>;
  after_json: Record<string, unknown>;
  created_at: string;
};

export type OperatingSearchResult = {
  object_id: string;
  object_type: string;
  object_key: string;
  title: string;
  category: string;
  description: string;
  routes: string[];
  tags: string[];
  rank: number;
};

export type OperatingCustomerRow = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
};

export type OperatingExperienceData = {
  roleHomepages: RoleExperienceHomepageRow[];
  learningProgress: LearningCenterProgressRow[];
  nextBestActions: OperatingNextBestActionRow[];
  healthScores: TenantHealthDashboardRow[];
  workflows: GuidedWorkflowStatusRow[];
  playbooks: OperatingPlaybookRow[];
  helpContent: ContextualHelpRow[];
  auditEvents: OperatingAuditRow[];
  customers: OperatingCustomerRow[];
};

async function readRows<T>(table: string, orderColumn?: string, ascending = true, limit?: number) {
  let query = operatingClient.from<T[]>(table).select('*');
  if (orderColumn) query = query.order(orderColumn, { ascending });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

function invalidateOperatingQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['operating-experience'] });
  queryClient.invalidateQueries({ queryKey: ['operating-knowledge-search'] });
  queryClient.invalidateQueries({ queryKey: ['admin-attention-center'] });
}

export function useOperatingExperienceData() {
  return useQuery({
    queryKey: ['operating-experience'],
    queryFn: async (): Promise<OperatingExperienceData> => {
      const [
        roleHomepages,
        learningProgress,
        nextBestActions,
        healthScores,
        workflows,
        playbooks,
        helpContent,
        auditEvents,
        customers,
      ] = await Promise.all([
        readRows<RoleExperienceHomepageRow>('v_role_experience_homepages', 'role_name', true),
        readRows<LearningCenterProgressRow>('v_learning_center_progress', 'sort_order', true),
        readRows<OperatingNextBestActionRow>('v_operating_next_best_actions', 'priority_score', false, 100),
        readRows<TenantHealthDashboardRow>('v_tenant_health_dashboard', 'health_score', true),
        readRows<GuidedWorkflowStatusRow>('v_guided_workflow_status', 'category', true),
        readRows<OperatingPlaybookRow>('operating_playbooks', 'category', true),
        readRows<ContextualHelpRow>('v_contextual_help_catalog', 'screen_key', true),
        readRows<OperatingAuditRow>('v_operating_guidance_audit_timeline', 'created_at', false, 100),
        readRows<OperatingCustomerRow>('customers', 'name', true),
      ]);

      return {
        roleHomepages,
        learningProgress,
        nextBestActions,
        healthScores,
        workflows,
        playbooks,
        helpContent,
        auditEvents,
        customers,
      };
    },
    staleTime: 2 * 60 * 1000,
  });
}

export function useOperatingKnowledgeSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: ['operating-knowledge-search', query],
    enabled,
    queryFn: async (): Promise<OperatingSearchResult[]> => {
      const { data, error } = await operatingClient.rpc<OperatingSearchResult[]>('search_operating_knowledge', {
        p_query: query,
        p_limit: 20,
      });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 1000,
  });
}

export function useSetLearningProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      moduleKey: string;
      status?: string;
      progressPercent?: number;
      customerId?: string | null;
      score?: number | null;
      evidence?: Json;
    }) => {
      const { data, error } = await operatingClient.rpc<string>('set_learning_progress', {
        p_module_key: params.moduleKey,
        p_status: params.status ?? 'COMPLETED',
        p_progress_percent: params.progressPercent ?? 100,
        p_customer_id: params.customerId ?? null,
        p_score: params.score ?? null,
        p_evidence_json: params.evidence ?? {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateOperatingQueries(queryClient);
      toast.success('Training progress saved');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Training progress update failed'),
  });
}

export function useAdvanceGuidedWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      workflowKey: string;
      currentStepKey: string;
      status?: string;
      subjectType?: string;
      subjectId?: string | null;
      customerId?: string | null;
      context?: Json;
    }) => {
      const { data, error } = await operatingClient.rpc<string>('advance_guided_workflow', {
        p_workflow_key: params.workflowKey,
        p_current_step_key: params.currentStepKey,
        p_status: params.status ?? 'IN_PROGRESS',
        p_subject_type: params.subjectType ?? 'tenant',
        p_subject_id: params.subjectId ?? null,
        p_customer_id: params.customerId ?? null,
        p_context_json: params.context ?? {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateOperatingQueries(queryClient);
      toast.success('Workflow progress saved');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Workflow progress update failed'),
  });
}

export function useRefreshNextBestActions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (customerId?: string | null) => {
      const { data, error } = await operatingClient.rpc<number>('refresh_next_best_actions', {
        p_customer_id: customerId ?? null,
      });
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: (count) => {
      invalidateOperatingQueries(queryClient);
      toast.success(`${count} next-best action${count === 1 ? '' : 's'} generated`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Next-best action refresh failed'),
  });
}

export function useRecalculateTenantHealthScore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (customerId?: string | null) => {
      const { data, error } = await operatingClient.rpc<string>('recalculate_tenant_health_score', {
        p_customer_id: customerId ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateOperatingQueries(queryClient);
      toast.success('Tenant health score recalculated');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Health score recalculation failed'),
  });
}

export function useRecordOperatingAuditEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      eventType: string;
      targetType: string;
      targetId?: string | null;
      customerId?: string | null;
      reason?: string | null;
      before?: Json;
      after?: Json;
      idempotencyKey?: string | null;
    }) => {
      const { data, error } = await operatingClient.rpc<string>('record_operating_guidance_audit_event', {
        p_event_type: params.eventType,
        p_target_type: params.targetType,
        p_target_id: params.targetId ?? null,
        p_customer_id: params.customerId ?? null,
        p_reason: params.reason ?? null,
        p_before_json: params.before ?? {},
        p_after_json: params.after ?? {},
        p_idempotency_key: params.idempotencyKey ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operating-experience'] });
    },
  });
}
