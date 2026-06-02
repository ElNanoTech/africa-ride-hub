import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const webhookSecret = Deno.env.get("WAVE_WEBHOOK_SECRET");
    const body = await req.text();

    // SECURITY: Signature verification is mandatory.
    if (!webhookSecret) {
      console.error("WAVE_WEBHOOK_SECRET is not configured — refusing webhook");
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const signature = req.headers.get("Wave-Signature") || "";
    const parts: Record<string, string> = {};
    for (const part of signature.split(",")) {
      const [key, val] = part.split("=", 2);
      if (key && val) parts[key.trim()] = val.trim();
    }

    const timestamp = parts["t"] || "";
    const sig = parts["s"] || "";

    if (!timestamp || !sig) {
      console.error("Wave webhook: missing signature headers");
      return new Response("Invalid signature", { status: 401 });
    }

    const payload = timestamp + body;
    const expected = createHmac("sha256", webhookSecret)
      .update(payload)
      .digest("hex");

    const expectedBuffer = Buffer.from(expected, "hex");
    const sigBuffer = Buffer.from(sig, "hex");

    if (
      expectedBuffer.length !== sigBuffer.length ||
      !timingSafeEqual(expectedBuffer, sigBuffer)
    ) {
      console.error("Wave webhook signature mismatch");
      return new Response("Invalid signature", { status: 401 });
    }

    const event = JSON.parse(body);
    console.log("Wave webhook event:", event.type, event.id);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (event.type === "checkout.session.completed") {
      const session = event.data;
      const clientReference: string | undefined = session.client_reference; // our paymentId
      const checkoutStatus: string | undefined = session.checkout_status;
      const waveSessionId: string = session.id;
      // Wave returns amount as string in XOF
      const sessionAmount = Number(session.amount ?? 0);

      console.log(
        `Checkout completed: ref=${clientReference}, status=${checkoutStatus}, session=${waveSessionId}, amount=${sessionAmount}`,
      );

      if (checkoutStatus === "complete" && clientReference && sessionAmount > 0) {
        // Look up the payment (any status — receipts ledger is the source of truth)
        const { data: payment, error: lookupErr } = await supabase
          .from("payments")
          .select("id, driver_id, amount, customer_id, rental_id")
          .eq("id", clientReference)
          .maybeSingle();

        if (lookupErr) {
          console.error("Payment lookup error:", lookupErr);
          return new Response(
            JSON.stringify({ error: lookupErr.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        if (!payment) {
          console.warn(`No payment found for ref ${clientReference} — ignoring`);
          return new Response(
            JSON.stringify({ received: true, ignored: "unknown payment" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // Idempotency: if a receipt for this Wave session already exists, skip.
        const { data: existing } = await supabase
          .from("payment_receipts")
          .select("id")
          .eq("payment_id", payment.id)
          .eq("wave_transaction_id", waveSessionId)
          .maybeSingle();

        if (existing) {
          console.log(`Receipt already recorded for session ${waveSessionId}, skipping`);
          return new Response(
            JSON.stringify({ received: true, duplicate: true }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // Insert into ledger — trigger will recompute payments.status / amount_paid
        // and credit any overpayment surplus to the driver wallet.
        const { error: receiptErr } = await supabase
          .from("payment_receipts")
          .insert({
            payment_id: payment.id,
            customer_id: payment.customer_id,
            amount: Math.round(sessionAmount),
            method: "wave",
            wave_transaction_id: waveSessionId,
            note: "Paiement Wave (webhook)",
          });

        if (receiptErr) {
          console.error("Receipt insert failed:", receiptErr);
          return new Response(
            JSON.stringify({ error: receiptErr.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        console.log(`Receipt recorded for payment ${payment.id} (${sessionAmount} FCFA)`);

        // Notify driver
        await supabase.from("notifications").insert({
          driver_id: payment.driver_id,
          title: "Paiement reçu! ✅",
          message: `Votre paiement de ${sessionAmount.toLocaleString()} FCFA a été confirmé. Merci!`,
          notification_type: "payment_received",
        });
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Wave webhook error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
