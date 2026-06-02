// generate-invoice — manually creates and issues an invoice for a driver.
//
// NEW: optional `rental_id`. When the driver has an active rental we also
// create a matching `payments` row (status='pending') and link it to the
// invoice via `invoice_payment_link`, so the invoice immediately appears as
// a payable item in the driver app's Rental screen.
//
// Resolution rules:
//   - body.rental_id provided → use it (verify driver/tenant ownership)
//   - else → look up rentals(driver_id, status='active')
//       0 rows  → invoice for record only, no payments row
//       1 row   → use it
//       2+ rows → 409 multiple_active_rentals (admin must pick)
//
// Audit: writes a row to admin_audit_logs on every successful call.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface InvoiceLineInput {
  designation: string;
  quantity?: number;
  unit_price: number;
  source_payment_id?: string;
}

interface Body {
  driver_id: string;
  customer_id: string;
  rental_id?: string | null;
  invoice_kind?: "invoice" | "monthly_statement";
  period_start?: string;
  period_end?: string;
  notes?: string;
  tags?: string[];
  lines: InvoiceLineInput[];
  payment_ids?: string[];
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Unauthorized" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return json(401, { error: "Unauthorized" });

    const { data: adminCheck } = await supabase
      .from("admin_users")
      .select("id, customer_id, is_platform_owner, is_active, role_key")
      .eq("user_id", userData.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!adminCheck) return json(403, { error: "Admin access required" });

    const body: Body = await req.json();
    if (!body.driver_id || !body.customer_id || !Array.isArray(body.lines) || body.lines.length === 0) {
      return json(400, { error: "Missing required fields: driver_id, customer_id, lines" });
    }

    if (!adminCheck.is_platform_owner && adminCheck.customer_id !== body.customer_id) {
      return json(403, { error: "Cross-tenant access denied" });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: settings, error: settingsErr } = await admin
      .from("customer_billing_settings")
      .select("*")
      .eq("customer_id", body.customer_id)
      .maybeSingle();
    if (settingsErr || !settings) return json(400, { error: "Billing not configured for this tenant" });

    const { data: driver, error: drvErr } = await admin
      .from("drivers")
      .select("id, full_name, phone_number, customer_id")
      .eq("id", body.driver_id)
      .maybeSingle();
    if (drvErr || !driver) return json(404, { error: "Driver not found" });

    // ── Resolve rental ───────────────────────────────────────────────────────
    let resolvedRentalId: string | null = null;
    let rentalDueDate: string | null = null;

    if (body.rental_id) {
      const { data: r, error: rErr } = await admin
        .from("rentals")
        .select("id, driver_id, customer_id, payment_due_at_initial, status")
        .eq("id", body.rental_id)
        .maybeSingle();
      if (rErr || !r) return json(404, { error: "Rental not found" });
      if (r.driver_id !== body.driver_id) return json(400, { error: "Rental does not belong to this driver" });
      if (r.customer_id && r.customer_id !== body.customer_id) {
        return json(403, { error: "Rental belongs to another tenant" });
      }
      resolvedRentalId = r.id;
      rentalDueDate = r.payment_due_at_initial ? String(r.payment_due_at_initial).slice(0, 10) : null;
    } else {
      const { data: actives, error: aErr } = await admin
        .from("rentals")
        .select("id, payment_due_at_initial")
        .eq("driver_id", body.driver_id)
        .eq("status", "active");
      if (aErr) return json(500, { error: aErr.message });

      if ((actives?.length ?? 0) > 1) {
        return json(409, {
          error: "multiple_active_rentals",
          message: "Plusieurs locations actives — sélectionnez celle à rattacher.",
          rental_ids: actives!.map((x) => x.id),
        });
      }
      if (actives && actives.length === 1) {
        resolvedRentalId = actives[0].id;
        rentalDueDate = actives[0].payment_due_at_initial
          ? String(actives[0].payment_due_at_initial).slice(0, 10)
          : null;
      }
    }

    // ── Compute totals — NO TAX in this domain (FakusDam rule).
    // Prices stored in Locations / line unit_price are the literal totals.
    let subtotal = 0;
    const linesPrepared = body.lines.map((l, idx) => {
      const qty = l.quantity ?? 1;
      const lineTotal = Math.round(l.unit_price * qty);
      subtotal += lineTotal;
      return {
        position: idx + 1,
        designation: l.designation,
        quantity: qty,
        unit_price: l.unit_price,
        line_total_ht: lineTotal,
        vat_rate: 0,
        line_vat: 0,
        line_total_ttc: lineTotal,
        source_payment_id: l.source_payment_id ?? null,
      };
    });
    const totalTTC = subtotal;

