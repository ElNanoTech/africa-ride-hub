/**
 * Layer 2D QA: Vehicle Operations Center.
 *
 * Run:
 *   QA_APP_URL=http://127.0.0.1:8081 QA_SHOT_DIR=docs/specs/screenshots/layer2d bun run scripts/qa/15-layer2d-vehicle-operations.ts
 */
import { writeFileSync } from "node:fs";
import { Harness, loadCreds, adminLogin, settle, APP_URL, SHOT_DIR } from "./lib";

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

async function clickTab(h: Harness, tabName: string) {
  await h.page.getByRole("tab", { name: new RegExp(`^${tabName}$`, "i") }).click();
  await settle(h.page, 800);
}

async function routeSmoke(h: Harness, path: string, expectedText: string) {
  h.label(`layer2d/route-${path.replace(/\W+/g, "-")}`);
  await h.page.goto(`${APP_URL}${path}`, { waitUntil: "domcontentloaded" });
  await settle(h.page, 1500);
  await assertText(h, `${path} loads`, expectedText);
}

async function main() {
  const creds = loadCreds();
  const h = new Harness();
  await h.start({ width: 1440, height: 980 });

  await adminLogin(h, creds);

  h.label("layer2d/operations");
  await h.page.goto(`${APP_URL}/admin/vehicle-operations`, { waitUntil: "domcontentloaded" });
  await settle(h.page, 2600);
  await h.page.getByText("Vehicle Operations").first().waitFor({ timeout: 15000 });
  await h.shot("60-layer2d-vehicle-operations");

  await assertText(h, "primary route title", "Vehicle Operations");
  await assertText(h, "total vehicles metric", "Total Vehicles");
  await assertText(h, "assigned metric", "Assigned");
  await assertText(h, "available metric", "Available");
  await assertText(h, "maintenance metric", "Maintenance");
  await assertText(h, "immobilized metric", "Immobilized");
  await assertText(h, "utilization metric", "Utilization Rate");
  await assertText(h, "revenue metric", "Revenue This Month");
  await assertText(h, "maintenance cost metric", "Maintenance Cost This Month");
  await assertText(h, "attention queue", "Vehicle Attention Queue");
  await assertText(h, "profitability index", "Vehicle Profitability Index");
  await assertText(h, "operational indicator copy", "Do not use for accounting");
  await assertText(h, "seeded vehicle plate visible", creds.vehicle_plate);
  record("inventory route link present", await h.page.locator('a[href="/admin/vehicles"]').count() > 0, "/admin/vehicles");
  record("maintenance route link present", await h.page.locator('a[href="/admin/maintenance"]').count() > 0, "/admin/maintenance");
  record("fleet control route link present", await h.page.locator('a[href="/admin/fleet-control"]').count() > 0, "/admin/fleet-control");

  h.label("layer2d/vehicle-360");
  await h.page.goto(`${APP_URL}/admin/vehicles/${creds.vehicle_id}`, { waitUntil: "domcontentloaded" });
  await settle(h.page, 2400);
  await h.page.getByText("Vehicle 360").first().waitFor({ timeout: 15000 });
  await h.shot("61-layer2d-vehicle-360-overview");

  await assertText(h, "vehicle 360 title", "Vehicle 360");
  await assertText(h, "vehicle 360 seeded plate", creds.vehicle_plate);
  for (const tab of [
    "Overview",
    "Driver",
    "Finance",
    "Fleet Control",
    "Maintenance",
    "GPS",
    "Contraventions",
    "Sinistres",
    "History",
  ] as const) {
    await assertText(h, `tab trigger ${tab}`, tab);
  }

  await clickTab(h, "Overview");
  await assertText(h, "overview plate", "Plate");
  await assertText(h, "overview utilization engine", "Utilization Engine");

  h.label("layer2d/driver");
  await clickTab(h, "Driver");
  await assertText(h, "driver assignment", "Driver Assignment");
  await assertText(h, "assignment history", "Assignment History");
  const assignButton = h.page.getByRole("button", { name: /Assign|Reassign/i }).first();
  if (await assignButton.isVisible().catch(() => false)) {
    await assignButton.click();
    await settle(h.page, 700);
    await assertText(h, "assign dialog opens", "Allouer un véhicule");
    await h.page.keyboard.press("Escape");
  } else {
    record("assign dialog opens", false, "assign/reassign button missing");
  }

  h.label("layer2d/finance");
  await clickTab(h, "Finance");
  await assertText(h, "finance revenue", "Revenue");
  await assertText(h, "finance maintenance cost", "Maintenance Cost");
  await assertText(h, "finance fines", "Fines");
  await assertText(h, "finance insurance", "Insurance");
  await assertText(h, "finance net contribution", "Net Contribution");
  await assertText(h, "finance range 7 days", "7 days");
  await assertText(h, "finance range 12 months", "12 months");
  await h.shot("62-layer2d-vehicle-360-finance");

  h.label("layer2d/fleet-control");
  await clickTab(h, "Fleet Control");
  await assertText(h, "fleet current control", "Current control");
  await assertText(h, "fleet last validation", "Last validation");
  record("fleet control link", await h.page.locator('a[href="/admin/fleet-control"]').count() > 0, "/admin/fleet-control");

  h.label("layer2d/maintenance");
  await clickTab(h, "Maintenance");
  await assertText(h, "maintenance open orders", "Open orders");
  await assertText(h, "maintenance downtime", "Downtime");
  record("maintenance link", await h.page.locator('a[href="/admin/maintenance"]').count() > 0, "/admin/maintenance");

  h.label("layer2d/gps");
  await clickTab(h, "GPS");
  await assertText(h, "gps current location", "Current location");
  await assertText(h, "gps open tracking", "Open Tracking");
  record("tracking link", await h.page.locator('a[href="/admin/tracking"]').count() > 0, "/admin/tracking");

  h.label("layer2d/contraventions");
  await clickTab(h, "Contraventions");
  await assertText(h, "contraventions unpaid fines", "Unpaid fines");
  await assertText(h, "contraventions driver attribution", "Driver attribution");
  record("contraventions link", await h.page.locator('a[href="/admin/contraventions"]').count() > 0, "/admin/contraventions");

  h.label("layer2d/sinistres");
  await clickTab(h, "Sinistres");
  await assertText(h, "sinistres accidents", "Accidents");
  await assertText(h, "sinistres insurance status", "Insurance status");

  h.label("layer2d/history");
  await clickTab(h, "History");
  await assertText(h, "history timeline", "Unified timeline");
  await h.shot("63-layer2d-vehicle-360-history");

  await routeSmoke(h, "/admin/vehicle-operations", "Vehicle Operations");
  await routeSmoke(h, "/admin/vehicles", "Véhicules");
  await routeSmoke(h, `/admin/vehicles/${creds.vehicle_id}`, "Vehicle 360");

  h.label("layer2d/mobile");
  await h.page.setViewportSize({ width: 390, height: 860 });
  await h.page.goto(`${APP_URL}/admin/vehicle-operations`, { waitUntil: "domcontentloaded" });
  await settle(h.page, 2200);
  await assertText(h, "mobile vehicle operations route", "Vehicle Operations");
  await assertText(h, "mobile attention queue visible", "Vehicle Attention Queue");
  const mobileShot = `${SHOT_DIR}/64-layer2d-mobile.png`;
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

  console.log("\n--- Layer 2D QA matrix ---");
  for (const c of checks) {
    console.log(`${c.passed ? "PASS" : "FAIL"} | ${c.name}${c.detail ? ` | ${c.detail}` : ""}`);
  }

  writeFileSync(`${SHOT_DIR}/layer2d-qa-matrix.json`, JSON.stringify({ checks, findings: allFindings }, null, 2));

  if (checks.some((c) => !c.passed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("FAIL Layer 2D QA crashed", error);
  process.exit(1);
});
