import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, isAdmin, unauthorized, forbidden } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Admin-only endpoint. Verify JWT + admin role before reading
    // any driver / fleet data.
    const ctx = await authenticate(req);
    if (!ctx) return unauthorized(corsHeaders);
    const admin = await isAdmin(ctx.supabaseAdmin, ctx.userId);
    if (!admin) return forbidden(corsHeaders, 'Admin access required');

    const { action, driverId, context } = await req.json();

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'action is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = ctx.supabaseAdmin;

    // Check feature flag
    const { data: flagEnabled } = await supabase.rpc('is_feature_enabled', { p_flag_key: 'ai_admin_assistant' });
    if (!flagEnabled) {
      return new Response(
        JSON.stringify({ error: 'AI Admin Assistant is not enabled' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    let prompt = '';
    let systemPrompt = 'Tu es un assistant IA pour les gestionnaires de flottes de véhicules VTC en Afrique de l\'Ouest. Réponds en français. Sois concis et actionnable.';

    if (action === 'driver_summary' && driverId) {
      // Fetch comprehensive driver data
      const [driverRes, scoresRes, paymentsRes, rentalsRes, loansRes, incomeRes] = await Promise.all([
        supabase.from('drivers').select('*').eq('id', driverId).single(),
        supabase.from('credit_scores').select('score, tier, status, calculation_week, driving_impact, payment_impact, income_impact').eq('driver_id', driverId).order('calculation_week', { ascending: false }).limit(4),
        supabase.from('payments').select('amount, status, due_date, paid_date, payment_type').eq('driver_id', driverId).order('due_date', { ascending: false }).limit(12),
        supabase.from('rentals').select('status, start_date, end_date').eq('driver_id', driverId).order('created_at', { ascending: false }).limit(5),
        supabase.from('loans').select('amount_requested, amount_approved, status, loan_type').eq('driver_id', driverId).order('applied_at', { ascending: false }).limit(5),
        supabase.from('income_records').select('net_income, trip_count, record_date').eq('driver_id', driverId).order('record_date', { ascending: false }).limit(30),
      ]);

      const driver = driverRes.data;
      const scores = scoresRes.data || [];
      const payments = paymentsRes.data || [];
      const rentals = rentalsRes.data || [];
      const loans = loansRes.data || [];
      const income = incomeRes.data || [];

      const paidOnTime = payments.filter(p => p.status === 'paid').length;
      const totalPayments = payments.length;
      const overduePayments = payments.filter(p => p.status === 'overdue').length;
      const totalIncome = income.reduce((s, r) => s + (r.net_income || 0), 0);
      const totalTrips = income.reduce((s, r) => s + (r.trip_count || 0), 0);

      prompt = `Génère un résumé exécutif de ce conducteur pour un gestionnaire de flotte:

PROFIL:
- Nom: ${driver?.full_name}
- Statut: ${driver?.driver_status}
- KYC: ${driver?.kyc_status}
- Inscrit depuis: ${driver?.created_at?.split('T')[0]}

SCORE (dernières 4 semaines):
${scores.map(s => `  ${s.calculation_week}: ${s.score}/1000 (${s.tier})`).join('\n')}
Tendance: ${scores.length >= 2 ? (scores[0].score > scores[1].score ? '↑ En hausse' : scores[0].score < scores[1].score ? '↓ En baisse' : '→ Stable') : 'Insuffisant'}

PAIEMENTS: ${paidOnTime}/${totalPayments} à temps | ${overduePayments} en retard
LOCATIONS: ${rentals.filter(r => r.status === 'active').length} actives, ${rentals.filter(r => r.status === 'completed').length} terminées
PRÊTS: ${loans.map(l => `${l.loan_type}: ${l.status}`).join(', ') || 'Aucun'}
REVENUS (30j): ${totalIncome} FCFA | ${totalTrips} courses

Réponds en JSON:
{
  "summary": "Résumé en 2-3 phrases",
  "risk_level": "low|medium|high",
  "risk_factors": ["facteurs de risque identifiés"],
  "strengths": ["points forts"],
  "recommendation": "Recommandation d'action pour le gestionnaire",
  "loan_eligible": true/false,
  "loan_max_amount": montant suggéré ou null
}`;

    } else if (action === 'fleet_analysis') {
      // Fleet-wide analysis
      const [driversRes, paymentsRes, scoresRes] = await Promise.all([
        supabase.from('drivers').select('id, driver_status, kyc_status').limit(200),
        supabase.from('payments').select('status, amount').order('created_at', { ascending: false }).limit(500),
        supabase.from('credit_scores').select('score, tier, driver_id').order('calculation_week', { ascending: false }).limit(200),
      ]);

      const drivers = driversRes.data || [];
      const payments = paymentsRes.data || [];
      const scores = scoresRes.data || [];

      const activeDrivers = drivers.filter(d => d.driver_status === 'active').length;
      const kycVerified = drivers.filter(d => d.kyc_status === 'verified' || d.kyc_status === 'approved').length;
      const overdueAmount = payments.filter(p => p.status === 'overdue').reduce((s, p) => s + p.amount, 0);
      const tierDistribution = scores.reduce((acc, s) => { acc[s.tier] = (acc[s.tier] || 0) + 1; return acc; }, {} as Record<string, number>);

      prompt = `Analyse l'état global de la flotte:
- Conducteurs actifs: ${activeDrivers}/${drivers.length}
- KYC vérifiés: ${kycVerified}/${drivers.length}
- Montant impayé total: ${overdueAmount} FCFA
- Distribution des niveaux: ${JSON.stringify(tierDistribution)}

Réponds en JSON:
{
  "health_score": 0-100,
  "summary": "État en 2 phrases",
  "alerts": [{"title": "alerte", "severity": "high|medium|low", "action": "action"}],
  "opportunities": ["opportunités identifiées"],
  "kpi_targets": {"metric": "objectif suggéré"}
}`;

    } else {
      return new Response(
        JSON.stringify({ error: 'Unknown action: ' + action }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
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
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'Parse failed' };
    } catch {
      result = { summary: content || 'Analyse non disponible' };
    }

    // Cache driver summaries
    if (action === 'driver_summary' && driverId) {
      await supabase.from('ai_explanations').insert({
        driver_id: driverId,
        explanation_type: 'admin_driver_summary',
        content: JSON.stringify(result),
        facts_used: { action, generated_at: new Date().toISOString() },
      });
    }

    // Log usage
    const usage = aiData.usage;
    await supabase.from('ai_usage_logs').insert({
      driver_id: driverId || null,
      feature_key: 'ai_admin_assistant',
      model_used: 'google/gemini-2.5-pro',
      input_tokens: usage?.prompt_tokens || 0,
      output_tokens: usage?.completion_tokens || 0,
      total_tokens: usage?.total_tokens || 0,
      success: true,
      metadata: { action },
    });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ai-admin-assistant:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
