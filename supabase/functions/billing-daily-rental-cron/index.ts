// billing-daily-rental-cron
//
// Runs hourly (via pg_cron). Two responsibilities:
//   1. Trigger issue_daily_rental_invoices() — creates one invoice per
//      Africa/Abidjan calendar day for every active rental that hasn't
//      been returned. The DB function is fully idempotent.
//   2. Late-payment sweep — for every rental payment whose due date has
//      passed and that is still unpaid, insert ONE driver_score_events
//      penalty (deduped on reason='late_daily_rental:<payment_id>')
//      and notify the driver.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, runtime",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LATE_PENALTY_DELTA = -15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  try {
    // 1. Generate any missing daily invoices
    const { data: generated, error: genErr } = await supabase
      .rpc("issue_daily_rental_invoices");
    if (genErr) throw new Error(`issue_daily_rental_invoices: ${genErr.message}`);

    // 2. Late-payment sweep
    //    Find pending rental payments past due date.
    const nowIso = new Date().toISOString();
    const { data: overdue, error: overdueErr } = await supabase
      .from("payments")
      .select("id, driver_id, customer_id, amount, due_date, rental_id")
      .eq("payment_type", "rental")
      .in("status", ["pending", "partial"])
      .lt("due_date", nowIso.slice(0, 10))
      .limit(500);
    if (overdueErr) throw new Error(`overdue query: ${overdueErr.message}`);

    let lateMarked = 0;
    for (const p of overdue ?? []) {
      const reason = `late_daily_rental:${p.id}`;

      // Dedup: skip if a score event with this reason already exists
      const { data: existing } = await supabase
        .from("driver_score_events")
        .select("id")
        .eq("driver_id", p.driver_id)
        .eq("reason", reason)
        .maybeSingle();
      if (existing) continue;

      const { error: evtErr } = await supabase.from("driver_score_events").insert({
        driver_id: p.driver_id,
        customer_id: p.customer_id,
        delta: LATE_PENALTY_DELTA,
        reason,
      });
      if (evtErr) {
        console.error("driver_score_events insert", evtErr);
        continue;
      }

      await supabase.from("notifications").insert({
        driver_id: p.driver_id,
        title: "Paiement en retard ⚠️",
        message: `Votre paiement de ${(p.amount ?? 0).toLocaleString()} FCFA est en retard. Cela impacte votre score DAM.`,
        notification_type: "payment_overdue",
      });

      lateMarked += 1;
    }

    const summary = { generated: generated ?? 0, late_marked: lateMarked };
    console.log("billing-daily-rental-cron OK", summary);
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("billing-daily-rental-cron ERROR", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
