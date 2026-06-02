// Admin-only endpoint to update a managed driver's contact details, mobile
// money information, or reset their PIN. PIN reset rotates the synthetic auth
// password derived from phone+PIN so the driver can immediately log back in.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-supabase-client-info',
};

interface UpdatePayload {
  driverId: string;
  // Optional updates — only provided fields are touched.
  fullName?: string;
  email?: string | null;
  phoneNumber?: string;          // full +225 format
  mobileMoneyOperator?: string;  // Wave / Orange Money / MTN / Moov
  mobileMoneyNumber?: string;    // phone associated with mobile money
  profileImageUrl?: string | null;
  driverStatus?: 'active' | 'suspended' | 'inactive';
  activeVehicleId?: string | null;
  newPin?: string;               // 4 digits — when present, rotates auth password
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { data: isAdmin } = await userClient.rpc('is_admin', { _user_id: user.id });
    if (!isAdmin) return json({ error: 'Admin access required' }, 403);

    const body = (await req.json()) as UpdatePayload;
    const {
      driverId,
      fullName,
      email,
      phoneNumber,
      mobileMoneyOperator,
      mobileMoneyNumber,
      profileImageUrl,
      driverStatus,
      activeVehicleId,
      newPin,
    } = body || {};

    if (!driverId) return json({ error: 'driverId requis' }, 400);
    if (newPin !== undefined && !/^\d{4}$/.test(newPin)) {
      return json({ error: 'PIN doit comporter 4 chiffres' }, 400);
    }
    if (phoneNumber !== undefined) {
      const digits = phoneNumber.replace(/\D/g, '');
      const isIvorian = phoneNumber.trim().startsWith('+225');
      if (isIvorian) {
        const localDigits = digits.startsWith('225') ? digits.slice(3) : digits;
        if (localDigits.length !== 10) {
          return json({ error: 'Le numéro ivoirien doit comporter exactement 10 chiffres après +225', code: 'invalid_phone' }, 400);
        }
      } else if (digits.length < 8) {
        return json({ error: 'Téléphone invalide', code: 'invalid_phone' }, 400);
      }
    }
    if ((mobileMoneyOperator && !mobileMoneyNumber) || (!mobileMoneyOperator && mobileMoneyNumber)) {
      return json({ error: 'Opérateur et numéro Mobile Money doivent être fournis ensemble' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Load driver
    const { data: driver, error: driverErr } = await admin
      .from('drivers')
      .select('id, user_id, auth_user_id, phone_number, email, full_name, yango_driver_id')
      .eq('id', driverId)
      .maybeSingle();
    if (driverErr) throw driverErr;
    if (!driver) return json({ error: 'Conducteur introuvable' }, 404);

    const authUserId: string | null = driver.auth_user_id ?? driver.user_id ?? null;

    // ---- Reject duplicate phone number ----
    if (phoneNumber !== undefined && phoneNumber !== driver.phone_number) {
      const { data: phoneDup } = await admin
        .from('drivers')
        .select('id, full_name')
        .eq('phone_number', phoneNumber)
        .neq('id', driverId)
        .maybeSingle();
      if (phoneDup) {
        return json({
          error: `Ce numéro est déjà utilisé par ${phoneDup.full_name || 'un autre conducteur'}`,
          code: 'duplicate_phone',
        }, 409);
      }
    }

    // ---- Reject duplicate Mobile Money number ----
    if (mobileMoneyNumber) {
      const { data: mmDup } = await admin
        .from('kyc_submissions')
        .select('driver_id, drivers!inner(full_name)')
        .eq('bank_account_number', mobileMoneyNumber.trim())
        .neq('driver_id', driverId)
        .limit(1)
        .maybeSingle();
      if (mmDup) {
        const ownerName = (mmDup as any).drivers?.full_name || 'un autre conducteur';
        return json({
          error: `Ce numéro Mobile Money est déjà utilisé par ${ownerName}`,
          code: 'duplicate_mobile_money',
        }, 409);
      }
    }

    // ---- Validate driver_status ----
    if (driverStatus !== undefined && !['active', 'suspended', 'inactive'].includes(driverStatus)) {
      return json({ error: 'Statut de conducteur invalide' }, 400);
    }

    // ---- Update drivers row ----
    const driverUpdates: Record<string, unknown> = {};
    if (phoneNumber !== undefined) driverUpdates.phone_number = phoneNumber;
    if (email !== undefined) driverUpdates.email = email?.trim() || null;
    if (fullName !== undefined && fullName.trim()) driverUpdates.full_name = fullName.trim();
    if (profileImageUrl !== undefined) driverUpdates.profile_image_url = profileImageUrl || null;
    if (driverStatus !== undefined) driverUpdates.driver_status = driverStatus;
    if (activeVehicleId !== undefined) driverUpdates.active_vehicle_id = activeVehicleId || null;

    if (Object.keys(driverUpdates).length > 0) {
      const { error: updErr } = await admin.from('drivers').update(driverUpdates).eq('id', driverId);
      if (updErr) throw updErr;
    }

    // ---- Update mobile money on the latest KYC submission ----
    if (mobileMoneyOperator && mobileMoneyNumber) {
      const { data: latestKyc } = await admin
        .from('kyc_submissions')
        .select('id')
        .eq('driver_id', driverId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestKyc?.id) {
        const { error: kycErr } = await admin
          .from('kyc_submissions')
          .update({
            bank_name: mobileMoneyOperator,
            bank_account_number: mobileMoneyNumber,
          })
          .eq('id', latestKyc.id);
        if (kycErr) throw kycErr;
      } else {
        // No existing submission — create a pending one so the values are stored.
        const { error: kycInsErr } = await admin.from('kyc_submissions').insert({
          driver_id: driverId,
          bank_name: mobileMoneyOperator,
          bank_account_number: mobileMoneyNumber,
          id_proof_url: 'pending-upload',
          status: 'pending',
        });
        if (kycInsErr) throw kycInsErr;
      }
    }

    // ---- Reset PIN and/or sync auth credentials ----
    // The native auth scheme derives the auth user's email and password from
    // phone + PIN. Whenever phone OR PIN changes we must rotate both so the
    // driver can keep logging in with their phone + (new) PIN.
    if (authUserId && (newPin !== undefined || phoneNumber !== undefined)) {
      const finalPhone = phoneNumber ?? driver.phone_number;
      const normalizedPhone = String(finalPhone).replace(/\D/g, '');

      // We can't read the current PIN — if only the phone changed we must
      // require a newPin too (otherwise the password would no longer match
      // the phone-based scheme).
      if (newPin === undefined && phoneNumber !== undefined) {
        return json({
          error: 'Pour modifier le téléphone, vous devez aussi définir un nouveau PIN.',
        }, 400);
      }

      const pinToUse = newPin!;
      const newSyntheticEmail = `driver_${normalizedPhone}@dam-flotte.local`;
      const newPassword = `pin_${pinToUse}_${normalizedPhone}`;

      const { error: authErr } = await admin.auth.admin.updateUserById(authUserId, {
        email: newSyntheticEmail,
        password: newPassword,
        email_confirm: true,
      });
      if (authErr) throw authErr;
    }

    return json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur interne';
    console.error('[admin-update-driver]', message);
    return json({ error: message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
