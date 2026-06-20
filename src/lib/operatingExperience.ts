export type OperatingUrgency = 'URGENT' | 'TODAY' | 'THIS_WEEK' | 'OPPORTUNITY' | 'TRAINING_NEEDED' | string;
export type OperatingHealthStatus = 'AT_RISK' | 'WATCH' | 'HEALTHY' | 'EXCELLENT' | string;
export type OperatingProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'CANCELLED' | 'WAIVED' | string;

export type ActionLike = {
  urgency: OperatingUrgency;
  priority_score?: number | null;
  created_at?: string | null;
  title?: string | null;
};

export type ProgressLike = {
  progress_status?: OperatingProgressStatus | null;
  status?: OperatingProgressStatus | null;
  progress_percent?: number | null;
};

export type DisabledRequirement = {
  requirement: string;
  isMet: boolean;
  fix: string;
  href?: string;
};

export type EmptyStateCopy = {
  title: string;
  what: string;
  why: string;
  ctaLabel: string;
  href: string;
};

const ROLE_EXPERIENCE_MAP: Record<string, string> = {
  super_admin: 'owner',
  manager: 'fleet_manager',
  agent_pret: 'collections_manager',
  loan_officer: 'collections_manager',
  agent_support: 'support_agent',
  support_agent: 'support_agent',
  support: 'support_agent',
};

const URGENCY_ORDER: Record<string, number> = {
  URGENT: 0,
  TODAY: 1,
  THIS_WEEK: 2,
  OPPORTUNITY: 3,
  TRAINING_NEEDED: 4,
};

export function roleExperienceForAdminRole(roleKey: string | null | undefined) {
  if (!roleKey) return 'fleet_manager';
  return ROLE_EXPERIENCE_MAP[roleKey] ?? roleKey;
}

export function urgencyLabel(urgency: OperatingUrgency | null | undefined) {
  switch (urgency) {
    case 'URGENT': return 'Urgent';
    case 'TODAY': return 'Today';
    case 'THIS_WEEK': return 'This Week';
    case 'OPPORTUNITY': return 'Opportunities';
    case 'TRAINING_NEEDED': return 'Training Needed';
    default: return urgency ?? 'Action';
  }
}

export function urgencyTone(urgency: OperatingUrgency | null | undefined) {
  switch (urgency) {
    case 'URGENT': return 'destructive';
    case 'TODAY': return 'secondary';
    case 'THIS_WEEK': return 'outline';
    case 'OPPORTUNITY': return 'verified';
    case 'TRAINING_NEEDED': return 'secondary';
    default: return 'outline';
  }
}

export function healthScoreTone(scoreOrStatus: number | OperatingHealthStatus | null | undefined) {
  if (typeof scoreOrStatus === 'number') {
    if (scoreOrStatus < 45) return 'destructive';
    if (scoreOrStatus < 65) return 'secondary';
    if (scoreOrStatus < 85) return 'verified';
    return 'default';
  }

  switch (scoreOrStatus) {
    case 'AT_RISK': return 'destructive';
    case 'WATCH': return 'secondary';
    case 'HEALTHY': return 'verified';
    case 'EXCELLENT': return 'default';
    default: return 'outline';
  }
}

export function groupActionsByUrgency<T extends ActionLike>(actions: T[]) {
  const groups = actions.reduce<Record<string, T[]>>((acc, action) => {
    const key = action.urgency || 'TODAY';
    acc[key] = acc[key] ?? [];
    acc[key].push(action);
    return acc;
  }, {});

  return Object.entries(groups)
    .sort(([a], [b]) => (URGENCY_ORDER[a] ?? 99) - (URGENCY_ORDER[b] ?? 99))
    .map(([urgency, items]) => ({
      urgency,
      label: urgencyLabel(urgency),
      items: [...items].sort(compareOperatingActions),
    }));
}

