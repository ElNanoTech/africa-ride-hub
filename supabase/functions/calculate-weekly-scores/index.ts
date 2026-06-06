import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, runtime',
}

/**
 * KIRA scoring engine — 6-factor model on 0–1000 scale, base 500.
 * Weights and tier thresholds come from `scoring_config` (single source of truth).
 *
 * Factor → source table mapping:
 *   payment_history   ← payments            (available)
 *   driving_behavior  ← telemetry_events    (available; KIRA spec maps to "Conduite")
 *   income_stability  ← income_records      (available; KIRA spec maps to "Revenu")
 *   sinistralite      ← accidents           (available)
 *   infractions       ← cgi_contraventions  (NOT YET — table missing, factor "en attente")
 *   credit            ← loans               (NOT YET — table lacks repayment data, factor "en attente")
 *
 * Factors flagged unavailable have their weight redistributed across remaining
 * factors so dark factors don't drag the score toward base 500.
 */

type FactorKey =
  | 'income_stability'
  | 'payment_history'
  | 'driving_behavior'
  | 'sinistralite'
  | 'infractions'
  | 'credit'

const DEFAULT_WEIGHTS: Record<FactorKey, number> = {
  payment_history: 25,
  driving_behavior: 25,
  income_stability: 10,
  sinistralite: 15,
  infractions: 10,
  credit: 15,
}

// Threshold keys in scoring_config use legacy labels; values map to A/B/C/D floors.
const DEFAULT_THRESHOLDS = {
  platinum: 800, // A
  gold: 650,     // B
  silver: 500,   // C
  bronze: 300,   // D
}

const SCORE_MIN = 0
const SCORE_MAX = 1000
const SCORE_BASE = 500

interface ScoringConfig {
  weights: Record<FactorKey, number>
  tier_thresholds: typeof DEFAULT_THRESHOLDS
}

interface DriverData {
  id: string
  full_name: string
  created_at: string
}

interface IncomeRecord {
  gross_income: number
  net_income: number
  trip_count: number
  record_date: string
  source?: string
  trust_weight?: number
  status?: string
}

interface PaymentRecord {
  amount: number
  status: string
  due_date: string
  paid_date: string | null
}

interface TelemetryRecord {
  distance_km: number
  harsh_braking_count: number
  overspeeding_count: number
  idle_time_minutes: number
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Starting weekly credit score calculation...')
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get scoring configuration
    const { data: configData } = await supabase
      .from('scoring_config')
      .select('config_key, config_value')
    
    const config: ScoringConfig = {
      weights: { ...DEFAULT_WEIGHTS },
      tier_thresholds: { ...DEFAULT_THRESHOLDS },
    }
    
    if (configData) {
      for (const item of configData) {
        if (item.config_key === 'weights') {
          config.weights = { ...DEFAULT_WEIGHTS, ...(item.config_value as Record<string, number>) }
        } else if (item.config_key === 'tier_thresholds') {
          config.tier_thresholds = { ...DEFAULT_THRESHOLDS, ...(item.config_value as typeof DEFAULT_THRESHOLDS) }
        }
      }
    }

    console.log('Using config:', JSON.stringify(config))

    // Get all active drivers
    const { data: drivers, error: driversError } = await supabase
      .from('drivers')
      .select('id, full_name, created_at')
      .eq('driver_status', 'active')

    if (driversError) {
      throw new Error(`Failed to fetch drivers: ${driversError.message}`)
    }

    console.log(`Processing ${drivers?.length || 0} active drivers`)

    const calculationWeek = getCalculationWeek()
    const results: { driver_id: string; score: number; tier: string }[] = []
    const errors: { driver_id: string; error: string }[] = []

    for (const driver of drivers || []) {
      try {
        const scoreResult = await calculateDriverScore(supabase, driver, config, calculationWeek)
        results.push(scoreResult)
        console.log(`Calculated score for driver ${driver.id}: ${scoreResult.score} (${scoreResult.tier})`)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        errors.push({ driver_id: driver.id, error: errorMsg })
        console.error(`Error calculating score for driver ${driver.id}:`, errorMsg)
      }
    }

    console.log(`Completed: ${results.length} scores calculated, ${errors.length} errors`)

