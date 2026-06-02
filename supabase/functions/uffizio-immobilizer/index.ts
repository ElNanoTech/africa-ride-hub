// Uffizio immobilizer stub for MVP.
// Logs intent and updates rental status. Real Uffizio API call wired separately.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

interface ImmobilizeRequest {
  rental_id: string
  action: 'immobilize' | 'release'
  reason?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Auth check — must be an authenticated admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ success: false, error: 'invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Require super_admin or manager
    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('role_key, is_active')
      .eq('user_id', userData.user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (!adminRow || !['super_admin', 'manager'].includes(adminRow.role_key ?? '')) {
      return new Response(JSON.stringify({ success: false, error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = (await req.json()) as ImmobilizeRequest
    if (!body?.rental_id || !body?.action) {
      return new Response(JSON.stringify({ success: false, error: 'rental_id and action required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!['immobilize', 'release'].includes(body.action)) {
      return new Response(JSON.stringify({ success: false, error: 'invalid action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch rental + vehicle for logging
    const { data: rental, error: rentalErr } = await supabase
      .from('rentals')
      .select('id, status, driver_id, vehicle_id, vehicles(id, license_plate, uffizio_device_id)')
      .eq('id', body.rental_id)
      .maybeSingle()

    if (rentalErr || !rental) {
      return new Response(JSON.stringify({ success: false, error: 'rental not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // MVP: log intent only. Real Uffizio API call to be wired later.
    console.log(JSON.stringify({
      event: 'uffizio_immobilizer_intent',
      action: body.action,
      rental_id: body.rental_id,
      vehicle_id: rental.vehicle_id,
      vehicle: rental.vehicles,
      reason: body.reason,
      actor_user_id: userData.user.id,
      timestamp: new Date().toISOString(),
    }))

    // For 'immobilize', call disable_rental_vehicle RPC to flip rental status
    if (body.action === 'immobilize') {
      const { error: rpcErr } = await supabase.rpc('disable_rental_vehicle', {
        p_rental_id: body.rental_id,
        p_reason: body.reason ?? 'Immobilisation distante (MVP stub)',
      })
      if (rpcErr) {
        return new Response(JSON.stringify({ success: false, error: rpcErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Audit log
    await supabase.from('admin_audit_logs').insert({
      admin_user_id: userData.user.id,
      action: `uffizio_${body.action}`,
      entity_type: 'rental',
      entity_id: body.rental_id,
      details: { action: body.action, reason: body.reason, vehicle_id: rental.vehicle_id },
    })

    return new Response(JSON.stringify({
      success: true,
      action: body.action,
      rental_id: body.rental_id,
      note: 'MVP stub — intent logged. Real Uffizio API call not yet wired.',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
