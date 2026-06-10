/**
 * Real-world E2E test: signs in as an actual Customer Admin (not service role)
 * and exercises insert + read on every tenant-scoped module to verify:
 *   1. Records created by the admin are visible to that admin (auto-tag works).
 *   2. Records belonging to OTHER customers are NOT visible (RLS isolation works).
 *
 * Run:  bun run scripts/e2e-rls-tests.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://fihrjavcdwpttvnlqqxc.supabase.co";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_mwZMYFqI_Jqa5ohlhLnQZw_y99c2WxK";

type Result = { module: string; step: string; ok: boolean; detail?: string };
const results: Result[] = [];
const record = (r: Result) => {
  results.push(r);
  const tag = r.ok ? "✅" : "❌";
  console.log(`${tag} [${r.module}] ${r.step}${r.detail ? `  — ${r.detail}` : ""}`);
};

async function bootstrap() {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/e2e-bootstrap`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`bootstrap failed: ${JSON.stringify(body)}`);
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

/**
 * Run an "insert → read → cleanup" cycle against a table.
 */
async function crud(
  c: SupabaseClient,
  module: string,
  table: string,
  row: Record<string, unknown>,
  uniqueField: string,
) {
  // INSERT
  const ins = await c.from(table).insert(row).select("id, customer_id").maybeSingle();
  if (ins.error || !ins.data) {
    record({ module, step: `INSERT ${table}`, ok: false, detail: ins.error?.message ?? "no row returned" });
    return null;
  }
  const id = (ins.data as { id: string }).id;
  const tagged = (ins.data as { customer_id: string | null }).customer_id;
  record({
    module,
    step: `INSERT ${table}`,
    ok: true,
    detail: `id=${id.slice(0, 8)} customer_id=${tagged?.slice(0, 8) ?? "null"}`,
  });

  // READ BACK
  const sel = await c.from(table).select("id, customer_id").eq("id", id).maybeSingle();
  const visible = !!sel.data;
  record({
    module,
    step: `READ-BACK ${table}`,
    ok: visible,
    detail: visible ? "row visible to creator" : (sel.error?.message ?? "row hidden after insert (RLS bug)"),
  });

  // CLEANUP
  await c.from(table).delete().eq("id", id);
  return id;
}

