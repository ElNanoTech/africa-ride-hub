import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  TrendingDown,
  TrendingUp,
  Volume2,
  Square,
  CheckCircle2,
  CreditCard,
  Car,
  Wallet,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { clampScore, DEFAULT_BASE_SCORE } from '@/lib/scoringEngine';

interface ScoreEventRow {
  id: string;
  delta: number;
  reason: string;
  created_at: string;
}

interface Props {
  driverId: string | undefined;
  currentScore: number;
}

interface ImproveTip {
  icon: typeof CreditCard;
  text: string;
}

/**
 * Short, transparent score explainer designed for low-literacy drivers.
 * Shows: Base 500 → list of events with deltas → current score (the math).
 * Plus 3 actionable tips and a "Read aloud" button using the browser's
 * native French speech synthesis (no API key, works offline on mobile).
 */
export function ScoreBreakdownExplainer({ driverId, currentScore }: Props) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['score-breakdown-events', driverId],
    enabled: !!driverId,
    queryFn: async (): Promise<ScoreEventRow[]> => {
      const { data, error } = await supabase
        .from('driver_score_events')
        .select('id, delta, reason, created_at')
        .eq('driver_id', driverId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const totalDelta = useMemo(
    () => events.reduce((sum, e) => sum + e.delta, 0),
    [events],
  );

  // Reconstruct the base by inverting the math the DB does:
  //   current = clamp(0, 1000, base + totalDelta)
  // If clamping wasn't triggered, base = current - totalDelta.
  const inferredBase = currentScore - totalDelta;
  const baseScore =
    inferredBase >= 0 && inferredBase <= 1000 ? inferredBase : DEFAULT_BASE_SCORE;
  const expectedScore = clampScore(baseScore + totalDelta);

  // Build 3 actionable tips based on what is dragging the score down.
  const tips = useMemo<ImproveTip[]>(() => {
    const list: ImproveTip[] = [];
    const hasAccident = events.some((e) =>
      /sinistre|accident/i.test(e.reason),
    );
    const hasLatePayment = events.some(
      (e) => e.delta < 0 && /retard|souffrance|overdue/i.test(e.reason),
    );

    if (hasAccident) {
      list.push({
        icon: Car,
        text: 'Conduisez prudemment : évitez les freinages brusques et respectez les limites de vitesse.',
      });
    } else {
      list.push({
        icon: Car,
        text: 'Continuez à conduire prudemment pour éviter tout sinistre responsable.',
      });
    }

    if (hasLatePayment) {
      list.push({
        icon: CreditCard,
        text: 'Payez vos locations à temps pour gagner des points chaque semaine.',
      });
    } else {
      list.push({
        icon: CreditCard,
        text: 'Réglez chaque paiement avant la date limite : c’est le moyen le plus rapide de monter.',
      });
    }

    list.push({
      icon: Wallet,
      text: 'Déclarez vos revenus régulièrement pour montrer votre stabilité financière.',
    });

    return list;
  }, [events]);

  // Build the spoken script. Kept short and plain so TTS is digestible.
  const speechText = useMemo(() => {
    const intro = `Bonjour. Tous les conducteurs commencent avec ${baseScore} points.`;
    let body = '';
    if (events.length === 0) {
      body = ` Vous n'avez pour l'instant aucun événement enregistré, donc votre score est de ${currentScore} points.`;
    } else {
      const parts = events.map((e) => {
        const sign = e.delta < 0 ? 'moins' : 'plus';
        return ` ${sign} ${Math.abs(e.delta)} points pour ${cleanReasonForSpeech(e.reason)}`;
      });
      body =
        ` Voici les changements appliqués :${parts.join(',')}.` +
        ` Votre score actuel est donc de ${currentScore} points sur 1000.`;
    }
    const advice =
      ' Pour améliorer votre score : un, conduisez prudemment.' +
      ' Deux, payez vos locations à temps. Trois, déclarez vos revenus régulièrement.' +
      ' Chaque petit pas compte. Bonne route !';
    return intro + body + advice;
  }, [baseScore, events, currentScore]);

  // Stop any ongoing speech when the component unmounts or events change.
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleToggleSpeech = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;

    if (isSpeaking) {
      synth.cancel();
      setIsSpeaking(false);
      return;
    }

    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = 'fr-FR';
    utterance.rate = 0.95;
    utterance.pitch = 1;

    // Try to pick a French voice if available.
    const voices = synth.getVoices();
    const frenchVoice =
      voices.find((v) => v.lang === 'fr-FR') ||
      voices.find((v) => v.lang.startsWith('fr'));
    if (frenchVoice) utterance.voice = frenchVoice;

    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    utteranceRef.current = utterance;
    synth.speak(utterance);
    setIsSpeaking(true);
  };

  const speechSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  if (!driverId) return null;

  return (
    <div className="px-4 mb-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Comprendre votre score
            </CardTitle>
            {speechSupported && (
              <Button
                size="sm"
                variant={isSpeaking ? 'destructive' : 'outline'}
                onClick={handleToggleSpeech}
                className="gap-2 h-8"
                aria-label={
                  isSpeaking ? 'Arrêter la lecture' : 'Écouter l’explication'
                }
              >
                {isSpeaking ? (
                  <>
                    <Square className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Arrêter</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Écouter</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <>
              {/* The math: base → events → current */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <Row
                  label="Score de départ (tous les conducteurs)"
                  value={baseScore}
                  tone="neutral"
                />

                {events.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic px-1">
                    Aucun événement enregistré pour l’instant.
                  </p>
                ) : (
                  events.map((e) => (
                    <Row
                      key={e.id}
                      label={prettyReason(e.reason)}
                      sublabel={format(new Date(e.created_at), 'dd MMM yyyy', {
                        locale: fr,
                      })}
                      value={e.delta}
                      tone={e.delta < 0 ? 'negative' : 'positive'}
                    />
                  ))
                )}

                <div className="border-t pt-2 mt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">Votre score actuel</span>
                  <span className="text-lg font-bold tabular-nums">
                    {expectedScore}
                    <span className="text-xs text-muted-foreground font-normal">
                      {' '}
                      / 1000
                    </span>
                  </span>
                </div>
              </div>

              {/* 3 actionable bullets */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Pour améliorer votre score
                </p>
                <ul className="space-y-2">
                  {tips.map((tip, i) => {
                    const Icon = tip.icon;
                    return (
                      <li
                        key={i}
                        className="flex items-start gap-3 p-2.5 rounded-lg bg-primary/5 border border-primary/10"
                      >
                        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                          <Icon className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="flex items-start gap-2 flex-1 pt-0.5">
                          <span className="text-xs font-bold text-primary tabular-nums">
                            {i + 1}.
                          </span>
                          <span className="text-sm text-foreground leading-snug">
                            {tip.text}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {!speechSupported && (
                <p className="text-[11px] text-muted-foreground italic">
                  La lecture audio n’est pas disponible sur ce navigateur.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  sublabel,
  value,
  tone,
}: {
  label: string;
  sublabel?: string;
  value: number;
  tone: 'neutral' | 'positive' | 'negative';
}) {
  const Icon =
    tone === 'positive'
      ? TrendingUp
      : tone === 'negative'
        ? TrendingDown
        : CheckCircle2;
  const colorClass =
    tone === 'positive'
      ? 'text-success'
      : tone === 'negative'
        ? 'text-destructive'
        : 'text-muted-foreground';
  const sign = value > 0 ? '+' : '';

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <Icon className={cn('h-4 w-4 flex-shrink-0 mt-0.5', colorClass)} />
        <div className="min-w-0">
          <p className="text-sm leading-tight">{label}</p>
          {sublabel && (
            <p className="text-[11px] text-muted-foreground">{sublabel}</p>
          )}
        </div>
      </div>
      <span
        className={cn(
          'text-sm font-bold tabular-nums flex-shrink-0',
          tone === 'negative'
            ? 'text-destructive'
            : tone === 'positive'
              ? 'text-success'
              : 'text-foreground',
        )}
      >
        {tone === 'neutral' ? value : `${sign}${value}`}
      </span>
    </div>
  );
}

/** Make a DB reason string nicer for display. */
function prettyReason(reason: string): string {
  // "Sinistre responsable (SEVERE)" → "Sinistre responsable — sévère"
  const m = reason.match(/^(.*?)\s*\((MINOR|MODERATE|SEVERE)\)\s*$/i);
  if (m) {
    const sev =
      m[2].toUpperCase() === 'SEVERE'
        ? 'sévère'
        : m[2].toUpperCase() === 'MODERATE'
          ? 'modéré'
          : 'mineur';
    return `${m[1]} — ${sev}`;
  }
  return reason;
}

/** Make a reason readable when spoken aloud (drop parentheses, etc.). */
function cleanReasonForSpeech(reason: string): string {
  return reason
    .replace(/\((MINOR|MODERATE|SEVERE)\)/i, (_, sev) => {
      const s = sev.toUpperCase();
      return s === 'SEVERE'
        ? 'sévère'
        : s === 'MODERATE'
          ? 'modéré'
          : 'mineur';
    })
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
