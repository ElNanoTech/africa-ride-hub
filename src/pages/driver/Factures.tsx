import { useMemo } from "react";
import { useDriverInvoices, useInvoiceLinkedPaymentsBatch } from "@/hooks/useBilling";
import { useDriverFullProfile } from "@/hooks/useDriverProfile";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/lib/statusBadges";
import { formatCurrency, formatDateShort } from "@/lib/format";
import { FileText, ChevronLeft, ChevronRight, CreditCard } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useFinancialRealtime } from "@/hooks/useFinancialRealtime";

export default function DriverFactures() {
  const navigate = useNavigate();
  const { data: driver } = useDriverFullProfile();
  const { data: invoices, isLoading } = useDriverInvoices(driver?.id);
  useFinancialRealtime({ scope: 'driver', driverId: driver?.id ?? null });

  const facts = invoices?.filter((i) => i.invoice_kind === "invoice") ?? [];
  const stats = invoices?.filter((i) => i.invoice_kind === "monthly_statement") ?? [];

  const allIds = useMemo(() => (invoices ?? []).map((i) => i.id), [invoices]);
  const { data: linkedByInvoice } = useInvoiceLinkedPaymentsBatch(allIds);

  const renderList = (list: typeof facts, emptyLabel: string) =>
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
          const linked = linkedByInvoice?.[inv.id];
          // Prefer the payment status whenever a payment is linked — it reflects
          // partial / overpaid states that the invoice row alone cannot express,
          // mirroring what admins see in /admin/billing.
          const effectiveBadge = linked
            ? <StatusBadge kind="payment" status={linked.status} withTooltip={false} className="text-xs" />
            : <StatusBadge kind="invoice" status={inv.status} withTooltip={false} className="text-xs" />;
          const showPartial = linked && (linked.status === "partial" || linked.status === "overpaid");
          const needsPayment =
            inv.status === "issued" &&
            !inv.paid_at &&
            (!linked || (linked.status !== "paid" && linked.status !== "overpaid"));
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
                    <p className="font-bold">{formatCurrency(inv.total_ttc)}</p>
                    {showPartial && (
                      <p className="text-[10px] text-muted-foreground font-mono">
                        Payé {formatCurrency(linked!.amount_paid)} / {formatCurrency(linked!.amount)}
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
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 bg-primary text-primary-foreground p-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="text-primary-foreground hover:bg-primary-foreground/10"
          onClick={() => navigate('/driver/settings')}
          aria-label="Retour"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-lg font-bold">Mes factures</h1>
          <p className="text-xs opacity-80">Factures et relevés mensuels</p>
        </div>
      </header>

      <main className="p-4">
        <Tabs defaultValue="invoices">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="invoices">Factures</TabsTrigger>
            <TabsTrigger value="statements">Relevés</TabsTrigger>
          </TabsList>
          <TabsContent value="invoices" className="mt-4">
            {renderList(facts, "Aucune facture pour le moment")}
          </TabsContent>
          <TabsContent value="statements" className="mt-4">
            {renderList(stats, "Aucun relevé mensuel")}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
