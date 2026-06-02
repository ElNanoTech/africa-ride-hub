import { useState } from 'react';
import { TrendingUp, TrendingDown, Lightbulb, RefreshCw, Sparkles, ChevronRight, AlertTriangle, CheckCircle, Minus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/routeClient';
import { formatCurrency } from '@/lib/format';

interface Insight {
  title: string;
  description: string;
  type: 'positive' | 'neutral' | 'warning';
  metric?: string;
}

interface Recommendation {
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  category: string;
}

interface InsightsData {
  summary: string;
  insights: Insight[];
  recommendations: Recommendation[];
  projected_monthly?: number;
}

export function AIIncomeInsights({ driverId }: { driverId: string }) {
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['ai-income-insights', driverId],
    queryFn: async (): Promise<InsightsData> => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-income-insights`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ driverId }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur');
      }

      return res.json();
    },
    staleTime: 1000 * 60 * 30, // Cache 30 min
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="px-4 mt-6">
        <div className="flex items-center gap-1.5 mb-3">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Analyse IA de vos revenus
          </h2>
        </div>
        <Card>
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data) return null;

  const insightIcons = {
    positive: <CheckCircle className="h-4 w-4 text-primary" />,
    warning: <AlertTriangle className="h-4 w-4 text-warning" />,
    neutral: <Minus className="h-4 w-4 text-muted-foreground" />,
  };

  const impactColors = {
    high: 'bg-primary/10 text-primary border-primary/20',
    medium: 'bg-warning/10 text-warning border-warning/20',
    low: 'bg-muted text-muted-foreground border-border',
  };

  const visibleInsights = showAll ? data.insights : data.insights?.slice(0, 2);
  const visibleRecs = showAll ? data.recommendations : data.recommendations?.slice(0, 2);

  return (
    <div className="px-4 mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Analyse IA
        </h2>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs text-primary font-medium flex items-center gap-0.5"
        >
          <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} />
          Actualiser
        </button>
      </div>

      <Card className="overflow-hidden border bg-gradient-to-br from-primary/5 via-transparent to-secondary/5">
        <CardContent className="p-4">
          {/* Summary */}
          <p className="text-sm font-medium mb-3">{data.summary}</p>

          {/* Projected monthly */}
          {data.projected_monthly && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 mb-4">
              <div>
                <p className="text-xs text-muted-foreground">Projection mensuelle</p>
                <p className="text-lg font-bold text-primary">{formatCurrency(data.projected_monthly)}</p>
              </div>
              <TrendingUp className="h-6 w-6 text-primary/50" />
            </div>
          )}

          {/* Insights */}
          {visibleInsights && visibleInsights.length > 0 && (
            <div className="space-y-2 mb-4">
              {visibleInsights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-muted/40">
                  <div className="mt-0.5">{insightIcons[insight.type] || insightIcons.neutral}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold">{insight.title}</p>
                      {insight.metric && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted font-medium">
                          {insight.metric}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {visibleRecs && visibleRecs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Lightbulb className="h-3 w-3" />
                Recommandations
              </p>
              {visibleRecs.map((rec, i) => (
                <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-card border border-border/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-xs font-semibold">{rec.title}</p>
                      <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', impactColors[rec.impact])}>
                        {rec.impact === 'high' ? '🔥 Fort' : rec.impact === 'medium' ? 'Moyen' : 'Faible'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{rec.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Show more */}
          {(data.insights?.length > 2 || data.recommendations?.length > 2) && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-3 text-primary text-xs"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? 'Voir moins' : 'Voir tout'}
              <ChevronRight className={cn('h-3.5 w-3.5 ml-1 transition-transform', showAll && 'rotate-90')} />
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
