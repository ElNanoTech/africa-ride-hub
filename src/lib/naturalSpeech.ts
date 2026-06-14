// Natural speech helpers for the driver app.
// - cleanForSpeech: makes UI strings sound natural before audio playback.
// - speakNatural: tries the neural TTS edge function first, then falls back
//   to the browser's SpeechSynthesis if audio generation or playback fails.
import { supabase } from '@/integrations/supabase/routeClient';

const HUMAN_VOICE_HINTS = [
  'google francais',
  'google français',
  'thomas',
  'audrey',
  'amelie',
  'amélie',
  'denise',
  'hortense',
  'paul',
  'siri',
  'premium',
  'enhanced',
  'natural',
];

const ROBOTIC_VOICE_HINTS = ['compact', 'espeak', 'basic'];

function scoreVoice(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  let score = 0;

  if (voice.lang === 'fr-FR') score += 50;
  else if (voice.lang.toLowerCase().startsWith('fr')) score += 35;

  if (voice.localService) score += 8;
  if (HUMAN_VOICE_HINTS.some((hint) => name.includes(hint))) score += 24;
  if (ROBOTIC_VOICE_HINTS.some((hint) => name.includes(hint))) score -= 20;

  return score;
}

export function getPreferredFrenchVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined {
  return voices
    .filter((voice) => voice.lang.toLowerCase().startsWith('fr'))
    .sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
}

export function normalizeSpeechText(input: string): string {
  if (!input) return '';
  let text = input;

  text = text.replace(/\bKiraPay\b/gi, 'Kira Pay');
  text = text.replace(/\bFCFA\b/gi, 'francs CFA');
  text = text.replace(/\bXOF\b/gi, 'francs CFA');
  text = text.replace(/\bDAM\b/g, 'D A M');
  text = text.replace(/\bVTC\b/g, 'V T C');
  text = text.replace(/\bGPS\b/g, 'G P S');
  text = text.replace(/\bKYC\b/g, 'vérification d’identité');
  text = text.replace(/\bPIN\b/g, 'code secret');
  text = text.replace(/\bFAC-[A-Z0-9-]+-(\d{4,})\b/g, 'facture numéro $1');
  text = text.replace(/\b(INV|REF|TXN|DOC)[-_]?[A-Z0-9-]{4,}\b/gi, (match) => {
    const tail = match.replace(/[^A-Z0-9]/gi, '').slice(-4);
    return `numéro ${tail.split('').join(' ')}`;
  });
  text = text.replace(/\b(\d+)\s*\/\s*(\d+)\b/g, '$1 sur $2');
  text = text.replace(/\ba regler\b/gi, 'à régler');
  text = text.replace(/\ba payer\b/gi, 'à payer');
  text = text.replace(/\bpropriete\b/gi, 'propriété');
  text = text.replace(/\bcontrole\b/gi, 'contrôle');
  text = text.replace(/\bvehicule\b/gi, 'véhicule');
  text = text.replace(/\bdetectee\b/gi, 'détectée');
  text = text.replace(/\bprevu\b/gi, 'prévu');
  text = text.replace(/\breserve\b/gi, 'réservé');
  text = text.replace(/\bcredit\b/gi, 'crédit');
  text = text.replace(/[•·●◆▪►→]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/** Make a UI string sound human when read aloud in French. */
export function cleanForSpeech(input: string): string {
  return normalizeSpeechText(input);
}

export function splitSpeechIntoChunks(text: string, maxLength = 170): string[] {
  const normalized = normalizeSpeechText(text);
  if (!normalized) return [];

  const sentences = normalized
    .replace(/([.!?])\s+/g, '$1|')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  sentences.forEach((sentence) => {
    if (!current) {
      current = sentence;
      return;
    }

    if (`${current} ${sentence}`.length <= maxLength) {
      current = `${current} ${sentence}`;
    } else {
      chunks.push(current);
      current = sentence;
    }
  });

  if (current) chunks.push(current);
  return chunks;
}

export interface SpeechController {
  stop: () => void;
  /** Resolves when playback ends or is stopped. */
  done: Promise<void>;
}

let currentController: SpeechController | null = null;

/** Stop any currently playing speech (neural or browser). */
export function stopAllSpeech(): void {
  currentController?.stop();
  currentController = null;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function browserFallback(text: string): SpeechController {
  const synth = window.speechSynthesis;
  const chunks = splitSpeechIntoChunks(text);
  const voice = getPreferredFrenchVoice(synth.getVoices());
  let stopped = false;
  let index = 0;
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((res) => {
    resolveDone = res;
  });

  synth.cancel();

  const speakNext = () => {
    if (stopped) return;

    const chunk = chunks[index];
    index += 1;

    if (!chunk) {
      resolveDone();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = voice?.lang || 'fr-FR';
    utterance.voice = voice ?? null;
    utterance.rate = 0.88;
    utterance.pitch = 1.04;
    utterance.volume = 1;
    utterance.onend = () => {
      window.setTimeout(speakNext, chunk.length > 120 ? 240 : 150);
    };
    utterance.onerror = () => resolveDone();
    synth.speak(utterance);
  };

  speakNext();

  return {
    stop: () => {
      stopped = true;
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
    return { stop: () => {}, done: Promise.resolve() };
  }

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
    const done = new Promise<void>((res) => {
      resolveDone = res;
    });
    audio.onended = () => resolveDone();
    audio.onerror = () => resolveDone();

    try {
      await audio.play();
    } catch (playErr) {
      console.warn('Neural audio play() failed, using browser fallback', playErr);
      const fallback = browserFallback(text);
      currentController = fallback;
      return fallback;
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
      const fallback = browserFallback(text);
      currentController = fallback;
      return fallback;
    }
    return { stop: () => {}, done: Promise.resolve() };
  }
}
