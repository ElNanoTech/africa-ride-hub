import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Auto-immobilization cron: runs every 15 minutes.
// - Marks inspections as 'expired' when due_at < now and not validated/rejected
// - Auto-queues 'pending' immobilization commands for vehicles 3+ days overdue
//   or with 2+ reminders (and no recent active command)

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    // 1) Expire overdue inspections
    const { data: expiredRows, error: expErr } = await supabase
      .from("vehicle_inspections")
      .update({ status: "expired" })
      .lt("due_at", new Date().toISOString())
      .in("status", ["draft", "submitted"])
      .select("id");
    if (expErr) throw expErr;

    // 2) Find inspections eligible for auto-immobilization
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: candidates, error: candErr } = await supabase
      .from("vehicle_inspections")
      .select("id, vehicle_id, customer_id, due_at, reminder_count, immobilized_at")
      .in("status", ["expired", "rejected"])
      .is("immobilized_at", null)
      .or(`due_at.lt.${threeDaysAgo},reminder_count.gte.2`);
    if (candErr) throw candErr;

    let queued = 0;
    for (const insp of candidates ?? []) {
      // Skip if a pending/sent command already exists
      const { data: existing } = await supabase
        .from("vehicle_immobilization_commands")
        .select("id")
        .eq("vehicle_id", insp.vehicle_id)
        .in("status", ["pending", "sent"])
        .limit(1)
        .maybeSingle();
      if (existing) continue;

      const { error: insErr } = await supabase
        .from("vehicle_immobilization_commands")
        .insert({
          vehicle_id: insp.vehicle_id,
          inspection_id: insp.id,
          customer_id: insp.customer_id,
          status: "pending",
          source: "auto_overdue",
          reason: "Inspection en retard de 3+ jours ou 2+ rappels",
        });
      if (insErr) continue;

      await supabase
        .from("vehicle_inspections")
        .update({
          immobilized_at: new Date().toISOString(),
          immobilization_reason: "Auto: contrôle non effectué",
        })
        .eq("id", insp.id);
      queued++;
    }

    return new Response(
      JSON.stringify({ ok: true, expired: expiredRows?.length ?? 0, queued }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("auto-immobilize error", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});