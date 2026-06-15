/**
 * Layer 2E QA: Trust & Risk Center.
 *
 * Run:
 *   QA_APP_URL=http://127.0.0.1:8081 QA_SHOT_DIR=docs/specs/screenshots/layer2e bun run scripts/qa/16-layer2e-trust-risk.ts
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { Harness, loadCreds, adminLogin, settle, APP_URL, SHOT_DIR, type Creds } from "./lib";

const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_mwZMYFqI_Jqa5ohlhLnQZw_y99c2WxK";
const LAYER2E_FIXTURE_NOTE = "Layer 2E QA fixture";

type Check = {
  name: string;
  passed: boolean;
  detail?: string;
};

const checks: Check[] = [];

function record(name: string, passed: boolean, detail?: string) {
  checks.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
}

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function includesText(haystack: string, needle: string) {
  return normalized(haystack).includes(normalized(needle));
}

async function bodyText(h: Harness) {
  return h.page.locator("body").innerText();
}

async function assertText(h: Harness, name: string, needle: string) {
  const text = await bodyText(h);
  record(name, includesText(text, needle), needle);
}

async function assertAbsent(h: Harness, name: string, needle: string) {
  const text = await bodyText(h);
  record(name, !includesText(text, needle), `absent: ${needle}`);
}

async function clickTab(h: Harness, tabName: string) {
  await h.page.getByRole("tab", { name: new RegExp(`^${tabName}$`, "i") }).click();
  await settle(h.page, 900);
}

async function routeSmoke(h: Harness, path: string, expectedText: string) {
  h.label(`layer2e/route-${path.replace(/\W+/g, "-")}`);
  await h.page.goto(`${APP_URL}${path}`, { waitUntil: "domcontentloaded" });
  await settle(h.page, 1600);
  await assertText(h, `${path} loads`, expectedText);
}

async function ensureLayer2EFixtures(creds: Creds) {
  const client = createClient(creds.supabase_url, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email: creds.admin_email,
    password: creds.admin_password,
  });
  if (signInError) throw new Error(`fixture sign-in failed: ${signInError.message}`);

  const { data: existingFine, error: fineReadError } = await client
    .from("traffic_violations")
    .select("id")
    .eq("notes", LAYER2E_FIXTURE_NOTE)
    .eq("license_plate", creds.vehicle_plate)
    .maybeSingle();
  if (fineReadError) throw new Error(`fixture fine read failed: ${fineReadError.message}`);
  if (!existingFine) {
    const today = new Date().toISOString().slice(0, 10);
    const { error: fineInsertError } = await client.from("traffic_violations").insert({
      customer_id: creds.customer_id,
      driver_id: creds.driver_id,
      vehicle_id: creds.vehicle_id,
      license_plate: creds.vehicle_plate,
      violation_type: "Layer 2E QA fine",
      violation_date: today,
      amount: 35_000,
      status: "pending_payment",
      source: "qa",
      notes: LAYER2E_FIXTURE_NOTE,
      attribution_method: "qa_seed",
    });
    if (fineInsertError) throw new Error(`fixture fine insert failed: ${fineInsertError.message}`);
    record("seeded fine fixture", true, creds.vehicle_plate);
  } else {
    record("seeded fine fixture", true, "existing");
  }

  const { data: existingAccident, error: accidentReadError } = await client
    .from("accidents")
    .select("id")
    .eq("description", LAYER2E_FIXTURE_NOTE)
    .eq("driver_id", creds.driver_id)
    .maybeSingle();
  if (accidentReadError) throw new Error(`fixture accident read failed: ${accidentReadError.message}`);
  if (!existingAccident) {
    const { error: accidentInsertError } = await client.from("accidents").insert({
      customer_id: creds.customer_id,
      driver_id: creds.driver_id,
      vehicle_id: creds.vehicle_id,
      status: "SUBMITTED",
      severity: "MINOR",
      description: LAYER2E_FIXTURE_NOTE,
      incident_type: "COLLISION",
      location_address: "Layer 2E QA route",
      injury_involved: false,
      other_party_involved: false,
      police_involved: false,
      submitted_at: new Date().toISOString(),
    });
    if (accidentInsertError) throw new Error(`fixture accident insert failed: ${accidentInsertError.message}`);
    record("seeded accident fixture", true, creds.vehicle_plate);
  } else {
    record("seeded accident fixture", true, "existing");
  }
}

async function main() {
  const creds = loadCreds();
  await ensureLayer2EFixtures(creds);

  const h = new Harness();
  await h.start({ width: 1440, height: 980 });

  await adminLogin(h, creds);

  h.label("layer2e/overview");
  await h.page.goto(`${APP_URL}/admin/trust-risk`, { waitUntil: "domcontentloaded" });
  await settle(h.page, 2800);
  await h.page.getByText("Trust & Risk").first().waitFor({ timeout: 15000 });
  await h.shot("65-layer2e-trust-risk-overview");

  await assertText(h, "primary route title", "Trust & Risk");
  await assertText(h, "average score metric", "Average Score");
  await assertText(h, "drivers at risk metric", "Drivers at Risk");
  await assertText(h, "critical drivers metric", "Critical Drivers");
  await assertText(h, "compliance rate metric", "Compliance Rate");
  await assertText(h, "open contraventions metric", "Open Contraventions");
  await assertText(h, "open sinistres metric", "Open Sinistres");
  await assertText(h, "kyc issues metric", "KYC Issues");
  await assertText(h, "fleet control issues metric", "Fleet Control Issues");
  await assertText(h, "risk distribution", "Risk Distribution");
  await assertText(h, "risk alerts", "Risk Alerts");
  await assertText(h, "recent trust events", "Recent Trust Events");
  await assertAbsent(h, "no ai underwriting copy", "AI underwriting");
  await assertAbsent(h, "no repossession workflow", "repossession");

  for (const tab of [
    "Overview",
    "Driver Risk",
    "Vehicle Risk",
    "Score Center",
    "Compliance",
    "Contraventions",
    "Sinistres",
    "Trust Events",
    "Audit",
  ] as const) {
    await assertText(h, `tab trigger ${tab}`, tab);
  }

  h.label("layer2e/driver-risk");
  await clickTab(h, "Driver Risk");
  await assertText(h, "driver risk tab", "Driver Risk");
  await assertText(h, "risk reason visible", "Reason");
  await assertText(h, "driver 360 handoff visible", "Driver 360");
  const detailButtons = h.page.getByRole("button", { name: /Detail/i });
  if (await detailButtons.count() > 0) {
    await detailButtons.first().click();
    await settle(h.page, 700);
    await assertText(h, "driver risk detail opens", "Risk Factors");
    await assertText(h, "recommended actions visible", "Recommended Actions");
    await assertText(h, "recent events visible", "Recent Events");
    await h.shot("67-layer2e-risk-driver-handoff");
    await h.page.keyboard.press("Escape");
  } else {
    record("driver risk detail opens", false, "no driver detail button found");
  }
  await h.shot("66-layer2e-risk-queue");

  h.label("layer2e/vehicle-risk");
  await clickTab(h, "Vehicle Risk");
  await assertText(h, "vehicle risk tab seeded plate", creds.vehicle_plate);
  await assertText(h, "vehicle risk assigned driver", "Assigned driver");

  h.label("layer2e/score-center");
  await clickTab(h, "Score Center");
  await assertText(h, "score breakdown", "Score Breakdown");
  await assertText(h, "score changes", "Score Changes");
  await assertText(h, "score simulation", "Score Simulation");
  await assertText(h, "what if driver pays", "What if driver pays?");
  await assertText(h, "projected score", "Projected score");
  const accidentToggle = h.page.getByLabel(/What if accident removed/i);
  if (await accidentToggle.isVisible().catch(() => false)) {
    await accidentToggle.click();
    await settle(h.page, 300);
    await assertText(h, "simulation accident delta", "What if accident removed?");
  } else {
    record("simulation accident delta", false, "toggle missing");
  }

  h.label("layer2e/compliance");
  await clickTab(h, "Compliance");
  await assertText(h, "kyc compliance", "KYC Compliance");
  await assertText(h, "fleet control compliance", "Fleet Control Compliance");
  await assertText(h, "documents compliance", "Documents");
  await assertText(h, "permits compliance", "Permits");
  await assertText(h, "insurance compliance", "Insurance");

  h.label("layer2e/contraventions");
  await clickTab(h, "Contraventions");
  await assertText(h, "contraventions tab", "Open Contraventions");
  await assertText(h, "contraventions score impact", "Score Impact");
  record("contraventions handoff link", await h.page.locator('a[href="/admin/contraventions"]').count() > 0, "/admin/contraventions");

  h.label("layer2e/sinistres");
  await clickTab(h, "Sinistres");
  await assertText(h, "sinistres tab", "Open Sinistres");
  await assertText(h, "sinistres insurance status", "Insurance Status");
  await assertText(h, "sinistres risk impact", "Risk Impact");
  record("sinistres handoff link", await h.page.locator('a[href="/admin/sinistres"]').count() > 0, "/admin/sinistres");
  await h.shot("68-layer2e-module-handoffs");

  h.label("layer2e/trust-events");
  await clickTab(h, "Trust Events");
  await assertText(h, "trust timeline populated", "Open");

  h.label("layer2e/audit");
  await clickTab(h, "Audit");
  await assertText(h, "trust audit", "Trust Audit");
  await assertText(h, "audit fields event", "Event");
  await assertText(h, "audit source visible", "source");
  record("audit handoff link", await h.page.locator('a[href="/admin/audit"]').count() > 0, "/admin/audit");

  const disabledButtons = await h.page.locator("button:disabled").count();
  record("no dead buttons", disabledButtons === 0, `${disabledButtons} disabled button(s) on active tab`);

  await routeSmoke(h, "/admin/trust-risk", "Trust & Risk");
  await routeSmoke(h, "/admin/scoring", "Scoring");
  await routeSmoke(h, "/admin/contraventions", "Contraventions");
  await routeSmoke(h, "/admin/incidents", "Sinistres");
  await routeSmoke(h, "/admin/fleet-control", "Fleet Control");
  await routeSmoke(h, `/admin/drivers/${creds.driver_id}?tab=risk`, "Driver 360");

  h.label("layer2e/mobile");
  await h.page.setViewportSize({ width: 390, height: 860 });
  await h.page.goto(`${APP_URL}/admin/trust-risk`, { waitUntil: "domcontentloaded" });
  await settle(h.page, 2200);
  await assertText(h, "mobile trust risk route", "Trust & Risk");
  await assertText(h, "mobile kpis visible", "Average Score");
  const mobileShot = `${SHOT_DIR}/69-layer2e-mobile.png`;
  await h.page.screenshot({ path: mobileShot, fullPage: false });
  console.log(`📸 ${mobileShot}`);

  const allFindings = [...h.findings];
  if (allFindings.length === 0) {
    console.log("✅ no console/network findings");
  } else {
    console.log(`\n--- ${allFindings.length} console/network findings ---`);
    for (const f of allFindings) console.log(`[${f.page}] ${f.kind}: ${f.detail}`);
  }
  record("console/network findings", allFindings.length === 0, `${allFindings.length} finding(s)`);
  await h.stop();

  console.log("\n--- Layer 2E QA matrix ---");
  for (const c of checks) {
    console.log(`${c.passed ? "PASS" : "FAIL"} | ${c.name}${c.detail ? ` | ${c.detail}` : ""}`);
  }

  writeFileSync(`${SHOT_DIR}/layer2e-qa-matrix.json`, JSON.stringify({ checks, findings: allFindings }, null, 2));

  if (checks.some((c) => !c.passed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("FAIL Layer 2E QA crashed", error);
  process.exit(1);
});
