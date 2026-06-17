/**
 * Layer 3E QA: Delinquency, Collections & Credit Risk Operations.
 *
 * Run:
 *   QA_APP_URL=http://127.0.0.1:8082 QA_SHOT_DIR=docs/specs/screenshots/layer3e bun run scripts/qa/22-layer3e-delinquency-collections.ts
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

async function driverRpcClient(creds: Creds) {
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
    body: JSON.stringify({ fullName: "QA Chauffeur Layer 3E", phoneNumber: phone, pin }),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`create-managed-driver: ${JSON.stringify(body)}`);

  const driverId = body.driverId ?? body.driver_id ?? body.driver?.id;
  if (!driverId) throw new Error(`create-managed-driver did not return driver id: ${JSON.stringify(body)}`);

  const activated = await admin
    .from("drivers")
    .update({ kyc_status: "verified", driver_status: "active" })
    .eq("id", driverId)
    .select("id")
    .single();
  if (activated.error) throw activated.error;

  const legacyScore = await admin.from("driver_scores").upsert({
    driver_id: driverId,
    customer_id: creds.customer_id,
    current_score: 820,
  }, { onConflict: "customer_id,driver_id" });
  if (legacyScore.error) throw legacyScore.error;

  const score = await admin.from("credit_scores").upsert({
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
  if (score.error) throw score.error;

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
    p_idempotency_key: `qa-layer3e-contract:${randomUUID()}`,
  });
  if (generated.error) throw generated.error;

  const sent = await admin.rpc("send_credit_contract", {
    p_contract_id: generated.data.contract_id,
    p_idempotency_key: `qa-layer3e-contract-send:${randomUUID()}`,
  });
  if (sent.error) throw sent.error;

  const viewed = await driver.rpc("driver_view_credit_contract", {
    p_contract_id: generated.data.contract_id,
    p_idempotency_key: `qa-layer3e-contract-view:${randomUUID()}`,
  });
  if (viewed.error) throw viewed.error;

  const driverSigned = await driver.rpc("driver_sign_credit_contract", {
    p_contract_id: generated.data.contract_id,
    p_consent_confirmed: true,
    p_idempotency_key: `qa-layer3e-contract-driver-sign:${randomUUID()}`,
    p_device_metadata_json: { qa: true, layer: "3e" },
  });
  if (driverSigned.error) throw driverSigned.error;

  const adminSigned = await admin.rpc("admin_sign_credit_contract", {
    p_contract_id: generated.data.contract_id,
    p_signer_type: "ADMIN",
    p_reason: "QA Layer 3E admin countersignature",
    p_idempotency_key: `qa-layer3e-contract-admin-sign:${randomUUID()}`,
  });
  if (adminSigned.error) throw adminSigned.error;

  const managerSigned = await admin.rpc("admin_sign_credit_contract", {
    p_contract_id: generated.data.contract_id,
    p_signer_type: "MANAGER",
    p_reason: "QA Layer 3E manager final countersignature",
    p_idempotency_key: `qa-layer3e-contract-manager-sign:${randomUUID()}`,
  });
  if (managerSigned.error) throw managerSigned.error;

  record("contract fully executed for activation", managerSigned.data.contract_status === "FULLY_EXECUTED", managerSigned.data.contract_id);
  return managerSigned.data;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function provisionCreditAccount(creds: Creds) {
  const admin = await adminRpcClient(creds);
  const isolatedCreds = await createFreshQaDriver(admin, creds);
  const driver = await driverRpcClient(isolatedCreds);
  const assetId = randomUUID();

  const asset = await admin.from("financed_assets").insert({
    asset_id: assetId,
    customer_id: isolatedCreds.customer_id,
    asset_type: "VEHICLE",
    description: "QA Layer 3E Suzuki Dzire",
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

  const submitted = await driver.rpc("submit_credit_application", {
    p_product_id: isolatedCreds.layer3a?.vehicleProductId,
    p_requested_asset_id: assetId,
    p_requested_terms_json: {},
    p_kyc_reference_id: null,
    p_idempotency_key: `qa-layer3e-application:${randomUUID()}`,
  });
  if (submitted.error) throw submitted.error;

  const decisionResult = await admin.rpc("evaluate_underwriting_decision", {
    p_application_id: submitted.data.application_id,
    p_idempotency_key: `qa-layer3e-decision:${randomUUID()}`,
  });
  if (decisionResult.error) throw decisionResult.error;
  record("Layer 3B approval available", ["APPROVED", "APPROVED_WITH_CONDITIONS"].includes(decisionResult.data.decision), decisionResult.data.decision);

  await executeContract(admin, driver, submitted.data.application_id);

  const conditions = await admin
    .from("underwriting_conditions")
    .select("condition_id, status")
    .eq("decision_id", decisionResult.data.decision_id);
  if (conditions.error) throw conditions.error;
  for (const condition of conditions.data ?? []) {
    if (condition.status === "PENDING") {
      const fulfilled = await admin.rpc("fulfill_underwriting_condition", {
        p_condition_id: condition.condition_id,
        p_status: "FULFILLED",
        p_idempotency_key: `qa-layer3e-condition:${condition.condition_id}`,
      });
      if (fulfilled.error) throw fulfilled.error;
    }
  }

  const downPayment = await admin.rpc("create_credit_down_payment_invoice", {
    p_application_id: submitted.data.application_id,
    p_idempotency_key: `qa-layer3e-down-payment:${randomUUID()}`,
  });
  if (downPayment.error) throw downPayment.error;
  const paidDownPayment = await admin
    .from("invoice")
    .update({ status: "paid", amount_paid: downPayment.data.total_ttc, paid_at: new Date().toISOString() })
    .eq("id", downPayment.data.id)
    .select("id")
    .single();
  if (paidDownPayment.error) throw paidDownPayment.error;

  const fulfillment = await admin.from("fulfillment_records").upsert({
    customer_id: isolatedCreds.customer_id,
    application_id: submitted.data.application_id,
    asset_id: assetId,
    status: "POSSESSION_CONFIRMED",
    vendor_id: "35000000-0000-0000-0000-000000000001",
    possession_confirmed_at: new Date().toISOString(),
    asset_condition_at_handover: "NEW",
    handover_location: "QA Layer 3E handover",
  }, { onConflict: "application_id,asset_id" }).select("fulfillment_id, status").single();
  if (fulfillment.error) throw fulfillment.error;
  await admin.from("financed_assets").update({
    fulfillment_status: "POSSESSION_CONFIRMED",
    possession_status: "CONFIRMED",
  }).eq("asset_id", assetId);

  const activationPackage = await admin.rpc("create_activation_package", {
    p_application_id: submitted.data.application_id,
    p_idempotency_key: `qa-layer3e-activation-package:${randomUUID()}`,
    p_request_hash: `qa-layer3e-package-${randomUUID()}`,
  });
  if (activationPackage.error) throw activationPackage.error;

  const accountResult = await admin.rpc("activate_credit_account", {
    p_application_id: submitted.data.application_id,
    p_idempotency_key: `qa-layer3e-activate-account:${randomUUID()}`,
    p_request_hash: `qa-layer3e-account-${randomUUID()}`,
  });
  if (accountResult.error) throw accountResult.error;

  const productVersionId = accountResult.data.product_version_id ?? isolatedCreds.layer3a?.vehicleVersionId;
  if (!productVersionId) throw new Error("activated credit account did not expose product version id");

  const versionBefore = await admin
    .from("product_versions")
    .select("repayment_terms_json")
    .eq("version_id", productVersionId)
    .single();
  if (versionBefore.error) throw versionBefore.error;

  const originalRepaymentTerms = (versionBefore.data.repayment_terms_json ?? {}) as Record<string, unknown>;
  const qaPastDueDate = daysAgo(7);
  const patchedTerms = { ...originalRepaymentTerms, first_due_date: qaPastDueDate };
  const patchedVersion = await admin
    .from("product_versions")
    .update({ repayment_terms_json: patchedTerms })
    .eq("version_id", productVersionId);
  if (patchedVersion.error) throw patchedVersion.error;

  let scheduleResult: Awaited<ReturnType<typeof admin.rpc>> | null = null;
  let restoreError: Error | null = null;
  try {
    scheduleResult = await admin.rpc("generate_repayment_schedule", {
      p_credit_account_id: accountResult.data.credit_account_id,
      p_idempotency_key: `qa-layer3e-schedule:${randomUUID()}`,
    });
  } finally {
    const restoredVersion = await admin
      .from("product_versions")
      .update({ repayment_terms_json: originalRepaymentTerms })
      .eq("version_id", productVersionId);
    restoreError = restoredVersion.error;
  }
  if (restoreError) throw restoreError;
  if (!scheduleResult) throw new Error("schedule generation did not return a result");
  if (scheduleResult.error) throw scheduleResult.error;
  record("credit account and schedule ready", scheduleResult.data.schedule_status === "ACTIVE", scheduleResult.data.schedule_id);

  const obligations = await admin
    .from("scheduled_obligations")
    .select("obligation_id, schedule_id, credit_account_id, sequence_number, amount, due_date, invoice_id")
    .eq("schedule_id", scheduleResult.data.schedule_id)
    .order("sequence_number", { ascending: true });
  if (obligations.error) throw obligations.error;
  const firstObligation = obligations.data?.[0];
  if (!firstObligation) throw new Error("schedule generated no obligations");

  const invoiceResult = await admin.rpc("generate_repayment_invoice", {
    p_obligation_id: firstObligation.obligation_id,
    p_idempotency_key: `qa-layer3e-invoice:${randomUUID()}`,
  });
  if (invoiceResult.error) throw invoiceResult.error;
  record("repayment invoice created", invoiceResult.data.source_obligation_id === firstObligation.obligation_id, invoiceResult.data.id);

  return {
    creds: isolatedCreds,
    admin,
    driver,
    accountId: accountResult.data.credit_account_id as string,
    scheduleId: scheduleResult.data.schedule_id as string,
    obligationId: firstObligation.obligation_id as string,
    obligationDueDate: firstObligation.due_date as string,
    invoiceId: invoiceResult.data.id as string,
    invoiceTotal: invoiceResult.data.total_ttc as number,
  };
}

async function backendProbe(baseCreds: Creds) {
  if (!baseCreds.layer3a || !baseCreds.layer3b || !baseCreds.layer3c || !baseCreds.layer3d) {
    throw new Error("Layer 3A/3B/3C/3D QA seed missing. Run scripts/qa/00-seed.ts after applying Layer 3D.");
  }

  const ctx = await provisionCreditAccount(baseCreds);
  const partialAmount = Math.floor(ctx.invoiceTotal / 2);

  record("scheduled obligation seeded past due", ctx.obligationDueDate < new Date().toISOString().slice(0, 10), ctx.obligationDueDate);

  const agedInvoice = await ctx.admin
    .from("invoice")
    .update({ status: "issued", amount_paid: 0, due_date: ctx.obligationDueDate, paid_at: null })
    .eq("id", ctx.invoiceId)
    .select("id, status, remaining_due, due_date")
    .single();
  if (agedInvoice.error) throw agedInvoice.error;
  record("Financial Engine invoice aged past due", agedInvoice.data.status === "issued", agedInvoice.data.due_date);

  const sync = await ctx.admin.rpc("sync_credit_collections", {
    p_credit_account_id: ctx.accountId,
    p_idempotency_key: `qa-layer3e-sync:${randomUUID()}`,
  });
  if (sync.error) throw sync.error;

  const queueCase = await ctx.admin
    .from("v_credit_collections_queue")
    .select("case_id, credit_account_id, obligation_id, delinquency_status, current_status, total_past_due_amount, days_past_due")
    .eq("obligation_id", ctx.obligationId)
    .single();
  if (queueCase.error) throw queueCase.error;
  const caseId = queueCase.data.case_id as string;
  record("sync creates collections case", queueCase.data.credit_account_id === ctx.accountId, caseId);
  record("case ranked as overdue", ["LATE", "COLLECTIONS_QUEUE", "ESCALATED_RISK", "DEFAULT_REVIEW"].includes(queueCase.data.delinquency_status), queueCase.data.delinquency_status);

  const replaySync = await ctx.admin.rpc("sync_credit_collections", {
    p_credit_account_id: ctx.accountId,
    p_idempotency_key: `qa-layer3e-sync:${randomUUID()}`,
  });
  if (replaySync.error) throw replaySync.error;
  const duplicateOpenCases = await ctx.admin
    .from("credit_collections_cases")
    .select("case_id")
    .eq("obligation_id", ctx.obligationId)
    .not("current_status", "in", "(RESOLVED,CLOSED)");
  if (duplicateOpenCases.error) throw duplicateOpenCases.error;
  record("one open case per obligation", (duplicateOpenCases.data ?? []).length === 1, `${duplicateOpenCases.data?.length ?? 0}`);

  const contactKey = `qa-layer3e-contact:${randomUUID()}`;
  const contact = await ctx.admin.rpc("log_credit_collection_contact", {
    p_case_id: caseId,
    p_action_note: "QA contact: driver understands the payment path.",
    p_driver_visible: true,
    p_action_type: "CONTACT_ATTEMPT",
    p_idempotency_key: contactKey,
    p_request_hash: contactKey,
  });
  if (contact.error) throw contact.error;
  const contactReplay = await ctx.admin.rpc("log_credit_collection_contact", {
    p_case_id: caseId,
    p_action_note: "QA duplicate contact replay.",
    p_driver_visible: true,
    p_action_type: "CONTACT_ATTEMPT",
    p_idempotency_key: contactKey,
    p_request_hash: contactKey,
  });
  if (contactReplay.error) throw contactReplay.error;
  record("contact action idempotent", contactReplay.data.action_id === contact.data.action_id, contact.data.action_id);

  const reminder = await ctx.admin.rpc("send_credit_collection_reminder", {
    p_case_id: caseId,
    p_reminder_type: "LATE",
    p_channel: "IN_APP",
    p_idempotency_key: `qa-layer3e-reminder:${randomUUID()}`,
  });
  if (reminder.error) throw reminder.error;
  record("driver reminder logged", reminder.data.status === "SENT", reminder.data.reminder_id);

  await ctx.admin
    .from("invoice")
    .update({ status: "partial", amount_paid: partialAmount })
    .eq("id", ctx.invoiceId);
  const partialSync = await ctx.admin.rpc("sync_credit_collections", {
    p_credit_account_id: ctx.accountId,
    p_idempotency_key: `qa-layer3e-partial-sync:${randomUUID()}`,
  });
  if (partialSync.error) throw partialSync.error;
  const partialCase = await ctx.admin
    .from("credit_collections_cases")
    .select("delinquency_status, total_past_due_amount")
    .eq("case_id", caseId)
    .single();
  if (partialCase.error) throw partialCase.error;
  record("partial recovery state detected", partialCase.data.delinquency_status === "PARTIALLY_RECOVERED", partialCase.data.delinquency_status);

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const promiseKey = `qa-layer3e-promise:${randomUUID()}`;
  const promise = await ctx.admin.rpc("create_promise_to_pay", {
    p_case_id: caseId,
    p_promised_amount: partialCase.data.total_past_due_amount,
    p_promised_payment_date: tomorrow,
    p_idempotency_key: promiseKey,
    p_request_hash: promiseKey,
  });
  if (promise.error) throw promise.error;
  const promiseReplay = await ctx.admin.rpc("create_promise_to_pay", {
    p_case_id: caseId,
    p_promised_amount: partialCase.data.total_past_due_amount,
    p_promised_payment_date: tomorrow,
    p_idempotency_key: promiseKey,
    p_request_hash: promiseKey,
  });
  if (promiseReplay.error) throw promiseReplay.error;
  record("promise-to-pay idempotent", promiseReplay.data.promise_id === promise.data.promise_id, promise.data.promise_id);

  const broken = await ctx.admin.rpc("break_promise_to_pay", {
    p_promise_id: promise.data.promise_id,
    p_reason: "QA broken promise path",
    p_idempotency_key: `qa-layer3e-break:${randomUUID()}`,
  });
  if (broken.error) throw broken.error;
  record("broken promise escalates promise status", broken.data.promise_status === "BROKEN", broken.data.promise_status);

  const escalation = await ctx.admin.rpc("escalate_credit_risk", {
    p_case_id: caseId,
    p_escalation_type: "BROKEN_PROMISE_TO_PAY",
    p_reason: "QA risk escalation after broken promise",
    p_idempotency_key: `qa-layer3e-escalate:${randomUUID()}`,
  });
  if (escalation.error) throw escalation.error;
  record("risk escalation creates score event", Boolean(escalation.data.score_event_id), escalation.data.escalation_id);

  const review = await ctx.admin.rpc("open_default_review", {
    p_case_id: caseId,
    p_reason: "QA priority review after persistent delinquency",
    p_idempotency_key: `qa-layer3e-review:${randomUUID()}`,
  });
  if (review.error) throw review.error;
  record("priority review opens without legal workflow", review.data.current_status === "DEFAULT_REVIEW", review.data.current_status);

  await ctx.admin
    .from("invoice")
    .update({ status: "paid", amount_paid: ctx.invoiceTotal, paid_at: new Date().toISOString() })
    .eq("id", ctx.invoiceId);
  const resolvedSync = await ctx.admin.rpc("sync_credit_collections", {
    p_credit_account_id: ctx.accountId,
    p_idempotency_key: `qa-layer3e-resolved-sync:${randomUUID()}`,
  });
  if (resolvedSync.error) throw resolvedSync.error;
  const resolved = await ctx.admin
    .from("credit_collections_cases")
    .select("current_status, delinquency_status, closure_reason")
    .eq("case_id", caseId)
    .single();
  if (resolved.error) throw resolved.error;
  record("paid invoice resolves case", resolved.data.current_status === "RESOLVED" && resolved.data.delinquency_status === "RESOLVED", resolved.data.closure_reason);

  await ctx.admin.from("scheduled_obligations").insert({
    customer_id: ctx.creds.customer_id,
    schedule_id: ctx.scheduleId,
    credit_account_id: ctx.accountId,
    sequence_number: 99,
    obligation_type: "MANUAL_ADJUSTMENT",
    due_date: daysAgo(4),
    amount: 1,
    currency_code: "XOF",
    principal_amount: 0,
    interest_amount: 0,
    fee_amount: 1,
    status: "SCHEDULED",
    invoice_generation_status: "PENDING",
    idempotency_key: `qa-layer3e-anomaly:${randomUUID()}`,
  });
  const anomalies = await ctx.admin
    .from("v_credit_collections_reconciliation_anomalies")
    .select("anomaly_type, severity")
    .eq("credit_account_id", ctx.accountId);
  if (anomalies.error) throw anomalies.error;
  record("reconciliation detects overdue obligation without case", (anomalies.data ?? []).some((row) => row.anomaly_type === "OVERDUE_INVOICE_WITHOUT_COLLECTION_STATUS"), `${anomalies.data?.length ?? 0} anomaly row(s)`);

  const driverStatus = await ctx.driver.rpc("get_driver_collections_status");
  if (driverStatus.error) throw driverStatus.error;
  const driverPayload = JSON.stringify(driverStatus.data);
  record("driver collections DTO masks internals", !/COLLECTIONS_QUEUE|ESCALATED_RISK|DEFAULT_REVIEW|case_status|audit|idempotency|legal|repossession/i.test(driverPayload), "masked payload");

  return { creds: ctx.creds, caseId, driverId: ctx.creds.driver_id };
}

async function main() {
  const seededCreds = loadCreds();
  const { creds, driverId } = await backendProbe(seededCreds);

  const admin = new Harness();
  await admin.start({ width: 1440, height: 980 });
  await adminLogin(admin, creds);
  await safeGoto(admin, "/admin/credit-collections", "layer3e/admin-collections");
  await assertText(admin, "admin collections page title", "Credit Collections");
  await assertText(admin, "admin queue tab", "Queue");
  await assertText(admin, "admin reconciliation tab", "Reconciliation");
  await assertText(admin, "financial engine guardrail copy", "Financial Engine remains the source of truth");
  await admin.shot("120-layer3e-admin-collections-queue");

  await admin.page.getByRole("tab", { name: "Case Workbench" }).click();
  await settle(admin.page, 1000);
  await assertText(admin, "case workbench actions visible", "Contact & Reminders");
  await assertText(admin, "promise workflow visible", "Promise & Recovery");
  await admin.shot("121-layer3e-case-workbench");

  await admin.page.getByRole("tab", { name: "Reconciliation" }).click();
  await settle(admin.page, 1000);
  await assertText(admin, "collections reconciliation visible", "Collections Reconciliation");
  await admin.shot("122-layer3e-reconciliation");

  await safeGoto(admin, `/admin/drivers/${driverId}`, "layer3e/admin-driver360");
  await assertText(admin, "driver360 collections signal", "Collections");
  await admin.shot("123-layer3e-driver360-collections");

  await safeGoto(admin, "/admin/financial-operations", "layer3e/admin-financial-ops");
  await assertText(admin, "financial ops collections bridge", "Credit Collections");
  await admin.shot("124-layer3e-financial-ops-bridge");

  const adminFindings = [...admin.findings];
  await stopHarness(admin);

  const driver = new Harness();
  await driver.start({ width: 390, height: 860 });
  await driverLogin(driver, creds);
  await safeGoto(driver, "/driver/credit", "layer3e/driver-credit");
  await assertText(driver, "driver credit route", "Crédit & Propriété");
  await assertText(driver, "driver-safe collections card", "Paiement crédit");
  await assertAbsent(driver, "driver no raw collections enum", "COLLECTIONS_QUEUE");
  await assertAbsent(driver, "driver no raw escalation enum", "ESCALATED_RISK");
  await assertAbsent(driver, "driver no raw review enum", "DEFAULT_REVIEW");
  await assertAbsent(driver, "driver no legal/repo language", "repossession");
  await driver.shot("125-layer3e-driver-credit-collections");

  await safeGoto(driver, "/driver/finance", "layer3e/driver-finance");
  await assertText(driver, "driver finance route", "Finance");
  await driver.shot("126-layer3e-driver-finance-collections");

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

  console.log("\n--- Layer 3E QA matrix ---");
  for (const check of checks) {
    console.log(`${check.passed ? "PASS" : "FAIL"} | ${check.name}${check.detail ? ` | ${check.detail}` : ""}`);
  }

  writeFileSync(`${SHOT_DIR}/layer3e-qa-matrix.json`, JSON.stringify({ checks, findings: unexpectedFindings, ignoredFindings }, null, 2));
  process.exit(checks.some((check) => !check.passed) ? 1 : 0);
}

main().catch((error) => {
  console.error("FAIL Layer 3E QA crashed", error);
  process.exit(1);
});
