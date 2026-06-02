/**
 * Maps Postgres / edge-function errors related to invoice constraints
 * to clear French user-facing messages.
 *
 * Constraints handled:
 *  - uniq_invoice_per_rental  (unique partial index, code 23505)
 *  - invoice_totals_match     (CHECK, code 23514)
 */

type AnyErr =
  | { code?: string; message?: string; details?: string; hint?: string }
  | Error
  | string
  | null
  | undefined;

export function getInvoiceErrorMessage(err: AnyErr, fallback = "Erreur lors de l'opération"): string {
  if (!err) return fallback;
  const e = typeof err === "string" ? { message: err } : (err as { code?: string; message?: string; details?: string });
  const code = (e as { code?: string }).code ?? "";
  const raw = `${e.message ?? ""} ${(e as { details?: string }).details ?? ""}`.toLowerCase();

  // Unique invoice per rental
  if (
    raw.includes("uniq_invoice_per_rental") ||
    (code === "23505" && raw.includes("rental_id"))
  ) {
    return "Une facture existe déjà pour cette location. Impossible d'en créer une seconde.";
  }

  // Totals mismatch CHECK — match the constraint name precisely so unrelated
  // 23514 errors (e.g. invoice_audit's audit_action_check) don't surface as a
  // misleading "Montants incohérents" toast.
  if (raw.includes("invoice_totals_match")) {
    return "Montants incohérents : sous-total HT + TVA doit être égal au total TTC.";
  }

  // Generic CHECK / UNIQUE fallbacks (still informative)
  if (code === "23514") return "Données invalides — une règle métier a été enfreinte.";
  if (code === "23505") return "Doublon détecté — l'enregistrement existe déjà.";

  return e.message || fallback;
}
