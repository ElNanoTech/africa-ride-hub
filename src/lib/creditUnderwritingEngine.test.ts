import { describe, expect, it } from 'vitest';
import {
  decisionFromMatrix,
  driverSafeDecisionSummary,
  evaluateExposure,
  evaluateUnderwriting,
  trustAssessmentFromGrade,
  type UnderwritingEvaluationInput,
  type UnderwritingPolicy,
} from './creditUnderwritingEngine';

const vehiclePolicy: UnderwritingPolicy = {
  policyId: 'policy-vehicle',
  version: 1,
  rules: { decision_valid_days: 30 },
  decisionMatrix: [
    {
      trust: ['EXCEPTIONAL', 'HIGH'],
      financial: ['HIGH'],
      risk: ['LOW'],
      exposure: ['WITHIN_LIMIT'],
      outcome: 'APPROVED',
    },
    {
      trust: ['HIGH'],
      financial: ['MEDIUM'],
      risk: ['MEDIUM'],
      exposure: ['WITHIN_LIMIT'],
      outcome: 'APPROVED_WITH_CONDITIONS',
    },
  ],
};

const baseInput: UnderwritingEvaluationInput = {
  applicationId: 'application-1',
  applicationEligibility: 'ELIGIBLE',
  productStatus: 'ACTIVE',
  score: { value: 820, grade: 'A', updatedAt: '2026-06-16T10:00:00Z' },
  risk: { level: 'bon', reasons: ['Aucun facteur de risque détecté'], computedAt: '2026-06-16T10:01:00Z' },
  financial: 'HIGH',
  exposure: {
    requested: { amount: 4_000_000, currency_code: 'XOF' },
    current: { amount: 0, currency_code: 'XOF' },
    maximum: { amount: 5_000_000, currency_code: 'XOF' },
    available: { amount: 5_000_000, currency_code: 'XOF' },
  },
  policy: vehiclePolicy,
  extension: {
    gate_results: { product_asset_type: 'PASSED' },
    conditions: [],
    review_flags: [],
    reason_codes: [],
  },
  evaluatedAt: '2026-06-16T12:00:00Z',
};

describe('Layer 3B underwriting decision engine', () => {
  it('maps authoritative grades to trust without recomputing thresholds', () => {
    expect(trustAssessmentFromGrade('A')).toBe('EXCEPTIONAL');
    expect(trustAssessmentFromGrade('B')).toBe('HIGH');
    expect(trustAssessmentFromGrade(null)).toBe('UNKNOWN');
  });

  it('approves a high-trust, low-risk application and snapshots decision inputs', () => {
    const result = evaluateUnderwriting(baseInput);

    expect(result.decision).toBe('APPROVED');
    expect(result.scoreSnapshot).toEqual(baseInput.score);
    expect(result.riskSnapshot).toEqual(baseInput.risk);
    expect(result.exposureSnapshot.requested).toEqual({ amount: 4_000_000, currency_code: 'XOF' });
    expect(result.decisionValidUntil).toBe('2026-07-16T12:00:00.000Z');
  });

  it('routes exposure excess to manual review and never fails open', () => {
    const result = evaluateUnderwriting({
      ...baseInput,
      exposure: {
        ...baseInput.exposure,
        requested: { amount: 6_000_000, currency_code: 'XOF' },
      },
    });

    expect(result.exposureAssessment).toBe('EXCEEDS_LIMIT');
    expect(result.decision).toBe('MANUAL_REVIEW');
    expect(result.reasonCodes).toContain('EXPOSURE_EXCEEDS_LIMIT');
  });

  it('defaults unresolved matrix combinations to manual review', () => {
    expect(decisionFromMatrix(vehiclePolicy.decisionMatrix, 'MEDIUM', 'LOW', 'HIGH', 'WITHIN_LIMIT')).toBe('MANUAL_REVIEW');
  });

  it('turns product extension conditions into conditional approval without letting the extension own the outcome', () => {
    const result = evaluateUnderwriting({
      ...baseInput,
      extension: {
        gate_results: { vendor_confirmation: 'REQUIRED' },
        conditions: [{ condition_type: 'VENDOR_CONFIRMATION', description: 'Confirmation fournisseur requise.' }],
        review_flags: [],
        reason_codes: ['VENDOR_CONFIRMATION_REQUIRED'],
      },
    });

    expect(result.decision).toBe('APPROVED_WITH_CONDITIONS');
    expect(result.reasonCodes).toEqual(expect.arrayContaining(['VENDOR_CONFIRMATION_REQUIRED', 'PRODUCT_CONDITIONS_REQUIRED']));
  });

  it('blocks critical risk through escalation before the matrix can approve', () => {
    const result = evaluateUnderwriting({
      ...baseInput,
      risk: { level: 'critique', reasons: ['Sinistre ouvert'] },
    });

    expect(result.decision).toBe('ESCALATED');
    expect(result.reasonCodes).toContain('CRITICAL_RISK_ESCALATION');
  });

  it('requires integer minor-unit money for exposure', () => {
    expect(evaluateExposure(baseInput.exposure)).toBe('WITHIN_LIMIT');
    expect(() => evaluateExposure({
      ...baseInput.exposure,
      requested: { amount: 4_000_000.5, currency_code: 'XOF' },
    })).toThrow(/integer/);
  });

  it('redacts driver summaries to human explanations and required actions only', () => {
    const summary = driverSafeDecisionSummary({
      decision_id: 'decision-1',
      application_id: 'application-1',
      decision: 'APPROVED_WITH_CONDITIONS',
      driver_explanation: 'Votre demande est pré-approuvée avec des actions à compléter avant activation.',
      decision_valid_until: '2026-07-16T12:00:00Z',
      pending_conditions: 1,
      is_reunderwriting_required: false,
      required_actions_json: [
        { condition_type: 'VENDOR_CONFIRMATION', description: 'Confirmation fournisseur requise.', status: 'PENDING' },
      ],
    });

    expect(summary).toEqual({
      decision_id: 'decision-1',
      application_id: 'application-1',
      status_label: 'Pré-approuvée avec actions',
      explanation: 'Votre demande est pré-approuvée avec des actions à compléter avant activation.',
      decision_valid_until: '2026-07-16T12:00:00Z',
      pending_conditions: 1,
      required_actions: [
        { condition_type: 'VENDOR_CONFIRMATION', description: 'Confirmation fournisseur requise.', status: 'PENDING' },
      ],
      reunderwriting_required: false,
    });
    expect(JSON.stringify(summary)).not.toMatch(/policy|fraud|reviewer|matrix/i);
  });
});
