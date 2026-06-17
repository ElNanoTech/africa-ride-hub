/**
 * QA Phase 4 — shared Playwright harness.
 *
 * Drives the real app (vite dev server) against the LIVE Supabase backend,
 * using ONLY the isolated E2E tenant credentials from /tmp/qa-creds.json
 * (produced by scripts/qa/00-seed.ts).
 *
 * Collects console errors, page errors and failed network calls per page so
 * every unexpected one becomes a QA finding.
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

export const APP_URL = process.env.QA_APP_URL ?? "http://127.0.0.1:8080";
export const SHOT_DIR = process.env.QA_SHOT_DIR ?? "/tmp/qa-shots";

export type Creds = {
  supabase_url: string;
  customer_id: string;
  admin_email: string;
  admin_password: string;
  driver_id: string;
  driver_phone: string;
  driver_pin: string;
  vehicle_id: string;
  vehicle_plate: string;
  layer3a?: {
    vehicleProductId: string;
    vehicleVersionId: string;
    assetId: string;
  } | null;
  layer3b?: {
    policyId: string;
    extensionId: string;
  } | null;
  layer3c?: {
    vehicleTemplateId: string;
  } | null;
  layer3d?: {
    repaymentTermsId: string;
  } | null;
};

export function loadCreds(): Creds {
  return JSON.parse(readFileSync("/tmp/qa-creds.json", "utf8"));
}

export type Finding = {
  page: string;
  kind: "console" | "pageerror" | "requestfailed" | "http";
  detail: string;
};

export class Harness {
  browser!: Browser;
  ctx!: BrowserContext;
  page!: Page;
  findings: Finding[] = [];
  currentLabel = "init";

  async start(viewport: { width: number; height: number }) {
    mkdirSync(SHOT_DIR, { recursive: true });
    this.browser = await chromium.launch();
    this.ctx = await this.browser.newContext({
      viewport,
      // CI/sandbox proxies often re-sign TLS with a local CA; the live
      // Supabase API is unreachable from headless Chromium without this.
      ignoreHTTPSErrors: true,
      // mobile-ish UA when small viewport
      userAgent:
        viewport.width < 500
          ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 QA-Playwright"
          : undefined,
    });
    this.page = await this.ctx.newPage();
    this.attach(this.page);
    return this.page;
  }

  attach(page: Page) {
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        this.findings.push({ page: this.currentLabel, kind: "console", detail: msg.text().slice(0, 500) });
      }
    });
    page.on("pageerror", (err) => {
      this.findings.push({ page: this.currentLabel, kind: "pageerror", detail: String(err).slice(0, 500) });
    });
    page.on("requestfailed", (req) => {
      const f = req.failure()?.errorText ?? "";
      if (f.includes("ERR_ABORTED")) return; // benign navigations/cancellations
      this.findings.push({ page: this.currentLabel, kind: "requestfailed", detail: `${req.method()} ${req.url().slice(0, 200)} → ${f}` });
    });
    page.on("response", (res) => {
      if (res.status() >= 400) {
        this.findings.push({ page: this.currentLabel, kind: "http", detail: `${res.status()} ${res.request().method()} ${res.url().slice(0, 250)}` });
      }
    });
  }

  label(l: string) {
    this.currentLabel = l;
  }

  async shot(name: string) {
    const path = `${SHOT_DIR}/${name}.png`;
    await this.page.screenshot({ path, fullPage: true });
    console.log(`📸 ${path}`);
  }

  async stop() {
    await this.browser?.close();
  }

  printFindings() {
    if (this.findings.length === 0) {
      console.log("✅ no console/network findings");
      return;
    }
    console.log(`\n--- ${this.findings.length} console/network findings ---`);
    for (const f of this.findings) console.log(`[${f.page}] ${f.kind}: ${f.detail}`);
  }
}

/** Login on /driver/login with phone + PIN (native form). */
export async function driverLogin(h: Harness, creds: Creds) {
  const p = h.page;
  h.label("driver/login");
  await p.goto(`${APP_URL}/driver/login`, { waitUntil: "domcontentloaded" });
  await settle(p, 800);
  // The page auto-routes to the 'native' form when auth mode = org_managed;
  // otherwise click the phone button.
  const phoneInput = p.locator('input[type="tel"]');
  try {
    await phoneInput.waitFor({ timeout: 4000 });
  } catch {
    await p.getByRole("button", { name: /Connexion avec téléphone/i }).click();
    await phoneInput.waitFor({ timeout: 5000 });
  }
  const localDigits = creds.driver_phone.replace(/\D/g, "").replace(/^225/, "");
  await phoneInput.fill(localDigits);
  // PIN OTP input — the first text input of the OTP group
  const otp = p.locator('input[autocomplete="one-time-code"], [data-input-otp="true"]').first();
  await otp.click();
  await p.keyboard.type(creds.driver_pin, { delay: 60 });
  await p.getByRole("button", { name: /^Se connecter$/ }).click();
  // wait for redirect to driver home (biometric prompt is skipped in headless
  // chromium — no WebAuthn —, but handle it if shown)
  try {
    await p.waitForURL(/driver(-dashboard)?$/, { timeout: 15000 });
  } catch {
    const skip = p.getByRole("button", { name: /Plus tard|Passer|Ignorer/i });
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
      await p.waitForURL(/driver(-dashboard)?$/, { timeout: 10000 });
    } else {
      throw new Error(`driver login did not redirect; url=${p.url()}`);
    }
  }
  console.log(`✅ driver logged in → ${p.url()}`);
}

/** Login on /admin/login with email + password. */
export async function adminLogin(h: Harness, creds: Creds) {
  const p = h.page;
  h.label("admin/login");
  await p.goto(`${APP_URL}/admin/login`, { waitUntil: "networkidle" });
  await p.locator('input[type="email"]').fill(creds.admin_email);
  await p.locator('input[type="password"]').fill(creds.admin_password);
  await p.getByRole("button", { name: /Se connecter|Connexion/i }).click();
  await p.waitForURL(/\/admin(\/|$)(?!login)/, { timeout: 20000 });
  console.log(`✅ admin logged in → ${p.url()}`);
}

export async function settle(p: Page, ms = 1200) {
  await p.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
  await p.waitForTimeout(ms);
}
