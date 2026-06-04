import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// One-shot helper to (re)seed the canonical test driver account used by QA.
// Phone: +225 05 05 05 05 05  /  PIN: 1234
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const phoneNumber = "+225 05 05 05 05 05";
    const normalizedPhone = phoneNumber.replace(/\D/g, ""); // 2250505050505
    const pin = "1234";
    const email = `driver_${normalizedPhone}@dam-flotte.local`;
    const password = `pin_${pin}_${normalizedPhone}`;
    const fullName = "Chauffeur Test";

    // Find or create the auth user.
    let authUserId: string | null = null;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        phone_number: phoneNumber,
        full_name: fullName,
        auth_provider: "native",
        managed_by_admin: true,
      },
    });

    if (created?.user) {
      authUserId = created.user.id;
    } else {
      const perPage = 200;
      for (let page = 1; page <= 50 && !authUserId; page++) {
        const { data: list } = await admin.auth.admin.listUsers({ page, perPage });
        const match = list?.users?.find((u: any) => u.email === email);
        if (match) { authUserId = match.id; break; }
        if (!list?.users?.length || list.users.length < perPage) break;
      }
      if (!authUserId) {
        return json({ error: `createUser failed: ${createErr?.message}` }, 500);
      }
      // Reset password so the documented PIN always works.
      await admin.auth.admin.updateUserById(authUserId, { password, email_confirm: true });
    }

    // Ensure a drivers row exists, active and KYC-verified for instant access.
    const { data: existingDriver } = await admin
      .from("drivers")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    let driverId = existingDriver?.id ?? null;
    if (!driverId) {
      const { data: inserted, error: insertErr } = await admin
        .from("drivers")
        .insert({
          user_id: authUserId,
          auth_user_id: authUserId,
          full_name: fullName,
          phone_number: phoneNumber,
          yango_driver_id: `MANAGED_${normalizedPhone}`,
          kyc_status: "verified",
          driver_status: "active",
        })
        .select("id")
        .single();
      if (insertErr) return json({ error: `driver insert failed: ${insertErr.message}` }, 500);
      driverId = inserted.id;
    } else {
      await admin.from("drivers").update({
        kyc_status: "verified",
        driver_status: "active",
        full_name: fullName,
        phone_number: phoneNumber,
      }).eq("id", driverId);
    }

    return json({
      ok: true,
      message: "Test driver ready",
      credentials: { phone: phoneNumber, pin },
      authUserId,
      driverId,
      email,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}