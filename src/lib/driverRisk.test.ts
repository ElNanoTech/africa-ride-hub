import { describe, expect, it } from 'vitest';
import { riskLevelFromFactors, type DriverRiskFactors } from './driverRisk';

const clean: DriverRiskFactors = {
  overdueInvoices: 0,
  // Open = status NOT IN ('DRAFT','CLOSED','CANCELLED','RESOLVED_AT_FAULT',
  // 'RESOLVED_NOT_AT_FAULT'): DRAFT sinistres never count (SQL mirrors this).
  openAccidents: 0,
  unpaidViolations: 0,
  kycVerified: true,
  fleetControlLate: false,
  currentScore: 650,
};

describe('riskLevelFromFactors — tier math', () => {
  it('returns bon with the mandatory placeholder reason when no factor triggers', () => {
    expect(riskLevelFromFactors(clean)).toEqual({
      level: 'bon',
      reasons: ['Aucun facteur de risque détecté'],
    });
  });

  it('treats a missing score (null) as a non-factor', () => {
    expect(riskLevelFromFactors({ ...clean, currentScore: null }).level).toBe('bon');
  });

  it('1-2 overdue invoices add one tier (moyen)', () => {
    expect(riskLevelFromFactors({ ...clean, overdueInvoices: 1 }).level).toBe('moyen');
    expect(riskLevelFromFactors({ ...clean, overdueInvoices: 2 }).level).toBe('moyen');
  });

  it('3+ overdue invoices add two tiers (eleve)', () => {
    expect(riskLevelFromFactors({ ...clean, overdueInvoices: 3 }).level).toBe('eleve');
    expect(riskLevelFromFactors({ ...clean, overdueInvoices: 7 }).level).toBe('eleve');
  });

  it('each single factor alone yields moyen', () => {
    expect(riskLevelFromFactors({ ...clean, openAccidents: 1 }).level).toBe('moyen');
    expect(riskLevelFromFactors({ ...clean, unpaidViolations: 1 }).level).toBe('moyen');
    expect(riskLevelFromFactors({ ...clean, kycVerified: false }).level).toBe('moyen');
    expect(riskLevelFromFactors({ ...clean, fleetControlLate: true }).level).toBe('moyen');
  });

  it('score thresholds: <450 → +1, <350 → +2 (not cumulative)', () => {
    expect(riskLevelFromFactors({ ...clean, currentScore: 450 }).level).toBe('bon');
    expect(riskLevelFromFactors({ ...clean, currentScore: 449 }).level).toBe('moyen');
    expect(riskLevelFromFactors({ ...clean, currentScore: 350 }).level).toBe('moyen');
    expect(riskLevelFromFactors({ ...clean, currentScore: 349 }).level).toBe('eleve');
  });

  it('two one-point factors yield eleve', () => {
    expect(
      riskLevelFromFactors({ ...clean, overdueInvoices: 1, openAccidents: 1 }).level,
    ).toBe('eleve');
  });

  it('three or more points yield critique (spec acceptance: 2 overdue + 1 open sinistre + ...)', () => {
    expect(
      riskLevelFromFactors({ ...clean, overdueInvoices: 2, openAccidents: 1, kycVerified: false })
        .level,
    ).toBe('critique');
    expect(
      riskLevelFromFactors({ ...clean, overdueInvoices: 3, currentScore: 300 }).level,
    ).toBe('critique');
  });
});

describe('riskLevelFromFactors — French reason strings (mirror of SQL)', () => {
  it('pluralizes invoices', () => {
    expect(riskLevelFromFactors({ ...clean, overdueInvoices: 1 }).reasons).toEqual([
      '1 facture en retard',
    ]);
    expect(riskLevelFromFactors({ ...clean, overdueInvoices: 2 }).reasons).toEqual([
      '2 factures en retard',
    ]);
  });

  it('pluralizes accidents and contraventions', () => {
    expect(riskLevelFromFactors({ ...clean, openAccidents: 1 }).reasons).toEqual([
      'Sinistre ouvert',
    ]);
    expect(riskLevelFromFactors({ ...clean, openAccidents: 2 }).reasons).toEqual([
      '2 sinistres ouverts',
    ]);
    expect(riskLevelFromFactors({ ...clean, unpaidViolations: 1 }).reasons).toEqual([
      '1 contravention impayée',
    ]);
    expect(riskLevelFromFactors({ ...clean, unpaidViolations: 3 }).reasons).toEqual([
      '3 contraventions impayées',
    ]);
  });

  it('uses fixed strings for KYC and fleet control, and embeds the score value', () => {
    expect(riskLevelFromFactors({ ...clean, kycVerified: false }).reasons).toEqual([
      'KYC manquant/expiré',
    ]);
    expect(riskLevelFromFactors({ ...clean, fleetControlLate: true }).reasons).toEqual([
      'Contrôle véhicule en retard',
    ]);
    expect(riskLevelFromFactors({ ...clean, currentScore: 412 }).reasons).toEqual([
      'Score faible (412)',
    ]);
  });

  it('lists one reason per triggered factor, in factor order', () => {
    const { level, reasons } = riskLevelFromFactors({
      overdueInvoices: 2,
      openAccidents: 1,
      unpaidViolations: 1,
      kycVerified: false,
      fleetControlLate: true,
      currentScore: 300,
    });
    expect(level).toBe('critique');
    expect(reasons).toEqual([
      '2 factures en retard',
      'Sinistre ouvert',
      '1 contravention impayée',
      'KYC manquant/expiré',
      'Contrôle véhicule en retard',
      'Score faible (300)',
    ]);
  });

  it('never returns an empty reasons array', () => {
    expect(riskLevelFromFactors(clean).reasons.length).toBeGreaterThan(0);
  });
});
