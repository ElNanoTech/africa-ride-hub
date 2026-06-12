/**
 * QA Phase 4 — Driver role-play, part 1 (mobile viewport 390x844).
 * Login with phone+PIN, walk Home, fleet-control (pre-rental state),
 * history, notifications, wallet, loans, vehicles → request a rental.
 *
 * Run:  bun run scripts/qa/01-driver-walkthrough.ts
 */
import { Harness, loadCreds, driverLogin, settle, APP_URL } from "./lib";

async function main() {
  const creds = loadCreds();
  const h = new Harness();
  const p = await h.start({ width: 390, height: 844 });

  await driverLogin(h, creds);
  await settle(p);
  await h.shot("01-driver-home");

  // Fleet control main screen (no active rental yet → expect honest empty)
  h.label("driver/fleet-control");
  await p.goto(`${APP_URL}/driver/fleet-control`, { waitUntil: "networkidle" });
  await settle(p);
  await h.shot("02-driver-fleet-control-empty");
  console.log("fleet-control body:", (await p.locator("main, body").first().innerText()).slice(0, 600).replace(/\n+/g, " | "));

  // History page (new) — expect honest empty state
  h.label("driver/fleet-control/history");
  await p.goto(`${APP_URL}/driver/fleet-control/history`, { waitUntil: "networkidle" });
  await settle(p);
  await h.shot("03-driver-fc-history-empty");
  console.log("history body:", (await p.locator("body").innerText()).slice(0, 500).replace(/\n+/g, " | "));

  // Notifications
  h.label("driver/notifications");
  await p.goto(`${APP_URL}/driver/notifications`, { waitUntil: "networkidle" });
  await settle(p);
  await h.shot("04-driver-notifications");

  // Wallet
  h.label("driver/portefeuille");
  await p.goto(`${APP_URL}/driver/portefeuille`, { waitUntil: "networkidle" });
  await settle(p);
  await h.shot("05-driver-wallet");

  // Loans
  h.label("driver/loans");
  await p.goto(`${APP_URL}/driver/loans`, { waitUntil: "networkidle" });
  await settle(p);
  await h.shot("06-driver-loans");

  // Factures
  h.label("driver/factures");
  await p.goto(`${APP_URL}/driver/factures`, { waitUntil: "networkidle" });
  await settle(p);
  await h.shot("07-driver-factures");

  // Vehicles → request rental on the QA vehicle
  h.label("driver/vehicles");
  await p.goto(`${APP_URL}/driver/vehicles`, { waitUntil: "networkidle" });
  await settle(p, 2000);
  await h.shot("08-driver-vehicles");

  const bodyText = await p.locator("body").innerText();
  if (bodyText.includes(creds.vehicle_plate) || bodyText.includes("Yaris")) {
    console.log("✅ QA vehicle visible in driver vehicles list");
    // Open the vehicle card / request flow
    const demander = p.getByRole("button", { name: /Demander/i }).first();
    if (await demander.isVisible().catch(() => false)) {
      await demander.click();
      await settle(p, 2500);
      await h.shot("09-driver-rental-requested");
      console.log("after Demander → url:", p.url());
      console.log("rental page:", (await p.locator("body").innerText()).slice(0, 600).replace(/\n+/g, " | "));
    } else {
      // maybe need to open a detail sheet first
      await p.getByText(creds.vehicle_plate).first().click().catch(() => {});
      await settle(p);
      await h.shot("09-driver-vehicle-detail");
      const d2 = p.getByRole("button", { name: /Demander/i }).first();
      if (await d2.isVisible().catch(() => false)) {
        await d2.click();
        await settle(p, 2500);
        await h.shot("09b-driver-rental-requested");
        console.log("after Demander → url:", p.url());
      } else {
        console.log("❌ no 'Demander' button found");
      }
    }
  } else {
    console.log("❌ QA vehicle NOT visible. Body:", bodyText.slice(0, 800).replace(/\n+/g, " | "));
  }

  h.printFindings();
  await h.stop();
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
