import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WAVE_API_URL = "https://api.wave.com/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const waveApiKey = Deno.env.get("WAVE_API_KEY");
    if (!waveApiKey) {
      throw new Error("WAVE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find pending payments that have a Wave session ID (checkout was initiated)
    const { data: pendingPayments, error: fetchError } = await supabase
      .from("payments")
      .select("id, driver_id, amount, rental_id, wave_transaction_id")
      .eq("status", "pending")
      .not("wave_transaction_id", "is", null)
      .order("due_date", { ascending: true })
      .limit(50);

    if (fetchError) {
      throw new Error(`Failed to fetch pending payments: ${fetchError.message}`);
    }

    if (!pendingPayments || pendingPayments.length === 0) {
      console.log("No pending payments with Wave session IDs to check");
      return new Response(
        JSON.stringify({ checked: 0, updated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Checking ${pendingPayments.length} pending payment(s)...`);

    let updatedCount = 0;
    const errors: string[] = [];

    for (const payment of pendingPayments) {
      try {
        // Query Wave API for the checkout session status
        const waveResponse = await fetch(
          `${WAVE_API_URL}/checkout/sessions/${payment.wave_transaction_id}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${waveApiKey}`,
            },
          }
        );

        if (!waveResponse.ok) {
          const errText = await waveResponse.text();
          console.warn(
            `Wave API error for session ${payment.wave_transaction_id}: [${waveResponse.status}] ${errText}`
          );
          errors.push(`${payment.id}: Wave API ${waveResponse.status}`);
          continue;
        }

        const session = await waveResponse.json();

        // Check if payment is complete
        if (session.payment_status === "succeeded" || session.checkout_status === "complete") {
          const { error: updateError } = await supabase
            .from("payments")
            .update({
              status: "paid",
              paid_date: new Date().toISOString().split("T")[0],
            })
            .eq("id", payment.id)
            .eq("status", "pending"); // Ensure we don't double-update

          if (updateError) {
            console.error(`Failed to update payment ${payment.id}:`, updateError);
            errors.push(`${payment.id}: DB update failed`);
            continue;
          }

          updatedCount++;
          console.log(`✅ Payment ${payment.id} confirmed as paid via polling`);

          // Send notification to driver
          await supabase.from("notifications").insert({
            driver_id: payment.driver_id,
            title: "Paiement reçu! ✅",
            message: `Votre paiement de ${payment.amount.toLocaleString()} FCFA a été confirmé. Merci!`,
            notification_type: "payment_received",
          });
        } else if (session.checkout_status === "expired") {
          // Clear the wave_transaction_id so driver can retry
          await supabase
            .from("payments")
            .update({ wave_transaction_id: null })
            .eq("id", payment.id);

          console.log(`⏰ Session expired for payment ${payment.id}, cleared for retry`);
        } else {
          console.log(
            `⏳ Payment ${payment.id}: checkout_status=${session.checkout_status}, payment_status=${session.payment_status}`
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error checking payment ${payment.id}:`, msg);
        errors.push(`${payment.id}: ${msg}`);
      }
    }

    const result = {
      checked: pendingPayments.length,
      updated: updatedCount,
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log("Polling result:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("check-wave-payments error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
