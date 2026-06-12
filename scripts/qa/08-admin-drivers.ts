/**
 * QA Phase 4 — Chauffeurs: /admin/drivers list (KPI tiles, columns,
 * search/filters) + driver profile: all 15 tabs, ?tab= deep link,
 * /admin/contraventions page. Live backend lacks the new risk RPCs —
 * expectation: honest "—"/empty states, zero crashes.
 *
 * Run:  bun run scripts/qa/08-admin-drivers.ts
 */
import { Harness, loadCreds, adminLogin, settle, APP_URL } from "./lib";

const TABS: Array<[string, string]> = [
  ["overview", "Vue d'ensemble"],
  ["scores", "Historique des Scores"],
  ["payments", "Paiements"],
  ["rentals", "Locations"],
  ["loans", "Prêts"],
  ["income", "Revenus"],
  ["invoices", "Factures"],
  ["fleet-control", "Fleet Control"],
  ["violations", "Contraventions"],
  ["accidents", "Sinistres"],
  ["tickets", "Tickets"],
  ["documents", "Documents"],
  ["notes", "Notes"],
  ["audit", "Audit"],
  ["activity", "Activité"],
];

async function main() {
  const creds = loadCreds();
  const h = new Harness();
  const p = await h.start({ width: 1440, height: 900 });

  await adminLogin(h, creds);

  // ---- list page ----
  h.label("admin/drivers");
  await p.goto(`${APP_URL}/admin/drivers`, { waitUntil: "networkidle" });
  await settle(p, 3000);
  await h.shot("80-admin-drivers-list");
  const body = await p.locator("body").innerText();
  console.log("list head:", body.slice(0, 1100).replace(/\n+/g, " | "));
  console.log("QA driver row visible:", body.includes("QA Chauffeur E2E"));

  // search
  const search = p.locator('input[placeholder*="echerch"], input[type="search"]').first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill("QA-E2E-100"); // search by plate (CH-L3)
    await settle(p, 1500);
    const afterSearch = await p.locator("body").innerText();
    console.log("plate search finds driver:", afterSearch.includes("QA Chauffeur E2E"));
    await h.shot("81-admin-drivers-plate-search");
    await search.fill("");
    await settle(p, 1000);
  } else {
    console.log("no search input found");
  }

  // ---- profile ----
  h.label("admin/driver-profile");
  await p.getByText("QA Chauffeur E2E").first().click();
  await p.waitForURL(/\/admin\/drivers\//, { timeout: 10000 });
  await settle(p, 3000);
  await h.shot("82-admin-driver-profile-header");
  const prof = await p.locator("body").innerText();
  console.log("header block:", prof.slice(0, 900).replace(/\n+/g, " | "));
  const profileUrl = p.url().split("?")[0];

  for (const [value, label] of TABS) {
    h.label(`admin/driver-profile/${value}`);
    const trigger = p.getByRole("tab", { name: label, exact: true });
    if (!(await trigger.isVisible().catch(() => false))) {
      console.log(`❌ tab missing: ${label}`);
      continue;
    }
    await trigger.click();
    await settle(p, 2200);
    await h.shot(`83-tab-${value}`);
    const txt = await p.locator('[role="tabpanel"]').first().innerText().catch(() => "(panel unreadable)");
    console.log(`tab ${value}: ${txt.slice(0, 220).replace(/\n+/g, " | ")}`);
  }

  // ?tab= deep link
  h.label("admin/driver-profile/deeplink");
  await p.goto(`${profileUrl}?tab=invoices`, { waitUntil: "networkidle" });
  await settle(p, 2500);
  const activeTab = await p.locator('[role="tab"][aria-selected="true"]').innerText().catch(() => "?");
  console.log("deep link ?tab=invoices → active tab:", activeTab);
  await h.shot("84-deeplink-invoices");

  // ---- contraventions page ----
  h.label("admin/contraventions");
  await p.goto(`${APP_URL}/admin/contraventions`, { waitUntil: "networkidle" });
  await settle(p, 2500);
  await h.shot("85-admin-contraventions");
  const cv = await p.locator("body").innerText();
  console.log("contraventions page:", cv.slice(0, 500).replace(/\n+/g, " | "));

  h.printFindings();
  await h.stop();
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
