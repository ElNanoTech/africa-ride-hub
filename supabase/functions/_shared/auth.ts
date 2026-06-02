// Shared auth helpers for edge functions.
// Validates the caller's JWT and exposes ownership/admin checks.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AuthContext {
  userId: string;
  email: string | null;
  supabaseAdmin: SupabaseClient;
}

/**
 * Verify the Authorization: Bearer <jwt> header and return the authenticated user.
 * Returns null if missing/invalid.
 */
export async function authenticate(req: Request): Promise<AuthContext | null> {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Use anon client just to validate the user JWT.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) return null;

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  return { userId: data.user.id, email: data.user.email ?? null, supabaseAdmin };
}

/** Resolve the driver record id for the authenticated user, if any. */
export async function getDriverIdForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("drivers")
    .select("id")
    .or(`auth_user_id.eq.${userId},user_id.eq.${userId}`)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** True if the authenticated user is an active admin. */
export async function isAdmin(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase.rpc("is_admin", { _user_id: userId });
  return data === true;
}

export function unauthorized(corsHeaders: Record<string, string>, msg = "Unauthorized") {
  return new Response(JSON.stringify({ error: msg }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function forbidden(corsHeaders: Record<string, string>, msg = "Forbidden") {
  return new Response(JSON.stringify({ error: msg }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
