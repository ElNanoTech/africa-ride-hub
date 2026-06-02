import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WAVE_API_URL = "https://api.wave.com/v1";
const MIN_TOPUP = 500;
const MAX_TOPUP = 500000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const waveApiKey = Deno.env.get("WAVE_API_KEY");
    if (!waveApiKey) throw new Error("WAVE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { amount, successUrl, errorUrl } = await req.json();
    const numericAmount = Math.round(Number(amount));
    if (!Number.isFinite(numericAmount) || numericAmount < MIN_TOPUP || numericAmount > MAX_TOPUP) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Le montant doit être entre ${MIN_TOPUP} et ${MAX_TOPUP} FCFA.`,
          code: "AMOUNT_INVALID",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Resolve driver
    const { data: driver, error: drvErr } = await service
      .from("drivers")
      .select("id, customer_id, phone_number")
      .eq("user_id", user.id)
      .maybeSingle();

    if (drvErr || !driver) {
      return new Response(JSON.stringify({ error: "Driver not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create a payments row with amount=0 — the receipt for `numericAmount` will be
    // recorded as overpayment and credited to the wallet by the existing trigger.
    const { data: payment, error: payErr } = await service
      .from("payments")
      .insert({
        driver_id: driver.id,
        customer_id: driver.customer_id,
        amount: 0,
        amount_paid: 0,
        payment_type: "wallet_topup",
        status: "pending",
        due_date: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();

    if (payErr || !payment) {
      console.error("Topup payment insert failed:", payErr);
      throw new Error("Impossible de créer la recharge.");
    }

    const origin = req.headers.get("origin") || "";
    const waveResponse = await fetch(`${WAVE_API_URL}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${waveApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: String(numericAmount),
        currency: "XOF",
        error_url: errorUrl || `${origin}/driver/portefeuille?topup=error`,
        success_url: successUrl || `${origin}/driver/portefeuille?topup=success`,
        client_reference: payment.id,
        ...(driver.phone_number ? { restrict_payer_mobile: driver.phone_number } : {}),
      }),
    });

    if (!waveResponse.ok) {
      const errorText = await waveResponse.text();
      console.error(`Wave API error [${waveResponse.status}]:`, errorText);
      // best-effort cleanup
      await service.from("payments").delete().eq("id", payment.id);
      throw new Error(`Wave API call failed [${waveResponse.status}]`);
    }

    const session = await waveResponse.json();

    await service.from("payments")
      .update({ wave_transaction_id: session.id })
      .eq("id", payment.id);

    return new Response(
      JSON.stringify({
        success: true,
        payment_id: payment.id,
        checkout_url: session.wave_launch_url,
        session_id: session.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("wallet-topup-checkout error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
