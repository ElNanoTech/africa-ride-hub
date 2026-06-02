import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, getDriverIdForUser, isAdmin, unauthorized, forbidden } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Authenticate caller and verify ownership of driverId.
    const ctx = await authenticate(req);
    if (!ctx) return unauthorized(corsHeaders);

    const { driverId } = await req.json();

    if (!driverId) {
      return new Response(
        JSON.stringify({ error: 'driverId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = ctx.supabaseAdmin;

    const callerIsAdmin = await isAdmin(supabase, ctx.userId);
    if (!callerIsAdmin) {
      const ownDriverId = await getDriverIdForUser(supabase, ctx.userId);
      if (!ownDriverId || ownDriverId !== driverId) {
        return forbidden(corsHeaders, 'You can only query your own income');
      }
    }

    // Check feature flag
    const { data: flagEnabled } = await supabase.rpc('is_feature_enabled', { p_flag_key: 'ai_income_insights' });
    if (!flagEnabled) {
      return new Response(
        JSON.stringify({ error: 'Cette fonctionnalité n\'est pas activée.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for cached insights (last 24h)
    const { data: cached } = await supabase
      .from('ai_explanations')
      .select('*')
      .eq('driver_id', driverId)
      .eq('explanation_type', 'income_insights')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached) {
      try {
        return new Response(
          JSON.stringify(JSON.parse(cached.content)),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch { /* parse error, regenerate */ }
    }

    // Fetch last 30 days of income
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const [incomeRes, driverRes] = await Promise.all([
      supabase.from('income_records')
        .select('net_income, gross_income, trip_count, record_date, source')
        .eq('driver_id', driverId)
        .gte('record_date', thirtyDaysAgo)
        .in('status', ['approved', 'pending'])
        .order('record_date', { ascending: true }),
      supabase.from('drivers').select('full_name').eq('id', driverId).single(),
    ]);

    const records = incomeRes.data || [];
    const driver = driverRes.data;

    if (records.length === 0) {
      return new Response(
        JSON.stringify({ 
          summary: 'Pas assez de données pour générer des insights.',
          insights: [],
          recommendations: [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate stats
    const totalNet = records.reduce((s, r) => s + (r.net_income || 0), 0);
    const totalGross = records.reduce((s, r) => s + (r.gross_income || 0), 0);
    const totalTrips = records.reduce((s, r) => s + (r.trip_count || 0), 0);
    const daysWorked = new Set(records.map(r => r.record_date)).size;
    const avgDailyNet = daysWorked > 0 ? Math.round(totalNet / daysWorked) : 0;
    const avgPerTrip = totalTrips > 0 ? Math.round(totalNet / totalTrips) : 0;

    // Weekly breakdown
    const weeklyData: Record<string, { net: number; trips: number; days: number }> = {};
    records.forEach(r => {
      const d = new Date(r.record_date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay() + 1);
      const key = weekStart.toISOString().split('T')[0];
      if (!weeklyData[key]) weeklyData[key] = { net: 0, trips: 0, days: 0 };
      weeklyData[key].net += r.net_income || 0;
      weeklyData[key].trips += r.trip_count || 0;
      weeklyData[key].days++;
    });

    const weeks = Object.entries(weeklyData).sort(([a], [b]) => a.localeCompare(b));
    const weeklyTrend = weeks.length >= 2
      ? ((weeks[weeks.length - 1][1].net - weeks[0][1].net) / Math.max(weeks[0][1].net, 1) * 100).toFixed(0)
      : '0';

    const prompt = `Analyse les revenus de ce conducteur VTC en Côte d'Ivoire et donne des insights actionnables.

DONNÉES (30 derniers jours):
- Conducteur: ${driver?.full_name || 'Conducteur'}
- Revenu net total: ${totalNet} FCFA
- Revenu brut total: ${totalGross} FCFA
- Courses totales: ${totalTrips}
- Jours travaillés: ${daysWorked}/30
- Moyenne journalière: ${avgDailyNet} FCFA
- Moyenne par course: ${avgPerTrip} FCFA
- Tendance hebdomadaire: ${weeklyTrend}%
- Semaines: ${weeks.map(([w, d]) => `${w}: ${d.net} FCFA, ${d.trips} courses, ${d.days} jours`).join(' | ')}

Réponds en JSON:
{
  "summary": "Résumé en 2 phrases des revenus",
  "insights": [
    {"title": "Titre court", "description": "Analyse en 1-2 phrases", "type": "positive|neutral|warning", "metric": "valeur clé"}
  ],
  "recommendations": [
    {"title": "Action", "description": "Comment améliorer", "impact": "high|medium|low", "category": "timing|efficiency|consistency"}
  ],
  "projected_monthly": nombre estimé du revenu mensuel
}`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'Tu es un analyste financier pour conducteurs VTC. Réponds en JSON valide, en français.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
      }),
    });

    if (!aiResponse.ok) {
      console.error('AI error:', aiResponse.status);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'AI service payment required' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error('AI analysis failed');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: 'Analyse non disponible', insights: [], recommendations: [] };
    } catch {
      result = { summary: 'Analyse non disponible', insights: [], recommendations: [] };
    }

    // Cache the result
    await supabase.from('ai_explanations').insert({
      driver_id: driverId,
      explanation_type: 'income_insights',
      content: JSON.stringify(result),
      facts_used: { totalNet, totalGross, totalTrips, daysWorked, avgDailyNet, period: '30d' },
    });

    // Log usage
    const usage = aiData.usage;
    const driverForCustomer = await supabase.from('drivers').select('customer_id').eq('id', driverId).single();
    await supabase.from('ai_usage_logs').insert({
      customer_id: driverForCustomer.data?.customer_id || null,
      driver_id: driverId,
      feature_key: 'ai_income_insights',
      model_used: 'google/gemini-3-flash-preview',
      input_tokens: usage?.prompt_tokens || 0,
      output_tokens: usage?.completion_tokens || 0,
      total_tokens: usage?.total_tokens || 0,
      success: true,
    });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ai-income-insights:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
