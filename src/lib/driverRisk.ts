// Shared types & helpers for the driver risk model (Chauffeurs spec D-2).
// Risk is COMPUTED, never stored: the SQL source of truth is
// `driver_risk(p_driver)` / `drivers_risk_summary()` (migration
// 20260612130000), both built on `driver_risk_from_factors()`.
// `riskLevelFromFactors()` below is the unit-tested TS mirror of that SQL
// function — same weights, same French reason strings. Keep them in sync
// (same pattern as requiredZones() mirroring fleet_control_required_zones()).

export type DriverRiskLevel = 'bon' | 'moyen' | 'eleve' | 'critique';

export interface DriverRiskFactors {
  /** Unpaid invoices (issued/partial, remaining_due > 0) whose linked payment is past due. */
  overdueInvoices: number;
  /**
   * Open accidents: status NOT IN ('DRAFT','CLOSED','CANCELLED',
   * 'RESOLVED_AT_FAULT','RESOLVED_NOT_AT_FAULT') — a DRAFT sinistre is not
   * yet declared, so it is not a risk factor (same rule in driver_risk()
   * and drivers_risk_summary()).
   */
  openAccidents: number;
  /** traffic_violations with status 'pending_payment'. */
  unpaidViolations: number;
  /** drivers.kyc_status === 'verified'. */
  kycVerified: boolean;
  /** An active vehicle_inspections row in overdue/blocked. */
  fleetControlLate: boolean;
  /**
   * driver_scores.current_score, resolved deterministically by the SQL side:
   * prefer the row with customer_id = the driver's tenant, else the
   * customer_id IS NULL row; null when neither exists.
   */
  currentScore: number | null;
}

export interface DriverRiskResult {
  level: DriverRiskLevel;
  reasons: string[];
}

export const RISK_LEVEL_LABEL: Record<DriverRiskLevel, string> = {
  bon: 'Bon',
  moyen: 'Moyen',
  eleve: 'Élevé',
  critique: 'Critique',
};

/**
 * Tier math (documented in the SQL function comment, tested here):
 *   start at 'bon' (0 points); each factor adds points:
 *     - overdue invoices:      1-2 → +1, 3+ → +2
 *     - open accident(s):      1+  → +1
 *     - unpaid contraventions: 1+  → +1
 *     - KYC not verified:            +1
 *     - fleet control late:          +1
 *     - score < 450 → +1, score < 350 → +2
 *   level = bon(0) / moyen(1) / eleve(2) / critique(>=3).
 * reasons[] gets one French string per triggered factor; when level=bon it
 * is ['Aucun facteur de risque détecté'] — never empty.
 */
export function riskLevelFromFactors(f: DriverRiskFactors): DriverRiskResult {
  let points = 0;
  const reasons: string[] = [];

  if (f.overdueInvoices >= 3) {
    points += 2;
    reasons.push(`${f.overdueInvoices} factures en retard`);
  } else if (f.overdueInvoices >= 1) {
    points += 1;
    reasons.push(
      f.overdueInvoices === 1 ? '1 facture en retard' : `${f.overdueInvoices} factures en retard`,
    );
  }

  if (f.openAccidents >= 1) {
    points += 1;
    reasons.push(f.openAccidents === 1 ? 'Sinistre ouvert' : `${f.openAccidents} sinistres ouverts`);
  }

  if (f.unpaidViolations >= 1) {
    points += 1;
    reasons.push(
      f.unpaidViolations === 1
        ? '1 contravention impayée'
        : `${f.unpaidViolations} contraventions impayées`,
    );
  }

  if (!f.kycVerified) {
    points += 1;
    reasons.push('KYC manquant/expiré');
  }

  if (f.fleetControlLate) {
    points += 1;
    reasons.push('Contrôle véhicule en retard');
  }

  if (f.currentScore !== null && f.currentScore < 350) {
    points += 2;
    reasons.push(`Score faible (${f.currentScore})`);
  } else if (f.currentScore !== null && f.currentScore < 450) {
    points += 1;
    reasons.push(`Score faible (${f.currentScore})`);
  }

  const level: DriverRiskLevel =
    points >= 3 ? 'critique' : points === 2 ? 'eleve' : points === 1 ? 'moyen' : 'bon';

  return {
    level,
    reasons: level === 'bon' ? ['Aucun facteur de risque détecté'] : reasons,
  };
}
