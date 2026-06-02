// get-public-invoice — read-only public view by UUID token (no auth required)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? (await req.json().catch(() => ({}))).token;
    if (!token) {
      return new Response(JSON.stringify({ error: "token required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: inv, error: invErr } = await admin
      .from("invoice")
      .select("*")
      .eq("public_token", token)
      .maybeSingle();
    if (invErr || !inv) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (inv.status === "draft") {
      return new Response(JSON.stringify({ error: "Invoice not yet issued" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(inv.token_expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "Link expired", expired: true }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: lines } = await admin
      .from("invoice_line")
      .select("*")
      .eq("invoice_id", inv.id)
      .order("position", { ascending: true });

    // Audit view
    await admin.from("invoice_audit").insert({
      invoice_id: inv.id,
      customer_id: inv.customer_id,
      action: "viewed_public",
      actor_type: "public",
      metadata: { ip: req.headers.get("x-forwarded-for") ?? null, ua: req.headers.get("user-agent") ?? null },
    });

    return new Response(JSON.stringify({ invoice: inv, lines: lines ?? [] }), {
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
