/**
 * Lightweight structured logger for diagnostic events.
 *
 * Why this exists:
 *   - We had an intermittent "Votre compte n'est rattaché à aucun client" bug
 *     caused by `useAdminUser` returning a null `customer_id` during auth
 *     hydration. Once fixed, we still want visibility if it ever resurfaces
 *     (or appears for a new role/group).
 *
 * What it does:
 *   - Emits a structured JSON payload to `console.error` / `console.warn`.
 *     Sentry, Logtail, BetterStack, Datadog and similar log drains pick up
 *     `console.error` automatically — no SDK required.
 *   - Tags every event with a stable `category`, plus contextual fields
 *     (route, user id, retry count, …) so we can grep/filter quickly.
 *   - Never throws — diagnostics must never break the UI.
 */

export type DiagnosticCategory =
  | "admin_user_query_error"
  | "admin_user_null_customer"
  | "admin_user_auth_not_ready"
  | "billing_profile_unavailable"
  | "billing_recovery_retry"
  | "driver_upload_failure"
  | "realtime_connection_unhealthy";

export interface DiagnosticContext {
  userId?: string | null;
  adminUserId?: string | null;
  customerId?: string | null;
  isPlatformOwner?: boolean | null;
  route?: string;
  retryCount?: number;
  errorMessage?: string;
  errorName?: string;
  [key: string]: unknown;
}

function safeRoute(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.location.pathname + window.location.search;
  } catch {
    return undefined;
  }
}

export function logDiagnostic(
  category: DiagnosticCategory,
  context: DiagnosticContext = {},
  level: "warn" | "error" = "error"
): void {
  try {
    const payload = {
      diagnostic: true,
      category,
      timestamp: new Date().toISOString(),
      route: context.route ?? safeRoute(),
      ...context,
    };
    // Tagged prefix makes it easy to filter in browser devtools and log drains.
    const tag = `[diag:${category}]`;
    if (level === "warn") {
      // eslint-disable-next-line no-console
      console.warn(tag, payload);
    } else {
      // eslint-disable-next-line no-console
      console.error(tag, payload);
    }
  } catch {
    /* swallow — diagnostics must never throw */
  }
}
