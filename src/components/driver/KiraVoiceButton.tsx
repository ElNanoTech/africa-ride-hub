import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { speakNatural, stopAllSpeech, type SpeechController } from '@/lib/naturalSpeech';

interface KiraVoiceButtonProps {
  text: string;
  label?: string;
  className?: string;
  compact?: boolean;
}

export function KiraVoiceButton({
  text,
  label = 'Écouter',
  className,
  compact = false,
}: KiraVoiceButtonProps) {
  const [isSupported, setIsSupported] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const controllerRef = useRef<SpeechController | null>(null);

  useEffect(() => {
    // Audio is supported either via HTMLAudioElement or speechSynthesis
    setIsSupported(typeof window !== 'undefined' && (!!window.Audio || 'speechSynthesis' in window));
    return () => {
      controllerRef.current?.stop();
      stopAllSpeech();
    };
  }, []);

  const cleanText = useMemo(() => text.replace(/\s+/g, ' ').trim(), [text]);

  const speak = async () => {
    if (!cleanText || isLoading) return;
    setIsLoading(true);
    try {
      const ctrl = await speakNatural(cleanText);
      controllerRef.current = ctrl;
      setIsSpeaking(true);
      setIsLoading(false);
      await ctrl.done;
      setIsSpeaking(false);
    } catch (err) {
      console.error('KiraVoice speak failed', err);
      setIsLoading(false);
      setIsSpeaking(false);
    }
  };

  const stop = () => {
    controllerRef.current?.stop();
    stopAllSpeech();
    setIsSpeaking(false);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? 'sm' : 'default'}
      onClick={isSpeaking ? stop : speak}
      disabled={!isSupported || !cleanText || isLoading}
      aria-label={isSupported ? label : 'Audio indisponible sur ce telephone'}
      title={isSupported ? label : 'Audio indisponible sur ce telephone'}
      className={cn(
        'min-h-11 rounded-xl bg-background/80 px-3 text-xs font-semibold',
        compact && 'h-9 min-h-9 px-2 [&_span]:sr-only',
        className,
      )}
    >
      {!isSupported ? (
        <VolumeX className="h-4 w-4" />
      ) : isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Volume2 className="h-4 w-4" />
      )}
      <span>
        {!isSupported
          ? 'Audio indisponible'
          : isLoading
            ? 'Chargement…'
            : isSpeaking
              ? 'Stop'
              : label}
      </span>
    </Button>
  );
}
