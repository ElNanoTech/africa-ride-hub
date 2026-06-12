import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, History, ChevronRight, ClipboardCheck } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { supabase as _supabase } from '@/integrations/supabase/routeClient';
import { useDriverAuth } from '@/hooks/useDriverAuth';
import {
  CLOSED_FLEET_CONTROL_STATUSES,
  STATUS_LABEL,
  STATUS_CLASS,
  FLEET_CONTROL_DRIVER_ROW_SELECT,
  type FleetControlDriverRow,
} from '@/lib/fleetControl';

// Supabase types lag the migration sync; cast for the new fleet-control columns.
const supabase = _supabase as any;

// Closed cycles only — the active control lives on /driver/fleet-control.
const CLOSED_STATUSES = CLOSED_FLEET_CONTROL_STATUSES;

/**
 * FC-D1 — Driver fleet-control history: past (closed) cycles with date,
 * plate, status, rejection reason and review date. Tap → read-only detail.
 */
export default function FleetControlHistory() {
  const { driverProfile } = useDriverAuth();
  const navigate = useNavigate();
  const driverId = driverProfile?.id;

  const { data: rows = [], isLoading } = useQuery<FleetControlDriverRow[]>({
    queryKey: ['driver-inspection-history', driverId],
    enabled: !!driverId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_inspections')
        .select(FLEET_CONTROL_DRIVER_ROW_SELECT)
        .eq('driver_id', driverId)
        .in('status', [...CLOSED_STATUSES])
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as FleetControlDriverRow[];
    },
  });

  return (
    <DriverLayout>
      <PageHeader title="Historique des contrôles" subtitle="Vos contrôles passés" />
      <div className="p-4 space-y-3 max-w-2xl mx-auto pb-28">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center space-y-3">
              <History className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Aucun contrôle terminé pour le moment. Vos contrôles validés apparaîtront ici.
              </p>
              <Button variant="outline" onClick={() => navigate('/driver/fleet-control')}>
                <ClipboardCheck className="h-4 w-4 mr-2" /> Contrôle en cours
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {rows.map((r) => {
              const plate = r.vehicles?.license_plate ?? '—';
              const model = [r.vehicles?.make, r.vehicles?.model_name].filter(Boolean).join(' ');
              return (
                <Card
                  key={r.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors active:scale-[0.99]"
                  onClick={() => navigate(`/driver/fleet-control/${r.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{plate}</span>
                          {model && <span className="text-xs text-muted-foreground truncate">{model}</span>}
                          <Badge className={STATUS_CLASS[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(r.created_at), 'd MMM yyyy', { locale: fr })}
                          {r.reviewed_at && (
                            <> · Vérifié le {format(new Date(r.reviewed_at), 'd MMM yyyy', { locale: fr })}</>
                          )}
                        </div>
                        {r.rejection_reason && (
                          <p className="text-xs text-rose-600 line-clamp-2">Motif : {r.rejection_reason}</p>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            <div className="text-center pt-2">
              <Button variant="ghost" size="sm" onClick={() => navigate('/driver/fleet-control')}>
                <ClipboardCheck className="h-4 w-4 mr-2" /> Contrôle en cours
              </Button>
            </div>
          </>
        )}
      </div>
    </DriverLayout>
  );
}
