import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/routeClient";
import type { Invoice, InvoiceLine, BillingSettings } from "@/types/billing";
import { toast } from "sonner";
import { getInvoiceErrorMessage } from "@/lib/invoiceErrors";

// ---------- Admin: list invoices ----------
export function useAdminInvoices(filters?: {
  status?: string;
  driver_id?: string;
  kind?: string;
  customer_id?: string;
}) {
  return useQuery({
    queryKey: ["admin-invoices", filters],
    queryFn: async () => {
      let q = supabase
        .from("invoice")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (filters?.status && filters.status !== "all") q = q.eq("status", filters.status);
      if (filters?.driver_id) q = q.eq("driver_id", filters.driver_id);
      if (filters?.kind && filters.kind !== "all") q = q.eq("invoice_kind", filters.kind);
      if (filters?.customer_id) q = q.eq("customer_id", filters.customer_id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });
}

// ---------- Driver: list own invoices ----------
export function useDriverInvoices(driverId: string | null | undefined) {
  return useQuery({
    queryKey: ["driver-invoices", driverId],
    enabled: !!driverId,
    // Financial freshness: always refetch on mount so navigating to /factures
    // never shows a stale cached list (overrides global 5-min staleTime).
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice")
        .select("*")
        .eq("driver_id", driverId!)
        .neq("status", "draft")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });
}

// ---------- Single invoice + lines + audit ----------
export interface InvoiceAuditEntry {
  id: string;
  invoice_id: string;
  action: string;
  actor_type: string;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useInvoiceWithLines(invoiceId: string | null) {
  return useQuery({
    queryKey: ["invoice", invoiceId],
    enabled: !!invoiceId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [invRes, linesRes, auditRes] = await Promise.all([
        supabase.from("invoice").select("*").eq("id", invoiceId!).maybeSingle(),
        supabase.from("invoice_line").select("*").eq("invoice_id", invoiceId!).order("position"),
        supabase
          .from("invoice_audit")
          .select("*")
          .eq("invoice_id", invoiceId!)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (invRes.error) throw invRes.error;
      return {
        invoice: invRes.data as Invoice | null,
        lines: (linesRes.data ?? []) as InvoiceLine[],
        audit: (auditRes.data ?? []) as InvoiceAuditEntry[],
      };
    },
  });
}

// ---------- Line counts (batch) for list view ----------
export function useInvoiceLineCounts(invoiceIds: string[]) {
  return useQuery({
    queryKey: ["invoice-line-counts", invoiceIds.sort().join(",")],
    enabled: invoiceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_line")
        .select("invoice_id")
        .in("invoice_id", invoiceIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: { invoice_id: string }) => {
        counts[r.invoice_id] = (counts[r.invoice_id] ?? 0) + 1;
      });
      return counts;
    },
  });
}

// ---------- Billing settings ----------
export function useBillingSettings(customerId: string | null | undefined) {
  return useQuery({
    queryKey: ["billing-settings", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_billing_settings")
        .select("*")
        .eq("customer_id", customerId!)
        .maybeSingle();
      if (error) throw error;
      return data as BillingSettings | null;
    },
  });
}

export function useUpdateBillingSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<BillingSettings> & { customer_id: string }) => {
      const { customer_id, ...rest } = payload;
      const { data, error } = await supabase
        .from("customer_billing_settings")
        .update(rest)
        .eq("customer_id", customer_id)
        .select()
        .single();
      if (error) throw error;
      return data as BillingSettings;
    },
    onSuccess: (data) => {
      toast.success("Paramètres de facturation enregistrés");
      qc.invalidateQueries({ queryKey: ["billing-settings", data.customer_id] });
    },
    onError: (e: Error) => toast.error("Erreur : " + e.message),
  });
}

// ---------- Edge function actions ----------
export function useCancelInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { invoiceId: string; reason: string; tags?: string[] }) => {
      const body: { invoice_id: string; reason: string; tags?: string[] } = {
        invoice_id: vars.invoiceId,
        reason: vars.reason,
      };
      if (vars.tags !== undefined) body.tags = vars.tags;
      const { data, error } = await supabase.functions.invoke("cancel-invoice", { body });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data;
    },
    onSuccess: () => {
      toast.success("Facture annulée");
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice"] });
    },
    onError: (e: Error) => toast.error("Échec annulation : " + e.message),
  });
}

