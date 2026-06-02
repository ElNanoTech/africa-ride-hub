import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

async function getAccessToken(baseUrl: string, username: string, password: string): Promise<string> {
  const tokenRes = await fetch(`${baseUrl}/webservice?token=generateAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, token: 'generateAccessToken' })
  })
  const tokenText = await tokenRes.text()
  let tokenData: any
  try { tokenData = JSON.parse(tokenText) } catch { tokenData = { result: 0 } }

  if (tokenData.result !== 1 || !tokenData.data?.token) {
    throw new Error(`Auth failed: ${tokenData.message || tokenText.substring(0, 200)}`)
  }
  return tokenData.data.token
}

async function fetchLiveVehicles(baseUrl: string, accessToken: string, username: string, password: string) {
  let vehicles: any[] = []
  let rawResponse = ''
  let method = ''

  // Strategy 1: getVTSVehicleLiveInformation with auth-code header (primary, with retry)
  for (let attempt = 0; attempt < 3 && vehicles.length === 0; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`Strategy 1 retry ${attempt}/2, waiting ${attempt * 500}ms...`)
        await new Promise(r => setTimeout(r, attempt * 500))
      }
      const res = await fetch(`${baseUrl}/webservice?token=getVTSVehicleLiveInformation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'auth-code': accessToken },
      })
      rawResponse = await res.text()
      console.log(`Strategy 1 attempt ${attempt} status=${res.status} responseLen=${rawResponse.length} preview=${rawResponse.substring(0, 300)}`)
      if (!rawResponse.includes('Deprecated') && !rawResponse.includes('deprecated')) {
        const data = JSON.parse(rawResponse)
        console.log(`Strategy 1 parsed keys: ${Object.keys(data).join(',')} result=${data.result} root_keys=${data.root ? Object.keys(data.root).join(',') : 'none'}`)
        if (data.root?.VehicleData) {
          vehicles = Array.isArray(data.root.VehicleData) ? data.root.VehicleData : [data.root.VehicleData]
          method = 'getVTSVehicleLiveInformation'
        } else if (data.success !== false && data.result !== 0) {
          vehicles = Array.isArray(data) ? data : data.data ? (Array.isArray(data.data) ? data.data : [data.data]) : []
          if (vehicles.length > 0) method = 'getVTSVehicleLiveInformation'
        }
      }
    } catch (e) { console.log(`Strategy 1 attempt ${attempt} error: ${e.message}`) }
  }

  // Strategy 2: /tracking endpoint
  if (vehicles.length === 0) {
    try {
      const res = await fetch(`${baseUrl}/tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'auth-code': accessToken, 'method': 'getLiveData' },
        body: JSON.stringify({ format: 'json' })
      })
      rawResponse = await res.text()
      console.log(`Strategy 2 status=${res.status} responseLen=${rawResponse.length} preview=${rawResponse.substring(0, 300)}`)
      if (!rawResponse.includes('Deprecated')) {
        const data = JSON.parse(rawResponse)
        console.log(`Strategy 2 parsed keys: ${Object.keys(data).join(',')}`)
        if (data.success !== false && data.root) {
          vehicles = Array.isArray(data.root.vehicle) ? data.root.vehicle : Array.isArray(data.root) ? data.root : []
          method = '/tracking'
        }
      }
    } catch (e) { console.log(`Strategy 2 error: ${e.message}`) }
  }

  // Strategy 3: getLiveData with access_token param
  if (vehicles.length === 0) {
    try {
      const url = `${baseUrl}/webservice?token=getLiveData&user=${encodeURIComponent(username)}&pass=${encodeURIComponent(password)}&access_token=${encodeURIComponent(accessToken)}&format=json`
      const res = await fetch(url, { method: 'GET' })
      rawResponse = await res.text()
      console.log(`Strategy 3 status=${res.status} responseLen=${rawResponse.length} preview=${rawResponse.substring(0, 300)}`)
      if (!rawResponse.includes('Deprecated')) {
        const data = JSON.parse(rawResponse)
        console.log(`Strategy 3 parsed keys: ${Object.keys(data).join(',')}`)
        if (data.root?.VehicleData) {
          vehicles = Array.isArray(data.root.VehicleData) ? data.root.VehicleData : [data.root.VehicleData]
          method = 'getLiveData-user-pass'
        }
      }
    } catch (e) { console.log(`Strategy 3 error: ${e.message}`) }
  }

  return { vehicles, rawResponse, method }
}

function normalizeVehicle(v: any) {
  return {
    vehicle_no: v.Vehicle_Name || v.vehicle_no || v.vehicleNo || v.vehicle_name || v.vehicleNumber || '',
    imei_no: v.IMEI || v.imei_no || v.imeiNo || v.vehicleNumber || '',
    lat: parseFloat(v.lat || v.Lat || v.latitude || v.Latitude || 0),
    lng: parseFloat(v.lng || v.Lng || v.long || v.Long || v.longitude || v.Longitude || v.lon || 0),
    speed: parseFloat(v.speed || v.Speed || 0),
    fuel_level: v.fuel_level ? parseFloat(v.fuel_level) : undefined,
    status: v.status || v.Status || (parseFloat(v.speed || v.Speed || 0) > 0 ? 'moving' : v.ignition === '1' || v.Ignition === 'ON' ? 'idle' : 'offline'),
    heading: v.heading || v.Heading ? parseFloat(v.heading || v.Heading) : undefined,
    last_update: v.last_update || v.last_updated || v.Last_Updated || v.datetime || v.gps_datetime || new Date().toISOString(),
    device_name: v.device_name || v.Device_Name || v.deviceName || '',
    driver_name: v.driver_name || v.Driver_Name || v.driverName || '',
    ignition: v.ignition || v.Ignition || v.ig || '',
    company: v.Company || v.company || '',
  }
}

// Haversine distance in meters
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const serverUrl = Deno.env.get('UFFIZIO_SERVER_URL')
    const username = Deno.env.get('UFFIZIO_USERNAME')
    const password = Deno.env.get('UFFIZIO_PASSWORD')

    if (!serverUrl || !username || !password) {
      return new Response(
        JSON.stringify({ error: 'Uffizio credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let baseUrl = serverUrl.trim()
    if (!/^https?:\/\//i.test(baseUrl)) baseUrl = 'http://' + baseUrl
    try {
      const parsed = new URL(baseUrl)
      // Bare-IP Uffizio servers have no TLS cert — force http to avoid
      // "invalid peer certificate" failures when secret was pasted as https://.
      const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname)
      const protocol = isIp ? 'http:' : parsed.protocol
      baseUrl = `${protocol}//${parsed.host}`
    } catch {
      baseUrl = baseUrl.replace(/\/+$/, '')
    }

    const body = await req.json().catch(() => ({}))
    const action = body.action || 'getLiveData'

    console.log(`Uffizio: action=${action}, baseUrl=${baseUrl}`)

    const accessToken = await getAccessToken(baseUrl, username, password)
    console.log('Auth successful, token obtained')

    // ===== getLiveData =====
    if (action === 'getLiveData') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, serviceRoleKey)

      const { vehicles, rawResponse, method } = await fetchLiveVehicles(baseUrl, accessToken, username, password)
      console.log(`Found ${vehicles.length} vehicles via ${method || 'none'}`)

      const mapped = vehicles.map(normalizeVehicle)

      // Upsert into vehicle_positions for Realtime push to admin UI
      if (mapped.length > 0) {
        const upsertRows = mapped.map(v => ({
          vehicle_no: v.vehicle_no,
          imei_no: v.imei_no || v.vehicle_no,
          lat: v.lat,
          lng: v.lng,
          speed: v.speed,
          status: v.speed > 0 ? 'moving' : (v.ignition === '1' || v.ignition === 'ON' || v.ignition === 'on') ? 'idle' : 'offline',
          heading: v.heading,
          last_update: v.last_update,
          device_name: v.device_name,
          driver_name: v.driver_name,
          ignition: v.ignition,
          company: v.company,
          fuel_level: v.fuel_level,
          synced_at: new Date().toISOString(),
        }))

        const { error: upsertError } = await supabase
          .from('vehicle_positions')
          .upsert(upsertRows, { onConflict: 'imei_no' })

        if (upsertError) {
          console.error('vehicle_positions upsert error:', upsertError.message)
        } else {
          console.log(`Upserted ${upsertRows.length} vehicle positions`)
        }

        // Append to history table
        const historyRows = upsertRows
          .filter(v => v.lat !== 0 && v.lng !== 0)
          .map(v => ({
            vehicle_no: v.vehicle_no,
            imei_no: v.imei_no,
            lat: v.lat,
            lng: v.lng,
            speed: v.speed,
            status: v.status,
            heading: v.heading,
            ignition: v.ignition,
            recorded_at: v.last_update || new Date().toISOString(),
            synced_at: v.synced_at,
          }))

        if (historyRows.length > 0) {
          const { error: histError } = await supabase
            .from('vehicle_location_history')
            .insert(historyRows)
          if (histError) {
            console.error('History insert error:', histError.message)
          } else {
            console.log(`Inserted ${historyRows.length} history records`)
          }
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            vehicles: mapped, 
            count: mapped.length, 
            method,
            source: 'api',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // FALLBACK: API returned 0 vehicles (rate-limited/deprecated) → serve from cache
      console.log('API returned 0 vehicles, falling back to cached vehicle_positions')
      const { data: cachedData, error: cacheError } = await supabase
        .from('vehicle_positions')
        .select('*')
        .order('vehicle_no')

      if (cacheError || !cachedData || cachedData.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            vehicles: [], 
            count: 0, 
            error: 'API temporairement indisponible (limite de débit). Aucune donnée en cache.',
            raw_response_preview: rawResponse.substring(0, 500),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const cachedMapped = cachedData.map((row: any) => ({
        vehicle_no: row.vehicle_no,
        imei_no: row.imei_no,
        lat: row.lat,
        lng: row.lng,
        speed: row.speed,
        status: row.status,
        heading: row.heading,
        last_update: row.last_update,
        device_name: row.device_name,
        driver_name: row.driver_name,
        ignition: row.ignition,
        company: row.company,
        fuel_level: row.fuel_level,
        synced_at: row.synced_at,
      }))

      console.log(`Serving ${cachedMapped.length} vehicles from cache`)
      return new Response(
        JSON.stringify({ 
          success: true, 
          vehicles: cachedMapped, 
          count: cachedMapped.length, 
          method: 'cache',
          source: 'cache',
          cache_age_seconds: cachedData[0]?.synced_at 
            ? Math.floor((Date.now() - new Date(cachedData[0].synced_at).getTime()) / 1000) 
            : null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ===== getAlertData =====
    if (action === 'getAlertData') {
      const fromDate = body.from_date || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const toDate = body.to_date || new Date().toISOString().split('T')[0]

      const alertUrl = `${baseUrl}/webservice?token=getAlertData&format=json&from_date=${fromDate}&to_date=${toDate}`
      const alertRes = await fetch(alertUrl, {
        method: 'POST',
        headers: { 'auth-code': accessToken },
      })
      const alertText = await alertRes.text()
      let alertData: any
      try { alertData = JSON.parse(alertText) } catch { alertData = { raw: alertText.substring(0, 200) } }

      const alerts = Array.isArray(alertData.root?.alert)
        ? alertData.root.alert
        : Array.isArray(alertData.data)
          ? alertData.data
          : Array.isArray(alertData)
            ? alertData
            : []

      return new Response(
        JSON.stringify({ success: true, alerts, count: alerts.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ===== getDrivingBehavior =====
    if (action === 'getDrivingBehavior') {
      const fromDate = body.from_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const toDate = body.to_date || new Date().toISOString().split('T')[0]
      const vehicleNo = body.vehicle_no || ''

      console.log(`getDrivingBehavior: ${fromDate} to ${toDate}, vehicle: ${vehicleNo || 'all'}`)

      // Fetch live vehicle data FIRST (before report calls exhaust token/rate limit)
      let { vehicles: liveVehicles } = await fetchLiveVehicles(baseUrl, accessToken, username, password)
      
      // If 0 vehicles, get a fresh token and retry (token timing issue)
      if (liveVehicles.length === 0) {
        console.log('getDrivingBehavior: 0 vehicles on first attempt, refreshing token...')
        await new Promise(r => setTimeout(r, 1500))
        const freshToken = await getAccessToken(baseUrl, username, password)
        const retry = await fetchLiveVehicles(baseUrl, freshToken, username, password)
        liveVehicles = retry.vehicles
        console.log(`getDrivingBehavior: retry got ${liveVehicles.length} vehicles`)
      }
      
      // FALLBACK: If API still returns 0, use cached vehicle_positions
      let mapped: any[] = []
      let dataSource = 'api'
      if (liveVehicles.length === 0) {
        console.log('getDrivingBehavior: API rate-limited, falling back to cached data')
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, serviceRoleKey)
        const { data: cachedData } = await supabase
          .from('vehicle_positions')
          .select('*')
          .order('vehicle_no')
        
        if (cachedData && cachedData.length > 0) {
          mapped = cachedData.map((row: any) => ({
            vehicle_no: row.vehicle_no || '',
            imei_no: row.imei_no || '',
            lat: row.lat || 0,
            lng: row.lng || 0,
            speed: row.speed || 0,
            status: row.status || 'offline',
            heading: row.heading,
            last_update: row.last_update || '',
            device_name: row.device_name || '',
            driver_name: row.driver_name || '',
            ignition: row.ignition || '',
            company: row.company || '',
            fuel_level: row.fuel_level,
          }))
          dataSource = 'cache'
          console.log(`getDrivingBehavior: using ${mapped.length} cached vehicles`)
        } else {
          return new Response(
            JSON.stringify({ success: false, error: 'API GPS temporairement indisponible. Aucune donnée en cache.' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      } else {
        mapped = liveVehicles.map(normalizeVehicle)
      }
      console.log(`getDrivingBehavior: ${mapped.length} vehicles (source: ${dataSource})`)

      const results: any = {
        trips: [],
        overspeeding: [],
        harsh_events: [],
        idle_events: [],
        summary: {},
        raw_responses: {},
      }

      // 1. Trip Report
      const tripEndpoints = ['getTripReport', 'getTripsReport', 'getTripReportData']
      for (const endpoint of tripEndpoints) {
        if (results.trips.length > 0) break
        try {
          const params: any = { from_date: fromDate, to_date: toDate, format: 'json' }
          if (vehicleNo) params.vehicle_no = vehicleNo
          const res = await fetch(`${baseUrl}/webservice?token=${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'auth-code': accessToken },
            body: JSON.stringify(params),
          })
          const text = await res.text()
          if (!text.includes('Deprecated')) {
            const data = JSON.parse(text)
            const tripData = data.root?.trip || data.root?.Trip || data.data || data.trips || (Array.isArray(data) ? data : [])
            if (Array.isArray(tripData) && tripData.length > 0) {
              results.trips = tripData.map((t: any) => ({
                vehicle_no: t.vehicle_no || t.Vehicle_Name || t.vehicleName || '',
                start_time: t.start_time || t.startTime || t.Start_Time || '',
                end_time: t.end_time || t.endTime || t.End_Time || '',
                distance_km: parseFloat(t.distance || t.Distance || t.total_distance || 0),
                max_speed: parseFloat(t.max_speed || t.maxSpeed || t.Max_Speed || 0),
                avg_speed: parseFloat(t.avg_speed || t.avgSpeed || t.Avg_Speed || 0),
                duration_minutes: parseFloat(t.duration || t.Duration || t.total_time || 0),
                start_address: t.start_address || t.startAddress || '',
                end_address: t.end_address || t.endAddress || '',
                idle_time: parseFloat(t.idle_time || t.idleTime || t.Idle_Time || 0),
              }))
              results.raw_responses.trips = endpoint
            }
          }
        } catch (e) { console.log(`${endpoint} error: ${e.message}`) }
      }

      // 2. Overspeeding Report
      const overspeedEndpoints = ['getOverspeedReport', 'getOverSpeedReport', 'getOverspeedingReport', 'getSpeedViolationReport']
      for (const endpoint of overspeedEndpoints) {
        if (results.overspeeding.length > 0) break
        try {
          const params: any = { from_date: fromDate, to_date: toDate, format: 'json' }
          if (vehicleNo) params.vehicle_no = vehicleNo
          const res = await fetch(`${baseUrl}/webservice?token=${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'auth-code': accessToken },
            body: JSON.stringify(params),
          })
          const text = await res.text()
          if (!text.includes('Deprecated')) {
            const data = JSON.parse(text)
            const speedData = data.root?.overspeed || data.root?.Overspeed || data.data || (Array.isArray(data) ? data : [])
            if (Array.isArray(speedData) && speedData.length > 0) {
              results.overspeeding = speedData.map((s: any) => ({
                vehicle_no: s.vehicle_no || s.Vehicle_Name || s.vehicleName || '',
                datetime: s.datetime || s.DateTime || s.date_time || s.time || '',
                speed: parseFloat(s.speed || s.Speed || 0),
                speed_limit: parseFloat(s.speed_limit || s.speedLimit || s.Speed_Limit || 80),
                duration_seconds: parseFloat(s.duration || s.Duration || 0),
                location: s.location || s.Location || s.address || '',
                lat: parseFloat(s.lat || s.Lat || 0),
                lng: parseFloat(s.lng || s.Lng || s.lon || 0),
              }))
              results.raw_responses.overspeeding = endpoint
            }
          }
        } catch (e) { console.log(`${endpoint} error: ${e.message}`) }
      }

      // 3. Harsh Events
      const harshEndpoints = ['getHarshEventReport', 'getHarshDrivingReport', 'getHarshBrakingReport', 'getDrivingBehaviorReport']
      for (const endpoint of harshEndpoints) {
        if (results.harsh_events.length > 0) break
        try {
          const params: any = { from_date: fromDate, to_date: toDate, format: 'json' }
          if (vehicleNo) params.vehicle_no = vehicleNo
          const res = await fetch(`${baseUrl}/webservice?token=${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'auth-code': accessToken },
            body: JSON.stringify(params),
          })
          const text = await res.text()
          if (!text.includes('Deprecated')) {
            const data = JSON.parse(text)
            const harshData = data.root?.event || data.root?.HarshEvent || data.data || (Array.isArray(data) ? data : [])
            if (Array.isArray(harshData) && harshData.length > 0) {
              results.harsh_events = harshData.map((h: any) => ({
                vehicle_no: h.vehicle_no || h.Vehicle_Name || h.vehicleName || '',
                event_type: h.event_type || h.eventType || h.Event_Type || h.type || 'unknown',
                datetime: h.datetime || h.DateTime || h.date_time || h.time || '',
                speed: parseFloat(h.speed || h.Speed || 0),
                location: h.location || h.Location || h.address || '',
                lat: parseFloat(h.lat || h.Lat || 0),
                lng: parseFloat(h.lng || h.Lng || h.lon || 0),
                severity: h.severity || h.Severity || 'medium',
              }))
              results.raw_responses.harsh_events = endpoint
            }
          }
        } catch (e) { console.log(`${endpoint} error: ${e.message}`) }
      }

      // 4. Idle Report
      const idleEndpoints = ['getIdleReport', 'getIdlingReport', 'getStoppageReport']
      for (const endpoint of idleEndpoints) {
        if (results.idle_events.length > 0) break
        try {
          const params: any = { from_date: fromDate, to_date: toDate, format: 'json' }
          if (vehicleNo) params.vehicle_no = vehicleNo
          const res = await fetch(`${baseUrl}/webservice?token=${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'auth-code': accessToken },
            body: JSON.stringify(params),
          })
          const text = await res.text()
          if (!text.includes('Deprecated')) {
            const data = JSON.parse(text)
            const idleData = data.root?.idle || data.root?.Idle || data.root?.stoppage || data.data || (Array.isArray(data) ? data : [])
            if (Array.isArray(idleData) && idleData.length > 0) {
              results.idle_events = idleData.map((i: any) => ({
                vehicle_no: i.vehicle_no || i.Vehicle_Name || i.vehicleName || '',
                start_time: i.start_time || i.startTime || i.Start_Time || '',
                end_time: i.end_time || i.endTime || i.End_Time || '',
                duration_minutes: parseFloat(i.duration || i.Duration || i.idle_duration || 0),
                location: i.location || i.Location || i.address || '',
                lat: parseFloat(i.lat || i.Lat || 0),
                lng: parseFloat(i.lng || i.Lng || i.lon || 0),
              }))
              results.raw_responses.idle = endpoint
            }
          }
        } catch (e) { console.log(`${endpoint} error: ${e.message}`) }
      }

      // Use live data already fetched at the start
      
      const totalVehicles = mapped.length
      const movingCount = mapped.filter(v => v.speed > 0).length
      const overspeedingNow = mapped.filter(v => v.speed > 80).length
      const idleWithIgnition = mapped.filter(v => v.speed === 0 && (v.ignition === '1' || v.ignition === 'ON')).length
      const avgSpeed = movingCount > 0 ? mapped.reduce((s, v) => s + v.speed, 0) / movingCount : 0
      const maxSpeed = mapped.reduce((max, v) => Math.max(max, v.speed), 0)
      
      const vehicleBehavior = mapped.map(v => ({
        vehicle_no: v.vehicle_no,
        driver_name: v.driver_name,
        current_speed: v.speed,
        lat: v.lat,
        lng: v.lng,
        is_overspeeding: v.speed > 80,
        is_idle_engine_on: v.speed === 0 && (v.ignition === '1' || v.ignition === 'ON'),
        ignition: v.ignition,
        status: v.speed > 0 ? 'moving' : v.ignition === '1' || v.ignition === 'ON' ? 'idle' : 'parked',
      }))

      results.summary = {
        total_vehicles: totalVehicles,
        currently_moving: movingCount,
        currently_overspeeding: overspeedingNow,
        currently_idle_engine_on: idleWithIgnition,
        avg_speed_moving: Math.round(avgSpeed),
        max_speed_fleet: maxSpeed,
        total_trips: results.trips.length,
        total_overspeed_events: results.overspeeding.length,
        total_harsh_events: results.harsh_events.length,
        total_idle_events: results.idle_events.length,
        overspeeding_vehicles: mapped.filter(v => v.speed > 80).map(v => v.vehicle_no),
      }
      results.vehicle_behavior = vehicleBehavior

      return new Response(
        JSON.stringify({ success: true, ...results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ===== syncTelemetry =====
    // Automated sync: pulls GPS data, upserts telemetry_events, checks geofences, creates alerts
    if (action === 'syncTelemetry') {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      const today = new Date().toISOString().split('T')[0]
      console.log(`syncTelemetry: starting for date ${today}`)

      // 1. Fetch live vehicle data
      const { vehicles: liveVehicles, method } = await fetchLiveVehicles(baseUrl, accessToken, username, password)
      const mapped = liveVehicles.map(normalizeVehicle)
      console.log(`syncTelemetry: ${mapped.length} vehicles from GPS via ${method}`)

      // 2. Get all vehicles and drivers from DB for matching
      const { data: dbVehicles } = await supabase
        .from('vehicles')
        .select('id, license_plate, model_name, uffizio_device_id')
      
      const { data: dbRentals } = await supabase
        .from('rentals')
        .select('driver_id, vehicle_id')
        .eq('status', 'active')

      // Build vehicle → driver mapping from active rentals
      const vehicleToDriver = new Map<string, string>()
      if (dbRentals) {
        for (const r of dbRentals) {
          vehicleToDriver.set(r.vehicle_id, r.driver_id)
        }
      }

      // Build vehicle name → DB vehicle ID mapping (fuzzy match)
      const vehicleNameToId = new Map<string, string>()
      if (dbVehicles) {
        for (const v of dbVehicles) {
          // Match by uffizio_device_id, license plate, or model name
          if (v.uffizio_device_id) vehicleNameToId.set(v.uffizio_device_id.toLowerCase(), v.id)
          vehicleNameToId.set(v.license_plate.toLowerCase().replace(/[\s-]/g, ''), v.id)
          vehicleNameToId.set(v.model_name.toLowerCase().replace(/[\s-]/g, ''), v.id)
        }
      }

      function findVehicleId(gpsVehicle: any): string | null {
        const name = (gpsVehicle.vehicle_no || '').toLowerCase().replace(/[\s-]/g, '')
        const imei = (gpsVehicle.imei_no || '').toLowerCase()
        
        // Direct match
        if (vehicleNameToId.has(name)) return vehicleNameToId.get(name)!
        if (imei && vehicleNameToId.has(imei)) return vehicleNameToId.get(imei)!
        
        // Partial match
        for (const [key, id] of vehicleNameToId.entries()) {
          if (name.includes(key) || key.includes(name)) return id
        }
        return null
      }

      // 3. Upsert telemetry_events for matched vehicles
      let telemetryUpserted = 0
      let telemetrySkipped = 0
      const telemetryRows: any[] = []

      for (const v of mapped) {
        const vehicleId = findVehicleId(v)
        if (!vehicleId) { telemetrySkipped++; continue }

        const driverId = vehicleToDriver.get(vehicleId)
        if (!driverId) { telemetrySkipped++; continue }

        telemetryRows.push({
          driver_id: driverId,
          vehicle_id: vehicleId,
          event_date: today,
          distance_km: 0, // Will accumulate from trip reports
          harsh_braking_count: 0,
          overspeeding_count: v.speed > 80 ? 1 : 0,
          idle_time_minutes: v.speed === 0 && (v.ignition === '1' || v.ignition === 'ON') ? 5 : 0,
          average_speed_kmh: v.speed,
          last_location_lat: v.lat,
          last_location_lng: v.lng,
          raw_data: { gps_vehicle_no: v.vehicle_no, speed: v.speed, ignition: v.ignition, last_update: v.last_update },
        })
      }

      // Try to enrich with trip/behavior report data
      const fromDate = today
      const toDate = today
      let tripsByVehicle = new Map<string, { distance: number; harsh: number; overspeed: number; idle: number }>()

      // Fetch trip data for today
      const tripEndpoints = ['getTripReport', 'getTripsReport']
      for (const endpoint of tripEndpoints) {
        try {
          const res = await fetch(`${baseUrl}/webservice?token=${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'auth-code': accessToken },
            body: JSON.stringify({ from_date: fromDate, to_date: toDate, format: 'json' }),
          })
          const text = await res.text()
          if (!text.includes('Deprecated')) {
            const data = JSON.parse(text)
            const tripData = data.root?.trip || data.root?.Trip || data.data || (Array.isArray(data) ? data : [])
            if (Array.isArray(tripData) && tripData.length > 0) {
              for (const t of tripData) {
                const vName = (t.vehicle_no || t.Vehicle_Name || t.vehicleName || '').toLowerCase().replace(/[\s-]/g, '')
                const existing = tripsByVehicle.get(vName) || { distance: 0, harsh: 0, overspeed: 0, idle: 0 }
                existing.distance += parseFloat(t.distance || t.Distance || t.total_distance || 0)
                existing.idle += parseFloat(t.idle_time || t.idleTime || t.Idle_Time || 0)
                tripsByVehicle.set(vName, existing)
              }
              console.log(`syncTelemetry: enriched with ${tripData.length} trip records`)
              break
            }
          }
        } catch (e) { console.log(`Trip enrichment error: ${e.message}`) }
      }

      // Fetch overspeed counts for today
      try {
        const res = await fetch(`${baseUrl}/webservice?token=getOverspeedReport`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'auth-code': accessToken },
          body: JSON.stringify({ from_date: fromDate, to_date: toDate, format: 'json' }),
        })
        const text = await res.text()
        if (!text.includes('Deprecated')) {
          const data = JSON.parse(text)
          const speedData = data.root?.overspeed || data.root?.Overspeed || data.data || (Array.isArray(data) ? data : [])
          if (Array.isArray(speedData)) {
            for (const s of speedData) {
              const vName = (s.vehicle_no || s.Vehicle_Name || '').toLowerCase().replace(/[\s-]/g, '')
              const existing = tripsByVehicle.get(vName) || { distance: 0, harsh: 0, overspeed: 0, idle: 0 }
              existing.overspeed++
              tripsByVehicle.set(vName, existing)
            }
          }
        }
      } catch (e) { console.log(`Overspeed enrichment error: ${e.message}`) }

      // Fetch harsh events for today
      try {
        const res = await fetch(`${baseUrl}/webservice?token=getHarshEventReport`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'auth-code': accessToken },
          body: JSON.stringify({ from_date: fromDate, to_date: toDate, format: 'json' }),
        })
        const text = await res.text()
        if (!text.includes('Deprecated')) {
          const data = JSON.parse(text)
          const harshData = data.root?.event || data.root?.HarshEvent || data.data || (Array.isArray(data) ? data : [])
          if (Array.isArray(harshData)) {
            for (const h of harshData) {
              const vName = (h.vehicle_no || h.Vehicle_Name || '').toLowerCase().replace(/[\s-]/g, '')
              const existing = tripsByVehicle.get(vName) || { distance: 0, harsh: 0, overspeed: 0, idle: 0 }
              existing.harsh++
              tripsByVehicle.set(vName, existing)
            }
          }
        }
      } catch (e) { console.log(`Harsh enrichment error: ${e.message}`) }

      // Merge enrichment data into telemetry rows
      for (const row of telemetryRows) {
        const vName = (row.raw_data?.gps_vehicle_no || '').toLowerCase().replace(/[\s-]/g, '')
        const enrichment = tripsByVehicle.get(vName)
        if (enrichment) {
          if (enrichment.distance > 0) row.distance_km = enrichment.distance
          if (enrichment.harsh > 0) row.harsh_braking_count = enrichment.harsh
          if (enrichment.overspeed > 0) row.overspeeding_count = enrichment.overspeed
          if (enrichment.idle > 0) row.idle_time_minutes = enrichment.idle
        }
      }

      // Upsert telemetry rows
      if (telemetryRows.length > 0) {
        const { error: upsertError } = await supabase
          .from('telemetry_events')
          .upsert(telemetryRows, {
            onConflict: 'driver_id,vehicle_id,event_date',
            ignoreDuplicates: false,
          })
        
        if (upsertError) {
          console.error(`Telemetry upsert error: ${upsertError.message}`)
        } else {
          telemetryUpserted = telemetryRows.length
          console.log(`syncTelemetry: upserted ${telemetryUpserted} telemetry records`)
        }
      }

      // 4. Geofence checking
      const { data: geofenceZones } = await supabase
        .from('geofence_zones')
        .select('*')
        .eq('is_active', true)

      let geofenceAlerts = 0

      if (geofenceZones && geofenceZones.length > 0) {
        const newAlerts: any[] = []

        for (const v of mapped) {
          if (!v.lat || !v.lng || (v.lat === 0 && v.lng === 0)) continue

          const vehicleId = findVehicleId(v)
          const driverId = vehicleId ? vehicleToDriver.get(vehicleId) : null

          for (const zone of geofenceZones) {
            if (zone.zone_type !== 'circle' || !zone.center_lat || !zone.center_lng || !zone.radius_meters) continue

            const distance = haversineDistance(v.lat, v.lng, zone.center_lat, zone.center_lng)
            const isOutside = distance > zone.radius_meters

            if (isOutside) {
              // Vehicle is outside this zone - create an exit alert
              newAlerts.push({
                vehicle_id: vehicleId || null,
                driver_id: driverId || null,
                zone_id: zone.id,
                alert_type: 'exit',
                vehicle_name: v.vehicle_no,
                zone_name: zone.name,
                lat: v.lat,
                lng: v.lng,
                speed: v.speed,
              })
            }
          }
        }

        if (newAlerts.length > 0) {
          // Only insert alerts for vehicles not already alerted in the last hour
          for (const alert of newAlerts) {
            const { data: existing } = await supabase
              .from('geofence_alerts')
              .select('id')
              .eq('vehicle_name', alert.vehicle_name)
              .eq('zone_id', alert.zone_id)
              .eq('alert_type', 'exit')
              .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
              .limit(1)

            if (!existing || existing.length === 0) {
              await supabase.from('geofence_alerts').insert(alert)
              geofenceAlerts++

              // Create notification for the driver if we have one
              if (alert.driver_id) {
                await supabase.from('notifications').insert({
                  driver_id: alert.driver_id,
                  title: `⚠️ Zone quittée: ${alert.zone_name}`,
                  message: `Votre véhicule ${alert.vehicle_name} a quitté la zone "${alert.zone_name}". Vitesse: ${alert.speed} km/h.`,
                  notification_type: 'geofence_exit',
                })
              }
            }
          }
          console.log(`syncTelemetry: ${geofenceAlerts} new geofence alerts`)
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          action: 'syncTelemetry',
          gps_vehicles: mapped.length,
          telemetry_upserted: telemetryUpserted,
          telemetry_skipped: telemetrySkipped,
          geofence_alerts: geofenceAlerts,
          geofence_zones_checked: geofenceZones?.length || 0,
          enrichment: {
            trips_found: tripsByVehicle.size,
          },
          date: today,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ===== getVehicleReport =====
    if (action === 'getVehicleReport') {
      const vehicleNo = body.vehicle_no
      const fromDate = body.from_date || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const toDate = body.to_date || new Date().toISOString().split('T')[0]

      if (!vehicleNo) {
        return new Response(
          JSON.stringify({ error: 'vehicle_no is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      let report: any = { vehicle_no: vehicleNo }
      
      const summaryEndpoints = ['getDistanceSummaryReport', 'getVehicleSummaryReport', 'getDailySummaryReport']
      for (const endpoint of summaryEndpoints) {
        try {
          const res = await fetch(`${baseUrl}/webservice?token=${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'auth-code': accessToken },
            body: JSON.stringify({ vehicle_no: vehicleNo, from_date: fromDate, to_date: toDate, format: 'json' }),
          })
          const text = await res.text()
          if (!text.includes('Deprecated')) {
            const data = JSON.parse(text)
            const reportData = data.root || data.data || data
            if (reportData && typeof reportData === 'object') {
              report.distance_data = reportData
              report.method = endpoint
              break
            }
          }
        } catch (e) { console.log(`${endpoint} error: ${e.message}`) }
      }

      return new Response(
        JSON.stringify({ success: true, report }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ===== getDriverList =====
    if (action === 'getDriverList') {
      console.log('getDriverList: fetching drivers from Uffizio')
      
      // First get live vehicle data (with retry for token timing issues)
      let liveVehicles: any[] = []
      let liveMethod = ''
      for (let attempt = 0; attempt < 2; attempt++) {
        const token = attempt === 0 ? accessToken : await getAccessToken(baseUrl, username, password)
        const result = await fetchLiveVehicles(baseUrl, token, username, password)
        if (result.vehicles.length > 0) {
          liveVehicles = result.vehicles
          liveMethod = result.method
          break
        }
        console.log(`getDriverList: attempt ${attempt + 1} returned 0, retrying...`)
      }
      const mapped = liveVehicles.map(normalizeVehicle)
      console.log(`getDriverList: ${mapped.length} vehicles from GPS via ${liveMethod}`)

      // Also try dedicated driver endpoints
      let uffizioDrivers: any[] = []
      const driverEndpoints = ['getDriverList', 'getDrivers', 'getAllDrivers', 'getDriverReport']
      
      for (const endpoint of driverEndpoints) {
        if (uffizioDrivers.length > 0) break
        try {
          const res = await fetch(`${baseUrl}/webservice?token=${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'auth-code': accessToken },
            body: JSON.stringify({ format: 'json' }),
          })
          const text = await res.text()
          if (!text.includes('Deprecated') && !text.includes('Token not exist')) {
            const data = JSON.parse(text)
            const driverData = data.root?.driver || data.root?.Driver || data.data || data.drivers || (Array.isArray(data) ? data : [])
            if (Array.isArray(driverData) && driverData.length > 0) {
              uffizioDrivers = driverData.map((d: any) => ({
                driver_id: d.driver_id || d.driverId || d.id || '',
                name: d.driver_name || d.driverName || d.Driver_Name || d.name || d.full_name || '',
                phone: d.mobile || d.phone || d.Phone || d.mobile_no || d.contact || '',
                license_no: d.license_no || d.licenseNo || d.License_No || d.driving_license || '',
                vehicle_assigned: d.vehicle_name || d.vehicleName || d.Vehicle_Name || d.assigned_vehicle || '',
                email: d.email || d.Email || '',
                address: d.address || d.Address || '',
                rfid: d.rfid || d.RFID || '',
                status: d.status || d.Status || 'active',
              }))
              console.log(`getDriverList: found ${uffizioDrivers.length} drivers via ${endpoint}`)
            }
          }
        } catch (e) { console.log(`${endpoint} error: ${e.message}`) }
      }

      // Extract driver info from live vehicle data as fallback
      const driversFromVehicles = mapped
        .filter(v => v.driver_name && v.driver_name.trim() !== '')
        .map(v => ({
          name: v.driver_name,
          vehicle_assigned: v.vehicle_no,
          phone: '',
          license_no: '',
          email: '',
          source: 'vehicle_assignment',
        }))

      // Deduplicate by name
      const seen = new Set<string>()
      const uniqueFromVehicles = driversFromVehicles.filter(d => {
        const key = d.name.toLowerCase().trim()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      return new Response(
        JSON.stringify({ 
          success: true, 
          drivers_from_api: uffizioDrivers,
          drivers_from_vehicles: uniqueFromVehicles,
          total_vehicles: mapped.length,
          vehicles_with_driver: driversFromVehicles.length,
          method: liveMethod,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ===== getLiveVehicles (alias for getLiveData, used by Platform Sync) =====
    if (action === 'getLiveVehicles') {
      // Reuse getLiveData logic by recursively calling with corrected action
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, serviceRoleKey)

      const { vehicles, method } = await fetchLiveVehicles(baseUrl, accessToken, username, password)
      
      if (vehicles.length > 0) {
        const mapped = vehicles.map(normalizeVehicle)
        return new Response(
          JSON.stringify({ success: true, vehicles: mapped, count: mapped.length, method, source: 'api' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Fallback to cache
      const { data: cachedData } = await supabase
        .from('vehicle_positions')
        .select('*')
        .order('vehicle_no')

      if (cachedData && cachedData.length > 0) {
        return new Response(
          JSON.stringify({ success: true, vehicles: cachedData, count: cachedData.length, method: 'cache', source: 'cache' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ success: false, error: 'API GPS temporairement indisponible', vehicles: [], count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Unknown action', supported: ['getLiveData', 'getLiveVehicles', 'getAlertData', 'getDrivingBehavior', 'getVehicleReport', 'syncTelemetry', 'getDriverList'] }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Uffizio sync error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
