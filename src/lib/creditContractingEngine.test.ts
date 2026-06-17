import { describe, expect, it } from 'vitest';
import {
  assertNoUnsupportedSigners,
  canSignerSign,
  driverContractStatusLabel,
  evaluateContractActivationGate,
  nextContractStatus,
  normalizeRequiredSigners,
} from './creditContractingEngine';

describe('Layer 3C contracting engine', () => {
  it('normalizes signer sequencing and blocks unsupported guarantors', () => {
    const signers = normalizeRequiredSigners(['DRIVER', 'ADMIN', 'MANAGER']);
    expect(signers.map((signer) => `${signer.signer_type}:${signer.sequence}`)).toEqual(['DRIVER:1', 'ADMIN:2', 'MANAGER:3']);
    expect(() => assertNoUnsupportedSigners(normalizeRequiredSigners(['DRIVER', 'GUARANTOR', 'ADMIN']))).toThrow(/Guarantor/);
  });

  it('enforces sequential signatures across driver, admin, and manager', () => {
    const signers = normalizeRequiredSigners(['DRIVER', 'ADMIN', 'MANAGER']);

    expect(canSignerSign('ADMIN', signers, [])).toMatchObject({ allowed: false });
    expect(canSignerSign('DRIVER', signers, [])).toMatchObject({ allowed: true });
    expect(canSignerSign('ADMIN', signers, ['DRIVER'])).toMatchObject({ allowed: true });
    expect(canSignerSign('MANAGER', signers, ['DRIVER'])).toMatchObject({ allowed: false });
    expect(canSignerSign('MANAGER', signers, ['DRIVER', 'ADMIN'])).toMatchObject({ allowed: true });
  });

  it('derives partial versus fully executed status from required signer completion', () => {
    const signers = normalizeRequiredSigners(['DRIVER', 'ADMIN']);
    expect(nextContractStatus(signers, ['DRIVER'])).toBe('PARTIALLY_EXECUTED');
    expect(nextContractStatus(signers, ['DRIVER', 'ADMIN'])).toBe('FULLY_EXECUTED');
  });

  it('keeps driver labels human-readable and avoids raw enum wording', () => {
    expect(driverContractStatusLabel('FULLY_EXECUTED')).toBe('Accord signe');
    expect(driverContractStatusLabel('DECLINED_BY_DRIVER')).toBe('Signature refusee');
  });

  it('requires the latest valid fully executed agreement before activation', () => {
    expect(evaluateContractActivationGate({
      requiresContract: true,
      latestAgreementSigned: false,
      contractStatus: 'PARTIALLY_EXECUTED',
      requiredSignaturesComplete: false,
    })).toEqual({
      ready: false,
      blockers: ['signed_agreement_required', 'contract_signatures_incomplete'],
    });

    expect(evaluateContractActivationGate({
      requiresContract: true,
      latestAgreementSigned: true,
      contractStatus: 'FULLY_EXECUTED',
      contractMatchesDecision: true,
      contractMatchesProductVersion: true,
      contractMatchesAsset: true,
      contractMoneyMatches: true,
      requiredSignaturesComplete: true,
    })).toEqual({ ready: true, blockers: [] });
  });

  it('blocks activation when an executed contract no longer matches legal state', () => {
    expect(evaluateContractActivationGate({
      requiresContract: true,
      latestAgreementSigned: true,
      contractStatus: 'FULLY_EXECUTED',
      contractMatchesDecision: false,
      contractMatchesProductVersion: true,
      contractMatchesAsset: false,
      contractMoneyMatches: false,
      requiredSignaturesComplete: true,
    }).blockers).toEqual([
      'contract_decision_mismatch',
      'contract_asset_mismatch',
      'contract_money_mismatch',
    ]);
  });
});
