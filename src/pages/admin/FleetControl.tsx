import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { HeroCard } from '@/components/admin/HeroCard';
import { KpiTile } from '@/components/admin/KpiTile';
import { PillTabs } from '@/components/admin/PillTabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ShieldCheck, ListChecks, Clock, AlertTriangle, Ban, CheckCircle2, XCircle, Camera, Settings as SettingsIcon, Plus,
} from 'lucide-react';
import { supabase as _supabase } from '@/integrations/supabase/routeClient';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { FLEET_CATEGORIES, fleetCategoryLabel } from '@/lib/fleetCategories';
import {
  FleetControlDetailDialog,
  type FleetControlRow,
} from '@/components/admin/FleetControlDetailDialog';
import { FleetControlCreateDialog } from '@/components/admin/FleetControlCreateDialog';
import { useRealtimePostgresChanges } from '@/hooks/useRealtimePostgresChanges';
import { useFleetControlSettings } from '@/hooks/useFleetControlSettings';
import {
  ALL_ZONES,
  STATUS_LABEL, STATUS_CLASS,
  effectiveStatus, daysOverdue,
  requiredZones,
  DEFAULT_FLEET_CONTROL_SETTINGS,
  type FleetControlStatus,
  type ItemValidation,
  type ZoneKey,
} from '@/lib/fleetControl';

const supabase = _supabase as any;

interface ItemAggregate {
  /** zone → validation status of the uploaded item in that zone. */
  zones: Partial<Record<ZoneKey, ItemValidation>>;
}

type TabKey = 'all' | 'submitted' | 'overdue' | 'approved' | 'blocked' | 'rejected';

