import { useMemo } from "react";
import { useDriverInvoices, useInvoiceLinkedPaymentsBatch } from "@/hooks/useBilling";
import { useDriverFullProfile } from "@/hooks/useDriverProfile";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/lib/statusBadges";
import { formatCurrency, formatDateShort } from "@/lib/format";
import { getInvoicePaidAmount, getInvoiceRemainingDue, isInvoicePayable } from "@/lib/financeAmounts";
import { FileText, ChevronLeft, ChevronRight, CreditCard, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useFinancialRealtime } from "@/hooks/useFinancialRealtime";
import { DriverLayout } from "@/components/DriverLayout";
import { KiraVoiceButton } from "@/components/driver/KiraVoiceButton";
import type { Invoice } from "@/types/billing";

export default function DriverFactures() {
  const navigate = useNavigate();
  const { data: driver } = useDriverFullProfile();
  const { data: invoices, isLoading } = useDriverInvoices(driver?.id);
  useFinancialRealtime({ scope: 'driver', driverId: driver?.id ?? null });

  // Include both the initial rental invoice and daily rental invoices so the
  // driver actually sees their billing history. Previously only `invoice_kind`
  // === "invoice" was shown, which hid every daily rental bill.
  const facts = invoices?.filter((i) => i.invoice_kind === "invoice" || i.invoice_kind === "daily_rental") ?? [];
  const stats = invoices?.filter((i) => i.invoice_kind === "monthly_statement") ?? [];

  const allIds = useMemo(() => (invoices ?? []).map((i) => i.id), [invoices]);
  const { data: linkedByInvoice } = useInvoiceLinkedPaymentsBatch(allIds);

  const getLinked = (inv: Invoice) => linkedByInvoice?.[inv.id] ?? null;
  const payableFacts = facts.filter((inv) => isInvoicePayable(inv, getLinked(inv)));
  const paidFacts = facts.filter((inv) => {
    const linked = getLinked(inv);
    if (isInvoicePayable(inv, linked)) return false;
    return inv.status === "paid" || !!inv.paid_at || linked?.status === "paid" || linked?.status === "overpaid";
  });
  const historyFacts = [...facts, ...stats];
  const totalPayable = payableFacts.reduce((sum, inv) => sum + getInvoiceRemainingDue(inv, getLinked(inv)), 0);
  const voiceSummary = totalPayable > 0
    ? `Vous avez ${payableFacts.length} facture a payer pour un reste total de ${formatCurrency(totalPayable)}.`
    : "Aucune facture a payer. Vos factures payees restent dans l'historique.";

  const renderList = (list: Invoice[], emptyLabel: string, mode: "payable" | "paid" | "history") =>
    isLoading ? (
      <p className="text-center py-12 text-muted-foreground">Chargement…</p>
    ) : list.length === 0 ? (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
        {emptyLabel}
      </div>
    ) : (
      <div className="space-y-2">
        {list.map((inv) => {
          const linked = getLinked(inv);
          const due = getInvoiceRemainingDue(inv, linked);
          const paid = getInvoicePaidAmount(inv, linked);
          const payable = isInvoicePayable(inv, linked);
          const isPartial = payable && paid > 0 && due > 0;
          // Prefer the payment status whenever a payment is linked — it reflects
          // partial / overpaid states that the invoice row alone cannot express,
          // mirroring what admins see in /admin/billing.
          const effectiveBadge = linked
            ? <StatusBadge kind="payment" status={linked.status} withTooltip={false} className="text-xs" />
            : <StatusBadge kind="invoice" status={inv.status} withTooltip={false} className="text-xs" />;
          const showPartial = isPartial || (linked && (linked.status === "partial" || linked.status === "overpaid"));
          const needsPayment = payable;
          const amountLabel =
            mode === "payable"
              ? "Reste à payer"
              : inv.status === "paid" || linked?.status === "paid" || linked?.status === "overpaid"
              ? "Payé"
              : due > 0
              ? "Reste"
              : "Montant";
          const amountValue = mode === "payable" || due > 0
            ? due
            : Math.max(paid, Number(inv.total_ttc ?? 0));
          return (
            <Card
              key={inv.id}
              className="cursor-pointer hover:bg-accent/40 transition-colors"
              onClick={() => navigate(`/driver/factures/${inv.id}`)}
              role="link"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/driver/factures/${inv.id}`);
                }
              }}
            >
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-semibold truncate">
                    {inv.invoice_number || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateShort(inv.issued_at || inv.created_at)}
                  </p>
                  {needsPayment && (
                    <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full bg-success/15 text-success text-[11px] font-semibold">
                      <CreditCard className="h-3 w-3" />
                      Payer
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">{amountLabel}</p>
                    <p className="font-bold">{formatCurrency(amountValue)}</p>
                    {showPartial && (
                      <p className="text-[10px] text-muted-foreground font-mono">
                        Payé {formatCurrency(paid)} / {formatCurrency(inv.total_ttc)}
                      </p>
                    )}
                    {effectiveBadge}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );

  return (
    <DriverLayout hideHeader className="bg-background">
    <div className="min-h-full bg-background pb-8">
      <header className="sticky top-0 z-10 bg-primary text-primary-foreground p-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="text-primary-foreground hover:bg-primary-foreground/10"
          onClick={() => navigate('/driver/finance')}
          aria-label="Retour"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold">Mes factures</h1>
          <p className="text-xs opacity-80">À payer, payées et historique</p>
        </div>
        <div className="ml-auto">
          <KiraVoiceButton
            text={voiceSummary}
            label="Aide"
            compact
            className="border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
          />
        </div>
      </header>

      <main className="p-4">
        <Card
          className="mb-4 cursor-pointer hover:bg-accent/40 transition-colors border-warning/40 bg-warning/5"
          onClick={() => navigate('/driver/contraventions')}
          role="link"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate('/driver/contraventions');
            }
          }}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Mes contraventions</div>
              <div className="text-xs text-muted-foreground">Amendes et PV enregistrés</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
        <Tabs defaultValue="payable">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="payable">À payer</TabsTrigger>
            <TabsTrigger value="paid">Payées</TabsTrigger>
            <TabsTrigger value="history">Historique</TabsTrigger>
          </TabsList>
          <TabsContent value="payable" className="mt-4">
            {renderList(payableFacts, "Aucune facture à payer", "payable")}
          </TabsContent>
          <TabsContent value="paid" className="mt-4">
            {renderList(paidFacts, "Aucune facture payée", "paid")}
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            {renderList(historyFacts, "Aucun historique disponible", "history")}
          </TabsContent>
        </Tabs>
      </main>
    </div>
    </DriverLayout>
  );
}
