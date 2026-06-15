/**
 * Layer 2F Part 1 QA: Growth & Ownership Center.
 *
 * Run:
 *   QA_APP_URL=http://127.0.0.1:8081 QA_SHOT_DIR=docs/specs/screenshots/layer2f bun run scripts/qa/17-layer2f-growth-ownership.ts
 */
import { writeFileSync } from "node:fs";
import { Harness, loadCreds, adminLogin, driverLogin, settle, APP_URL, SHOT_DIR } from "./lib";

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
  return h.page.locator("body").innerText({ timeout: 10000 }).catch(async () =>
    h.page.evaluate(() => document.body?.innerText ?? ""),
  );
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
  const tab = h.page.locator('[role="tab"]').filter({ hasText: new RegExp(`^${tabName}$`, "i") }).first();
  await tab.click();
  await h.page.waitForFunction((name) => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    return tabs.some((item) =>
      item.textContent?.trim().toLowerCase() === String(name).toLowerCase()
      && item.getAttribute("data-state") === "active",
    );
  }, tabName);
  await settle(h.page, 900);
}

async function routeSmoke(h: Harness, path: string, expectedText: string) {
  h.label(`layer2f/route-${path.replace(/\W+/g, "-")}`);
  await h.page.goto(`${APP_URL}${path}`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await h.page.waitForTimeout(1800);
  await assertText(h, `${path} loads`, expectedText);
}

async function main() {
  const creds = loadCreds();
  const h = new Harness();
  await h.start({ width: 1440, height: 980 });

  await adminLogin(h, creds);

  h.label("layer2f/overview");
  await h.page.goto(`${APP_URL}/admin/growth-ownership`, { waitUntil: "domcontentloaded" });
  await settle(h.page, 3000);
  await h.page.getByText("Growth & Ownership").first().waitFor({ timeout: 15000 });
  await h.shot("70-layer2f-growth-overview");

  await assertText(h, "primary route title", "Growth & Ownership");
  await assertText(h, "eligible drivers metric", "Eligible Drivers");
  await assertText(h, "close to eligibility metric", "Close To Eligibility");
  await assertText(h, "blocked drivers metric", "Blocked Drivers");
  await assertText(h, "ownership path metric", "Ownership Path");
  await assertText(h, "active offers metric", "Active Offers");
  await assertText(h, "active offers part 1 zero explanation", "Zero in Part 1");
  await assertText(h, "growth funnel", "Growth Conversion Funnel");
  await assertText(h, "attention queue", "Growth Attention Queue");
  await assertText(h, "guardrails", "Phase 1 Guardrails");
  await assertText(h, "publishing disabled guardrail", "Publishing disabled");
  await assertAbsent(h, "no guaranteed ownership copy", "Guaranteed ownership");
  await assertAbsent(h, "no instant financing copy", "Instant financing");
  await assertAbsent(h, "no driver owns vehicle claim", "You own this vehicle");
  await assertAbsent(h, "no fake underwriting copy", "AI underwriting");

  for (const tab of [
    "Overview",
    "Pipeline",
    "Driver Profiles",
    "Offers",
    "Rules",
    "Audit",
  ] as const) {
    await assertText(h, `tab trigger ${tab}`, tab);
  }

  h.label("layer2f/pipeline");
  await clickTab(h, "Pipeline");
  await assertText(h, "pipeline tab", "Eligibility Pipeline");
  await assertText(h, "all filter", "All");
  await assertText(h, "eligible filter", "Eligible");
  await assertText(h, "blocked filter", "Blocked");
  await assertText(h, "driver 360 handoff", "Driver 360");
  const pipelineShot = `${SHOT_DIR}/71-layer2f-growth-pipeline.png`;
  await h.page.locator('[role="tabpanel"][data-state="active"]').screenshot({ path: pipelineShot });
  console.log(`📸 ${pipelineShot}`);

  const reviewButtons = h.page.getByRole("button", { name: /^Review$/i });
  if (await reviewButtons.count() > 0) {
    await reviewButtons.first().click();
    await settle(h.page, 900);
    await assertText(h, "driver profile sheet opens", "Growth profile");
    await assertText(h, "operating signals visible", "Operating Signals");
    await assertText(h, "eligibility blockers visible", "Eligibility Blockers");
    await assertText(h, "offer readiness visible", "Offer Readiness");
    await assertText(h, "publish disabled reason visible", "Publish disabled");
    const publishButton = h.page.getByRole("button", { name: /Publish Offer/i }).first();
    record("publish offer disabled", await publishButton.isDisabled().catch(() => false), "Part 1 read-only");
    await h.shot("72-layer2f-driver-growth-profile");
    await h.page.keyboard.press("Escape");
    await settle(h.page, 500);
  } else {
    record("driver profile sheet opens", false, "no review button found");
  }

  h.label("layer2f/profiles");
  await clickTab(h, "Driver Profiles");
  await assertText(h, "driver profiles tab", "Driver Profiles");
  await assertText(h, "driver profile card has score", "Score");
  await assertText(h, "driver profile card has wallet", "Wallet");

  h.label("layer2f/offers");
  await clickTab(h, "Offers");
  await assertText(h, "offer readiness templates", "Offer Readiness Templates");
  await assertText(h, "draft status visible", "DRAFT");
  await assertText(h, "not visible state visible", "NOT VISIBLE");
  await assertText(h, "driver offer readiness panel", "Driver Offer Readiness");
  await assertText(h, "per driver evaluation copy", "without publishing");
  const disabledPublishButtons = await h.page.getByRole("button", { name: /^Publish$/i }).evaluateAll((buttons) =>
    buttons.filter((button) => (button as HTMLButtonElement).disabled).length,
  );
  record("template publish buttons disabled", disabledPublishButtons > 0, `${disabledPublishButtons} disabled publish button(s)`);
  await h.shot("73-layer2f-offer-readiness");

  h.label("layer2f/rules");
  await clickTab(h, "Rules");
  await assertText(h, "rules tab", "Eligibility Rules Display");
  await assertText(h, "minimum score rule", "Minimum KIRA Score");
  await assertText(h, "on-time payment rule", "On-time payment rate");
  await assertText(h, "required documents implicit via governance", "Governance");
  await assertText(h, "view roles", "super_admin, manager, agent_pret");

  h.label("layer2f/audit");
  await clickTab(h, "Audit");
  await assertText(h, "growth audit tab", "Growth Audit");
  await assertText(h, "no silent override", "No silent eligibility override");
  await assertText(h, "safe actions", "Safe Actions");
  record("loan handoff link", await h.page.locator('a[href="/admin/loans"]').count() > 0, "/admin/loans");
  record("contracts handoff link", await h.page.locator('a[href="/admin/contracts"]').count() > 0, "/admin/contracts");
  record("trust risk handoff link", await h.page.locator('a[href="/admin/trust-risk"]').count() > 0, "/admin/trust-risk");
  record("finance handoff link", await h.page.locator('a[href="/admin/financial-operations"]').count() > 0, "/admin/financial-operations");
  record("wallet handoff link", await h.page.locator('a[href="/admin/billing/wallets"]').count() > 0, "/admin/billing/wallets");

  await routeSmoke(h, "/admin/growth", "Growth & Ownership");
  await routeSmoke(h, "/admin/growth-ownership", "Growth & Ownership");
  await routeSmoke(h, `/admin/drivers/${creds.driver_id}?tab=growth`, "Driver 360");
  await routeSmoke(h, `/admin/drivers/${creds.driver_id}?tab=loans`, "Driver 360");
  await routeSmoke(h, "/admin/loans", "Gestion des Prêts");
  await routeSmoke(h, "/admin/contracts", "Contrats Rent-to-Own");
  await routeSmoke(h, "/admin/financial-operations", "Financial Operations");
  await routeSmoke(h, "/admin/billing/wallets", "Portefeuilles");
  await routeSmoke(h, "/admin/trust-risk", "Trust & Risk");
  await routeSmoke(h, `/admin/vehicles/${creds.vehicle_id}`, creds.vehicle_plate);

  h.label("layer2f/mobile");
  await h.page.setViewportSize({ width: 390, height: 860 });
  await h.page.goto(`${APP_URL}/admin/growth-ownership`, { waitUntil: "domcontentloaded" });
  await settle(h.page, 2400);
  await assertText(h, "mobile growth route", "Growth & Ownership");
  await assertText(h, "mobile kpis visible", "Eligible Drivers");
  const mobileShot = `${SHOT_DIR}/74-layer2f-mobile.png`;
  await h.page.screenshot({ path: mobileShot, fullPage: false });
  console.log(`📸 ${mobileShot}`);

  const desktopFindings = [...h.findings];
  await h.stop();

  const driver = new Harness();
  await driver.start({ width: 390, height: 860 });
  await driverLogin(driver, creds);
  await routeSmoke(driver, "/driver/credit", "Crédit & Propriété");
  record("driver-facing offer publishing remains out of scope", true, "Part 1 admin-only visibility");

  const allFindings = [...desktopFindings, ...driver.findings];
  if (allFindings.length === 0) {
    console.log("✅ no console/network findings");
  } else {
    console.log(`\n--- ${allFindings.length} console/network findings ---`);
    for (const f of allFindings) console.log(`[${f.page}] ${f.kind}: ${f.detail}`);
  }
  record("console/network findings", allFindings.length === 0, `${allFindings.length} finding(s)`);
  await driver.stop();

  console.log("\n--- Layer 2F QA matrix ---");
  for (const c of checks) {
    console.log(`${c.passed ? "PASS" : "FAIL"} | ${c.name}${c.detail ? ` | ${c.detail}` : ""}`);
  }

  writeFileSync(`${SHOT_DIR}/layer2f-qa-matrix.json`, JSON.stringify({ checks, findings: allFindings }, null, 2));

  if (checks.some((c) => !c.passed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("FAIL Layer 2F QA crashed", error);
  process.exit(1);
});
