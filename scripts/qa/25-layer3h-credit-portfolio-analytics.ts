/**
 * Layer 3H QA: Credit Portfolio Analytics & Executive Intelligence.
 *
 * Run:
 *   QA_APP_URL=http://127.0.0.1:8082 QA_SHOT_DIR=docs/specs/screenshots/layer3h bun run scripts/qa/25-layer3h-credit-portfolio-analytics.ts
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { Harness, loadCreds, adminLogin, settle, APP_URL, SHOT_DIR, type Creds, type Finding } from "./lib";

type Check = {
  name: string;
  passed: boolean;
  detail?: string;
};

type AdminClient = ReturnType<typeof createClient>;

const checks: Check[] = [];
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_mwZMYFqI_Jqa5ohlhLnQZw_y99c2WxK";
const STATIC_DIST_DIR = process.env.QA_STATIC_DIST_DIR;

const REQUIRED_VIEWS = [
  "v_credit_portfolio_account_facts",
  "v_credit_portfolio_health",
  "v_credit_product_performance",
  "v_credit_risk_delinquency_summary",
  "v_credit_growth_ownership_funnel",
  "v_credit_executive_attention_items",
  "v_credit_branch_performance",
  "v_credit_collector_performance",
  "v_credit_reconciliation_summary",
  "v_credit_analytics_freshness",
];

function record(name: string, passed: boolean, detail?: string) {
  checks.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function htmlToText(value: string) {
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function includesText(haystack: string, needle: string) {
  return normalized(haystack).includes(normalized(needle));
}

function contentTypeFor(filePath: string) {
  switch (extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
    case ".webmanifest":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

async function installStaticDistRoute(h: Harness) {
  if (!STATIC_DIST_DIR) return;

  const root = resolve(STATIC_DIST_DIR);
  const appOrigin = new URL(APP_URL).origin;
  const indexPath = join(root, "index.html");
  if (!existsSync(indexPath)) throw new Error(`QA_STATIC_DIST_DIR is missing index.html: ${root}`);

  await h.page.route(`${appOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    const relativePath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^\/+/, "");
    let filePath = join(root, relativePath);

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = indexPath;
    }

    await route.fulfill({
      status: 200,
      contentType: contentTypeFor(filePath),
      body: readFileSync(filePath),
    });
  });
  console.log(`Static app route installed for ${appOrigin} from ${root}`);
}

async function bodyText(h: Harness) {
  return h.page.content().then(htmlToText);
}

async function assertText(h: Harness, name: string, needle: string) {
  const deadline = Date.now() + 20_000;
  let text = "";
  while (Date.now() < deadline) {
    text = await bodyText(h);
    if (includesText(text, needle)) {
      record(name, true, needle);
      return;
    }
    await h.page.waitForTimeout(500);
  }
  record(name, false, needle);
}

function isHostedAuthBootstrapNoise(finding: Finding) {
  if (finding.kind !== "console" || !finding.detail.includes("TypeError: Failed to fetch")) return false;
  if (finding.detail.includes("Error fetching admin profile")) return true;
  if (finding.detail.includes("Failed to record login activity")) return true;
  if (finding.detail.includes("SupabaseAuthClient._useSession")) return true;
  return finding.detail.includes("assets/index-");
}

async function adminRpcClient(creds: Creds) {
  const client = createClient(creds.supabase_url, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: creds.admin_email,
    password: creds.admin_password,
  });
  if (error || !data.session) throw new Error(`admin RPC auth failed: ${error?.message ?? "missing session"}`);
  return client;
}

async function probeView(client: AdminClient, viewName: string) {
  const { error } = await client.from(viewName).select("*").limit(1);
  record(`${viewName} is queryable`, !error, error?.message);
}

async function validateDatabaseObjects(client: AdminClient) {
  for (const viewName of REQUIRED_VIEWS) {
    await probeView(client, viewName);
  }

  const metricDefinitions = await client
    .from("analytics_metric_definitions")
    .select("metric_id, source_view, formula_description")
    .limit(20);
  record(
    "metric library is source-linked",
    !metricDefinitions.error
      && (metricDefinitions.data ?? []).length >= 8
      && (metricDefinitions.data ?? []).every((row) => !!row.source_view && !!row.formula_description),
    metricDefinitions.error?.message ?? `${metricDefinitions.data?.length ?? 0} definitions`,
  );

  const audit = await client.rpc("record_analytics_audit_event", {
    p_event_type: "DRILLDOWN_ACCESSED",
    p_target_type: "qa_layer3h",
    p_target_id: "source_records",
    p_filters_json: { qa: true, layer: "3H" },
    p_report_type: "qa_layer3h",
    p_export_reference: null,
  });
  record("analytics audit RPC records drilldown access", !audit.error && !!audit.data, audit.error?.message ?? String(audit.data));

  const exported = await client.rpc("record_analytics_export", {
    p_export_type: "qa_portfolio_summary",
    p_filters_json: { qa: true, layer: "3H" },
    p_confidentiality_label: "CONFIDENTIAL - DAM Africa QA",
  });
  record("analytics export RPC is permissioned and audited", !exported.error && !!exported.data, exported.error?.message ?? String(exported.data));
}

async function clickTab(h: Harness, name: RegExp, screenshotName: string) {
  await h.page.getByRole("tab", { name }).click();
  await settle(h.page, 900);
  await h.shot(screenshotName);
}

async function runBrowserQA(creds: Creds) {
  const h = new Harness();
  try {
    await h.start({ width: 1440, height: 1000 });
    await installStaticDistRoute(h);
    await adminLogin(h, creds);
    h.label("admin/credit-portfolio");
    await h.page.goto(`${APP_URL}/admin/credit-portfolio`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await settle(h.page, 1800);

    await assertText(h, "portfolio analytics page loads", "Credit Portfolio Analytics");
    await assertText(h, "executive narrative renders", "Executive narrative");
    await assertText(h, "source drilldown renders", "Source records");
    await h.shot("portfolio-health");

    await h.page.getByRole("button", { name: /Past due/i }).click();
    await settle(h.page, 700);
    await assertText(h, "KPI drilldown filters source records", "Past-due accounts");
    await h.shot("drilldown-view");

    await clickTab(h, /Products/i, "product-performance");
    await assertText(h, "product performance dashboard renders", "Product performance");

    await clickTab(h, /Risk/i, "risk-dashboard");
    await assertText(h, "risk dashboard renders", "Risk segmentation");

    await clickTab(h, /Ownership/i, "growth-ownership-funnel");
    await assertText(h, "growth ownership funnel renders", "Growth and ownership funnel");

    await clickTab(h, /Quality/i, "data-quality-warning");
    await assertText(h, "data quality dashboard renders", "Data quality warnings");
    await assertText(h, "metric formula explanation available", "Metric library");

    await clickTab(h, /Audit/i, "export-audit-workflow");
    await assertText(h, "export audit dashboard renders", "Export history");

    const text = await bodyText(h);
    record("no fake/mock metrics shown", !/\b(fake|mock|vanity)\b/i.test(text), "production labels checked");

    const unexpected = h.findings.filter((finding) => !isHostedAuthBootstrapNoise(finding));
    if (h.findings.length !== unexpected.length) {
      console.log(`ignored ${h.findings.length - unexpected.length} hosted auth/bootstrap console finding(s)`);
    }
    record(
      "no unexpected console/network findings",
      unexpected.length === 0,
      unexpected.map((finding) => `[${finding.page}] ${finding.kind}: ${finding.detail}`).join(" | "),
    );
  } finally {
    await h.stop().catch(() => undefined);
  }
}

async function main() {
  const creds = loadCreds();
  const client = await adminRpcClient(creds);

  await validateDatabaseObjects(client);
  await runBrowserQA(creds);

  const failed = checks.filter((check) => !check.passed);
  const summary = {
    appUrl: APP_URL,
    shotDir: SHOT_DIR,
    generatedAt: new Date().toISOString(),
    checks,
    passed: checks.length - failed.length,
    failed: failed.length,
  };
  writeFileSync(`${SHOT_DIR}/layer3h-qa-summary.json`, JSON.stringify(summary, null, 2));
  console.log(`\nSummary written to ${SHOT_DIR}/layer3h-qa-summary.json`);
  console.log(`Checks: ${summary.passed} passed, ${summary.failed} failed`);

  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
