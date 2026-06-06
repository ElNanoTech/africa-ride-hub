import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json().catch(() => ({}));
    const onlyId: string | undefined = body?.violation_id;

    let query = supabase
      .from('traffic_violations')
      .select('id, license_plate, violation_date, vehicle_id, driver_id, customer_id')
      .is('driver_id', null);
    if (onlyId) query = query.eq('id', onlyId);

    const { data: violations, error } = await query.limit(500);
    if (error) throw error;

    let assigned = 0;
    let unmatched = 0;

    for (const v of violations || []) {
      // 1. Find vehicle by plate (if not already set)
      let vehicleId = v.vehicle_id;
      let customerId = v.customer_id;
      if (!vehicleId) {
        const { data: veh } = await supabase
          .from('vehicles')
          .select('id, customer_id')
          .ilike('license_plate', v.license_plate)
          .maybeSingle();
        if (veh) {
          vehicleId = veh.id;
          customerId = customerId || veh.customer_id;
        }
      }
      if (!vehicleId) { unmatched++; continue; }

      // 2. Find active rental at violation_date
      const { data: rental } = await supabase
        .from('rentals')
        .select('id, driver_id, customer_id')
        .eq('vehicle_id', vehicleId)
        .lte('start_date', v.violation_date)
        .or(`end_date.is.null,end_date.gte.${v.violation_date}`)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      const patch: Record<string, unknown> = {
        vehicle_id: vehicleId,
        customer_id: customerId,
      };
      if (rental) {
        patch.driver_id = rental.driver_id;
        patch.rental_id = rental.id;
        patch.attribution_method = 'rental';
        patch.customer_id = rental.customer_id || customerId;
        assigned++;
      } else {
        patch.attribution_method = 'unassigned';
        unmatched++;
      }

      await supabase.from('traffic_violations').update(patch).eq('id', v.id);
    }

    return new Response(
      JSON.stringify({ ok: true, processed: violations?.length ?? 0, assigned, unmatched }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});