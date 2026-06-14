/**
 * Layer 1A QA: authenticated navigation smoke + screenshots.
 *
 * Run:
 *   QA_SHOT_DIR=docs/specs/screenshots/layer1a bun run scripts/qa/10-layer1a-ia.ts
 */
import { Harness, loadCreds, adminLogin, driverLogin, settle, APP_URL } from "./lib";

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

async function bodyText(h: Harness) {
  return h.page.locator("body").innerText();
}

async function smokeRoute(h: Harness, route: string, label: string) {
  h.label(label);
  await h.page.goto(`${APP_URL}${route}`, { waitUntil: "domcontentloaded" });
  await settle(h.page, 1400);
  const text = await bodyText(h);
  const failed =
    h.page.url().includes("/login") ||
    /page non trouvée|not found/i.test(text) ||
    text.trim().length < 20;
  record(`route ${route}`, !failed, failed ? `url=${h.page.url()}` : "loaded");
}

async function runAdmin() {
  const creds = loadCreds();
  const h = new Harness();
  await h.start({ width: 1440, height: 940 });

  await adminLogin(h, creds);
  h.label("layer1a/admin-attention");
  await h.page.goto(`${APP_URL}/admin`, { waitUntil: "domcontentloaded" });
  await settle(h.page, 1800);
  await h.shot("10-layer1a-admin-attention");

  const text = await bodyText(h);
  const sidebarText = await h.page.locator("aside nav").evaluate((node) => node.textContent ?? "");
  record("admin attention title", text.includes("Ce qui demande votre attention"));
  for (const label of [
    "Centre d’attention",
    "Conducteurs",
    "Véhicules",
    "Finance",
    "Confiance & Risque",
    "Croissance",
    "Système",
  ]) {
    record(`admin sidebar group ${label}`, sidebarText.includes(label));
  }

  const actionButton = h.page.getByRole("button", { name: /Traiter maintenant|Actions/i }).first();
  await actionButton.click();
  await settle(h.page, 400);
  record("admin attention quick actions opens", await h.page.getByText("Actions à traiter").isVisible().catch(() => false));
  await h.shot("11-layer1a-admin-actions");

  for (const [route, label] of [
    ["/admin/rentals", "daily-rental-admin"],
    ["/admin/payments", "finance-payments-admin"],
    ["/admin/finance", "finance-admin"],
    ["/admin/billing/wallets", "wallets-admin"],
    ["/admin/fleet-control", "fleet-control-admin"],
    ["/admin/drivers", "drivers-admin"],
    ["/admin/vehicles", "vehicles-admin"],
    ["/admin/loans", "growth-loans-admin"],
    ["/admin/scoring", "trust-scoring-admin"],
    ["/admin/settings", "system-settings-admin"],
  ] as const) {
    await smokeRoute(h, route, label);
  }

  await h.shot("12-layer1a-admin-last-smoke");
  h.printFindings();
  const adminFindings = h.findings.length;
  await h.stop();
  record("admin console/network findings", adminFindings === 0, `${adminFindings} finding(s)`);
}

async function runDriver() {
  const creds = loadCreds();
  const h = new Harness();
  await h.start({ width: 390, height: 844 });

  await driverLogin(h, creds);
  h.label("layer1a/driver-home");
  await h.page.goto(`${APP_URL}/driver`, { waitUntil: "domcontentloaded" });
  await settle(h.page, 1800);
  await h.shot("13-layer1a-driver-home");

  let text = await bodyText(h);
  for (const tab of ["Accueil", "Finance", "Véhicule", "Contrôle", "Profil"]) {
    record(`driver five-tab nav ${tab}`, text.includes(tab));
  }

  await smokeRoute(h, "/driver/rental", "daily-rental-driver");
  await h.shot("14-layer1a-driver-rental");

  await smokeRoute(h, "/driver/portefeuille", "wallet-driver");
  const topUp = h.page.getByRole("button", { name: /Recharger/i }).first();
  if (await topUp.isVisible().catch(() => false)) {
    await topUp.click();
    await settle(h.page, 700);
  }
  text = await bodyText(h);
  record("driver wallet top-up entry opens", /Wave|Recharger|portefeuille/i.test(text));
  await h.shot("15-layer1a-driver-wallet-topup");

  await smokeRoute(h, "/driver/fleet-control", "fleet-control-driver");
  await h.shot("16-layer1a-driver-fleet-control");

  h.printFindings();
  const driverFindings = h.findings.length;
  await h.stop();
  record("driver console/network findings", driverFindings === 0, `${driverFindings} finding(s)`);
}

async function main() {
  await runAdmin();
  await runDriver();

  const failed = checks.filter((c) => !c.passed);
  console.log("\n--- Layer 1A QA matrix ---");
  for (const c of checks) {
    console.log(`${c.passed ? "PASS" : "FAIL"} | ${c.name}${c.detail ? ` | ${c.detail}` : ""}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("FAIL Layer 1A QA crashed", error);
  process.exit(1);
});
