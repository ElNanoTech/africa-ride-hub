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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { paymentId, amount, driverPhone, successUrl, errorUrl } = await req.json();

    if (!paymentId || !amount) {
      return new Response(
        JSON.stringify({ error: "Missing paymentId or amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const WAVE_MIN_AMOUNT_XOF = 100;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < WAVE_MIN_AMOUNT_XOF) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Le montant doit être d'au moins ${WAVE_MIN_AMOUNT_XOF} FCFA pour un paiement Wave.`,
          code: "AMOUNT_BELOW_MINIMUM",
          min_amount: WAVE_MIN_AMOUNT_XOF,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Wave Checkout Session
    const waveResponse = await fetch(`${WAVE_API_URL}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${waveApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: String(Math.round(amount)),
        currency: "XOF",
        error_url: errorUrl || `${supabaseUrl.replace(".supabase.co", "")}/driver/rental?payment=error`,
        success_url: successUrl || `${supabaseUrl.replace(".supabase.co", "")}/driver/rental?payment=success`,
        client_reference: paymentId,
        ...(driverPhone ? { restrict_payer_mobile: driverPhone } : {}),
      }),
    });

    if (!waveResponse.ok) {
      const errorText = await waveResponse.text();
      console.error(`Wave API error [${waveResponse.status}]:`, errorText);
      throw new Error(`Wave API call failed [${waveResponse.status}]: ${errorText}`);
    }

    const session = await waveResponse.json();
    console.log("Wave checkout session created:", session.id);

    // Store the Wave checkout session ID on the payment record
    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await serviceClient
      .from("payments")
      .update({ wave_transaction_id: session.id })
      .eq("id", paymentId);

    return new Response(
      JSON.stringify({
        success: true,
        checkout_url: session.wave_launch_url,
        session_id: session.id,
        payment_status: session.payment_status,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Wave checkout error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
