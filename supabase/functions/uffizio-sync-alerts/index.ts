// Pulls Uffizio driving alerts every 15 min, dedupes by hash, attributes
// each alert to the active rental at that time, and applies score deltas
// from driving_event_weights.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const WINDOW_MS = 20 * 60 * 1000 // 20 min lookback (cron runs every 15 min — overlap is intentional, hash dedupes)
const PLATE_BATCH = 50
const TOKEN_KEY = 'uffizio_token'

function normalizeBaseUrl(raw: string): string {
  let u = raw.trim()
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`
  return u.replace(/\/+$/, '')
}

// "17-01-2022 10:45:14" -> Date (DD-MM-YYYY HH:mm:ss, treated as UTC since
// Uffizio server time zone isn't documented; admins can adjust later).
function parseUffizioDate(s: string): Date | null {
  if (!s) return null
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  const [, dd, mm, yyyy, hh, mi, ss] = m
  return new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +mi, +ss))
}

function parseDuration(s: string | undefined): number | null {
  if (!s) return null
  const m = s.match(/^(\d{2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  return +m[1] * 3600 + +m[2] * 60 + +m[3]
}

async function md5Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s)
  const digest = await crypto.subtle.digest('MD5', buf)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function getCachedToken(supabase: any, baseUrl: string, username: string, password: string, force = false): Promise<string> {
  if (!force) {
    const { data } = await supabase
      .from('platform_settings')
      .select('setting_value')
      .eq('setting_key', TOKEN_KEY)
      .maybeSingle()
    const cached = data?.setting_value as { token?: string; expires_at?: string } | undefined
    if (cached?.token && cached.expires_at) {
      const remaining = new Date(cached.expires_at).getTime() - Date.now()
      if (remaining > 5 * 60 * 1000) return cached.token
    }
  }
  const res = await fetch(`${baseUrl}/webservice?token=generateAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = await res.json().catch(() => ({ result: 0, message: 'parse error' }))
  if (data.result !== 1 || !data.data?.token) {
    throw new Error(`Uffizio auth failed: ${data.message || 'unknown'}`)
  }
  const token: string = data.data.token
  await supabase.from('platform_settings').upsert(
    {
      setting_key: TOKEN_KEY,
      setting_value: { token, fetched_at: new Date().toISOString(), expires_at: new Date(Date.now() + 55 * 60 * 1000).toISOString() } as any,
      description: 'Cached Uffizio access token (auto-refreshed every ~55 min)',
    },
    { onConflict: 'setting_key' }
  )
  return token
}