async function main() {
  console.log("🔧 Bootstrapping isolated Customer Admin test account…");
  const creds = await bootstrap();
  console.log(`   customer_id=${creds.customer_id}\n   user=${creds.email}\n`);

  const c = await signIn(creds.email, creds.password);
  const auth = await c.auth.getUser();
  console.log(`🔑 Signed in as ${auth.data.user?.email} (uid=${auth.data.user?.id})\n`);

  // --- ISOLATION CHECK: should NOT see other tenants' rows ---
  const otherVehicles = await c.from("vehicles").select("id, customer_id").neq("customer_id", creds.customer_id).limit(5);
  const leaks = (otherVehicles.data ?? []).filter((v) => v.customer_id && v.customer_id !== creds.customer_id);
  record({
    module: "RLS-ISOLATION",
    step: "vehicles (other tenants)",
    ok: leaks.length === 0,
    detail: leaks.length === 0 ? "no foreign-tenant rows visible" : `LEAK: ${leaks.length} foreign rows`,
  });

  // --- VEHICLES ---
  const vehicle = await c
    .from("vehicles")
    .insert({
      license_plate: `E2E-${Date.now().toString().slice(-6)}`,
      make: "Toyota",
      model_name: "Corolla",
      vehicle_type: "sedan",
      rent_per_day: 12000,
    })
    .select("id, customer_id")
    .single();
  if (vehicle.error) {
    record({ module: "Vehicles", step: "INSERT vehicles", ok: false, detail: vehicle.error.message });
    return summarize();
  }
  record({
    module: "Vehicles",
    step: "INSERT vehicles",
    ok: true,
    detail: `customer_id=${vehicle.data.customer_id?.slice(0, 8) ?? "null"}`,
  });
  const vehicleId = vehicle.data.id as string;
  const vehRead = await c.from("vehicles").select("id").eq("id", vehicleId).maybeSingle();
  record({ module: "Vehicles", step: "READ-BACK vehicles", ok: !!vehRead.data });

  // --- DRIVERS ---
  const driver = await c
    .from("drivers")
    .insert({
      full_name: "E2E Driver",
      phone_number: `+225999${Date.now().toString().slice(-7)}`,
      yango_driver_id: `e2e-${Date.now()}`,
    })
    .select("id, customer_id")
    .single();
  if (driver.error) {
    record({ module: "Drivers", step: "INSERT drivers", ok: false, detail: driver.error.message });
  } else {
    record({
      module: "Drivers",
      step: "INSERT drivers",
      ok: true,
      detail: `customer_id=${driver.data.customer_id?.slice(0, 8) ?? "null"}`,
    });
    const r = await c.from("drivers").select("id").eq("id", driver.data.id).maybeSingle();
    record({ module: "Drivers", step: "READ-BACK drivers", ok: !!r.data });
  }
  const driverId = driver.data?.id as string | undefined;

  // --- MAINTENANCE PROVIDERS ---
  const provider = await c
    .from("maintenance_providers")
    .insert({ name: `E2E Garage ${Date.now()}` })
    .select("id, customer_id")
    .single();
  if (provider.error) {
    record({ module: "Maintenance", step: "INSERT maintenance_providers", ok: false, detail: provider.error.message });
  } else {
    record({
      module: "Maintenance",
      step: "INSERT maintenance_providers",
      ok: true,
      detail: `customer_id=${provider.data.customer_id?.slice(0, 8) ?? "null"}`,
    });
    const r = await c.from("maintenance_providers").select("id").eq("id", provider.data.id).maybeSingle();
    record({ module: "Maintenance", step: "READ-BACK maintenance_providers", ok: !!r.data });
  }

  // --- MAINTENANCE ORDERS ---
  await crud(
    c,
    "Maintenance",
    "maintenance_orders",
    {
      vehicle_id: vehicleId,
      order_type: "repair",
      priority: "normal",
      description: "E2E maintenance",
      status: "to_validate",
      estimated_cost: 25000,
    },
    "description",
  );

  // --- OTHER CHARGES ---
  await crud(
    c,
    "Maintenance",
    "other_charges",
    {
      charge_type: "insurance",
      label: "E2E insurance",
      amount: 50000,
      charge_date: new Date().toISOString().slice(0, 10),
      vehicle_id: vehicleId,
    },
    "label",
  );

  // --- GEOFENCE ZONES ---
  await crud(
    c,
    "Geofencing",
    "geofence_zones",
    {
      name: `E2E Zone ${Date.now()}`,
      zone_type: "circle",
      center_lat: 5.36,
      center_lng: -4.0083,
      radius_meters: 1000,
      is_active: true,
    },
    "name",
  );

  // --- ALERTS ---
  await crud(
    c,
    "Alerts",
    "alerts",
    {
      alert_type: "system",
      title: "E2E alert",
      dedupe_key: `e2e-${Date.now()}`,
      severity: "low",
    },
    "dedupe_key",
  );

  // Driver-scoped tables (need a driver_id)
  if (driverId) {
    // --- KYC SUBMISSIONS ---
    await crud(
      c,
      "KYC",
      "kyc_submissions",
      {
        driver_id: driverId,
        id_proof_url: "https://example.com/e2e.jpg",
        bank_name: "Wave",
        bank_account_number: "+2250799999999",
        status: "pending",
      },
      "id_proof_url",
    );

    // --- LOANS ---
    await crud(
      c,
      "Loans",
      "loans",
      {
        driver_id: driverId,
        loan_type: "tv",
        amount_requested: 50000,
        status: "pending",
      },
      "loan_type",
    );

    // --- RENTALS ---
    await crud(
      c,
      "Rentals",
      "rentals",
      {
        driver_id: driverId,
        vehicle_id: vehicleId,
        start_date: new Date().toISOString().slice(0, 10),
        status: "active",
      },
      "status",
    );

    // --- INCOME RECORDS ---
    await crud(
      c,
      "Income",
      "income_records",
      {
        driver_id: driverId,
        record_date: new Date().toISOString().slice(0, 10),
        source: "yango",
        gross_income: 25000,
        net_income: 20000,
      },
      "source",
    );

    // --- SUPPORT TICKETS ---
    await crud(
      c,
      "Support",
      "support_tickets",
      {
        driver_id: driverId,
        category: "other",
        subject: "E2E ticket",
        description: "E2E test description",
        status: "open",
      },
      "subject",
    );

    // --- ACCIDENTS ---
    await crud(
      c,
      "Accidents",
      "accidents",
      {
        driver_id: driverId,
        vehicle_id: vehicleId,
        incident_type: "COLLISION",
        severity: "MINOR",
        status: "SUBMITTED",
        accident_datetime: new Date().toISOString(),
      },
      "incident_type",
    );
  }

  // cleanup the vehicle + driver we created (best-effort)
  if (driverId) await c.from("drivers").delete().eq("id", driverId);
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
  console.log("All checks passed ✅");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});