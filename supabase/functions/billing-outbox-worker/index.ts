// billing-outbox-worker — drains pending billing notifications (push/whatsapp/email)
// v1: marks all pending as 'sent' since invoice_event trigger already inserts the in_app notification.
// External channels (FCM push / WhatsApp) plug in here as needed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: runRow } = await admin
    .from("billing_cron_runs")
    .insert({ job_name: "billing-outbox-worker" })
    .select("id")
    .single();
  const runId = runRow?.id ?? null;

  try {
    const { data: pending } = await admin
      .from("billing_outbox")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(100);

    let processed = 0;
    for (const item of pending ?? []) {
      const { error } = await admin
        .from("billing_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString(), attempts: (item.attempts ?? 0) + 1 })
        .eq("id", item.id);
      if (!error) processed++;
    }

    if (runId) {
      await admin.from("billing_cron_runs").update({
        finished_at: new Date().toISOString(),
        status: "success",
        processed_count: processed,
      }).eq("id", runId);
    }

    return new Response(JSON.stringify({ ok: true, processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (runId) {
      await admin.from("billing_cron_runs").update({
        finished_at: new Date().toISOString(),
        status: "error",
        error_message: String(e).slice(0, 1000),
      }).eq("id", runId);
    }
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
