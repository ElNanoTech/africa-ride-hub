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

type WaveErrorBody = {
  error_code?: string;
  error_message?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

function isHttpsUrl(value?: string | null): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function resolveRedirectUrl(candidate: unknown, publicAppUrl: string, fallbackPath: string) {
  if (typeof candidate === "string" && isHttpsUrl(candidate)) {
    return candidate;
  }

  const baseUrl = isHttpsUrl(publicAppUrl) ? publicAppUrl : "https://damafricahub.com";
  return new URL(fallbackPath, baseUrl).toString();
}

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function createWaveSignature(body: string, signingSecret?: string | null) {
  if (!signingSecret) return null;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}${body}`));
  return `t=${timestamp},v1=${toHex(signature)}`;
}

function parseWaveError(errorText: string) {
  try {
    const parsed = JSON.parse(errorText) as WaveErrorBody;
    return {
      code: parsed.error_code || parsed.error?.code || null,
      message: parsed.error_message || parsed.error?.message || null,
    };
  } catch {
    return { code: null, message: errorText.trim() || null };
  }
}

function getWaveCheckoutUserMessage(code: string | null, message: string | null) {
  if (code === "missing-signature") {
    return "Wave demande une signature API. Configurez WAVE_SIGNING_SECRET puis redeployez.";
  }
  if (code === "ip-not-allowed") {
    return "Wave bloque l'adresse IP du serveur. Ajoutez l'IP Supabase autorisee dans Wave ou adaptez la liste blanche.";
  }
  if (code === "unauthorized-wallet" || code === "invalid-wallet" || code === "disabled-wallet") {
    return "Le compte Wave Business n'est pas autorise pour ce checkout. Verifiez la cle API Wave.";
  }
  if (code === "request-validation-error" && message) {
    return `Wave a refuse la recharge: ${message}`;
  }
  if (code) {
    return `Wave a refuse la recharge. Code: ${code}.`;
  }
  return "Wave a refusé la recharge. Vérifiez votre numéro mobile money ou réessayez.";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const waveApiKey = Deno.env.get("WAVE_API_KEY");
    if (!waveApiKey) throw new Error("WAVE_API_KEY is not configured");
    const waveSigningSecret = Deno.env.get("WAVE_SIGNING_SECRET");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseServiceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
    const publicAppUrl = Deno.env.get("PUBLIC_APP_URL") || "https://damafricahub.com";

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

    const service = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Resolve driver
    const { data: driver, error: drvErr } = await service
      .from("drivers")
      .select("id, customer_id")
      .or(`user_id.eq.${user.id},auth_user_id.eq.${user.id}`)
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

    const waveRequestBody = JSON.stringify({
      amount: String(numericAmount),
      currency: "XOF",
      error_url: resolveRedirectUrl(errorUrl, publicAppUrl, "/driver/portefeuille?topup=error"),
      success_url: resolveRedirectUrl(successUrl, publicAppUrl, "/driver/portefeuille?topup=success"),
      client_reference: payment.id,
      // Do not restrict payer mobile: login/profile phone can differ from
      // the Wave wallet a driver controls. Ownership is enforced by auth.
    });
    const waveSignature = await createWaveSignature(waveRequestBody, waveSigningSecret);

    const waveResponse = await fetch(`${WAVE_API_URL}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${waveApiKey}`,
        "Content-Type": "application/json",
        ...(waveSignature ? { "Wave-Signature": waveSignature } : {}),
      },
      body: waveRequestBody,
    });

    if (!waveResponse.ok) {
      const errorText = await waveResponse.text();
      const waveError = parseWaveError(errorText);
      console.error(`Wave API error [${waveResponse.status}]:`, errorText);
      // best-effort cleanup
      await service.from("payments").delete().eq("id", payment.id);
      return new Response(
        JSON.stringify({
          success: false,
          error: getWaveCheckoutUserMessage(waveError.code, waveError.message),
          code: "WAVE_CHECKOUT_FAILED",
          wave_status: waveResponse.status,
          wave_error_code: waveError.code,
          wave_error_message: waveError.message,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
