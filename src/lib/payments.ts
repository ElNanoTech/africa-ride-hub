/**
 * Shared "en retard" rule for payments — single client-side source of truth.
 *
 * A payment is overdue when its status is explicitly 'overdue' OR it is still
 * unpaid (pending/partial) past its due date. Nothing in the app ever sets
 * status='overdue' automatically, so the date fallback is what makes the rule
 * real (see /admin/payments).
 *
 * SQL twin: the `overdue_pay` CTE in drivers_risk_summary() (migration
 * 20260612130000) implements the exact same rule server-side for the drivers
 * list — keep the two in sync.
 */

export interface OverduePaymentLike {
  status: string;
  /** ISO date or timestamp string (only the date part is compared). */
  due_date: string;
}

/** Today as a YYYY-MM-DD string (the comparison granularity of the rule). */
export function todayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

export function isPaymentOverdue(payment: OverduePaymentLike, today: string = todayDateString()): boolean {
  return (
    payment.status === 'overdue' ||
    (['pending', 'partial'].includes(payment.status) && payment.due_date.slice(0, 10) < today)
  );
}
