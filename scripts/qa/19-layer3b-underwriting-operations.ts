/**
 * Layer 3B QA: Underwriting & Decision Engine.
 *
 * Run:
 *   QA_APP_URL=http://127.0.0.1:8082 QA_SHOT_DIR=docs/specs/screenshots/layer3b bun run scripts/qa/19-layer3b-underwriting-operations.ts
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { Harness, loadCreds, adminLogin, driverLogin, settle, APP_URL, SHOT_DIR, type Finding } from "./lib";

type Check = {
  name: string;
  passed: boolean;
  detail?: string;
};

const checks: Check[] = [];
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_mwZMYFqI_Jqa5ohlhLnQZw_y99c2WxK";

function record(name: string, passed: boolean, detail?: string) {
  checks.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
}

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function includesText(haystack: string, needle: string) {
  return normalized(haystack).includes(normalized(needle));
}

function isHostedAuthBootstrapNoise(finding: Finding) {
  if (finding.kind !== "console" || !finding.detail.includes("TypeError: Failed to fetch")) return false;
  if (finding.detail.includes("Error fetching admin profile")) return true;
  if (finding.detail.includes("Failed to record login activity")) return true;
  return finding.detail.includes("assets/index-");
}

async function bodyText(h: Harness) {
  return h.page.locator("body").innerText({ timeout: 10000 }).catch(async () =>
    h.page.evaluate(() => document.body?.innerText ?? ""),
  );
}

async function assertText(h: Harness, name: string, needle: string) {
  const text = await bodyText(h);
  record(name, includesText(text, needle), needle);
}

async function assertAbsent(h: Harness, name: string, needle: string) {
  const text = await bodyText(h);
  record(name, !includesText(text, needle), `absent: ${needle}`);
}

async function safeGoto(h: Harness, path: string, label: string) {
  h.label(label);
  await h.page.goto(`${APP_URL}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await settle(h.page, 1800);
}

async function stopHarness(h: Harness) {
  await h.browser?.close().catch(() => undefined);
}

async function driverRpcClient(creds: ReturnType<typeof loadCreds>) {
  const client = createClient(creds.supabase_url, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const normalizedPhone = creds.driver_phone.replace(/\D/g, "");
  const email = `driver_${normalizedPhone}@dam-flotte.local`;
  const password = `pin_${creds.driver_pin}_${normalizedPhone}`;
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`driver RPC auth failed: ${error?.message ?? "missing session"}`);
  return client;
}

async function adminRpcClient(creds: ReturnType<typeof loadCreds>) {
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

async function backendProbe() {
  const creds = loadCreds();
  if (!creds.layer3a || !creds.layer3b) {
    throw new Error("Layer 3A/3B QA seed missing. Run scripts/qa/00-seed.ts after applying the Layer 3B migration.");
  }

  const admin = await adminRpcClient(creds);
  const driver = await driverRpcClient(creds);
  const assetId = randomUUID();
  const applicationKey = `qa-layer3b-application:${randomUUID()}`;
  const decisionKey = `qa-layer3b-decision:${randomUUID()}`;
  const triggerKey = `qa-layer3b-trigger:${randomUUID()}`;

  const asset = await admin.from("financed_assets").insert({
    asset_id: assetId,
    customer_id: creds.customer_id,
    asset_type: "VEHICLE",
    description: "QA Layer 3B Suzuki Dzire",
    vendor_id: "35000000-0000-0000-0000-000000000001",
    purchase_price: 4000000,
    purchase_price_currency_code: "XOF",
    residual_value: 1200000,
    residual_value_currency_code: "XOF",
    asset_condition: "NEW",
    fulfillment_status: "PENDING",
    possession_status: "NOT_POSSESSED",
    status: "AVAILABLE",
  }).select("asset_id").single();
  if (asset.error) throw asset.error;
  record("QA asset created", true, asset.data.asset_id);

  const submitted = await driver.rpc("submit_credit_application", {
    p_product_id: creds.layer3a.vehicleProductId,
    p_requested_asset_id: assetId,
    p_requested_terms_json: {},
    p_kyc_reference_id: null,
    p_idempotency_key: applicationKey,
  });
  if (submitted.error) throw submitted.error;
  const applicationId = submitted.data.application_id as string;
  record("driver submitted application", true, applicationId);

  const evaluated = await admin.rpc("evaluate_underwriting_decision", {
    p_application_id: applicationId,
    p_idempotency_key: decisionKey,
  });
  if (evaluated.error) throw evaluated.error;
  const decision = evaluated.data;
  record("Layer 3B decision persisted", Boolean(decision.decision_id), decision.decision);
  record("approval outcome owned by 3B", ["APPROVED", "APPROVED_WITH_CONDITIONS", "MANUAL_REVIEW", "DECLINED", "ESCALATED"].includes(decision.decision), decision.decision);
  record("decision-time score snapshot", typeof decision.decision_score_value === "number" && Boolean(decision.decision_score_grade), `${decision.decision_score_value}/${decision.decision_score_grade}`);
  record("decision-time exposure snapshot", decision.requested_exposure_amount === 4000000 && decision.requested_exposure_currency_code === "XOF", `${decision.requested_exposure_amount} ${decision.requested_exposure_currency_code}`);
  record("policy snapshot stored", Boolean(decision.evaluated_policy_snapshot_json?.decision_matrix_json), `policy v${decision.evaluated_policy_version}`);
  record("product extension constrained", Boolean(decision.extension_results_json?.conditions), "extension returned structured conditions");

  const replay = await admin.rpc("evaluate_underwriting_decision", {
    p_application_id: applicationId,
    p_idempotency_key: decisionKey,
  });
  if (replay.error) throw replay.error;
  record("decision idempotency", replay.data.decision_id === decision.decision_id, replay.data.decision_id);

  const trigger = await admin.rpc("trigger_reunderwriting", {
    p_application_id: applicationId,
    p_prior_decision_id: decision.decision_id,
    p_trigger_type: "RISK_STATUS_CHANGED",
    p_trigger_source: "qa-layer3b",
    p_trigger_payload_json: { qa: true },
    p_idempotency_key: triggerKey,
  });
  if (trigger.error) throw trigger.error;
  const triggerReplay = await admin.rpc("trigger_reunderwriting", {
    p_application_id: applicationId,
    p_prior_decision_id: decision.decision_id,
    p_trigger_type: "RISK_STATUS_CHANGED",
    p_trigger_source: "qa-layer3b",
    p_trigger_payload_json: { qa: true },
    p_idempotency_key: `${triggerKey}:duplicate`,
  });
  if (triggerReplay.error) throw triggerReplay.error;
  record("re-underwriting trigger idempotency", triggerReplay.data.trigger_id === trigger.data.trigger_id, trigger.data.trigger_type);

  const activation = await admin.rpc("create_activation_package", {
    p_application_id: applicationId,
    p_idempotency_key: `qa-layer3b-activation:${randomUUID()}`,
    p_request_hash: `qa-layer3b-${randomUUID()}`,
  });
  if (activation.error) throw activation.error;
  const blockers = activation.data.validation_results_json?.blockers ?? [];
  record("conditional activation lock", activation.data.status === "BLOCKED" && blockers.includes("underwriting_conditions_pending"), blockers.join(", "));
  record("re-underwriting activation lock", activation.data.status === "BLOCKED" && blockers.includes("reunderwriting_required"), blockers.join(", "));

  const driverSafe = await driver.rpc("get_driver_underwriting_decisions");
  if (driverSafe.error) throw driverSafe.error;
  const serialized = JSON.stringify(driverSafe.data);
  record(
    "driver-safe underwriting DTO",
    !/admin_explanation|policy|fraud|reviewer|matrix|risk_snapshot|condition_type|APPROVED_WITH_CONDITIONS|MANUAL_REVIEW|DECLINED|ESCALATED|PENDING|FULFILLED|WAIVED/.test(serialized),
    "masked payload",
  );
  record("driver sees explanation", serialized.includes("demande"), "human-readable explanation");

  return { creds, applicationId, decisionId: decision.decision_id };
}

async function main() {
  await backendProbe();
  const creds = loadCreds();

  const admin = new Harness();
  await admin.start({ width: 1440, height: 980 });
  await adminLogin(admin, creds);

  await safeGoto(admin, "/admin/underwriting-operations", "layer3b/admin-underwriting");
  await assertText(admin, "admin page title", "Underwriting Operations");
  await assertText(admin, "admin owns approvals copy", "Layer 3B owns approvals");
  await assertText(admin, "admin queue tab", "Queue");
  await assertText(admin, "admin policy tab", "Policy");
  await admin.shot("100-layer3b-admin-underwriting-operations");

  await admin.page.getByRole("tab", { name: "Decision Evidence" }).click();
  await settle(admin.page, 1000);
  await assertText(admin, "decision evidence shown", "Decision Evidence");
  await admin.shot("101-layer3b-decision-evidence");

  await admin.page.getByRole("tab", { name: "Policy" }).click();
  await settle(admin.page, 1000);
  await assertText(admin, "policy versioned", "Active Underwriting Policies");
  await assertText(admin, "product extensions shown", "Product Extensions");
  await admin.shot("102-layer3b-policy-sets");

  const adminFindings = [...admin.findings];
  await stopHarness(admin);

  const driver = new Harness();
  await driver.start({ width: 390, height: 860 });
  await driverLogin(driver, creds);
  await safeGoto(driver, "/driver/credit", "layer3b/driver-credit");
  await assertText(driver, "driver credit route", "Crédit & Propriété");
  await assertText(driver, "driver decision summary", "Décision underwriting");
  await assertText(driver, "driver explanation", "demande");
  await assertAbsent(driver, "driver no raw policy", "policy");
  await assertAbsent(driver, "driver no raw matrix", "matrix");
  await assertAbsent(driver, "driver no reviewer note", "reviewer");
  await assertAbsent(driver, "driver no fraud internals", "fraud");
  await driver.shot("103-layer3b-driver-decision-summary");

  const findings = [...adminFindings, ...driver.findings];
  const ignoredFindings = findings.filter(isHostedAuthBootstrapNoise);
  const unexpectedFindings = findings.filter((finding) => !isHostedAuthBootstrapNoise(finding));
  if (ignoredFindings.length > 0) {
    console.log(`ℹ️ ignored ${ignoredFindings.length} hosted auth/bootstrap console finding(s)`);
  }
  record("console/network findings", unexpectedFindings.length === 0, `${unexpectedFindings.length} finding(s)`);
  if (unexpectedFindings.length > 0) {
    for (const finding of unexpectedFindings) console.log(`[${finding.page}] ${finding.kind}: ${finding.detail}`);
  }
  await stopHarness(driver);

  console.log("\n--- Layer 3B QA matrix ---");
  for (const check of checks) {
    console.log(`${check.passed ? "PASS" : "FAIL"} | ${check.name}${check.detail ? ` | ${check.detail}` : ""}`);
  }

  writeFileSync(`${SHOT_DIR}/layer3b-qa-matrix.json`, JSON.stringify({ checks, findings: unexpectedFindings, ignoredFindings }, null, 2));
  process.exit(checks.some((check) => !check.passed) ? 1 : 0);
}

main().catch((error) => {
  console.error("FAIL Layer 3B QA crashed", error);
  process.exit(1);
});
