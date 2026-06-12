/**
 * QA Phase 4 — Seed script (SAFE: only touches the isolated E2E tenant).
 *
 * 1. Calls the `e2e-bootstrap` edge function (verify_jwt=false, designed for
 *    tests) → idempotent "E2E Test Fleet Co" tenant + customer-admin creds.
 * 2. Signs in as that admin (real JWT, real RLS) and ensures one AVAILABLE
 *    vehicle exists in the tenant (insert auto-tags customer_id via RLS).
 * 3. Calls `create-managed-driver` with the admin JWT → a driver with
 *    phone + PIN login inside the same tenant (exercises the shipped
 *    admin-provisioning path).
 * 4. Writes credentials to /tmp/qa-creds.json for the Playwright scripts.
 *
 * Run:  bun run scripts/qa/00-seed.ts
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://fihrjavcdwpttvnlqqxc.supabase.co";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_mwZMYFqI_Jqa5ohlhLnQZw_y99c2WxK";

const QA_PLATE = "QA-E2E-100";
const QA_PIN = "4271";

async function main() {
  // 1. bootstrap
  const res = await fetch(`${SUPABASE_URL}/functions/v1/e2e-bootstrap`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const boot = await res.json();
  if (!boot.ok) throw new Error(`bootstrap failed: ${JSON.stringify(boot)}`);
  console.log(`✅ bootstrap: customer=${boot.customer_id} admin=${boot.email}`);

  // 2. sign in as E2E customer admin
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: auth, error: signErr } = await c.auth.signInWithPassword({
    email: boot.email,
    password: boot.password,
  });
  if (signErr) throw new Error(`signIn: ${signErr.message}`);
  const jwt = auth.session!.access_token;

  // 3. ensure an available vehicle in the tenant
  let { data: veh } = await c
    .from("vehicles")
    .select("id, status, customer_id")
    .eq("license_plate", QA_PLATE)
    .maybeSingle();
  if (!veh) {
    const ins = await c
      .from("vehicles")
      .insert({
        license_plate: QA_PLATE,
        make: "Toyota",
        model_name: "Yaris QA",
        vehicle_type: "sedan",
        rent_per_day: 15000,
        status: "available",
      })
      .select("id, status, customer_id")
      .single();
    if (ins.error) throw new Error(`vehicle insert: ${ins.error.message}`);
    veh = ins.data;
    console.log(`✅ vehicle created: ${veh.id} (${QA_PLATE})`);
  } else {
    // SAFETY: only reuse if it belongs to OUR e2e tenant
    if (veh.customer_id !== boot.customer_id) {
      throw new Error(`SAFETY ABORT: plate ${QA_PLATE} belongs to another tenant`);
    }
    if (veh.status !== "available") {
      await c.from("vehicles").update({ status: "available" }).eq("id", veh.id);
    }
    console.log(`✅ vehicle reused: ${veh.id} (${QA_PLATE}, was ${veh.status})`);
  }

  // 4. create a managed driver (phone+PIN) in the tenant
  const stamp = Date.now().toString().slice(-8);
  const phone = `+225 05 ${stamp.slice(0, 2)} ${stamp.slice(2, 4)} ${stamp.slice(4, 6)} ${stamp.slice(6, 8)}`;
  const r = await fetch(`${SUPABASE_URL}/functions/v1/create-managed-driver`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fullName: "QA Chauffeur E2E", phoneNumber: phone, pin: QA_PIN }),
  });
  const drv = await r.json();
  if (!r.ok || drv.error) throw new Error(`create-managed-driver: ${JSON.stringify(drv)}`);
  console.log(`✅ driver created: ${JSON.stringify(drv)}`);

  const driverId = drv.driverId ?? drv.driver_id ?? drv.driver?.id;

  // Mark the driver KYC-verified + active so login isn't gated (admin-side
  // update inside our own tenant).
  const upd = await c
    .from("drivers")
    .update({ kyc_status: "verified", driver_status: "active" })
    .eq("id", driverId)
    .select("id, customer_id, kyc_status, driver_status");
  if (upd.error) console.log(`⚠️ driver activate failed: ${upd.error.message}`);
  else console.log(`✅ driver activated: ${JSON.stringify(upd.data)}`);

  const creds = {
    supabase_url: SUPABASE_URL,
    customer_id: boot.customer_id,
    admin_email: boot.email,
    admin_password: boot.password,
    driver_id: driverId,
    driver_phone: phone,
    driver_pin: QA_PIN,
    vehicle_id: veh.id,
    vehicle_plate: QA_PLATE,
  };
  writeFileSync("/tmp/qa-creds.json", JSON.stringify(creds, null, 2));
  console.log("✅ creds written to /tmp/qa-creds.json");
  console.log(JSON.stringify(creds, null, 2));
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
