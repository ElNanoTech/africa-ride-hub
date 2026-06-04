import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Yango API configuration
// Update YANGO_API_URL to your actual Yango/Yango Pro fleet API endpoint
// Yango migrated from fleet-api.taxi.yandex.net to fleet-api.yango.tech.
// Old host now responds with HTTP 410 "bad request host".
const YANGO_API_URL = "https://fleet-api.yango.tech";

interface YangoDriverIncome {
  driver_id: string;
  date: string;
  gross_income: number;
  net_income: number;
  trip_count: number;
  raw_data?: Record<string, unknown>;
}

async function fetchYangoDriverIncome(
  apiKey: string,
  parkId: string,
  driverId: string,
  dateFrom: string,
  dateTo: string
): Promise<YangoDriverIncome[]> {
  // Yango Fleet API - fetch driver transactions/income
  const response = await fetch(
    `${YANGO_API_URL}/v2/parks/driver-profiles/transactions/list`,
    {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "X-Client-ID": `taxi/park/${parkId}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: {
          park: {
            id: parkId,
            driver_profile: { id: driverId },
            transaction: {
              event_at: {
                from: `${dateFrom}T00:00:00+00:00`,
                to: `${dateTo}T23:59:59+00:00`,
              },
            },
          },
        },
        limit: 1000,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Yango API error [${response.status}]: ${errorText}`);
  }

  const data = await response.json();
  const transactions = data?.transactions || [];

  // Group transactions by date and aggregate
  const dailyIncome: Record<string, { gross: number; net: number; trips: number; raw: unknown[] }> = {};

  for (const tx of transactions) {
    const date = tx.event_at?.substring(0, 10);
    if (!date) continue;

    if (!dailyIncome[date]) {
      dailyIncome[date] = { gross: 0, net: 0, trips: 0, raw: [] };
    }

    const amount = Number(tx.amount) || 0;
    if (amount > 0) {
      dailyIncome[date].gross += amount;
    }
    dailyIncome[date].net += amount;
    if (tx.category_name === "trip" || tx.category === "order") {
      dailyIncome[date].trips += 1;
    }
    dailyIncome[date].raw.push(tx);
  }

  return Object.entries(dailyIncome).map(([date, data]) => ({
    driver_id: driverId,
    date,
    gross_income: Math.round(data.gross),
    net_income: Math.round(data.net),
    trip_count: data.trips,
    raw_data: { transactions: data.raw },
  }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const yangoApiKey = Deno.env.get("YANGO_API_KEY");
    if (!yangoApiKey) {
      throw new Error("YANGO_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    let parkId = body.park_id || Deno.env.get("YANGO_PARK_ID") || "";
    // Strip taxi/park/ prefix if user included it
    parkId = parkId.replace(/^taxi\/park\//, "");
    const specificDriverId = body.driver_id; // Optional: sync only one driver

    // Default: sync last 7 days
    const now = new Date();
    const dateFrom = body.date_from || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const dateTo = body.date_to || now.toISOString().split("T")[0];

    console.log(`Syncing Yango income from ${dateFrom} to ${dateTo}, park: ${parkId}, apiKey length: ${yangoApiKey?.length}, clientID: taxi/park/${parkId}`);

    // Get drivers to sync
    let driversQuery = supabase
      .from("drivers")
      .select("id, yango_driver_id, customer_id")
      .neq("yango_driver_id", "")
      .eq("driver_status", "active");

    if (specificDriverId) {
      driversQuery = driversQuery.eq("id", specificDriverId);
    }

    const { data: drivers, error: driversError } = await driversQuery;
    if (driversError) throw driversError;

    if (!drivers || drivers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No drivers to sync", synced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalSynced = 0;
    const errors: string[] = [];

    for (const driver of drivers) {
      try {
        const incomeData = await fetchYangoDriverIncome(
          yangoApiKey,
          parkId,
          driver.yango_driver_id,
          dateFrom,
          dateTo
        );

        for (const record of incomeData) {
          // Upsert income record (avoid duplicates)
          const { error: upsertError } = await supabase
            .from("income_records")
            .upsert(
              {
                driver_id: driver.id,
                record_date: record.date,
                gross_income: record.gross_income,
                net_income: record.net_income,
                trip_count: record.trip_count,
                raw_data: record.raw_data,
                source: "yango_api",
                status: "approved",
                trust_weight: 1.0,
                customer_id: driver.customer_id,
              },
              {
                onConflict: "driver_id,record_date,source",
                ignoreDuplicates: false,
              }
            );

          if (upsertError) {
            // If unique constraint doesn't exist, fallback to insert-or-skip
            const { error: insertError } = await supabase
              .from("income_records")
              .insert({
                driver_id: driver.id,
                record_date: record.date,
                gross_income: record.gross_income,
                net_income: record.net_income,
                trip_count: record.trip_count,
                raw_data: record.raw_data,
                source: "yango_api",
                status: "approved",
                trust_weight: 1.0,
                customer_id: driver.customer_id,
              });

            if (insertError && !insertError.message.includes("duplicate")) {
              throw insertError;
            }
          }
          totalSynced++;
        }

        console.log(`Synced ${incomeData.length} records for driver ${driver.yango_driver_id}`);
      } catch (driverError: unknown) {
        const msg = driverError instanceof Error ? driverError.message : String(driverError);
        errors.push(`Driver ${driver.yango_driver_id}: ${msg}`);
        console.error(`Error syncing driver ${driver.yango_driver_id}:`, driverError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced: totalSynced,
        drivers_processed: drivers.length,
        date_range: { from: dateFrom, to: dateTo },
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Yango sync error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
