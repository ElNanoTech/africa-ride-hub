import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface IncomeRow {
  phone_number?: string
  driver_id?: string
  yango_driver_id?: string
  record_date: string
  gross_income: number
  net_income: number
  trip_count: number
  source?: string
  notes?: string
}

interface ImportResult {
  success: boolean
  imported: number
  skipped: number
  errors: { row: number; error: string; data: any }[]
  warnings: string[]
}

interface ValidatedRow extends IncomeRow {
  resolved_driver_id: string
  row_number: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { rows, dry_run = false, admin_user_id } = await req.json()

    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No data rows provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log(`Processing ${rows.length} income records, dry_run=${dry_run}`)

    // Fetch all drivers for matching
    const { data: drivers, error: driversError } = await supabase
      .from('drivers')
      .select('id, phone_number, yango_driver_id, full_name')

    if (driversError) {
      throw new Error(`Failed to fetch drivers: ${driversError.message}`)
    }

    // Create lookup maps
    const driverByPhone = new Map(drivers?.map(d => [normalizePhone(d.phone_number), d]) || [])
    const driverById = new Map(drivers?.map(d => [d.id, d]) || [])
    const driverByYangoId = new Map(drivers?.map(d => [d.yango_driver_id, d]) || [])

    const result: ImportResult = {
      success: true,
      imported: 0,
      skipped: 0,
      errors: [],
      warnings: []
    }

    const validatedRows: ValidatedRow[] = []

    // Validate and resolve drivers
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as IncomeRow
      const rowNum = i + 2 // Account for header row

      try {
        // Validate required fields
        if (!row.record_date) {
          result.errors.push({ row: rowNum, error: 'Date manquante', data: row })
          continue
        }
        if (row.gross_income === undefined || row.gross_income < 0) {
          result.errors.push({ row: rowNum, error: 'Revenu brut invalide', data: row })
          continue
        }

        // Resolve driver
        let driver = null

        if (row.driver_id) {
          driver = driverById.get(row.driver_id)
        }
        if (!driver && row.yango_driver_id) {
          driver = driverByYangoId.get(row.yango_driver_id)
        }
        if (!driver && row.phone_number) {
          driver = driverByPhone.get(normalizePhone(row.phone_number))
        }

        if (!driver) {
          result.errors.push({
            row: rowNum,
            error: `Conducteur non trouvé (tel: ${row.phone_number || 'N/A'}, id: ${row.driver_id || 'N/A'})`,
            data: row
          })
          continue
        }

        // Parse date
        const recordDate = parseDate(row.record_date)
        if (!recordDate) {
          result.errors.push({ row: rowNum, error: `Format de date invalide: ${row.record_date}`, data: row })
          continue
        }

        // Validate amounts
        const grossIncome = Number(row.gross_income) || 0
        const netIncome = row.net_income !== undefined ? Number(row.net_income) : Math.round(grossIncome * 0.8)
        const tripCount = Number(row.trip_count) || 0

        // Check for anomalies
        if (grossIncome > 100000) {
          result.warnings.push(`Ligne ${rowNum}: Revenu brut élevé (${grossIncome} FCFA) pour ${driver.full_name}`)
        }
        if (netIncome > grossIncome) {
          result.warnings.push(`Ligne ${rowNum}: Revenu net (${netIncome}) supérieur au brut (${grossIncome})`)
        }

        validatedRows.push({
          ...row,
          resolved_driver_id: driver.id,
          record_date: recordDate,
          gross_income: grossIncome,
          net_income: netIncome,
          trip_count: tripCount,
          row_number: rowNum
        })

      } catch (err) {
        result.errors.push({
          row: rowNum,
          error: err instanceof Error ? err.message : 'Erreur inconnue',
          data: row
        })
      }
    }

    // If dry run, return validation results without inserting
    if (dry_run) {
      return new Response(
        JSON.stringify({
          success: result.errors.length === 0,
          validated: validatedRows.length,
          errors: result.errors,
          warnings: result.warnings,
          preview: validatedRows.slice(0, 10).map(r => ({
            driver_id: r.resolved_driver_id,
            record_date: r.record_date,
            gross_income: r.gross_income,
            net_income: r.net_income,
            trip_count: r.trip_count,
            source: r.source || 'bulk_import'
          }))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Insert validated records
    const recordsToInsert = validatedRows.map(row => ({
      driver_id: row.resolved_driver_id,
      record_date: row.record_date,
      gross_income: row.gross_income,
      net_income: row.net_income,
      trip_count: row.trip_count,
      source: row.source || 'bulk_import',
      raw_data: {
        original_row: row.row_number,
        notes: row.notes,
        imported_at: new Date().toISOString(),
        imported_by: admin_user_id || 'system'
      }
    }))

    // Insert in batches of 100
    const batchSize = 100
    for (let i = 0; i < recordsToInsert.length; i += batchSize) {
      const batch = recordsToInsert.slice(i, i + batchSize)
      const { error: insertError } = await supabase
        .from('income_records')
        .insert(batch)

      if (insertError) {
        // Try to insert one by one to identify which ones fail
        for (const record of batch) {
          const { error } = await supabase.from('income_records').insert(record)
          if (error) {
            result.errors.push({
              row: (record.raw_data as any).original_row,
              error: error.message,
              data: record
            })
            result.skipped++
          } else {
            result.imported++
          }
        }
      } else {
        result.imported += batch.length
      }
    }

    // Log audit entry
    if (admin_user_id) {
      await supabase.from('admin_audit_logs').insert({
        admin_user_id,
        action: 'bulk_income_import',
        entity_type: 'income_records',
        details: {
          total_rows: rows.length,
          imported: result.imported,
          skipped: result.skipped,
          errors: result.errors.length
        }
      })
    }

    console.log(`Import complete: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} errors`)

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Import error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

function normalizePhone(phone: string): string {
  if (!phone) return ''
  // Remove all non-digits and leading zeros
  return phone.replace(/\D/g, '').replace(/^0+/, '')
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null

  // Try ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr
  }

  // Try DD/MM/YYYY format
  const dmyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // Try MM/DD/YYYY format
  const mdyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdyMatch) {
    const [, month, day, year] = mdyMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // Try to parse as Date object
  try {
    const date = new Date(dateStr)
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]
    }
  } catch {
    // Ignore parsing errors
  }

  return null
}
