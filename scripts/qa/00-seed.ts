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

async function seedLayer3ACreditEngine(c: ReturnType<typeof createClient>, customerId: string) {
  const vendorId = "35000000-0000-0000-0000-000000000001";
  const vehicleProductId = "35100000-0000-0000-0000-000000000001";
  const motoProductId = "35100000-0000-0000-0000-000000000002";
  const phoneProductId = "35100000-0000-0000-0000-000000000003";
  const vehicleVersionId = "35200000-0000-0000-0000-000000000001";
  const motoVersionId = "35200000-0000-0000-0000-000000000002";
  const phoneVersionId = "35200000-0000-0000-0000-000000000003";
  const assetId = "35300000-0000-0000-0000-000000000001";

  try {
    const vendor = await c.from("vendors").upsert({
      vendor_id: vendorId,
      customer_id: customerId,
      vendor_name: "QA DAM Africa Fleet",
      vendor_type: "FLEET_PROVIDER",
      status: "ACTIVE",
      country: "CI",
      contact_information_json: { qa: true },
    }, { onConflict: "vendor_id" });
    if (vendor.error) throw vendor.error;

    const products = [
      {
        product_id: vehicleProductId,
        customer_id: customerId,
        vendor_id: vendorId,
        product_type: "CAR_OWNERSHIP",
        name: "QA Vehicle Ownership Program",
        description: "Layer 3A QA vehicle ownership launch path.",
        status: "ACTIVE",
        rules_json: {
          min_score: 720,
          manual_review_below_score: 650,
          default_asset_price: 4000000,
          currency_code: "XOF",
          down_payment: { type: "PERCENTAGE", percent: 10, currency_code: "XOF" },
        },
        eligibility_rules_json: { min_score: 720, score_source: "driver_scores.current_score" },
        down_payment_rules_json: { type: "PERCENTAGE", percent: 10, currency_code: "XOF" },
        asset_rules_json: { asset_type: "VEHICLE", requires_possession_confirmation: true },
        activation_rules_json: { requires_signed_agreement: true, requires_down_payment_paid: true, requires_possession_confirmed: true },
        visibility_rules_json: { driver_visible: true, qa: true },
      },
      {
        product_id: motoProductId,
        customer_id: customerId,
        vendor_id: vendorId,
        product_type: "MOTORCYCLE_FINANCING",
        name: "QA Motorcycle Financing",
        description: "Layer 3A QA motorcycle configurable product.",
        status: "ACTIVE",
        rules_json: {
          min_score: 650,
          manual_review_below_score: 600,
          default_asset_price: 1500000,
          currency_code: "XOF",
          down_payment: { type: "PERCENTAGE", percent: 15, currency_code: "XOF" },
        },
        eligibility_rules_json: { min_score: 650, score_source: "driver_scores.current_score" },
        down_payment_rules_json: { type: "PERCENTAGE", percent: 15, currency_code: "XOF" },
        asset_rules_json: { asset_type: "MOTORCYCLE", requires_possession_confirmation: true },
        activation_rules_json: { requires_signed_agreement: true, requires_down_payment_paid: true, requires_possession_confirmed: true },
        visibility_rules_json: { driver_visible: true, qa: true },
      },
      {
        product_id: phoneProductId,
        customer_id: customerId,
        vendor_id: vendorId,
        product_type: "PHONE_FINANCING",
        name: "QA Phone Financing",
        description: "Layer 3A QA phone configurable product.",
        status: "ACTIVE",
        rules_json: {
          min_score: 600,
          manual_review_below_score: 550,
          default_asset_price: 500000,
          currency_code: "XOF",
          down_payment: { type: "PERCENTAGE", percent: 10, currency_code: "XOF" },
        },
        eligibility_rules_json: { min_score: 600, score_source: "driver_scores.current_score" },
        down_payment_rules_json: { type: "PERCENTAGE", percent: 10, currency_code: "XOF" },
        asset_rules_json: { asset_type: "PHONE", requires_possession_confirmation: true },
        activation_rules_json: { requires_signed_agreement: true, requires_down_payment_paid: true, requires_possession_confirmed: true },
        visibility_rules_json: { driver_visible: true, qa: true },
      },
    ];

    const productSeed = await c.from("credit_products").upsert(products, { onConflict: "product_id" });
    if (productSeed.error) throw productSeed.error;

    const versionRows = [
      { version_id: vehicleVersionId, customer_id: customerId, product_id: vehicleProductId, version_number: 1, effective_from: "2026-06-15T00:00:00Z", status: "ACTIVE", rules_snapshot_json: products[0].rules_json },
      { version_id: motoVersionId, customer_id: customerId, product_id: motoProductId, version_number: 1, effective_from: "2026-06-15T00:00:00Z", status: "ACTIVE", rules_snapshot_json: products[1].rules_json },
      { version_id: phoneVersionId, customer_id: customerId, product_id: phoneProductId, version_number: 1, effective_from: "2026-06-15T00:00:00Z", status: "ACTIVE", rules_snapshot_json: products[2].rules_json },
    ];
    const versions = await c.from("product_versions").upsert(versionRows, { onConflict: "version_id" });
    if (versions.error) throw versions.error;

    const asset = await c.from("financed_assets").upsert({
      asset_id: assetId,
      customer_id: customerId,
      asset_type: "VEHICLE",
      description: "QA Suzuki Dzire",
      vendor_id: vendorId,
      purchase_price: 4000000,
      purchase_price_currency_code: "XOF",
      residual_value: 1200000,
      residual_value_currency_code: "XOF",
      asset_condition: "NEW",
      fulfillment_status: "PENDING",
      possession_status: "NOT_POSSESSED",
      status: "AVAILABLE",
    }, { onConflict: "asset_id" });
    if (asset.error) throw asset.error;

    console.log("✅ Layer 3A credit catalog seeded");
    return { vehicleProductId, vehicleVersionId, assetId };
  } catch (error) {
    console.log(`⚠️ Layer 3A seed skipped: ${(error as Error).message}`);
    return null;
  }
}

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

  await c.from("driver_scores").upsert({
    driver_id: driverId,
    customer_id: boot.customer_id,
    current_score: 780,
  }, { onConflict: "customer_id,driver_id" }).then(({ error }) => {
    if (error) console.log(`⚠️ driver score seed failed: ${error.message}`);
    else console.log("✅ driver score seeded: 780");
  });

  const layer3a = await seedLayer3ACreditEngine(c, boot.customer_id);

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
    layer3a,
  };
  writeFileSync("/tmp/qa-creds.json", JSON.stringify(creds, null, 2));
  console.log("✅ creds written to /tmp/qa-creds.json");
  console.log(JSON.stringify(creds, null, 2));
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
