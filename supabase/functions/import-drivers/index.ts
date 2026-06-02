import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-info',
};

interface DriverImportRow {
  yango_driver_id: string;
  full_name: string;
  phone_number: string;
  email?: string;
  pin?: string; // optional 4-digit PIN for native auth provisioning
}

interface CreatedCredential {
  full_name: string;
  phone_number: string;
  pin: string;
  pin_generated: boolean; // true if we generated it server-side
}

interface ImportResult {
  success: boolean;
  imported: number;
  errors: Array<{ row: number; error: string }>;
  credentials: CreatedCredential[];
}

const generatePin = (): string => {
  // Avoid trivially weak PINs (1234, 0000, 1111, ...)
  const blacklist = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '0123']);
  for (let i = 0; i < 50; i++) {
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    if (!blacklist.has(pin)) return pin;
  }
  return '8351'; // safe fallback
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: isAdmin, error: adminError } = await userClient.rpc('is_admin', { _user_id: user.id });
    if (adminError || !isAdmin) {
      return new Response(JSON.stringify({ error: 'Only admins can import drivers' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as { drivers: DriverImportRow[]; customerId?: string | null };
    const { drivers } = body;

    if (!drivers || !Array.isArray(drivers) || drivers.length === 0) {
      return new Response(JSON.stringify({ error: 'No drivers data provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Importing ${drivers.length} drivers`);

    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Resolve target tenant: restricted admins → own customer; platform owner → request body.
    const { data: callerAdmin } = await admin
      .from('admin_users')
      .select('customer_id, is_platform_owner')
      .eq('user_id', user.id)
      .maybeSingle();
    const targetCustomerId: string | null = callerAdmin?.is_platform_owner
      ? (body.customerId ?? null)
      : (callerAdmin?.customer_id ?? null);

    const result: ImportResult = {
      success: true,
      imported: 0,
      errors: [],
      credentials: [],
    };

    for (let i = 0; i < drivers.length; i++) {
      const driver = drivers[i];
      const rowNum = i + 1;

      if (!driver.yango_driver_id?.trim()) {
        result.errors.push({ row: rowNum, error: 'ID Yango manquant' });
        continue;
      }
      if (!driver.full_name?.trim()) {
        result.errors.push({ row: rowNum, error: 'Nom complet manquant' });
        continue;
      }
      if (!driver.phone_number?.trim()) {
        result.errors.push({ row: rowNum, error: 'Numéro de téléphone manquant' });
        continue;
      }

      const phoneNumber = driver.phone_number.trim();

      // Reject duplicates by yango_driver_id
      const { data: existingByYango } = await admin
        .from('drivers')
        .select('id')
        .eq('yango_driver_id', driver.yango_driver_id.trim())
        .maybeSingle();
      if (existingByYango) {
        result.errors.push({ row: rowNum, error: `ID Yango "${driver.yango_driver_id}" existe déjà` });
        continue;
      }

      // Reject duplicates by phone
      const { data: existingByPhone } = await admin
        .from('drivers')
        .select('id')
        .eq('phone_number', phoneNumber)
        .maybeSingle();
      if (existingByPhone) {
        result.errors.push({ row: rowNum, error: `Numéro "${phoneNumber}" existe déjà` });
        continue;
      }

      // PIN handling — use provided or generate one
      const providedPin = driver.pin?.toString().trim();
      let pin: string;
      let pinGenerated = false;
      if (providedPin && /^\d{4}$/.test(providedPin)) {
        pin = providedPin;
      } else {
        pin = generatePin();
        pinGenerated = true;
      }

      // Mirror create-managed-driver derivation so the driver can log in immediately.
      const normalizedPhone = phoneNumber.replace(/\D/g, '');
      const syntheticEmail = `driver_${normalizedPhone}@dam-flotte.local`;
      const password = `pin_${pin}_${normalizedPhone}`;

      let authUserId: string | null = null;
      try {
        const { data: existingList } = await admin.auth.admin.listUsers();
        const existing = existingList?.users?.find((u: any) => u.email === syntheticEmail);
        if (existing) {
          await admin.auth.admin.updateUserById(existing.id, { password });
          authUserId = existing.id;
        } else {
          const { data: created, error: createErr } = await admin.auth.admin.createUser({
            email: syntheticEmail,
            password,
            email_confirm: true,
            user_metadata: {
              phone_number: phoneNumber,
              full_name: driver.full_name.trim(),
              auth_provider: 'native',
              managed_by_admin: true,
              imported: true,
            },
          });
          if (createErr) throw createErr;
          authUserId = created.user.id;
        }
      } catch (authErr) {
        console.error(`Row ${rowNum} auth provisioning failed:`, authErr);
        result.errors.push({ row: rowNum, error: `Création du compte auth échouée: ${(authErr as Error).message}` });
        continue;
      }

      const { error: insertError } = await admin.from('drivers').insert({
        yango_driver_id: driver.yango_driver_id.trim(),
        full_name: driver.full_name.trim(),
        phone_number: phoneNumber,
        email: driver.email?.trim() || null,
        kyc_status: 'pending',
        driver_status: 'inactive', // KYC trigger blocks 'active' until verified
        user_id: authUserId,
        auth_user_id: authUserId,
        customer_id: targetCustomerId,
      });

      if (insertError) {
        console.error(`Error inserting row ${rowNum}:`, insertError);
        // Clean up the auth user to avoid orphans
        if (authUserId) {
          try { await admin.auth.admin.deleteUser(authUserId); } catch { /* ignore */ }
        }
        result.errors.push({ row: rowNum, error: insertError.message });
        continue;
      }

      result.imported++;
      result.credentials.push({
        full_name: driver.full_name.trim(),
        phone_number: phoneNumber,
        pin,
        pin_generated: pinGenerated,
      });
    }

    result.success = result.errors.length === 0;
    console.log(`Import complete: ${result.imported} imported, ${result.errors.length} errors`);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Import error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
