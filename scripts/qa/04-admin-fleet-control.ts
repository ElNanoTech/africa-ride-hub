/**
 * QA Phase 4 — Admin fleet-control review (desktop viewport).
 * /admin/fleet-control: KPIs, E2E control visible, detail dialog,
 * per-item approve + reject (with reason), Relancer, and the FC-A1
 * "Nouveau contrôle" button (expected pending-deploy → clean error).
 *
 * Run:  bun run scripts/qa/04-admin-fleet-control.ts
 */
import { Harness, loadCreds, adminLogin, settle, APP_URL } from "./lib";

async function main() {
  const creds = loadCreds();
  const h = new Harness();
  const p = await h.start({ width: 1440, height: 900 });

  await adminLogin(h, creds);

  h.label("admin/fleet-control");
  await p.goto(`${APP_URL}/admin/fleet-control`, { waitUntil: "networkidle" });
  await settle(p, 3000);
  await h.shot("40-admin-fc-list");
  const body = await p.locator("body").innerText();
  console.log("KPI block:", body.slice(0, 700).replace(/\n+/g, " | "));
  console.log("QA control visible:", body.includes("QA Chauffeur E2E") || body.includes(creds.vehicle_plate));

  // FC-A1 — Nouveau contrôle (new RPC; live backend = pending deploy)
  h.label("admin/fleet-control/manual-create");
  const newBtn = p.getByRole("button", { name: /Nouveau contrôle/ });
  if (await newBtn.isVisible().catch(() => false)) {
    await newBtn.click();
    await settle(p, 1500);
    await h.shot("41-admin-fc-manual-dialog");
    const dlg = p.locator('[role="dialog"]');
    if (await dlg.isVisible().catch(() => false)) {
      console.log("manual dialog:", (await dlg.innerText()).slice(0, 500).replace(/\n+/g, " | "));
      // try to actually create for OUR driver (isolated tenant) to observe the failure mode
      const select = dlg.locator("button[role=combobox]").first();
      if (await select.isVisible().catch(() => false)) {
        await select.click();
        await settle(p, 800);
        const opt = p.getByRole("option", { name: /QA-E2E-100|Yaris/ }).first();
        if (await opt.isVisible().catch(() => false)) {
          await opt.click();
          await settle(p, 500);
          const createBtn = dlg.getByRole("button", { name: /Créer/ });
          if (await createBtn.isVisible().catch(() => false) && !(await createBtn.isDisabled())) {
            await createBtn.click();
            await settle(p, 2500);
            await h.shot("42-admin-fc-manual-result");
            console.log("after manual create attempt:", (await p.locator("body").innerText()).match(/.{0,120}(rreur|chou|introuvable|impossible).{0,80}/i)?.[0] ?? "(no visible error text)");
          } else {
            console.log("create button missing/disabled");
          }
        } else {
          console.log("QA vehicle not in manual-create picker (likely because it already has an active control)");
          await p.keyboard.press("Escape");
        }
      }
      await p.keyboard.press("Escape");
      await settle(p, 500);
    } else {
      console.log("no dialog opened after Nouveau contrôle");
    }
  } else {
    console.log("❌ Nouveau contrôle button not found");
  }

  // Open the QA control detail dialog
  h.label("admin/fleet-control/detail");
  await p.goto(`${APP_URL}/admin/fleet-control`, { waitUntil: "networkidle" });
  await settle(p, 2000);
  const card = p.locator("div", { hasText: "QA Chauffeur E2E" }).locator("xpath=ancestor-or-self::*[contains(@class,'cursor-pointer')]").first();
  if (await card.isVisible().catch(() => false)) {
    await card.click();
  } else {
    await p.getByText(creds.vehicle_plate).first().click();
  }
  await settle(p, 2500);
  await h.shot("43-admin-fc-detail");
  const dlg = p.locator('[role="dialog"]');
  console.log("detail dialog open:", await dlg.isVisible().catch(() => false));
  console.log("detail:", (await dlg.innerText().catch(() => "")).slice(0, 800).replace(/\n+/g, " | "));

  // Per-item: approve the first item, reject the second with reason
  const approveBtns = dlg.getByRole("button", { name: /^Approuver$/ });
  const rejectBtns = dlg.getByRole("button", { name: /^Refuser$/ });
  console.log("item approve buttons:", await approveBtns.count(), "reject:", await rejectBtns.count());

  await approveBtns.first().click();
  await settle(p, 2000);
  await h.shot("44-admin-fc-item-approved");
  console.log("after item approve — dialog contains 'Validé':", (await dlg.innerText()).includes("Validé"));

  await rejectBtns.first().click();
  await settle(p, 800);
  // reason textarea appears inline
  const reasonBox = dlg.locator("textarea").first();
  await reasonBox.fill("Photo trop floue — test QA");
  await dlg.getByRole("button", { name: /^OK$/ }).click();
  await settle(p, 2000);
  await h.shot("45-admin-fc-item-rejected");
  console.log("after item reject — dialog contains reason:", (await dlg.innerText()).includes("Photo trop floue"));

  // Relancer
  const relancer = dlg.getByRole("button", { name: /Relancer|Relance possible/ });
  if (await relancer.isVisible().catch(() => false)) {
    const label = await relancer.innerText();
    const disabled = await relancer.isDisabled();
    console.log(`relancer: "${label}" disabled=${disabled}`);
    if (!disabled) {
      await relancer.click();
      await settle(p, 2000);
      await h.shot("46-admin-fc-relance");
    }
  } else {
    console.log("relancer button not visible in dialog");
  }

  h.printFindings();
  await h.stop();
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
