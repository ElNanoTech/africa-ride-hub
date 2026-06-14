import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WAVE_API_URL = "https://api.wave.com/v1";
const WAVE_MIN_AMOUNT_XOF = 100;

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const toMoney = (value: unknown) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
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
    const publicAppUrl = Deno.env.get("PUBLIC_APP_URL") || "https://damafricahub.com";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(401, { success: false, error: "Unauthorized" });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return json(401, { success: false, error: "Unauthorized" });
    }

    const { paymentId, amount, driverPhone, successUrl, errorUrl } = await req.json();

    if (!paymentId || !amount) {
      return json(400, { success: false, error: "Missing paymentId or amount" });
    }

    const numericAmount = toMoney(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < WAVE_MIN_AMOUNT_XOF) {
      return json(400, {
        success: false,
        error: `Le montant doit être d'au moins ${WAVE_MIN_AMOUNT_XOF} FCFA pour un paiement Wave.`,
        code: "AMOUNT_BELOW_MINIMUM",
        min_amount: WAVE_MIN_AMOUNT_XOF,
      });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: adminUser, error: adminError } = await serviceClient
      .from("admin_users")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (adminError) throw adminError;
    if (adminUser) {
      return json(403, { success: false, error: "Admin users cannot create driver Wave checkout sessions" });
    }

    const { data: driver, error: driverError } = await serviceClient
      .from("drivers")
      .select("id, customer_id")
      .or(`user_id.eq.${user.id},auth_user_id.eq.${user.id}`)
      .eq("access_enabled", true)
      .maybeSingle();
    if (driverError) throw driverError;
    if (!driver) {
      return json(403, { success: false, error: "Driver access required" });
    }

    const { data: payment, error: paymentError } = await serviceClient
      .from("payments")
      .select("id, driver_id, customer_id, amount, amount_paid, status, paid_at, wave_transaction_id")
      .eq("id", paymentId)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) {
      return json(404, { success: false, error: "Payment not found" });
    }
    if (payment.driver_id !== driver.id) {
      return json(403, { success: false, error: "Payment belongs to another driver" });
    }
    if (payment.customer_id && driver.customer_id && payment.customer_id !== driver.customer_id) {
      return json(403, { success: false, error: "Payment belongs to another fleet" });
    }
    if (payment.wave_transaction_id) {
      return json(409, { success: false, error: "A Wave checkout session already exists for this payment" });
    }

    const { data: invoiceLink, error: invoiceLinkError } = await serviceClient
      .from("invoice_payment_link")
      .select("invoice_id")
      .eq("payment_id", paymentId)
      .maybeSingle();
    if (invoiceLinkError) throw invoiceLinkError;

    let remainingDue = toMoney(payment.amount) - toMoney(payment.amount_paid);
    if (invoiceLink?.invoice_id) {
      const { data: invoice, error: invoiceError } = await serviceClient
        .from("invoice")
        .select("driver_id, customer_id, remaining_due, status, paid_at")
        .eq("id", invoiceLink.invoice_id)
        .maybeSingle();
      if (invoiceError) throw invoiceError;
      if (!invoice || invoice.driver_id !== driver.id) {
        return json(403, { success: false, error: "Invoice belongs to another driver" });
      }
      if (invoice.customer_id && driver.customer_id && invoice.customer_id !== driver.customer_id) {
        return json(403, { success: false, error: "Invoice belongs to another fleet" });
      }
      if (invoice.paid_at || invoice.status === "paid") {
        return json(400, { success: false, error: "Invoice is already paid" });
      }
      remainingDue = toMoney(invoice.remaining_due);
    }

    if (payment.paid_at || payment.status === "paid" || remainingDue <= 0) {
      return json(400, { success: false, error: "Payment is already settled" });
    }
    if (numericAmount > remainingDue) {
      return json(400, {
        success: false,
        error: "Amount exceeds remaining due",
        remaining_due: remainingDue,
      });
    }

    const waveResponse = await fetch(`${WAVE_API_URL}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${waveApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: String(numericAmount),
        currency: "XOF",
        error_url: resolveRedirectUrl(errorUrl, publicAppUrl, "/driver/rental?payment=error"),
        success_url: resolveRedirectUrl(successUrl, publicAppUrl, "/driver/rental?payment=success"),
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

    return json(200, {
      success: true,
      checkout_url: session.wave_launch_url,
      session_id: session.id,
      payment_status: session.payment_status,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Wave checkout error:", error);
    return json(500, { success: false, error: errorMessage });
  }
});
