import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AdminLayout, AdminPageHeader } from "@/components/AdminLayout";
import { AdminBreadcrumb } from "@/components/AdminBreadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useAdminInvoices,
  useCancelInvoice,
  useRegenerateInvoiceLink,
  useInvoiceWithLines,
  useBillingSettings,
  useUpdateBillingSettings,
  useInvoiceLineCounts,
  useGenerateInvoice,
  useUpdateInvoiceTags,
  useUpdateInvoiceContent,
  useInvoiceLinkedPayment,
  useInvoiceLinkedPaymentsBatch,
  useBillingCronRuns,
  useActiveRentalsForDriver,
  usePaymentReceipts,
  useVoidPaymentReceipt,
  fetchInvoiceLinesCached,
  resolveRentalAttachment,
  validateInvoiceLines,
  type InvoiceAuditEntry,
  type BillingCronRun,
} from "@/hooks/useBilling";
// Tariff edits live exclusively in src/pages/admin/Rentals.tsx (single source of truth).
import { useAdminUser } from "@/hooks/useAdminUser";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDateShort } from "@/lib/format";
import { Download, Eye, XCircle, RefreshCw, Link2, Settings as SettingsIcon, Plus, Trash2, History, FileText, Image as ImageIcon, Building2, Zap, CheckCircle2, AlertCircle, AlertTriangle, Loader2, PlayCircle, Pencil, ExternalLink, CreditCard } from "lucide-react";
import { InvoicePaymentBreakdown } from "@/components/InvoicePaymentBreakdown";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusLegend } from "@/components/StatusLegend";
import { StatusBadge, getStatusMeta } from "@/lib/statusBadges";
import { downloadInvoicePDF } from "@/lib/invoicePdf";
import { shareableInvoiceUrl, type Invoice } from "@/types/billing";
import { InvoiceTagPicker } from "@/components/admin/InvoiceTagPicker";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/routeClient";
import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/ErrorState";
import { logDiagnostic } from "@/lib/diagnostics";

const statusBadge = (s: string) => <StatusBadge kind="invoice" status={s} />;

const auditLabel = (a: string) => getStatusMeta("audit_action", a).label;

const actorLabel = (t: string) => {
  switch (t) {
    case "admin": return "Admin";
    case "system": return "Système";
    case "cron": return "Tâche planifiée";
    case "public": return "Visiteur (lien public)";
    case "driver": return "Conducteur";
    default: return t;
  }
};

const metaFieldLabel = (k: string) => {
  switch (k) {
    case "status": return "Statut";
    case "reason": return "Motif";
    case "cancel_reason": return "Motif d'annulation";
    case "amount": return "Montant";
    case "payment_id": return "Paiement";
    case "invoice_number": return "N° facture";
    case "previous_status": return "Ancien statut";
    case "ip": return "IP";
    case "user_agent": return "Navigateur";
    default: return k;
  }
};

const metaValueLabel = (k: string, v: unknown): string => {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  if ((k === "status" || k === "previous_status") && typeof v === "string") {
    return auditLabel(v);
  }
  return String(v);
};

