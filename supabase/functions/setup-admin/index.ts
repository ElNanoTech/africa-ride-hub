import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { email, password, full_name } = await req.json();

    if (!email || !password || !full_name) {
      return new Response(
        JSON.stringify({ error: "email, password, and full_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Safety: only allow setup if no admin_users exist yet
    const { count, error: countError } = await adminClient
      .from("admin_users")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .not("user_id", "is", null);

    if (countError) {
      throw countError;
    }

    if (count && count > 0) {
      return new Response(
        JSON.stringify({ error: "Un administrateur existe déjà. Utilisez la page de connexion." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create auth user
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (authError) {
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authData.user.id;

    // Create admin_users record (bypasses RLS via service role)
    const { data: adminUser, error: adminError } = await adminClient
      .from("admin_users")
      .insert({
        user_id: userId,
        email,
        full_name,
        is_active: true,
        is_platform_owner: true,
        role_key: "super_admin",
        email_verified: true,
      })
      .select()
      .single();

    if (adminError) {
      // Cleanup: delete the auth user if admin record creation fails
      await adminClient.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: adminError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin_roles record
    await adminClient.from("admin_roles").insert({
      admin_user_id: adminUser.id,
      role: "super_admin",
    });

    return new Response(
      JSON.stringify({ success: true, adminUser }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Setup admin error:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
