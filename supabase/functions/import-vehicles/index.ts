import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VehicleImportRow {
  model_name: string;
  license_plate: string;
  vehicle_type: string;
  rent_per_day: number;
  // rent_per_week was removed; legacy CSVs containing it are silently ignored.
  uffizio_device_id?: string;
  fleet_group?: string | null;
}

const ALLOWED_FLEET_GROUPS = ['VTC', 'WARREN', 'CARGO', 'NLOOTTO'];

// Normalize fleet group: accept "N'LOOTTO", "n'lootto", "nlootto" → NLOOTTO, etc.
const normalizeFleetGroup = (raw: unknown): string | null => {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const upper = s.toUpperCase().replace(/['’\s-]/g, '');
  if (ALLOWED_FLEET_GROUPS.includes(upper)) return upper;
  return null;
};

interface ImportResult {
  success: boolean;
  imported: number;
  errors: Array<{ row: number; error: string }>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the request is from an authenticated admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user token to verify admin status
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Check if user is admin
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify admin status
    const { data: isAdmin, error: adminError } = await userClient.rpc('is_admin', { _user_id: user.id });
    if (adminError || !isAdmin) {
      console.error('Admin check failed:', adminError);
      return new Response(
        JSON.stringify({ error: 'Only admins can import vehicles' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse the request body
    const { vehicles } = await req.json() as { vehicles: VehicleImportRow[] };
    
    if (!vehicles || !Array.isArray(vehicles) || vehicles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No vehicles data provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Importing ${vehicles.length} vehicles`);

    // Use service role client to bypass RLS
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const result: ImportResult = {
      success: true,
      imported: 0,
      errors: [],
    };

    // Process each vehicle
    for (let i = 0; i < vehicles.length; i++) {
      const vehicle = vehicles[i];
      const rowNum = i + 1;

      // Validate required fields
      if (!vehicle.model_name?.trim()) {
        result.errors.push({ row: rowNum, error: 'Modèle manquant' });
        continue;
      }
      if (!vehicle.license_plate?.trim()) {
        result.errors.push({ row: rowNum, error: 'Immatriculation manquante' });
        continue;
      }
      if (!vehicle.vehicle_type?.trim()) {
        result.errors.push({ row: rowNum, error: 'Type de véhicule manquant' });
        continue;
      }
      if (!vehicle.rent_per_day || vehicle.rent_per_day <= 0) {
        result.errors.push({ row: rowNum, error: 'Tarif journalier invalide' });
        continue;
      }

      // Normalize vehicle type
      const vehicleType = vehicle.vehicle_type.toLowerCase().trim();
      if (!['car', 'bike', 'voiture', 'moto'].includes(vehicleType)) {
        result.errors.push({ row: rowNum, error: `Type "${vehicle.vehicle_type}" invalide (car/bike)` });
        continue;
      }

      const normalizedType = ['car', 'voiture'].includes(vehicleType) ? 'car' : 'bike';

      // Check for duplicate license plate
      const { data: existing } = await adminClient
        .from('vehicles')
        .select('id')
        .eq('license_plate', vehicle.license_plate.trim().toUpperCase())
        .maybeSingle();

      if (existing) {
        result.errors.push({ row: rowNum, error: `Immatriculation "${vehicle.license_plate}" existe déjà` });
        continue;
      }

      // Validate optional fleet_group: if user provided a non-empty value but it
      // doesn't normalize to an allowed category, surface an explicit error so
      // they don't silently lose data.
      const rawFleetGroup = vehicle.fleet_group;
      const hasFleetGroup = rawFleetGroup !== undefined && rawFleetGroup !== null && String(rawFleetGroup).trim() !== '';
      const normalizedFleetGroup = normalizeFleetGroup(rawFleetGroup);
      if (hasFleetGroup && !normalizedFleetGroup) {
        result.errors.push({
          row: rowNum,
          error: `Catégorie "${rawFleetGroup}" invalide (attendu: VTC, WARREN, CARGO, NLOOTTO)`,
        });
        continue;
      }

      // Insert the vehicle (daily rate only; weekly rentals were removed)
      const { error: insertError } = await adminClient
        .from('vehicles')
        .insert({
          model_name: vehicle.model_name.trim(),
          license_plate: vehicle.license_plate.trim().toUpperCase(),
          vehicle_type: normalizedType,
          rent_per_day: vehicle.rent_per_day,
          uffizio_device_id: vehicle.uffizio_device_id?.trim() || null,
          fleet_group: normalizedFleetGroup,
          status: 'available',
        });

      if (insertError) {
        console.error(`Error inserting row ${rowNum}:`, insertError);
        result.errors.push({ row: rowNum, error: insertError.message });
      } else {
        result.imported++;
      }
    }

    result.success = result.errors.length === 0;

    console.log(`Import complete: ${result.imported} imported, ${result.errors.length} errors`);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Import error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});