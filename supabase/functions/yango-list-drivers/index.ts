import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const YANGO_API_URL = "https://fleet-api.taxi.yandex.net";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("YANGO_API_KEY");
    if (!apiKey) throw new Error("YANGO_API_KEY not configured");
    const body = await req.json().catch(() => ({}));
    let parkId = body.park_id || Deno.env.get("YANGO_PARK_ID") || "";
    parkId = parkId.replace(/^taxi\/park\//, "");
    const includeIncome = body.include_income !== false;

    const now = new Date();
    const dateFrom = body.date_from || new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0];
    const dateTo = body.date_to || now.toISOString().split("T")[0];

    // 1. List drivers
    const listRes = await fetch(`${YANGO_API_URL}/v1/parks/driver-profiles/list`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "X-Client-ID": `taxi/park/${parkId}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: { park: { id: parkId } },
        limit: 1000,
        sort_order: [{ field: "driver_profile.created_date", direction: "desc" }],
      }),
    });
    const listText = await listRes.text();
    if (!listRes.ok) {
      return new Response(JSON.stringify({ success: false, stage: "list", status: listRes.status, error: listText }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const listData = JSON.parse(listText);
    const profiles: Array<Record<string, unknown>> = listData?.driver_profiles || [];

    const drivers = profiles.map((p) => {
      const dp = (p.driver_profile || {}) as Record<string, unknown>;
      return {
        id: dp.id,
        first_name: dp.first_name,
        last_name: dp.last_name,
        middle_name: dp.middle_name,
        phones: dp.phones,
        work_status: dp.work_status,
        balance: (p.balance as Record<string, unknown> | undefined)?.["total_balance"] ?? null,
        created_date: dp.created_date,
      };
    });

    let incomeByDriver: Record<string, { gross: number; net: number; trips: number }> = {};
    if (includeIncome) {
      for (const d of drivers) {
        if (!d.id) continue;
        try {
          const txRes = await fetch(`${YANGO_API_URL}/v2/parks/driver-profiles/transactions/list`, {
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
                  driver_profile: { id: d.id },
                  transaction: {
                    event_at: { from: `${dateFrom}T00:00:00+00:00`, to: `${dateTo}T23:59:59+00:00` },
                  },
                },
              },
              limit: 1000,
            }),
          });
          const txText = await txRes.text();
          if (!txRes.ok) { incomeByDriver[d.id as string] = { gross: 0, net: 0, trips: 0 }; continue; }
          const txData = JSON.parse(txText);
          const txs = txData?.transactions || [];
          let gross = 0, net = 0, trips = 0;
          for (const t of txs) {
            const amt = Number(t.amount) || 0;
            if (amt > 0) gross += amt;
            net += amt;
            if (t.category_name === "trip" || t.category === "order") trips += 1;
          }
          incomeByDriver[d.id as string] = { gross: Math.round(gross), net: Math.round(net), trips };
        } catch (_e) {
          incomeByDriver[d.id as string] = { gross: 0, net: 0, trips: 0 };
        }
      }
    }

    const result = drivers.map((d) => ({
      ...d,
      income: includeIncome ? (incomeByDriver[d.id as string] || { gross: 0, net: 0, trips: 0 }) : null,
    }));

    return new Response(JSON.stringify({
      success: true,
      park_id: parkId,
      date_range: { from: dateFrom, to: dateTo },
      total_drivers: result.length,
      drivers: result,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});