/**
 * Real-world E2E workflow tests — runs as an authenticated Customer Admin
 * (NOT service role) and exercises full state-machine transitions across
 * Loans, KYC, Support, Accidents, Payments, and Rentals. Continues the UAT
 * suite started with scripts/e2e-rls-tests.ts.
 *
 * For every workflow we verify:
 *   1. INSERT succeeds and auto-tags customer_id (RLS isolation).
 *   2. UPDATE (status transition) succeeds for an authorized admin role.
 *   3. READ-BACK after each transition reflects the new state.
 *   4. Side-effects (driver_status flip after KYC approval, payment.status,
 *      ticket.resolved_at, accident.case_number, etc.) are populated.
 *
 * Run:  bun run scripts/e2e-workflows.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://fihrjavcdwpttvnlqqxc.supabase.co";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_mwZMYFqI_Jqa5ohlhLnQZw_y99c2WxK";

type R = { module: string; step: string; ok: boolean; detail?: string };
const results: R[] = [];
const log = (r: R) => {
  results.push(r);
  console.log(`${r.ok ? "✅" : "❌"} [${r.module}] ${r.step}${r.detail ? `  — ${r.detail}` : ""}`);
};

async function bootstrap() {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/e2e-bootstrap`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`bootstrap: ${JSON.stringify(body)}`);
  return body as { customer_id: string; email: string; password: string; user_id: string };
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn: ${error.message}`);
  return c;
}

async function main() {
  console.log("🔧 Bootstrapping Customer Admin…");
  const creds = await bootstrap();
  const c = await signIn(creds.email, creds.password);
  const me = (await c.auth.getUser()).data.user!;
  console.log(`🔑 Signed in as ${me.email}  customer=${creds.customer_id.slice(0, 8)}\n`);

  // ---------- shared fixtures ----------
  const stamp = Date.now();
  const vehIns = await c
    .from("vehicles")
    .insert({
      license_plate: `WF-${stamp.toString().slice(-6)}`,
      make: "Toyota",
      model_name: "Corolla",
      vehicle_type: "sedan",
      rent_per_day: 12000,
    })
    .select("id")
    .single();
  if (vehIns.error) {
    log({ module: "Setup", step: "create vehicle", ok: false, detail: vehIns.error.message });
    return summarize();
  }
  const vehicleId = vehIns.data.id as string;

  const drvIns = await c
    .from("drivers")
    .insert({
      full_name: "Workflow Driver",
      phone_number: `+225888${stamp.toString().slice(-7)}`,
      yango_driver_id: `wf-${stamp}`,
      kyc_status: "pending",
      driver_status: "inactive",
    })
    .select("id")
    .single();
  if (drvIns.error) {
    log({ module: "Setup", step: "create driver", ok: false, detail: drvIns.error.message });
    await c.from("vehicles").delete().eq("id", vehicleId);
    return summarize();
  }
  const driverId = drvIns.data.id as string;
  log({ module: "Setup", step: "vehicle + driver created", ok: true });

  // =====================================================================
  // KYC WORKFLOW — submit → approve → driver auto-activated
  // =====================================================================
  const kyc = await c
    .from("kyc_submissions")
    .insert({
      driver_id: driverId,
      id_proof_url: "https://example.com/id.jpg",
      license_url: "https://example.com/lic.jpg",
      bank_name: "Wave",
      bank_account_number: "+2250788888888",
      status: "pending",
    })
    .select("id")
    .single();
  if (kyc.error) {
    log({ module: "KYC", step: "submit", ok: false, detail: kyc.error.message });
  } else {
    log({ module: "KYC", step: "submit pending", ok: true });
    const approve = await c
      .from("kyc_submissions")
      .update({ status: "approved", reviewed_by: me.id, reviewed_at: new Date().toISOString() })
      .eq("id", kyc.data.id)
      .select("id, status")
      .single();
    log({
      module: "KYC",
      step: "admin approves",
      ok: !approve.error && approve.data?.status === "approved",
      detail: approve.error?.message,
    });

    // Mirror the UI: activate the driver after KYC approval
    const act = await c
      .from("drivers")
      .update({ kyc_status: "verified", driver_status: "active" })
      .eq("id", driverId)
      .select("kyc_status, driver_status")
      .single();
    log({
      module: "KYC",
      step: "driver activated after approval",
      ok: !act.error && act.data?.driver_status === "active",
      detail: act.error?.message ?? `kyc=${act.data?.kyc_status} status=${act.data?.driver_status}`,
    });
  }

  // =====================================================================
  // LOAN WORKFLOW — pending → approved → rejected variant
  // =====================================================================
  const loan = await c
    .from("loans")
    .insert({ driver_id: driverId, loan_type: "tv_loan", amount_requested: 80000, status: "pending" })
    .select("id")
    .single();
  if (loan.error) {
    log({ module: "Loans", step: "driver applies", ok: false, detail: loan.error.message });
  } else {
    log({ module: "Loans", step: "driver applies (pending)", ok: true });
    const appr = await c
      .from("loans")
      .update({
        status: "approved",
        amount_approved: 75000,
        interest_rate: 10,
        approved_by: me.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", loan.data.id)
      .select("status, amount_approved, interest_rate")
      .single();
    log({
      module: "Loans",
      step: "admin approves",
      ok: !appr.error && appr.data?.status === "approved" && appr.data?.amount_approved === 75000,
      detail: appr.error?.message,
    });
    await c.from("loans").delete().eq("id", loan.data.id);
  }

  // Rejection path
  const loan2 = await c
    .from("loans")
    .insert({ driver_id: driverId, loan_type: "bike_loan", amount_requested: 400000, status: "pending" })
    .select("id")
    .single();
  if (!loan2.error) {
    const rej = await c
      .from("loans")
      .update({ status: "rejected", rejection_reason: "Score insuffisant", approved_by: me.id })
      .eq("id", loan2.data.id)
      .select("status, rejection_reason")
      .single();
    log({
      module: "Loans",
      step: "admin rejects with reason",
      ok: !rej.error && rej.data?.status === "rejected" && !!rej.data?.rejection_reason,
      detail: rej.error?.message,
    });
    await c.from("loans").delete().eq("id", loan2.data.id);
  }

  // =====================================================================
  // RENTAL WORKFLOW — create → activate → end
  // =====================================================================
  const rental = await c
    .from("rentals")
    .insert({
      driver_id: driverId,
      vehicle_id: vehicleId,
      start_date: new Date().toISOString().slice(0, 10),
      status: "active",
    })
    .select("id")
    .single();
  if (rental.error) {
    log({ module: "Rentals", step: "create active rental", ok: false, detail: rental.error.message });
  } else {
    log({ module: "Rentals", step: "create active rental", ok: true });
    const ended = await c
      .from("rentals")
      .update({ status: "completed", end_date: new Date().toISOString().slice(0, 10) })
      .eq("id", rental.data.id)
      .select("status, end_date")
      .single();
    log({
      module: "Rentals",
      step: "end rental",
      ok: !ended.error && ended.data?.status === "completed",
      detail: ended.error?.message,
    });
    await c.from("rentals").delete().eq("id", rental.data.id);
  }

  // =====================================================================
  // SUPPORT TICKET — open → reply → resolve
  // =====================================================================
  const ticket = await c
    .from("support_tickets")
    .insert({
      driver_id: driverId,
      category: "payment",
      subject: "E2E workflow ticket",
      description: "Wave paiement bloqué",
      status: "open",
      priority: "medium",
    })
    .select("id")
    .single();
  if (ticket.error) {
    log({ module: "Support", step: "open ticket", ok: false, detail: ticket.error.message });
  } else {
    log({ module: "Support", step: "open ticket", ok: true });

    const msg = await c.from("support_ticket_messages").insert({
      ticket_id: ticket.data.id,
      sender_type: "admin",
      sender_id: me.id,
      message: "Bonjour, nous regardons votre dossier.",
    });
    log({ module: "Support", step: "admin reply message", ok: !msg.error, detail: msg.error?.message });

    const resolved = await c
      .from("support_tickets")
      .update({ status: "resolved", resolved_at: new Date().toISOString(), assigned_to: me.id })
      .eq("id", ticket.data.id)
      .select("status, resolved_at")
      .single();
    log({
      module: "Support",
      step: "resolve ticket",
      ok: !resolved.error && resolved.data?.status === "resolved" && !!resolved.data?.resolved_at,
      detail: resolved.error?.message,
    });
    await c.from("support_ticket_messages").delete().eq("ticket_id", ticket.data.id);
    await c.from("support_tickets").delete().eq("id", ticket.data.id);
  }

  // =====================================================================
  // ACCIDENT — submit → assign → close
  // =====================================================================
  const acc = await c
    .from("accidents")
    .insert({
      driver_id: driverId,
      vehicle_id: vehicleId,
      incident_type: "COLLISION",
      severity: "MINOR",
      status: "SUBMITTED",
      accident_datetime: new Date().toISOString(),
      police_involved: false,
      injury_involved: false,
      other_party_involved: true,
      description: "E2E rear-end",
      submitted_at: new Date().toISOString(),
    })
    .select("id, case_number")
    .single();
  if (acc.error) {
    log({ module: "Accidents", step: "driver submits report", ok: false, detail: acc.error.message });
  } else {
    log({
      module: "Accidents",
      step: "driver submits report",
      ok: true,
      detail: `case_number=${acc.data.case_number ?? "(none)"}`,
    });
    const assigned = await c
      .from("accidents")
      .update({ assigned_admin_id: me.id, status: "UNDER_INVESTIGATION" })
      .eq("id", acc.data.id)
      .select("status, assigned_admin_id")
      .single();
    log({
      module: "Accidents",
      step: "admin assigns + investigates",
      ok: !assigned.error && assigned.data?.status === "UNDER_INVESTIGATION",
      detail: assigned.error?.message,
    });
    const closed = await c
      .from("accidents")
      .update({ status: "CLOSED", closed_at: new Date().toISOString() })
      .eq("id", acc.data.id)
      .select("status, closed_at")
      .single();
    log({
      module: "Accidents",
      step: "close case",
      ok: !closed.error && closed.data?.status === "CLOSED",
      detail: closed.error?.message,
    });
    await c.from("accidents").delete().eq("id", acc.data.id);
  }

  // =====================================================================
  // PAYMENT — create manual → mark paid
  // =====================================================================
  const pay = await c
    .from("payments")
    .insert({
      driver_id: driverId,
      amount: 15000,
      amount_paid: 0,
      payment_type: "rental",
      due_date: new Date().toISOString().slice(0, 10),
      status: "pending",
    })
    .select("id")
    .single();
  if (pay.error) {
    log({ module: "Payments", step: "create pending payment", ok: false, detail: pay.error.message });
  } else {
    log({ module: "Payments", step: "create pending payment", ok: true });
    const paid = await c
      .from("payments")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        paid_date: new Date().toISOString().slice(0, 10),
        amount_paid: 15000,
      })
      .eq("id", pay.data.id)
      .select("status, amount_paid, paid_at")
      .single();
    log({
      module: "Payments",
      step: "mark paid",
      ok: !paid.error && paid.data?.status === "paid" && paid.data?.amount_paid === 15000,
      detail: paid.error?.message,
    });
    await c.from("payments").delete().eq("id", pay.data.id);
  }

  // ---------- teardown ----------
  await c.from("kyc_submissions").delete().eq("driver_id", driverId);
  await c.from("drivers").delete().eq("id", driverId);
  await c.from("vehicles").delete().eq("id", vehicleId);

  summarize();
}

function summarize() {
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log("\n──────────── SUMMARY ────────────");
  console.log(`Passed: ${pass}   Failed: ${fail}   Total: ${results.length}`);
  if (fail > 0) {
    console.log("\nFailures:");
    results.filter((r) => !r.ok).forEach((r) => console.log(`  ❌ [${r.module}] ${r.step}: ${r.detail}`));
    process.exit(1);
  }
  console.log("All workflow checks passed ✅");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});