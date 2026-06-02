/**
 * Route-aware Supabase proxy.
 *
 * Most data hooks/components don't care which role is active — they just need
 * the Supabase client whose JWT matches the page they're rendering on. This
 * module exposes a `Proxy` that forwards every property access to either
 * `supabaseAdmin` or `supabaseDriver` based on the current `window.location`
 * pathname:
 *
 *   /admin/*  → supabaseAdmin
 *   anything else → supabaseDriver
 *
 * That way the existing 90+ `from "@/integrations/supabase/client"` imports
 * keep working unchanged after a path-only rename, and queries against RLS
 * tables continue to use the right session.
 *
 * Auth-critical code (login, signOut, onAuthStateChange, refresh) must NOT
 * use this proxy — import `supabaseAdmin` / `supabaseDriver` directly from
 * `./clients`. The proxy's "active client" can change between calls, which
 * is fine for stateless data calls but unsafe for stateful auth listeners.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { supabaseAdmin, supabaseDriver } from "./clients";
import { isAdminRoute } from "@/lib/routeScopes";

type DB = Database;

function activeClient(): SupabaseClient<DB> {
  if (typeof window === "undefined") return supabaseDriver;
  return isAdminRoute(window.location.pathname) ? supabaseAdmin : supabaseDriver;
}

/** Resolve the admin client explicitly. Prefer this in admin-only code paths. */
export const getAdminClient = (): SupabaseClient<DB> => supabaseAdmin;
/** Resolve the driver client explicitly. Prefer this in driver-only code paths. */
export const getDriverClient = (): SupabaseClient<DB> => supabaseDriver;

/**
 * Drop-in replacement for the legacy shared `supabase` import. Property
 * accesses are forwarded to whichever client matches the current route.
 * Method `this` binding is preserved so chained calls (`.from().select()`,
 * `.channel().on().subscribe()`, `.functions.invoke()`, etc.) work.
 */
export const supabase: SupabaseClient<DB> = new Proxy({} as SupabaseClient<DB>, {
  get(_target, prop, _receiver) {
    const client = activeClient() as unknown as Record<PropertyKey, unknown>;
    const value = client[prop as keyof typeof client];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
});

// Re-export for callers that want the explicit clients without a second import.
export { supabaseAdmin, supabaseDriver };
