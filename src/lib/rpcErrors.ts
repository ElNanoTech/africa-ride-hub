/**
 * Shared helpers for Supabase RPC/PostgREST error handling in the UI.
 *
 * When the frontend ships ahead of a database migration (or a deploy is in
 * flight), calls to new RPCs fail with PGRST202 "Could not find the function
 * … in the schema cache". Raw PostgREST messages are English and technical —
 * never show them to the admin. These helpers detect that case so callers can
 * degrade honestly with simple French copy instead.
 */

interface PostgrestLikeError {
  code?: string;
  message?: string;
}

/** True when the error means the RPC does not exist on the live database yet. */
export function isMissingRpcError(e: unknown): boolean {
  const err = e as PostgrestLikeError | null | undefined;
  if (!err) return false;
  return (
    err.code === 'PGRST202' ||
    /could not find the function/i.test(err.message ?? '')
  );
}

/** Standard French copy for a feature whose server function is not deployed. */
export const MISSING_RPC_FR =
  'Fonction indisponible sur le serveur. Une mise à jour est en cours de déploiement — réessayez plus tard.';

/**
 * React Query `retry` guard: retrying a missing function never helps and
 * spams the network/console; other errors keep a small retry budget.
 */
export function retryUnlessMissingRpc(failureCount: number, error: unknown): boolean {
  if (isMissingRpcError(error)) return false;
  return failureCount < 2;
}
