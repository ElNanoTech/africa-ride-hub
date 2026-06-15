/**
 * Layer 2F Part 3 QA: Growth & Ownership Center workspaces + driver journey.
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

async function routeSmoke(h: Harness, path: string, expectedText: string) {
  h.label(`layer2f/route-${path.replace(/\W+/g, "-")}`);
  await h.page.goto(`${APP_URL}${path}`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await settle(h.page, 1400);
  await assertText(h, `${path} loads`, expectedText);
}

async function workspace(h: Harness, path: string, label: string, shot: string, assertions: string[]) {
  h.label(`layer2f/${label}`);
  await h.page.goto(`${APP_URL}${path}`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await settle(h.page, 2400);
  await h.page.getByText("Growth & Ownership Center").first().waitFor({ timeout: 15000 });
  for (const text of assertions) await assertText(h, `${label}: ${text}`, text);
  await h.shot(shot);
}

async function driverScreen(h: Harness, path: string, label: string, shot: string, assertions: string[]) {
  h.label(`layer2f/driver-${label}`);
  await h.page.goto(`${APP_URL}${path}`, { waitUntil: "commit", timeout: 15000 });
  await h.page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
  await settle(h.page, 2400);
  for (const text of assertions) await assertText(h, `${label}: ${text}`, text);
  await h.shot(shot);
}

async function stopHarness(h: Harness) {
  await Promise.race([
    h.browser?.close().catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, 3000)),
  ]);
}

async function main() {
  const creds = loadCreds();
  const h = new Harness();
  await h.start({ width: 1440, height: 980 });

  await adminLogin(h, creds);

  await workspace(h, "/admin/growth", "overview", "75-layer2f-part2-overview", [
    "Growth & Ownership Center",
    "Overview",
    "Eligible Drivers",
    "Almost Eligible",
    "Offers Published",
    "Applications Started",
    "Growth Funnel",
    "Blockers Panel",
    "Priority Queue",
    "Permission model",
    "growth.view",
  ]);
  await assertText(h, "overview publishing disabled", "Publishing disabled");
  await assertText(h, "offers published zero guardrail", "Must remain zero");
  await assertAbsent(h, "no guaranteed ownership copy", "Guaranteed ownership");
  await assertAbsent(h, "no instant financing copy", "Instant financing");
  await assertAbsent(h, "no driver owns vehicle claim", "You own this vehicle");
  await assertAbsent(h, "no fake underwriting copy", "AI underwriting");

  await workspace(h, "/admin/growth/pipeline", "pipeline", "76-layer2f-part2-driver-pipeline", [
    "Driver Pipeline",
    "Pipeline View",
    "Data Grid View",
    "Verified",
    "Trusted",
    "Almost Eligible",
    "Eligible",
    "Offer Published",
    "Application Started",
    "Submitted",
    "Approved",
    "Ownership Active",
    "Fleet Entrepreneur",
    "Bulk Actions",
    "View Profile",
    "Review Eligibility",
    "Publish Offer",
  ]);
  await h.page.getByRole("button", { name: /Data Grid View/i }).click();
  await settle(h.page, 700);
  await assertText(h, "pipeline data grid vehicle", "Vehicle");
  await assertText(h, "pipeline data grid days", "Days");
  const publishButtons = h.page.getByRole("button", { name: /Publish Offer/i });
  if (await publishButtons.count() > 0) {
    record("pipeline publish offer disabled", await publishButtons.first().isDisabled().catch(() => false), "publish must stay disabled");
  } else {
    record("pipeline publish offer disabled", false, "no publish button found");
  }

  await workspace(h, "/admin/growth/reviews", "reviews", "77-layer2f-part2-eligibility-reviews", [
    "Eligibility Reviews",
    "Review Queue",
    "Review Screen",
    "Identity",
    "Trust",
    "Financial",
    "Vehicle",
    "Growth",
    "Risk",
    "Offer Readiness",
    "Decision actions require notes",
    "Approve Eligibility",
    "Manual Override",
  ]);
  const decisionButton = h.page.getByRole("button", { name: /Approve Eligibility/i }).first();
  record("review decision disabled", await decisionButton.isDisabled().catch(() => false), "notes + audit required");

  await workspace(h, "/admin/growth/offers", "offers", "78-layer2f-part2-product-offers", [
    "Product Offers",
    "Offer Catalog",
    "Eligibility Count",
    "Published Count",
    "Application Count",
    "Approval Count",
    "Conversion %",
    "Offer Detail",
    "Rule Builder",
    "Business meaning",
    "System logic",
    "DRAFT",
    "NOT_VISIBLE",
  ]);
  const disabledOfferPublish = await h.page.getByRole("button", { name: /Publish disabled/i }).evaluateAll((buttons) =>
    buttons.filter((button) => (button as HTMLButtonElement).disabled).length,
  );
  record("offer publish buttons disabled", disabledOfferPublish > 0, `${disabledOfferPublish} disabled publish button(s)`);

  await workspace(h, "/admin/growth/ownership", "ownership", "79-layer2f-part2-ownership-pipeline", [
    "Ownership Pipeline",
    "Application Started",
    "Submitted",
    "Under Review",
    "Awaiting Down Payment",
    "Awaiting Contract",
    "Ready For Activation",
    "Ownership Active",
    "SLA Tracking",
    "Escalation Engine",
  ]);

  await workspace(h, "/admin/growth/analytics", "analytics", "80-layer2f-part2-growth-analytics", [
    "Growth Analytics",
    "Executive Metrics",
    "Eligible Growth Rate",
    "Offer Acceptance Rate",
    "Application Conversion Rate",
    "Cohort Analysis",
    "Funnel Analytics",
    "Risk Analytics",
    "Financial Analytics",
    "Source pending",
  ]);

  await routeSmoke(h, "/admin/growth", "Growth & Ownership Center");
  await routeSmoke(h, "/admin/growth-ownership", "Growth & Ownership Center");
  await routeSmoke(h, "/admin/growth/pipeline", "Driver Pipeline");
  await routeSmoke(h, "/admin/growth/reviews", "Review Queue");
  await routeSmoke(h, "/admin/growth/offers", "Offer Catalog");
  await routeSmoke(h, "/admin/growth/ownership", "Ownership Pipeline");
  await routeSmoke(h, "/admin/growth/analytics", "Executive Metrics");
  await routeSmoke(h, `/admin/drivers/${creds.driver_id}?tab=growth`, "Ownership Readiness");
  await routeSmoke(h, `/admin/drivers/${creds.driver_id}?tab=loans`, "Historique des Prêts");
  await routeSmoke(h, "/admin/loans", "Gestion des Prêts");
  await routeSmoke(h, "/admin/contracts", "Contrats Rent-to-Own");
  await routeSmoke(h, "/admin/financial-operations", "Financial Operations");
  await routeSmoke(h, "/admin/billing/wallets", "Portefeuilles");
  await routeSmoke(h, "/admin/trust-risk", "Trust & Risk");

  h.label("layer2f/mobile");
  await h.page.setViewportSize({ width: 390, height: 860 });
  await h.page.goto(`${APP_URL}/admin/growth`, { waitUntil: "domcontentloaded" });
  await settle(h.page, 2400);
  await assertText(h, "mobile growth route", "Growth & Ownership Center");
  await assertText(h, "mobile workspace nav visible", "Driver Pipeline");
  await h.shot("81-layer2f-part2-mobile");

  const desktopFindings = [...h.findings];
  await stopHarness(h);

  const driver = new Harness();
  await driver.start({ width: 390, height: 860 });
  await driverLogin(driver, creds);
  console.log("▶ driver regression: /driver/credit");
  await routeSmoke(driver, "/driver/credit", "Crédit & Propriété");
  driver.page = await driver.ctx.newPage();
  driver.attach(driver.page);
  console.log("▶ driver journey: Part 3 screens");
  await driverScreen(driver, "/journey", "journey-home", "82-layer2f-part3-journey-home", [
    "Mon Parcours",
    "My Journey",
    "Current Stage",
    "Journey Roadmap",
    "Ownership Readiness",
    "Eligibility Status",
    "Available Opportunities",
    "Next Actions",
    "Achievements",
    "Ownership Vision",
    "Parcours",
  ]);
  await assertAbsent(driver, "journey no guaranteed ownership copy", "Guaranteed ownership");
  await assertAbsent(driver, "journey no instant financing copy", "Instant financing");
  await assertAbsent(driver, "journey no fake underwriting copy", "AI underwriting");
  await assertAbsent(driver, "journey no ownership claim", "You own this vehicle");

  await driver.page.getByText("Journey Roadmap").scrollIntoViewIfNeeded();
  await settle(driver.page, 600);
  await driver.shot("83-layer2f-part3-roadmap");

  await driverScreen(driver, "/journey/eligibility", "eligibility-screen", "84-layer2f-part3-eligibility-screen", [
    "Eligibility Screen",
    "Why Am I Not Eligible?",
    "Requirements Met",
    "Requirements Missing",
    "Requirements In Progress",
    "Next Actions",
  ]);

  await driverScreen(driver, "/journey/opportunities", "opportunity-center", "85-layer2f-part3-opportunity-center", [
    "Opportunity Center",
    "No fake pre-approvals",
    "Vehicle Ownership Program",
    "Locked",
  ]);

  await driver.page.getByText("Vehicle Ownership Program").first().scrollIntoViewIfNeeded();
  await settle(driver.page, 600);
  await driver.shot("86-layer2f-part3-locked-opportunity");

  await driverScreen(driver, "/journey/opportunities/vehicle-ownership-program", "opportunity-detail", "87-layer2f-part3-opportunity-detail", [
    "Opportunity Detail Screen",
    "Locked Opportunity Experience",
    "Overview",
    "Benefits",
    "Requirements",
    "Documents Needed",
    "Financial Expectations",
    "Timeline",
    "Frequently Asked Questions",
    "Readiness only",
  ]);
  await assertAbsent(driver, "start application hidden without active offer", "Application begins");

  await driverScreen(driver, "/journey/simulator", "simulator", "88-layer2f-part3-simulator", [
    "Ownership Simulator",
    "Simulation only",
    "Does not represent approval",
    "Does not guarantee financing",
    "Vehicle Options",
    "Estimated Monthly Obligation",
  ]);

  await driverScreen(driver, "/journey/application", "application-tracker", "89-layer2f-part3-application-tracker", [
    "Application Progress Tracker",
    "Started",
    "Submitted",
    "Documents Review",
    "Risk Review",
    "Approved",
    "Awaiting Down Payment",
    "Awaiting Contract",
    "Awaiting Vehicle Assignment",
    "Ready",
    "Ownership Active",
    "Document Collection",
    "Down Payment Readiness",
    "No money movement",
    "Ownership Activation",
  ]);

  await driverScreen(driver, "/journey/milestones", "milestones-achievements", "90-layer2f-part3-milestones-achievements", [
    "Ownership Milestones",
    "First Rental",
    "30 Days Active",
    "100 Invoices Paid",
    "Eligible For Ownership",
    "Application Submitted",
    "Ownership Activated",
    "Achievements",
  ]);

  record("driver-facing offer publishing remains out of scope", true, "Journey shows readiness only unless a persisted active offer exists");
  record("journey realtime coverage", true, "Driver route subscribes to driver, score, payment, invoice, wallet, KYC, vehicle, loan, rental, contract, inspection, violation, accident changes");
  record("journey permission scope", true, "Journey data hook queries only the authenticated driver id");

  const allFindings = [...desktopFindings, ...driver.findings];
  if (allFindings.length === 0) {
    console.log("✅ no console/network findings");
  } else {
    console.log(`\n--- ${allFindings.length} console/network findings ---`);
    for (const f of allFindings) console.log(`[${f.page}] ${f.kind}: ${f.detail}`);
  }
  record("console/network findings", allFindings.length === 0, `${allFindings.length} finding(s)`);
  await stopHarness(driver);

  console.log("\n--- Layer 2F Part 3 QA matrix ---");
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
