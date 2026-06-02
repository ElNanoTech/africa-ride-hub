import { useState } from 'react';
import { Sparkles, Loader2, AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Shield, Minus, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/routeClient';
import { useIsFeatureEnabled } from '@/hooks/useFeatureFlags';
import ReactMarkdown from 'react-markdown';

interface AIDriverSummaryProps {
  driverId: string;
  driverName: string;
}

interface SummaryData {
  risk_level: 'low' | 'medium' | 'high';
  risk_score: number;
  summary: string;
  loan_eligibility: {
    eligible: boolean;
    max_amount: number;
    recommended_type: string;
    reasoning: string;
  };
  strengths: string[];
  risks: string[];
  recommendations: string[];
}

export function AIDriverSummary({ driverId, driverName }: AIDriverSummaryProps) {
  const { data: isEnabled } = useIsFeatureEnabled('ai_admin_assistant');
  const [triggered, setTriggered] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['ai-driver-summary', driverId],
    queryFn: async (): Promise<SummaryData> => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-admin-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ driverId, action: 'driver_summary' }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur');
      }
      return res.json();
    },
    enabled: triggered && !!isEnabled,
    staleTime: 1000 * 60 * 15,
    retry: 1,
  });

  if (!isEnabled) return null;

  const riskColors = {
    low: { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20', label: 'Faible' },
    medium: { bg: 'bg-warning/10', text: 'text-warning', border: 'border-warning/20', label: 'Moyen' },
    high: { bg: 'bg-destructive/10', text: 'text-destructive', border: 'border-destructive/20', label: 'Élevé' },
  };

  if (!triggered) {
    return (
      <Card className="mb-6">
        <CardContent className="p-4">
          <Button
            onClick={() => setTriggered(true)}
            variant="outline"
            className="w-full gap-2"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            Générer l'analyse IA de {driverName}
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Analyse de risque, éligibilité prêt et recommandations
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || isFetching) {
    return (
      <Card className="mb-6">
        <CardContent className="p-6 flex items-center justify-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Analyse IA en cours...</span>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="mb-6 border-destructive/20">
        <CardContent className="p-4 text-center">
          <p className="text-sm text-destructive mb-2">Erreur lors de l'analyse IA</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Réessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  const risk = riskColors[data.risk_level] || riskColors.medium;

  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Analyse IA
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn('text-xs', risk.bg, risk.text, risk.border)}>
              Risque {risk.label}
            </Badge>
            <button onClick={() => refetch()} className="text-muted-foreground hover:text-foreground">
              <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <p className="text-sm">{data.summary}</p>

        {/* Loan Eligibility */}
        <div className={cn('p-3 rounded-xl border', data.loan_eligibility.eligible ? 'bg-primary/5 border-primary/20' : 'bg-destructive/5 border-destructive/20')}>
          <div className="flex items-center gap-2 mb-1">
            {data.loan_eligibility.eligible ? (
              <CheckCircle className="h-4 w-4 text-primary" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            )}
            <span className="text-sm font-semibold">
              {data.loan_eligibility.eligible ? 'Éligible au prêt' : 'Non éligible au prêt'}
            </span>
          </div>
          {data.loan_eligibility.eligible && (
            <p className="text-xs text-muted-foreground">
              Montant max: <strong>{data.loan_eligibility.max_amount.toLocaleString()} FCFA</strong> · 
              Type: <strong>{data.loan_eligibility.recommended_type}</strong>
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{data.loan_eligibility.reasoning}</p>
        </div>

        {/* Strengths & Risks */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold text-primary mb-1.5 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Points forts
            </p>
            <ul className="space-y-1">
              {data.strengths?.map((s, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                  <span className="text-primary mt-0.5">✓</span> {s}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-destructive mb-1.5 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Risques
            </p>
            <ul className="space-y-1">
              {data.risks?.map((r, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                  <span className="text-destructive mt-0.5">⚠</span> {r}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Recommendations */}
        {data.recommendations?.length > 0 && (
          <div className="p-3 rounded-xl bg-muted/50">
            <p className="text-xs font-semibold mb-1.5">💡 Recommandations</p>
            <ul className="space-y-1">
              {data.recommendations.map((r, i) => (
                <li key={i} className="text-xs text-muted-foreground">• {r}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
