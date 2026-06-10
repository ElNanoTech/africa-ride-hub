import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-runtime",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let targetModuleId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    targetModuleId = body?.module_id ?? null;
  } catch (_) { /* noop */ }

  // Fetch mandatory published modules (optionally filtered)
  let modQ: any = supabase.from("training_modules").select("*").eq("is_published", true).eq("is_mandatory", true);
  if (targetModuleId) modQ = modQ.eq("id", targetModuleId);
  const { data: modules, error: modErr } = await modQ;
  if (modErr) {
    return new Response(JSON.stringify({ error: modErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let totalSent = 0;

  for (const m of modules ?? []) {
    // Active drivers (scoped by customer if applicable)
    let drvQ: any = supabase.from("drivers").select("id, customer_id").eq("status", "active");
    if (m.customer_id) drvQ = drvQ.eq("customer_id", m.customer_id);
    const { data: drivers } = await drvQ;
    if (!drivers?.length) continue;

    const { data: progress } = await supabase
      .from("training_progress")
      .select("driver_id, status")
      .eq("module_id", m.id);
    const doneSet = new Set((progress ?? []).filter((p: any) => p.status === "completed").map((p: any) => p.driver_id));

    const pending = drivers.filter((d: any) => !doneSet.has(d.id));
    if (!pending.length) continue;

    const dueText = m.due_days ? ` (à terminer sous ${m.due_days} jours)` : "";
    const rows = pending.map((d: any) => ({
      driver_id: d.id,
      customer_id: d.customer_id,
      notification_type: "training_reminder",
      title: "Formation obligatoire",
      message: `N'oubliez pas de terminer « ${m.title} »${dueText}.`,
      channel: "in_app",
      send_status: "sent",
    }));

    const { error: insErr } = await supabase.from("notifications").insert(rows);
    if (!insErr) totalSent += rows.length;
  }

  return new Response(JSON.stringify({ sent: totalSent }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});