export function compareOperatingActions(a: ActionLike, b: ActionLike) {
  const urgencyDelta = (URGENCY_ORDER[a.urgency] ?? 99) - (URGENCY_ORDER[b.urgency] ?? 99);
  if (urgencyDelta !== 0) return urgencyDelta;
  const priorityDelta = (b.priority_score ?? 0) - (a.priority_score ?? 0);
  if (priorityDelta !== 0) return priorityDelta;
  return Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? '');
}

export function progressCompletionPercent(rows: ProgressLike[]) {
  if (rows.length === 0) return 0;
  const completed = rows.filter((row) => (row.progress_status ?? row.status) === 'COMPLETED').length;
  return Math.round((completed / rows.length) * 100);
}

export function workflowProgressLabel(status: OperatingProgressStatus | null | undefined) {
  switch (status) {
    case 'COMPLETED': return 'Completed';
    case 'BLOCKED': return 'Blocked';
    case 'IN_PROGRESS': return 'In progress';
    case 'CANCELLED': return 'Cancelled';
    case 'WAIVED': return 'Waived';
    default: return 'Not started';
  }
}

export function disabledActionExplanation(label: string, requirements: DisabledRequirement[]) {
  const missing = requirements.filter((requirement) => !requirement.isMet);
  if (missing.length === 0) {
    return {
      disabled: false,
      title: `${label} is available`,
      reason: 'All requirements are complete.',
      fix: 'Continue with the action.',
      href: undefined as string | undefined,
    };
  }

  const first = missing[0];
  return {
    disabled: true,
    title: `${label} unavailable`,
    reason: `Missing requirement: ${first.requirement}.`,
    fix: first.fix,
    href: first.href,
  };
}

export function guidanceEmptyState(copy: EmptyStateCopy) {
  return {
    title: copy.title,
    body: `${copy.what} ${copy.why}`,
    ctaLabel: copy.ctaLabel,
    href: copy.href,
  };
}

export function calculateTenantHealthScore(scores: {
  featureAdoption: number;
  workflowCompletion: number;
  trainingCompletion: number;
  collectionsEfficiency: number;
  driverAdoption: number;
}) {
  const bounded = [
    scores.featureAdoption,
    scores.workflowCompletion,
    scores.trainingCompletion,
    scores.collectionsEfficiency,
    scores.driverAdoption,
  ].map((score) => Math.min(100, Math.max(0, Math.round(score))));

  const healthScore = Math.round(bounded.reduce((sum, score) => sum + score, 0) / bounded.length);
  const status: OperatingHealthStatus = healthScore < 45
    ? 'AT_RISK'
    : healthScore < 65
      ? 'WATCH'
      : healthScore < 85
        ? 'HEALTHY'
        : 'EXCELLENT';

  return { healthScore, status };
}

export function normalizeSearchTerm(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export function searchResultKindLabel(kind: string) {
  switch (kind) {
    case 'knowledge_article': return 'Article';
    case 'learning_module': return 'Learning';
    case 'operating_playbook': return 'Playbook';
    case 'guided_workflow': return 'Workflow';
    case 'help_content': return 'Help';
    default: return kind.replace(/_/g, ' ');
  }
}

export function buildOperatingExperienceExportRows(input: {
  actions: Array<{ title: string; urgency: string; status: string; role_key?: string | null }>;
  healthScores: Array<{ customer_name: string; health_score: number; score_status: string }>;
  learningRows: Array<{ title: string; category: string; progress_status: string }>;
}) {
  const actionRows = input.actions.map((action) => ({
    section: 'Next Best Action',
    owner: action.role_key ?? 'manager',
    item: action.title,
    status: `${urgencyLabel(action.urgency)} / ${action.status}`,
  }));

  const healthRows = input.healthScores.map((score) => ({
    section: 'Tenant Health',
    owner: score.customer_name,
    item: 'Health score',
    status: `${score.health_score} / ${score.score_status}`,
  }));

  const learningRows = input.learningRows.map((row) => ({
    section: 'Learning',
    owner: row.category,
    item: row.title,
    status: workflowProgressLabel(row.progress_status),
  }));

  return [...actionRows, ...healthRows, ...learningRows];
}
