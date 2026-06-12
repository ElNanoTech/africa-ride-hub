/**
 * QA Phase 4 — Profile quick actions on the E2E driver:
 *   1. "Ajouter note" → note saved, visible in Notes tab.
 *   2. "Envoyer message" → live backend lacks the admin_message
 *      notification type (pending deploy): expect a clean French error
 *      toast, NO crash.
 *   3. "Créer facture" → generate-invoice (deployed function): issue a
 *      small manual invoice and check the Factures tab.
 *
 * Run:  bun run scripts/qa/09-admin-quick-actions.ts
 */
import { Harness, loadCreds, adminLogin, settle, APP_URL } from "./lib";

async function main() {
  const creds = loadCreds();
  const h = new Harness();
  const p = await h.start({ width: 1440, height: 900 });

  await adminLogin(h, creds);
  h.label("admin/driver-profile");
  await p.goto(`${APP_URL}/admin/drivers/${creds.driver_id}`, { waitUntil: "networkidle" });
  await settle(p, 3000);

  // ---- 1. Ajouter note ----
  h.label("quick-action/note");
  await p.getByRole("button", { name: /Ajouter note/ }).click();
  await settle(p, 1500);
  await h.shot("90-note-form");
  // The action focuses the Notes tab with the editor open
  const noteArea = p.locator("textarea:visible").first();
  if (await noteArea.isVisible().catch(() => false)) {
    await noteArea.fill("Note QA E2E — vérification Phase 4");
    const saveBtn = p.getByRole("button", { name: /Enregistrer|Ajouter|Sauvegarder/ }).first();
    await saveBtn.click();
    await settle(p, 2500);
    await h.shot("91-note-saved");
    const txt = await p.locator("body").innerText();
    console.log("note visible:", txt.includes("Note QA E2E — vérification Phase 4"));
  } else {
    console.log("❌ note editor did not open");
  }

  // ---- 2. Envoyer message (expected pending-deploy failure, clean toast) ----
  h.label("quick-action/message");
  await p.getByRole("button", { name: /Envoyer message/ }).click();
  await settle(p, 1200);
  const dlg = p.locator('[role="dialog"]');
  await dlg.locator("#msg-title").fill("Test QA");
  await dlg.locator("#msg-body").fill("Message de test QA Phase 4");
  await dlg.getByRole("button", { name: /^Envoyer$/ }).click();
  await settle(p, 3000);
  await h.shot("92-message-result");
  const toasts = await p.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
  console.log("message toasts:", JSON.stringify(toasts));
  // close dialog if still open
  await p.keyboard.press("Escape");
  await settle(p, 800);

  // ---- 3. Créer facture ----
  h.label("quick-action/invoice");
  await p.getByRole("button", { name: /Créer facture/ }).click();
  await settle(p, 2000);
  await h.shot("93-invoice-dialog");
  const inv = p.locator('[role="dialog"]');
  console.log("invoice dialog:", (await inv.innerText().catch(() => "(none)")).slice(0, 600).replace(/\n+/g, " | "));

  // Fill what the dialog needs: description + amount if present
  const desc = inv.locator('input[id*="desc"], textarea[id*="desc"], input[placeholder*="escription"], textarea[placeholder*="escription"]').first();
  if (await desc.isVisible().catch(() => false)) await desc.fill("Frais QA E2E");
  const amount = inv.locator('input[type="number"]').first();
  if (await amount.isVisible().catch(() => false)) await amount.fill("1000");
  await h.shot("94-invoice-filled");
  const createBtn = inv.getByRole("button", { name: /Créer|Émettre|Générer/ }).last();
  if (await createBtn.isVisible().catch(() => false)) {
    console.log("create btn disabled:", await createBtn.isDisabled());
    if (!(await createBtn.isDisabled())) {
      await createBtn.click();
      await settle(p, 5000);
      await h.shot("95-invoice-result");
      const toasts2 = await p.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
      console.log("invoice toasts:", JSON.stringify(toasts2));
    }
  }
  await p.keyboard.press("Escape");
  await settle(p, 800);

  // Factures tab check
  await p.goto(`${APP_URL}/admin/drivers/${creds.driver_id}?tab=invoices`, { waitUntil: "networkidle" });
  await settle(p, 2500);
  await h.shot("96-invoices-tab");
  const invTab = await p.locator("body").innerText();
  console.log("Factures tab mentions QA invoice:", invTab.includes("Frais QA E2E") || /E2ETST/.test(invTab));

  h.printFindings();
  await h.stop();
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
