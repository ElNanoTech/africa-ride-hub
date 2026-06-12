// Shared constants for traffic_violations (Contraventions page + driver
// profile Contraventions tab). The status column is free TEXT — this is the
// documented list of values the app reads/writes. Never invent new enum
// values inside a component: add them here.

export type ViolationStatus =
  | 'pending_payment'
  | 'paid'
  | 'contested'
  | 'cancelled'
  | 'liquidated'
  | 'invoiced';

export const VIOLATION_STATUS_LABEL: Record<ViolationStatus, string> = {
  pending_payment: 'En attente',
  paid: 'Payé',
  liquidated: 'Liquidé',
  contested: 'En recours',
  cancelled: 'Annulé',
  // Billed to the driver via a generated invoice (linkage kept in notes:
  // "Facture {invoice_number}") — prevents double-billing.
  invoiced: 'Facturée au chauffeur',
};

export const VIOLATION_STATUS_CLASS: Record<ViolationStatus, string> = {
  pending_payment: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  liquidated: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  contested: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  cancelled: 'bg-muted text-muted-foreground',
  invoiced: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
};

/**
 * Linkage convention between a contravention and the `other_charges` row
 * created from it: `other_charges.reference = violationChargeReference(id)`.
 * The schema has no violation_id column, so the reference field carries the
 * stable link (read back by the driver Contraventions tab).
 */
export const VIOLATION_CHARGE_REFERENCE_PREFIX = 'violation:';

export function violationChargeReference(violationId: string): string {
  return `${VIOLATION_CHARGE_REFERENCE_PREFIX}${violationId}`;
}

/** Inverse of violationChargeReference(); null when not a violation charge. */
export function parseViolationChargeReference(reference: string | null | undefined): string | null {
  if (!reference || !reference.startsWith(VIOLATION_CHARGE_REFERENCE_PREFIX)) return null;
  return reference.slice(VIOLATION_CHARGE_REFERENCE_PREFIX.length);
}