export default function FleetControl() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: settings = DEFAULT_FLEET_CONTROL_SETTINGS } = useFleetControlSettings();
  const [tab, setTab] = useState<TabKey>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [activeRow, setActiveRow] = useState<FleetControlRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // FC-A3/D3: required zone keys derived from settings (not always 11).
  const requiredKeys = useMemo(
    () => requiredZones(settings).map((z) => z.key),
    [settings],
  );

  // FC-A2: live refresh — a driver submission appears without manual reload.
  // Single channel on the control rows (every submit/review touches them; the
  // open detail dialog has its own narrow photos channel). Invalidation is
  // exact-key and trailing-debounced (~3s) so an active fleet doesn't trigger
  // a refetch storm of the 500-row list + aggregate.
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
  }, []);
  const invalidateFleetControl = () => {
    if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
    invalidateTimer.current = setTimeout(() => {
      invalidateTimer.current = null;
      queryClient.invalidateQueries({ queryKey: ['fleet-control', 'list'], exact: true });
      queryClient.invalidateQueries({ queryKey: ['fleet-control', 'item-aggregate'], exact: true });
    }, 3_000);
  };
  useRealtimePostgresChanges('vehicle_inspections', '*', () => true, invalidateFleetControl);

  const { data: rows = [], isLoading } = useQuery<FleetControlRow[]>({
    queryKey: ['fleet-control', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_inspections')
        .select(`
          id, vehicle_id, driver_id, status, due_at, submitted_at, reviewed_at,
          rejection_reason, reminder_count, last_reminder_at,
          immobilization_state, immobilization_command_ref,
          vehicles:vehicles!vehicle_inspections_vehicle_id_fkey ( license_plate, make, model_name, fleet_group ),
          drivers:drivers!vehicle_inspections_driver_id_fkey ( full_name )
        `)
        .order('due_at', { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as FleetControlRow[];
    },
  });

  // Per-zone item status per control (for the tile progress strip on cards).
  const { data: itemAgg = {} } = useQuery<Record<string, ItemAggregate>>({
    queryKey: ['fleet-control', 'item-aggregate'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_inspection_photos')
        .select('inspection_id, zone, validation_status');
      if (error) throw error;
      const agg: Record<string, ItemAggregate> = {};
      for (const r of (data as any[] ?? [])) {
        const cur = agg[r.inspection_id] ||= { zones: {} };
        cur.zones[r.zone as ZoneKey] = r.validation_status as ItemValidation;
      }
      return agg;
    },
  });

  const enriched = useMemo(
    () => rows.map((r) => ({ ...r, _effective: effectiveStatus(r.status, r.due_at) })),
    [rows],
  );

  const kpis = useMemo(() => ({
    total:    enriched.length,
    conforme: enriched.filter((r) => r._effective === 'approved').length,
    aValider: enriched.filter((r) => r._effective === 'submitted').length,
    enRetard: enriched.filter((r) => r._effective === 'overdue').length,
    bloques:  enriched.filter((r) => r._effective === 'blocked').length,
    refuses:  enriched.filter((r) => r._effective === 'rejected').length,
  }), [enriched]);

  const filtered = useMemo(() => {
    return enriched.filter((r) => {
      if (tab !== 'all' && r._effective !== tab) return false;
      if (overdueOnly && r._effective !== 'overdue' && r._effective !== 'blocked') return false;
      if (categoryFilter !== 'all' && r.vehicles?.fleet_group !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const plate = r.vehicles?.license_plate?.toLowerCase() ?? '';
        const model = `${r.vehicles?.make ?? ''} ${r.vehicles?.model_name ?? ''}`.toLowerCase();
        const driver = (r.drivers?.full_name ?? '').toLowerCase();
        if (!plate.includes(q) && !model.includes(q) && !driver.includes(q)) return false;
      }
      return true;
    });
  }, [enriched, tab, overdueOnly, categoryFilter, search]);

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Opérations' }, { label: 'Fleet Control' }]} />

      <HeroCard
        eyebrow="Contrôle visuel périodique"
        title="Fleet Control"
        subtitle="Photos chauffeur · validation fleet manager · auto-immobilisation"
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nouveau contrôle
            </Button>
            <Button variant="secondary" onClick={() => navigate('/admin/settings#fleet-control')}>
              <SettingsIcon className="mr-2 h-4 w-4" /> Réglages
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <KpiTile label="Total"     value={kpis.total}    icon={ListChecks}     variant="slate" />
        <KpiTile label="Conformes" value={kpis.conforme} icon={CheckCircle2}   variant="green" />
        <KpiTile label="À valider" value={kpis.aValider} icon={Clock}          variant="blue" />
        <KpiTile label="En retard" value={kpis.enRetard} icon={AlertTriangle}  variant="yellow" />
        <KpiTile label="Bloqués"   value={kpis.bloques}  icon={Ban}            variant="orange" />
        <KpiTile label="Refusés"   value={kpis.refuses}  icon={XCircle}        variant="orange" />
      </div>

      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <Input
          placeholder="Plaque, chauffeur, modèle…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="md:max-w-sm"
        />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="md:w-48"><SelectValue placeholder="Toutes catégories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes catégories</SelectItem>
            {FLEET_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={overdueOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setOverdueOnly((v) => !v)}
        >
          En retard / bloqués seulement
        </Button>
      </div>

      <PillTabs
        className="mb-4"
        value={tab}
        onChange={(v) => setTab(v as TabKey)}
        items={[
          { value: 'all',       label: 'Toutes',    count: kpis.total },
          { value: 'submitted', label: 'À valider', count: kpis.aValider },
          { value: 'overdue',   label: 'En retard', count: kpis.enRetard },
          { value: 'approved',  label: 'Conformes', count: kpis.conforme },
          { value: 'blocked',   label: 'Bloqués',   count: kpis.bloques },
          { value: 'rejected',  label: 'Refusés',   count: kpis.refuses },
        ]}
      />

      <p className="text-xs text-muted-foreground mb-3">{filtered.length} résultat(s)</p>

      {isLoading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Chargement…</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground space-y-2">
            <ShieldCheck className="h-10 w-10 mx-auto opacity-40" />
            <p>Aucun contrôle ne correspond aux filtres.</p>
            <p className="text-xs">Les contrôles sont générés automatiquement quand un véhicule est attribué.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => (
            <ControlCard
              key={row.id}
              row={row}
              effective={row._effective}
              agg={itemAgg[row.id]}
              requiredKeys={requiredKeys}
              onOpen={() => setActiveRow(row)}
            />
          ))}
        </div>
      )}

      <FleetControlDetailDialog
        row={activeRow}
        onClose={() => setActiveRow(null)}
        cooldownHours={settings.relance_cooldown_hours}
        settings={settings}
      />

      <FleetControlCreateDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </AdminLayout>
  );
}

