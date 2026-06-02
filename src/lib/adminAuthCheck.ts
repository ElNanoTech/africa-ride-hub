import { supabaseAdmin as supabase } from '@/integrations/supabase/clients';

/**
 * Resilient `is_admin` RPC caller with exponential backoff.
 *
 * Why: token refresh storms or brief network hiccups used to surface as a
 * single failed `is_admin` RPC, which previously kicked admins back to
 * `/admin/login`. We retry transient errors a few times before surfacing.
 *
 * Returns:
 *  - { ok: true,  isAdmin: boolean }            — RPC resolved cleanly
 *  - { ok: false, error: Error, attempts }      — exhausted retries (network/transient)
 */
export interface AdminCheckResult {
  ok: boolean;
  isAdmin?: boolean;
  error?: Error;
  attempts: number;
}

export async function checkIsAdminWithRetry(
  userId: string,
  maxAttempts = 3,
): Promise<AdminCheckResult> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await supabase.rpc('is_admin', { _user_id: userId });
      if (!error) {
        return { ok: true, isAdmin: data === true, attempts: attempt };
      }
      lastError = new Error(error.message);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
    if (attempt < maxAttempts) {
      // Exponential backoff: 250ms, 500ms, 1000ms (capped)
      const delay = Math.min(250 * 2 ** (attempt - 1), 1000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return { ok: false, error: lastError, attempts: maxAttempts };
}
