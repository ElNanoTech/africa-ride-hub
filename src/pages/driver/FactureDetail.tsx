import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/routeClient";
import { useInvoiceWithLines, useInvoiceLinkedPayment } from "@/hooks/useBilling";
import { useDriverFullProfile } from "@/hooks/useDriverProfile";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/lib/statusBadges";
import { formatCurrency, formatDateShort } from "@/lib/format";
import { downloadInvoicePDF, shareInvoicePDF } from "@/lib/invoicePdf";
import { ChevronLeft, Download, Share2, FileText, Calendar, User, Phone, Car, CreditCard, Info, Loader2 } from "lucide-react";
import { useFinancialRealtime } from "@/hooks/useFinancialRealtime";
import { InvoicePaymentBreakdown } from "@/components/InvoicePaymentBreakdown";

export default function DriverFactureDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: driver } = useDriverFullProfile();
  const { data: detail, isLoading, error } = useInvoiceWithLines(id ?? null);
  const { data: linkedPayment } = useInvoiceLinkedPayment(id ?? null);
  useFinancialRealtime({
    scope: 'driver',
    driverId: driver?.id ?? null,
    onInvoiceUpdate: (row, old) => {
      if ((row as { id?: string }).id !== id) return;
      const newStatus = (row as { status?: string }).status;
      const oldStatus = (old as { status?: string }).status;
      if (newStatus && newStatus !== oldStatus) {
        if (newStatus === 'paid') toast.success('Facture payée par votre crédit DAM.');
        else if (newStatus === 'partial') toast.success('Crédit DAM appliqué partiellement à cette facture.');
      }
    },
  });

  const invoice = detail?.invoice;
  const lines = detail?.lines ?? [];

  // Defense-in-depth: even if RLS lets the row through, ensure this driver owns it.
  const isOwner = !invoice || !driver?.id || invoice.driver_id === driver.id;

  const [isPayLoading, setIsPayLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Toast when returning from Wave Checkout (?payment=success|error), then strip param.
  useEffect(() => {
    const status = searchParams.get("payment");
    if (!status) return;
    if (status === "success") {
      toast.success("Paiement reçu", {
        description: "Votre paiement a été enregistré. Le statut sera mis à jour dans quelques instants.",
      });
    } else if (status === "error") {
      toast.error("Paiement non finalisé", {
        description: "Le paiement Wave n'a pas abouti. Vous pouvez réessayer.",
      });
    }
    const next = new URLSearchParams(searchParams);
    next.delete("payment");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const payment = linkedPayment?.payment ?? null;
  const remainingDue = payment
    ? Math.max(0, Number(payment.amount ?? 0) - Number(payment.amount_paid ?? 0))
    : 0;
  const canPayWithWave =
    !!invoice &&
    invoice.status === "issued" &&
    !invoice.paid_at &&
    !!payment &&
    remainingDue > 0;

  const handlePayWithWave = async () => {
    if (!invoice || !payment) return;
    setIsPayLoading(true);
    try {
      const successUrl = `${window.location.origin}/driver/factures/${invoice.id}?payment=success`;
      const errorUrl = `${window.location.origin}/driver/factures/${invoice.id}?payment=error`;
      // No restrict_payer_mobile: driver's Wave wallet may differ from login phone.
      // Wave hosted page accepts payment from any wallet the driver controls.
      const response = await supabase.functions.invoke("wave-checkout", {
        body: {
          paymentId: payment.id,
          amount: remainingDue,
          successUrl,
          errorUrl,
        },
      });
      if (response.error) throw new Error(response.error.message);
      const url = response.data?.checkout_url;
      if (!url) throw new Error("Aucune URL de paiement reçue");
      window.location.href = url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      console.error("Wave checkout error:", err);
      toast.error("Erreur de paiement", {
        description: `Impossible de créer la session Wave. ${msg}`,
      });
      setIsPayLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 bg-primary text-primary-foreground p-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="text-primary-foreground hover:bg-primary-foreground/10"
          onClick={() => navigate("/driver/factures")}
          aria-label="Retour"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold truncate">Détails de la facture</h1>
          <p className="text-xs opacity-80 font-mono truncate">
            {invoice?.invoice_number || (isLoading ? "Chargement…" : "—")}
          </p>
        </div>
      </header>

      <main className="p-4 space-y-4 max-w-2xl mx-auto">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : error || !invoice || !isOwner ? (
          <Card>
            <CardContent className="p-8 text-center space-y-3">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground opacity-60" />
              <p className="text-muted-foreground">Facture introuvable.</p>
              <Button variant="outline" onClick={() => navigate("/driver/factures")}>
                Retour à mes factures
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Status + amount */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <StatusBadge kind="invoice" status={invoice.status} />
                  <span className="text-xs text-muted-foreground">
                    {invoice.invoice_kind === "monthly_statement" ? "Relevé mensuel" : "Facture"}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Montant total</p>
                  <p className="text-3xl font-bold">{formatCurrency(invoice.total_ttc)}</p>
                </div>
              </CardContent>
            </Card>

            {/* Pay this invoice — only when issued and not yet paid */}
            {invoice.status === "issued" && !invoice.paid_at && (() => {
              const paymentLink = (invoice as unknown as { payment_link?: string | null }).payment_link;
              return (
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Paiement</p>
                    {canPayWithWave ? (
                      <>
                        <Button
                          onClick={handlePayWithWave}
                          disabled={isPayLoading}
                          className="w-full h-12 bg-success text-success-foreground hover:bg-success/90"
                        >
                          {isPayLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Ouverture de Wave…
                            </>
                          ) : (
                            <>
                              <CreditCard className="h-4 w-4 mr-2" />
                              Payer {formatCurrency(remainingDue)} avec Wave
                            </>
                          )}
                        </Button>
                        <p className="text-[11px] text-muted-foreground text-center">
                          Paiement sécurisé via Wave Mobile Money
                        </p>
                      </>
                    ) : paymentLink ? (
                      <Button
                        asChild
                        className="w-full h-12 bg-success text-success-foreground hover:bg-success/90"
                      >
                        <a href={paymentLink} target="_blank" rel="noopener noreferrer">
                          <CreditCard className="h-4 w-4 mr-2" />
                          Payer cette facture
                        </a>
                      </Button>
                    ) : (
                      <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/40 rounded-md p-3">
                        <Info className="h-4 w-4 mt-0.5 shrink-0" />
                        <p>Contactez votre gestionnaire pour le paiement</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            {/* Payment breakdown — DAM credit / Wave / remaining + receipts timeline */}
            <InvoicePaymentBreakdown invoice={invoice} />

            {/* Linked payment — same source of truth as admin Billing */}
            {linkedPayment?.payment && (
              <Card>
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Paiement</p>
                    <StatusBadge kind="payment" status={linkedPayment.payment.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Payé</p>
                      <p className="font-mono font-semibold">
                        {formatCurrency(linkedPayment.payment.amount_paid ?? 0)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Restant dû</p>
                      <p className="font-mono font-semibold">
                        {formatCurrency(
                          Math.max(
                            0,
                            (linkedPayment.payment.amount ?? 0) - (linkedPayment.payment.amount_paid ?? 0),
                          ),
                        )}
                      </p>
                    </div>
                  </div>
                  {linkedPayment.payment.paid_at && (
                    <p className="text-xs text-muted-foreground">
                      Dernier règlement le {formatDateShort(linkedPayment.payment.paid_at)}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-4 space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Émise le</p>
                    <p className="font-medium">
                      {invoice.issued_at ? formatDateShort(invoice.issued_at) : "—"}
                    </p>
                  </div>
                </div>
                {invoice.paid_at && (
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 mt-0.5 text-success" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Payée le</p>
                      <p className="font-medium">{formatDateShort(invoice.paid_at)}</p>
                    </div>
                  </div>
                )}
                {invoice.cancelled_at && (
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 mt-0.5 text-destructive" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Annulée le</p>
                      <p className="font-medium">{formatDateShort(invoice.cancelled_at)}</p>
                      {invoice.cancel_reason && (
                        <p className="text-xs text-muted-foreground mt-0.5">{invoice.cancel_reason}</p>
                      )}
                      {(invoice.amount_paid ?? 0) > 0 && (
                        <div className="mt-2 rounded-md bg-success/10 border border-success/30 p-2">
                          <p className="text-xs text-success font-medium">
                            Cette facture a été annulée. Les montants payés ({formatCurrency(invoice.amount_paid)}) ont été recrédités automatiquement sur votre portefeuille DAM.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {invoice.period_start && invoice.period_end && (
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Période</p>
                      <p className="font-medium">
                        {formatDateShort(invoice.period_start)} → {formatDateShort(invoice.period_end)}
                      </p>
                    </div>
                  </div>
                )}
                {invoice.driver_snapshot_name && (
                  <div className="flex items-start gap-2">
                    <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Conducteur</p>
                      <p className="font-medium">{invoice.driver_snapshot_name}</p>
                    </div>
                  </div>
                )}
                {invoice.driver_snapshot_phone && (
                  <div className="flex items-start gap-2">
                    <Phone className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Téléphone</p>
                      <p className="font-medium">{invoice.driver_snapshot_phone}</p>
                    </div>
                  </div>
                )}
                {linkedPayment?.rental && (linkedPayment.rental.vehicle_label || linkedPayment.rental.vehicle_plate) && (
                  <div className="flex items-start gap-2">
                    <Car className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Véhicule</p>
                      <p className="font-medium">
                        {linkedPayment.rental.vehicle_label || "—"}
                        {linkedPayment.rental.vehicle_plate ? ` (${linkedPayment.rental.vehicle_plate})` : ""}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Lines */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Lignes</p>
                <div className="border rounded-md divide-y">
                  {lines.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground text-center">Aucune ligne</p>
                  ) : (
                    lines.map((l) => (
                      <div key={l.id} className="flex justify-between gap-3 p-3 text-sm">
                        <div className="flex-1 min-w-0">
                          <p className="truncate">{l.designation}</p>
                          {l.quantity !== 1 && (
                            <p className="text-xs text-muted-foreground">
                              {l.quantity} × {formatCurrency(l.unit_price)}
                            </p>
                          )}
                        </div>
                        <span className="font-mono shrink-0">{formatCurrency(l.line_total_ttc)}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="space-y-1 pt-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Sous-total HT</span>
                    <span>{formatCurrency(invoice.subtotal_ht)}</span>
                  </div>
                  {invoice.vat_enabled_snapshot && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>TVA ({(invoice.vat_rate_snapshot ?? 0).toFixed(2)} %)</span>
                      <span>{formatCurrency(invoice.vat_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-base pt-1 border-t">
                    <span>Total TTC</span>
                    <span>{formatCurrency(invoice.total_ttc)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                className="flex-1 h-12"
                onClick={() => downloadInvoicePDF(invoice, lines)}
              >
                <Download className="h-4 w-4 mr-1" /> Télécharger PDF
              </Button>
              <Button
                className="flex-1 h-12"
                variant="outline"
                onClick={() => shareInvoicePDF(invoice, lines)}
              >
                <Share2 className="h-4 w-4 mr-1" /> Partager
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
