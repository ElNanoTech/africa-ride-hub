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
    // SECURITY: Admin-only endpoint. Reads KYC submissions including bank info.
    const ctx = await authenticate(req);
    if (!ctx) return unauthorized(corsHeaders);
    const admin = await isAdmin(ctx.supabaseAdmin, ctx.userId);
    if (!admin) return forbidden(corsHeaders, 'Admin access required');

    const { kycSubmissionId } = await req.json();

    if (!kycSubmissionId) {
      return new Response(
        JSON.stringify({ error: 'kycSubmissionId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = ctx.supabaseAdmin;

    // Check feature flag
    const { data: flagEnabled } = await supabase.rpc('is_feature_enabled', { p_flag_key: 'ai_kyc_validation' });
    if (!flagEnabled) {
      return new Response(
        JSON.stringify({ error: 'AI KYC validation is not enabled' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch KYC submission
    const { data: submission, error: fetchError } = await supabase
      .from('kyc_submissions')
      .select('*, driver:drivers(full_name)')
      .eq('id', kycSubmissionId)
      .single();

    if (fetchError || !submission) {
      return new Response(
        JSON.stringify({ error: 'KYC submission not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the document URLs
    const idProofUrl = submission.id_proof_url;
    const licenseUrl = submission.license_url;

    // Build the AI validation prompt
    const prompt = `Tu es un expert en vérification d'identité pour une plateforme de location de véhicules VTC en Afrique de l'Ouest.

Analyse cette soumission KYC et fournis un rapport de pré-validation:

INFORMATIONS SOUMISES:
- Conducteur: ${(submission as any).driver?.full_name || 'Inconnu'}
- Banque: ${submission.bank_name}
- Numéro de compte: ${submission.bank_account_number ? '****' + submission.bank_account_number.slice(-4) : 'Non fourni'}
- Pièce d'identité: ${idProofUrl ? 'Document soumis' : 'Non fourni'}
- Permis de conduire: ${licenseUrl ? 'Document soumis' : 'Non fourni'}

VÉRIFIE:
1. La cohérence des informations (nom, banque)
2. Si tous les documents requis sont présents
3. Signale tout problème potentiel

Réponds en JSON:
{
  "validation_score": 0-100,
  "status": "pass" | "review_needed" | "flag",
  "checks": [
    {"check": "nom du check", "passed": true/false, "note": "détail"}
  ],
  "recommendation": "recommandation pour l'admin",
  "flags": ["liste des problèmes détectés"]
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
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Tu es un assistant de vérification KYC. Réponds uniquement en JSON valide.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI error:', aiResponse.status, errorText);
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
      throw new Error('AI validation failed');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    let validationResult;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      validationResult = jsonMatch ? JSON.parse(jsonMatch[0]) : { status: 'review_needed', recommendation: 'Vérification manuelle requise' };
    } catch {
      validationResult = { status: 'review_needed', recommendation: 'Impossible d\'analyser automatiquement, vérification manuelle requise' };
    }

    // Store the AI validation result
    await supabase.from('ai_explanations').insert({
      driver_id: submission.driver_id,
      explanation_type: 'kyc_validation',
      content: JSON.stringify(validationResult),
      facts_used: {
        kyc_submission_id: kycSubmissionId,
        bank_name: submission.bank_name,
        has_id_proof: !!idProofUrl,
        has_license: !!licenseUrl,
      },
    });

    // Log usage
    const usage = aiData.usage;
    await supabase.from('ai_usage_logs').insert({
      customer_id: submission.customer_id || null,
      driver_id: submission.driver_id,
      feature_key: 'ai_kyc_validation',
      model_used: 'google/gemini-2.5-flash',
      input_tokens: usage?.prompt_tokens || 0,
      output_tokens: usage?.completion_tokens || 0,
      total_tokens: usage?.total_tokens || 0,
      success: true,
    });

    console.log('KYC AI validation complete for submission:', kycSubmissionId, 'Status:', validationResult.status);

    return new Response(
      JSON.stringify(validationResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ai-kyc-validation:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
