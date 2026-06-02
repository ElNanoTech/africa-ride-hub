/**
 * Admin session resilience helpers.
 *
 * Why this exists:
 *   Multiple admins reported being randomly bounced to /admin/login. Root
 *   causes we identified:
 *
 *   1. Supabase emits a `SIGNED_OUT` event when a refresh-token rotation
 *      fails (network blip, two tabs racing, brief offline). The library
 *      treats it as a hard logout, but the user's localStorage session may
 *      still be valid — a simple re-check of `getSession()` resolves to a
 *      live session a few hundred ms later.
 *
 *   2. The admin app — unlike the driver app — never refreshed the JWT on
 *      tab focus. Long-idle tabs woke up with an expired access token and
 *      the next API call's auto-refresh would race the listener.
 *
 * `verifySignOut` lets callers ignore phantom SIGNED_OUT events by
 * confirming with one `getSession()` round-trip. `installFocusRefresh`
 * proactively refreshes the session when the admin tab regains focus, at
 * most once every 30s (mirroring the driver-side behaviour).
 *
 * Both helpers are no-ops on real sign-outs (logout button, expired refresh
 * token, password change) so they do NOT trap users in a stale session.
 */
import { supabaseAdmin as supabase } from "@/integrations/supabase/clients";

/**
 * Confirm whether a `SIGNED_OUT` event corresponds to a real sign-out.
 * Returns `true` if the user is actually signed out, `false` if a session
 * still exists (transient event we should ignore).
 */
export async function verifySignOut(): Promise<boolean> {
  try {
    // Tiny grace period — Supabase often re-hydrates within the same tick
    // after a refresh-token rotation race.
    await new Promise((r) => setTimeout(r, 150));
    const { data } = await supabase.auth.getSession();
    return !data?.session;
  } catch {
    // If we can't even ask, default to NOT redirecting — better to leave
    // the admin on their page than to log them out on a network blip.
    return false;
  }
}

let focusRefreshInFlight: Promise<unknown> | null = null;
let lastFocusRefreshAt = 0;
const FOCUS_REFRESH_MIN_INTERVAL_MS = 30_000;

const refreshOnce = () => {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const now = Date.now();
  if (focusRefreshInFlight || now - lastFocusRefreshAt < FOCUS_REFRESH_MIN_INTERVAL_MS) return;
  lastFocusRefreshAt = now;
  focusRefreshInFlight = supabase.auth
    .refreshSession()
    .catch(() => {
      // Silent — onAuthStateChange will surface a real SIGNED_OUT.
    })
    .finally(() => {
      focusRefreshInFlight = null;
    });
};

/**
 * Attach focus / visibility listeners that proactively refresh the admin
 * session. Returns an unsubscribe function. Safe to call multiple times.
 */
export function installFocusRefresh(): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("focus", refreshOnce);
  document.addEventListener("visibilitychange", refreshOnce);
  window.addEventListener("online", refreshOnce);
  return () => {
    window.removeEventListener("focus", refreshOnce);
    document.removeEventListener("visibilitychange", refreshOnce);
    window.removeEventListener("online", refreshOnce);
  };
}