function ControlCard({
  row, effective, agg, requiredKeys, onOpen,
}: {
  row: FleetControlRow;
  effective: FleetControlStatus;
  agg?: ItemAggregate;
  requiredKeys: ZoneKey[];
  onOpen: () => void;
}) {
  const plate = row.vehicles?.license_plate ?? '—';
  const model = [row.vehicles?.make, row.vehicles?.model_name].filter(Boolean).join(' ') || 'Véhicule';
  const driverName = row.drivers?.full_name ?? null;
  const overdueDays = effective === 'overdue' || effective === 'blocked' ? daysOverdue(row.due_at) : 0;

  const zones = agg?.zones ?? {};
  // Nothing invisible: the strip shows required zones ∪ uploaded zones
  // (≤ 11 by construction — one item per zone).
  const tileKeys = ALL_ZONES
    .map((z) => z.key)
    .filter((k) => requiredKeys.includes(k) || zones[k]);
  // "X/Y pièces": X counts only required-zone submissions so X ≤ Y.
  const requiredSubmitted = requiredKeys
    .filter((k) => zones[k] && zones[k] !== 'pending').length;

  return (
    <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={onOpen}>
      <CardContent className="pt-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{plate}</span>
          <span className="text-sm text-muted-foreground">{model}</span>
          {row.vehicles?.fleet_group && <Badge variant="outline" className="text-[10px]">{fleetCategoryLabel(row.vehicles.fleet_group)}</Badge>}
          <Badge className={STATUS_CLASS[effective]}>{STATUS_LABEL[effective]}</Badge>
          {row.immobilization_state !== 'none' && (
            <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
              <Ban className="h-3 w-3 mr-1" /> Coupure {row.immobilization_state}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{driverName ? `👤 ${driverName}` : '⚠️ Non assigné'}</span>
          <span>📅 Échéance {format(new Date(row.due_at), 'd MMM yyyy', { locale: fr })}</span>
          {overdueDays > 0 && <span className="text-amber-600 font-medium">En retard de {overdueDays} j</span>}
          {row.reminder_count > 0 && (
            <span>
              🔔 {row.reminder_count} relance(s)
              {row.last_reminder_at && ` · dernière ${format(new Date(row.last_reminder_at), 'd MMM HH:mm', { locale: fr })}`}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Camera className="h-3 w-3" /> {requiredSubmitted}/{requiredKeys.length} pièces
          </span>
        </div>

        {/* Item strip — one tile per required ∪ uploaded zone (FC-A3), each
            coloured by the actual status of that zone's item. */}
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${Math.max(tileKeys.length, 1)}, minmax(0, 1fr))` }}
        >
          {tileKeys.map((k) => {
            const st = zones[k];
            let cls = 'bg-muted';
            if (st === 'approved') cls = 'bg-emerald-500';
            else if (st === 'rejected') cls = 'bg-rose-500';
            else if (st === 'submitted') cls = 'bg-blue-400';
            return <div key={k} className={`h-3 rounded-sm ${cls}`} />;
          })}
        </div>

        {row.rejection_reason && (
          <p className="text-xs text-rose-600">Motif rejet : {row.rejection_reason}</p>
        )}
      </CardContent>
    </Card>
  );
}