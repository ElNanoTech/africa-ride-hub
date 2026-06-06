import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, runtime",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { broadcast_id } = await req.json();
    if (!broadcast_id) {
      return new Response(JSON.stringify({ error: "broadcast_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: b, error: bErr } = await supa.from("broadcasts").select("*").eq("id", broadcast_id).maybeSingle();
    if (bErr || !b) throw new Error(bErr?.message ?? "Broadcast introuvable");

    // Resolve audience -> driver list (scoped to broadcast tenant when set)
    let q = supa.from("drivers").select("id, customer_id, driver_status");
    if (b.customer_id) q = q.eq("customer_id", b.customer_id);
    switch (b.audience) {
      case "active": q = q.eq("driver_status", "active"); break;
      case "suspended": q = q.eq("driver_status", "suspended"); break;
    }
    const { data: drivers, error: dErr } = await q;
    if (dErr) throw dErr;

    let targets = drivers ?? [];

    if (b.audience === "top_scorers" || b.audience === "low_scorers") {
      const ids = targets.map((d: any) => d.id);
      if (ids.length) {
        const { data: scores } = await supa.from("credit_scores").select("driver_id, score").in("driver_id", ids);
        const map = new Map((scores ?? []).map((s: any) => [s.driver_id, s.score]));
        const sorted = targets
          .map((d: any) => ({ ...d, _score: map.get(d.id) ?? 0 }))
          .sort((a: any, b2: any) => b.audience === "top_scorers" ? b2._score - a._score : a._score - b2._score);
        targets = sorted.slice(0, Math.max(10, Math.ceil(sorted.length * 0.2)));
      }
    }

    if (targets.length === 0) {
      await supa.from("broadcasts").update({ status: "sent", sent_at: new Date().toISOString(), recipient_count: 0, delivered_count: 0 }).eq("id", broadcast_id);
      return new Response(JSON.stringify({ delivered: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Insert deliveries (idempotent via unique index)
    const deliveries = targets.map((d: any) => ({ broadcast_id, driver_id: d.id }));
    await supa.from("broadcast_deliveries").upsert(deliveries, { onConflict: "broadcast_id,driver_id" });

    // Mirror to notifications for in-app inbox
    const notifs = targets.map((d: any) => ({
      driver_id: d.id,
      customer_id: d.customer_id,
      title: b.title,
      message: b.message,
      notification_type: "announcement",
      channel: b.channel,
      send_status: "sent",
    }));
    const { error: nErr } = await supa.from("notifications").insert(notifs);
    if (nErr) console.error("notifications insert failed", nErr);

    await supa.from("broadcasts").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      recipient_count: targets.length,
      delivered_count: targets.length,
    }).eq("id", broadcast_id);

    return new Response(JSON.stringify({ delivered: targets.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("send-broadcast error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});