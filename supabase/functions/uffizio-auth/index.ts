// Uffizio token cache + refresh helper.
// Caches the access token in platform_settings(key='uffizio_token') with
// an expiry ~55 min out (token TTL is 1h per real-world behavior, despite
// the doc saying "5 years"). Callers can pass force=true to bypass cache
// after a "Token is invalid or expired" failure.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const SETTING_KEY = 'uffizio_token'
const TTL_MS = 55 * 60 * 1000 // refresh slightly before the 1h server expiry
const REFRESH_WINDOW_MS = 5 * 60 * 1000 // refresh if <5 min remain

interface CachedToken {
  token: string
  expires_at: string // ISO
  fetched_at: string
}

function normalizeBaseUrl(raw: string): string {
  let u = raw.trim()
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`
  try {
    // Strip any path/query/hash — only origin is the API base.
    const parsed = new URL(u)
    // Bare-IP Uffizio servers ship without a TLS cert; force http to avoid
    // "invalid peer certificate" errors when the secret was pasted as https://.
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname)
    const protocol = isIp ? 'http:' : parsed.protocol
    return `${protocol}//${parsed.host}`
  } catch {
    return u.replace(/\/+$/, '')
  }
}

async function fetchFreshToken(baseUrl: string, username: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/webservice?token=generateAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch { throw new Error(`Uffizio auth: non-JSON response: ${text.slice(0, 200)}`) }
  if (data.result !== 1 || !data.data?.token) {
    throw new Error(`Uffizio auth failed: ${data.message || 'unknown error'}`)
  }
  return data.data.token as string
}

export async function getUffizioToken(opts: { force?: boolean } = {}): Promise<{ token: string; baseUrl: string }> {
  const baseUrl = normalizeBaseUrl(Deno.env.get('UFFIZIO_SERVER_URL') ?? '')
  const username = Deno.env.get('UFFIZIO_USERNAME') ?? ''
  const password = Deno.env.get('UFFIZIO_PASSWORD') ?? ''
  if (!baseUrl || !username || !password) {
    throw new Error('Missing UFFIZIO_SERVER_URL / UFFIZIO_USERNAME / UFFIZIO_PASSWORD')
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  if (!opts.force) {
    const { data: row } = await supabase
      .from('platform_settings')
      .select('setting_value')
      .eq('setting_key', SETTING_KEY)
      .maybeSingle()

    const cached = row?.setting_value as CachedToken | undefined
    if (cached?.token && cached.expires_at) {
      const remaining = new Date(cached.expires_at).getTime() - Date.now()
      if (remaining > REFRESH_WINDOW_MS) {
        return { token: cached.token, baseUrl }
      }
    }
  }

  const token = await fetchFreshToken(baseUrl, username, password)
  const now = new Date()
  const value: CachedToken = {
    token,
    fetched_at: now.toISOString(),
    expires_at: new Date(now.getTime() + TTL_MS).toISOString(),
  }

  await supabase.from('platform_settings').upsert(
    {
      setting_key: SETTING_KEY,
      setting_value: value as any,
      description: 'Cached Uffizio access token (auto-refreshed every ~55 min)',
    },
    { onConflict: 'setting_key' }
  )

  return { token, baseUrl }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    // SECURITY: Only authenticated admins may retrieve the live Uffizio token.
    // Anyone with this token can read/manipulate the entire GPS fleet.
    // Allow service-role / cron callers (other edge functions) to bypass the
    // user check by presenting the service-role key directly.
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? ''
    const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    let isInternalCall = bearer && serviceKey && bearer === serviceKey

    if (!isInternalCall) {
      const { authenticate, isAdmin, unauthorized, forbidden } = await import('../_shared/auth.ts')
      const ctx = await authenticate(req)
      if (!ctx) return unauthorized(corsHeaders)
      const admin = await isAdmin(ctx.supabaseAdmin, ctx.userId)
      if (!admin) return forbidden(corsHeaders, 'Admin access required')
    }

    let force = false
    if (req.method === 'POST') {
      try { const body = await req.json(); force = !!body?.force } catch { /* ignore */ }
    }
    const { token, baseUrl } = await getUffizioToken({ force })
    return new Response(JSON.stringify({ success: true, token, baseUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