export function useRegenerateInvoiceLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invoice_id: string) => {
      const { data, error } = await supabase.functions.invoke("regenerate-invoice-link", {
        body: { invoice_id },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data as { public_token: string; token_expires_at: string };
    },
    onSuccess: () => {
      toast.success("Nouveau lien généré (valide 90 jours)");
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice"] });
    },
    onError: (e: Error) => toast.error("Erreur : " + e.message),
  });
}

export function useGenerateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      driver_id: string;
      customer_id: string;
      rental_id?: string | null;
      lines: Array<{ designation: string; quantity?: number; unit_price: number; source_payment_id?: string }>;
      notes?: string;
      tags?: string[];
      payment_ids?: string[];
    }) => {
      const { data, error } = await supabase.functions.invoke("generate-invoice", { body: payload });
      if (error) {
        // Surface the real server-side message (FunctionsHttpError swallows
        // the response body and returns the generic "non-2xx status code").
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = (await ctx.clone().json()) as { error?: string; message?: string };
            const msg = body?.error || body?.message;
            if (msg) throw new Error(msg);
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message) throw parseErr;
          }
        }
        throw error;
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data as { invoice: Invoice; payment_id: string | null; rental_id: string | null };
    },
    onSuccess: (res) => {
      if (res.payment_id) {
        toast.success("Facture émise — visible chez le chauffeur pour paiement Wave");
      } else {
        toast.success("Facture émise");
      }
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    },
    onError: (e: Error) => toast.error(getInvoiceErrorMessage(e, "Erreur : " + e.message)),
  });
}

// ---------- Admin: update invoice tags ----------
export function useUpdateInvoiceTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoice_id, tags }: { invoice_id: string; tags: string[] }) => {
      const { error } = await supabase
        .from("invoice")
        .update({ tags })
        .eq("id", invoice_id);
      if (error) throw error;
      return { invoice_id, tags };
    },
    onSuccess: ({ invoice_id, tags }) => {
      toast.success("Tags mis à jour");
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", invoice_id] });
      // Optimistic patch so the dialog chip appears immediately, before refetch resolves.
      qc.setQueryData(["invoice", invoice_id], (prev: any) =>
        prev?.invoice
          ? { ...prev, invoice: { ...prev.invoice, tags } }
          : prev,
      );
    },
    onError: (e: Error) => toast.error("Erreur : " + e.message),
  });
}

// ---------- Update invoice content (lines + notes) for draft OR issued invoices ----------
export interface UpdateInvoiceContentInput {
  invoice_id: string;
  notes?: string | null;
  lines: { designation: string; quantity: number; unit_price: number }[];
}

