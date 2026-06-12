/**
 * QA Phase 4 — Admin approves every item then the whole control.
 * Verifies the corrected item came back as reviewable, the full-approve
 * gate (all items approved), and the KPI flip to Conformes.
 *
 * Run:  bun run scripts/qa/06-admin-complete-review.ts
 */
import { Harness, loadCreds, adminLogin, settle, APP_URL } from "./lib";

async function main() {
  const creds = loadCreds();
  const h = new Harness();
  const p = await h.start({ width: 1440, height: 900 });

  await adminLogin(h, creds);

  h.label("admin/fleet-control/complete-review");
  await p.goto(`${APP_URL}/admin/fleet-control`, { waitUntil: "networkidle" });
  await settle(p, 2500);
  await p.locator("div", { hasText: "QA Chauffeur E2E" }).locator("xpath=ancestor-or-self::*[contains(@class,'cursor-pointer')]").first().click();
  await settle(p, 2500);
  const dlg = p.locator('[role="dialog"]');
  console.log("dialog open:", await dlg.isVisible());

  // Approve every item whose item-level "Approuver" button is still enabled.
  // (Already-approved items keep a disabled button; the footer full-approve is
  // the last one.) Re-query each pass because the DOM refreshes after review.
  for (let i = 0; i < 14; i++) {
    const enabled = dlg.locator('button:enabled:has-text("Approuver")');
    const count = await enabled.count();
    if (count <= 1) break; // only the footer full-approve remains enabled
    await enabled.first().click();
    await p.waitForTimeout(1800);
  }
  await settle(p, 1500);
  await h.shot("60-admin-fc-all-items-approved");
  const txt = await dlg.innerText();
  console.log("items left to review:", (txt.match(/Refuser/g) ?? []).length - 1, "(footer excluded)");

  // Footer full approve
  const fullApprove = dlg.getByRole("button", { name: /^Approuver$/ }).last();
  console.log("full approve disabled:", await fullApprove.isDisabled());
  await fullApprove.click();
  await settle(p, 3500);
  await h.shot("61-admin-fc-full-approved");

  const body = await p.locator("body").innerText();
  console.log("list after approve:", body.match(/\d+ | CONFORMES/g)?.slice(0, 4) ?? "", "| contains 'Conforme':", body.includes("Conforme"));

  h.printFindings();
  await h.stop();
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
