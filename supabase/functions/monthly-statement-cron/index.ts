// monthly-statement-cron — generates monthly statements for active drivers on the 1st of each month
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Track this run
  const { data: runRow } = await admin
    .from("billing_cron_runs")
    .insert({ job_name: "monthly-statement-cron" })
    .select("id")
    .single();
  const runId = runRow?.id ?? null;

  try {
    // Compute previous month period
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of previous month
    const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);
    const periodStartISO = periodStart.toISOString().slice(0, 10);
    const periodEndISO = periodEnd.toISOString().slice(0, 10);

    // Tenants with billing enabled
    const { data: tenants } = await admin
      .from("customer_billing_settings")
      .select("customer_id, vat_enabled, vat_rate, legal_name, legal_nif, legal_rccm, legal_address, legal_footer")
      .eq("module_enabled", true);

    if (!tenants || tenants.length === 0) {
      return new Response(JSON.stringify({ ok: true, generated: 0, note: "No tenants" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let generated = 0;

    for (const t of tenants) {
      const { data: drivers } = await admin
        .from("drivers")
        .select("id, full_name, phone_number")
        .eq("customer_id", t.customer_id)
        .eq("driver_status", "active");

      if (!drivers) continue;

      for (const d of drivers) {
        // Skip if already generated for this driver/period
        const { data: existing } = await admin
          .from("invoice")
          .select("id")
          .eq("driver_id", d.id)
          .eq("invoice_kind", "monthly_statement")
          .eq("period_start", periodStartISO)
          .maybeSingle();
        if (existing) continue;

        // Aggregate paid payments in window
        const { data: payments } = await admin
          .from("payments")
          .select("id, amount, payment_type, paid_at")
          .eq("driver_id", d.id)
          .eq("status", "paid")
          .gte("paid_at", periodStart.toISOString())
          .lte("paid_at", new Date(periodEnd.getTime() + 24 * 3600 * 1000).toISOString());

        if (!payments || payments.length === 0) continue;

        const subtotal = payments.reduce((a, p) => a + (p.amount ?? 0), 0);
        const vatRate = t.vat_enabled ? Number(t.vat_rate ?? 0) : 0;
        const vat = t.vat_enabled ? Math.round((subtotal * vatRate) / 100) : 0;

        const { data: inv, error: invErr } = await admin
          .from("invoice")
          .insert({
            customer_id: t.customer_id,
            driver_id: d.id,
            status: "issued",
            invoice_kind: "monthly_statement",
            driver_snapshot_name: d.full_name,
            driver_snapshot_phone: d.phone_number,
            subtotal_ht: subtotal,
            vat_amount: vat,
            total_ttc: subtotal + vat,
            vat_rate_snapshot: vatRate,
            vat_enabled_snapshot: t.vat_enabled,
            legal_name_snapshot: t.legal_name,
            legal_nif_snapshot: t.legal_nif,
            legal_rccm_snapshot: t.legal_rccm,
            legal_address_snapshot: t.legal_address,
            legal_footer_snapshot: t.legal_footer,
            period_start: periodStartISO,
            period_end: periodEndISO,
          })
          .select("id")
          .single();

        if (invErr || !inv) {
          console.error("statement insert error", invErr);
          continue;
        }

        const lines = payments.map((p, idx) => {
          const ht = p.amount ?? 0;
          const lineVat = t.vat_enabled ? Math.round((ht * vatRate) / 100) : 0;
          const designation =
            (p.payment_type === "rental" ? "Location" : p.payment_type === "loan" ? "Échéance prêt" : "Paiement") +
            ` du ${new Date(p.paid_at!).toLocaleDateString("fr-FR")}`;
          return {
            invoice_id: inv.id,
            customer_id: t.customer_id,
            position: idx + 1,
            designation,
            quantity: 1,
            unit_price: ht,
            line_total_ht: ht,
            vat_rate: vatRate,
            line_vat: lineVat,
            line_total_ttc: ht + lineVat,
            source_payment_id: p.id,
          };
        });
        await admin.from("invoice_line").insert(lines);

        await admin.from("invoice_audit").insert({
          invoice_id: inv.id,
          customer_id: t.customer_id,
          action: "statement_generated",
          actor_type: "system",
          metadata: { period_start: periodStartISO, period_end: periodEndISO, payment_count: payments.length },
        });

        generated++;
      }
    }

    if (runId) {
      await admin.from("billing_cron_runs").update({
        finished_at: new Date().toISOString(),
        status: "success",
        processed_count: generated,
        details: { period_start: periodStartISO, period_end: periodEndISO },
      }).eq("id", runId);
    }
    return new Response(JSON.stringify({ ok: true, generated, period: { start: periodStartISO, end: periodEndISO } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("monthly-statement-cron error", e);
    if (runId) {
      await admin.from("billing_cron_runs").update({
        finished_at: new Date().toISOString(),
        status: "error",
        error_message: String(e).slice(0, 1000),
      }).eq("id", runId);
    }
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