    // ── Insert invoice (status='issued' triggers numbering) ─────────────────
    const { data: inv, error: invErr } = await admin
      .from("invoice")
      .insert({
        customer_id: body.customer_id,
        driver_id: body.driver_id,
        rental_id: resolvedRentalId,
        status: "issued",
        invoice_kind: body.invoice_kind ?? "invoice",
        driver_snapshot_name: driver.full_name,
        driver_snapshot_phone: driver.phone_number,
        subtotal_ht: subtotal,
        vat_amount: 0,
        total_ttc: totalTTC,
        vat_rate_snapshot: 0,
        vat_enabled_snapshot: false,
        legal_name_snapshot: settings.legal_name,
        legal_nif_snapshot: settings.legal_nif,
        legal_rccm_snapshot: settings.legal_rccm,
        legal_address_snapshot: settings.legal_address,
        legal_footer_snapshot: settings.legal_footer,
        period_start: body.period_start ?? null,
        period_end: body.period_end ?? null,
        notes: body.notes ?? null,
        tags: Array.isArray(body.tags) ? body.tags : [],
      })
      .select("*")
      .single();
    if (invErr) {
      console.error("invoice insert", invErr);
      const raw = `${invErr.message ?? ""} ${(invErr as { details?: string }).details ?? ""}`.toLowerCase();
      const code = (invErr as { code?: string }).code ?? "";
      if (raw.includes("uniq_invoice_per_rental") || (code === "23505" && raw.includes("rental_id"))) {
        return json(409, {
          error: "Une facture existe déjà pour cette location. Impossible d'en créer une seconde.",
          error_code: "duplicate_invoice_for_rental",
        });
      }
      if (raw.includes("invoice_totals_match") || code === "23514") {
        return json(422, {
          error: "Montants incohérents.",
          error_code: "invoice_totals_mismatch",
          detail: { subtotal_ht: subtotal, vat_amount: 0, total_ttc: totalTTC },
        });
      }
      return json(500, { error: invErr.message });
    }

    const linesToInsert = linesPrepared.map((l) => ({
      invoice_id: inv.id,
      customer_id: body.customer_id,
      ...l,
    }));
    const { error: linesErr } = await admin.from("invoice_line").insert(linesToInsert);
    if (linesErr) {
      console.error("invoice_line insert", linesErr);
      return json(500, { error: linesErr.message });
    }

    if (body.payment_ids && body.payment_ids.length > 0) {
      const links = body.payment_ids.map((pid) => ({
        invoice_id: inv.id,
        payment_id: pid,
        customer_id: body.customer_id,
      }));
      await admin.from("invoice_payment_link").insert(links);
    }

    // ── Always create a payable payments row + link, even without a rental.
    // Without this, the driver UI shows "Contactez votre gestionnaire" fallback
    // because canPayWithWave depends on an invoice_payment_link → payments row.
    let createdPaymentId: string | null = null;
    {
      const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
      const dueDate = rentalDueDate ?? tomorrow.toISOString().slice(0, 10);

      // payment_type CHECK constraint only allows 'rental' or 'loan_repayment';
      // use 'rental' as the generic payable type (matches daily cron behaviour).
      const { data: pay, error: payErr } = await admin
        .from("payments")
        .insert({
          driver_id: body.driver_id,
          rental_id: resolvedRentalId, // nullable
          customer_id: body.customer_id,
          amount: totalTTC,
          payment_type: "rental",
          due_date: dueDate,
          status: "pending",
        })
        .select("id")
        .single();
      if (payErr) {
        console.error("payments insert", payErr);
        return json(500, { error: "Invoice created but payable row failed: " + payErr.message });
      }
      createdPaymentId = pay.id;

      const { error: linkErr } = await admin.from("invoice_payment_link").insert({
        invoice_id: inv.id,
        payment_id: createdPaymentId,
        customer_id: body.customer_id,
      });
      if (linkErr) {
        console.error("invoice_payment_link insert", linkErr);
        return json(500, { error: "Invoice created but link failed: " + linkErr.message });
      }
    }

    // ── Audit row ────────────────────────────────────────────────────────────
    await admin.from("admin_audit_logs").insert({
      admin_user_id: adminCheck.id,
      action: "payment_marked_paid",
      entity_type: "invoice",
      entity_id: inv.id,
      details: {
        op: "generate_invoice",
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        driver_id: body.driver_id,
        customer_id: body.customer_id,
        rental_id: resolvedRentalId,
        payment_id: createdPaymentId,
        total_ttc: totalTTC,
        line_count: linesPrepared.length,
      },
    });

    return json(200, {
      invoice: inv,
      payment_id: createdPaymentId,
      rental_id: resolvedRentalId,
    });
  } catch (e) {
    console.error("generate-invoice error", e);
    return json(500, { error: String(e) });
  }
});
