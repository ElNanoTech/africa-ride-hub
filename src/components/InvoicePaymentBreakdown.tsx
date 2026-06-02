import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePaymentReceipts, useInvoiceLinkedPayment } from "@/hooks/useBilling";
import { formatCurrency, formatDateShort } from "@/lib/format";
import { Wallet, CreditCard, Banknote, Smartphone } from "lucide-react";
import type { Invoice } from "@/types/billing";

interface Props {
  invoice: Pick<Invoice, "id" | "total_ttc" | "amount_paid" | "status" | "cancelled_at">;
  compact?: boolean;
}

/**
 * Détermine si un reçu de paiement provient de l'application automatique du
 * crédit DAM (wallet auto-apply). Le trigger crée des reçus avec
 * method='other' et note='Crédit portefeuille DAM appliqué automatiquement'.
 */
function isDamCreditReceipt(r: { method: string; note: string | null }) {
  if (r.method === "other") {
    const n = (r.note ?? "").toLowerCase();
    if (n.includes("crédit") && n.includes("portefeuille")) return true;
    if (n.includes("dam")) return true;
  }
  return false;
}

const METHOD_FR: Record<string, string> = {
  wave: "Wave",
  cash: "Espèces",
  orange: "Orange Money",
  mtn: "MTN Money",
  moov: "Moov Money",
  other: "Autre",
};

export function InvoicePaymentBreakdown({ invoice, compact }: Props) {
  const { data: linked } = useInvoiceLinkedPayment(invoice.id);
  const { data: receipts } = usePaymentReceipts(linked?.payment.id ?? null);

  const total = invoice.total_ttc ?? 0;
  let damCredit = 0;
  let waveAmount = 0;
  let otherAmount = 0;

  for (const r of receipts ?? []) {
    if (isDamCreditReceipt(r)) damCredit += r.amount;
    else if (r.method === "wave") waveAmount += r.amount;
    else otherAmount += r.amount;
  }

  const totalPaid = damCredit + waveAmount + otherAmount;
  const remaining = Math.max(0, total - totalPaid);

  // Story sentence
  let storyClass = "text-muted-foreground";
  let story = "";
  if (invoice.cancelled_at && (invoice.amount_paid ?? 0) > 0) {
    story = "Facture annulée — montant recrédité dans votre portefeuille DAM.";
    storyClass = "text-success";
  } else if (invoice.status === "paid") {
    if (damCredit > 0 && waveAmount > 0) {
      story = "Payée par Wave + crédit DAM";
      storyClass = "text-success";
    } else if (damCredit > 0) {
      story = "Payée avec votre crédit DAM";
      storyClass = "text-success";
    } else if (waveAmount > 0) {
      story = "Payée via Wave";
      storyClass = "text-success";
    } else {
      story = "Facture payée";
      storyClass = "text-success";
    }
  } else if (invoice.status === "partial") {
    story =
      damCredit > 0 && waveAmount === 0
        ? "Partiellement réglée avec votre crédit DAM"
        : "Paiement partiel reçu";
    storyClass = "text-warning";
  } else if (remaining > 0) {
    story = "En attente de paiement";
    storyClass = "text-warning";
  }

  return (
    <Card>
      <CardContent className={compact ? "p-3 space-y-2" : "p-4 space-y-3"}>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">
          Répartition du paiement
        </p>

        <ul className="text-sm divide-y">
          <li className="flex justify-between py-1.5">
            <span className="text-muted-foreground">Montant total</span>
            <span className="font-mono font-semibold">{formatCurrency(total)}</span>
          </li>
          {damCredit > 0 && (
            <li className="flex justify-between py-1.5">
              <span className="flex items-center gap-1.5 text-success">
                <Wallet className="h-3.5 w-3.5" />
                Crédit DAM appliqué
              </span>
              <span className="font-mono font-semibold text-success">
                −{formatCurrency(damCredit)}
              </span>
            </li>
          )}
          {waveAmount > 0 && (
            <li className="flex justify-between py-1.5">
              <span className="flex items-center gap-1.5">
                <Smartphone className="h-3.5 w-3.5 text-primary" />
                Payé via Wave
              </span>
              <span className="font-mono font-semibold">−{formatCurrency(waveAmount)}</span>
            </li>
          )}
          {otherAmount > 0 && (
            <li className="flex justify-between py-1.5">
              <span className="flex items-center gap-1.5">
                <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
                Autre paiement
              </span>
              <span className="font-mono font-semibold">−{formatCurrency(otherAmount)}</span>
            </li>
          )}
          <li className="flex justify-between py-1.5 border-t-2 border-foreground/10 pt-2">
            <span className="font-semibold">Reste à payer</span>
            <span
              className={`font-mono font-bold ${
                remaining === 0 ? "text-success" : "text-destructive"
              }`}
            >
              {formatCurrency(remaining)}
            </span>
          </li>
        </ul>

        {story && (
          <p className={`text-sm font-medium ${storyClass}`}>{story}</p>
        )}

        {/* Receipts timeline */}
        {receipts && receipts.length > 0 && (
          <div className="pt-2">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">
              Historique des paiements
            </p>
            <ul className="space-y-1.5">
              {receipts.map((r) => {
                const isDam = isDamCreditReceipt(r);
                const label = isDam
                  ? "Crédit DAM appliqué automatiquement"
                  : r.method === "wave"
                  ? "Paiement Wave confirmé"
                  : `Paiement ${METHOD_FR[r.method] ?? r.method}`;
                const Icon = isDam ? Wallet : r.method === "wave" ? Smartphone : CreditCard;
                return (
                  <li
                    key={r.id}
                    className="flex items-start justify-between gap-2 text-xs bg-muted/30 rounded-md p-2"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <Icon
                        className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
                          isDam ? "text-success" : "text-primary"
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{label}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDateShort(new Date(r.received_at))}
                          {r.wave_transaction_id ? ` · ${r.wave_transaction_id}` : ""}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                      +{formatCurrency(r.amount)}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
