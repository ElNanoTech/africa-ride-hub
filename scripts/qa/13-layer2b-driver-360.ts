/**
 * Layer 2B QA: Driver Operations Hub / Driver 360.
 *
 * Run:
 *   QA_SHOT_DIR=docs/specs/screenshots/layer2b bun run scripts/qa/13-layer2b-driver-360.ts
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
  await settle(h.page, 900);
}

async function main() {
  const creds = loadCreds();
  const h = new Harness();
  await h.start({ width: 1440, height: 960 });

  await adminLogin(h, creds);

  h.label("layer2b/drivers-list");
  await h.page.goto(`${APP_URL}/admin/drivers`, { waitUntil: "domcontentloaded" });
  await settle(h.page, 1800);
  await h.shot("30-layer2b-drivers-list-search");
  await assertText(h, "drivers list route still loads", "Conducteurs");

  const driverUrl = `${APP_URL}/admin/drivers/${creds.driver_id}`;
  h.label("layer2b/driver360-header");
  await h.page.goto(driverUrl, { waitUntil: "domcontentloaded" });
  await settle(h.page, 2600);
  await h.page.getByText("Driver 360").first().waitFor({ timeout: 12000 });
  await h.shot("31-layer2b-driver360-header-health");

  await assertText(h, "driver operating record badge", "Driver 360");
  await assertText(h, "health dashboard payments", "Payments");
  await assertText(h, "health dashboard kyc", "KYC");
  await assertText(h, "health dashboard fleet control", "Fleet Control");
  await assertText(h, "health dashboard vehicle", "Vehicle");
  await assertText(h, "health dashboard credit", "Credit");
  await assertText(h, "health dashboard risk", "Risk");
  await assertText(h, "lifecycle card", "Driver Lifecycle");
  await assertText(h, "ownership candidate panel", "Ownership Candidate");
  await assertText(h, "risk explanation panel", "Risk Explanation");
  await assertText(h, "action panel", "What Requires Action");

  await h.shot("32-layer2b-driver360-lifecycle");

  const actions = h.page.getByRole("button", { name: /Actions/i });
  await actions.click();
  await settle(h.page, 400);
  await assertText(h, "generate access action present", "Générer code d'accès");
  await assertText(h, "suspend or reactivate action present", "Suspendre");
  await h.shot("41-layer2b-quick-actions-menu");
  await h.page.keyboard.press("Escape");

  for (const [tab, shot, requiredText] of [
    ["Overview", "33-layer2b-tab-overview", "Recommandations"],
    ["Finance", "34-layer2b-tab-finance", "Solde disponible DAM"],
    ["Vehicle", "35-layer2b-tab-vehicle", "Historique des Locations"],
    ["Fleet Control", "36-layer2b-tab-fleet-control", "Contrôles visuels périodiques"],
    ["Risk", "37-layer2b-tab-risk", "Contraventions"],
    ["Growth", "38-layer2b-tab-growth", "Historique des Prêts"],
    ["Documents", "39-layer2b-tab-documents", "Documents"],
    ["Activity", "40-layer2b-tab-activity", "Chronologie unifiée"],
  ] as const) {
    h.label(`layer2b/tab-${tab.toLowerCase().replace(/\s+/g, "-")}`);
    await clickTab(h, tab);
    await assertText(h, `tab ${tab} content`, requiredText);
    await h.shot(shot);
  }

  h.label("layer2b/message-dialog");
  await h.page.goto(driverUrl, { waitUntil: "domcontentloaded" });
  await settle(h.page, 1400);
  await h.page.getByRole("button", { name: /Send Alert/i }).click();
  await h.page.locator("#msg-title").fill("QA Driver 360");
  await h.page.locator("#msg-body").fill("Message de verification Layer 2B Driver 360.");
  await h.page.getByRole("button", { name: /^Envoyer$/ }).click();
  await settle(h.page, 1500);
  const messageText = await bodyText(h);
  record("send alert/message action", /Message envoyé|Envoi impossible/i.test(messageText), "dialog submitted with user-facing result");
  await h.shot("42-layer2b-message-result");

  h.label("layer2b/create-invoice-dialog");
  await h.page.goto(driverUrl, { waitUntil: "domcontentloaded" });
  await settle(h.page, 1400);
  await h.page.getByRole("button", { name: /Create Invoice/i }).click();
  await settle(h.page, 700);
  await assertText(h, "create invoice dialog opens", "Émettre une facture");
  await h.shot("43-layer2b-create-invoice-result");
  await h.page.keyboard.press("Escape");

  for (const [alias, expected] of [
    ["invoices", "Factures"],
    ["wallet", "Solde disponible DAM"],
    ["violations", "Contraventions"],
    ["notes", "Notes"],
    ["loans", "Historique des Prêts"],
  ] as const) {
    h.label(`layer2b/legacy-tab-${alias}`);
    await h.page.goto(`${driverUrl}?tab=${alias}`, { waitUntil: "domcontentloaded" });
    await settle(h.page, 1300);
    const text = await bodyText(h);
    record(`legacy tab ${alias}`, includesText(text, expected), expected);
  }

  const desktopFindings = [...h.findings];
  await h.stop();

  const mobile = new Harness();
  await mobile.start({ width: 390, height: 860 });
  await adminLogin(mobile, creds);
  mobile.label("layer2b/mobile-driver360");
  await mobile.page.goto(driverUrl, { waitUntil: "domcontentloaded" });
  await settle(mobile.page, 1800);
  const mobileShot = `${SHOT_DIR}/44-layer2b-mobile-driver360.png`;
  await mobile.page.screenshot({ path: mobileShot, fullPage: false });
  console.log(`📸 ${mobileShot}`);
  await assertText(mobile, "mobile driver360 route", "Driver 360");

  const allFindings = [...desktopFindings, ...mobile.findings];
  if (allFindings.length === 0) {
    console.log("✅ no console/network findings");
  } else {
    console.log(`\n--- ${allFindings.length} console/network findings ---`);
    for (const f of allFindings) console.log(`[${f.page}] ${f.kind}: ${f.detail}`);
  }
  const findingCount = allFindings.length;
  record("console/network findings", findingCount === 0, `${findingCount} finding(s)`);
  await mobile.stop();

  console.log("\n--- Layer 2B QA matrix ---");
  for (const c of checks) {
    console.log(`${c.passed ? "PASS" : "FAIL"} | ${c.name}${c.detail ? ` | ${c.detail}` : ""}`);
  }

  writeFileSync(`${SHOT_DIR}/layer2b-qa-matrix.json`, JSON.stringify({ checks, findings: allFindings }, null, 2));

  if (checks.some((c) => !c.passed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("FAIL Layer 2B QA crashed", error);
  process.exit(1);
});
