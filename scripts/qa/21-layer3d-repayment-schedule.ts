/**
 * Layer 3D QA: Repayment Schedule & Credit Account Terms Engine.
 *
 * Run:
 *   QA_APP_URL=http://127.0.0.1:8082 QA_SHOT_DIR=docs/specs/screenshots/layer3d bun run scripts/qa/21-layer3d-repayment-schedule.ts
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { Harness, loadCreds, adminLogin, driverLogin, settle, APP_URL, SHOT_DIR, type Creds, type Finding } from "./lib";

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
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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

function qaPhoneNumber() {
  const digits = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100).toString().padStart(2, "0")}`.slice(-8);
  return `+225 05 ${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6, 8)}`;
}

async function createFreshQaDriver(admin: Awaited<ReturnType<typeof adminRpcClient>>, creds: Creds): Promise<Creds> {
  const session = await admin.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error("admin session missing for fresh QA driver creation");

  const phone = qaPhoneNumber();
  const pin = "4271";
  const response = await fetch(`${creds.supabase_url}/functions/v1/create-managed-driver`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fullName: "QA Chauffeur Layer 3D", phoneNumber: phone, pin }),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`create-managed-driver: ${JSON.stringify(body)}`);

  const driverId = body.driverId ?? body.driver_id ?? body.driver?.id;
  if (!driverId) throw new Error(`create-managed-driver did not return driver id: ${JSON.stringify(body)}`);

  const activated = await admin
    .from("drivers")
    .update({ kyc_status: "verified", driver_status: "active" })
    .eq("id", driverId)
    .select("id, kyc_status, driver_status")
    .single();
  if (activated.error) throw activated.error;

  const scored = await admin.from("driver_scores").upsert({
    driver_id: driverId,
    customer_id: creds.customer_id,
    current_score: 820,
  }, { onConflict: "customer_id,driver_id" });
  if (scored.error) throw scored.error;

  const creditScore = await admin.from("credit_scores").upsert({
    driver_id: driverId,
    customer_id: creds.customer_id,
    score: 820,
    tier: "A",
    status: "active",
    calculation_week: new Date().toISOString().slice(0, 10),
    driving_data_available: false,
    payment_data_available: false,
    income_data_available: false,
  }, { onConflict: "driver_id,calculation_week" });
  if (creditScore.error) throw creditScore.error;

  const exposure = await admin.from("credit_exposure_profiles").upsert({
    driver_id: driverId,
    customer_id: creds.customer_id,
    maximum_exposure_limit: 6000000,
    current_exposure: 0,
    available_exposure: 6000000,
    currency_code: "XOF",
    last_calculated_at: new Date().toISOString(),
  }, { onConflict: "customer_id,driver_id,currency_code" });
  if (exposure.error) throw exposure.error;

  const driverPhone = body.credentials?.phoneNumber ?? phone;
  const driverPin = body.credentials?.pin ?? pin;
  record("fresh QA driver isolated", true, driverId);
  return { ...creds, driver_id: driverId, driver_phone: driverPhone, driver_pin: driverPin };
}

async function executeContract(admin: Awaited<ReturnType<typeof adminRpcClient>>, driver: Awaited<ReturnType<typeof driverRpcClient>>, applicationId: string) {
  const generated = await admin.rpc("generate_credit_contract", {
    p_application_id: applicationId,
    p_idempotency_key: `qa-layer3d-contract:${randomUUID()}`,
  });
  if (generated.error) throw generated.error;

  const sent = await admin.rpc("send_credit_contract", {
    p_contract_id: generated.data.contract_id,
    p_idempotency_key: `qa-layer3d-contract-send:${randomUUID()}`,
  });
  if (sent.error) throw sent.error;

  const viewed = await driver.rpc("driver_view_credit_contract", {
    p_contract_id: generated.data.contract_id,
    p_idempotency_key: `qa-layer3d-contract-view:${randomUUID()}`,
  });
  if (viewed.error) throw viewed.error;

  const driverSigned = await driver.rpc("driver_sign_credit_contract", {
    p_contract_id: generated.data.contract_id,
    p_consent_confirmed: true,
    p_idempotency_key: `qa-layer3d-contract-driver-sign:${randomUUID()}`,
    p_device_metadata_json: { qa: true, layer: "3d" },
  });
  if (driverSigned.error) throw driverSigned.error;

  const adminSigned = await admin.rpc("admin_sign_credit_contract", {
    p_contract_id: generated.data.contract_id,
    p_signer_type: "ADMIN",
    p_reason: "QA Layer 3D admin countersignature",
    p_idempotency_key: `qa-layer3d-contract-admin-sign:${randomUUID()}`,
  });
  if (adminSigned.error) throw adminSigned.error;

  const managerSigned = await admin.rpc("admin_sign_credit_contract", {
    p_contract_id: generated.data.contract_id,
    p_signer_type: "MANAGER",
    p_reason: "QA Layer 3D manager final countersignature",
    p_idempotency_key: `qa-layer3d-contract-manager-sign:${randomUUID()}`,
  });
  if (managerSigned.error) throw managerSigned.error;

  record("contract fully executed for activation", managerSigned.data.contract_status === "FULLY_EXECUTED", managerSigned.data.contract_id);
  return managerSigned.data;
}

async function backendProbe(baseCreds: Creds) {
  let creds = baseCreds;
  if (!creds.layer3a || !creds.layer3b || !creds.layer3c || !creds.layer3d) {
    throw new Error("Layer 3A/3B/3C/3D QA seed missing. Run scripts/qa/00-seed.ts after applying Layer 3D.");
  }

  const admin = await adminRpcClient(creds);
  creds = await createFreshQaDriver(admin, creds);
  const driver = await driverRpcClient(creds);
  const assetId = randomUUID();
  const applicationKey = `qa-layer3d-application:${randomUUID()}`;

  const blockedBeforeActivation = await admin.rpc("generate_repayment_schedule", {
    p_credit_account_id: randomUUID(),
    p_idempotency_key: `qa-layer3d-blocked:${randomUUID()}`,
  });
  record("schedule generation blocked before activation", Boolean(blockedBeforeActivation.error), blockedBeforeActivation.error?.message);

  const asset = await admin.from("financed_assets").insert({
    asset_id: assetId,
    customer_id: creds.customer_id,
    asset_type: "VEHICLE",
    description: "QA Layer 3D Suzuki Dzire",
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

  const decisionResult = await admin.rpc("evaluate_underwriting_decision", {
    p_application_id: applicationId,
    p_idempotency_key: `qa-layer3d-decision:${randomUUID()}`,
  });
  if (decisionResult.error) throw decisionResult.error;
  const decision = decisionResult.data;
  record("Layer 3B approval available", ["APPROVED", "APPROVED_WITH_CONDITIONS"].includes(decision.decision), decision.decision);

  const contract = await executeContract(admin, driver, applicationId);

  const conditions = await admin
    .from("underwriting_conditions")
    .select("condition_id, status")
    .eq("decision_id", decision.decision_id);
  if (conditions.error) throw conditions.error;
  for (const condition of conditions.data ?? []) {
    if (condition.status === "PENDING") {
      const fulfilled = await admin.rpc("fulfill_underwriting_condition", {
        p_condition_id: condition.condition_id,
        p_status: "FULFILLED",
        p_idempotency_key: `qa-layer3d-condition:${condition.condition_id}`,
      });
      if (fulfilled.error) throw fulfilled.error;
    }
  }
  record("underwriting conditions fulfilled", true, `${conditions.data?.length ?? 0} condition(s)`);

  const downPayment = await admin.rpc("create_credit_down_payment_invoice", {
    p_application_id: applicationId,
    p_idempotency_key: `qa-layer3d-down-payment:${randomUUID()}`,
  });
  if (downPayment.error) throw downPayment.error;
  const paidDownPayment = await admin
    .from("invoice")
    .update({ status: "paid", amount_paid: downPayment.data.total_ttc, paid_at: new Date().toISOString() })
    .eq("id", downPayment.data.id)
    .select("id, status, amount_paid")
    .single();
  if (paidDownPayment.error) throw paidDownPayment.error;
  record("down payment paid through Financial Engine invoice", paidDownPayment.data.status === "paid", paidDownPayment.data.id);

  const fulfillment = await admin.from("fulfillment_records").upsert({
    customer_id: creds.customer_id,
    application_id: applicationId,
    asset_id: assetId,
    status: "POSSESSION_CONFIRMED",
    vendor_id: "35000000-0000-0000-0000-000000000001",
    possession_confirmed_at: new Date().toISOString(),
    asset_condition_at_handover: "NEW",
    handover_location: "QA Layer 3D handover",
  }, { onConflict: "application_id,asset_id" }).select("fulfillment_id, status").single();
  if (fulfillment.error) throw fulfillment.error;
  await admin.from("financed_assets").update({
    fulfillment_status: "POSSESSION_CONFIRMED",
    possession_status: "CONFIRMED",
  }).eq("asset_id", assetId);
  record("possession confirmed for activation", fulfillment.data.status === "POSSESSION_CONFIRMED", fulfillment.data.fulfillment_id);

  const activationPackage = await admin.rpc("create_activation_package", {
    p_application_id: applicationId,
    p_idempotency_key: `qa-layer3d-activation-package:${randomUUID()}`,
    p_request_hash: `qa-layer3d-package-${randomUUID()}`,
  });
  if (activationPackage.error) throw activationPackage.error;
  record("activation package ready", activationPackage.data.status === "READY", activationPackage.data.validation_results_json?.blockers?.join(", ") ?? "ready");

  const accountResult = await admin.rpc("activate_credit_account", {
    p_application_id: applicationId,
    p_idempotency_key: `qa-layer3d-activate-account:${randomUUID()}`,
    p_request_hash: `qa-layer3d-account-${randomUUID()}`,
  });
  if (accountResult.error) throw accountResult.error;
  const account = accountResult.data;
  record("credit account activated", account.status === "ACTIVE", account.credit_account_id);

  const scheduleKey = `qa-layer3d-schedule:${randomUUID()}`;
  const scheduleResult = await admin.rpc("generate_repayment_schedule", {
    p_credit_account_id: account.credit_account_id,
    p_idempotency_key: scheduleKey,
  });
  if (scheduleResult.error) throw scheduleResult.error;
  const schedule = scheduleResult.data;
  record("active credit account generates schedule", schedule.schedule_status === "ACTIVE", schedule.schedule_id);
  record("schedule pins fully executed contract", schedule.contract_id === contract.contract_id, schedule.contract_id);
  record("schedule pins product version", schedule.product_version_id === creds.layer3a.vehicleVersionId, schedule.product_version_id);
  record("schedule term count matches config", schedule.term_count === 4, `${schedule.term_count}`);
  record("schedule total uses integer money", Number.isInteger(schedule.total_repayment_amount), `${schedule.total_repayment_amount}`);

  const scheduleReplay = await admin.rpc("generate_repayment_schedule", {
    p_credit_account_id: account.credit_account_id,
    p_idempotency_key: scheduleKey,
  });
  if (scheduleReplay.error) throw scheduleReplay.error;
  record("schedule generation idempotency", scheduleReplay.data.schedule_id === schedule.schedule_id, scheduleReplay.data.schedule_id);

  const obligations = await admin
    .from("scheduled_obligations")
    .select("obligation_id, sequence_number, amount, principal_amount, interest_amount, fee_amount, status, due_date, invoice_id")
    .eq("schedule_id", schedule.schedule_id)
    .order("sequence_number", { ascending: true });
  if (obligations.error) throw obligations.error;
  const obligationRows = obligations.data ?? [];
  const obligationTotal = obligationRows.reduce((sum, row) => sum + row.amount, 0);
  record("obligations generated correctly", obligationRows.length === 4 && obligationTotal === schedule.total_repayment_amount, `${obligationRows.length} / ${obligationTotal}`);
  record("no floats or decimals for money", obligationRows.every((row) => [row.amount, row.principal_amount, row.interest_amount, row.fee_amount].every(Number.isInteger)), "integer minor units");

  const firstObligation = obligationRows[0];
  const invoiceKey = `qa-layer3d-invoice:${randomUUID()}`;
  const invoiceResult = await admin.rpc("generate_repayment_invoice", {
    p_obligation_id: firstObligation.obligation_id,
    p_idempotency_key: invoiceKey,
  });
  if (invoiceResult.error) throw invoiceResult.error;
  const invoice = invoiceResult.data;
  record("invoice generated through Financial Engine", invoice.source_obligation_id === firstObligation.obligation_id, invoice.id);

  const invoiceReplay = await admin.rpc("generate_repayment_invoice", {
    p_obligation_id: firstObligation.obligation_id,
    p_idempotency_key: invoiceKey,
  });
  if (invoiceReplay.error) throw invoiceReplay.error;
  record("duplicate invoice retry prevented", invoiceReplay.data.id === invoice.id, invoiceReplay.data.id);

  const link = await admin
    .from("invoice_payment_link")
    .select("invoice_id, payment_id")
    .eq("invoice_id", invoice.id)
    .maybeSingle();
  if (link.error) throw link.error;
  const linkedPayment = link.data?.payment_id
    ? await admin.from("payments").select("payment_type, amount, status").eq("id", link.data.payment_id).maybeSingle()
    : null;
  if (linkedPayment?.error) throw linkedPayment.error;
  record("invoice payable row linked", linkedPayment?.data?.payment_type === "loan_repayment", link.data?.payment_id);

  const paidInvoice = await admin
    .from("invoice")
    .update({ status: "paid", amount_paid: invoice.total_ttc, paid_at: new Date().toISOString() })
    .eq("id", invoice.id)
    .select("id, status, amount_paid")
    .single();
  if (paidInvoice.error) throw paidInvoice.error;

  const sync = await admin.rpc("sync_repayment_obligation_statuses", {
    p_schedule_id: schedule.schedule_id,
    p_idempotency_key: `qa-layer3d-sync:${randomUUID()}`,
  });
  if (sync.error) throw sync.error;
  const syncedPaid = (sync.data ?? []).some((row: { obligation_id: string; new_status: string }) =>
    row.obligation_id === firstObligation.obligation_id && row.new_status === "PAID"
  );
  record("payment sync updates obligation", syncedPaid, "paid invoice -> paid obligation");

  const amended = await admin.rpc("amend_repayment_schedule", {
    p_schedule_id: schedule.schedule_id,
    p_amendment_type: "BUSINESS_APPROVED_RESTRUCTURE",
    p_reason: "QA Layer 3D amendment workflow",
    p_new_terms_json: { term_count: 5, first_due_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10) },
    p_idempotency_key: `qa-layer3d-amend:${randomUUID()}`,
  });
  if (amended.error) throw amended.error;
  record("schedule amendment supersedes old schedule", amended.data.schedule_version === schedule.schedule_version + 1, amended.data.schedule_id);

  const oldSchedule = await admin
    .from("repayment_schedules")
    .select("schedule_id, schedule_status, superseded_by_schedule_id")
    .eq("schedule_id", schedule.schedule_id)
    .maybeSingle();
  if (oldSchedule.error) throw oldSchedule.error;
  record("old schedule immutable and superseded", oldSchedule.data?.schedule_status === "SUPERSEDED" && oldSchedule.data.superseded_by_schedule_id === amended.data.schedule_id, oldSchedule.data?.schedule_status);

  await admin.from("scheduled_obligations").insert({
    customer_id: creds.customer_id,
    schedule_id: amended.data.schedule_id,
    credit_account_id: account.credit_account_id,
    sequence_number: 99,
    obligation_type: "MANUAL_ADJUSTMENT",
    due_date: new Date().toISOString().slice(0, 10),
    amount: 1,
    currency_code: "XOF",
    principal_amount: 0,
    interest_amount: 0,
    fee_amount: 1,
    status: "SCHEDULED",
    invoice_generation_status: "PENDING",
    idempotency_key: `qa-layer3d-anomaly:${randomUUID()}`,
  });
  const anomalies = await admin
    .from("v_credit_schedule_reconciliation_anomalies")
    .select("anomaly_type, severity")
    .eq("schedule_id", amended.data.schedule_id);
  if (anomalies.error) throw anomalies.error;
  record("reconciliation detects schedule anomaly", (anomalies.data ?? []).some((row) => row.anomaly_type === "SCHEDULE_TOTAL_MISMATCH" && row.severity === "CRITICAL"), `${anomalies.data?.length ?? 0} anomaly row(s)`);

  const driverSchedules = await driver.rpc("get_driver_repayment_schedules");
  if (driverSchedules.error) throw driverSchedules.error;
  const driverPayload = JSON.stringify(driverSchedules.data);
  record("driver sees French-first schedule", driverPayload.includes("Calendrier"), "driver DTO");
  record("driver schedule DTO masks internals", !/terms_snapshot|source_snapshot|generated_from|policy|audit|idempotency|contract_hash|raw|ACTIVE|SCHEDULED|INVOICED/.test(driverPayload), "masked payload");

  return { scheduleId: amended.data.schedule_id, accountId: account.credit_account_id, creds };
}

async function main() {
  const seededCreds = loadCreds();
  const { creds } = await backendProbe(seededCreds);

  const admin = new Harness();
  await admin.start({ width: 1440, height: 980 });
  await adminLogin(admin, creds);
  await safeGoto(admin, "/admin/repayment-operations", "layer3d/admin-repayment");
  await assertText(admin, "admin page title", "Repayment Schedule Operations");
  await assertText(admin, "admin schedules tab", "Schedules");
  await assertText(admin, "admin obligations tab", "Obligations");
  await assertText(admin, "admin invoice linkage tab", "Invoice Linkage");
  await assertText(admin, "financial engine source copy", "Financial Engine remains the payment source of truth");
  await admin.shot("110-layer3d-admin-repayment-schedules");

  await admin.page.getByRole("tab", { name: "Obligations" }).click();
  await settle(admin.page, 1000);
  await assertText(admin, "obligations shown", "Scheduled Obligations");
  await admin.shot("111-layer3d-scheduled-obligations");

  await admin.page.getByRole("tab", { name: "Invoice Linkage" }).click();
  await settle(admin.page, 1000);
  await assertText(admin, "invoice linkage shown", "Invoice Linkage");
  await admin.shot("112-layer3d-invoice-linkage");

  await admin.page.getByRole("tab", { name: "Reconciliation" }).click();
  await settle(admin.page, 1000);
  await assertText(admin, "reconciliation shown", "Reconciliation Anomalies");
  await admin.shot("113-layer3d-reconciliation");

  const adminFindings = [...admin.findings];
  await stopHarness(admin);

  const driver = new Harness();
  await driver.start({ width: 390, height: 860 });
  await driverLogin(driver, creds);
  await safeGoto(driver, "/driver/credit", "layer3d/driver-credit");
  await assertText(driver, "driver credit route", "Crédit & Propriété");
  await assertText(driver, "driver repayment card", "Calendrier de paiement");
  await assertText(driver, "driver next due label", "Prochaine échéance");
  await assertAbsent(driver, "driver no terms snapshot", "terms_snapshot");
  await assertAbsent(driver, "driver no source snapshot", "source_snapshot");
  await assertAbsent(driver, "driver no policy internals", "policy");
  await assertAbsent(driver, "driver no audit internals", "audit");
  await assertAbsent(driver, "driver no raw active enum", "ACTIVE");
  await assertAbsent(driver, "driver no raw scheduled enum", "SCHEDULED");
  await driver.shot("114-layer3d-driver-credit-schedule");

  await safeGoto(driver, "/driver/finance", "layer3d/driver-finance");
  await assertText(driver, "driver finance available", "Finance");
  await assertText(driver, "driver finance invoices", "Factures ouvertes");
  await driver.shot("115-layer3d-driver-finance");

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

  console.log("\n--- Layer 3D QA matrix ---");
  for (const check of checks) {
    console.log(`${check.passed ? "PASS" : "FAIL"} | ${check.name}${check.detail ? ` | ${check.detail}` : ""}`);
  }

  writeFileSync(`${SHOT_DIR}/layer3d-qa-matrix.json`, JSON.stringify({ checks, findings: unexpectedFindings, ignoredFindings }, null, 2));
  process.exit(checks.some((check) => !check.passed) ? 1 : 0);
}

main().catch((error) => {
  console.error("FAIL Layer 3D QA crashed", error);
  process.exit(1);
});
