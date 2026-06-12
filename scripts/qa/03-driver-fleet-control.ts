/**
 * QA Phase 4 — Driver fleet-control flow (mobile viewport).
 * After the rental is active (scripts/qa/02), a control is auto-created.
 * Uploads a real JPEG for every required zone via the actual file input,
 * verifies progress counts + per-item persistence across reload, then
 * submits the control.
 *
 * Run:  bun run scripts/qa/03-driver-fleet-control.ts
 */
import { Harness, loadCreds, driverLogin, settle, APP_URL, SHOT_DIR } from "./lib";

const PHOTO_LABELS = ["Avant", "Arrière", "Côté gauche", "Côté droit", "Intérieur avant", "Intérieur arrière", "Tableau de bord"];
const DOC_LABELS = ["Carte grise", "Assurance", "Vignette", "Permis chauffeur"];

async function main() {
  const creds = loadCreds();
  const h = new Harness();
  const p = await h.start({ width: 390, height: 844 });

  // Generate a real, canvas-decodable JPEG (the app compresses via <img> +
  // canvas, so minimal marker bytes are not enough).
  const gen = await h.ctx.newPage();
  await gen.setContent(`<body style="margin:0;background:linear-gradient(45deg,#3a7,#fa3);width:640px;height:480px"><h1 style="color:#fff;padding:40px">QA E2E ${new Date().toISOString()}</h1></body>`);
  const jpegPath = "/tmp/qa-photo.jpg";
  await gen.screenshot({ path: jpegPath, type: "jpeg", quality: 70, clip: { x: 0, y: 0, width: 640, height: 480 } });
  await gen.close();
  console.log(`✅ test JPEG at ${jpegPath}`);

  await driverLogin(h, creds);

  // Home should now show the fleet-control card + active rental
  h.label("driver/home-with-control");
  await settle(p, 2000);
  await h.shot("30-driver-home-active");
  const homeText = await p.locator("body").innerText();
  console.log("home mentions contrôle:", /[Cc]ontrôle/.test(homeText));

  h.label("driver/fleet-control");
  await p.goto(`${APP_URL}/driver/fleet-control`, { waitUntil: "networkidle" });
  await settle(p, 2500);
  await h.shot("31-driver-fc-start");
  const startText = await p.locator("body").innerText();
  const progress = startText.match(/(\d+)\/(\d+) pièces fournies/);
  console.log("initial progress:", progress?.[0] ?? "NOT FOUND", "| due copy:", startText.match(/Échéance[^|]*|À soumettre aujourd'hui|En retard de \d+ jours?/)?.[0]);

  const tile = (label: string) =>
    p.locator("div.rounded-xl.border-2").filter({
      has: p.locator("div.font-medium", { hasText: new RegExp(`^${label}$`) }),
    });

  async function upload(label: string, btnSel: "gallery" | "file") {
    const t = tile(label);
    await t.scrollIntoViewIfNeeded();
    const btn =
      btnSel === "gallery"
        ? t.locator('button[aria-label="Choisir depuis la galerie"]')
        : t.getByRole("button", { name: /Fichier/ });
    const [chooser] = await Promise.all([p.waitForEvent("filechooser", { timeout: 8000 }), btn.click()]);
    await chooser.setFiles(jpegPath);
    // wait for the tile to hold an uploaded item (border flips to blue / text changes)
    await t
      .locator("text=/Modifier la photo|Remplacer le document|Envoyé/")
      .first()
      .waitFor({ timeout: 30000 });
    console.log(`  ✅ uploaded: ${label}`);
  }

  for (const label of PHOTO_LABELS) await upload(label, "gallery");
  await h.shot("32-driver-fc-photos-done");
  for (const label of DOC_LABELS) await upload(label, "file");
  await settle(p, 1500);
  await h.shot("33-driver-fc-all-uploaded");

  const afterText = await p.locator("body").innerText();
  const prog2 = afterText.match(/(\d+)\/(\d+) pièces fournies/);
  const breakdown = afterText.match(/Véhicule : \d+\/\d+ · Documents : \d+\/\d+/);
  console.log("progress after uploads:", prog2?.[0], "|", breakdown?.[0]);

  // Persistence: reload and re-check
  await p.reload({ waitUntil: "networkidle" });
  await settle(p, 2500);
  const reloadText = await p.locator("body").innerText();
  const prog3 = reloadText.match(/(\d+)\/(\d+) pièces fournies/);
  console.log("progress after reload (persistence):", prog3?.[0]);
  await h.shot("34-driver-fc-after-reload");

  // Submit
  const submitBtn = p.getByRole("button", { name: /Soumettre le contrôle/ });
  console.log("submit visible:", await submitBtn.isVisible().catch(() => false), "disabled:", await submitBtn.isDisabled().catch(() => "n/a"));
  await submitBtn.click();
  await settle(p, 4000);
  await h.shot("35-driver-fc-submitted");
  const subText = await p.locator("body").innerText();
  console.log("submitted banner:", /Contrôle envoyé|À valider/.test(subText) ? "YES" : `NO — body: ${subText.slice(0, 400).replace(/\n+/g, " | ")}`);

  h.printFindings();
  await h.stop();
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
