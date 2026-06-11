import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { email, password, full_name } = await req.json();

    let userId: string | null = null;
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name },
    });
    if (created?.user) {
      userId = created.user.id;
    } else {
      // Try to find existing
      for (let page = 1; page <= 20 && !userId; page++) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        const m = data?.users?.find((u: any) => u.email === email);
        if (m) userId = m.id;
        if (!data?.users?.length || data.users.length < 200) break;
      }
      if (!userId) return new Response(JSON.stringify({ error: cErr?.message }), { status: 400, headers: corsHeaders });
      await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
    }

    const { data: existing } = await admin.from("admin_users").select("id").eq("user_id", userId).maybeSingle();
    let adminId = existing?.id;
    if (!adminId) {
      const { data: ins, error: iErr } = await admin.from("admin_users").insert({
        user_id: userId, email, full_name,
        is_active: true, is_platform_owner: true,
        role_key: "super_admin", email_verified: true,
      }).select("id").single();
      if (iErr) return new Response(JSON.stringify({ error: iErr.message }), { status: 400, headers: corsHeaders });
      adminId = ins.id;
    } else {
      await admin.from("admin_users").update({
        is_active: true, is_platform_owner: true, role_key: "super_admin", email_verified: true, full_name,
      }).eq("id", adminId);
    }

    await admin.from("admin_roles").upsert({ admin_user_id: adminId, role: "super_admin" }, { onConflict: "admin_user_id,role" });

    return new Response(JSON.stringify({ ok: true, userId, adminId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});