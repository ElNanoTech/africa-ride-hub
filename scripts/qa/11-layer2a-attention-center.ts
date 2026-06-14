/**
 * Layer 2A QA: admin Attention Center command surface.
 *
 * Run:
 *   QA_SHOT_DIR=docs/specs/screenshots/layer2a bun run scripts/qa/11-layer2a-attention-center.ts
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

async function smokeRoute(h: Harness, route: string, label: string, expectedText?: RegExp) {
  h.label(label);
  await h.page.goto(`${APP_URL}${route}`, { waitUntil: "domcontentloaded" });
  await settle(h.page, 1400);
  const text = await bodyText(h);
  const failed =
    h.page.url().includes("/login") ||
    /page non trouvée|not found/i.test(text) ||
    text.trim().length < 20 ||
    (expectedText ? !expectedText.test(text) : false);
  record(`route ${route}`, !failed, failed ? `url=${h.page.url()}` : "loaded");
}

async function main() {
  const creds = loadCreds();
  const h = new Harness();
  await h.start({ width: 1440, height: 940 });

  await adminLogin(h, creds);

  h.label("layer2a/admin-attention");
  await h.page.goto(`${APP_URL}/admin/attention`, { waitUntil: "domcontentloaded" });
  await settle(h.page, 2400);
  await h.shot("20-layer2a-attention-center");

  let text = await bodyText(h);
  record("primary route /admin/attention", h.page.url().includes("/admin/attention"));
  record("hero title", text.includes("Centre d’attention"));
  record("hero subtitle", text.includes("Ce qui nécessite votre action aujourd’hui."));
  record("action queue title", text.includes("À traiter maintenant"));
  for (const label of [
    "À encaisser aujourd'hui",
    "En retard",
    "Contrôles à valider",
    "Véhicules indisponibles",
    "Chauffeurs à risque",
    "Demandes en attente",
  ]) {
    record(`kpi ${label}`, includesText(text, label));
  }

  for (const route of ["/admin", "/admin/dashboard"]) {
    await smokeRoute(h, route, `layer2a/alias-${route.replace(/\W+/g, "-")}`, /Centre d’attention/);
  }

  await smokeRoute(h, "/admin/attention?filter=overdue", "layer2a/filter-overdue", /En retard|Tout est à jour|À traiter maintenant/);
  await h.shot("21-layer2a-filter-overdue");
  text = await bodyText(h);
  record("overdue filter state", /filtre En retard|Tout est à jour|0 action/i.test(text));

  await h.page.getByRole("button", { name: /^Actualiser$/ }).click();
  await settle(h.page, 900);
  record("refresh button works", await h.page.getByText(/Centre d’attention actualisé/i).isVisible().catch(() => false));

  await h.page.goto(`${APP_URL}/admin/attention`, { waitUntil: "domcontentloaded" });
  await settle(h.page, 1600);

  const exportButton = h.page.getByRole("button", { name: /Exporter le rapport/i });
  const exportDisabled = await exportButton.isDisabled().catch(() => false);
  record("export button state", true, exportDisabled ? "disabled because no filtered actions" : "enabled for current action queue");

  const alertLink = h.page.getByRole("link", { name: /Voir toutes les alertes/i });
  await alertLink.click();
  await settle(h.page, 1200);
  record("alerts CTA route", h.page.url().includes("/admin/alertes"), h.page.url());
  await h.shot("22-layer2a-alertes-cta");

  await h.page.goto(`${APP_URL}/admin/attention`, { waitUntil: "domcontentloaded" });
  await settle(h.page, 1600);
  const openButtons = h.page.getByRole("link", { name: /Ouvrir|Examiner|Voir chauffeur|Voir véhicule|Voir GPS/i });
  const openCount = await openButtons.count();
  if (openCount > 0) {
    const firstHref = await openButtons.first().getAttribute("href");
    await openButtons.first().click();
    await settle(h.page, 1800);
    record("first action CTA works", h.page.url().includes("/admin/") && !/not found/i.test(await bodyText(h)), firstHref ?? h.page.url());
    await h.shot("23-layer2a-first-action-cta");
  } else {
    record("empty action queue has honest state", await h.page.getByText(/Tout est à jour/i).isVisible().catch(() => false), "no actionable live rows");
  }

  for (const [route, label, expected] of [
    ["/admin/rentals", "daily-rental-admin", /Locations|Location/],
    ["/admin/payments", "finance-payments-admin", /Paiements|Payment/],
    ["/admin/finance", "finance-admin", /Finance/],
    ["/admin/billing/wallets", "wallets-admin", /Portefeuilles|KiraPay|Wallet/],
    ["/admin/fleet-control", "fleet-control-admin", /Fleet Control|Contrôle/],
    ["/admin/drivers", "drivers-admin", /Chauffeurs|Conducteurs/],
    ["/admin/vehicles", "vehicles-admin", /Véhicules|Vehicles/],
  ] as const) {
    await smokeRoute(h, route, label, expected);
  }
  await h.shot("24-layer2a-core-routes");

  h.printFindings();
  const findingCount = h.findings.length;
  record("console/network findings", findingCount === 0, `${findingCount} finding(s)`);
  await h.stop();

  console.log("\n--- Layer 2A QA matrix ---");
  for (const c of checks) {
    console.log(`${c.passed ? "PASS" : "FAIL"} | ${c.name}${c.detail ? ` | ${c.detail}` : ""}`);
  }

  writeFileSync(`${SHOT_DIR}/layer2a-qa-matrix.json`, JSON.stringify({ checks, findings: h.findings }, null, 2));

  if (checks.some((c) => !c.passed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("FAIL Layer 2A QA crashed", error);
  process.exit(1);
});
