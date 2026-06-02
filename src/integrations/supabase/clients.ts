/**
 * Role-isolated Supabase clients.
 *
 * Why this exists
 * ----------------
 * The admin app (`/admin`) and the driver app (`/driver`) live on the same
 * origin. Supabase GoTrue stores its session in `localStorage` under a single
 * `storageKey` and only supports ONE active session per key per origin.
 *
 * With the auto-generated default client (`./client.ts`) both surfaces shared
 * the same key, so logging into one role overwrote the other role's session
 * and signing out of one logged the other out via cross-tab `storage` events.
 *
 * The fix is simple and surgical: two real `SupabaseClient` instances, each
 * persisting its session under its OWN `storageKey`. Admin and driver can now
 * be signed in side-by-side in the same browser without interfering.
 *
 * Usage
 * -----
 *  - Auth-critical code (login pages, route guards, signOut, onAuthStateChange,
 *    refresh helpers) MUST import `supabaseAdmin` or `supabaseDriver`
 *    explicitly from this file.
 *  - Generic data hooks/components import the route-aware `supabase` from
 *    `./routeClient`, which dispatches to the right client based on the
 *    current pathname so RLS keeps using the correct JWT.
 *
 * Do NOT edit `./client.ts` — it is auto-generated.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env
  .VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const ADMIN_STORAGE_KEY = "damflotte-admin-auth";
export const DRIVER_STORAGE_KEY = "damflotte-driver-auth";

/** Admin (`/admin/*`) Supabase client — isolated session. */
export const supabaseAdmin = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      storageKey: ADMIN_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);

/** Driver (`/driver/*` and the rest of the in-app routes) Supabase client. */
export const supabaseDriver = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      storageKey: DRIVER_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);
