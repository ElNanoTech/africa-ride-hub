/**
 * Layer 3C QA: Contracting & E-Signature Engine.
 *
 * Run:
 *   QA_APP_URL=http://127.0.0.1:8082 QA_SHOT_DIR=docs/specs/screenshots/layer3c bun run scripts/qa/20-layer3c-contracting-esignature.ts
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
  if (!h.browser) return;
  await Promise.race([
    h.browser.close().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 5000)),
  ]);
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
  if (!creds.layer3a || !creds.layer3b || !creds.layer3c) {
    throw new Error("Layer 3A/3B/3C QA seed missing. Run scripts/qa/00-seed.ts after applying the Layer 3C migration.");
  }

  const admin = await adminRpcClient(creds);
  const driver = await driverRpcClient(creds);
  const assetId = randomUUID();
  const applicationKey = `qa-layer3c-application:${randomUUID()}`;
  const decisionKey = `qa-layer3c-decision:${randomUUID()}`;
  const generateKey = `qa-layer3c-generate:${randomUUID()}`;

  const template = await admin
    .from("contract_templates")
    .select("template_id, status, version, required_signers_json")
    .eq("template_id", creds.layer3c.vehicleTemplateId)
    .maybeSingle();
  if (template.error) throw template.error;
  record("vehicle ownership template created", template.data?.status === "ACTIVE", `template v${template.data?.version ?? "?"}`);

  const asset = await admin.from("financed_assets").insert({
    asset_id: assetId,
    customer_id: creds.customer_id,
    asset_type: "VEHICLE",
    description: "QA Layer 3C Suzuki Dzire",
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
  record("Layer 3B approval available for contracting", ["APPROVED", "APPROVED_WITH_CONDITIONS"].includes(decision.decision), decision.decision);

  const generated = await admin.rpc("generate_credit_contract", {
    p_application_id: applicationId,
    p_idempotency_key: generateKey,
  });
  if (generated.error) throw generated.error;
  const contract = generated.data;
  record("approved application generates contract", Boolean(contract.contract_id), contract.contract_status);
  record("contract references decision", contract.decision_id === decision.decision_id, contract.decision_id);
  record("contract pins product version", contract.product_version_id === creds.layer3a.vehicleVersionId, contract.product_version_id);
  record("contract pins template version", contract.template_id === creds.layer3c.vehicleTemplateId && contract.template_version === 1, `template ${contract.template_id}`);
  record("money byte-exact to decision", contract.contract_snapshot_json?.money?.principal_amount === decision.requested_exposure_amount, `${contract.contract_snapshot_json?.money?.principal_amount}`);
  record("contract snapshot immutable hash stored", Boolean(contract.snapshot_hash && contract.contract_hash), contract.snapshot_hash);

  const generatedReplay = await admin.rpc("generate_credit_contract", {
    p_application_id: applicationId,
    p_idempotency_key: generateKey,
  });
  if (generatedReplay.error) throw generatedReplay.error;
  record("contract generation idempotency", generatedReplay.data.contract_id === contract.contract_id, generatedReplay.data.contract_id);

  const activationBefore = await admin.rpc("create_activation_package", {
    p_application_id: applicationId,
    p_idempotency_key: `qa-layer3c-activation-before:${randomUUID()}`,
    p_request_hash: `qa-layer3c-before-${randomUUID()}`,
  });
  if (activationBefore.error) throw activationBefore.error;
  const blockersBefore = activationBefore.data.validation_results_json?.blockers ?? [];
  record("activation blocked before execution", blockersBefore.includes("signed_agreement_required"), blockersBefore.join(", "));

  const sent = await admin.rpc("send_credit_contract", {
    p_contract_id: contract.contract_id,
    p_idempotency_key: `qa-layer3c-send:${randomUUID()}`,
  });
  if (sent.error) throw sent.error;
  record("contract sent for signature", sent.data.contract_status === "SENT_FOR_SIGNATURE", sent.data.contract_status);

  const earlyAdminSign = await admin.rpc("admin_sign_credit_contract", {
    p_contract_id: contract.contract_id,
    p_signer_type: "ADMIN",
    p_reason: "QA sequencing negative test",
    p_idempotency_key: `qa-layer3c-early-admin-sign:${randomUUID()}`,
  });
  record("multi-signer sequencing blocks admin before driver", Boolean(earlyAdminSign.error), earlyAdminSign.error?.message);

  const driverSafeReady = await driver.rpc("get_driver_contract_statuses");
  if (driverSafeReady.error) throw driverSafeReady.error;
  const driverReadyPayload = JSON.stringify(driverSafeReady.data);
  record("driver-safe contract DTO masks internals", !/contract_snapshot|template_body|policy|matrix|reviewer|fraud|risk|signature_hash|ip_address|FULLY_EXECUTED|PARTIALLY_EXECUTED|ADMIN|MANAGER/.test(driverReadyPayload), "masked payload");
  record("driver sees French summary", driverReadyPayload.includes("accord de credit") || driverReadyPayload.includes("accord"), "summary visible");

  const viewed = await driver.rpc("driver_view_credit_contract", {
    p_contract_id: contract.contract_id,
    p_idempotency_key: `qa-layer3c-driver-view:${randomUUID()}`,
  });
  if (viewed.error) throw viewed.error;
  record("driver viewed contract", ["VIEWED", "PARTIALLY_EXECUTED"].includes(viewed.data.contract_status), viewed.data.contract_status);

  const driverSigned = await driver.rpc("driver_sign_credit_contract", {
    p_contract_id: contract.contract_id,
    p_consent_confirmed: true,
    p_idempotency_key: `qa-layer3c-driver-sign:${randomUUID()}`,
    p_device_metadata_json: { qa: true },
  });
  if (driverSigned.error) throw driverSigned.error;
  record("driver signature captured", driverSigned.data.contract_status === "PARTIALLY_EXECUTED", driverSigned.data.contract_status);

  const adminSigned = await admin.rpc("admin_sign_credit_contract", {
    p_contract_id: contract.contract_id,
    p_signer_type: "ADMIN",
    p_reason: "QA admin countersignature",
    p_idempotency_key: `qa-layer3c-admin-sign:${randomUUID()}`,
  });
  if (adminSigned.error) throw adminSigned.error;
  record("admin countersignature captured", adminSigned.data.contract_status === "PARTIALLY_EXECUTED", adminSigned.data.contract_status);

  const managerSigned = await admin.rpc("admin_sign_credit_contract", {
    p_contract_id: contract.contract_id,
    p_signer_type: "MANAGER",
    p_reason: "QA manager final countersignature",
    p_idempotency_key: `qa-layer3c-manager-sign:${randomUUID()}`,
  });
  if (managerSigned.error) throw managerSigned.error;
  record("fully executed after all required signers", managerSigned.data.contract_status === "FULLY_EXECUTED", managerSigned.data.contract_status);
  record("executed PDF hash recorded", Boolean(managerSigned.data.final_pdf_hash), managerSigned.data.final_pdf_hash);

  const agreement = await admin
    .from("credit_agreements")
    .select("agreement_id, contract_id, signed_at, contract_hash, snapshot_hash, signature_hash, final_pdf_hash")
    .eq("contract_id", contract.contract_id)
    .maybeSingle();
  if (agreement.error) throw agreement.error;
  record("credit_agreements activation bridge inserted", Boolean(agreement.data?.signed_at), agreement.data?.agreement_id);

  const file = await admin
    .from("contract_files")
    .select("file_id, file_type, file_hash")
    .eq("contract_id", contract.contract_id)
    .eq("file_type", "EXECUTED_PDF")
    .maybeSingle();
  if (file.error) throw file.error;
  record("executed PDF file hash validation", file.data?.file_hash === managerSigned.data.final_pdf_hash, file.data?.file_hash);

  const activationAfter = await admin.rpc("create_activation_package", {
    p_application_id: applicationId,
    p_idempotency_key: `qa-layer3c-activation-after:${randomUUID()}`,
    p_request_hash: `qa-layer3c-after-${randomUUID()}`,
  });
  if (activationAfter.error) throw activationAfter.error;
  const blockersAfter = activationAfter.data.validation_results_json?.blockers ?? [];
  record("executed agreement clears signature blocker", !blockersAfter.includes("signed_agreement_required"), blockersAfter.join(", "));
  record("no fake activation created", activationAfter.data.status === "BLOCKED" && blockersAfter.includes("down_payment_not_settled"), blockersAfter.join(", "));

  const events = await admin
    .from("contract_signature_events")
    .select("signature_event_id, signer_type, signature_status, consent_summary_version, ip_address_encrypted")
    .eq("contract_id", contract.contract_id);
  if (events.error) throw events.error;
  record("signature evidence stored", (events.data ?? []).filter((event) => event.signature_status === "SIGNED").length === 3, `${events.data?.length ?? 0} events`);
  record("consent bound to summary version", (events.data ?? []).some((event) => event.signer_type === "DRIVER" && event.consent_summary_version === "fr-ci-vehicle-v1"), "summary version");
  record("IP evidence stored as envelope", (events.data ?? []).some((event) => typeof event.ip_address_encrypted === "string" && event.ip_address_encrypted.startsWith("kms-envelope:v1:")), "encrypted envelope");

  return { applicationId, contractId: contract.contract_id };
}

async function main() {
  await backendProbe();
  const creds = loadCreds();

  const admin = new Harness();
  await admin.start({ width: 1440, height: 980 });
  await adminLogin(admin, creds);

  await safeGoto(admin, "/admin/contracts", "layer3c/admin-contracts");
  await assertText(admin, "admin page title", "Contracting & E-Signature");
  await assertText(admin, "admin queue tab", "Contract Queue");
  await assertText(admin, "admin signer tab", "Signer Status");
  await assertText(admin, "admin template tab", "Templates");
  await assertText(admin, "activation source copy", "latest valid fully executed agreement");
  await admin.shot("100-layer3c-admin-contracting");

  await admin.page.getByRole("tab", { name: "Signer Status" }).click();
  await settle(admin.page, 1000);
  await assertText(admin, "signer status shown", "Signer Status");
  await admin.shot("101-layer3c-signer-status");

  await admin.page.getByRole("tab", { name: "Evidence" }).click();
  await settle(admin.page, 1000);
  await assertText(admin, "evidence shown", "Signature Evidence");
  await admin.shot("102-layer3c-evidence");

  const adminFindings = [...admin.findings];
  await stopHarness(admin);

  const driver = new Harness();
  await driver.start({ width: 390, height: 860 });
  await driverLogin(driver, creds);
  await safeGoto(driver, "/driver/credit", "layer3c/driver-credit");
  await assertText(driver, "driver credit route", "Crédit & Propriété");
  await assertText(driver, "driver contract status", "Accord de crédit");
  await assertText(driver, "driver signed summary", "Accord signé");
  await assertAbsent(driver, "driver no contract snapshot", "contract_snapshot");
  await assertAbsent(driver, "driver no template body", "template_body");
  await assertAbsent(driver, "driver no raw policy", "policy");
  await assertAbsent(driver, "driver no reviewer note", "reviewer");
  await assertAbsent(driver, "driver no signature hash", "signature_hash");
  await assertAbsent(driver, "driver no ip evidence", "ip_address");
  await assertAbsent(driver, "driver no raw full enum", "FULLY_EXECUTED");
  await driver.shot("103-layer3c-driver-contract-status");

  const findings = [...adminFindings, ...driver.findings];
  const ignoredFindings = findings.filter(isHostedAuthBootstrapNoise);
  const unexpectedFindings = findings.filter((finding) => !isHostedAuthBootstrapNoise(finding));
  if (ignoredFindings.length > 0) {
    console.log(`ignored ${ignoredFindings.length} hosted auth/bootstrap console finding(s)`);
  }
  record("console/network findings", unexpectedFindings.length === 0, `${unexpectedFindings.length} finding(s)`);
  if (unexpectedFindings.length > 0) {
    for (const finding of unexpectedFindings) console.log(`[${finding.page}] ${finding.kind}: ${finding.detail}`);
  }
  await stopHarness(driver);

  console.log("\n--- Layer 3C QA matrix ---");
  for (const check of checks) {
    console.log(`${check.passed ? "PASS" : "FAIL"} | ${check.name}${check.detail ? ` | ${check.detail}` : ""}`);
  }

  writeFileSync(`${SHOT_DIR}/layer3c-qa-matrix.json`, JSON.stringify({ checks, findings: unexpectedFindings, ignoredFindings }, null, 2));
  process.exit(checks.some((check) => !check.passed) ? 1 : 0);
}

main().catch((error) => {
  console.error("FAIL Layer 3C QA crashed", error);
  process.exit(1);
});
