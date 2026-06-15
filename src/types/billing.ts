export type InvoiceStatus = "draft" | "issued" | "partial" | "paid" | "cancelled";
export type InvoiceKind = "invoice" | "monthly_statement" | "daily_rental";
export type CreditObligationType =
  | "DOWN_PAYMENT"
  | "CREDIT_FEE"
  | "ACTIVATION_FEE"
  | "OWNERSHIP_INSTALLMENT"
  | "MOTORCYCLE_INSTALLMENT"
  | "PHONE_INSTALLMENT"
  | "EQUIPMENT_INSTALLMENT";

/**
 * Predefined invoice tag catalog. Admins pick from this list to categorize
 * invoices (e.g. for downstream reporting / filtering). Free-form tags are
 * intentionally not supported to keep the taxonomy clean.
 */
export const INVOICE_TAGS = [
  "Inactif",
  "Irrégularité administrative",
  "Jour chauffeur",
  "Jour de repos",
  "Manque de chauffeur",
  "Panne/Maintenance",
  "Remise & bonus",
  "Sinistre",
] as const;

export type InvoiceTag = (typeof INVOICE_TAGS)[number];

export interface Invoice {
  id: string;
  customer_id: string;
  driver_id: string;
  rental_id: string | null;
  invoice_number: string | null;
  invoice_kind: InvoiceKind;
  status: InvoiceStatus;
  driver_snapshot_name: string | null;
  driver_snapshot_phone: string | null;
  driver_snapshot_nif: string | null;
  subtotal_ht: number;
  vat_amount: number;
  total_ttc: number;
  amount_paid: number;
  remaining_due: number;
  vat_rate_snapshot: number | null;
  vat_enabled_snapshot: boolean | null;
  legal_name_snapshot: string | null;
  legal_nif_snapshot: string | null;
  legal_rccm_snapshot: string | null;
  legal_address_snapshot: string | null;
  legal_footer_snapshot: string | null;
  public_token: string;
  token_expires_at: string;
  period_start: string | null;
  period_end: string | null;
  issued_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  cancelled_by: string | null;
  notes: string | null;
  tags: string[];
  currency_code: string;
  source_product_id: string | null;
  source_credit_account_id: string | null;
  source_application_id: string | null;
  obligation_type: CreditObligationType | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  customer_id: string;
  position: number;
  designation: string;
  quantity: number;
  unit_price: number;
  line_total_ht: number;
  vat_rate: number;
  line_vat: number;
  line_total_ttc: number;
  source_payment_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BillingSettings {
  id: string;
  customer_id: string;
  invoice_slug: string;
  vat_enabled: boolean;
  vat_rate: number;
  legal_name: string | null;
  legal_nif: string | null;
  legal_rccm: string | null;
  legal_address: string | null;
  legal_footer: string | null;
  legal_logo_url: string | null;
  auto_invoicing: boolean;
  module_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Direct in-app URL — used by QR codes and internal navigation.
 * The user opens it in the SPA without any redirect.
 */
export function publicInvoiceUrl(token: string): string {
  if (typeof window === "undefined") return `/factures/public/${token}`;
  return `${window.location.origin}/factures/public/${token}`;
}

/**
 * Shareable URL — points to the SPA route on the canonical custom domain
 * (drivedam.com). The page injects invoice-specific Open Graph tags via
 * react-helmet so modern crawlers (WhatsApp, iMessage iOS 17+, Telegram,
 * Slack, Discord) show a rich invoice card. Older crawlers fall back to
 * the static index.html OG tags ("DAM Flotte").
 *
 * We deliberately do NOT use the supabase.co edge function URL because
 * Supabase forces `Content-Type: text/plain` + a sandboxed CSP on all
 * function responses, which makes social previews render as a "Text
 * Document" attachment instead of a webpage.
 */
const PUBLIC_SHARE_ORIGIN = "https://drivedam.com";

export function shareableInvoiceUrl(token: string): string {
  return `${PUBLIC_SHARE_ORIGIN}/factures/public/${token}`;
}
