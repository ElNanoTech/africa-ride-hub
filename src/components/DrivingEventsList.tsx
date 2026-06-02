import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Gauge, Zap, Hand, MapPin, AlertTriangle, Moon, Battery, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface DrivingEventRow {
  id: string;
  alert_name: string | null;
  alert_location: string | null;
  occurred_at: string;
  score_delta_applied: number;
}

const ICONS: Record<string, typeof Gauge> = {
  'Over Speed': Gauge,
  'Zone Over Speeding': Gauge,
  'Harsh Braking': Hand,
  'Harsh Acceleration': Zap,
  'Night Driving': Moon,
  'SOS': AlertTriangle,
  'Idle': Activity,
  'Device Low Battery': Battery,
};

function pickIcon(name: string | null) {
  if (!name) return MapPin;
  return ICONS[name] ?? MapPin;
}

/**
 * Driver-facing list of recent driving events ingested from Uffizio.
 * Shows in the Score page so drivers see exactly which behaviors moved
 * their score, e.g. "-5 pts · Over Speed · Rue Noguès, Cocody · 14:32".
 */
export function DrivingEventsList({ driverId, limit = 10 }: { driverId: string | undefined; limit?: number }) {
  const { data, isLoading } = useQuery<DrivingEventRow[]>({
    queryKey: ['driving_events', driverId, limit],
    enabled: !!driverId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driving_events')
        .select('id, alert_name, alert_location, occurred_at, score_delta_applied')
        .eq('driver_id', driverId!)
        .order('occurred_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as DrivingEventRow[];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          Historique de conduite
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Aucun événement de conduite enregistré récemment.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.map(ev => {
              const Icon = pickIcon(ev.alert_name);
              const negative = ev.score_delta_applied < 0;
              return (
                <li
                  key={ev.id}
                  className="flex items-center gap-3 p-3 border rounded-lg"
                >
                  <div
                    className={
                      'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ' +
                      (negative ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground')
                    }
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ev.alert_name ?? 'Événement'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {ev.alert_location ?? 'Localisation inconnue'} ·{' '}
                      {format(new Date(ev.occurred_at), 'd MMM HH:mm', { locale: fr })}
                    </p>
                  </div>
                  {ev.score_delta_applied !== 0 && (
                    <span
                      className={
                        'text-sm font-semibold tabular-nums ' +
                        (negative ? 'text-destructive' : 'text-success')
                      }
                    >
                      {ev.score_delta_applied > 0 ? '+' : ''}
                      {ev.score_delta_applied} pts
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
