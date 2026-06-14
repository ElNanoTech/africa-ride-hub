/**
 * Regression QA: admin can create a training module from Communication > Formations.
 *
 * Run:
 *   QA_SHOT_DIR=docs/specs/screenshots/regressions bun run scripts/qa/12-admin-training-module.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { Harness, loadCreds, adminLogin, settle, APP_URL, SHOT_DIR } from "./lib";

type Check = { name: string; passed: boolean; detail?: string };

const checks: Check[] = [];

function record(name: string, passed: boolean, detail?: string) {
  checks.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
}

function publicAnonKey() {
  const env = readFileSync(".env", "utf8");
  const match = env.match(/^VITE_SUPABASE_PUBLISHABLE_KEY="?([^"\n]+)"?/m);
  if (!match) throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY missing from .env");
  return match[1];
}

async function cleanupModule(title: string) {
  const creds = loadCreds();
  const supabase = createClient(creds.supabase_url, publicAnonKey());
  const { error: loginError } = await supabase.auth.signInWithPassword({
    email: creds.admin_email,
    password: creds.admin_password,
  });
  if (loginError) throw loginError;
  const { error } = await supabase.from("training_modules").delete().eq("title", title);
  if (error) throw error;
}

async function main() {
  const creds = loadCreds();
  const title = `QA Formation RLS ${Date.now()}`;
  const h = new Harness();

  try {
    await h.start({ width: 390, height: 844 });
    await adminLogin(h, creds);

    h.label("admin/communication-training");
    await h.page.goto(`${APP_URL}/admin/communication`, { waitUntil: "domcontentloaded" });
    await settle(h.page, 1800);
    await h.shot("30-admin-communication-formations-empty");

    await h.page.getByRole("button", { name: /Nouveau module/i }).click();
    await h.page.getByRole("dialog").waitFor({ state: "visible", timeout: 5000 });

    const dialog = h.page.getByRole("dialog");
    await dialog.locator("input").first().fill(title);
    await dialog.locator("textarea").first().fill("Module temporaire QA pour verifier la politique RLS.");
    await dialog.getByRole("button", { name: /Enregistrer/i }).click();

    await h.page.getByText(/Module créé/i).waitFor({ timeout: 12000 });
    await settle(h.page, 1200);
    await h.shot("31-admin-training-module-created");

    const createdVisible = await h.page.getByText(title).isVisible().catch(() => false);
    record("training module created through admin UI", createdVisible);

    await cleanupModule(title);
    await h.page.reload({ waitUntil: "domcontentloaded" });
    await settle(h.page, 1400);
    const removed = !(await h.page.getByText(title).isVisible().catch(() => false));
    record("training module cleanup", removed);

    h.printFindings();
    record("console/network findings", h.findings.length === 0, `${h.findings.length} finding(s)`);
  } finally {
    await h.stop();
    await cleanupModule(title).catch(() => {});
  }

  console.log("\n--- Admin training module QA matrix ---");
  for (const c of checks) {
    console.log(`${c.passed ? "PASS" : "FAIL"} | ${c.name}${c.detail ? ` | ${c.detail}` : ""}`);
  }
  writeFileSync(`${SHOT_DIR}/admin-training-module-qa-matrix.json`, JSON.stringify({ checks, findings: h.findings }, null, 2));

  if (checks.some((c) => !c.passed)) process.exitCode = 1;
}

main().catch((error) => {
  console.error("FAIL Admin training module QA crashed", error);
  process.exit(1);
});
