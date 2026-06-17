import { assertValidMoney, type Money } from './creditProductEngine';

export type UnderwritingDecisionOutcome =
  | 'APPROVED'
  | 'APPROVED_WITH_CONDITIONS'
  | 'MANUAL_REVIEW'
  | 'DECLINED'
  | 'ESCALATED';

export type TrustAssessment = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXCEPTIONAL' | 'UNKNOWN';
export type FinancialAssessment = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
export type RiskAssessment = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
export type ExposureAssessment = 'WITHIN_LIMIT' | 'EXCEEDS_LIMIT' | 'MANUAL_REVIEW' | 'UNKNOWN';

export type ScoreSnapshot = {
  value: number | null;
  grade: 'A' | 'B' | 'C' | 'D' | 'E' | null;
  updatedAt?: string | null;
};

export type RiskSnapshot = {
  level: string | null;
  reasons: string[];
  computedAt?: string | null;
};

export type ExposureSnapshot = {
  requested: Money;
  current: Money;
  maximum: Money;
  available: Money;
};

export type UnderwritingConditionDraft = {
  condition_type: string;
  description: string;
};

export type UnderwritingMatrixRow = {
  trust?: Array<TrustAssessment | 'ANY'>;
  financial?: Array<FinancialAssessment | 'ANY'>;
  risk?: Array<RiskAssessment | 'ANY'>;
  exposure?: Array<ExposureAssessment | 'ANY'>;
  outcome: UnderwritingDecisionOutcome;
};

export type UnderwritingPolicy = {
  policyId: string;
  version: number;
  rules: {
    decision_valid_days?: number;
  };
  decisionMatrix: UnderwritingMatrixRow[];
};

export type ProductUnderwritingExtensionResult = {
  gate_results: Record<string, string>;
  conditions: UnderwritingConditionDraft[];
  review_flags: string[];
  reason_codes: string[];
  driver_explanation_inputs?: Record<string, unknown>;
  admin_explanation_inputs?: Record<string, unknown>;
};

export type UnderwritingEvaluationInput = {
  applicationId: string;
  applicationEligibility: string;
  productStatus: string;
  score: ScoreSnapshot;
  risk: RiskSnapshot;
  financial: FinancialAssessment;
  exposure: ExposureSnapshot;
  policy: UnderwritingPolicy;
  extension?: ProductUnderwritingExtensionResult;
  evaluatedAt: string;
};

export type UnderwritingEvaluation = {
  applicationId: string;
  decision: UnderwritingDecisionOutcome;
  trustAssessment: TrustAssessment;
  financialAssessment: FinancialAssessment;
  riskAssessment: RiskAssessment;
  exposureAssessment: ExposureAssessment;
  scoreSnapshot: ScoreSnapshot;
  riskSnapshot: RiskSnapshot;
  exposureSnapshot: ExposureSnapshot;
  policySnapshot: UnderwritingPolicy;
  extensionResults: ProductUnderwritingExtensionResult;
  reasonCodes: string[];
  driverExplanation: string;
  adminExplanation: string;
  decisionValidUntil: string | null;
};

const EMPTY_EXTENSION: ProductUnderwritingExtensionResult = {
  gate_results: {},
  conditions: [],
  review_flags: [],
  reason_codes: [],
};

export function trustAssessmentFromGrade(grade: ScoreSnapshot['grade']): TrustAssessment {
  switch (grade) {
    case 'A': return 'EXCEPTIONAL';
    case 'B': return 'HIGH';
    case 'C': return 'MEDIUM';
    case 'D':
    case 'E':
      return 'LOW';
    default:
      return 'UNKNOWN';
  }
}

export function riskAssessmentFromLevel(level: string | null | undefined): RiskAssessment {
  switch ((level ?? '').toLowerCase()) {
    case 'bon':
    case 'low':
      return 'LOW';
    case 'moyen':
    case 'moderate':
      return 'MEDIUM';
    case 'eleve':
    case 'high':
      return 'HIGH';
    case 'critique':
    case 'critical':
      return 'CRITICAL';
    default:
      return 'UNKNOWN';
  }
}

