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
    // SECURITY: Authenticate caller. The chatbot exposes private driver data
    // (KYC status, payments, loans), so the requested driverId must match the
    // caller's own driver record — unless the caller is an admin.
    const ctx = await authenticate(req);
    if (!ctx) return unauthorized(corsHeaders);

    const { messages, driverId } = await req.json();

    if (!driverId || !messages?.length) {
      return new Response(
        JSON.stringify({ error: 'driverId and messages are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = ctx.supabaseAdmin;

    const callerIsAdmin = await isAdmin(supabase, ctx.userId);
    if (!callerIsAdmin) {
      const ownDriverId = await getDriverIdForUser(supabase, ctx.userId);
      if (!ownDriverId || ownDriverId !== driverId) {
        return forbidden(corsHeaders, 'You can only query your own driver record');
      }
    }

    // Check feature flag
    const { data: flagEnabled } = await supabase.rpc('is_feature_enabled', { p_flag_key: 'ai_driver_chatbot' });
    if (!flagEnabled) {
      return new Response(
        JSON.stringify({ error: 'Cette fonctionnalité n\'est pas activée pour votre compte.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch driver context in parallel
    const [driverRes, scoreRes, rentalsRes, paymentsRes, loansRes, kycRes] = await Promise.all([
      supabase.from('drivers').select('full_name, phone_number, kyc_status, driver_status').eq('id', driverId).single(),
      supabase.from('credit_scores').select('score, tier, status, driving_impact, payment_impact, income_impact').eq('driver_id', driverId).order('calculation_week', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('rentals').select('status, start_date, end_date, vehicle_id').eq('driver_id', driverId).order('created_at', { ascending: false }).limit(3),
      supabase.from('payments').select('amount, status, due_date, payment_type').eq('driver_id', driverId).order('due_date', { ascending: false }).limit(5),
      supabase.from('loans').select('amount_requested, amount_approved, status, loan_type').eq('driver_id', driverId).order('applied_at', { ascending: false }).limit(3),
      supabase.from('kyc_submissions').select('status, rejection_reason, submitted_at').eq('driver_id', driverId).order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const driver = driverRes.data;
    const score = scoreRes.data;
    const rentals = rentalsRes.data || [];
    const payments = paymentsRes.data || [];
    const loans = loansRes.data || [];
    const kyc = kycRes.data;

    const pendingPayments = payments.filter(p => p.status === 'pending');
    const overduePayments = payments.filter(p => p.status === 'overdue');

    const systemPrompt = `Tu es l'assistant virtuel DAM Flotte, un conseiller intelligent pour les conducteurs VTC en Afrique de l'Ouest.

CONTEXTE DU CONDUCTEUR:
- Nom: ${driver?.full_name || 'Conducteur'}
- Statut: ${driver?.driver_status || 'inconnu'}
- KYC: ${driver?.kyc_status || 'non soumis'}${kyc?.rejection_reason ? ` (Raison refus: ${kyc.rejection_reason})` : ''}
- Score DAM: ${score ? `${score.score}/1000 (Niveau ${score.tier})` : 'Pas encore calculé'}
${score ? `  - Conduite: ${score.driving_impact || 0} pts | Paiements: ${score.payment_impact || 0} pts | Revenus: ${score.income_impact || 0} pts` : ''}
- Locations actives: ${rentals.filter(r => r.status === 'active').length}
- Paiements en attente: ${pendingPayments.length} (${pendingPayments.reduce((s, p) => s + p.amount, 0)} FCFA)
- Paiements en retard: ${overduePayments.length}
- Prêts: ${loans.map(l => `${l.loan_type} - ${l.status} (${l.amount_requested} FCFA)`).join(', ') || 'Aucun'}

RÈGLES:
1. Réponds TOUJOURS en français simple et accessible
2. Sois encourageant, positif et pratique
3. Base tes réponses UNIQUEMENT sur les données réelles ci-dessus
4. Si le conducteur demande quelque chose que tu ne sais pas, dis-le honnêtement
5. Donne des conseils concrets et actionnables
6. Ne révèle jamais de données sensibles d'autres conducteurs
7. Limite tes réponses à 3-5 phrases maximum
8. Utilise des emojis avec modération pour rendre les réponses engageantes`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-10), // Keep last 10 messages for context
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Service temporairement surchargé. Réessayez dans quelques instants.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Service IA non disponible.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      return new Response(JSON.stringify({ error: 'Erreur du service IA' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log usage (async, don't block response)
    const driverData = await supabase.from('drivers').select('customer_id').eq('id', driverId).single();
    supabase.from('ai_usage_logs').insert({
      customer_id: driverData.data?.customer_id || null,
      driver_id: driverId,
      feature_key: 'ai_driver_chatbot',
      model_used: 'google/gemini-3-flash-preview',
      success: true,
    }).then(() => {});

    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (error) {
    console.error('Error in ai-driver-chatbot:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
