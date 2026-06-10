import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-runtime",
};

const BUCKET = "voice-notes";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-2.5-flash";

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

    const { message_id } = await req.json();
    if (!message_id) throw new Error("message_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: msg, error: mErr } = await supabase
      .from("support_ticket_messages")
      .select("id, voice_storage_path")
      .eq("id", message_id)
      .single();
    if (mErr || !msg) throw new Error(`Message not found: ${mErr?.message}`);
    if (!msg.voice_storage_path) throw new Error("No voice_storage_path on message");

    await supabase.from("support_ticket_messages").update({ transcript_status: "processing" }).eq("id", message_id);

    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(msg.voice_storage_path);
    if (dlErr || !blob) throw new Error(`Download failed: ${dlErr?.message}`);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const base64 = bytesToBase64(bytes);

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
              "You transcribe voice notes from drivers contacting support in Côte d'Ivoire. " +
              "Drivers may speak French, Dioula/Jula, Bambara, Baoulé, English, or another West African language. " +
              'Respond ONLY with strict JSON: {"language":"<ISO name or best guess>","transcript":"<verbatim transcript in the original language>","french_translation":"<faithful French translation; if original is already French, repeat it here>"}. ' +
              "No prose outside the JSON.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe this driver's support voice note." },
              { type: "input_audio", input_audio: { data: base64, format: "webm" } },
            ],
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      await supabase.from("support_ticket_messages").update({ transcript_status: "failed", transcript: `[Erreur ${aiRes.status}] ${text.slice(0, 300)}` }).eq("id", message_id);
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
      .from("support_ticket_messages")
      .update({ transcript: finalText, transcript_lang: language, transcript_status: "ready" })
      .eq("id", message_id);

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