// Shared constants for traffic_violations (Contraventions page + driver
// profile Contraventions tab). Status values mirror what the table actually
// stores — never invent new enum values client-side.

export type ViolationStatus = 'pending_payment' | 'paid' | 'contested' | 'cancelled' | 'liquidated';

export const VIOLATION_STATUS_LABEL: Record<ViolationStatus, string> = {
  pending_payment: 'En attente',
  paid: 'Payé',
  liquidated: 'Liquidé',
  contested: 'En recours',
  cancelled: 'Annulé',
};

export const VIOLATION_STATUS_CLASS: Record<ViolationStatus, string> = {
  pending_payment: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  liquidated: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  contested: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  cancelled: 'bg-muted text-muted-foreground',
};

/**
 * Linkage convention between a contravention and the `other_charges` row
 * created from it: `other_charges.reference = violationChargeReference(id)`.
 * The schema has no violation_id column, so the reference field carries the
 * stable link (read back by the driver Contraventions tab).
 */
export function violationChargeReference(violationId: string): string {
  return `violation:${violationId}`;
}
