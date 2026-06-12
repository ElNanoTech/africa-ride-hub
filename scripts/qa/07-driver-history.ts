/**
 * QA Phase 4 — Driver history after approval: the closed cycle appears in
 * /driver/fleet-control/history, its read-only detail view renders, and
 * the active screen + home card show the approved state.
 *
 * Run:  bun run scripts/qa/07-driver-history.ts
 */
import { Harness, loadCreds, driverLogin, settle, APP_URL } from "./lib";

async function main() {
  const creds = loadCreds();
  const h = new Harness();
  const p = await h.start({ width: 390, height: 844 });

  await driverLogin(h, creds);
  await settle(p, 1500);
  await h.shot("70-driver-home-after-approve");
  const home = await p.locator("body").innerText();
  console.log("home card mentions contrôle:", /contrôle/i.test(home));

  h.label("driver/fleet-control-approved");
  await p.goto(`${APP_URL}/driver/fleet-control`, { waitUntil: "networkidle" });
  await settle(p, 2500);
  await h.shot("71-driver-fc-approved");
  const fc = await p.locator("body").innerText();
  console.log("active screen state:", fc.match(/Contrôle validé|Conforme|Aucun véhicule actif|En attente/)?.[0] ?? fc.slice(0, 300).replace(/\n+/g, " | "));

  h.label("driver/fleet-control/history");
  await p.goto(`${APP_URL}/driver/fleet-control/history`, { waitUntil: "networkidle" });
  await settle(p, 2500);
  await h.shot("72-driver-fc-history");
  const hist = await p.locator("body").innerText();
  console.log("history page:", hist.slice(0, 600).replace(/\n+/g, " | "));

  // open the closed cycle's detail
  const entry = p.getByText(/Conforme|Validé|Approuvé/).first();
  if (await entry.isVisible().catch(() => false)) {
    await entry.click();
    await settle(p, 2500);
    await h.shot("73-driver-fc-history-detail");
    console.log("detail url:", p.url());
    console.log("detail page:", (await p.locator("body").innerText()).slice(0, 500).replace(/\n+/g, " | "));
  } else {
    console.log("❌ no closed cycle visible in history");
  }

  h.printFindings();
  await h.stop();
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
