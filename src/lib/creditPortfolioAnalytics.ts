export type AnalyticsFreshnessStatus = 'FRESH' | 'DELAYED' | 'STALE' | 'ERROR' | string;
export type AnalyticsSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;

export type PortfolioHealthSummary = {
  active_credit_accounts?: number | null;
  total_deployed_exposure?: number | null;
  current_outstanding_balance?: number | null;
  total_paid_to_date?: number | null;
  total_past_due_amount?: number | null;
  portfolio_at_risk_amount?: number | null;
  portfolio_at_risk_rate?: number | null;
  default_review_amount?: number | null;
  formally_defaulted_amount?: number | null;
  completed_ownership_count?: number | null;
  active_product_count?: number | null;
  data_freshness_status?: AnalyticsFreshnessStatus | null;
};

export type ProductPerformanceSummary = {
  product_name: string | null;
  product_type: string | null;
  applications_submitted?: number | null;
  approval_rate?: number | null;
  delinquency_rate?: number | null;
  default_review_rate?: number | null;
  completion_rate?: number | null;
  recommended_action?: string | null;
};

export type ExecutiveAttentionSummary = {
  title: string;
  severity: AnalyticsSeverity;
  recommended_action: string;
};

export type FunnelStageSummary = {
  stage_order: number;
  stage_key: string;
  stage_label: string;
  record_count: number;
  conversion_rate: number | null;
  source_tables?: string | null;
  calculation_logic?: string | null;
};

export const CREDIT_PORTFOLIO_FUNNEL_STAGES = [
  { stage_order: 1, stage_key: 'eligible_driver', stage_label: 'Eligible Driver' },
  { stage_order: 2, stage_key: 'application', stage_label: 'Application' },
  { stage_order: 3, stage_key: 'approved', stage_label: 'Approved' },
  { stage_order: 4, stage_key: 'contract_signed', stage_label: 'Contract Signed' },
  { stage_order: 5, stage_key: 'activated', stage_label: 'Activated' },
  { stage_order: 6, stage_key: 'paid_successfully', stage_label: 'Paid Successfully' },
  { stage_order: 7, stage_key: 'ownership_completed', stage_label: 'Ownership Completed' },
  { stage_order: 8, stage_key: 'fleet_entrepreneur_candidate', stage_label: 'Fleet Entrepreneur Candidate' },
] as const;

export function normalizeNumber(value: number | null | undefined) {
  return Number.isFinite(value ?? NaN) ? Number(value) : 0;
}

export function percentLabel(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '0%';
  return `${Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 1)}%`;
}

export function recommendedActionLabel(action: string | null | undefined) {
  switch (action) {
    case 'continue': return 'Continuer';
    case 'monitor': return 'Surveiller';
    case 'tighten_policy': return 'Resserrer la politique';
    case 'pause_product': return 'Mettre en pause';
    case 'review_underwriting': return 'Revoir underwriting';
    case 'investigate_branch_product_issue': return 'Investiguer produit / zone';
    default: return 'Action a confirmer';
  }
}

export function riskSegmentLabel(segment: string | null | undefined) {
  switch (segment) {
    case 'CURRENT': return 'A jour';
    case 'DUE_TODAY': return "Du aujourd'hui";
    case '1_3': return '1-3 jours de retard';
    case '4_7': return '4-7 jours de retard';
    case '8_14': return '8-14 jours de retard';
    case '15_30': return '15-30 jours de retard';
    case '30_PLUS': return '30+ jours de retard';
    case 'DEFAULT_REVIEW': return 'Revue defaut';
    case 'FORMAL_DEFAULT': return 'Defaut formel';
    default: return segment ?? 'Non classe';
  }
}

export function severityTone(severity: AnalyticsSeverity | null | undefined) {
  switch (severity) {
    case 'CRITICAL': return 'destructive';
    case 'HIGH': return 'destructive';
    case 'MEDIUM': return 'secondary';
    case 'LOW': return 'outline';
    case 'INFO': return 'outline';
    default: return 'outline';
  }
}

