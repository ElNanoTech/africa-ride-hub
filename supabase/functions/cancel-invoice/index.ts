// cancel-invoice — soft-cancel an issued invoice with a mandatory reason
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: adminCheck } = await supabase
      .from("admin_users")
      .select("id, customer_id, is_platform_owner, is_active, role_key")
      .eq("user_id", userData.user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!adminCheck || !["super_admin", "manager"].includes(adminCheck.role_key) && !adminCheck.is_platform_owner) {
      return new Response(JSON.stringify({ error: "super_admin or manager required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { invoice_id, reason, tags } = await req.json();
    if (!invoice_id || !reason || String(reason).trim().length < 5) {
      return new Response(JSON.stringify({ error: "invoice_id and reason (min 5 chars) are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional tags: must be an array of strings if provided
    let tagsUpdate: string[] | undefined = undefined;
    if (tags !== undefined && tags !== null) {
      if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string")) {
        return new Response(JSON.stringify({ error: "tags must be an array of strings" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      tagsUpdate = tags;
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: inv } = await admin.from("invoice").select("id, customer_id, status").eq("id", invoice_id).maybeSingle();
    if (!inv) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!adminCheck.is_platform_owner && inv.customer_id !== adminCheck.customer_id) {
      return new Response(JSON.stringify({ error: "Cross-tenant access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (inv.status === "cancelled") {
      return new Response(JSON.stringify({ error: "Already cancelled" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updatePayload: Record<string, unknown> = {
      status: "cancelled",
      cancel_reason: reason,
      cancelled_by: userData.user.id,
    };
    if (tagsUpdate !== undefined) updatePayload.tags = tagsUpdate;

    const { data: updated, error: updErr } = await admin
      .from("invoice")
      .update(updatePayload)
      .eq("id", invoice_id)
      .select("*")
      .single();

    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ invoice: updated }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
