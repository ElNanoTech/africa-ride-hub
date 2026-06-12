import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Central status mapping registry.
 *
 * All admin screens (Billing, BillingAudit, Rentals, …) MUST consume statuses
 * via this module instead of redeclaring local label/variant/color logic.
 * This guarantees a single source of truth for badge styling, French wording,
 * and human-readable explanations used in tooltips and legends.
 *
 * Never use hardcoded Tailwind colors for statuses in components — always
 * route through `<StatusBadge />` or `getStatusMeta()`.
 */

export type BadgeVariant = NonNullable<BadgeProps["variant"]>;

export interface StatusMeta {
  /** French label displayed inside the badge. */
  label: string;
  /** Semantic Badge variant — never a hardcoded color class. */
  variant: BadgeVariant;
  /** Plain-language explanation used in tooltips and legends. */
  meaning: string;
}

export type StatusKind =
  | "invoice"
  | "payment"
  | "rental"
  | "rental_invoice"
  | "audit_action"
  | "cron_run";

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

const INVOICE: Record<string, StatusMeta> = {
  draft: { label: "Brouillon", variant: "outline", meaning: "Facture en préparation, modifiable." },
  issued: { label: "Émise", variant: "pending", meaning: "Facture envoyée, paiement attendu." },
  partial: { label: "Partiel", variant: "high", meaning: "Paiement partiel reçu — solde restant à régler." },
  paid: { label: "Payée", variant: "success", meaning: "Facture acquittée intégralement." },
  cancelled: { label: "Annulée", variant: "destructive", meaning: "Facture annulée avec motif." },
};

const PAYMENT: Record<string, StatusMeta> = {
  pending: { label: "En attente", variant: "pending", meaning: "Paiement non encore reçu." },
  paid: { label: "Payé", variant: "success", meaning: "Paiement reçu et confirmé." },
  partial: { label: "Partiel", variant: "high", meaning: "Paiement partiellement reçu — solde restant à régler." },
  overpaid: { label: "Trop-perçu", variant: "success", meaning: "Paiement reçu en excès — surplus crédité au portefeuille." },
  late: { label: "Payé en retard", variant: "high", meaning: "Réglé après l'échéance." },
  overdue: { label: "Retard", variant: "destructive", meaning: "Échéance dépassée sans règlement." },
  waived: { label: "Annulé", variant: "outline", meaning: "Paiement annulé ou exonéré." },
};

const RENTAL: Record<string, StatusMeta> = {
  pending: { label: "En attente", variant: "pending", meaning: "Demande à approuver." },
  approved: { label: "Active", variant: "active", meaning: "Approuvée, en cours d'utilisation." },
  active: { label: "Active", variant: "active", meaning: "Location en cours." },
  paid: { label: "Payée", variant: "paid", meaning: "Loyer réglé pour la période." },
  return_pending: { label: "Retour en attente", variant: "pending", meaning: "Conducteur a demandé la restitution." },
  overdue_return: { label: "Retour en retard", variant: "overdue", meaning: "Date de retour dépassée." },
  payment_overdue: { label: "Paiement en retard", variant: "overdue", meaning: "Loyer non réglé à échéance." },
  vehicle_disabled: { label: "Véhicule désactivé", variant: "rejected", meaning: "Bloqué pour non-paiement." },
  completed: { label: "Terminée", variant: "default", meaning: "Restituée et clôturée." },
  rejected: { label: "Rejetée", variant: "rejected", meaning: "Demande refusée." },
  cancelled: { label: "Annulée", variant: "outline", meaning: "Location annulée." },
};

/** Invoice status as displayed inline next to a rental row. */
const RENTAL_INVOICE: Record<string, StatusMeta> = {
  draft: { label: "Brouillon", variant: "outline", meaning: "Facture en préparation." },
  issued: { label: "Non payée", variant: "pending", meaning: "Facture émise, paiement attendu." },
  partial: { label: "Partiel", variant: "high", meaning: "Paiement partiel reçu — solde restant à régler." },
  paid: { label: "Payée", variant: "success", meaning: "Facture acquittée." },
  cancelled: { label: "Annulée", variant: "rejected", meaning: "Facture annulée." },
};

const AUDIT_ACTION: Record<string, StatusMeta> = {
  created: { label: "Créée", variant: "outline", meaning: "Facture créée en brouillon." },
  issued: { label: "Émise", variant: "pending", meaning: "Facture émise au conducteur." },
  paid: { label: "Payée", variant: "success", meaning: "Facture marquée comme payée." },
  cancelled: { label: "Annulée", variant: "destructive", meaning: "Facture annulée avec motif." },
  regenerated_link: { label: "Lien régénéré", variant: "secondary", meaning: "Nouveau lien public généré." },
  viewed_public: { label: "Consultée", variant: "outline", meaning: "Consultation via le lien public." },
  statement_generated: { label: "Relevé généré", variant: "secondary", meaning: "Relevé mensuel produit." },
  auto_generated: { label: "Auto-générée", variant: "approved", meaning: "Générée automatiquement après paiement." },
};

const CRON_RUN: Record<string, StatusMeta> = {
  success: { label: "Succès", variant: "success", meaning: "Exécution réussie." },
  error: { label: "Échec", variant: "destructive", meaning: "Exécution en erreur — voir le détail." },
  running: { label: "En cours", variant: "secondary", meaning: "Exécution en cours." },
  never: { label: "Jamais exécuté", variant: "outline", meaning: "Aucune exécution enregistrée." },
};

const REGISTRIES: Record<StatusKind, Record<string, StatusMeta>> = {
  invoice: INVOICE,
  payment: PAYMENT,
  rental: RENTAL,
  rental_invoice: RENTAL_INVOICE,
  audit_action: AUDIT_ACTION,
  cron_run: CRON_RUN,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getStatusMeta(kind: StatusKind, status: string | null | undefined): StatusMeta {
  const reg = REGISTRIES[kind];
  if (status && reg[status]) return reg[status];
  return { label: status ?? "—", variant: "outline", meaning: "Statut inconnu." };
}

export function getLegend(kind: StatusKind): Array<StatusMeta & { key: string }> {
  return Object.entries(REGISTRIES[kind]).map(([key, m]) => ({ key, ...m }));
}

// ---------------------------------------------------------------------------
// <StatusBadge /> — single component every screen should use
// ---------------------------------------------------------------------------

interface StatusBadgeProps {
  kind: StatusKind;
  status: string | null | undefined;
  /** Optional prefix prepended to the label, e.g. "Facture". */
  prefix?: string;
  /** Show a tooltip explaining what the status means. Default true. */
  withTooltip?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function StatusBadge({
  kind,
  status,
  prefix,
  withTooltip = true,
  className,
  children,
}: StatusBadgeProps) {
  const meta = getStatusMeta(kind, status);
  const text = prefix ? `${prefix} ${meta.label}` : meta.label;
  const badge = (
    <Badge variant={meta.variant} className={cn("gap-1", className)}>
      {children}
      {text}
    </Badge>
  );
  if (!withTooltip) return badge;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{badge}</span>
        </TooltipTrigger>
        <TooltipContent>{meta.meaning}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
