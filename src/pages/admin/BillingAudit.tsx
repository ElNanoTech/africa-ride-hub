import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout, AdminPageHeader } from "@/components/AdminLayout";
import { AdminBreadcrumb } from "@/components/AdminBreadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRangePicker } from "@/components/DateRangePicker";
import { supabase } from "@/integrations/supabase/routeClient";
import { useAdminUser } from "@/hooks/useAdminUser";
import { formatDateShort } from "@/lib/format";
import { Download, Eye, FileSearch, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import type { DateRange } from "react-day-picker";
import type { Invoice } from "@/types/billing";

interface AuditRow {
  id: string;
  invoice_id: string;
  customer_id: string | null;
  action: string;
  actor_type: string;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  invoice?: Pick<Invoice, "invoice_number" | "status" | "driver_snapshot_name"> | null;
}

import { StatusLegend } from "@/components/StatusLegend";
import { StatusBadge, getStatusMeta } from "@/lib/statusBadges";

const ACTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Toutes les actions" },
  ...(["created", "issued", "paid", "cancelled", "regenerated_link", "viewed_public", "statement_generated", "auto_generated"] as const).map(
    (v) => ({ value: v, label: getStatusMeta("audit_action", v).label }),
  ),
];

const actionBadge = (a: string) => <StatusBadge kind="audit_action" status={a} />;

export default function BillingAudit() {
  const navigate = useNavigate();
  const { customerId, isPlatformOwner, isLoading: userLoading } = useAdminUser();

  const [actionFilter, setActionFilter] = useState<string>("all");
  const [invoiceQuery, setInvoiceQuery] = useState<string>("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  const queryKey = useMemo(
    () => [
      "billing-audit",
      customerId ?? "global",
      actionFilter,
      invoiceQuery.trim().toLowerCase(),
      dateRange?.from?.toISOString() ?? null,
      dateRange?.to?.toISOString() ?? null,
    ],
    [customerId, actionFilter, invoiceQuery, dateRange],
  );

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey,
    enabled: !userLoading && (isPlatformOwner || !!customerId),
    queryFn: async (): Promise<AuditRow[]> => {
      let q = supabase
        .from("invoice_audit")
        .select("id, invoice_id, customer_id, action, actor_type, actor_id, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(500);

      if (customerId) q = q.eq("customer_id", customerId);
      if (actionFilter !== "all") q = q.eq("action", actionFilter);
      if (dateRange?.from) q = q.gte("created_at", dateRange.from.toISOString());
      if (dateRange?.to) {
        const end = new Date(dateRange.to);
        end.setHours(23, 59, 59, 999);
        q = q.lte("created_at", end.toISOString());
      }

      const { data: rows, error } = await q;
      if (error) throw error;
      const audit = (rows ?? []) as AuditRow[];

      // Hydrate invoice metadata for display
      const ids = Array.from(new Set(audit.map((r) => r.invoice_id))).filter(Boolean);
      if (ids.length === 0) return audit;
      const { data: invs } = await supabase
        .from("invoice")
        .select("id, invoice_number, status, driver_snapshot_name")
        .in("id", ids);
      const map = new Map((invs ?? []).map((i) => [i.id, i]));

      let result = audit.map((r) => ({
        ...r,
        invoice: (map.get(r.invoice_id) as AuditRow["invoice"]) ?? null,
      }));

      // Free-text invoice filter (number or driver name)
      const needle = invoiceQuery.trim().toLowerCase();
      if (needle) {
        result = result.filter((r) => {
          const num = r.invoice?.invoice_number?.toLowerCase() ?? "";
          const drv = r.invoice?.driver_snapshot_name?.toLowerCase() ?? "";
          return num.includes(needle) || drv.includes(needle) || r.invoice_id.toLowerCase().includes(needle);
        });
      }
      return result;
    },
  });

  const rows = data ?? [];

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.info("Aucune entrée à exporter");
      return;
    }
    const headers = ["Date", "Action", "Acteur", "Facture", "Conducteur", "Statut facture", "Invoice ID", "Métadonnées"];
    const lines = rows.map((r) => [
      new Date(r.created_at).toISOString(),
      r.action,
      r.actor_type,
      r.invoice?.invoice_number ?? "",
      r.invoice?.driver_snapshot_name ?? "",
      r.invoice?.status ?? "",
      r.invoice_id,
      JSON.stringify(r.metadata ?? {}),
    ]);
    const csv = [headers, ...lines]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `billing-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export CSV téléchargé");
  };

  const resetFilters = () => {
    setActionFilter("all");
    setInvoiceQuery("");
    setDateRange(undefined);
  };

  return (
    <AdminLayout>
      <AdminBreadcrumb
        items={[
          { label: "Facturation", href: "/admin/billing" },
          { label: "Historique d'audit" },
        ]}
      />
      <AdminPageHeader
        title="Historique d'audit des factures"
        description="Suivi de toutes les actions sur les factures (émission, annulation, régénération, consultations)."
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1" />Exporter CSV
            </Button>
          </div>
        }
      />

      <StatusLegend kind="audit_action" title="Légende des actions d'audit" />

      <Card className="mt-4">
        <CardContent className="p-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Action</Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Facture (n°, conducteur ou ID)</Label>
              <Input
                placeholder="Ex. FAC-2026-001 ou Jean Kouassi"
                value={invoiceQuery}
                onChange={(e) => setInvoiceQuery(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Plage de dates</Label>
              <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} className="w-full" />
            </div>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{rows.length} entrée{rows.length > 1 ? "s" : ""} {isFetching && "· chargement…"}</span>
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="h-4 w-4 mr-1" />Réinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Chargement de l'historique…</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
              <FileSearch className="h-10 w-10 opacity-50" />
              <p>Aucune entrée d'audit pour ces filtres.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Facture</TableHead>
                  <TableHead>Conducteur</TableHead>
                  <TableHead>Acteur</TableHead>
                  <TableHead>Détails</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const meta = r.metadata && Object.keys(r.metadata).length > 0
                    ? JSON.stringify(r.metadata)
                    : "—";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDateShort(r.created_at)}
                        <div className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </TableCell>
                      <TableCell>{actionBadge(r.action)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.invoice?.invoice_number ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.invoice?.driver_snapshot_name ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline">{r.actor_type}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={meta}>
                        {meta}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`/admin/billing?invoice=${r.invoice_id}`)}
                          title="Ouvrir la facture"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