export function freshnessTone(status: AnalyticsFreshnessStatus | null | undefined) {
  switch (status) {
    case 'FRESH': return 'verified';
    case 'DELAYED': return 'secondary';
    case 'STALE': return 'destructive';
    case 'ERROR': return 'destructive';
    default: return 'outline';
  }
}

export function normalizeFunnelStages(rows: FunnelStageSummary[]) {
  const byKey = new Map(rows.map((row) => [row.stage_key, row]));
  return CREDIT_PORTFOLIO_FUNNEL_STAGES.map((stage) => {
    const found = byKey.get(stage.stage_key);
    return {
      ...stage,
      record_count: normalizeNumber(found?.record_count),
      conversion_rate: found?.conversion_rate ?? null,
      source_tables: found?.source_tables ?? 'source pending',
      calculation_logic: found?.calculation_logic ?? 'No source rows exist for this stage yet.',
    };
  });
}

export function buildExecutiveNarrative(
  health: PortfolioHealthSummary | null | undefined,
  products: ProductPerformanceSummary[],
  attention: ExecutiveAttentionSummary[],
) {
  if (!health) {
    return 'Portfolio analytics are waiting for source records. No production metric is estimated.';
  }

  const parRate = normalizeNumber(health.portfolio_at_risk_rate);
  const activeAccounts = normalizeNumber(health.active_credit_accounts);
  const completedOwnership = normalizeNumber(health.completed_ownership_count);
  const watchProducts = products.filter((product) => product.recommended_action && product.recommended_action !== 'continue');
  const criticalAttention = attention.filter((item) => ['CRITICAL', 'HIGH'].includes(item.severity));

  const healthSentence = parRate <= 5
    ? `Portfolio is healthy across ${activeAccounts} active accounts.`
    : `Portfolio needs attention: PAR is ${percentLabel(parRate)} across ${activeAccounts} active accounts.`;

  const ownershipSentence = completedOwnership > 0
    ? `${completedOwnership} driver${completedOwnership === 1 ? '' : 's'} reached ownership completion.`
    : 'No ownership completion has been recorded yet.';

  const productSentence = watchProducts.length > 0
    ? `${watchProducts.length} product${watchProducts.length === 1 ? '' : 's'} require leadership review.`
    : 'No product currently requires a pause recommendation.';

  const attentionSentence = criticalAttention.length > 0
    ? `${criticalAttention.length} executive attention item${criticalAttention.length === 1 ? '' : 's'} are high priority.`
    : 'No high-priority executive attention item is open.';

  return `${healthSentence} ${ownershipSentence} ${productSentence} ${attentionSentence}`;
}

export function buildPortfolioExportRows(
  health: PortfolioHealthSummary | null | undefined,
  products: ProductPerformanceSummary[],
  attention: ExecutiveAttentionSummary[],
) {
  const rows: Record<string, unknown>[] = [];

  if (health) {
    rows.push(
      { section: 'Portfolio', metric: 'Active accounts', value: normalizeNumber(health.active_credit_accounts), source: 'v_credit_portfolio_health' },
      { section: 'Portfolio', metric: 'Total exposure', value: normalizeNumber(health.total_deployed_exposure), source: 'v_credit_portfolio_health' },
      { section: 'Portfolio', metric: 'Outstanding balance', value: normalizeNumber(health.current_outstanding_balance), source: 'v_credit_portfolio_health' },
      { section: 'Portfolio', metric: 'Portfolio at risk rate', value: percentLabel(health.portfolio_at_risk_rate), source: 'v_credit_portfolio_health' },
    );
  }

  products.forEach((product) => {
    rows.push({
      section: 'Product',
      metric: product.product_name ?? product.product_type ?? 'Unnamed product',
      value: recommendedActionLabel(product.recommended_action),
      source: 'v_credit_product_performance',
    });
  });

  attention.forEach((item) => {
    rows.push({
      section: 'Attention',
      metric: item.title,
      value: `${item.severity}: ${item.recommended_action}`,
      source: 'v_credit_executive_attention_items',
    });
  });

  return rows;
}
