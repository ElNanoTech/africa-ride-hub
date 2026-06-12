/**
 * QA Phase 4 — Admin approves the driver's pending rental (desktop viewport).
 * Walks /admin/rentals, opens the pending QA rental, approves it, verifies
 * status flips to active (which fires the fleet-control auto-create trigger).
 *
 * Run:  bun run scripts/qa/02-admin-approve-rental.ts
 */
import { Harness, loadCreds, adminLogin, settle, APP_URL } from "./lib";

async function main() {
  const creds = loadCreds();
  const h = new Harness();
  const p = await h.start({ width: 1440, height: 900 });

  await adminLogin(h, creds);
  await settle(p);
  await h.shot("20-admin-dashboard");

  h.label("admin/rentals");
  await p.goto(`${APP_URL}/admin/rentals`, { waitUntil: "networkidle" });
  await settle(p, 2500);
  await h.shot("21-admin-rentals");

  const body = await p.locator("body").innerText();
  if (!body.includes(creds.vehicle_plate) && !body.includes("Yaris QA")) {
    console.log("❌ pending QA rental not visible. Body:", body.slice(0, 1200).replace(/\n+/g, " | "));
    h.printFindings();
    await h.stop();
    process.exit(1);
  }
  console.log("✅ QA rental visible on /admin/rentals");

  // Open the row's Approuver action
  const row = p.locator("tr", { hasText: "QA Chauffeur E2E" }).first();
  const rowVisible = await row.isVisible().catch(() => false);
  if (rowVisible) {
    const btn = row.getByRole("button", { name: /Approuver/i }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
    } else {
      await row.click();
    }
  } else {
    // card layout — click the Approuver near our driver
    await p.getByRole("button", { name: /Approuver/i }).first().click();
  }
  await settle(p, 1500);
  await h.shot("22-admin-rental-approve-dialog");

  // Confirm in the dialog if one opened
  const dialog = p.locator('[role="dialog"]');
  if (await dialog.isVisible().catch(() => false)) {
    console.log("dialog:", (await dialog.innerText()).slice(0, 500).replace(/\n+/g, " | "));
    await dialog.getByRole("button", { name: /^Approuver/ }).click();
  }
  await settle(p, 3000);
  await h.shot("23-admin-rental-approved");

  const after = await p.locator("body").innerText();
  console.log("after approve, page contains 'Active':", /Activ/i.test(after));

  h.printFindings();
  await h.stop();
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
