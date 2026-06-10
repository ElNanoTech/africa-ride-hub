import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-runtime",
};

const ACCIDENT_BUCKET = "accident-evidence";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-2.5-flash";

function pickMime(name: string | null | undefined, fallback = "audio/webm"): string {
  if (!name) return fallback;
  const lower = name.toLowerCase();
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".m4a") || lower.endsWith(".mp4")) return "audio/mp4";
  if (lower.endsWith(".ogg") || lower.endsWith(".opus")) return "audio/ogg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".webm")) return "audio/webm";
  return fallback;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) throw new Error("Missing LOVABLE_API_KEY");

    const { file_id } = await req.json();
    if (!file_id) throw new Error("file_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: file, error: fErr } = await supabase
      .from("accident_files")
      .select("id, storage_path, mime_type, original_filename, accident_id")
      .eq("id", file_id)
      .single();
    if (fErr || !file) throw new Error(`File not found: ${fErr?.message}`);
    if (!file.storage_path) throw new Error("No storage_path on file");

    await supabase.from("accident_files").update({ transcript_status: "processing" }).eq("id", file_id);

    // Download audio
    const { data: blob, error: dlErr } = await supabase.storage.from(ACCIDENT_BUCKET).download(file.storage_path);
    if (dlErr || !blob) throw new Error(`Download failed: ${dlErr?.message}`);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const base64 = bytesToBase64(bytes);
    const mime = file.mime_type || pickMime(file.original_filename);

    // Call Lovable AI Gateway (OpenAI-compatible) with multimodal audio input
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You transcribe voice notes from drivers reporting traffic accidents in Côte d'Ivoire. " +
              "Drivers may speak French, Dioula/Jula, Bambara, Baoulé, English, or another West African language. " +
              'Respond ONLY with strict JSON: {"language":"<ISO name or best guess>","transcript":"<verbatim transcript in the original language>","french_translation":"<faithful French translation; if original is already French, repeat it here>"}. ' +
              "No prose outside the JSON.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe this voice note from a driver reporting an accident." },
              {
                type: "input_audio",
                input_audio: {
                  data: base64,
                  format: mime.includes("mp3") ? "mp3"
                    : mime.includes("wav") ? "wav"
                    : mime.includes("ogg") ? "ogg"
                    : mime.includes("mp4") || mime.includes("m4a") ? "m4a"
                    : "webm",
                },
              },
            ],
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      await supabase.from("accident_files").update({ transcript_status: "failed", transcript: `[Erreur ${aiRes.status}] ${text.slice(0, 300)}` }).eq("id", file_id);
      return new Response(JSON.stringify({ error: `AI ${aiRes.status}`, body: text }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "";
    let language = "unknown";
    let transcript = "";
    let french = "";
    try {
      const cleaned = String(raw).replace(/```json\s*|\s*```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      language = parsed.language ?? "unknown";
      transcript = parsed.transcript ?? "";
      french = parsed.french_translation ?? transcript;
    } catch {
      transcript = String(raw);
      french = String(raw);
    }

    const finalText =
      language.toLowerCase().includes("fren") || language.toLowerCase().includes("fra")
        ? french || transcript
        : `${french}\n\n— Original (${language}) —\n${transcript}`;

    await supabase
      .from("accident_files")
      .update({ transcript: finalText, transcript_lang: language, transcript_status: "ready" })
      .eq("id", file_id);

    return new Response(JSON.stringify({ ok: true, language, transcript: finalText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});