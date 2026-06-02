import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/routeClient';

interface VoicePlayerProps {
  src: string;
  className?: string;
}

// Extract the storage object key from any voice-notes URL (public or signed)
function extractVoiceNotesPath(url: string): string | null {
  const match = url.match(/\/voice-notes\/(?:object\/(?:public|sign)\/voice-notes\/)?([^?]+)/);
  return match?.[1] ?? null;
}

export function VoicePlayer({ src, className }: VoicePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [resolvedSrc, setResolvedSrc] = useState(src);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    setResolvedSrc(src);
  }, [src]);

  useEffect(() => {
    const audio = new Audio(resolvedSrc);
    audioRef.current = audio;

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
    });
    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setProgress(0);
    });
    audio.addEventListener('error', async () => {
      // URL expired or was a stale public URL — try to re-sign on demand.
      const path = extractVoiceNotesPath(resolvedSrc);
      if (!path) return;
      const { data } = await supabase.storage
        .from('voice-notes')
        .createSignedUrl(path, 60 * 60);
      if (data?.signedUrl && data.signedUrl !== resolvedSrc) {
        setResolvedSrc(data.signedUrl);
      }
    });

    return () => {
      audio.pause();
      audio.src = '';
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [resolvedSrc]);

  const updateProgress = useCallback(() => {
    if (audioRef.current) {
      const pct = (audioRef.current.currentTime / audioRef.current.duration) * 100;
      setProgress(isNaN(pct) ? 0 : pct);
      if (isPlaying) {
        animRef.current = requestAnimationFrame(updateProgress);
      }
    }
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      animRef.current = requestAnimationFrame(updateProgress);
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, updateProgress]);

  const togglePlay = async () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      await audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn("flex items-center gap-2 min-w-[160px]", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={togglePlay}
        className="min-h-[36px] min-w-[36px] rounded-full flex-shrink-0"
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <div className="flex-1 flex flex-col gap-1">
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground">
          {formatTime(audioRef.current?.currentTime || 0)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