export function evaluateExposure(exposure: ExposureSnapshot): ExposureAssessment {
  assertValidMoney(exposure.requested);
  assertValidMoney(exposure.current);
  assertValidMoney(exposure.maximum);
  assertValidMoney(exposure.available);

  const currency = exposure.requested.currency_code;
  if (
    exposure.current.currency_code !== currency
    || exposure.maximum.currency_code !== currency
    || exposure.available.currency_code !== currency
  ) {
    return 'MANUAL_REVIEW';
  }

  if (exposure.maximum.amount <= 0) return 'MANUAL_REVIEW';
  if (exposure.requested.amount > exposure.available.amount) return 'EXCEEDS_LIMIT';
  return 'WITHIN_LIMIT';
}

function matches<T extends string>(values: Array<T | 'ANY'> | undefined, value: T): boolean {
  return !values || values.includes('ANY') || values.includes(value);
}

export function decisionFromMatrix(
  matrix: UnderwritingMatrixRow[],
  trust: TrustAssessment,
  financial: FinancialAssessment,
  risk: RiskAssessment,
  exposure: ExposureAssessment,
): UnderwritingDecisionOutcome {
  const row = matrix.find((candidate) =>
    matches(candidate.trust, trust)
    && matches(candidate.financial, financial)
    && matches(candidate.risk, risk)
    && matches(candidate.exposure, exposure),
  );

  return row?.outcome ?? 'MANUAL_REVIEW';
}

