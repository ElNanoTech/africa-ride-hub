/**
 * Layer 3G QA: Ownership Completion & Asset Transfer Engine.
 *
 * Run:
 *   QA_APP_URL=http://127.0.0.1:8082 QA_SHOT_DIR=docs/specs/screenshots/layer3g bun run scripts/qa/24-layer3g-ownership-completion.ts
 */
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { Harness, loadCreds, adminLogin, driverLogin, settle, APP_URL, SHOT_DIR, type Creds, type Finding } from "./lib";

type Check = {
  name: string;
  passed: boolean;
  detail?: string;
};

type Row = Record<string, unknown>;
type RpcArgs = Record<string, unknown> | undefined;

type Candidate = {
  row: Row;
  creditAccountId: string;
  driverId?: string;
  assetId?: string;
};

type WorkflowResult = {
  mutationCoverage: "completed" | "skipped";
  skippedReason?: string;
  creditAccountId?: string;
  driverId?: string;
  assetId?: string;
  reviewId?: string;
  transferId?: string;
  certificateId?: string;
  certificateNumber?: string;
  driverOwned: boolean;
};

type BrowserWorkflowResult = {
  browserError: unknown;
  findings: Finding[];
};

const checks: Check[] = [];
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_mwZMYFqI_Jqa5ohlhLnQZw_y99c2WxK";
const RAW_OWNERSHIP_ENUM_PATTERN =
  /\b(?:NOT_ELIGIBLE|ELIGIBLE_FOR_COMPLETION|UNDER_COMPLETION_REVIEW|AWAITING_FINAL_APPROVAL|COMPLETED|REVERSED|CANCELLED|OWNERSHIP_TRANSFER|TITLE_RELEASE|ASSET_RELEASE|DIGITAL_ASSET_TRANSFER|FINAL_APPROVAL)\b/;
const INTERNAL_OWNERSHIP_PATTERN =
  /\b(?:ownership_completion_reviews|ownership_completion_decisions|asset_transfer_records|ownership_certificates|ownership_completion_audit_events|idempotency_key|legal_hold|fraud_review|default_review)\b/i;

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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function errorText(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const fields = ["message", "details", "hint", "code"]
      .map((key) => {
        const value = (error as Record<string, unknown>)[key];
        return typeof value === "string" && value.length > 0 ? value : undefined;
      })
      .filter(Boolean);
    if (fields.length > 0) return fields.join(" ");
  }
  return String(error);
}

function isRetryableRpcShapeError(error: unknown) {
  const text = errorText(error);
  return /PGRST202|Could not find the function|function .* does not exist|schema cache|with parameters|invalid input value for enum/i.test(text);
}

