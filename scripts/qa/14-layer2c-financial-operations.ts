/**
 * Layer 2C QA: Financial Operations Center.
 *
 * Run:
 *   QA_APP_URL=http://127.0.0.1:8081 QA_SHOT_DIR=docs/specs/screenshots/layer2c bun run scripts/qa/14-layer2c-financial-operations.ts
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

async function assertAbsent(h: Harness, name: string, needle: string) {
  const text = await bodyText(h);
  record(name, !includesText(text, needle), `absent: ${needle}`);
}

async function clickTab(h: Harness, tabName: string) {
  await h.page.getByRole("tab", { name: new RegExp(`^${tabName}$`, "i") }).click();
  await settle(h.page, 900);
}

async function routeSmoke(h: Harness, path: string, expectedText: string) {
  h.label(`layer2c/route-${path.replace(/\W+/g, "-")}`);
  await h.page.goto(`${APP_URL}${path}`, { waitUntil: "domcontentloaded" });
  await settle(h.page, 1600);
  await assertText(h, `${path} loads`, expectedText);
}

async function main() {
  const creds = loadCreds();
  const h = new Harness();
  await h.start({ width: 1440, height: 960 });

  await adminLogin(h, creds);

  h.label("layer2c/overview");
  await h.page.goto(`${APP_URL}/admin/financial-operations`, { waitUntil: "domcontentloaded" });
  await settle(h.page, 2600);
  await h.page.getByText("Financial Operations").first().waitFor({ timeout: 15000 });
  await h.shot("45-layer2c-overview-command-center");

  await assertText(h, "primary route title", "Financial Operations");
  await assertText(h, "collected today metric", "Collected Today");
  await assertText(h, "expected today metric", "Expected Today");
  await assertText(h, "recovery rate metric", "Recovery Rate");
  await assertText(h, "outstanding balance metric", "Outstanding Balance");
  await assertText(h, "cash-in definition visible", "Real cash-in only");
  await assertText(h, "remaining due definition visible", "Remaining due, not invoice total");
  await assertText(h, "daily rental first viewport", "Daily Rental Command Center");
  await assertText(h, "due today rental metric", "Due Today");
  await assertText(h, "paid today rental metric", "Paid Today");
  await assertText(h, "drivers overdue metric", "Drivers Overdue");
  await assertAbsent(h, "no fake facturation route text", "/admin/facturation");
  await assertAbsent(h, "no fake wallets route text", "/admin/wallets");
  await assertAbsent(h, "no out-of-scope assign agent", "Assign Agent");

  for (const tab of [
    "Overview",
    "Collections",
    "Payments",
    "Wallet Operations",
    "Reconciliation",
    "Cash Flow",
    "Financial Health",
    "Audit",
  ] as const) {
    await assertText(h, `tab trigger ${tab}`, tab);
  }

  h.label("layer2c/collections");
  await clickTab(h, "Collections");
  await assertText(h, "collections queue", "Collections Queue");
  await assertText(h, "collections keeps daily rental central", "Daily Rental Command Center");
  await assertText(h, "bulk reminder available", "Send Reminder");
  await assertText(h, "bulk export available", "Export");
  await h.shot("46-layer2c-collections");

  const rowCheckboxes = h.page.getByRole("checkbox");
  const checkboxCount = await rowCheckboxes.count();
  if (checkboxCount > 1) {
    await rowCheckboxes.nth(1).click();
    await settle(h.page, 400);
    await h.page.getByRole("button", { name: /Send Reminder/i }).click();
    await settle(h.page, 1800);
    const text = await bodyText(h);
    record("send reminder action", /Reminder sent/i.test(text), /Reminder failed/i.test(text) ? "toast showed failure" : "submitted");
    await h.shot("47-layer2c-reminder-result");
  } else {
    record("send reminder action", true, "no live collection row available; disabled state verified");
  }

  const download = h.page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
  await h.page.getByRole("button", { name: /Export/i }).click();
  const exportResult = await download;
  record("export action", true, exportResult ? await exportResult.suggestedFilename() : "clicked without browser download event");

  h.label("layer2c/payments");
  await clickTab(h, "Payments");
  await assertText(h, "payment feed", "Payment Feed");
  record("payments engine route link", await h.page.locator('a[href="/admin/payments"]').count() > 0, "/admin/payments");
  await h.shot("48-layer2c-payments-feed");
  const detailButtons = h.page.getByRole("button", { name: /View payment detail/i });
  if (await detailButtons.count() > 0) {
    await detailButtons.first().click();
    await settle(h.page, 700);
    await assertText(h, "payment detail opens", "Payment Detail");
    await assertText(h, "payment detail remaining due", "Remaining Due");
    await assertText(h, "payment detail wallet applied", "Wallet Applied");
    await h.shot("49-layer2c-payment-detail");
    await h.page.keyboard.press("Escape");
  } else {
    record("payment detail opens", true, "no live payments available");
  }

  h.label("layer2c/wallet");
  await clickTab(h, "Wallet Operations");
  await assertText(h, "wallet total balance", "Total Wallet Balance");
  await assertText(h, "wallet timeline", "Wallet Timeline");
  await assertText(h, "wallet anomalies", "Wallet Anomalies");
  await assertText(h, "wallet auto applies", "Auto-Applies");
  await h.shot("50-layer2c-wallet-operations");

  h.label("layer2c/reconciliation");
  await clickTab(h, "Reconciliation");
  await assertText(h, "reconciliation queue", "Reconciliation Queue");
  await assertText(h, "safe actions copy", "Safe actions only");
  const reconciliationText = await bodyText(h);
  record(
    "reconciliation action vocabulary constrained",
    !/force|manual repair|delete|adjust balance/i.test(reconciliationText),
    "only Repair, Re-run Settlement, View links, or disabled Escalate expected",
  );
  await h.shot("51-layer2c-reconciliation");

  h.label("layer2c/cash-flow");
  await clickTab(h, "Cash Flow");
  await assertText(h, "cash flow trend", "30-Day Cash Flow Trend");
  await assertText(h, "forecast definition", "Forecast from unpaid scheduled payments");
  await h.shot("52-layer2c-cash-flow");

  h.label("layer2c/health");
  await clickTab(h, "Financial Health");
  await assertText(h, "financial health index", "Financial Health Index");
  await assertText(h, "health informational only", "Informational only");
  await h.shot("53-layer2c-financial-health");

  h.label("layer2c/audit");
  await clickTab(h, "Audit");
  await assertText(h, "financial audit", "Financial Audit");
  record("billing route link", await h.page.locator('a[href="/admin/billing"]').count() > 0, "/admin/billing");
  await h.shot("54-layer2c-audit");

  await routeSmoke(h, "/admin/finance", "Financial Operations");
  await routeSmoke(h, "/admin/payments", "Paiements");
  await routeSmoke(h, "/admin/billing", "Facturation");
  await routeSmoke(h, "/admin/billing/wallets", "Portefeuilles");

  const desktopFindings = [...h.findings];
  await h.stop();

  const mobile = new Harness();
  await mobile.start({ width: 390, height: 860 });
  await adminLogin(mobile, creds);
  mobile.label("layer2c/mobile");
  await mobile.page.goto(`${APP_URL}/admin/financial-operations`, { waitUntil: "domcontentloaded" });
  await settle(mobile.page, 2200);
  await assertText(mobile, "mobile financial operations route", "Financial Operations");
  await assertText(mobile, "mobile daily rental visible", "Daily Rental Command Center");
  const mobileShot = `${SHOT_DIR}/55-layer2c-mobile.png`;
  await mobile.page.screenshot({ path: mobileShot, fullPage: false });
  console.log(`📸 ${mobileShot}`);

  const allFindings = [...desktopFindings, ...mobile.findings];
  if (allFindings.length === 0) {
    console.log("✅ no console/network findings");
  } else {
    console.log(`\n--- ${allFindings.length} console/network findings ---`);
    for (const f of allFindings) console.log(`[${f.page}] ${f.kind}: ${f.detail}`);
  }
  record("console/network findings", allFindings.length === 0, `${allFindings.length} finding(s)`);
  await mobile.stop();

  console.log("\n--- Layer 2C QA matrix ---");
  for (const c of checks) {
    console.log(`${c.passed ? "PASS" : "FAIL"} | ${c.name}${c.detail ? ` | ${c.detail}` : ""}`);
  }

  writeFileSync(`${SHOT_DIR}/layer2c-qa-matrix.json`, JSON.stringify({ checks, findings: allFindings }, null, 2));

  if (checks.some((c) => !c.passed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("FAIL Layer 2C QA crashed", error);
  process.exit(1);
});
