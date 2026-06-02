import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, getDriverIdForUser, isAdmin, unauthorized, forbidden } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Authenticate caller. The credit_score being explained must
    // belong to the caller (driver) or the caller must be an admin.
    const ctx = await authenticate(req);
    if (!ctx) return unauthorized(corsHeaders);

    const { creditScoreId } = await req.json();

    if (!creditScoreId) {
      return new Response(
        JSON.stringify({ error: 'creditScoreId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = ctx.supabaseAdmin;

    // Fetch credit score with breakdowns
    const { data: creditScore, error: scoreError } = await supabase
      .from('credit_scores')
      .select(`
        *,
        breakdowns:credit_score_breakdowns(*)
      `)
      .eq('id', creditScoreId)
      .single();

    if (scoreError || !creditScore) {
      console.error('Error fetching credit score:', scoreError);
      return new Response(
        JSON.stringify({ error: 'Credit score not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if we already have a recent explanation for this score
    const { data: existingExplanation } = await supabase
      .from('ai_explanations')
      .select('*')
      .eq('credit_score_id', creditScoreId)
      .eq('explanation_type', 'score_summary')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingExplanation) {
      console.log('Returning existing explanation');
      return new Response(
        JSON.stringify({ explanation: existingExplanation }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch driver info
    const { data: driver } = await supabase
      .from('drivers')
      .select('full_name')
      .eq('id', creditScore.driver_id)
      .single();

    // Build context for AI
    const breakdownSummary = creditScore.breakdowns?.map((b: any) => 
      `${b.factor}: ${b.impact_points} points (${b.data_available ? 'données disponibles' : 'données insuffisantes'})`
    ).join('\n') || 'Aucun détail disponible';

    const tierDescriptions: Record<string, string> = {
      'A': 'Excellent - Accès prioritaire aux prêts et meilleures conditions',
      'B': 'Très bon - Éligible à la plupart des prêts avec bonnes conditions',
      'C': 'Moyen - Éligible aux prêts standards',
      'D': 'À améliorer - Accès limité aux prêts',
      'E': 'Nouveau/En développement - Continuez à construire votre historique',
    };

    const prompt = `Tu es un conseiller financier pour une application de location de véhicules pour chauffeurs VTC en Afrique. 
    
Génère une explication personnalisée et encourageante du score de crédit pour ce conducteur.

Informations du conducteur:
- Nom: ${driver?.full_name || 'Conducteur'}
- Score actuel: ${creditScore.score}/1000
- Niveau: ${creditScore.tier} (${tierDescriptions[creditScore.tier] || ''})
- Statut: ${creditScore.status === 'provisional' ? 'Provisoire' : 'Confirmé'}

Répartition des points:
- Conduite: ${creditScore.driving_impact || 0} points ${creditScore.driving_data_available ? '' : '(données insuffisantes)'}
- Paiements: ${creditScore.payment_impact || 0} points ${creditScore.payment_data_available ? '' : '(données insuffisantes)'}
- Revenus: ${creditScore.income_impact || 0} points ${creditScore.income_data_available ? '' : '(données insuffisantes)'}

Détails des facteurs:
${breakdownSummary}

Règles:
1. Écris en français simple et accessible
2. Sois encourageant et positif
3. Mentionne les points forts
4. Donne 1-2 conseils concrets pour améliorer le score
5. Limite ta réponse à 3-4 phrases
6. N'utilise pas de markdown ni de formatage spécial`;

    // Call Lovable AI Gateway
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Calling Lovable AI Gateway...');
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Tu es un conseiller financier bienveillant qui aide les conducteurs à comprendre et améliorer leur score de crédit.' },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Service temporairement indisponible. Réessayez plus tard.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Service AI non disponible.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Erreur lors de la génération de l\'explication' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const generatedContent = aiData.choices?.[0]?.message?.content;

    if (!generatedContent) {
      console.error('No content in AI response:', aiData);
      return new Response(
        JSON.stringify({ error: 'Réponse AI invalide' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('AI explanation generated successfully');

    // Store the explanation
    const { data: savedExplanation, error: saveError } = await supabase
      .from('ai_explanations')
      .insert({
        driver_id: creditScore.driver_id,
        credit_score_id: creditScoreId,
        explanation_type: 'score_summary',
        content: generatedContent,
        facts_used: {
          score: creditScore.score,
          tier: creditScore.tier,
          driving_impact: creditScore.driving_impact,
          payment_impact: creditScore.payment_impact,
          income_impact: creditScore.income_impact,
        },
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving explanation:', saveError);
      // Still return the generated content even if save fails
      return new Response(
        JSON.stringify({ 
          explanation: { content: generatedContent },
          saved: false 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ explanation: savedExplanation }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-score-explanation:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
