// Neural TTS via ElevenLabs with storage-backed caching by content hash.
// POST { text: string, voice?: string } -> { url: string, cached: boolean }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, runtime",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "tts-cache";
const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"; // Sarah — warm French-capable
const MODEL = "eleven_multilingual_v2";

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    const voice =
      typeof body?.voice === "string" && body.voice.trim() ? body.voice.trim() : DEFAULT_VOICE;
    if (!text) {
      return new Response(JSON.stringify({ error: "text required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (text.length > 3000) {
      return new Response(JSON.stringify({ error: "text too long (max 3000 chars)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const hash = await sha256Hex(`${voice}::${MODEL}::${text}`);
    const path = `${hash.slice(0, 2)}/${hash}.mp3`;

    // Cache hit?
    const existing = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24);
    if (existing.data?.signedUrl) {
      return new Response(
        JSON.stringify({ url: existing.data.signedUrl, cached: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Generate with ElevenLabs
    const ttsResp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: MODEL,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.35,
            use_speaker_boost: true,
            speed: 1.0,
          },
        }),
      },
    );

    if (!ttsResp.ok) {
      const detail = await ttsResp.text();
      console.error("ElevenLabs error", ttsResp.status, detail);
      return new Response(
        JSON.stringify({ error: "tts_provider_error", status: ttsResp.status, detail }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const audio = new Uint8Array(await ttsResp.arrayBuffer());

    const upload = await supabase.storage.from(BUCKET).upload(path, audio, {
      contentType: "audio/mpeg",
      upsert: true,
    });
    if (upload.error) {
      console.error("upload error", upload.error);
    }

    const signed = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24);
    if (!signed.data?.signedUrl) {
      return new Response(JSON.stringify({ error: "sign_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ url: signed.data.signedUrl, cached: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("tts-speak fatal", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});