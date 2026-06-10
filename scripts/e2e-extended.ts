/**
 * Extended real-world E2E tests for modules not covered by e2e-workflows.ts:
 * Maintenance, Alerts, Notifications, Invoices, Income Approvals, Wallets,
 * Vehicle Positions (GPS), Geofence Zones.
 *
 * Runs as an authenticated Customer Admin (NOT service role) — verifies RLS,
 * customer_id auto-tagging, and state transitions.
 *
 * Run: bun run scripts/e2e-extended.ts
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

  const stamp = Date.now();

  // ---------- fixtures ----------
  const vehIns = await c
    .from("vehicles")
    .insert({
      license_plate: `EX-${stamp.toString().slice(-6)}`,
      make: "Toyota",
      model_name: "Hilux",
      vehicle_type: "cargo",
      rent_per_day: 14000,
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
      full_name: "Extended Test Driver",
      phone_number: `+225877${stamp.toString().slice(-7)}`,
      yango_driver_id: `ex-${stamp}`,
      kyc_status: "verified",
      driver_status: "active",
    })
    .select("id")
    .single();
  if (drvIns.error) {
    log({ module: "Setup", step: "create driver", ok: false, detail: drvIns.error.message });
    await c.from("vehicles").delete().eq("id", vehicleId);
    return summarize();
  }
  const driverId = drvIns.data.id as string;
  log({ module: "Setup", step: "vehicle + driver", ok: true });

  // =====================================================================
  // MAINTENANCE — provider → order → item → complete
  // =====================================================================
  const prov = await c
    .from("maintenance_providers")
    .insert({ name: `Garage ${stamp}`, phone: "+2250101010101", is_active: true })
    .select("id")
    .single();
  log({ module: "Maintenance", step: "create provider", ok: !prov.error, detail: prov.error?.message });

  const ord = await c
    .from("maintenance_orders")
    .insert({
      vehicle_id: vehicleId,
      provider_id: prov.data?.id,
      order_type: "repair",
      status: "draft",
      priority: "high",
      description: "Vidange + freins",
      estimated_cost: 45000,
    })
    .select("id, customer_id, status")
    .single();
  log({
    module: "Maintenance",
    step: "create order (RLS + auto customer_id)",
    ok: !ord.error && ord.data?.customer_id === creds.customer_id,
    detail: ord.error?.message ?? `customer_id=${ord.data?.customer_id?.slice(0, 8)}`,
  });

  if (ord.data?.id) {
    const item = await c.from("maintenance_order_items").insert({
      order_id: ord.data.id,
      label: "Plaquettes de frein",
      quantity: 2,
      unit_cost: 12500,
      item_type: "part",
    });
    log({ module: "Maintenance", step: "add line item", ok: !item.error, detail: item.error?.message });

    const readback = await c
      .from("maintenance_orders")
      .select("id, status, maintenance_order_items(id, label)")
      .eq("id", ord.data.id)
      .single();
    log({
      module: "Maintenance",
      step: "read order with items (the bug user reported)",
      ok: !readback.error && (readback.data?.maintenance_order_items?.length ?? 0) > 0,
      detail: readback.error?.message,
    });

    // status transitions: draft → scheduled → in_progress → completed
    for (const next of ["scheduled", "in_progress", "completed"] as const) {
      const t = await c
        .from("maintenance_orders")
        .update({
          status: next,
          ...(next === "completed" ? { completed_at: new Date().toISOString(), actual_cost: 45000 } : {}),
        })
        .eq("id", ord.data.id)
        .select("status")
        .single();
      log({
        module: "Maintenance",
        step: `status → ${next}`,
        ok: !t.error && t.data?.status === next,
        detail: t.error?.message,
      });
    }

    await c.from("maintenance_orders").delete().eq("id", ord.data.id);
  }
  if (prov.data?.id) await c.from("maintenance_providers").delete().eq("id", prov.data.id);

  // =====================================================================
  // ALERTS — create → acknowledge → resolve
  // =====================================================================
  const alert = await c
    .from("alerts")
    .insert({
      alert_type: "kyc_expiry",
      severity: "high",
      title: "Permis bientôt expiré",
      message: "Le permis du conducteur expire dans 7 jours.",
      driver_id: driverId,
      dedupe_key: `kyc_expiry:${driverId}:${stamp}`,
    })
    .select("id, customer_id, status")
    .single();
  log({
    module: "Alerts",
    step: "create + auto customer_id",
    ok: !alert.error && alert.data?.customer_id === creds.customer_id,
    detail: alert.error?.message ?? `customer=${alert.data?.customer_id?.slice(0, 8)}`,
  });

  if (alert.data?.id) {
    const ack = await c
      .from("alerts")
      .update({ status: "acknowledged", acknowledged_at: new Date().toISOString() })
      .eq("id", alert.data.id)
      .select("status")
      .single();
    log({ module: "Alerts", step: "acknowledge", ok: !ack.error && ack.data?.status === "acknowledged", detail: ack.error?.message });

    const res = await c
      .from("alerts")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", alert.data.id)
      .select("status")
      .single();
    log({ module: "Alerts", step: "resolve", ok: !res.error && res.data?.status === "resolved", detail: res.error?.message });

    await c.from("alerts").delete().eq("id", alert.data.id);
  }

  // =====================================================================
  // NOTIFICATIONS — admin sends to driver
  // =====================================================================
  const notif = await c
    .from("notifications")
    .insert({
      driver_id: driverId,
      title: "Test notification",
      message: "Bonjour, ceci est un test.",
      notification_type: "announcement",
    })
    .select("id, customer_id")
    .single();
  log({
    module: "Notifications",
    step: "admin → driver insert (customer_id auto)",
    ok: !notif.error && notif.data?.customer_id === creds.customer_id,
    detail: notif.error?.message ?? `customer=${notif.data?.customer_id?.slice(0, 8)}`,
  });
  if (notif.data?.id) {
    const read = await c.from("notifications").select("id, is_read").eq("id", notif.data.id).single();
    log({ module: "Notifications", step: "read-back", ok: !read.error, detail: read.error?.message });
    await c.from("notifications").delete().eq("id", notif.data.id);
  }

  // =====================================================================
  // INCOME RECORDS — driver-style entry approved by admin
  // =====================================================================
  const inc = await c
    .from("income_records")
    .insert({
      driver_id: driverId,
      record_date: new Date().toISOString().slice(0, 10),
      gross_income: 28000,
      net_income: 22000,
      trip_count: 14,
      source: "manual",
      status: "pending",
    })
    .select("id, customer_id, status")
    .single();
  log({
    module: "Income",
    step: "submit pending",
    ok: !inc.error && inc.data?.customer_id === creds.customer_id,
    detail: inc.error?.message ?? `customer=${inc.data?.customer_id?.slice(0, 8)}`,
  });
  if (inc.data?.id) {
    const appr = await c
      .from("income_records")
      .update({ status: "approved", reviewed_at: new Date().toISOString() })
      .eq("id", inc.data.id)
      .select("status")
      .single();
    log({ module: "Income", step: "admin approve", ok: !appr.error && appr.data?.status === "approved", detail: appr.error?.message });
    await c.from("income_records").delete().eq("id", inc.data.id);
  }

  // =====================================================================
  // WALLETS — create + credit transaction
  // =====================================================================
  const wallet = await c
    .from("driver_wallets")
    .insert({ driver_id: driverId, balance: 0 })
    .select("id, customer_id, balance")
    .single();
  log({
    module: "Wallets",
    step: "create wallet",
    ok: !wallet.error && wallet.data?.customer_id === creds.customer_id,
    detail: wallet.error?.message ?? `customer=${wallet.data?.customer_id?.slice(0, 8)}`,
  });
  if (wallet.data?.id) {
    const credit = await c
      .from("driver_wallet_transactions")
      .insert({
        wallet_id: wallet.data.id,
        driver_id: driverId,
        amount: 5000,
        type: "credit",
        reason: "Bonus test",
      })
      .select("id")
      .single();
    log({ module: "Wallets", step: "credit transaction", ok: !credit.error, detail: credit.error?.message });
    if (credit.data?.id) await c.from("driver_wallet_transactions").delete().eq("id", credit.data.id);
    await c.from("driver_wallets").delete().eq("id", wallet.data.id);
  }

  // =====================================================================
  // INVOICE — manual issue → mark paid (rental_id null = standalone)
  // =====================================================================
  const inv = await c
    .from("invoice")
    .insert({
      driver_id: driverId,
      invoice_kind: "invoice",
      status: "issued",
      subtotal_ht: 50000,
      vat_amount: 0,
      total_ttc: 50000,
      issued_at: new Date().toISOString(),
      period_start: new Date().toISOString().slice(0, 10),
      period_end: new Date().toISOString().slice(0, 10),
      driver_snapshot_name: "Extended Test Driver",
    })
    .select("id, customer_id, status, invoice_number")
    .single();
  log({
    module: "Invoices",
    step: "issue manual invoice",
    ok: !inv.error && inv.data?.customer_id === creds.customer_id,
    detail: inv.error?.message ?? `#${inv.data?.invoice_number ?? '∅'}`,
  });
  if (inv.data?.id) {
    const paid = await c
      .from("invoice")
      .update({ status: "paid", paid_at: new Date().toISOString(), amount_paid: 50000 })
      .eq("id", inv.data.id)
      .select("status, amount_paid, remaining_due")
      .single();
    log({
      module: "Invoices",
      step: "mark paid (remaining_due → 0)",
      ok: !paid.error && paid.data?.status === "paid" && paid.data?.remaining_due === 0,
      detail: paid.error?.message ?? `remaining=${paid.data?.remaining_due}`,
    });
    await c.from("invoice").delete().eq("id", inv.data.id);
  }

  // =====================================================================
  // GEOFENCE ZONE — admin creates polygon
  // =====================================================================
  const zone = await c
    .from("geofence_zones")
    .insert({
      name: `Zone Test ${stamp}`,
      zone_type: "allowed",
      polygon: { type: "Polygon", coordinates: [[[-4.0,5.3],[-4.0,5.4],[-3.9,5.4],[-3.9,5.3],[-4.0,5.3]]] },
      is_active: true,
    })
    .select("id, customer_id")
    .single();
  log({
    module: "Geofence",
    step: "create zone",
    ok: !zone.error && (zone.data?.customer_id === creds.customer_id || zone.data?.customer_id === null),
    detail: zone.error?.message ?? `customer=${zone.data?.customer_id?.slice(0, 8) ?? 'null'}`,
  });
  if (zone.data?.id) await c.from("geofence_zones").delete().eq("id", zone.data.id);

  // =====================================================================
  // VEHICLE POSITIONS — admin can insert telemetry cache row
  // =====================================================================
  const pos = await c
    .from("vehicle_positions")
    .insert({
      vehicle_id: vehicleId,
      latitude: 5.345,
      longitude: -4.005,
      recorded_at: new Date().toISOString(),
      speed_kph: 42,
      heading: 90,
    })
    .select("id")
    .single();
  log({ module: "GPS", step: "insert vehicle_position", ok: !pos.error, detail: pos.error?.message });
  if (pos.data?.id) await c.from("vehicle_positions").delete().eq("id", pos.data.id);

  // ---------- teardown ----------
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
  console.log("All extended checks passed ✅");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});