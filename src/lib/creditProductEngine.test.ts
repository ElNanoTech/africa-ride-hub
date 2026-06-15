import { describe, expect, it } from 'vitest';
import {
  assertLayer3AObligation,
  assertValidMoney,
  calculateCurrentExposure,
  calculateDownPayment,
  createApplicationSnapshot,
  driverAssetLabel,
  evaluateActivationReadiness,
  evaluateCreditEligibility,
  formatMoney,
  getActiveProductVersion,
  type CreditProduct,
  type ProductVersion,
} from './creditProductEngine';

const product: CreditProduct = {
  product_id: 'vehicle-product',
  product_type: 'CAR_OWNERSHIP',
  status: 'ACTIVE',
  name: 'Vehicle Ownership Program',
  rules_json: { min_score: 720, down_payment: { type: 'PERCENTAGE', percent: 10 } },
};

const versions: ProductVersion[] = [
  {
    version_id: 'version-1',
    product_id: product.product_id,
    version_number: 1,
    effective_from: '2026-06-01T00:00:00Z',
    effective_to: '2026-06-20T00:00:00Z',
    status: 'ACTIVE',
    rules_snapshot_json: { min_score: 720, down_payment: { type: 'PERCENTAGE', percent: 10 } },
  },
  {
    version_id: 'version-2',
    product_id: product.product_id,
    version_number: 2,
    effective_from: '2026-06-20T00:00:00Z',
    effective_to: null,
    status: 'ACTIVE',
    rules_snapshot_json: { min_score: 760, down_payment: { type: 'PERCENTAGE', percent: 20 } },
  },
];

describe('Layer 3A credit product engine', () => {
  it('stores money as integer minor units with XOF scale 0', () => {
    expect(assertValidMoney({ amount: 150000, currency_code: 'XOF' })).toEqual({ amount: 150000, currency_code: 'XOF' });
    expect(formatMoney({ amount: 150000, currency_code: 'XOF' })).toBe('150\u202f000 FCFA');
    expect(() => assertValidMoney({ amount: 150000.5, currency_code: 'XOF' })).toThrow(/integer/);
  });

  it('snapshots the product version that was active at submission', () => {
    const versionAtSubmission = getActiveProductVersion(product.product_id, versions, new Date('2026-06-15T10:00:00Z'));
    const activeLater = getActiveProductVersion(product.product_id, versions, new Date('2026-06-25T10:00:00Z'));

    expect(versionAtSubmission?.version_id).toBe('version-1');
    expect(activeLater?.version_id).toBe('version-2');

    const eligibility = evaluateCreditEligibility(versionAtSubmission!.rules_snapshot_json, 740);
    const snapshot = createApplicationSnapshot({
      application_id: 'application-1',
      driver_id: 'driver-1',
      product,
      productVersion: versionAtSubmission!,
      score: 740,
      scoreSource: 'driver_scores.current_score',
      eligibility,
      kycReferenceId: 'kyc-1',
      submittedAt: '2026-06-15T10:00:00Z',
      money: { downPayment: { amount: 400000, currency_code: 'XOF' } },
    });

    expect(snapshot.product_version_snapshot.version_id).toBe('version-1');
    expect(snapshot.product_version_snapshot.rules_snapshot_json.down_payment).toEqual({ type: 'PERCENTAGE', percent: 10 });
    expect(snapshot.privacy_note).toMatch(/rather than raw identity documents/);
  });

  it('evaluates eligibility from an authoritative score without deriving a grade', () => {
    expect(evaluateCreditEligibility({ min_score: 720 }, 760)).toMatchObject({ result: 'ELIGIBLE', gap: 0 });
    expect(evaluateCreditEligibility({ min_score: 720, manual_review_below_score: 650 }, 690)).toMatchObject({
      result: 'ELIGIBLE_FOR_REVIEW',
      gap: 30,
    });
    expect(evaluateCreditEligibility({ min_score: 720 }, 610)).toMatchObject({
      result: 'NOT_ELIGIBLE',
      driverLabel: 'Non éligible - voir conditions',
    });
  });

  it('calculates down payment from snapshot rules', () => {
    expect(calculateDownPayment({ type: 'PERCENTAGE', percent: 20 }, { amount: 1500000, currency_code: 'XOF' })).toEqual({
      amount: 300000,
      currency_code: 'XOF',
    });
    expect(calculateDownPayment({ type: 'FIXED', amount: 75000, currency_code: 'XOF' }, { amount: 1500000, currency_code: 'XOF' })).toEqual({
      amount: 75000,
      currency_code: 'XOF',
    });
  });

  it('blocks activation until approval, settled down payment, agreement, and possession are all confirmed', () => {
    const blocked = evaluateActivationReadiness({
      applicationStatus: 'APPROVED',
      decision: 'APPROVED',
      downPaymentAmount: 500000,
      downPaymentInvoiceStatus: 'issued',
      fulfillmentStatus: 'DELIVERED',
      hasPhysicalAsset: true,
      agreementSigned: true,
    });

    expect(blocked.status).toBe('BLOCKED');
    expect(blocked.blockingReasons).toEqual(expect.arrayContaining([
      'Down-payment invoice must be settled.',
      'Driver and admin possession confirmation is required.',
    ]));

    const ready = evaluateActivationReadiness({
      applicationStatus: 'APPROVED',
      decision: 'APPROVED',
      downPaymentAmount: 500000,
      downPaymentInvoiceStatus: 'paid',
      fulfillmentStatus: 'POSSESSION_CONFIRMED',
      possessionConfirmedAt: '2026-06-15T12:00:00Z',
      hasPhysicalAsset: true,
      agreementSigned: true,
    });

    expect(ready).toMatchObject({ status: 'READY', ready: true, blockingReasons: [] });
  });

  it('blocks damaged or lost pre-possession assets and keeps the driver unactivated', () => {
    const damaged = evaluateActivationReadiness({
      applicationStatus: 'APPROVED',
      decision: 'APPROVED',
      downPaymentAmount: 0,
      fulfillmentStatus: 'DAMAGED_BEFORE_POSSESSION',
      hasPhysicalAsset: true,
      agreementSigned: true,
    });

    expect(damaged.status).toBe('BLOCKED');
    expect(damaged.blockingReasons.join(' ')).toContain('damaged before possession');
  });

  it('calculates current exposure for active accounts and pending approved activations', () => {
    expect(calculateCurrentExposure([
      { status: 'ACTIVE', principal: { amount: 1500000, currency_code: 'XOF' } },
      { status: 'PAST_DUE', principal: { amount: 500000, currency_code: 'XOF' } },
      { status: 'COMPLETED', principal: { amount: 100000, currency_code: 'XOF' } },
    ], 'XOF')).toEqual({ amount: 2000000, currency_code: 'XOF' });
  });

  it('does not allow Layer 3A to generate recurring installment invoices', () => {
    expect(assertLayer3AObligation('DOWN_PAYMENT')).toBe('DOWN_PAYMENT');
    expect(() => assertLayer3AObligation('OWNERSHIP_INSTALLMENT')).toThrow(/recurring installment/);
  });

  it('uses human asset labels and never needs serial/VIN/IMEI for driver-facing display', () => {
    expect(driverAssetLabel({ description: 'Suzuki Dzire', plate: 'AA-857-KQ-01' })).toBe('Suzuki Dzire - AA-857-KQ-01');
    expect(driverAssetLabel({ description: 'iPhone 13' })).toBe('iPhone 13 - Financé');
  });
});
