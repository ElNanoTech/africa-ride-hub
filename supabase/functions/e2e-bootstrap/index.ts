// E2E Bootstrap — creates an isolated Customer + Customer Admin user for RLS tests.
// Service-role only; idempotent: reuses existing test customer/admin if present.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, runtime",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TEST_EMAIL = "e2e-customer-admin@dam-test.local";
const TEST_PASSWORD = "E2E-Test-Pass-2026!";
const TEST_CUSTOMER_NAME = "E2E Test Fleet Co";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // 1. Ensure a dedicated test customer exists.
    let { data: cust } = await admin
      .from("customers")
      .select("id, name")
      .eq("name", TEST_CUSTOMER_NAME)
      .maybeSingle();

    if (!cust) {
      const { data: created, error } = await admin
        .from("customers")
        .insert({ name: TEST_CUSTOMER_NAME, is_active: true })
        .select("id, name")
        .single();
      if (error) throw new Error(`customers insert: ${error.message}`);
      cust = created;
    }

    // 2. Ensure auth user exists.
    let userId: string | null = null;
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list.data?.users.find((u) => u.email === TEST_EMAIL);
    if (existing) {
      userId = existing.id;
      // Reset password to a known value so the test can always sign in.
      await admin.auth.admin.updateUserById(existing.id, { password: TEST_PASSWORD });
    } else {
      const { data: u, error } = await admin.auth.admin.createUser({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
      });
      if (error) throw new Error(`auth.createUser: ${error.message}`);
      userId = u.user!.id;
    }

    // 3. Ensure admin_users row links the user to the test customer as a NON-platform-owner.
    const { data: existingAdmin } = await admin
      .from("admin_users")
      .select("id, customer_id, is_platform_owner, is_active")
      .eq("user_id", userId!)
      .maybeSingle();

    if (!existingAdmin) {
      const { error } = await admin.from("admin_users").insert({
        user_id: userId,
        email: TEST_EMAIL,
        full_name: "E2E Customer Admin",
        role_key: "fleet_admin",
        customer_id: cust!.id,
        is_platform_owner: false,
        is_active: true,
        email_verified: true,
      });
      if (error) throw new Error(`admin_users insert: ${error.message}`);
    } else {
      await admin
        .from("admin_users")
        .update({
          customer_id: cust!.id,
          is_platform_owner: false,
          is_active: true,
        })
        .eq("id", existingAdmin.id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        customer_id: cust!.id,
        user_id: userId,
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});