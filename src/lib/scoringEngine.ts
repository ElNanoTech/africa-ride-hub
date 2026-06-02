/**
 * Pure-TS scoring engine — mirrors DB triggers / determination logic so the
 * behavior can be unit-tested without hitting Supabase. Used both as a reference
 * implementation and as the engine backing the Vitest fixture suite.
 *
 * Rules encoded here:
 *  1. Every new driver is seeded with the platform default base score (500).
 *  2. An accident only impacts the driver score when its determination is
 *     persisted (closed / RESOLVED_AT_FAULT) AND the determination flags
 *     score_impact = true with at_fault = true.
 *  3. Severity → default penalty mapping comes from accidentScoring.ts:
 *     MINOR -30, MODERATE -75, SEVERE -150 (all negative).
 *  4. The clamped score is in [0, 1000].
 */

import {
  DEFAULT_ACCIDENT_PENALTIES,
  type ConfigurableAccidentSeverity,
} from './accidentScoring';

export const DEFAULT_BASE_SCORE = 500;
export const SCORE_FLOOR = 0;
export const SCORE_CEILING = 1000;

export type AccidentStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'WAITING_DOCS'
  | 'INVESTIGATING'
  | 'PENDING_DETERMINATION'
  | 'RESOLVED_AT_FAULT'
  | 'RESOLVED_NOT_AT_FAULT'
  | 'CLOSED'
  | 'CANCELLED';

export interface AccidentFixture {
  id: string;
  severity: ConfigurableAccidentSeverity;
  status: AccidentStatus;
  /** Determination flag — whether the driver was found at-fault. Required for status RESOLVED_*. */
  at_fault?: boolean;
  /** Whether the determination should impact the score. Defaults to true when at_fault is true. */
  score_impact?: boolean;
}

export interface PaymentFixture {
  id: string;
  /** Status reached by the payment. Only 'paid' / 'overdue' produce score events. */
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  /** ISO date the payment was due. Required for 'paid' to detect lateness. */
  due_date?: string;
  /** ISO date the payment actually settled. Required when status is 'paid'. */
  paid_date?: string;
  /** Loan / rental / generic — only used to compose the French reason text. */
  payment_type?: 'rental' | 'loan' | string;
}

export interface DriverFixture {
  id: string;
  base_score?: number;
  accidents?: AccidentFixture[];
  payments?: PaymentFixture[];
  /** Optional override of the platform-level payment rules. */
  payment_rules?: PaymentScoreRules;
}

export interface PaymentScoreRules {
  on_time_bonus: number;
  late_penalty: number;
  overdue_penalty: number;
  enabled?: boolean;
}

export const DEFAULT_PAYMENT_SCORE_RULES: PaymentScoreRules = {
  on_time_bonus: 5,
  late_penalty: -10,
  overdue_penalty: -20,
  enabled: true,
};

export interface ScoreEvent {
  driver_id: string;
  /** Source ID — accident_id for sinistres, payment_id for paiements. */
  source_id: string;
  source_type: 'accident' | 'payment';
  delta: number;
  reason: string;
}

export interface ScoringResult {
  driver_id: string;
  base_score: number;
  applied_events: ScoreEvent[];
  pending_accidents: AccidentFixture[];
  final_score: number;
}

const TERMINAL_AT_FAULT_STATUSES: AccidentStatus[] = ['RESOLVED_AT_FAULT', 'CLOSED'];

export function isAccidentScoreImpacting(a: AccidentFixture): boolean {
  if (!TERMINAL_AT_FAULT_STATUSES.includes(a.status)) return false;
  if (a.at_fault !== true) return false;
  if (a.score_impact === false) return false;
  return true;
}

export function penaltyForSeverity(severity: ConfigurableAccidentSeverity): number {
  return DEFAULT_ACCIDENT_PENALTIES[severity];
}

export function clampScore(score: number): number {
  return Math.max(SCORE_FLOOR, Math.min(SCORE_CEILING, Math.round(score)));
}

/**
 * Mirrors the DB trigger `handle_payment_score_event`:
 *  - paid on/before due_date  → +on_time_bonus  ("Paiement {label} à temps")
 *  - paid after due_date      → +late_penalty   ("Paiement {label} en retard (N jours)")
 *  - status === 'overdue'     → +overdue_penalty ("Paiement {label} en souffrance")
 *  - any other status         → no event
 */
export function evaluatePayment(
  payment: PaymentFixture,
  rules: PaymentScoreRules = DEFAULT_PAYMENT_SCORE_RULES,
): { delta: number; reason: string } | null {
  if (rules.enabled === false) return null;
  const label =
    payment.payment_type === 'rental' ? 'location'
    : payment.payment_type === 'loan' ? 'prêt'
    : 'paiement';

  if (payment.status === 'paid') {
    if (payment.paid_date && payment.due_date && payment.paid_date > payment.due_date) {
      const days = Math.round(
        (Date.parse(payment.paid_date) - Date.parse(payment.due_date)) / 86_400_000,
      );
      return { delta: rules.late_penalty, reason: `Paiement ${label} en retard (${days} jours)` };
    }
    return { delta: rules.on_time_bonus, reason: `Paiement ${label} à temps` };
  }
  if (payment.status === 'overdue') {
    return { delta: rules.overdue_penalty, reason: `Paiement ${label} en souffrance` };
  }
  return null;
}

export function evaluateDriver(driver: DriverFixture): ScoringResult {
  const base = driver.base_score ?? DEFAULT_BASE_SCORE;
  const accidents = driver.accidents ?? [];
  const payments = driver.payments ?? [];
  const rules = driver.payment_rules ?? DEFAULT_PAYMENT_SCORE_RULES;

  const applied: ScoreEvent[] = [];
  const pending: AccidentFixture[] = [];

  for (const accident of accidents) {
    if (isAccidentScoreImpacting(accident)) {
      applied.push({
        driver_id: driver.id,
        source_id: accident.id,
        source_type: 'accident',
        delta: penaltyForSeverity(accident.severity),
        reason: `Sinistre responsable (${accident.severity})`,
      });
    } else {
      pending.push(accident);
    }
  }

  for (const payment of payments) {
    const event = evaluatePayment(payment, rules);
    if (!event) continue;
    applied.push({
      driver_id: driver.id,
      source_id: payment.id,
      source_type: 'payment',
      delta: event.delta,
      reason: event.reason,
    });
  }

  const finalScore = clampScore(
    base + applied.reduce((sum, e) => sum + e.delta, 0),
  );

  return {
    driver_id: driver.id,
    base_score: base,
    applied_events: applied,
    pending_accidents: pending,
    final_score: finalScore,
  };
}
