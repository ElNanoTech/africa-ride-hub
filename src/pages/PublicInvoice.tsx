import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/routeClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateShort } from "@/lib/format";
import { downloadInvoicePDF } from "@/lib/invoicePdf";
import { Download, AlertTriangle, Loader2 } from "lucide-react";
import type { Invoice, InvoiceLine } from "@/types/billing";

function buildOgMeta(invoice: Invoice | null) {
  if (!invoice) {
    return {
      title: "Facture DAM Flotte",
      description: "Consultez votre facture en ligne sur DAM Flotte.",
    };
  }
  const kind = invoice.invoice_kind === "monthly_statement" ? "Relevé mensuel" : "Facture";
  const number = invoice.invoice_number ?? "";
  const amount = formatCurrency(invoice.total_ttc);
  const title = `${kind} ${number} — ${amount}`.trim();
  const parts: string[] = [];
  if (invoice.driver_snapshot_name) parts.push(`Conducteur : ${invoice.driver_snapshot_name}`);
  if (invoice.period_start && invoice.period_end) {
    parts.push(`Période : ${formatDateShort(invoice.period_start)} → ${formatDateShort(invoice.period_end)}`);
  } else if (invoice.issued_at) {
    parts.push(`Émise le ${formatDateShort(invoice.issued_at)}`);
  }
  if (invoice.legal_name_snapshot) parts.push(`Émetteur : ${invoice.legal_name_snapshot}`);
  if (invoice.status === "paid") parts.push("Statut : Payée ✓");
  else if (invoice.status === "cancelled") parts.push("Statut : Annulée");
  return { title, description: parts.join(" • ") };
}

export default function PublicInvoice() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-public-invoice", {
          body: { token },
        });
        if (error || (data as { error?: string })?.error) {
          const e = (data as { error?: string; expired?: boolean })?.error || error?.message || "Erreur";
          if ((data as { expired?: boolean })?.expired) setExpired(true);
          setErr(e);
        } else {
          setInvoice((data as { invoice: Invoice }).invoice);
          setLines((data as { lines: InvoiceLine[] }).lines);
        }
      } catch (e) {
        setErr(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (err || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-3">
            <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />
            <h1 className="text-xl font-bold">{expired ? "Lien expiré" : "Facture indisponible"}</h1>
            <p className="text-sm text-muted-foreground">
              {expired
                ? "Ce lien de facture a expiré. Demandez à l'émetteur d'en générer un nouveau."
                : "Cette facture est introuvable ou non encore émise."}
            </p>
            <a href="mailto:support@drivedam.com" className="text-primary text-sm underline">Contacter le support</a>
          </CardContent>
        </Card>
      </div>
    );
  }

  const og = buildOgMeta(invoice);
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <Helmet>
        <title>{og.title}</title>
        <meta name="description" content={og.description} />
        <meta property="og:type" content="article" />
        <meta property="og:site_name" content="DAM Flotte" />
        <meta property="og:title" content={og.title} />
        <meta property="og:description" content={og.description} />
        <meta property="og:url" content={shareUrl} />
        <meta property="og:image" content="https://drivedam.com/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:locale" content="fr_FR" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={og.title} />
        <meta name="twitter:description" content={og.description} />
        <meta name="twitter:image" content="https://drivedam.com/og-image.png" />
      </Helmet>
      <Card className="max-w-2xl mx-auto">
        <CardContent className="pt-6 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-muted-foreground">{invoice.legal_name_snapshot}</p>
              <h1 className="text-2xl font-bold mt-1">
                {invoice.invoice_kind === "monthly_statement" ? "Relevé mensuel" : "Facture"}
              </h1>
              <p className="font-mono text-sm">{invoice.invoice_number}</p>
            </div>
            <Badge variant={invoice.status === "paid" ? "default" : invoice.status === "cancelled" ? "destructive" : "secondary"}>
              {invoice.status === "paid" ? "Payée" : invoice.status === "cancelled" ? "Annulée" : "Émise"}
            </Badge>
          </div>

          {invoice.status === "cancelled" && invoice.cancel_reason && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm">
              <strong>Annulée :</strong> {invoice.cancel_reason}
            </div>
          )}

          <div className="text-sm space-y-1">
            <p><span className="text-muted-foreground">Conducteur :</span> <strong>{invoice.driver_snapshot_name}</strong></p>
            <p><span className="text-muted-foreground">Émise le :</span> {formatDateShort(invoice.issued_at || invoice.created_at)}</p>
            {invoice.period_start && <p><span className="text-muted-foreground">Période :</span> {formatDateShort(invoice.period_start)} → {formatDateShort(invoice.period_end!)}</p>}
          </div>

          {invoice.tags && invoice.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {invoice.tags.map((t) => (
                <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
              ))}
            </div>
          )}

          <div className="border rounded-md divide-y">
            {lines.map((l) => (
              <div key={l.id} className="flex justify-between p-3 text-sm">
                <span>{l.designation}</span>
                <span className="font-mono">{formatCurrency(l.line_total_ttc)}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Sous-total HT</span><span className="font-mono">{formatCurrency(invoice.subtotal_ht)}</span></div>
            {invoice.vat_enabled_snapshot && (
              <div className="flex justify-between"><span>TVA ({invoice.vat_rate_snapshot}%)</span><span className="font-mono">{formatCurrency(invoice.vat_amount)}</span></div>
            )}
            <div className="flex justify-between font-bold text-lg pt-2 border-t"><span>Total TTC</span><span className="font-mono">{formatCurrency(invoice.total_ttc)}</span></div>
          </div>

          <Button className="w-full h-12" onClick={() => downloadInvoicePDF(invoice, lines)}>
            <Download className="h-4 w-4 mr-2" />Télécharger le PDF
          </Button>

          {invoice.legal_footer_snapshot && (
            <p className="text-xs text-muted-foreground text-center pt-2 border-t">{invoice.legal_footer_snapshot}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