export function useUpdateInvoiceContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoice_id, notes, lines }: UpdateInvoiceContentInput) => {
      if (!lines.length) throw new Error("Au moins une ligne est requise");

      // Load current invoice for VAT snapshot + customer_id (preserved as-is)
      const { data: inv, error: invErr } = await supabase
        .from("invoice")
        .select("id, customer_id, vat_enabled_snapshot, vat_rate_snapshot, status")
        .eq("id", invoice_id)
        .maybeSingle();
      if (invErr) throw invErr;
      if (!inv) throw new Error("Facture introuvable");
      if (inv.status === "cancelled") throw new Error("Facture annulée — modification impossible");

      const vatEnabled = !!inv.vat_enabled_snapshot;
      const vatRate = Number(inv.vat_rate_snapshot ?? 0);

      // Compute totals
      let subtotal_ht = 0;
      const lineRows = lines.map((l, idx) => {
        const qty = Number(l.quantity) || 0;
        const pu = Number(l.unit_price) || 0;
        const line_total_ht = qty * pu;
        const line_vat = vatEnabled ? +(line_total_ht * vatRate / 100).toFixed(2) : 0;
        const line_total_ttc = +(line_total_ht + line_vat).toFixed(2);
        subtotal_ht += line_total_ht;
        return {
          invoice_id,
          customer_id: inv.customer_id,
          position: idx + 1,
          designation: l.designation.trim(),
          quantity: qty,
          unit_price: pu,
          line_total_ht,
          vat_rate: vatEnabled ? vatRate : 0,
          line_vat,
          line_total_ttc,
        };
      });
      const vat_amount = vatEnabled ? +(subtotal_ht * vatRate / 100).toFixed(2) : 0;
      const total_ttc = +(subtotal_ht + vat_amount).toFixed(2);

      // Replace lines atomically (best-effort: delete then insert)
      const { error: delErr } = await supabase
        .from("invoice_line")
        .delete()
        .eq("invoice_id", invoice_id);
      if (delErr) throw delErr;

      const { error: insErr } = await supabase
        .from("invoice_line")
        .insert(lineRows);
      if (insErr) throw insErr;

      // Update invoice header
      const { error: updErr } = await supabase
        .from("invoice")
        .update({
          subtotal_ht,
          vat_amount,
          total_ttc,
          notes: notes ?? null,
        })
        .eq("id", invoice_id);
      if (updErr) throw updErr;

      return { invoice_id };
    },
    onSuccess: ({ invoice_id }) => {
      toast.success("Facture mise à jour");
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", invoice_id] });
      qc.invalidateQueries({ queryKey: ["invoice-line-counts"] });
    },
    onError: (e: Error) => toast.error("Erreur : " + e.message),
  });
}
export interface ActiveRentalOption {
  id: string;
  vehicle_plate: string | null;
  vehicle_label: string | null;
  payment_due_at_initial: string | null;
}

export function useActiveRentalsForDriver(driverId: string | null | undefined) {
  return useQuery({
    queryKey: ["active-rentals-for-driver", driverId],
    enabled: !!driverId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rentals")
        .select("id, payment_due_at_initial, vehicles ( license_plate, model_name )")
        .eq("driver_id", driverId!)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []).map((r: {
        id: string;
        payment_due_at_initial: string | null;
        vehicles: { license_plate: string | null; model_name: string | null } | null;
      }) => ({
        id: r.id,
        vehicle_plate: r.vehicles?.license_plate ?? null,
        vehicle_label: r.vehicles?.model_name ?? null,
        payment_due_at_initial: r.payment_due_at_initial,
      })) as ActiveRentalOption[];
    },
  });
}

// ---------- Linked payment for an invoice (admin detail view) ----------
export interface InvoiceLinkedPayment {
  payment: {
    id: string;
    rental_id: string | null;
    loan_id: string | null;
    amount: number;
    amount_paid: number;
    payment_type: string;
    status: string;
    due_date: string;
    paid_date: string | null;
    paid_at: string | null;
    wave_transaction_id: string | null;
  };
  rental: {
    id: string;
    status: string | null;
    vehicle_plate: string | null;
    vehicle_label: string | null;
  } | null;
}

