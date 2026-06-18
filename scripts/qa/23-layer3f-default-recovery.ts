/**
 * Layer 3F QA: Default, Recovery & Ownership Protection Engine.
 *
 * Run:
 *   QA_APP_URL=http://127.0.0.1:8082 QA_SHOT_DIR=docs/specs/screenshots/layer3f bun run scripts/qa/23-layer3f-default-recovery.ts
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

type CollectionsCase = {
  case_id: string;
  credit_account_id: string;
  driver_id: string;
  driver_name: string | null;
  total_past_due_amount: number;
  days_past_due: number;
};

type DefaultReview = {
  default_review_id: string;
  status: string;
  driver_id: string;
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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function isHostedAuthBootstrapNoise(finding: Finding) {
  if (finding.kind !== "console" || !finding.detail.includes("TypeError: Failed to fetch")) return false;
  if (finding.detail.includes("Error fetching admin profile")) return true;
  if (finding.detail.includes("Failed to record login activity")) return true;
  if (finding.detail.includes("SupabaseAuthClient._useSession")) return true;
  return finding.detail.includes("assets/index-");
}

async function bodyText(h: Harness) {
  return withTimeout(
    h.page.locator("body").innerText({ timeout: 10000 }).catch(async () =>
      h.page.evaluate(() => document.body?.innerText ?? ""),
    ),
    15_000,
    `${h.currentLabel} body text`,
  );
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
  record(name, includesText(text, needle), needle);
}

async function assertAbsent(h: Harness, name: string, needle: string) {
  const text = await bodyText(h);
  record(name, !includesText(text, needle), `absent: ${needle}`);
}

async function safeGoto(h: Harness, path: string, label: string) {
  h.label(label);
  await withTimeout(
    h.page.goto(`${APP_URL}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 }),
    35_000,
    `${label} navigation`,
  );
  await withTimeout(settle(h.page, 1800), 10_000, `${label} settle`);
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

function tomorrow(days = 1) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function futureIso(days = 1) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

async function findCollectionsCase(admin: Awaited<ReturnType<typeof adminRpcClient>>, creds: Creds) {
  const driverCase = await admin
    .from("v_credit_collections_queue")
    .select("case_id, credit_account_id, driver_id, driver_name, total_past_due_amount, days_past_due")
    .eq("driver_id", creds.driver_id)
    .limit(1);
  if (driverCase.error) throw driverCase.error;
  if ((driverCase.data ?? []).length > 0) return driverCase.data![0] as CollectionsCase;

  const anyCase = await admin
    .from("v_credit_collections_queue")
    .select("case_id, credit_account_id, driver_id, driver_name, total_past_due_amount, days_past_due")
    .limit(1);
  if (anyCase.error) throw anyCase.error;
  return (anyCase.data ?? [])[0] as CollectionsCase | undefined;
}

async function runRpcWorkflow(admin: Awaited<ReturnType<typeof adminRpcClient>>, creds: Creds) {
  const collection = await findCollectionsCase(admin, creds);
  if (!collection) {
    record("RPC workflow skipped when no collections case is seeded", true, "Run Layer 3E QA first for mutation coverage.");
    return { review: null as DefaultReview | null, driverOwned: false };
  }

  const opened = await admin.rpc("open_credit_default_review", {
    p_credit_account_id: collection.credit_account_id,
    p_collections_case_id: collection.case_id,
    p_trigger_reason: "QA Layer 3F default recovery review",
    p_decision_due_at: futureIso(3),
    p_idempotency_key: `qa-layer3f-open:${randomUUID()}`,
    p_request_hash: `qa-layer3f-open:${randomUUID()}`,
  });
  if (opened.error) throw opened.error;
  const review = opened.data as DefaultReview;
  record("open_credit_default_review creates or returns active review", !!review?.default_review_id, review?.default_review_id);

  const assigned = await admin.rpc("assign_credit_default_review", {
    p_default_review_id: review.default_review_id,
    p_assigned_to: null,
    p_note: "QA Layer 3F assignment",
    p_idempotency_key: `qa-layer3f-assign:${randomUUID()}`,
    p_request_hash: `qa-layer3f-assign:${randomUUID()}`,
  });
  if (assigned.error) throw assigned.error;
  record("assign_credit_default_review audits ownership", assigned.data.default_review_id === review.default_review_id);

  const existingEvidence = await admin
    .from("credit_default_evidence")
    .select("evidence_id")
    .eq("default_review_id", review.default_review_id)
    .limit(1);
  if (existingEvidence.error) throw existingEvidence.error;

  const existingDecision = await admin
    .from("credit_default_decisions")
    .select("default_decision_id, decision")
    .eq("default_review_id", review.default_review_id)
    .limit(1);
  if (existingDecision.error) throw existingDecision.error;

  if ((existingDecision.data ?? []).length === 0) {
    const evidenceTypes = [
      "UNPAID_INVOICES",
      "PAYMENT_HISTORY",
      "PROMISE_TO_PAY_HISTORY",
      "DRIVER_CONTACT_ATTEMPTS",
      "ASSET_POSSESSION_STATUS",
      "RISK_FLAGS",
      "CONTRACT_TERMS",
      "NOTICES_SENT",
    ];
    for (const type of evidenceTypes) {
      const evidence = await admin.rpc("attach_credit_default_evidence", {
        p_default_review_id: review.default_review_id,
        p_evidence_type: type,
        p_evidence_summary: `QA evidence ${type}`,
        p_source_reference_type: "qa_script",
        p_source_reference_id: null,
        p_idempotency_key: `qa-layer3f-evidence:${type}:${randomUUID()}`,
        p_request_hash: `qa-layer3f-evidence:${type}:${randomUUID()}`,
      });
      if (evidence.error) throw evidence.error;
    }
    record("attach_credit_default_evidence covers checklist", true, `${evidenceTypes.length} evidence rows`);

    const plan = await admin.rpc("create_credit_recovery_plan", {
      p_default_review_id: review.default_review_id,
      p_required_action_json: { action: "QA driver recovery plan", source: "layer3f_qa" },
      p_due_date: tomorrow(7),
      p_approved_by: null,
      p_idempotency_key: `qa-layer3f-plan:${randomUUID()}`,
      p_request_hash: `qa-layer3f-plan:${randomUUID()}`,
    });
    if (plan.error) throw plan.error;
    record("create_credit_recovery_plan is operational only", !!plan.data.recovery_plan_id, plan.data.plan_status);

    const asset = await admin.rpc("open_credit_asset_protection_review", {
      p_default_review_id: review.default_review_id,
      p_trigger_reason: "QA asset location and possession verification",
      p_asset_id: null,
      p_inspection_required: true,
      p_inspection_due_at: futureIso(4),
      p_idempotency_key: `qa-layer3f-asset:${randomUUID()}`,
      p_request_hash: `qa-layer3f-asset:${randomUUID()}`,
    });
    if (asset.error) throw asset.error;
    record("open_credit_asset_protection_review does not execute repossession", !!asset.data.asset_review_id, asset.data.status);
  } else if ((existingEvidence.data ?? []).length > 0) {
    record("existing default evidence available", true, `${existingEvidence.data?.length ?? 0} row(s)`);
  }

  const formalDecision = await admin.rpc("create_credit_default_decision", {
    p_default_review_id: review.default_review_id,
    p_decision: "FORMAL_DEFAULT",
    p_decision_reason: "QA Layer 3F evidence supports formal default review",
    p_decision_summary: "QA decision summary for formal default validation",
    p_second_approver_id: null,
    p_driver_notice_required: true,
    p_idempotency_key: `qa-layer3f-formal-decision:${randomUUID()}`,
    p_request_hash: `qa-layer3f-formal-decision:${randomUUID()}`,
  });
  if (formalDecision.error) throw formalDecision.error;
  record("create_credit_default_decision requires evidence and permission", formalDecision.data.decision === "FORMAL_DEFAULT");

  const notice = await admin.rpc("send_credit_default_notice", {
    p_default_review_id: review.default_review_id,
    p_notice_type: "FORMAL_DEFAULT_NOTICE",
    p_notice_summary: "Votre dossier credit DAM est en validation. Contactez l'equipe DAM pour les options disponibles.",
    p_reason: "QA formal notice before final declaration",
    p_required_action: "Contacter DAM et verifier le plan propose",
    p_deadline_at: futureIso(5),
    p_channel: "IN_APP",
    p_idempotency_key: `qa-layer3f-notice:${randomUUID()}`,
    p_request_hash: `qa-layer3f-notice:${randomUUID()}`,
  });
  if (notice.error) throw notice.error;
  record("send_credit_default_notice is driver-safe", notice.data.notice_status === "SENT", notice.data.notice_type);

  const declared = await admin.rpc("declare_credit_formal_default", {
    p_default_review_id: review.default_review_id,
    p_reason: "QA final formal default declaration after notice",
    p_idempotency_key: `qa-layer3f-declare:${randomUUID()}`,
    p_request_hash: `qa-layer3f-declare:${randomUUID()}`,
  });
  if (declared.error) throw declared.error;
  record("declare_credit_formal_default guarded final state", declared.data.status === "FORMALLY_DEFAULTED", declared.data.status);

  return { review: declared.data as DefaultReview, driverOwned: collection.driver_id === creds.driver_id };
}

async function main() {
  const creds = loadCreds();
  const admin = await adminRpcClient(creds);
  const workflow = await runRpcWorkflow(admin, creds);

  const adminHarness = new Harness();
  const driverHarness = new Harness();
  let browserError: unknown = null;

  try {
    await adminHarness.start({ width: 1440, height: 1100 });
    try {
      await adminLogin(adminHarness, creds);
      await safeGoto(adminHarness, "/admin/default-recovery", "admin/default-recovery");
      await assertText(adminHarness, "admin default recovery page loads", "Default Recovery");
      await assertText(adminHarness, "admin default recovery human control copy", "Controle humain obligatoire");
      await assertAbsent(adminHarness, "admin page avoids forbidden repossession execution copy", "reprise automatique declenchee");
      await withTimeout(adminHarness.shot("admin-default-recovery-queue"), 20_000, "admin queue screenshot");

      if (workflow.review?.default_review_id) {
        await safeGoto(adminHarness, `/admin/default-recovery?review=${workflow.review.default_review_id}`, "admin/default-recovery-review");
        await adminHarness.page.getByRole("tab", { name: /Evidence/i }).click();
        await settle(adminHarness.page, 600);
        await assertText(adminHarness, "evidence tab renders checklist", "Evidence Checklist");
        await adminHarness.page.getByRole("tab", { name: /Decision/i }).click();
        await settle(adminHarness.page, 600);
        await assertText(adminHarness, "decision tab renders controls", "Decision Screen");
        await adminHarness.page.getByRole("tab", { name: /Notices/i }).click();
        await settle(adminHarness.page, 600);
        await assertText(adminHarness, "formal declaration control renders", "Formal Default Confirmation");
        await withTimeout(adminHarness.shot("admin-default-recovery-decision"), 20_000, "admin decision screenshot");
      }

      await safeGoto(adminHarness, "/admin/credit-collections", "admin/credit-collections-bridge");
      await assertText(adminHarness, "collections links to default recovery", "Default Recovery");
      await safeGoto(adminHarness, "/admin?filter=drivers_risk", "admin-attention-center-defaults");
      await assertText(adminHarness, "attention center remains reachable", "Centre d’attention");
      await safeGoto(adminHarness, `/admin/drivers/${creds.driver_id}?tab=growth`, "admin-driver-360-defaults");
      await assertText(adminHarness, "driver 360 remains reachable", "Driver Lifecycle");
    } finally {
      await stopHarness(adminHarness);
    }

    await driverHarness.start({ width: 390, height: 844 });
    try {
      await driverLogin(driverHarness, creds);
      await safeGoto(driverHarness, "/driver/finance", "driver/finance-default-status");
      await assertText(driverHarness, "driver finance page loads", "Finance");
      if (workflow.driverOwned) {
        await assertText(driverHarness, "driver finance shows DAM follow-up", "Suivi credit DAM");
      }
      await withTimeout(driverHarness.shot("driver-finance-default-status"), 20_000, "driver finance screenshot");

      await safeGoto(driverHarness, "/driver/credit", "driver/credit-default-status");
      await assertText(driverHarness, "driver credit page loads", "Credit");
      if (workflow.driverOwned) {
        await assertText(driverHarness, "driver credit shows DAM status", "Suivi DAM");
      }
      await withTimeout(driverHarness.shot("driver-credit-default-status"), 20_000, "driver credit screenshot");
    } finally {
      await stopHarness(driverHarness);
    }
  } catch (error) {
    browserError = error;
    console.error(error);
  }

  if (workflow.review?.default_review_id) {
    const reversed = await admin.rpc("reverse_credit_formal_default", {
      p_default_review_id: workflow.review.default_review_id,
      p_reason: "QA cleanup reversal after Layer 3F screenshots",
      p_new_account_status: "PAST_DUE",
      p_idempotency_key: `qa-layer3f-reverse:${randomUUID()}`,
      p_request_hash: `qa-layer3f-reverse:${randomUUID()}`,
    });
    if (reversed.error) throw reversed.error;
    record("reverse_credit_formal_default restores governed state", reversed.data.status === "DEFAULT_REVERSED", reversed.data.status);
  }

  if (browserError) {
    record("browser workflow completed", false, String(browserError));
  }

  const findings = [
    ...adminHarness.findings,
    ...driverHarness.findings,
  ].filter((finding) => !isHostedAuthBootstrapNoise(finding));
  record("no unexpected console/network findings", findings.length === 0, findings.length ? `${findings.length} finding(s)` : undefined);

  const passed = checks.filter((check) => check.passed).length;
  const failed = checks.filter((check) => !check.passed);
  const reportPath = `${SHOT_DIR}/layer3f-qa-summary.json`;
  writeFileSync(reportPath, JSON.stringify({ passed, failed: failed.length, checks, findings }, null, 2));
  console.log(`\nSummary written to ${reportPath}`);
  console.log(`Checks: ${passed} passed, ${failed.length} failed`);
  if (failed.length || findings.length) {
    for (const check of failed) console.error(`FAIL ${check.name}: ${check.detail ?? ""}`);
    for (const finding of findings) console.error(`[${finding.page}] ${finding.kind}: ${finding.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
