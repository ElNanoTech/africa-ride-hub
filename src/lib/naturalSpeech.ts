// Natural speech helpers for the driver app.
// - cleanForSpeech: makes UI strings sound natural (FCFA -> "francs CFA", trim IDs).
// - speakNatural: tries the neural TTS edge function first, falls back to the
//   browser's SpeechSynthesis if the network call fails or audio can't play.
import { supabase } from '@/integrations/supabase/routeClient';

/** Make a UI string sound human when read aloud in French. */
export function cleanForSpeech(input: string): string {
  if (!input) return '';
  let text = input;

  // Currency
  text = text.replace(/\bFCFA\b/gi, 'francs CFA');
  text = text.replace(/\bXOF\b/gi, 'francs CFA');

  // Trim long invoice / reference IDs to last 4 chars: "INV-2026-000123" -> "facture 0123"
  text = text.replace(/\b(INV|REF|TXN|DOC)[-_]?[A-Z0-9-]{4,}\b/gi, (m) => {
    const tail = m.replace(/[^A-Z0-9]/gi, '').slice(-4);
    return `numéro ${tail.split('').join(' ')}`;
  });

  // Common abbreviations
  text = text.replace(/\bKYC\b/g, 'vérification d’identité');
  text = text.replace(/\bPIN\b/g, 'code secret');
  text = text.replace(/\bGPS\b/g, 'G P S');

  // Remove decorative punctuation and collapse whitespace
  text = text.replace(/[•·●◆▪►→·]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

export interface SpeechController {
  stop: () => void;
  /** Resolves when playback ends or is stopped. */
  done: Promise<void>;
}

let currentController: SpeechController | null = null;

/** Stop any currently playing speech (neural or browser). */
export function stopAllSpeech(): void {
  if (currentController) currentController.stop();
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function browserFallback(text: string): SpeechController {
  const synth = window.speechSynthesis;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'fr-FR';
  utter.rate = 0.95;
  utter.pitch = 1;
  const voices = synth.getVoices();
  const frVoice =
    voices.find((v) => /fr[-_]FR/i.test(v.lang) && /female|Amelie|Audrey|Marie/i.test(v.name)) ||
    voices.find((v) => v.lang === 'fr-FR') ||
    voices.find((v) => v.lang.startsWith('fr'));
  if (frVoice) utter.voice = frVoice;

  let resolveDone: () => void = () => {};
  const done = new Promise<void>((res) => (resolveDone = res));
  utter.onend = () => resolveDone();
  utter.onerror = () => resolveDone();
  synth.speak(utter);

  return {
    stop: () => {
      synth.cancel();
      resolveDone();
    },
    done,
  };
}

/**
 * Speak the given text with a natural neural voice. Falls back to the
 * browser's built-in speech synthesis if the edge function is unreachable.
 */
export async function speakNatural(rawText: string): Promise<SpeechController> {
  const text = cleanForSpeech(rawText);
  if (!text) {
    const noop: SpeechController = { stop: () => {}, done: Promise.resolve() };
    return noop;
  }

  // Stop anything currently playing
  stopAllSpeech();

  try {
    const { data, error } = await supabase.functions.invoke('tts-speak', {
      body: { text },
    });
    if (error) throw error;
    const url = (data as { url?: string } | null)?.url;
    if (!url) throw new Error('no_url');

    const audio = new Audio(url);
    audio.preload = 'auto';

    let resolveDone: () => void = () => {};
    const done = new Promise<void>((res) => (resolveDone = res));
    audio.onended = () => resolveDone();
    audio.onerror = () => resolveDone();

    try {
      await audio.play();
    } catch (playErr) {
      console.warn('Neural audio play() failed, using browser fallback', playErr);
      const fb = browserFallback(text);
      currentController = fb;
      return fb;
    }

    const ctrl: SpeechController = {
      stop: () => {
        audio.pause();
        audio.currentTime = 0;
        resolveDone();
      },
      done,
    };
    currentController = ctrl;
    return ctrl;
  } catch (err) {
    console.warn('Neural TTS unavailable, falling back to browser voice', err);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const fb = browserFallback(text);
      currentController = fb;
      return fb;
    }
    const noop: SpeechController = { stop: () => {}, done: Promise.resolve() };
    return noop;
  }
}