export function useInvoiceLinkedPayment(invoiceId: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["invoice-linked-payment", invoiceId],
    enabled: !!invoiceId,
    refetchInterval: 15_000,
    queryFn: async (): Promise<InvoiceLinkedPayment | null> => {
      const { data: link, error: linkErr } = await supabase
        .from("invoice_payment_link")
        .select("payment_id")
        .eq("invoice_id", invoiceId!)
        .maybeSingle();
      if (linkErr) throw linkErr;
      if (!link?.payment_id) return null;

      const { data: payment, error: payErr } = await supabase
        .from("payments")
        .select("id, rental_id, loan_id, amount, amount_paid, payment_type, status, due_date, paid_date, paid_at, wave_transaction_id")
        .eq("id", link.payment_id)
        .maybeSingle();
      if (payErr) throw payErr;
      if (!payment) return null;

      let rental: InvoiceLinkedPayment["rental"] = null;
      if (payment.rental_id) {
        const { data: r } = await supabase
          .from("rentals")
          .select("id, status, vehicles ( license_plate, model_name )")
          .eq("id", payment.rental_id)
          .maybeSingle();
        if (r) {
          const v = (r as { vehicles: { license_plate: string | null; model_name: string | null } | null }).vehicles;
          rental = {
            id: r.id,
            status: (r as { status: string | null }).status ?? null,
            vehicle_plate: v?.license_plate ?? null,
            vehicle_label: v?.model_name ?? null,
          };
        }
      }
      return { payment, rental };
    },
  });

  // Realtime: refresh card the moment the linked payment row changes (status -> paid, wave id, etc.)
  const paymentId = query.data?.payment.id ?? null;
  useEffect(() => {
    if (!paymentId) return;
    const channel = supabase
      .channel(`invoice-linked-payment-${paymentId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "payments", filter: `id=eq.${paymentId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["invoice-linked-payment", invoiceId] });
          qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
          qc.invalidateQueries({ queryKey: ["admin-invoices"] });
          qc.invalidateQueries({ queryKey: ["invoice-linked-payments-batch"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [paymentId, invoiceId, qc]);

  return query;
}

// ---------- Batch: linked payment summaries for an invoice list (admin table preview) ----------
export interface InvoiceLinkedPaymentSummary {
  invoice_id: string;
  payment_id: string;
  amount: number;
  amount_paid: number;
  status: string;
}

export function useInvoiceLinkedPaymentsBatch(invoiceIds: string[]) {
  const qc = useQueryClient();
  const sortedKey = invoiceIds.slice().sort().join(",");
  const query = useQuery({
    queryKey: ["invoice-linked-payments-batch", sortedKey],
    enabled: invoiceIds.length > 0,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Record<string, InvoiceLinkedPaymentSummary>> => {
      const { data: links, error: linkErr } = await supabase
        .from("invoice_payment_link")
        .select("invoice_id, payment_id")
        .in("invoice_id", invoiceIds);
      if (linkErr) throw linkErr;
      if (!links?.length) return {};

      const paymentIds = Array.from(new Set(links.map((l) => l.payment_id)));
      const { data: payments, error: payErr } = await supabase
        .from("payments")
        .select("id, amount, amount_paid, status")
        .in("id", paymentIds);
      if (payErr) throw payErr;

      const byPayment = new Map((payments ?? []).map((p) => [p.id, p]));
      const out: Record<string, InvoiceLinkedPaymentSummary> = {};
      for (const l of links) {
        const p = byPayment.get(l.payment_id);
        if (!p) continue;
        out[l.invoice_id] = {
          invoice_id: l.invoice_id,
          payment_id: l.payment_id,
          amount: p.amount,
          amount_paid: p.amount_paid ?? 0,
          status: p.status,
        };
      }

      // Self-healing guard: if a linked payment is paid/overpaid but the
      // invoice is still 'issued' (trigger drift / pre-deploy data), reconcile
      // it server-side. Fire-and-forget — the next refetch will pick up the
      // corrected status. No-op when everything is already in sync.
      const candidateIds = Object.values(out)
        .filter((s) => s.status === "paid" || s.status === "overpaid")
        .map((s) => s.invoice_id);
      if (candidateIds.length > 0) {
        const { data: invStatuses } = await supabase
          .from("invoice")
          .select("id, status")
          .in("id", candidateIds);
        const stale = (invStatuses ?? []).filter((i) => i.status === "issued");
        if (stale.length > 0) {
          await Promise.all(
            stale.map((i) => supabase.rpc("reconcile_invoice_status", { p_invoice_id: i.id })),
          );
          qc.invalidateQueries({ queryKey: ["admin-invoices"] });
        }
      }
      return out;
    },
  });

  // Realtime: any payment update tied to a known linked id triggers a refresh
  useEffect(() => {
    const linkedIds = Object.values(query.data ?? {}).map((s) => s.payment_id);
    if (linkedIds.length === 0) return;
    const channel = supabase
      .channel(`invoice-linked-payments-batch-${sortedKey.slice(0, 32)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "payments" },
        (payload) => {
          const id = (payload.new as { id?: string } | null)?.id;
          if (id && linkedIds.includes(id)) {
            qc.invalidateQueries({ queryKey: ["invoice-linked-payments-batch", sortedKey] });
            qc.invalidateQueries({ queryKey: ["admin-invoices"] });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [query.data, sortedKey, qc]);

  return query;
}

// ---------- CRON run history (admin observability) ----------
export interface BillingCronRun {
  id: string;
  job_name: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "error";
  processed_count: number | null;
  error_message: string | null;
  details: Record<string, unknown>;
}

export function useBillingCronRuns(jobNames: string[] = ["monthly-statement-cron", "billing-outbox-worker"]) {
  return useQuery({
    queryKey: ["billing-cron-runs", jobNames.sort().join(",")],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_cron_runs")
        .select("*")
        .in("job_name", jobNames)
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as BillingCronRun[];
    },
  });
}

// ---------- Payment receipts (partial/full/over collection ledger) ----------
export interface PaymentReceipt {
  id: string;
  payment_id: string;
  customer_id: string | null;
  amount: number;
  method: "wave" | "cash" | "orange" | "mtn" | "moov" | "other";
  wave_transaction_id: string | null;
  note: string | null;
  recorded_by: string | null;
  received_at: string;
  created_at: string;
}

export function usePaymentReceipts(paymentId: string | null | undefined) {
  return useQuery({
    queryKey: ["payment-receipts", paymentId],
    enabled: !!paymentId,
    queryFn: async (): Promise<PaymentReceipt[]> => {
      const { data, error } = await supabase
        .from("payment_receipts")
        .select("*")
        .eq("payment_id", paymentId!)
        .order("received_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PaymentReceipt[];
    },
  });
}

export function useRecordPaymentReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      payment_id: string;
      customer_id: string | null;
      amount: number;
      method: PaymentReceipt["method"];
      wave_transaction_id?: string | null;
      note?: string | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("payment_receipts")
        .insert({
          payment_id: input.payment_id,
          customer_id: input.customer_id,
          amount: input.amount,
          method: input.method,
          wave_transaction_id: input.wave_transaction_id || null,
          note: input.note || null,
          recorded_by: auth.user?.id ?? null,
        });
      if (error) {
        // Normalize PostgrestError → plain Error so callers always get .message
        const msg = error.message || error.details || error.hint || "Erreur base de données";
        throw new Error(msg);
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["payment-receipts", vars.payment_id] });
      qc.invalidateQueries({ queryKey: ["admin-payments"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["invoice-linked-payment"] });
      qc.invalidateQueries({ queryKey: ["invoice-linked-payments-batch"] });
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    },
  });
}

export function useVoidPaymentReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { receipt_id: string; payment_id: string; reason?: string | null }) => {
      const { data, error } = await supabase.rpc("void_payment_receipt", {
        p_receipt_id: input.receipt_id,
        p_reason: input.reason ?? null,
      });
      if (error) throw error;
      return data as { payment_id: string; new_status: string; amount_paid: number; wallet_reversed: number };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["payment-receipts", vars.payment_id] });
      qc.invalidateQueries({ queryKey: ["admin-payments"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["invoice-linked-payment"] });
      qc.invalidateQueries({ queryKey: ["invoice-linked-payments-batch"] });
      qc.invalidateQueries({ queryKey: ["admin-invoices"] });
    },
  });
}

// Cached fetcher for invoice lines — used by one-click PDF download in the table.
export function useInvoiceLines(invoiceId: string | null | undefined) {
  return useQuery({
    queryKey: ["invoice-lines", invoiceId],
    enabled: !!invoiceId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_line")
        .select("*")
        .eq("invoice_id", invoiceId!)
        .order("position");
      if (error) throw error;
      return (data ?? []) as InvoiceLine[];
    },
  });
}

export async function fetchInvoiceLinesCached(qc: ReturnType<typeof useQueryClient>, invoiceId: string): Promise<InvoiceLine[]> {
  return qc.fetchQuery({
    queryKey: ["invoice-lines", invoiceId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_line")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("position");
      if (error) throw error;
      return (data ?? []) as InvoiceLine[];
    },
  });
}
