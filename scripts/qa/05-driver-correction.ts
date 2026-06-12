/**
 * QA Phase 4 — Driver sees per-item rejection, retakes ONLY that item,
 * and the reminder (Relancer) notification deep-links to the control.
 *
 * Run:  bun run scripts/qa/05-driver-correction.ts
 */
import { Harness, loadCreds, driverLogin, settle, APP_URL } from "./lib";

async function main() {
  const creds = loadCreds();
  const h = new Harness();
  const p = await h.start({ width: 390, height: 844 });

  // a real decodable JPEG
  const gen = await h.ctx.newPage();
  await gen.setContent(`<body style="margin:0;background:#26c;width:640px;height:480px"><h1 style="color:#fff;padding:40px">QA RETAKE</h1></body>`);
  const jpegPath = "/tmp/qa-photo-retake.jpg";
  await gen.screenshot({ path: jpegPath, type: "jpeg", quality: 70, clip: { x: 0, y: 0, width: 640, height: 480 } });
  await gen.close();

  await driverLogin(h, creds);

  h.label("driver/fleet-control-rejected-item");
  await p.goto(`${APP_URL}/driver/fleet-control`, { waitUntil: "networkidle" });
  await settle(p, 2500);
  await h.shot("50-driver-fc-after-review");
  const body = await p.locator("body").innerText();
  console.log("shows rejection reason:", body.includes("Photo trop floue — test QA"));
  console.log("shows approved item ('Validé par le gestionnaire'):", body.includes("Validé par le gestionnaire"));
  console.log("locked items ('en attente de validation'):", body.includes("en attente de validation"));

  // Retake the rejected item
  const reprendre = p.getByRole("button", { name: /Reprendre/ });
  const reprendreCount = await reprendre.count();
  console.log("Reprendre buttons (should be 1):", reprendreCount);
  if (reprendreCount > 0) {
    await reprendre.first().scrollIntoViewIfNeeded();
    const [chooser] = await Promise.all([
      p.waitForEvent("filechooser", { timeout: 8000 }),
      reprendre.first().click(),
    ]);
    await chooser.setFiles(jpegPath);
    await settle(p, 5000);
    await h.shot("51-driver-fc-retaken");
    const after = await p.locator("body").innerText();
    console.log("reason gone after retake:", !after.includes("Photo trop floue — test QA"));
  }

  // Notifications: reminder should be present and deep-link to the control
  h.label("driver/notifications-deeplink");
  await p.goto(`${APP_URL}/driver/notifications`, { waitUntil: "networkidle" });
  await settle(p, 2000);
  await h.shot("52-driver-notifications");
  const notifText = await p.locator("body").innerText();
  console.log("notifications page mentions contrôle:", /contrôle/i.test(notifText));
  // click the first fleet-control notification
  const notifRow = p.getByText(/[Cc]ontrôle/).first();
  if (await notifRow.isVisible().catch(() => false)) {
    await notifRow.click();
    await settle(p, 2000);
    console.log("after notif click url:", p.url());
    await h.shot("53-driver-notif-deeplink");
  } else {
    console.log("no fleet-control notification visible");
  }

  h.printFindings();
  await h.stop();
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