async function callGetAlertData(baseUrl: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${baseUrl}/webservice?token=getAlertData`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { result: 0, message: `non-JSON: ${text.slice(0, 200)}` } }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const baseUrl = normalizeBaseUrl(Deno.env.get('UFFIZIO_SERVER_URL') ?? '')
  const username = Deno.env.get('UFFIZIO_USERNAME') ?? ''
  const password = Deno.env.get('UFFIZIO_PASSWORD') ?? ''
  if (!baseUrl || !username || !password) {
    return new Response(JSON.stringify({ success: false, error: 'Missing Uffizio credentials' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Optional override window via POST body (for manual backfills); default 20-min trailing
  let fromMs = Date.now() - WINDOW_MS
  let toMs = Date.now()
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      if (typeof body?.from_ms === 'number') fromMs = body.from_ms
      if (typeof body?.to_ms === 'number') toMs = body.to_ms
    } catch { /* ignore */ }
  }
  if (toMs - fromMs > 24 * 3600 * 1000) {
    return new Response(JSON.stringify({ success: false, error: 'Window > 24h not supported by Uffizio' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 1) Plates that currently have an active rental — only worth querying these.
  const today = new Date().toISOString().slice(0, 10)
  const { data: rentalRows, error: rentalErr } = await supabase
    .from('rentals')
    .select('id, driver_id, vehicle_id, customer_id, start_date, end_date, status, vehicles!inner(license_plate)')
    .eq('status', 'active')
    .lte('start_date', today)

  if (rentalErr) {
    return new Response(JSON.stringify({ success: false, error: rentalErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Build plate -> [rentals] map (a plate may have multiple historical rentals; pick the one covering occurred_at)
  const plates = new Set<string>()
  type RentalCtx = { id: string; driver_id: string; vehicle_id: string; customer_id: string | null; start_date: string; end_date: string | null }
  const rentalsByPlate = new Map<string, RentalCtx[]>()
  for (const r of rentalRows ?? []) {
    const plate = (r as any).vehicles?.license_plate?.toUpperCase()?.replace(/\s+/g, '')
    if (!plate) continue
    plates.add(plate)
    const arr = rentalsByPlate.get(plate) ?? []
    arr.push({
      id: r.id as string,
      driver_id: r.driver_id as string,
      vehicle_id: r.vehicle_id as string,
      customer_id: (r.customer_id as string) ?? null,
      start_date: r.start_date as string,
      end_date: (r.end_date as string) ?? null,
    })
    rentalsByPlate.set(plate, arr)
  }

  if (plates.size === 0) {
    return new Response(JSON.stringify({ success: true, plates: 0, alerts: 0, inserted: 0, message: 'No active rentals' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 2) Weights map
  const { data: weightRows } = await supabase
    .from('driving_event_weights')
    .select('alert_type_id, alert_name, score_delta, active')
  const weightsByName = new Map<string, { id: number; delta: number; active: boolean }>()
  for (const w of weightRows ?? []) {
    weightsByName.set((w.alert_name as string).toLowerCase(), {
      id: w.alert_type_id as number,
      delta: w.score_delta as number,
      active: w.active as boolean,
    })
  }

  // 3) Token (with one force-refresh on "invalid/expired")
  let token = await getCachedToken(supabase, baseUrl, username, password)

  const plateList = [...plates]
  const allAlerts: any[] = []
  let orphanCount = 0

  for (let i = 0; i < plateList.length; i += PLATE_BATCH) {
    const batch = plateList.slice(i, i + PLATE_BATCH)
    const payload = {
      username, password,
      from: fromMs, to: toMs,
      vehicle: batch,
      imei_number: [],
      alert_id: [],
      format: 'json',
      Access_token: token,
    }
    let resp = await callGetAlertData(baseUrl, payload)
    if (resp.result !== 1 && /token is invalid|expired/i.test(resp.message ?? '')) {
      token = await getCachedToken(supabase, baseUrl, username, password, true)
      resp = await callGetAlertData(baseUrl, { ...payload, Access_token: token })
    }
    if (resp.result === 1 && Array.isArray(resp.data)) {
      allAlerts.push(...resp.data)
    } else if (resp.result !== 1 && !/no records/i.test(resp.message ?? '')) {
      console.warn(`Uffizio batch ${i / PLATE_BATCH} error: ${resp.message}`)
    }
  }

  // 4) Convert each alert -> driving_events row
  let inserted = 0
  let scoreEventsInserted = 0
  for (const a of allAlerts) {
    const plateRaw: string = (a.vehicle_no ?? '').toString()
    const plate = plateRaw.toUpperCase().replace(/\s+/g, '')
    const occurred = parseUffizioDate(a.alert_generation)
    if (!plate || !occurred) continue

    // Find the rental covering this moment
    const candidates = rentalsByPlate.get(plate) ?? []
    const occDate = occurred.toISOString().slice(0, 10)
    const ctx = candidates.find(r =>
      r.start_date <= occDate && (!r.end_date || r.end_date >= occDate)
    )
    if (!ctx) {
      orphanCount++
      continue
    }

    const weight = weightsByName.get((a.alert_type ?? '').toString().toLowerCase())
    const scoreDelta = weight?.active ? weight.delta : 0
    const alertTypeId = weight?.id ?? null

    const hash = await md5Hex(`${plate}|${a.alert_generation}|${a.alert_type}`)

    const { data: insertedRow, error: insErr } = await supabase
      .from('driving_events')
      .insert({
        driver_id: ctx.driver_id,
        vehicle_id: ctx.vehicle_id,
        rental_id: ctx.id,
        customer_id: ctx.customer_id,
        alert_type_id: alertTypeId,
        alert_name: a.alert_type ?? null,
        alert_info: a.alert_info ?? null,
        alert_location: a.alert_location ?? null,
        duration_seconds: parseDuration(a.alert_duration) ?? null,
        occurred_at: occurred.toISOString(),
        score_delta_applied: scoreDelta,
        uffizio_event_hash: hash,
        raw: a,
      })
      .select('id')
      .single()

    if (insErr) {
      // Duplicate hash = already ingested in a prior overlapping window
      if ((insErr as any).code !== '23505') console.warn(`insert err: ${insErr.message}`)
      continue
    }
    inserted++

    if (scoreDelta !== 0) {
      const { error: seErr } = await supabase.from('score_events').insert({
        driver_id: ctx.driver_id,
        score_delta: scoreDelta,
        reason: `${a.alert_type} · ${a.alert_location ?? ''}`.slice(0, 200),
        source: 'uffizio',
        driving_event_id: insertedRow!.id,
      })
      if (!seErr) scoreEventsInserted++
    }
  }

  return new Response(JSON.stringify({
    success: true,
    window: { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() },
    plates_queried: plates.size,
    alerts_received: allAlerts.length,
    events_inserted: inserted,
    score_events_inserted: scoreEventsInserted,
    orphan_alerts: orphanCount,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
