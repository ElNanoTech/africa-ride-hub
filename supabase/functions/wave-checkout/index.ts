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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceRoleKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    }

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

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: adminUser, error: adminUserError } = await serviceClient
      .from("admin_users")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminUserError) {
      console.error("Admin role lookup failed:", adminUserError);
      return new Response(JSON.stringify({ error: "Unable to verify caller role" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (adminUser) {
      return new Response(JSON.stringify({ error: "Driver checkout only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: driver, error: driverError } = await supabase
      .from("drivers")
      .select("id, customer_id")
      .or(`user_id.eq.${user.id},auth_user_id.eq.${user.id}`)
      .maybeSingle();

    if (driverError || !driver) {
      return new Response(JSON.stringify({ error: "Driver profile not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: payment, error: paymentError } = await serviceClient
      .from("payments")
      .select("id, driver_id, customer_id, amount, amount_paid, status, wave_transaction_id")
      .eq("id", paymentId)
      .maybeSingle();

    if (paymentError || !payment) {
      return new Response(JSON.stringify({ error: "Payment not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (payment.driver_id !== driver.id || payment.customer_id !== driver.customer_id) {
      return new Response(JSON.stringify({ error: "Payment does not belong to this driver" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (["paid", "overpaid", "cancelled"].includes(payment.status)) {
      return new Response(JSON.stringify({ error: "Payment is already closed" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (payment.wave_transaction_id) {
      return new Response(JSON.stringify({ error: "Checkout already created" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const remainingDue = Math.max(0, Number(payment.amount ?? 0) - Number(payment.amount_paid ?? 0));
    const roundedAmount = Math.round(numericAmount);
    if (remainingDue <= 0 || roundedAmount > remainingDue) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Le montant demandé dépasse le restant dû.",
          code: "AMOUNT_EXCEEDS_REMAINING_DUE",
          remaining_due: remainingDue,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve base URL for success/error redirects.
    // Origin header (preferred) → fallback to PUBLIC_APP_URL env → fallback to a sane default.
    const origin = req.headers.get("Origin")
      ?? req.headers.get("origin")
      ?? Deno.env.get("PUBLIC_APP_URL")
      ?? "https://damafricahub.com";

    // Create Wave Checkout Session
    const waveResponse = await fetch(`${WAVE_API_URL}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${waveApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: String(roundedAmount),
        currency: "XOF",
        error_url: errorUrl || `${origin}/driver/rental?payment=error`,
        success_url: successUrl || `${origin}/driver/rental?payment=success`,
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

    await serviceClient
      .from("payments")
      .update({ wave_transaction_id: session.id })
      .eq("id", paymentId)
      .eq("driver_id", driver.id);

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
