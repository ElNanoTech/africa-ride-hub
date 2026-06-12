import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BellRing, Ban, Eye, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase as _supabase } from '@/integrations/supabase/routeClient';
import {
  FleetControlDetailDialog,
  type FleetControlRow,
} from '@/components/admin/FleetControlDetailDialog';
import { useFleetControlSettings } from '@/hooks/useFleetControlSettings';
import {
  STATUS_LABEL, STATUS_CLASS, IMMO_LABEL,
  OPEN_FLEET_CONTROL_STATUSES,
  DEFAULT_FLEET_CONTROL_SETTINGS,
  effectiveStatus, formatDueDateRelative, requiredZones,
  type FleetControlStatus, type ZoneKey, type ItemValidation,
} from '@/lib/fleetControl';

const supabase = _supabase as any;

interface DriverFleetControlPanelProps {
  driverId: string;
}

/**
 * CH-P2 — This driver's fleet controls: active cycles first, then history.
 * Reuses the admin Fleet Control building blocks (status labels, per-zone
 * aggregate progress, FleetControlDetailDialog, fleet_control_remind with
 * cooldown handling).
 */
export function DriverFleetControlPanel({ driverId }: DriverFleetControlPanelProps) {
  const qc = useQueryClient();
  const { data: settings = DEFAULT_FLEET_CONTROL_SETTINGS } = useFleetControlSettings();
  const [activeRow, setActiveRow] = useState<FleetControlRow | null>(null);

  const requiredCount = useMemo(() => requiredZones(settings).length, [settings]);
  const requiredKeys = useMemo(() => requiredZones(settings).map((z) => z.key), [settings]);

  const { data: rows = [], isLoading, error } = useQuery<FleetControlRow[]>({
    queryKey: ['driver-fleet-controls', driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_inspections')
        .select(`
          id, vehicle_id, driver_id, status, due_at, submitted_at, reviewed_at,
          rejection_reason, reminder_count, last_reminder_at,
          immobilization_state, immobilization_command_ref, notes,
          vehicles:vehicles!vehicle_inspections_vehicle_id_fkey ( license_plate, make, model_name, fleet_group ),
          drivers:drivers!vehicle_inspections_driver_id_fkey ( full_name )
        `)
        .eq('driver_id', driverId)
        .order('due_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as FleetControlRow[];
    },
  });

  // One batched per-zone aggregate (same pattern as the FleetControl page) —
  // no per-row queries.
  const ids = rows.map((r) => r.id);
  const { data: itemAgg = {} } = useQuery<Record<string, Partial<Record<ZoneKey, ItemValidation>>>>({
    queryKey: ['driver-fleet-controls-items', driverId, ids.sort().join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_inspection_photos')
        .select('inspection_id, zone, validation_status')
        .in('inspection_id', ids);
      if (error) throw error;
      const agg: Record<string, Partial<Record<ZoneKey, ItemValidation>>> = {};
      for (const r of (data as any[] ?? [])) {
        (agg[r.inspection_id] ||= {})[r.zone as ZoneKey] = r.validation_status as ItemValidation;
      }
      return agg;
    },
  });

  const remind = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('fleet_control_remind', { p_control: id });
      if (error) throw error;
      return data as { sent: boolean; cooldown_until?: string; created_or_reused_cycle?: boolean };
    },
    onSuccess: (r) => {
      if (r?.sent) toast.success(r?.created_or_reused_cycle ? 'Nouvelle demande envoyée' : 'Relance envoyée');
      else toast.info('Déjà relancé récemment', {
        description: r?.cooldown_until ? `Réessayez après ${format(new Date(r.cooldown_until), 'PPp', { locale: fr })}` : undefined,
      });
      qc.invalidateQueries({ queryKey: ['driver-fleet-controls', driverId] });
      qc.invalidateQueries({ queryKey: ['fleet-control'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  });

  const enriched = useMemo(
    () => rows.map((r) => ({ ...r, _effective: effectiveStatus(r.status, r.due_at) })),
    [rows],
  );
  const openStatuses = OPEN_FLEET_CONTROL_STATUSES as readonly FleetControlStatus[];
  const active = enriched.filter((r) => openStatuses.includes(r.status));
  const history = enriched.filter((r) => !openStatuses.includes(r.status));

  const cooldownActive = (r: FleetControlRow) =>
    r.status !== 'approved' && !!r.last_reminder_at &&
    new Date(r.last_reminder_at).getTime() + settings.relance_cooldown_hours * 3_600_000 > Date.now();

  const renderRow = (row: FleetControlRow & { _effective: FleetControlStatus }) => {
    const zones = itemAgg[row.id] ?? {};
    const submitted = requiredKeys.filter((k) => zones[k] && zones[k] !== 'pending').length;
    const isOpen = openStatuses.includes(row.status);
    return (
      <div key={row.id} className="border rounded-lg p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-sm">{row.vehicles?.license_plate ?? '—'}</span>
          <span className="text-xs text-muted-foreground">
            {[row.vehicles?.make, row.vehicles?.model_name].filter(Boolean).join(' ') || 'Véhicule'}
          </span>
          <Badge className={STATUS_CLASS[row._effective] + ' text-[10px]'}>{STATUS_LABEL[row._effective]}</Badge>
          {row.immobilization_state !== 'none' && (
            <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 text-[10px]">
              <Ban className="h-3 w-3 mr-1" /> {IMMO_LABEL[row.immobilization_state]}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>📅 {format(new Date(row.due_at), 'd MMM yyyy', { locale: fr })}</span>
          {isOpen && <span className="font-medium">{formatDueDateRelative(row.due_at)}</span>}
          <span>📷 {submitted}/{requiredCount} pièces</span>
          {row.reminder_count > 0 && <span>🔔 {row.reminder_count} relance(s)</span>}
          {row.rejection_reason && <span className="text-rose-600">Motif rejet : {row.rejection_reason}</span>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setActiveRow(row)}>
            <Eye className="h-3.5 w-3.5 mr-1" /> Détails
          </Button>
          {isOpen && (
            <Button
              size="sm"
              variant="outline"
              disabled={remind.isPending || cooldownActive(row)}
              onClick={() => remind.mutate(row.id)}
            >
              <BellRing className="h-3.5 w-3.5 mr-1" />
              {cooldownActive(row) ? 'Relance possible plus tard' : 'Relancer'}
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fleet Control</CardTitle>
        <CardDescription>Contrôles visuels périodiques du conducteur</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">Erreur de chargement</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center space-y-2">
            <ShieldCheck className="h-8 w-8 mx-auto opacity-40" />
            <p>Aucun contrôle pour ce conducteur.</p>
            <p className="text-xs">Les contrôles sont générés automatiquement quand un véhicule est attribué.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Contrôles en cours ({active.length})
              </h3>
              {active.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun contrôle en cours.</p>
              ) : (
                active.map(renderRow)
              )}
            </div>
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Historique ({history.length})
              </h3>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun contrôle clôturé.</p>
              ) : (
                history.map(renderRow)
              )}
            </div>
          </>
        )}
      </CardContent>

      <FleetControlDetailDialog
        row={activeRow}
        onClose={() => setActiveRow(null)}
        cooldownHours={settings.relance_cooldown_hours}
        settings={settings}
      />
    </Card>
  );
}