const formatAuditMetadata = (meta: Record<string, unknown> | null | undefined): string => {
  if (!meta || typeof meta !== "object") return "";
  const entries = Object.entries(meta).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${metaFieldLabel(k)} : ${metaValueLabel(k, v)}`).join(" • ");
};

interface DraftLine { designation: string; quantity: number; unit_price: number; }

import { useFinancialRealtime } from "@/hooks/useFinancialRealtime";

export default function AdminBilling() {
  const { adminUser, isLoading: adminLoading, isResolving: adminResolving, isError: adminError, refetch: refetchAdmin, isPlatformOwner, customerId, customers, activeCustomerId, setActiveCustomerId } = useAdminUser();
  useFinancialRealtime({ scope: 'admin' });
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = location.pathname.endsWith("/settings")
    ? "settings"
    : location.pathname.endsWith("/unresolved")
      ? "unresolved"
      : "invoices";
  const qc = useQueryClient();
  const cronRuns = useBillingCronRuns();
  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    qc.invalidateQueries({ queryKey: ["billing-settings", customerId] });
    qc.invalidateQueries({ queryKey: ["billing-cron-runs"] });
    toast.success("Données rafraîchies");
  };
  const handleCustomerChange = (id: string) => {
    setActiveCustomerId(id);
    // Force-refetch tenant-scoped queries (queryKey already changes, but be explicit)
    qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    qc.invalidateQueries({ queryKey: ["billing-settings"] });
    qc.invalidateQueries({ queryKey: ["billing-driver-picker"] });
  };
  const [statusFilter, setStatusFilter] = useState("all");
  const [logoUploading, setLogoUploading] = useState(false);
  const [kindFilter, setKindFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const { data: invoicesRaw, isLoading } = useAdminInvoices({ status: statusFilter, kind: kindFilter, customer_id: customerId ?? undefined });
  const invoices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return invoicesRaw;
    return (invoicesRaw ?? []).filter((inv) => {
      const number = (inv.invoice_number ?? "").toLowerCase();
      const driver = (inv.driver_snapshot_name ?? "").toLowerCase();
      const total = String(inv.total_ttc ?? "");
      return number.includes(q) || driver.includes(q) || total.includes(q);
    });
  }, [invoicesRaw, searchQuery]);
  const { data: settings } = useBillingSettings(customerId);
  const updateSettings = useUpdateBillingSettings();

  // Realtime: refresh invoice list when payments change (covers new daily_rental invoices,
  // since each one creates a linked payment row). `payments` is already in the supabase_realtime publication.
  useEffect(() => {
    const channel = supabase
      .channel("admin-billing-payments")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-invoices"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const invoiceIds = useMemo(() => (invoices ?? []).map((i) => i.id), [invoices]);
  const { data: lineCounts } = useInvoiceLineCounts(invoiceIds);
  const { data: linkedPayments } = useInvoiceLinkedPaymentsBatch(invoiceIds);

  // "À résoudre" tab — invoices missing an invoice_payment_link row.
  // Auto-apply of wallet credit only targets invoices with a linked payment
  // shell, so admins need visibility on bare invoices that would otherwise
  // appear "stuck" as unpaid even when the driver has credit.
  const unresolvedQuery = useQuery({
    queryKey: ["admin-invoices-unresolved", customerId ?? "all"],
    enabled: activeTab === "unresolved",
    refetchInterval: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("invoice")
        .select("id, invoice_number, driver_id, driver_snapshot_name, invoice_kind, status, total_ttc, remaining_due, amount_paid, issued_at, created_at")
        .in("status", ["issued", "partial"])
        .order("issued_at", { ascending: false, nullsFirst: false })
        .limit(500);
      if (customerId) q = q.eq("customer_id", customerId);
      const { data: invs, error: invErr } = await q;
      if (invErr) throw invErr;
      const ids = (invs ?? []).map((i) => i.id);
      if (ids.length === 0) return [];
      const { data: links, error: linkErr } = await supabase
        .from("invoice_payment_link")
        .select("invoice_id")
        .in("invoice_id", ids);
      if (linkErr) throw linkErr;
      const linkedSet = new Set((links ?? []).map((l) => l.invoice_id));
      return (invs ?? []).filter((i) => !linkedSet.has(i.id));
    },
  });
  const unresolvedInvoices = unresolvedQuery.data ?? [];

  // Wallet settlement anomalies — wallet was debited for an invoice but the
  // matching payment_receipt was never written (pre-fix bug) and no compensating
  // refund/regularisation credit exists. Backed by v_wallet_settlement_anomalies.
  const anomaliesQuery = useQuery({
    queryKey: ["admin-wallet-settlement-anomalies", customerId ?? "all"],
    enabled: activeTab === "unresolved",
    refetchInterval: 30_000,
    queryFn: async () => {
      let q: any = (supabase as any)
        .from("v_wallet_settlement_anomalies")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (customerId) q = q.eq("customer_id", customerId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Array<{
        wallet_txn_id: string;
        driver_id: string;
        customer_id: string | null;
        invoice_id: string;
        payment_id: string | null;
        debited_amount: number;
        created_at: string;
        invoice_number: string | null;
        invoice_status: string | null;
        invoice_amount_paid: number | null;
        invoice_total: number | null;
        severity: string;
        message: string;
        recommended_action: string;
      }>;
    },
  });
  const anomalies = anomaliesQuery.data ?? [];

  const anomalyDriverIds = useMemo(
    () => Array.from(new Set(anomalies.map((a) => a.driver_id))),
    [anomalies],
  );
  const anomalyDriversQuery = useQuery({
    queryKey: ["admin-anomaly-drivers", anomalyDriverIds.join(",")],
    enabled: anomalyDriverIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("id, full_name, phone_number")
        .in("id", anomalyDriverIds);
      if (error) throw error;
      const map = new Map<string, { full_name: string; phone: string | null }>();
      for (const d of data ?? []) map.set(d.id, { full_name: d.full_name, phone: d.phone_number });
      return map;
    },
  });
  const anomalyDrivers = anomalyDriversQuery.data;

  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelTags, setCancelTags] = useState<string[]>([]);
  const [issueOpen, setIssueOpen] = useState(false);
  const { data: detail } = useInvoiceWithLines(detailId);
  const { data: linkedPayment, isLoading: linkedLoading } = useInvoiceLinkedPayment(detailId);
  const cancelInv = useCancelInvoice();
  const regen = useRegenerateInvoiceLink();
  const generate = useGenerateInvoice();
  const updateTags = useUpdateInvoiceTags();
  const updateContent = useUpdateInvoiceContent();

  // Edit-mode for the issue dialog (null = create a new invoice)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const isEditMode = !!editingInvoice;
  // Tariff editing has been consolidated to the Locations module to avoid duplicate
  // sources of truth. Facturation now only links over to it (read-only here).

  // Per-row PDF download state (using cached invoice_lines fetcher)
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const handleDownloadPdf = async (inv: Invoice) => {
    setDownloadingId(inv.id);
    try {
      const lines = await fetchInvoiceLinesCached(qc, inv.id);
      await downloadInvoicePDF(inv, lines);
    } catch (e) {
      toast.error("Échec du téléchargement", { description: (e as Error).message });
    } finally {
      setDownloadingId(null);
    }
  };

  // Issue dialog state
  const [issueDriverId, setIssueDriverId] = useState<string>("");
  const [issueRentalId, setIssueRentalId] = useState<string>("");
  const [issueNotes, setIssueNotes] = useState("");
  const [issueTags, setIssueTags] = useState<string[]>([]);
  const [draftLines, setDraftLines] = useState<DraftLine[]>([{ designation: "", quantity: 1, unit_price: 0 }]);

  const driversQuery = useQuery({
    queryKey: ["billing-driver-picker", customerId],
    enabled: issueOpen,
    queryFn: async () => {
      let q = supabase.from("drivers").select("id, full_name, phone_number").order("full_name").limit(200);
      if (customerId) q = q.eq("customer_id", customerId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const activeRentalsQuery = useActiveRentalsForDriver(issueDriverId || null);
  const activeRentals = activeRentalsQuery.data ?? [];
  // Shared attachment rule (useBilling) — same logic as CreateInvoiceDialog.
  const { needsRentalChoice, effectiveRentalId } = resolveRentalAttachment(activeRentals, issueRentalId);
  // While the rentals are loading (or failed) the needsRentalChoice guard
  // would run against an empty list — issuing must stay blocked.
  const rentalsNotReady = !!issueDriverId && (activeRentalsQuery.isLoading || activeRentalsQuery.isError);

  const draftTotal = draftLines.reduce((sum, l) => sum + (Number(l.unit_price) || 0) * (Number(l.quantity) || 0), 0);

  const resetDraft = () => {
    setIssueDriverId("");
    setIssueRentalId("");
    setIssueNotes("");
    setIssueTags([]);
    setDraftLines([{ designation: "", quantity: 1, unit_price: 0 }]);
    setEditingInvoice(null);
  };

  const openEditInvoice = async (inv: Invoice) => {
    try {
      const lines = await fetchInvoiceLinesCached(qc, inv.id);
      setEditingInvoice(inv);
      setIssueDriverId(inv.driver_id);
      setIssueRentalId(inv.rental_id ?? "");
      setIssueNotes(inv.notes ?? "");
      setIssueTags(inv.tags ?? []);
      setDraftLines(
        lines.length > 0
          ? lines.map((l) => ({ designation: l.designation, quantity: l.quantity, unit_price: l.unit_price }))
          : [{ designation: "", quantity: 1, unit_price: 0 }],
      );
      setIssueOpen(true);
    } catch (e) {
      toast.error("Impossible de charger la facture : " + (e as Error).message);
    }
  };

  const handleIssue = async () => {
    // Shared line validation (useBilling) — same rules as CreateInvoiceDialog.
    const validated = validateInvoiceLines(draftLines);
    if (validated.error || !validated.lines) { toast.error(validated.error ?? "Lignes invalides"); return; }
    const cleanLines = validated.lines;

    if (isEditMode && editingInvoice) {
      try {
        await updateContent.mutateAsync({
          invoice_id: editingInvoice.id,
          notes: issueNotes || null,
          lines: cleanLines.map((l) => ({ designation: l.designation, quantity: l.quantity, unit_price: l.unit_price })),
        });
        // Tags are saved via a separate mutation (same as detail dialog)
        if (JSON.stringify((editingInvoice.tags ?? []).slice().sort()) !== JSON.stringify(issueTags.slice().sort())) {
          await updateTags.mutateAsync({ invoice_id: editingInvoice.id, tags: issueTags });
        }
        setIssueOpen(false);
        resetDraft();
      } catch { /* toast already shown by hook */ }
      return;
    }

    if (!customerId) { toast.error("Aucun customer_id assigné"); return; }
    if (!issueDriverId) { toast.error("Sélectionnez un conducteur"); return; }
    if (rentalsNotReady) { toast.error("Locations en cours de chargement — réessayez"); return; }
    if (needsRentalChoice && !issueRentalId) { toast.error("Sélectionnez la location à rattacher"); return; }
    try {
      await generate.mutateAsync({
        driver_id: issueDriverId,
        customer_id: customerId,
        rental_id: effectiveRentalId,
        notes: issueNotes || undefined,
        tags: issueTags.length > 0 ? issueTags : undefined,
        lines: cleanLines,
      });
      setIssueOpen(false);
      resetDraft();
    } catch { /* toast already shown by hook */ }
  };

  const handleLogoUpload = async (file: File) => {
    if (!customerId) { toast.error("Sélectionnez d'abord un client"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Logo trop lourd (max 2 Mo)"); return; }
    setLogoUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${customerId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("billing-logos").upload(path, file, { cacheControl: "3600", upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("billing-logos").getPublicUrl(path);
      await updateSettings.mutateAsync({ customer_id: customerId, legal_logo_url: pub.publicUrl });
    } catch (e) {
      toast.error("Échec upload : " + (e as Error).message);
    } finally {
      setLogoUploading(false);
    }
  };

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: "Facturation" }]} />
      <AdminPageHeader
        title="Module Facturation"
        description="Factures et relevés mensuels des conducteurs"
        action={
          <Button onClick={() => setIssueOpen(true)} size="sm" disabled={!customerId}>
            <Plus className="h-4 w-4 mr-1" />Émettre une facture
          </Button>
        }
      />

      {/* Platform Owner customer scope picker */}
      {isPlatformOwner && (
        <Card className="mt-4">
          <CardContent className="pt-4 flex flex-wrap items-center gap-3">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm">Client actif :</Label>
            <Select value={activeCustomerId ?? ""} onValueChange={handleCustomerChange}>
              <SelectTrigger className="w-72"><SelectValue placeholder="Sélectionner un client" /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name} ({c.slug})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!customerId && <span className="text-xs text-muted-foreground">Aucun client sélectionné</span>}
            <Button variant="outline" size="sm" onClick={refreshAll} className="ml-auto">
              <RefreshCw className="h-4 w-4 mr-1" />Rafraîchir
            </Button>
          </CardContent>
        </Card>
      )}

      {/*
        Gating logic — applies uniformly to every admin role/group:
        1. While auth is hydrating, the user query is fetching/retrying, OR (for
           platform owners) the customers list is still loading → show loader.
        2. If the user query errored, show retry instead of the false "no
           customer" error.
        3. Only show the real "no customer" error when we're 100% sure the
           profile loaded successfully AND a restricted admin truly has no
           customer_id assigned.
      */}
      {!isPlatformOwner && !customerId && adminResolving && !adminError && (
        <Card className="mt-4">
          <CardContent className="pt-4 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement de votre compte…
          </CardContent>
        </Card>
      )}
      {adminError && (
        <Card className="mt-4">
          <CardContent className="pt-6">
            <ErrorState
              variant="inline"
              title="Profil indisponible"
              message="Impossible de charger votre profil administrateur. Cela peut être dû à une perte de connexion ou à un problème temporaire. Vos données ne sont pas perdues — réessayez ci-dessous."
              onRetry={() => {
                logDiagnostic("billing_recovery_retry", {
                  reason: "admin_user_query_error",
                });
                refetchAdmin();
              }}
            />
          </CardContent>
        </Card>
      )}
      {!isPlatformOwner && !customerId && !adminResolving && !adminError && adminUser && (
        <Card className="mt-4 border-destructive">
          <CardContent className="pt-4 text-sm text-destructive flex items-center justify-between gap-3">
            <span>
              Votre compte n'est rattaché à aucun client. Contactez un super-administrateur.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                logDiagnostic("billing_profile_unavailable", {
                  adminUserId: adminUser.id,
                  reason: "no_customer_id",
                });
                refetchAdmin();
              }}
            >
              <RefreshCw className="h-4 w-4 mr-1" />Réessayer
            </Button>
          </CardContent>
        </Card>
      )}
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          if (v === "settings") navigate("/admin/billing/settings");
          else if (v === "unresolved") navigate("/admin/billing/unresolved");
          else navigate("/admin/billing");
        }}
        className="mt-4"
      >
        <TabsList>
          <TabsTrigger value="invoices">Factures</TabsTrigger>
          <TabsTrigger value="unresolved">
            <AlertTriangle className="h-4 w-4 mr-1" />
            À résoudre
            {(unresolvedInvoices.length + anomalies.length) > 0 && (
              <Badge variant="destructive" className="ml-1.5 h-5 px-1.5 text-[10px]">{unresolvedInvoices.length + anomalies.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings"><SettingsIcon className="h-4 w-4 mr-1" />Paramètres</TabsTrigger>
          <TabsTrigger value="audit" onClick={(e) => { e.preventDefault(); navigate("/admin/billing/audit"); }}>
            <History className="h-4 w-4 mr-1" />Historique d'audit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-4">
          <StatusLegend kind={["invoice", "payment"]} />
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                <Input
                  type="search"
                  placeholder="Rechercher (conducteur, n° facture, montant)…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-80"
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous statuts</SelectItem>
                    <SelectItem value="issued">Émises</SelectItem>
                    <SelectItem value="paid">Payées</SelectItem>
                    <SelectItem value="cancelled">Annulées</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={kindFilter} onValueChange={setKindFilter}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous types</SelectItem>
                    <SelectItem value="invoice">Factures</SelectItem>
                    <SelectItem value="daily_rental">Locations journalières</SelectItem>
                    <SelectItem value="monthly_statement">Relevés mensuels</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numéro</TableHead>
                    <TableHead>Conducteur</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Émise le</TableHead>
                    <TableHead className="text-center">Lignes</TableHead>
                    <TableHead className="text-right">Total TTC</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Paiement lié</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Chargement…</TableCell></TableRow>
                  ) : !invoices?.length ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Aucune facture</TableCell></TableRow>
                  ) : invoices.map((inv) => {
                    const lp = linkedPayments?.[inv.id];
                    return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs">{inv.invoice_number || "—"}</TableCell>
                      <TableCell>{inv.driver_snapshot_name || "—"}</TableCell>
                      <TableCell>{inv.invoice_kind === "monthly_statement" ? "Relevé" : inv.invoice_kind === "daily_rental" ? "Journalier" : "Facture"}</TableCell>
                      <TableCell>{formatDateShort(inv.issued_at || inv.created_at)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="font-mono">{lineCounts?.[inv.id] ?? "…"}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(inv.total_ttc)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          {statusBadge(inv.status)}
                          {inv.status === "partial" && (
                            <span className="text-[10px] text-muted-foreground">
                              Reste : {formatCurrency(inv.remaining_due ?? Math.max((inv.total_ttc ?? 0) - (inv.amount_paid ?? 0), 0))}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {inv.tags && inv.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {inv.tags.map((t) => (
                              <Badge key={t} variant="outline" className="text-[10px] font-normal">{t}</Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {lp ? (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs">
                                {lp.status === "overpaid" && lp.amount_paid > lp.amount
                                  ? `${formatCurrency(lp.amount)} / ${formatCurrency(lp.amount_paid)}`
                                  : formatCurrency(lp.amount)}
                              </span>
                              <StatusBadge kind="payment" status={lp.status} />
                            </div>
                            {lp.status === "overpaid" && lp.amount_paid > lp.amount && (
                              <span className="text-[10px] text-muted-foreground">
                                Surplus +{formatCurrency(lp.amount_paid - lp.amount)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <TooltipProvider delayDuration={200}>
                          <div className="flex items-center justify-end gap-0.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Voir le détail de la facture" onClick={() => setDetailId(inv.id)}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Voir le détail</TooltipContent>
                            </Tooltip>
                            {(inv.status === "draft" || inv.status === "issued") && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Modifier la facture" onClick={() => openEditInvoice(inv)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Modifier la facture</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label="Télécharger le PDF"
                                  disabled={downloadingId === inv.id}
                                  onClick={() => handleDownloadPdf(inv)}
                                >
                                  {downloadingId === inv.id
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <Download className="h-4 w-4" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Télécharger le PDF</TooltipContent>
                            </Tooltip>
                            {inv.status !== "cancelled" && inv.public_token && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Copier le lien public" onClick={() => {
                                    navigator.clipboard.writeText(shareableInvoiceUrl(inv.public_token!));
                                    toast.success("Lien public copié");
                                  }}>
                                    <Link2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Copier le lien public</TooltipContent>
                              </Tooltip>
                            )}
                            {inv.rental_id && inv.status !== "cancelled" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Gérer le tarif dans le module Locations" onClick={() => navigate(`/admin/rentals?id=${inv.rental_id}`)}>
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Tarif géré dans Locations →</TooltipContent>
                              </Tooltip>
                            )}
                            {lp && inv.status !== "cancelled" && (lp.status === "pending" || lp.status === "overdue" || lp.status === "partial") && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" aria-label="Enregistrer un paiement" onClick={() => navigate(`/admin/payments?payment_id=${lp.payment_id}`)}>
                                    <CreditCard className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Enregistrer un paiement</TooltipContent>
                              </Tooltip>
                            )}
                            {inv.status !== "cancelled" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label="Annuler la facture" onClick={() => { setDetailId(inv.id); setCancelTags(inv.tags ?? []); setCancelOpen(true); }}>
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Annuler la facture</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unresolved" className="mt-4">
          {/* Wallet settlement anomalies — CRITICAL reconciliation issues */}
          {anomalies.length > 0 && (
            <Card className="mb-4 border-destructive/40">
              <CardContent className="pt-4">
                <Alert variant="destructive" className="mb-3">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Anomalies de rapprochement portefeuille — CRITIQUE</AlertTitle>
                  <AlertDescription>
                    Un débit portefeuille a été enregistré pour une facture mais aucun reçu de paiement n'a été écrit. La facture reste impayée alors que le crédit du conducteur a disparu. Réparation manuelle requise — ne pas auto-corriger depuis l'UI tant que la fonction de réparation n'est pas validée idempotente.
                  </AlertDescription>
                </Alert>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sévérité</TableHead>
                      <TableHead>Conducteur</TableHead>
                      <TableHead>Facture</TableHead>
                      <TableHead className="text-right">Montant débité</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Problème</TableHead>
                      <TableHead className="text-right">Action recommandée</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {anomalies.map((a) => {
                      const driver = anomalyDrivers?.get(a.driver_id);
                      return (
                        <TableRow key={a.wallet_txn_id}>
                          <TableCell>
                            <Badge variant="destructive">{a.severity}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{driver?.full_name ?? a.driver_id.slice(0, 8) + "…"}</div>
                            {driver?.phone && <div className="text-xs text-muted-foreground">{driver.phone}</div>}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{a.invoice_number ?? "—"}</TableCell>
                          <TableCell className="text-right font-semibold text-destructive">
                            {formatCurrency(a.debited_amount)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateShort(a.created_at)}
                          </TableCell>
                          <TableCell className="text-xs max-w-[260px]">{a.message}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-xs text-muted-foreground italic">
                                {a.recommended_action}
                              </span>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setDetailId(a.invoice_id)}
                                >
                                  <Eye className="h-3.5 w-3.5 mr-1" />
                                  Facture
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => navigate(`/admin/drivers/${a.driver_id}`)}
                                >
                                  <CreditCard className="h-3.5 w-3.5 mr-1" />
                                  Portefeuille
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}


          <Alert className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Factures sans paiement lié</AlertTitle>
            <AlertDescription>
              Ces factures n'ont pas de paiement associé. Le crédit portefeuille du conducteur
              <strong> ne peut pas être appliqué automatiquement</strong> tant qu'un paiement n'est pas créé ou relié.
              Créez un paiement pour le conducteur afin de déclencher la réconciliation automatique.
            </AlertDescription>
          </Alert>
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numéro</TableHead>
                    <TableHead>Conducteur</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Émise le</TableHead>
                    <TableHead className="text-right">Total TTC</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Diagnostic</TableHead>
                    <TableHead className="text-right">Action recommandée</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unresolvedQuery.isLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Chargement…</TableCell></TableRow>
                  ) : unresolvedInvoices.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-success" />
                      Toutes les factures ouvertes ont un paiement lié — auto-apply opérationnel.
                    </TableCell></TableRow>
                  ) : unresolvedInvoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs">{inv.invoice_number || "—"}</TableCell>
                      <TableCell>{inv.driver_snapshot_name || "—"}</TableCell>
                      <TableCell>{inv.invoice_kind === "monthly_statement" ? "Relevé" : inv.invoice_kind === "daily_rental" ? "Journalier" : "Facture"}</TableCell>
                      <TableCell>{formatDateShort(inv.issued_at || inv.created_at)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(inv.total_ttc)}</TableCell>
                      <TableCell>{statusBadge(inv.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[280px]">
                        Facture sans paiement lié — crédit portefeuille non applicable automatiquement
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/admin/payments?new_driver_id=${inv.driver_id}&invoice_id=${inv.id}`)}
                        >
                          <CreditCard className="h-3.5 w-3.5 mr-1" />
                          Créer/relier un paiement
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardContent className="pt-6 space-y-4 max-w-2xl">
              {settings ? (
                <>
                  {isPlatformOwner && (
                    <div className="flex items-center justify-between border-b pb-3">
                      <div>
                        <Label>Module Facturation activé</Label>
                        <p className="text-xs text-muted-foreground">Réservé aux super-administrateurs. Désactive l'auto-génération et masque les factures côté chauffeur.</p>
                      </div>
                      <Switch checked={settings.module_enabled} onCheckedChange={(v) => updateSettings.mutate({ customer_id: settings.customer_id, module_enabled: v })} />
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Auto-facturation sur paiement</Label>
                      <p className="text-xs text-muted-foreground">Génère automatiquement une facture quand un paiement est marqué payé</p>
                    </div>
                    <Switch checked={settings.auto_invoicing} onCheckedChange={(v) => updateSettings.mutate({ customer_id: settings.customer_id, auto_invoicing: v })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>TVA activée</Label>
                      <p className="text-xs text-muted-foreground">Applique la TVA sur les factures (taux ci-dessous)</p>
                    </div>
                    <Switch checked={settings.vat_enabled} onCheckedChange={(v) => updateSettings.mutate({ customer_id: settings.customer_id, vat_enabled: v })} />
                  </div>

                  {/* Automation status panel */}
                  <AutomationPanel runs={cronRuns.data ?? []} isLoading={cronRuns.isLoading} onRefresh={() => qc.invalidateQueries({ queryKey: ["billing-cron-runs"] })} />

                  {/* Logo uploader */}
                  <div className="border rounded-md p-3 space-y-2">
                    <Label className="flex items-center gap-2"><ImageIcon className="h-4 w-4" />Logo (apparaît sur les PDF et la page publique)</Label>
                    <div className="flex items-center gap-3">
                      {settings.legal_logo_url ? (
                        <img src={settings.legal_logo_url} alt="Logo" className="h-16 w-16 object-contain border rounded bg-white" />
                      ) : (
                        <div className="h-16 w-16 border rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">Aucun</div>
                      )}
                      <div className="flex flex-col gap-2">
                        <Input
                          type="file"
                          accept="image/png,image/jpeg,image/svg+xml"
                          disabled={logoUploading || !customerId}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ""; }}
                          className="text-xs"
                        />
                        {settings.legal_logo_url && (
                          <Button size="sm" variant="ghost" onClick={() => updateSettings.mutate({ customer_id: settings.customer_id, legal_logo_url: null })}>
                            <Trash2 className="h-3 w-3 mr-1" />Supprimer le logo
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">PNG/JPG/SVG · max 2 Mo · {logoUploading && "Upload en cours…"}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Taux TVA (%)</Label><Input type="number" defaultValue={settings.vat_rate} onBlur={(e) => updateSettings.mutate({ customer_id: settings.customer_id, vat_rate: Number(e.target.value) })} /></div>
                    <div><Label>Slug (préfixe N°)</Label><Input value={settings.invoice_slug} disabled /></div>
                    <div><Label>Raison sociale</Label><Input defaultValue={settings.legal_name ?? ""} onBlur={(e) => updateSettings.mutate({ customer_id: settings.customer_id, legal_name: e.target.value })} /></div>
                    <div><Label>NIF</Label><Input defaultValue={settings.legal_nif ?? ""} onBlur={(e) => updateSettings.mutate({ customer_id: settings.customer_id, legal_nif: e.target.value })} /></div>
                    <div><Label>RCCM</Label><Input defaultValue={settings.legal_rccm ?? ""} onBlur={(e) => updateSettings.mutate({ customer_id: settings.customer_id, legal_rccm: e.target.value })} /></div>
                    <div className="col-span-2"><Label>Adresse</Label><Input defaultValue={settings.legal_address ?? ""} onBlur={(e) => updateSettings.mutate({ customer_id: settings.customer_id, legal_address: e.target.value })} /></div>
                    <div className="col-span-2"><Label>Mention légale (pied)</Label><Textarea rows={2} defaultValue={settings.legal_footer ?? ""} onBlur={(e) => updateSettings.mutate({ customer_id: settings.customer_id, legal_footer: e.target.value })} /></div>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">{customerId ? "Aucun paramètre — initialisation requise." : "Sélectionnez un client pour voir ses paramètres."}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail dialog with audit tab */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.invoice?.invoice_number || "Facture"}</DialogTitle>
            <DialogDescription>{detail?.invoice?.driver_snapshot_name}</DialogDescription>
          </DialogHeader>
          {detail?.invoice && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {statusBadge(detail.invoice.status)}
                <Badge variant="outline">Total : {formatCurrency(detail.invoice.total_ttc)}</Badge>
                {detail.invoice.status === "partial" && (
                  <>
                    <Badge variant="outline">Payé : {formatCurrency(detail.invoice.amount_paid ?? 0)}</Badge>
                    <Badge variant="high">Reste : {formatCurrency(detail.invoice.remaining_due ?? Math.max((detail.invoice.total_ttc ?? 0) - (detail.invoice.amount_paid ?? 0), 0))}</Badge>
                  </>
                )}
                <Badge variant="outline">{detail.lines.length} ligne{detail.lines.length > 1 ? "s" : ""}</Badge>
              </div>

              {/* Editable tags */}
              <div>
                <Label className="text-xs text-muted-foreground">Tags</Label>
                <InvoiceTagPicker
                  value={detail.invoice.tags ?? []}
                  onChange={(tags) =>
                    updateTags.mutate({ invoice_id: detail.invoice!.id, tags })
                  }
                  disabled={updateTags.isPending}
                />
              </div>

              {/* Linked payment card */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm">Paiement lié</h4>
                    {linkedPayment?.payment && (
                      <StatusBadge kind="payment" status={linkedPayment.payment.status} />
                    )}
                  </div>
                  {linkedLoading ? (
                    <p className="text-sm text-muted-foreground">Chargement…</p>
                  ) : !linkedPayment ? (
                    <p className="text-sm text-muted-foreground italic">
                      Aucun paiement lié à cette facture.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
                        {linkedPayment.rental && (
                          <>
                            <span className="text-muted-foreground">Location</span>
                            <span>
                              {linkedPayment.rental.vehicle_plate ?? "—"}
                              {linkedPayment.rental.vehicle_label && (
                                <span className="text-muted-foreground"> · {linkedPayment.rental.vehicle_label}</span>
                              )}
                            </span>
                          </>
                        )}
                        <span className="text-muted-foreground">Type</span>
                        <span>{linkedPayment.payment.payment_type === "rental" ? "Location" : "Prêt"}</span>
                        <span className="text-muted-foreground">Montant</span>
                        <span className="font-mono">{formatCurrency(linkedPayment.payment.amount)}</span>
                        <span className="text-muted-foreground">Échéance</span>
                        <span>{formatDateShort(linkedPayment.payment.due_date)}</span>
                        <span className="text-muted-foreground">Payé le</span>
                        <span>
                          {linkedPayment.payment.paid_at
                            ? formatDateShort(linkedPayment.payment.paid_at)
                            : linkedPayment.payment.paid_date
                            ? formatDateShort(linkedPayment.payment.paid_date)
                            : "—"}
                        </span>
                        {linkedPayment.payment.wave_transaction_id && (
                          <>
                            <span className="text-muted-foreground">Wave ID</span>
                            <span className="font-mono text-xs truncate">{linkedPayment.payment.wave_transaction_id}</span>
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {detail.invoice.status !== "cancelled" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/admin/payments?payment_id=${linkedPayment.payment.id}`)}
                          >
                            <CreditCard className="h-3.5 w-3.5 mr-1" />Enregistrer un paiement
                          </Button>
                        )}
                        {linkedPayment.rental && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/admin/rentals?id=${linkedPayment.rental!.id}`)}
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1" />Modifier le tarif dans Locations →
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <InvoicePaymentBreakdown invoice={detail.invoice} compact />

              {linkedPayment?.payment && (
                <ReceiptsPanel
                  paymentId={linkedPayment.payment.id}
                  paymentStatus={linkedPayment.payment.status}
                  amountDue={linkedPayment.payment.amount}
                  amountPaid={linkedPayment.payment.amount_paid ?? 0}
                />
              )}

              <Tabs defaultValue="lines">
                <TabsList>
                  <TabsTrigger value="lines"><FileText className="h-4 w-4 mr-1" />Lignes</TabsTrigger>
                  <TabsTrigger value="audit"><History className="h-4 w-4 mr-1" />Historique ({detail.audit.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="lines" className="mt-3">
                  <div className="border rounded-md divide-y">
                    {detail.lines.map((l) => (
                      <div key={l.id} className="flex justify-between p-2 text-sm">
                        <span className="flex-1">
                          <span className="text-muted-foreground mr-2">#{l.position}</span>
                          {l.designation}
                          <span className="text-muted-foreground ml-2 text-xs">× {l.quantity} @ {formatCurrency(l.unit_price)}</span>
                        </span>
                        <span className="font-mono">{formatCurrency(l.line_total_ttc)}</span>
                      </div>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="audit" className="mt-3">
                  {detail.audit.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Aucun événement</p>
                  ) : (
                    <div className="border rounded-md divide-y">
                      {detail.audit.map((a: InvoiceAuditEntry) => {
                        const metaText = formatAuditMetadata(a.metadata as Record<string, unknown> | null);
                        return (
                        <div key={a.id} className="flex justify-between items-start p-2 text-sm gap-3">
                          <div className="min-w-0">
                            <div className="font-medium">{auditLabel(a.action)}</div>
                            <div className="text-xs text-muted-foreground">
                              <span>{actorLabel(a.actor_type)}</span>
                              {metaText && <span> · {metaText}</span>}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">{new Date(a.created_at).toLocaleString("fr-FR")}</div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <Button size="sm" onClick={() => downloadInvoicePDF(detail.invoice!, detail.lines)}>
                  <Download className="h-4 w-4 mr-1" />PDF
                </Button>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(shareableInvoiceUrl(detail.invoice!.public_token)); toast.success("Lien copié"); }}>
                  <Link2 className="h-4 w-4 mr-1" />Copier lien public
                </Button>
                <Button size="sm" variant="outline" onClick={() => regen.mutate(detail.invoice!.id)} disabled={regen.isPending}>
                  <RefreshCw className="h-4 w-4 mr-1" />Régénérer lien
                </Button>
                {detail.invoice.status !== "cancelled" && (
                  <Button size="sm" variant="destructive" onClick={() => { setCancelTags(detail.invoice!.tags ?? []); setCancelOpen(true); }}>
                    <XCircle className="h-4 w-4 mr-1" />Annuler
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Annuler la facture</DialogTitle>
            <DialogDescription>Le numéro reste réservé. Motif obligatoire (5 caractères min).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Motif de l'annulation" />
            <div>
              <Label className="text-xs text-muted-foreground">Tags</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Vous pouvez ajuster les tags au moment de l'annulation.
              </p>
              <InvoiceTagPicker value={cancelTags} onChange={setCancelTags} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Retour</Button>
            <Button variant="destructive" disabled={cancelReason.trim().length < 5 || cancelInv.isPending} onClick={async () => {
              await cancelInv.mutateAsync({ invoiceId: detailId!, reason: cancelReason, tags: cancelTags });
              setCancelOpen(false);
              setCancelReason("");
              setCancelTags([]);
            }}>Confirmer l'annulation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issue invoice dialog */}
      <Dialog open={issueOpen} onOpenChange={(o) => { setIssueOpen(o); if (!o) resetDraft(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditMode
                ? `Modifier ${editingInvoice?.invoice_number ?? "la facture"}`
                : "Émettre une facture"}
            </DialogTitle>
            <DialogDescription>
              {isEditMode
                ? "Mettez à jour les lignes, les tags ou les notes de cette facture."
                : "La facture sera numérotée et envoyée immédiatement au statut \"émise\"."}
            </DialogDescription>
          </DialogHeader>
          {isEditMode && editingInvoice?.status === "issued" && (
            <Alert className="border-warning/40 bg-warning/10 text-amber-950 dark:text-amber-100">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" />
              <AlertTitle className="text-amber-950 dark:text-amber-100">Facture déjà émise</AlertTitle>
              <AlertDescription className="text-amber-900 dark:text-amber-200">
                Attention : cette facture a déjà été émise au conducteur. Les modifications seront immédiatement visibles.
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-4">
            <div>
              <Label>Conducteur</Label>
              <Select value={issueDriverId} onValueChange={setIssueDriverId} disabled={isEditMode}>
                <SelectTrigger><SelectValue placeholder={driversQuery.isLoading ? "Chargement…" : "Sélectionner"} /></SelectTrigger>
                <SelectContent>
                  {(driversQuery.data ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.full_name} — {d.phone_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isEditMode && (
                <p className="text-xs text-muted-foreground mt-1">
                  Le conducteur et la location sont figés à l'émission.
                </p>
              )}
            </div>

            {!isEditMode && issueDriverId && activeRentalsQuery.isLoading && (
              <div className="rounded-md border p-3 text-sm bg-muted/30 text-muted-foreground">
                Chargement des locations…
              </div>
            )}
            {!isEditMode && issueDriverId && activeRentalsQuery.isError && (
              <div className="rounded-md border p-3 text-sm bg-destructive/10 text-destructive">
                Impossible de charger les locations actives — émission bloquée.
              </div>
            )}
            {!isEditMode && issueDriverId && !rentalsNotReady && (
              <div className="rounded-md border p-3 text-sm bg-muted/30">
                {activeRentals.length === 0 && (
                  <span className="text-muted-foreground">
                    ℹ️ Aucune location active — la facture sera enregistrée sans paiement chauffeur.
                  </span>
                )}
                {activeRentals.length === 1 && (
                  <span>
                    🔗 Rattachée à la location en cours
                    {activeRentals[0].vehicle_plate ? ` (${activeRentals[0].vehicle_plate})` : ""}
                    {activeRentals[0].payment_due_at_initial
                      ? ` — échéance ${formatDateShort(activeRentals[0].payment_due_at_initial)}`
                      : ""}
                    . Le chauffeur la verra dans son app pour paiement Wave.
                  </span>
                )}
                {needsRentalChoice && (
                  <div className="space-y-2">
                    <Label className="text-destructive">⚠️ Plusieurs locations actives — sélection requise</Label>
                    <Select value={issueRentalId} onValueChange={setIssueRentalId}>
                      <SelectTrigger><SelectValue placeholder="Choisir une location" /></SelectTrigger>
                      <SelectContent>
                        {activeRentals.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.vehicle_plate ?? r.vehicle_label ?? r.id.slice(0, 8)}
                            {r.payment_due_at_initial ? ` — éch. ${formatDateShort(r.payment_due_at_initial)}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Lignes</Label>
                <Button size="sm" variant="outline" onClick={() => setDraftLines((p) => [...p, { designation: "", quantity: 1, unit_price: 0 }])}>
                  <Plus className="h-4 w-4 mr-1" />Ajouter
                </Button>
              </div>
              {draftLines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <Input className="col-span-6" placeholder="Désignation" value={l.designation}
                    onChange={(e) => setDraftLines((p) => p.map((x, i) => i === idx ? { ...x, designation: e.target.value } : x))} />
                  <Input className="col-span-2" type="number" inputMode="numeric" min={1} placeholder="Qté" value={l.quantity === 0 ? '' : l.quantity}
                    onChange={(e) => setDraftLines((p) => p.map((x, i) => i === idx ? { ...x, quantity: e.target.value === '' ? 0 : Number(e.target.value) } : x))} />
                  <Input className="col-span-3" type="number" inputMode="numeric" min={0} placeholder="PU FCFA" value={l.unit_price === 0 ? '' : l.unit_price}
                    onChange={(e) => setDraftLines((p) => p.map((x, i) => i === idx ? { ...x, unit_price: e.target.value === '' ? 0 : Number(e.target.value) } : x))} />
                  <Button className="col-span-1" variant="ghost" size="icon" onClick={() => setDraftLines((p) => p.filter((_, i) => i !== idx))} disabled={draftLines.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="text-right text-sm font-medium pt-2">Sous-total HT : {formatCurrency(draftTotal)}</div>
            </div>

            <div>
              <Label>Tags (optionnel)</Label>
              <InvoiceTagPicker value={issueTags} onChange={setIssueTags} />
            </div>

            <div>
              <Label>Notes (optionnel)</Label>
              <Textarea rows={2} value={issueNotes} onChange={(e) => setIssueNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueOpen(false)}>Annuler</Button>
            <Button
              onClick={handleIssue}
              disabled={generate.isPending || updateContent.isPending || updateTags.isPending || (!isEditMode && rentalsNotReady)}
              title={!isEditMode && rentalsNotReady ? "Chargement des locations…" : undefined}
            >
              {isEditMode
                ? (updateContent.isPending || updateTags.isPending ? "Enregistrement…" : "Enregistrer les modifications")
                : (generate.isPending ? "Émission…" : rentalsNotReady ? "Chargement des locations…" : "Émettre la facture")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Tariff editing intentionally removed: single source of truth = Locations module. */}
    </AdminLayout>
  );
}

// ============================================================================
// Automation panel — shows last CRON runs (monthly statements + outbox worker)
// ============================================================================
function AutomationPanel({ runs, isLoading, onRefresh }: { runs: BillingCronRun[]; isLoading: boolean; onRefresh: () => void }) {
  const lastByJob: Record<string, BillingCronRun | undefined> = {};
  for (const r of runs) {
    if (!lastByJob[r.job_name]) lastByJob[r.job_name] = r;
  }
  const jobs: { key: string; label: string; description: string }[] = [
    { key: "monthly-statement-cron", label: "Relevés mensuels", description: "Le 1er de chaque mois à 06:00 UTC" },
    { key: "billing-outbox-worker", label: "Envoi des notifications", description: "Toutes les 10 minutes" },
  ];

  const statusBadge = (run?: BillingCronRun) => {
    if (!run) return <StatusBadge kind="cron_run" status="never" />;
    if (run.status === "success")
      return (
        <StatusBadge kind="cron_run" status="success">
          <CheckCircle2 className="h-3 w-3" />
        </StatusBadge>
      );
    if (run.status === "error")
      return (
        <StatusBadge kind="cron_run" status="error">
          <AlertCircle className="h-3 w-3" />
        </StatusBadge>
      );
    return (
      <StatusBadge kind="cron_run" status="running">
        <Loader2 className="h-3 w-3 animate-spin" />
      </StatusBadge>
    );
  };

  return (
    <div className="border rounded-md p-3 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2"><Zap className="h-4 w-4" />Automatisations (CRON)</Label>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? "animate-spin" : ""}`} />Actualiser
        </Button>
      </div>
      <div className="space-y-2">
        {jobs.map((j) => {
          const run = lastByJob[j.key];
          return (
            <div key={j.key} className="flex items-start justify-between gap-2 border-b last:border-b-0 pb-2 last:pb-0">
              <div className="min-w-0">
                <div className="text-sm font-medium flex items-center gap-2">
                  <PlayCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  {j.label}
                </div>
                <div className="text-xs text-muted-foreground">{j.description}</div>
                {run && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Dernière exécution :{" "}
                    <span className="font-mono">{new Date(run.started_at).toLocaleString("fr-FR")}</span>
                    {run.processed_count !== null && run.processed_count !== undefined && (
                      <> · {run.processed_count} traité{run.processed_count > 1 ? "s" : ""}</>
                    )}
                  </div>
                )}
                {run?.error_message && (
                  <div className="text-xs text-destructive mt-1 truncate" title={run.error_message}>
                    {run.error_message}
                  </div>
                )}
              </div>
              <div className="shrink-0">{statusBadge(run)}</div>
            </div>
          );
        })}
        {runs.length === 0 && !isLoading && (
          <p className="text-xs text-muted-foreground italic">Aucun historique d'exécution disponible.</p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Receipts panel — list partial receipts with the ability to void them
// ============================================================================
function ReceiptsPanel({
  paymentId,
  paymentStatus,
  amountDue,
  amountPaid,
}: {
  paymentId: string;
  paymentStatus?: string | null;
  amountDue?: number;
  amountPaid?: number;
}) {
  const { data: receipts, isLoading } = usePaymentReceipts(paymentId);
  const voidReceipt = useVoidPaymentReceipt();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const onConfirm = async () => {
    if (!confirmId) return;
    try {
      const res = await voidReceipt.mutateAsync({ receipt_id: confirmId, payment_id: paymentId, reason: reason.trim() || null });
      const walletNote = res.wallet_reversed > 0 ? ` · ${formatCurrency(res.wallet_reversed)} débité du portefeuille` : "";
      toast.success("Reçu annulé", { description: `Solde recalculé : ${formatCurrency(res.amount_paid)}${walletNote}` });
      setConfirmId(null);
      setReason("");
    } catch (e) {
      toast.error("Erreur", { description: (e as Error).message });
    }
  };

  // Build an accessible inline help message based on the parent payment status.
  // Centralised wording so Billing + Payments stay consistent.
  const statusMeta = paymentStatus ? getStatusMeta("payment", paymentStatus) : null;
  const due = amountDue ?? 0;
  const paid = amountPaid ?? 0;
  const remaining = Math.max(0, due - paid);
  const surplus = Math.max(0, paid - due);
  const helpText = (() => {
    switch (paymentStatus) {
      case "partial":
        return `Paiement partiel : ${formatCurrency(paid)} reçus sur ${formatCurrency(due)}. Solde restant à encaisser : ${formatCurrency(remaining)}.`;
      case "overpaid":
        return `Trop-perçu : surplus de ${formatCurrency(surplus)} crédité au portefeuille du chauffeur.`;
      case "paid":
        return `Facture acquittée intégralement (${formatCurrency(paid)}).`;
      case "pending":
        return "Aucun paiement reçu pour le moment.";
      default:
        return null;
    }
  })();

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" aria-hidden="true" />Reçus enregistrés{receipts ? ` (${receipts.length})` : ""}
          </h4>
          {statusMeta && (
            <StatusBadge kind="payment" status={paymentStatus ?? undefined} />
          )}
        </div>
        {helpText && (
          <p
            className="text-xs text-muted-foreground bg-muted/40 border rounded-md p-2"
            role="status"
            aria-live="polite"
          >
            {helpText}
          </p>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : !receipts || receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Aucun reçu enregistré pour le moment.</p>
        ) : (
          <div className="border rounded-md divide-y">
            {receipts.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 p-2 text-sm">
                <div className="min-w-0">
                  <div className="font-mono">{formatCurrency(r.amount)} <span className="uppercase text-xs text-muted-foreground ml-1">{r.method}</span></div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.received_at).toLocaleString("fr-FR")}
                    {r.wave_transaction_id && <> · <span className="font-mono">{r.wave_transaction_id}</span></>}
                  </div>
                  {r.note && <div className="text-xs text-muted-foreground italic truncate">"{r.note}"</div>}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  aria-label="Annuler ce reçu de paiement"
                  onClick={() => { setConfirmId(r.id); setReason(""); }}
                >
                  <XCircle className="h-4 w-4 mr-1" />Annuler
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!confirmId} onOpenChange={(o) => !o && setConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuler ce reçu de paiement ?</DialogTitle>
            <DialogDescription>
              Le solde restant sera recalculé automatiquement et tout trop-perçu crédité au portefeuille sera débité de manière équivalente. Action auditée.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Motif (optionnel mais recommandé)</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex : erreur de saisie, doublon, remboursé au chauffeur…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmId(null)}>Retour</Button>
            <Button variant="destructive" onClick={onConfirm} disabled={voidReceipt.isPending}>
              {voidReceipt.isPending ? "Annulation…" : "Confirmer l'annulation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
