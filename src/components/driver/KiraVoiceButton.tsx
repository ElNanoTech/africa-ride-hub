import { useEffect, useMemo, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  const [isSupported, setIsSupported] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    setIsSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const cleanText = useMemo(() => text.replace(/\s+/g, ' ').trim(), [text]);

  const speak = () => {
    if (!isSupported || !cleanText) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'fr-FR';
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const stop = () => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? 'sm' : 'default'}
      onClick={isSpeaking ? stop : speak}
      disabled={!isSupported || !cleanText}
      aria-label={isSupported ? label : 'Audio indisponible sur ce telephone'}
      title={isSupported ? label : 'Audio indisponible sur ce telephone'}
      className={cn(
        'min-h-11 rounded-xl bg-background/80 px-3 text-xs font-semibold',
        compact && 'h-9 min-h-9 px-2 [&_span]:sr-only',
        className,
      )}
    >
      {isSupported ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      <span>{isSupported ? (isSpeaking ? 'Stop' : label) : 'Audio indisponible'}</span>
    </Button>
  );
}
