import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-supabase-client-info',
};

interface CreateManagedDriverPayload {
  fullName: string;
  phoneNumber: string; // full +225 format
  pin: string;         // 4 digits
  email?: string;
  bankName?: string;        // mobile money operator (Wave / Orange / MTN)
  bankAccountNumber?: string; // mobile money phone number
  idProofUrl?: string;
  licenseUrl?: string;
  profileImageUrl?: string; // optional driver profile photo (public URL)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // ---- Verify caller is an active admin ----
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Session admin expirée — reconnectez-vous', code: 'missing_auth' }, 401);
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return json({ error: 'Session admin invalide — reconnectez-vous', code: 'unauthorized' }, 401);
    }

    const { data: isAdmin } = await userClient.rpc('is_admin', { _user_id: user.id });
    if (!isAdmin) {
      return json({ error: 'Accès admin requis', code: 'forbidden' }, 403);
    }

    // ---- Parse payload ----
    const body = await req.json() as CreateManagedDriverPayload & { customerId?: string | null };
    const { fullName, phoneNumber, pin, email, bankName, bankAccountNumber, idProofUrl, licenseUrl, profileImageUrl } = body || {};

    // ---- Resolve customer_id for the new driver ----
    // Restricted admins → forced to their own tenant.
    // Platform owners → may pass `customerId` (active tenant from UI); else null.
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: callerAdmin } = await admin
      .from('admin_users')
      .select('customer_id, is_platform_owner')
      .eq('user_id', user.id)
      .maybeSingle();
    const driverCustomerId: string | null = callerAdmin?.is_platform_owner
      ? (body?.customerId ?? null)
      : (callerAdmin?.customer_id ?? null);

    if (!fullName?.trim()) return json({ error: 'Nom complet requis', code: 'missing_full_name' }, 400);
    if (!phoneNumber?.trim()) return json({ error: 'Numéro de téléphone requis', code: 'missing_phone' }, 400);
    if (!pin || !/^\d{4}$/.test(pin)) return json({ error: 'PIN à 4 chiffres requis', code: 'invalid_pin' }, 400);

    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    // Enforce country-code-aware length: Côte d'Ivoire numbers must have
    // exactly 10 digits after the +225 prefix (so 13 total digits).
    const isIvorian = phoneNumber.trim().startsWith('+225');
    if (isIvorian) {
      const localDigits = normalizedPhone.startsWith('225') ? normalizedPhone.slice(3) : normalizedPhone;
      if (localDigits.length !== 10) {
        return json({
          error: 'Le numéro ivoirien doit comporter exactement 10 chiffres après +225',
          code: 'invalid_phone',
        }, 400);
      }
    } else if (normalizedPhone.length < 8) {
      return json({ error: 'Numéro de téléphone invalide', code: 'invalid_phone' }, 400);
    }

    // Mirror the existing native-auth derivation used by useDriverAuth so
    // the driver can log in with their phone + PIN immediately.
    const syntheticEmail = `driver_${normalizedPhone}@dam-flotte.local`;
    const password = `pin_${pin}_${normalizedPhone}`;

    // (admin client already created above for tenant resolution)

    // ---- Reject duplicates by phone number ----
    const { data: dup } = await admin
      .from('drivers')
      .select('id, full_name')
      .eq('phone_number', phoneNumber)
      .maybeSingle();
    if (dup) {
      return json({
        error: `Ce numéro est déjà utilisé par ${dup.full_name || 'un autre conducteur'}`,
        code: 'duplicate_phone',
        existingDriverId: dup.id,
      }, 409);
    }

    // ---- Reject duplicates by email (when provided) ----
    if (email?.trim()) {
      const { data: emailDup } = await admin
        .from('drivers')
        .select('id, full_name')
        .eq('email', email.trim())
        .maybeSingle();
      if (emailDup) {
        return json({
          error: `Cet email est déjà utilisé par ${emailDup.full_name || 'un autre conducteur'}`,
          code: 'duplicate_email',
          existingDriverId: emailDup.id,
        }, 409);
      }
    }

    // ---- Reject duplicates by Mobile Money number ----
    // Mobile Money numbers are stored on kyc_submissions.bank_account_number.
    // Multiple drivers must NOT share the same Mobile Money phone number.
    if (bankAccountNumber?.trim()) {
      const normalizedMm = bankAccountNumber.replace(/\D/g, '');
      const { data: mmDup } = await admin
        .from('kyc_submissions')
        .select('driver_id, drivers!inner(full_name)')
        .eq('bank_account_number', bankAccountNumber.trim())
        .limit(1)
        .maybeSingle();
      if (mmDup) {
        const ownerName = (mmDup as any).drivers?.full_name || 'un autre conducteur';
        return json({
          error: `Ce numéro Mobile Money est déjà utilisé par ${ownerName}`,
          code: 'duplicate_mobile_money',
          existingDriverId: mmDup.driver_id,
        }, 409);
      }
      // Also fail if it collides with a driver's primary phone number — that
      // would let the same person log in under two identities.
      const { data: phoneClash } = await admin
        .from('drivers')
        .select('id, full_name')
        .eq('phone_number', bankAccountNumber.startsWith('+') ? bankAccountNumber : `+${normalizedMm}`)
        .maybeSingle();
      if (phoneClash) {
        return json({
          error: `Ce numéro Mobile Money est déjà le téléphone principal de ${phoneClash.full_name || 'un autre conducteur'}`,
          code: 'duplicate_mobile_money',
          existingDriverId: phoneClash.id,
        }, 409);
      }
    }

    // ---- Create or update auth user ----
    // Try createUser first. If the email already exists (orphaned auth user
    // from a previous attempt), paginate listUsers to find it and rotate the
    // password. The default listUsers() page size is 50, so we MUST paginate.
    let authUserId: string;
    let recoveredOrphan = false;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: syntheticEmail,
      password,
      email_confirm: true,
      user_metadata: {
        phone_number: phoneNumber,
        full_name: fullName,
        auth_provider: 'native',
        managed_by_admin: true,
      },
    });

    if (created?.user) {
      authUserId = created.user.id;
    } else {
      const msg = (createErr?.message || '').toLowerCase();
      const isDuplicate = msg.includes('already') || msg.includes('exists') || msg.includes('registered');
      if (!isDuplicate) {
        return json({
          error: `Erreur d'authentification: ${createErr?.message || 'inconnue'}`,
          code: 'auth_create_failed',
        }, 500);
      }

      // Walk all pages to find the existing auth user with this synthetic email.
      let foundId: string | null = null;
      const perPage = 200;
      for (let page = 1; page <= 50 && !foundId; page++) {
        const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage });
        if (listErr) {
          return json({
            error: `Impossible de vérifier les comptes existants: ${listErr.message}`,
            code: 'auth_list_failed',
          }, 500);
        }
        const match = list?.users?.find((u: any) => u.email === syntheticEmail);
        if (match) { foundId = match.id; break; }
        if (!list?.users?.length || list.users.length < perPage) break;
      }
      if (!foundId) {
        return json({
          error: 'Conflit: un compte d\'authentification existe déjà mais est introuvable. Contactez le support.',
          code: 'orphan_not_found',
        }, 409);
      }

      await admin.auth.admin.updateUserById(foundId, { password });
      authUserId = foundId;
      recoveredOrphan = true;

      // If the orphan already has a drivers row we should not insert another.
      const { data: orphanDriver } = await admin
        .from('drivers')
        .select('id, full_name, phone_number')
        .eq('auth_user_id', foundId)
        .maybeSingle();
      if (orphanDriver) {
        return json({
          error: `Ce numéro est déjà rattaché à ${orphanDriver.full_name || 'un conducteur existant'}`,
          code: 'duplicate_phone',
          existingDriverId: orphanDriver.id,
        }, 409);
      }
    }

    // ---- Always create driver in pending KYC + inactive state ----
    // Admin must explicitly review KYC and activate the driver afterwards.
    const { data: newDriver, error: driverErr } = await admin
      .from('drivers')
      .insert({
        user_id: authUserId,
        auth_user_id: authUserId,
        full_name: fullName.trim(),
        phone_number: phoneNumber,
        email: email?.trim() || null,
        yango_driver_id: `MANAGED_${normalizedPhone}`,
        kyc_status: 'pending',
        driver_status: 'inactive',
        profile_image_url: profileImageUrl?.trim() || null,
        customer_id: driverCustomerId,
      })
      .select('id')
      .single();

    if (driverErr) {
      // Clean up the auth user we just created so we don't leave orphans
      // (only if we didn't recover one — those are pre-existing).
      if (!recoveredOrphan) {
        try { await admin.auth.admin.deleteUser(authUserId); } catch { /* ignore */ }
      }
      const dbMsg = driverErr.message || '';
      const isUnique = dbMsg.toLowerCase().includes('duplicate') || (driverErr as any).code === '23505';
      return json({
        error: isUnique
          ? 'Ce conducteur existe déjà (numéro ou email en doublon)'
          : `Création du profil échouée: ${dbMsg}`,
        code: isUnique ? 'duplicate_driver' : 'driver_insert_failed',
      }, isUnique ? 409 : 500);
    }

    // ---- Save KYC submission as pending so admin can review it (CH-B2) ----
    // A row is created when the wizard provides Mobile Money (required by the
    // wizard) and/or uploaded documents — otherwise the uploaded files in the
    // kyc-documents bucket would be orphaned with no reviewable submission.
    // The row is tenant-scoped (customer_id) like the driver-side KYC flow
    // (src/pages/driver/KYC.tsx). With no docs and no Mobile Money, no
    // submission is created and the driver simply stays pending KYC.
    let kycSubmissionCreated = false;
    const hasDocs = Boolean(idProofUrl || licenseUrl);
    const hasMobileMoney = Boolean(bankName && bankAccountNumber);
    if (hasDocs || hasMobileMoney) {
      const { error: kycErr } = await admin.from('kyc_submissions').insert({
        driver_id: newDriver.id,
        customer_id: driverCustomerId,
        // Mobile Money lives on kyc_submissions.bank_name/bank_account_number
        // (NOT NULL columns) — defensive fallbacks for docs-only API calls.
        bank_name: bankName?.trim() || 'Non renseigné',
        bank_account_number: bankAccountNumber?.trim() || '',
        // id_proof_url is NOT NULL in DB — fall back to a placeholder when admin
        // hasn't uploaded it yet so the submission record can still be created
        // and reviewed by another admin.
        id_proof_url: idProofUrl || 'pending-upload',
        license_url: licenseUrl || null,
        status: 'pending',
      });
      if (kycErr) console.warn('[create-managed-driver] kyc insert warning:', kycErr.message);
      kycSubmissionCreated = !kycErr;
    }

    return json({
      success: true,
      driverId: newDriver.id,
      credentials: {
        phoneNumber,
        pin,
      },
      kycStatus: 'pending',
      kycSubmissionCreated,
      driverStatus: 'inactive',
      nextStep: 'review_kyc_then_activate',
      recoveredOrphan,
    });
  } catch (e: any) {
    console.error('[create-managed-driver] error:', e);
    return json({
      error: e?.message || 'Erreur interne du serveur',
      code: 'internal_error',
    }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