    return new Response(
      JSON.stringify({
        success: true,
        calculation_week: calculationWeek,
        processed: results.length,
        errors: errors.length,
        results,
        error_details: errors
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('Fatal error in scoring function:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})

function getCalculationWeek(): string {
  const now = new Date()
  const dayOfWeek = now.getUTCDay()
  const diff = now.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
  const monday = new Date(now.setUTCDate(diff))
  monday.setUTCHours(0, 0, 0, 0)
  return monday.toISOString().split('T')[0]
}

async function calculateDriverScore(
  supabase: any,
  driver: DriverData,
  config: ScoringConfig,
  calculationWeek: string
) {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

  const oneEightyDaysAgo = new Date()
  oneEightyDaysAgo.setDate(oneEightyDaysAgo.getDate() - 180)

  // Fetch income records (last 30 days) - prioritize Yango data, fallback to manual entries
  // Only include approved records for driver_declared source
  const { data: yangoIncomeRecords } = await supabase
    .from('income_records')
    .select('gross_income, net_income, trip_count, record_date, source, trust_weight, status')
    .eq('driver_id', driver.id)
    .eq('source', 'yango')
    .gte('record_date', thirtyDaysAgoStr)
    .order('record_date', { ascending: false })

  // Check if Yango data is available (at least 7 days of data)
  const hasYangoData = (yangoIncomeRecords?.length || 0) >= 7

  let incomeRecords: IncomeRecord[] = []
  let incomeSource = 'none'

  if (hasYangoData) {
    incomeRecords = yangoIncomeRecords || []
    incomeSource = 'yango'
    console.log(`Driver ${driver.id}: Using Yango income data (${incomeRecords.length} records)`)
  } else {
    // Fallback to manual income entries (admin-entered)
    const { data: manualIncomeRecords } = await supabase
      .from('income_records')
      .select('gross_income, net_income, trip_count, record_date, source, trust_weight, status')
      .eq('driver_id', driver.id)
      .in('source', ['manual', 'bulk_import'])
      .eq('status', 'approved')
      .gte('record_date', thirtyDaysAgoStr)
      .order('record_date', { ascending: false })

    if ((manualIncomeRecords?.length || 0) > 0) {
      incomeRecords = manualIncomeRecords || []
      incomeSource = 'manual'
      console.log(`Driver ${driver.id}: Using manual income data as fallback (${incomeRecords.length} records)`)
    } else {
      // Try driver-declared (approved only) or any other source as last resort
      const { data: anyIncomeRecords } = await supabase
        .from('income_records')
        .select('gross_income, net_income, trip_count, record_date, source, trust_weight, status')
        .eq('driver_id', driver.id)
        .or('status.eq.approved,status.is.null')
        .gte('record_date', thirtyDaysAgoStr)
        .order('record_date', { ascending: false })
      
      if ((anyIncomeRecords?.length || 0) > 0) {
        incomeRecords = anyIncomeRecords || []
        incomeSource = 'mixed'
        console.log(`Driver ${driver.id}: Using mixed income sources (${incomeRecords.length} records)`)
      } else {
        console.log(`Driver ${driver.id}: No income data available`)
      }
    }
  }

  // Fetch payment records (last 90 days)
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  const { data: paymentRecords } = await supabase
    .from('payments')
    .select('amount, status, due_date, paid_date')
    .eq('driver_id', driver.id)
    .gte('due_date', ninetyDaysAgo.toISOString().split('T')[0])

  // Fetch telemetry (last 30 days)
  const { data: telemetryRecords } = await supabase
    .from('telemetry_events')
    .select('distance_km, harsh_braking_count, overspeeding_count, idle_time_minutes')
    .eq('driver_id', driver.id)
    .gte('event_date', thirtyDaysAgoStr)

  // Fetch accidents (last 180 days) for sinistralité
  const { data: accidentRecords } = await supabase
    .from('accidents')
    .select('severity, status, accident_datetime')
    .eq('driver_id', driver.id)
    .gte('accident_datetime', oneEightyDaysAgo.toISOString())

  // Calculate component scores
  const incomeScore = calculateIncomeScore(incomeRecords || [])
  const paymentScore = calculatePaymentScore(paymentRecords || [])
  const drivingScore = calculateDrivingScore(telemetryRecords || [])
  const sinistreScore = calculateSinistreScore(accidentRecords || [])

  // Data availability per factor
  const available: Record<FactorKey, boolean> = {
    income_stability: incomeRecords.length > 0,
    payment_history: (paymentRecords?.length || 0) > 0,
    driving_behavior: (telemetryRecords?.length || 0) > 0,
    sinistralite: true, // absence of accidents = clean record (perfect score)
    infractions: false, // TODO: wire when cgi_contraventions table exists
    credit: false,      // TODO: wire when loans schedule/repayments tracked
  }

  const factorNormalized: Record<FactorKey, number> = {
    income_stability: incomeScore.normalized,
    payment_history: paymentScore.normalized,
    driving_behavior: drivingScore.normalized,
    sinistralite: sinistreScore.normalized,
    infractions: 0,
    credit: 0,
  }

  console.log(`Driver ${driver.id}: Income source=${incomeSource}, factors=`, available)

  // Renormalize weights across available factors so unavailable factors don't drag score to base
  let totalAvailableWeight = 0
  for (const k of Object.keys(available) as FactorKey[]) {
    if (available[k]) totalAvailableWeight += (config.weights[k] || 0)
  }

  let clampedScore: number
  if (totalAvailableWeight <= 0) {
    clampedScore = SCORE_BASE
  } else {
    let weightedNormalized = 0
    for (const k of Object.keys(available) as FactorKey[]) {
      if (available[k]) {
        weightedNormalized += factorNormalized[k] * (config.weights[k] || 0)
      }
    }
    const normalizedScore = weightedNormalized / totalAvailableWeight // 0..1
    const finalScore = Math.round(SCORE_MIN + normalizedScore * (SCORE_MAX - SCORE_MIN))
    clampedScore = Math.max(SCORE_MIN, Math.min(SCORE_MAX, finalScore))
  }

  // Determine tier
  const tier = determineTier(clampedScore, config.tier_thresholds)

  // Status: confirmed only when all "wireable" factors (the 4 with sources) are present
  const status = (available.income_stability && available.payment_history && available.driving_behavior)
    ? 'confirmed'
    : 'provisional'

  // Impact points: contribution to the 0..1000 score, scaled by renormalized weight share
  const impactFor = (k: FactorKey) => {
    if (!available[k] || totalAvailableWeight <= 0) return null
    const share = (config.weights[k] || 0) / totalAvailableWeight
    return Math.round(factorNormalized[k] * share * (SCORE_MAX - SCORE_MIN))
  }
  const incomeImpact = impactFor('income_stability')
  const paymentImpact = impactFor('payment_history')
  const drivingImpact = impactFor('driving_behavior')

  // Insert credit score record with income source tracking
  const { data: scoreRecord, error: insertError } = await supabase
    .from('credit_scores')
    .insert({
      driver_id: driver.id,
      calculation_week: calculationWeek,
      score: clampedScore,
      tier,
      status,
      income_data_available: incomeDataAvailable,
      payment_data_available: paymentDataAvailable,
      driving_data_available: drivingDataAvailable,
      income_impact: incomeImpact,
      payment_impact: paymentImpact,
      driving_impact: drivingImpact,
      income_source: incomeSource
    })
    .select('id')
    .single()

  if (insertError) {
    // Check if it's a duplicate for this week
    if (insertError.code === '23505') {
      // Update existing record instead
      await supabase
        .from('credit_scores')
        .update({
          score: clampedScore,
          tier,
          status,
          income_data_available: incomeDataAvailable,
          payment_data_available: paymentDataAvailable,
          driving_data_available: drivingDataAvailable,
          income_impact: incomeImpact,
          payment_impact: paymentImpact,
          driving_impact: drivingImpact,
          income_source: incomeSource
        })
        .eq('driver_id', driver.id)
        .eq('calculation_week', calculationWeek)
    } else {
      throw new Error(`Failed to save score: ${insertError.message}`)
    }
  }

  // Insert breakdowns for all 6 factors (mark unavailable ones)
  if (scoreRecord?.id) {
    const rawFor: Record<FactorKey, number> = {
      income_stability: incomeScore.raw,
      payment_history: paymentScore.raw,
      driving_behavior: drivingScore.raw,
      sinistralite: sinistreScore.raw,
      infractions: 0,
      credit: 0,
    }
    const notesFor: Partial<Record<FactorKey, string>> = {
      infractions: 'En attente — source cgi_contraventions non disponible',
      credit: 'En attente — données de remboursement loans non disponibles',
    }
    const breakdowns = (Object.keys(config.weights) as FactorKey[]).map((k) => ({
      credit_score_id: scoreRecord.id,
      factor: k,
      raw_value: rawFor[k],
      normalized_value: factorNormalized[k],
      weight_applied: config.weights[k] || 0,
      impact_points: impactFor(k),
      data_available: available[k],
      notes: notesFor[k] || null,
    }))
    if (breakdowns.length > 0) {
      // Clear prior breakdowns for this score then insert fresh
      await supabase.from('credit_score_breakdowns').delete().eq('credit_score_id', scoreRecord.id)
      await supabase.from('credit_score_breakdowns').insert(breakdowns)
    }
  }

  // Create notification if tier changed significantly
  await createScoreNotification(supabase, driver.id, clampedScore, tier)

  return { driver_id: driver.id, score: clampedScore, tier }
}

function calculateIncomeScore(records: IncomeRecord[]): { raw: number; normalized: number } {
  if (records.length === 0) return { raw: 0, normalized: 0 }

  const totalIncome = records.reduce((sum, r) => sum + r.net_income, 0)
  const avgDailyIncome = totalIncome / 30
  const totalTrips = records.reduce((sum, r) => sum + r.trip_count, 0)
  
  // Calculate consistency (standard deviation of daily income)
  const dailyIncomes = records.map(r => r.net_income)
  const mean = dailyIncomes.reduce((a, b) => a + b, 0) / dailyIncomes.length
  const variance = dailyIncomes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / dailyIncomes.length
  const stdDev = Math.sqrt(variance)
  const coefficientOfVariation = mean > 0 ? stdDev / mean : 1

  // Score based on:
  // - Average daily income (target: 15000 FCFA/day = good)
  // - Trip count (target: 10 trips/day = good)
  // - Consistency (lower CV = better)
  const incomeComponent = Math.min(avgDailyIncome / 15000, 1) * 0.4
  const tripComponent = Math.min((totalTrips / 30) / 10, 1) * 0.3
  const consistencyComponent = Math.max(0, 1 - coefficientOfVariation) * 0.3

  const normalized = incomeComponent + tripComponent + consistencyComponent
  
  return { raw: avgDailyIncome, normalized: Math.min(1, normalized) }
}

function calculatePaymentScore(records: PaymentRecord[]): { raw: number; normalized: number } {
  if (records.length === 0) return { raw: 0, normalized: 0 }

  let onTimeCount = 0
  let lateCount = 0
  let missedCount = 0
  let totalLateDays = 0

  for (const payment of records) {
    if (payment.status === 'paid' && payment.paid_date) {
      const dueDate = new Date(payment.due_date)
      const paidDate = new Date(payment.paid_date)
      const daysDiff = Math.floor((paidDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
      
      if (daysDiff <= 0) {
        onTimeCount++
      } else {
        lateCount++
        totalLateDays += daysDiff
      }
    } else if (payment.status === 'overdue' || payment.status === 'missed') {
      missedCount++
    }
  }

  const total = onTimeCount + lateCount + missedCount
  if (total === 0) return { raw: 0, normalized: 0 }

  const onTimeRatio = onTimeCount / total
  const latenessPenalty = Math.min(1, totalLateDays / 30) * 0.3
  const missedPenalty = (missedCount / total) * 0.5

  const normalized = Math.max(0, onTimeRatio - latenessPenalty - missedPenalty)
  
  return { raw: onTimeRatio * 100, normalized }
}

function calculateDrivingScore(records: TelemetryRecord[]): { raw: number; normalized: number } {
  if (records.length === 0) return { raw: 0, normalized: 0 }

  const totalDistance = records.reduce((sum, r) => sum + r.distance_km, 0)
  const totalHarshBraking = records.reduce((sum, r) => sum + r.harsh_braking_count, 0)
  const totalOverspeeding = records.reduce((sum, r) => sum + r.overspeeding_count, 0)
  const totalIdleTime = records.reduce((sum, r) => sum + r.idle_time_minutes, 0)

  if (totalDistance === 0) return { raw: 0, normalized: 0 }

  // Normalize per 100km
  const harshBrakingPer100km = (totalHarshBraking / totalDistance) * 100
  const overspeedingPer100km = (totalOverspeeding / totalDistance) * 100
  
  // Calculate idle ratio (target: less than 10% of driving time)
  const estimatedDrivingMinutes = (totalDistance / 30) * 60 // Assuming 30km/h average
  const idleRatio = totalIdleTime / Math.max(estimatedDrivingMinutes, 1)

  // Penalties
  const harshBrakingPenalty = Math.min(0.3, harshBrakingPer100km * 0.05)
  const overspeedingPenalty = Math.min(0.3, overspeedingPer100km * 0.05)
  const idlePenalty = Math.min(0.2, Math.max(0, idleRatio - 0.1) * 0.5)

  const normalized = Math.max(0, 1 - harshBrakingPenalty - overspeedingPenalty - idlePenalty)
  
  return { raw: totalDistance, normalized }
}

function calculateTenureScore(createdAt: string): { raw: number; normalized: number } {
  const created = new Date(createdAt)
  const now = new Date()
  const daysSinceJoined = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
  
  // Max benefit at 365 days
  const normalized = Math.min(1, daysSinceJoined / 365)
  
  return { raw: daysSinceJoined, normalized }
}

function determineTier(score: number, thresholds: typeof TIER_THRESHOLDS): string {
  if (score >= thresholds.A) return 'A'
  if (score >= thresholds.B) return 'B'
  if (score >= thresholds.C) return 'C'
  if (score >= thresholds.D) return 'D'
  return 'E'
}

async function createScoreNotification(
  supabase: any,
  driverId: string,
  score: number,
  tier: string
) {
  const tierLabels: Record<string, string> = {
    A: 'Platine',
    B: 'Or',
    C: 'Argent',
    D: 'Bronze',
    E: 'Démarrage'
  }

  await supabase.from('notifications').insert({
    driver_id: driverId,
    notification_type: 'score_update',
    title: 'Score mis à jour',
    message: `Votre score de crédit est maintenant de ${score} points (Niveau ${tierLabels[tier] || tier}).`
  })
}