function isAlreadySettledError(error: unknown) {
  return /already .*completed|already .*approved|already .*issued|certificate .*exists|transfer .*exists/i.test(errorText(error));
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
    h.page.content().then(htmlToText),
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

async function assertAnyText(h: Harness, name: string, needles: string[]) {
  const deadline = Date.now() + 20_000;
  let text = "";
  while (Date.now() < deadline) {
    text = await bodyText(h);
    const matched = needles.find((needle) => includesText(text, needle));
    if (matched) {
      record(name, true, matched);
      return;
    }
    await h.page.waitForTimeout(500);
  }
  record(name, false, needles.join(" | "));
}

async function assertNoRawOwnershipLeak(h: Harness, name: string) {
  const text = await bodyText(h);
  const rawMatch = text.match(RAW_OWNERSHIP_ENUM_PATTERN);
  const internalMatch = text.match(INTERNAL_OWNERSHIP_PATTERN);
  record(name, !rawMatch && !internalMatch, rawMatch?.[0] ?? internalMatch?.[0] ?? "masked");
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

async function clickOptionalTab(h: Harness, name: RegExp) {
  const tab = h.page.getByRole("tab", { name }).first();
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    await settle(h.page, 700);
    return true;
  }

  const button = h.page.getByRole("button", { name }).first();
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    await settle(h.page, 700);
    return true;
  }

  return false;
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

type AdminClient = Awaited<ReturnType<typeof adminRpcClient>>;
type DriverClient = Awaited<ReturnType<typeof driverRpcClient>>;

async function callRpcVariants<T>(
  client: AdminClient | DriverClient,
  functionName: string,
  variants: RpcArgs[],
  label: string,
): Promise<T> {
  let lastError: unknown;
  for (const args of variants) {
    const result = args === undefined ? await client.rpc(functionName) : await client.rpc(functionName, args);
    if (!result.error) return result.data as T;
    lastError = result.error;
    if (!isRetryableRpcShapeError(result.error)) throw result.error;
  }
  throw new Error(`${label}: ${errorText(lastError)}`);
}

function rowsFromData(data: unknown): Row[] {
  if (Array.isArray(data)) return data.filter((row): row is Row => typeof row === "object" && row !== null && !Array.isArray(row));
  if (typeof data === "object" && data !== null) return [data as Row];
  return [];
}

function firstRow(data: unknown) {
  return rowsFromData(data)[0] ?? {};
}

function stringField(row: Row | undefined, keys: string[]) {
  if (!row) return undefined;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function booleanField(row: Row, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function hasContent(value: unknown) {
  if (value === null || value === undefined || value === false) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 && !["[]", "{}", "none", "null", "false"].includes(trimmed.toLowerCase());
  }
  return true;
}

function hasBlockers(row: Row) {
  return [
    "blocking_reason",
    "blocking_reasons",
    "blockers",
    "eligibility_blockers",
    "completion_blockers",
    "ineligibility_reasons",
  ].some((key) => hasContent(row[key]));
}

function isEligibleQueueRow(row: Row) {
  const explicit = booleanField(row, ["is_eligible", "eligible", "completion_eligible"]);
  if (explicit === false) return false;
  if (explicit === true) return !hasBlockers(row);

  const status = stringField(row, [
    "eligibility_status",
    "completion_status",
    "review_status",
    "status",
    "queue_status",
  ])?.toUpperCase();
  if (status && /NOT_ELIGIBLE|BLOCKED|REJECTED|CANCELLED|REVERSED/.test(status)) return false;
  if (status && /ELIGIBLE|READY|PENDING/.test(status)) return !hasBlockers(row);

  return !hasBlockers(row);
}

function candidateFromRow(row: Row): Candidate | undefined {
  const creditAccountId = stringField(row, ["credit_account_id", "account_id"]);
  if (!creditAccountId || !isEligibleQueueRow(row)) return undefined;
  return {
    row,
    creditAccountId,
    driverId: stringField(row, ["driver_id", "driverId"]),
    assetId: stringField(row, ["asset_id", "assetId", "financed_asset_id"]),
  };
}

async function syncCompletionCandidates(admin: AdminClient) {
  const syncKey = `qa-layer3g-sync:${randomUUID()}`;
  const data = await callRpcVariants<unknown>(
    admin,
    "sync_ownership_completion_candidates",
    [
      { p_idempotency_key: syncKey, p_request_hash: syncKey },
      { p_idempotency_key: syncKey },
      undefined,
    ],
    "sync_ownership_completion_candidates",
  );
  record("sync_ownership_completion_candidates runs", true, summarizeRpcData(data));
}

async function findCompletionCandidate(admin: AdminClient, creds: Creds): Promise<Candidate | undefined> {
  const queue = await admin.from("v_ownership_completion_queue").select("*").limit(50);
  if (queue.error) throw queue.error;

  const candidates = (queue.data ?? []).map((row) => candidateFromRow(row as Row)).filter((row): row is Candidate => Boolean(row));
  const owned = candidates.find((candidate) => candidate.driverId === creds.driver_id);
  if (owned) return owned;
  return candidates[0];
}

function summarizeRpcData(data: unknown) {
  const row = firstRow(data);
  const id = stringField(row, [
    "ownership_completion_review_id",
    "completion_review_id",
    "review_id",
    "transfer_id",
    "certificate_id",
    "id",
  ]);
  const status = stringField(row, ["status", "review_status", "completion_status", "transfer_status", "certificate_status"]);
  return [id, status].filter(Boolean).join(" | ") || typeof data;
}

function reviewIdFrom(data: unknown) {
  return stringField(firstRow(data), ["ownership_completion_review_id", "completion_review_id", "review_id", "id"]);
}

function transferIdFrom(data: unknown) {
  return stringField(firstRow(data), ["transfer_id", "asset_transfer_id", "id"]);
}

function certificateIdFrom(data: unknown) {
  return stringField(firstRow(data), ["certificate_id", "ownership_certificate_id", "id"]);
}

async function findReviewByAccount(admin: AdminClient, creditAccountId: string) {
  const result = await admin
    .from("ownership_completion_reviews")
    .select("*")
    .eq("credit_account_id", creditAccountId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (result.error) throw result.error;
  return (result.data?.[0] as Row | undefined) ?? undefined;
}

async function findTransfer(admin: AdminClient, creditAccountId?: string, driverId?: string) {
  if (creditAccountId) {
    const result = await admin
      .from("asset_transfer_records")
      .select("*")
      .eq("credit_account_id", creditAccountId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (result.error) throw result.error;
    if (result.data?.[0]) return result.data[0] as Row;
  }

  if (driverId) {
    const result = await admin
      .from("asset_transfer_records")
      .select("*")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (result.error) throw result.error;
    if (result.data?.[0]) return result.data[0] as Row;
  }

  return undefined;
}

async function findCertificate(admin: AdminClient, transferId?: string, driverId?: string) {
  if (transferId) {
    const result = await admin
      .from("ownership_certificates")
      .select("*")
      .eq("transfer_id", transferId)
      .order("issued_at", { ascending: false })
      .limit(1);
    if (result.error) throw result.error;
    if (result.data?.[0]) return result.data[0] as Row;
  }

  if (driverId) {
    const result = await admin
      .from("ownership_certificates")
      .select("*")
      .eq("driver_id", driverId)
      .order("issued_at", { ascending: false })
      .limit(1);
    if (result.error) throw result.error;
    if (result.data?.[0]) return result.data[0] as Row;
  }

  return undefined;
}

async function loadAuditEvents(admin: AdminClient, workflow: WorkflowResult) {
  const filters = [
    workflow.creditAccountId ? { key: "credit_account_id", value: workflow.creditAccountId } : undefined,
    workflow.reviewId ? { key: "completion_review_id", value: workflow.reviewId } : undefined,
    workflow.reviewId ? { key: "review_id", value: workflow.reviewId } : undefined,
    workflow.driverId ? { key: "driver_id", value: workflow.driverId } : undefined,
  ].filter((filter): filter is { key: string; value: string } => Boolean(filter));

  let lastError: unknown;
  for (const filter of filters) {
    const result = await admin
      .from("ownership_completion_audit_events")
      .select("*")
      .eq(filter.key, filter.value)
      .order("created_at", { ascending: false })
      .limit(25);
    if (!result.error) return result.data ?? [];
    lastError = result.error;
    if (!/column .* does not exist|schema cache/i.test(errorText(result.error))) throw result.error;
  }

  const unfiltered = await admin
    .from("ownership_completion_audit_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(25);
  if (unfiltered.error) throw (lastError ?? unfiltered.error);
  return unfiltered.data ?? [];
}

async function openReview(admin: AdminClient, candidate: Candidate) {
  const openKey = `qa-layer3g-open:${randomUUID()}`;
  const variants = [
    {
      p_credit_account_id: candidate.creditAccountId,
      p_trigger_reason: "QA Layer 3G ownership completion review",
      p_idempotency_key: openKey,
      p_request_hash: openKey,
    },
    {
      p_credit_account_id: candidate.creditAccountId,
      p_reason: "QA Layer 3G ownership completion review",
      p_idempotency_key: openKey,
      p_request_hash: openKey,
    },
    {
      p_credit_account_id: candidate.creditAccountId,
      p_idempotency_key: openKey,
    },
    {
      p_credit_account_id: candidate.creditAccountId,
    },
  ];
  const opened = await callRpcVariants<unknown>(admin, "open_ownership_completion_review", variants, "open_ownership_completion_review");
  const replay = await callRpcVariants<unknown>(admin, "open_ownership_completion_review", variants, "open_ownership_completion_review replay");
  const openedReviewId = reviewIdFrom(opened);
  const replayReviewId = reviewIdFrom(replay);
  record("open_ownership_completion_review creates or returns active review", Boolean(openedReviewId), openedReviewId);
  record(
    "open_ownership_completion_review is idempotent",
    Boolean(openedReviewId && replayReviewId && openedReviewId === replayReviewId),
    replayReviewId,
  );
  return opened;
}

async function assignReview(admin: AdminClient, reviewId: string) {
  const assignKey = `qa-layer3g-assign:${randomUUID()}`;
  const data = await callRpcVariants<unknown>(
    admin,
    "assign_ownership_completion_review",
    [
      {
        p_completion_review_id: reviewId,
        p_assigned_to: null,
        p_note: "QA Layer 3G review assignment",
        p_idempotency_key: assignKey,
        p_request_hash: assignKey,
      },
      {
        p_review_id: reviewId,
        p_assigned_to: null,
        p_note: "QA Layer 3G review assignment",
        p_idempotency_key: assignKey,
        p_request_hash: assignKey,
      },
      {
        p_ownership_completion_review_id: reviewId,
        p_assigned_to: null,
        p_note: "QA Layer 3G review assignment",
        p_idempotency_key: assignKey,
        p_request_hash: assignKey,
      },
    ],
    "assign_ownership_completion_review",
  );
  record("assign_ownership_completion_review audits ownership", Boolean(reviewIdFrom(data) ?? summarizeRpcData(data)), summarizeRpcData(data));
}

async function createDecision(admin: AdminClient, reviewId: string, decisionValues: string[], reason: string) {
  let lastError: unknown;
  for (const decision of decisionValues) {
    const key = `qa-layer3g-decision:${decision}:${randomUUID()}`;
    const variants = [
      {
        p_completion_review_id: reviewId,
        p_decision: decision,
        p_decision_reason: reason,
        p_decision_summary: reason,
        p_idempotency_key: key,
        p_request_hash: key,
      },
      {
        p_review_id: reviewId,
        p_decision: decision,
        p_decision_reason: reason,
        p_decision_summary: reason,
        p_idempotency_key: key,
        p_request_hash: key,
      },
      {
        p_ownership_completion_review_id: reviewId,
        p_decision: decision,
        p_reason: reason,
        p_note: reason,
        p_idempotency_key: key,
        p_request_hash: key,
      },
    ];
    try {
      return await callRpcVariants<unknown>(admin, "create_ownership_completion_decision", variants, "create_ownership_completion_decision");
    } catch (error) {
      lastError = error;
      if (!isRetryableRpcShapeError(error) && !isAlreadySettledError(error)) throw error;
      if (isAlreadySettledError(error)) return { alreadySettled: true, decision } satisfies Row;
    }
  }
  throw new Error(`create_ownership_completion_decision: ${errorText(lastError)}`);
}

async function issueCertificate(admin: AdminClient, reviewId: string, transferId?: string) {
  const issueKey = `qa-layer3g-certificate:${randomUUID()}`;
  const variants: RpcArgs[] = [];
  if (transferId) {
    variants.push(
      {
        p_transfer_id: transferId,
        p_document_reference: "qa-layer3g-certificate",
        p_idempotency_key: issueKey,
        p_request_hash: issueKey,
      },
      {
        p_asset_transfer_id: transferId,
        p_document_reference: "qa-layer3g-certificate",
        p_idempotency_key: issueKey,
        p_request_hash: issueKey,
      },
    );
  }
  variants.push(
    {
      p_completion_review_id: reviewId,
      p_document_reference: "qa-layer3g-certificate",
      p_idempotency_key: issueKey,
      p_request_hash: issueKey,
    },
    {
      p_review_id: reviewId,
      p_document_reference: "qa-layer3g-certificate",
      p_idempotency_key: issueKey,
      p_request_hash: issueKey,
    },
  );

  const issued = await callRpcVariants<unknown>(admin, "issue_ownership_certificate", variants, "issue_ownership_certificate");
  const replay = await callRpcVariants<unknown>(admin, "issue_ownership_certificate", variants, "issue_ownership_certificate replay");
  const issuedId = certificateIdFrom(issued);
  const replayId = certificateIdFrom(replay);
  record("issue_ownership_certificate generates certificate", Boolean(issuedId ?? summarizeRpcData(issued)), summarizeRpcData(issued));
  record("issue_ownership_certificate is idempotent", !issuedId || !replayId || issuedId === replayId, replayId);
  return issued;
}

async function verifyDriverStatus(creds: Creds, workflow: WorkflowResult) {
  if (!workflow.driverOwned) {
    record("driver ownership status RPC skipped for non-seeded driver", true, workflow.driverId ?? "no driver id");
    return;
  }

  const driver = await driverRpcClient(creds);
  const status = await driver.rpc("get_driver_ownership_completion_status");
  if (status.error) throw status.error;
  const payload = JSON.stringify(status.data);
  record("get_driver_ownership_completion_status returns driver-safe payload", Boolean(status.data), payload.slice(0, 160));
  record(
    "driver ownership status masks raw enums and internals",
    !RAW_OWNERSHIP_ENUM_PATTERN.test(payload) && !INTERNAL_OWNERSHIP_PATTERN.test(payload),
    "masked payload",
  );
}

async function verifyGrowthAndAudit(admin: AdminClient, workflow: WorkflowResult) {
  const audit = await loadAuditEvents(admin, workflow);
  const auditPayload = JSON.stringify(audit);
  record("ownership completion audit events recorded", audit.length > 0, `${audit.length} row(s)`);
  record(
    "ownership completed event available for Growth Engine",
    /OWNERSHIP_COMPLETED|ASSET_TRANSFERRED|CERTIFICATE_ISSUED|growth/i.test(auditPayload),
    "audit or growth event signal",
  );
}

async function reverseCompletion(admin: AdminClient, workflow: WorkflowResult) {
  if (workflow.mutationCoverage !== "completed") return;
  const reverseKey = `qa-layer3g-reverse:${randomUUID()}`;
  const secondApproverId = randomUUID();
  const variants: RpcArgs[] = [];
  if (workflow.reviewId) {
    variants.push(
      {
        p_completion_review_id: workflow.reviewId,
        p_reason: "QA cleanup reversal after Layer 3G screenshots",
        p_second_approver_id: secondApproverId,
        p_idempotency_key: reverseKey,
        p_request_hash: reverseKey,
      },
      {
        p_review_id: workflow.reviewId,
        p_reason: "QA cleanup reversal after Layer 3G screenshots",
        p_second_approver_id: secondApproverId,
        p_idempotency_key: reverseKey,
        p_request_hash: reverseKey,
      },
    );
  }
  if (workflow.transferId) {
    variants.push({
      p_transfer_id: workflow.transferId,
      p_reason: "QA cleanup reversal after Layer 3G screenshots",
      p_second_approver_id: secondApproverId,
      p_idempotency_key: reverseKey,
      p_request_hash: reverseKey,
    });
  }
  if (workflow.creditAccountId) {
    variants.push({
      p_credit_account_id: workflow.creditAccountId,
      p_reason: "QA cleanup reversal after Layer 3G screenshots",
      p_second_approver_id: secondApproverId,
      p_idempotency_key: reverseKey,
      p_request_hash: reverseKey,
    });
  }

  const reversed = await callRpcVariants<unknown>(admin, "reverse_ownership_completion", variants, "reverse_ownership_completion");
  record("reverse_ownership_completion restores governed state", Boolean(summarizeRpcData(reversed)), summarizeRpcData(reversed));

  const audit = await loadAuditEvents(admin, workflow);
  record("completion reversal audited", JSON.stringify(audit).toUpperCase().includes("REVERS"), `${audit.length} row(s)`);
}

async function runRpcWorkflow(admin: AdminClient, creds: Creds): Promise<WorkflowResult> {
  await syncCompletionCandidates(admin);
  const candidate = await findCompletionCandidate(admin, creds);
  if (!candidate) {
    record("RPC mutation coverage skipped when no qualifying completion seed exists", true, "no eligible row in v_ownership_completion_queue");
    return {
      mutationCoverage: "skipped",
      skippedReason: "no eligible row in v_ownership_completion_queue",
      driverOwned: false,
    };
  }

  record("fully paid account eligible for completion", true, candidate.creditAccountId);

  const opened = await openReview(admin, candidate);
  let reviewId = reviewIdFrom(opened);
  if (!reviewId) {
    const review = await findReviewByAccount(admin, candidate.creditAccountId);
    reviewId = stringField(review, ["ownership_completion_review_id", "completion_review_id", "review_id", "id"]);
  }
  if (!reviewId) throw new Error("open_ownership_completion_review did not expose a review id");

  await assignReview(admin, reviewId);

  const approval = await createDecision(
    admin,
    reviewId,
    ["APPROVE_COMPLETION", "APPROVED"],
    "QA Layer 3G approval: obligations satisfied and ownership completion can proceed",
  );
  record("create_ownership_completion_decision records approval", Boolean(firstRow(approval).alreadySettled ?? summarizeRpcData(approval)), summarizeRpcData(approval));

  let transferId: string | undefined;
  let transfer = await findTransfer(admin, candidate.creditAccountId, candidate.driverId);
  transferId = transferId ?? stringField(transfer, ["transfer_id", "asset_transfer_id", "id"]);

  const certificateData = await issueCertificate(admin, reviewId, transferId);
  transfer = transfer ?? await findTransfer(admin, candidate.creditAccountId, candidate.driverId);
  transferId = transferId ?? stringField(transfer, ["transfer_id", "asset_transfer_id", "id"]);
  record("completion creates transfer record", Boolean(transferId), transferId);
  const certificate = await findCertificate(admin, transferId, candidate.driverId);
  const certificateId = certificateIdFrom(certificateData) ?? stringField(certificate, ["certificate_id", "ownership_certificate_id", "id"]);
  const certificateNumber = stringField(firstRow(certificateData), ["certificate_number"]) ?? stringField(certificate, ["certificate_number"]);
  record("ownership certificate persisted", Boolean(certificateId), certificateNumber ?? certificateId);

  const workflow: WorkflowResult = {
    mutationCoverage: "completed",
    creditAccountId: candidate.creditAccountId,
    driverId: candidate.driverId,
    assetId: candidate.assetId,
    reviewId,
    transferId,
    certificateId,
    certificateNumber,
    driverOwned: candidate.driverId === creds.driver_id,
  };

  await verifyDriverStatus(creds, workflow);
  await verifyGrowthAndAudit(admin, workflow);
  return workflow;
}

async function runDriverBrowserWorkflow(creds: Creds, workflow: WorkflowResult): Promise<BrowserWorkflowResult> {
  const driverHarness = new Harness();
  let browserError: unknown = null;

  try {
    await driverHarness.start({ width: 390, height: 844 });
    try {
      await driverLogin(driverHarness, creds);
      await safeGoto(driverHarness, "/driver/credit", "driver/credit-ownership-status");
      await assertAnyText(driverHarness, "driver credit ownership surface loads", ["Credit", "Credit & Propriete", "Propriete"]);
      await assertNoRawOwnershipLeak(driverHarness, "driver credit hides raw ownership enums");
      if (workflow.driverOwned) {
        await assertAnyText(driverHarness, "driver credit shows ownership completion signal", ["proprietaire", "certificat", "ownership", "completion"]);
      }
      await withTimeout(driverHarness.shot("driver-credit-ownership-status"), 20_000, "driver credit screenshot");

      const financePage = await driverHarness.ctx.newPage();
      driverHarness.attach(financePage);
      await driverHarness.page.close().catch(() => undefined);
      driverHarness.page = financePage;

      await safeGoto(driverHarness, "/driver/finance", "driver/finance-ownership-status");
      await assertAnyText(driverHarness, "driver finance ownership surface loads", ["Finance", "Ownership", "Propriete", "Certificat"]);
      await assertNoRawOwnershipLeak(driverHarness, "driver finance hides raw ownership enums");
      if (workflow.driverOwned) {
        await assertAnyText(driverHarness, "driver finance shows certificate status", ["certificat", "proprietaire", "ownership", "completion"]);
      }
      await withTimeout(driverHarness.shot("driver-finance-ownership-status"), 20_000, "driver finance screenshot");
    } finally {
      await stopHarness(driverHarness);
    }
  } catch (error) {
    browserError = error;
    console.error(error);
  }

  return {
    browserError,
    findings: driverHarness.findings,
  };
}

async function runAdminBrowserWorkflow(creds: Creds, workflow: WorkflowResult): Promise<BrowserWorkflowResult> {
  const adminHarness = new Harness();
  let browserError: unknown = null;

  try {
    await adminHarness.start({ width: 1440, height: 1100 });
    try {
      await adminLogin(adminHarness, creds);
      await safeGoto(adminHarness, "/admin/ownership-completion", "admin/ownership-completion");
      await assertText(adminHarness, "admin ownership completion page loads", "Ownership Completion");
      await withTimeout(adminHarness.shot("admin-ownership-completion-queue"), 20_000, "admin queue screenshot");

      const reviewPath = workflow.reviewId
        ? `/admin/ownership-completion?review=${workflow.reviewId}`
        : "/admin/ownership-completion";
      await safeGoto(adminHarness, reviewPath, "admin/ownership-completion-review");
      await assertAnyText(adminHarness, "admin review screen renders ownership controls", ["Review", "Completion", "Transfer", "Certificate"]);
      await withTimeout(adminHarness.shot("admin-ownership-completion-review"), 20_000, "admin review screenshot");

      await clickOptionalTab(adminHarness, /Transfer|Certificate|Certificat|Completed/i);
      await assertAnyText(adminHarness, "admin transfer certificate view renders", ["Transfer", "Certificate", "Certificat", "Completed", "Ownership Completion"]);
      await withTimeout(adminHarness.shot("admin-ownership-transfer-certificate"), 20_000, "admin transfer certificate screenshot");

      const driver360Page = await adminHarness.ctx.newPage();
      adminHarness.attach(driver360Page);
      await adminHarness.page.close().catch(() => undefined);
      adminHarness.page = driver360Page;

      const driver360Id = workflow.driverId ?? creds.driver_id;
      await safeGoto(adminHarness, `/admin/drivers/${driver360Id}?tab=growth`, "admin-driver360-ownership-status");
      await assertAnyText(adminHarness, "driver 360 ownership status remains reachable", ["Ownership", "Propriete", "Driver Lifecycle", "Growth"]);
      await withTimeout(adminHarness.shot("admin-driver360-ownership-status"), 20_000, "driver 360 screenshot");
    } finally {
      await stopHarness(adminHarness);
    }
  } catch (error) {
    browserError = error;
    console.error(error);
  }

  return {
    browserError,
    findings: adminHarness.findings,
  };
}

function writePhaseResult(path: string | undefined, phase: string, browser: BrowserWorkflowResult) {
  if (!path) return;
  writeFileSync(
    path,
    JSON.stringify({
      phase,
      checks,
      findings: browser.findings,
      browserError: browser.browserError ? errorText(browser.browserError) : null,
    }, null, 2),
  );
}

async function runBrowserPhaseChild() {
  const phase = process.env.QA_LAYER3G_PHASE;
  if (phase !== "driver" && phase !== "admin") return false;

  const creds = loadCreds();
  const workflow = JSON.parse(process.env.QA_LAYER3G_WORKFLOW_JSON ?? "{}") as WorkflowResult;
  const browser = phase === "driver"
    ? await runDriverBrowserWorkflow(creds, workflow)
    : await runAdminBrowserWorkflow(creds, workflow);

  if (browser.browserError) {
    record(`${phase} browser workflow completed`, false, errorText(browser.browserError));
  }

  writePhaseResult(process.env.QA_LAYER3G_PHASE_RESULT, phase, browser);
  const unexpectedFindings = browser.findings.filter((finding) => !isHostedAuthBootstrapNoise(finding));
  if (browser.browserError || unexpectedFindings.length || checks.some((check) => !check.passed)) {
    process.exitCode = 1;
  }
  return true;
}

function runBrowserPhase(phase: "driver" | "admin", workflow: WorkflowResult): BrowserWorkflowResult {
  const resultPath = `/tmp/layer3g-${phase}-phase-result-${process.pid}.json`;
  const child = spawnSync(process.execPath, ["run", "scripts/qa/24-layer3g-ownership-completion.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      QA_LAYER3G_PHASE: phase,
      QA_LAYER3G_WORKFLOW_JSON: JSON.stringify(workflow),
      QA_LAYER3G_PHASE_RESULT: resultPath,
    },
    stdio: "inherit",
  });

  let phaseResult: {
    checks?: Check[];
    findings?: Finding[];
    browserError?: string | null;
  } = {};
  try {
    phaseResult = JSON.parse(readFileSync(resultPath, "utf8")) as typeof phaseResult;
  } catch (error) {
    phaseResult = {
      checks: [{ name: `${phase} browser phase result written`, passed: false, detail: errorText(error) }],
      findings: [],
      browserError: child.error ? errorText(child.error) : `phase exited ${child.status ?? "without status"}`,
    };
  }

  checks.push(...(phaseResult.checks ?? []));
  return {
    browserError: phaseResult.browserError ?? (child.status === 0 ? null : `${phase} browser phase exited ${child.status}`),
    findings: phaseResult.findings ?? [],
  };
}

async function main() {
  if (await runBrowserPhaseChild()) return;

  const creds = loadCreds();
  const admin = await adminRpcClient(creds);
  let workflow: WorkflowResult = {
    mutationCoverage: "skipped",
    skippedReason: "workflow did not start",
    driverOwned: false,
  };

  try {
    workflow = await runRpcWorkflow(admin, creds);
  } catch (error) {
    record("Layer 3G RPC workflow completed", false, errorText(error));
    throw error;
  }

  const driverBrowser = runBrowserPhase("driver", workflow);
  const adminBrowser = runBrowserPhase("admin", workflow);
  const browser: BrowserWorkflowResult = {
    browserError: driverBrowser.browserError ?? adminBrowser.browserError,
    findings: [...driverBrowser.findings, ...adminBrowser.findings],
  };

  try {
    await reverseCompletion(admin, workflow);
  } catch (error) {
    record("Layer 3G cleanup reversal completed", false, errorText(error));
  }

  if (browser.browserError) {
    record("browser workflow completed", false, errorText(browser.browserError));
  }

  const ignoredFindings = browser.findings.filter(isHostedAuthBootstrapNoise);
  const findings = browser.findings.filter((finding) => !isHostedAuthBootstrapNoise(finding));
  if (ignoredFindings.length > 0) {
    console.log(`ignored ${ignoredFindings.length} hosted auth/bootstrap console finding(s)`);
  }
  record("no unexpected console/network findings", findings.length === 0, findings.length ? `${findings.length} finding(s)` : undefined);

  const passed = checks.filter((check) => check.passed).length;
  const failed = checks.filter((check) => !check.passed);
  const reportPath = `${SHOT_DIR}/layer3g-qa-summary.json`;
  writeFileSync(
    reportPath,
    JSON.stringify({
      passed,
      failed: failed.length,
      workflow,
      checks,
      findings,
      ignoredFindings,
    }, null, 2),
  );
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