function addDays(timestamp: string, days: number): string {
  const date = new Date(timestamp);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function explanationFor(decision: UnderwritingDecisionOutcome): string {
  switch (decision) {
    case 'APPROVED':
      return 'Votre demande est approuvée. Les étapes d’activation restent à compléter.';
    case 'APPROVED_WITH_CONDITIONS':
      return 'Votre demande est pré-approuvée avec des actions à compléter avant activation.';
    case 'DECLINED':
      return 'Votre demande n’est pas retenue pour le moment. Continuez à améliorer votre score KIRA et vos paiements.';
    case 'ESCALATED':
      return 'Votre demande nécessite une revue renforcée par notre équipe.';
    default:
      return 'Votre demande est en revue manuelle. Nous vous informerons des prochaines étapes.';
  }
}

export function evaluateUnderwriting(input: UnderwritingEvaluationInput): UnderwritingEvaluation {
  const reasonCodes: string[] = [];
  const extension = input.extension ?? EMPTY_EXTENSION;
  const trustAssessment = trustAssessmentFromGrade(input.score.grade);
  const riskAssessment = riskAssessmentFromLevel(input.risk.level);
  const exposureAssessment = evaluateExposure(input.exposure);

  if (input.score.value == null) reasonCodes.push('SCORE_UNAVAILABLE');
  if (!input.score.grade) reasonCodes.push('SCORE_GRADE_UNAVAILABLE');
  if (input.productStatus !== 'ACTIVE') reasonCodes.push('PRODUCT_NOT_ACTIVE');
  if (input.applicationEligibility === 'NOT_ELIGIBLE') reasonCodes.push('APPLICATION_NOT_ELIGIBLE');
  if (riskAssessment === 'CRITICAL') reasonCodes.push('CRITICAL_RISK_ESCALATION');
  if (exposureAssessment === 'EXCEEDS_LIMIT') reasonCodes.push('EXPOSURE_EXCEEDS_LIMIT');
  if (exposureAssessment === 'MANUAL_REVIEW') reasonCodes.push('EXPOSURE_REVIEW_REQUIRED');
  if (extension.review_flags.length > 0) reasonCodes.push('PRODUCT_EXTENSION_REVIEW');
  reasonCodes.push(...extension.reason_codes);

  let decision: UnderwritingDecisionOutcome;
  if (input.productStatus !== 'ACTIVE' || input.applicationEligibility === 'NOT_ELIGIBLE') {
    decision = 'DECLINED';
  } else if (riskAssessment === 'CRITICAL') {
    decision = 'ESCALATED';
  } else if (exposureAssessment === 'EXCEEDS_LIMIT' || !input.score.grade) {
    decision = 'MANUAL_REVIEW';
  } else {
    decision = decisionFromMatrix(input.policy.decisionMatrix, trustAssessment, input.financial, riskAssessment, exposureAssessment);
  }

  if (decision === 'APPROVED' && extension.conditions.length > 0) {
    decision = 'APPROVED_WITH_CONDITIONS';
    reasonCodes.push('PRODUCT_CONDITIONS_REQUIRED');
  }

  return {
    applicationId: input.applicationId,
    decision,
    trustAssessment,
    financialAssessment: input.financial,
    riskAssessment,
    exposureAssessment,
    scoreSnapshot: { ...input.score },
    riskSnapshot: { ...input.risk, reasons: [...input.risk.reasons] },
    exposureSnapshot: {
      requested: { ...input.exposure.requested },
      current: { ...input.exposure.current },
      maximum: { ...input.exposure.maximum },
      available: { ...input.exposure.available },
    },
    policySnapshot: {
      ...input.policy,
      rules: { ...input.policy.rules },
      decisionMatrix: input.policy.decisionMatrix.map((row) => ({ ...row })),
    },
    extensionResults: {
      ...extension,
      gate_results: { ...extension.gate_results },
      conditions: extension.conditions.map((condition) => ({ ...condition })),
      review_flags: [...extension.review_flags],
      reason_codes: [...extension.reason_codes],
    },
    reasonCodes: [...new Set(reasonCodes)],
    driverExplanation: explanationFor(decision),
    adminExplanation: `Policy ${input.policy.policyId} v${input.policy.version} evaluated trust=${trustAssessment}, financial=${input.financial}, risk=${riskAssessment}, exposure=${exposureAssessment}.`,
    decisionValidUntil: decision === 'DECLINED'
      ? null
      : addDays(input.evaluatedAt, input.policy.rules.decision_valid_days ?? 30),
  };
}

export type DriverSafeUnderwritingDecision = {
  decision_id: string;
  application_id: string;
  status_label: string;
  explanation: string;
  decision_valid_until: string | null;
  pending_conditions: number;
  required_actions: Array<{ condition_type: string; description: string; status: string }>;
  reunderwriting_required: boolean;
};

export function driverSafeDecisionSummary(input: {
  decision_id: string;
  application_id: string;
  decision: UnderwritingDecisionOutcome | string;
  driver_explanation: string;
  decision_valid_until: string | null;
  pending_conditions: number;
  required_actions_json?: unknown;
  is_reunderwriting_required?: boolean;
}): DriverSafeUnderwritingDecision {
  const actions = Array.isArray(input.required_actions_json)
    ? input.required_actions_json
      .filter((item): item is { condition_type: string; description: string; status: string } =>
        typeof item === 'object'
        && item !== null
        && 'description' in item
        && 'status' in item,
      )
      .map((item) => ({
        condition_type: String(item.condition_type ?? 'ACTION_REQUIRED'),
        description: String(item.description),
        status: String(item.status),
      }))
    : [];

  return {
    decision_id: input.decision_id,
    application_id: input.application_id,
    status_label: underwritingDecisionLabel(input.decision),
    explanation: input.driver_explanation,
    decision_valid_until: input.decision_valid_until,
    pending_conditions: input.pending_conditions,
    required_actions: actions,
    reunderwriting_required: Boolean(input.is_reunderwriting_required),
  };
}

export function underwritingDecisionLabel(status: string | null | undefined): string {
  switch (status) {
    case 'APPROVED': return 'Approuvée';
    case 'APPROVED_WITH_CONDITIONS': return 'Pré-approuvée avec actions';
    case 'MANUAL_REVIEW': return 'En revue';
    case 'DECLINED': return 'Non retenue';
    case 'ESCALATED': return 'Revue renforcée';
    default: return 'En cours';
  }
}
