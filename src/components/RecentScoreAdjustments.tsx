import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/routeClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, TrendingDown, TrendingUp, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface ScoreEvent {
  id: string;
  delta: number;
  reason: string;
  accident_id: string | null;
  created_at: string;
  case_number?: string | null;
}

/**
 * Shows the driver's recent manual score adjustments (e.g. accident penalties).
 * These are sourced from `driver_score_events` and explain visible changes
 * in the credit score that aren't tied to the weekly factor breakdown.
 */
export function RecentScoreAdjustments({ driverId }: { driverId: string | undefined }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['driver-score-events', driverId],
    enabled: !!driverId,
    queryFn: async (): Promise<ScoreEvent[]> => {
      const { data, error } = await supabase
        .from('driver_score_events')
        .select('id, delta, reason, accident_id, created_at, accidents:accident_id(case_number)')
        .eq('driver_id', driverId!)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []).map((row: any) => ({
        id: row.id,
        delta: row.delta,
        reason: row.reason,
        accident_id: row.accident_id,
        created_at: row.created_at,
        case_number: row.accidents?.case_number ?? null,
      }));
    },
  });

  if (isLoading) {
    return (
      <div className="px-4 mb-6">
        <Skeleton className="h-4 w-40 mb-3" />
        <Card>
          <CardContent className="p-4 space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (events.length === 0) return null;

  return (
    <div className="px-4 mb-6">
      <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
        Ajustements récents
      </h2>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-warning" />
            Impacts directs sur votre score
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {events.map((event) => {
            const isNegative = event.delta < 0;
            const Icon = isNegative ? TrendingDown : TrendingUp;
            const content = (
              <div
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg border transition-colors',
                  isNegative
                    ? 'border-destructive/30 bg-destructive/5'
                    : 'border-success/30 bg-success/5',
                  event.accident_id && 'hover:bg-muted/50 cursor-pointer',
                )}
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div
                    className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                      isNegative ? 'bg-destructive/15' : 'bg-success/15',
                    )}
                  >
                    <Icon
                      className={cn('h-4 w-4', isNegative ? 'text-destructive' : 'text-success')}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{event.reason}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(event.created_at), 'dd MMM yyyy', { locale: fr })}
                      </span>
                      {event.case_number && (
                        <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                          {event.case_number}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={cn(
                      'text-base font-bold tabular-nums',
                      isNegative ? 'text-destructive' : 'text-success',
                    )}
                  >
                    {event.delta > 0 ? '+' : ''}
                    {event.delta}
                  </span>
                  {event.accident_id && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>
            );
            return event.accident_id ? (
              <Link
                key={event.id}
                to={`/driver/sinistres/cases/${event.accident_id}`}
                className="block"
              >
                {content}
              </Link>
            ) : (
              <div key={event.id}>{content}</div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
