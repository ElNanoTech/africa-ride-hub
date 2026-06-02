import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, getDriverIdForUser, isAdmin, unauthorized, forbidden } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Authenticate caller and verify the requested driver is the
    // caller (or the caller is an admin).
    const ctx = await authenticate(req);
    if (!ctx) return unauthorized(corsHeaders);

    const { creditScoreId, driverId } = await req.json();

    if (!creditScoreId || !driverId) {
      return new Response(
        JSON.stringify({ error: 'creditScoreId and driverId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = ctx.supabaseAdmin;

    const callerIsAdmin = await isAdmin(supabase, ctx.userId);
    if (!callerIsAdmin) {
      const ownDriverId = await getDriverIdForUser(supabase, ctx.userId);
      if (!ownDriverId || ownDriverId !== driverId) {
        return forbidden(corsHeaders, 'You can only query your own score');
      }
    }

    // Fetch the credit score and breakdowns
    const { data: scoreData, error: scoreError } = await supabase
      .from('credit_scores')
      .select(`
        *,
        breakdowns:credit_score_breakdowns(*)
      `)
      .eq('id', creditScoreId)
      .single();

    if (scoreError) {
      console.error('Error fetching score:', scoreError);
      throw scoreError;
    }

    // Build context for AI
    const breakdowns = scoreData.breakdowns || [];
    const factorAnalysis = breakdowns.map((b: any) => ({
      factor: b.factor,
      impact: b.impact_points,
      weight: b.weight_applied,
      available: b.data_available,
      normalized: b.normalized_value,
    }));

    // Find weakest factors
    const sortedFactors = [...factorAnalysis]
      .filter(f => f.available)
      .sort((a, b) => (a.normalized || 0) - (b.normalized || 0));

    const weakestFactors = sortedFactors.slice(0, 2);

    // Prepare prompt for Lovable AI
    const systemPrompt = `Tu es un conseiller financier pour les conducteurs de véhicules de transport en Côte d'Ivoire. 
Tu aides les conducteurs à améliorer leur score de crédit pour obtenir de meilleurs prêts et conditions de location.
Réponds toujours en français simple et accessible. Sois encourageant et pratique.`;

    const userPrompt = `Voici le profil du conducteur:
- Score actuel: ${scoreData.score}/850
- Niveau: ${scoreData.tier}
- Impact conduite: ${scoreData.driving_impact || 0} points (données disponibles: ${scoreData.driving_data_available})
- Impact paiements: ${scoreData.payment_impact || 0} points (données disponibles: ${scoreData.payment_data_available})  
- Impact revenus: ${scoreData.income_impact || 0} points (données disponibles: ${scoreData.income_data_available})

Facteurs les plus faibles: ${weakestFactors.map(f => f.factor).join(', ')}

Génère 4 conseils personnalisés et pratiques pour améliorer ce score. Format JSON:
{
  "tips": [
    {"title": "Titre court", "description": "Conseil détaillé en 1-2 phrases", "priority": "high|medium|low", "category": "driving|payment|income"},
    ...
  ],
  "encouragement": "Une phrase d'encouragement personnalisée"
}`;

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      // Return fallback tips
      return new Response(
        JSON.stringify({
          tips: [
            {
              title: 'Conduisez prudemment',
              description: 'Évitez les freinages brusques et respectez les limites de vitesse pour améliorer votre score de conduite.',
              priority: 'high',
              category: 'driving',
            },
            {
              title: 'Payez à temps',
              description: 'Effectuez vos paiements de location avant la date limite pour maintenir un bon historique.',
              priority: 'high',
              category: 'payment',
            },
            {
              title: 'Augmentez votre activité',
              description: 'Plus vous effectuez de courses régulièrement, plus votre score de revenus s\'améliore.',
              priority: 'medium',
              category: 'income',
            },
            {
              title: 'Soyez régulier',
              description: 'Une activité stable chaque semaine est plus valorisée qu\'une activité irrégulière.',
              priority: 'medium',
              category: 'income',
            },
          ],
          encouragement: 'Continuez vos efforts, chaque amélioration compte!',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    // Parse the JSON from the AI response
    let parsedTips;
    try {
      // Extract JSON from the response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedTips = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      // Return a default response
      parsedTips = {
        tips: [
          {
            title: 'Améliorez votre conduite',
            description: 'Une conduite plus souple améliore votre score et économise du carburant.',
            priority: 'high',
            category: 'driving',
          },
        ],
        encouragement: 'Vous êtes sur la bonne voie!',
      };
    }

    // Store the tips in ai_explanations table
    const { error: insertError } = await supabase
      .from('ai_explanations')
      .insert({
        driver_id: driverId,
        credit_score_id: creditScoreId,
        explanation_type: 'tips',
        content: JSON.stringify(parsedTips),
        facts_used: {
          score: scoreData.score,
          tier: scoreData.tier,
          weakest_factors: weakestFactors,
        },
      });

    if (insertError) {
      console.error('Error storing tips:', insertError);
      // Don't fail the request, just log
    }

    console.log('Generated tips for driver:', driverId);

    return new Response(
      JSON.stringify(parsedTips),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in generate-score-tips:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
