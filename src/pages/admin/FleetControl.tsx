import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { ShieldCheck, ListChecks, Clock, AlertTriangle, Ban, Zap, BellRing, CheckCircle2, XCircle, Camera } from 'lucide-react';
import { supabase as _supabase } from '@/integrations/supabase/routeClient';
// Types regenerate on next migration sync; cast for the new Phase 3 tables.
const supabase = _supabase as any;
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { FLEET_CATEGORIES, fleetCategoryLabel } from '@/lib/fleetCategories';
import { FleetControlDetailDialog } from '@/components/admin/FleetControlDetailDialog';

type InspectionStatus = 'draft' | 'submitted' | 'validated' | 'rejected' | 'expired';

interface InspectionRow {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  status: InspectionStatus;
  due_at: string;
  submitted_at: string | null;
  validated_at: string | null;
  rejection_reason: string | null;
  reminder_count: number;
  immobilized_at: string | null;
  immobilization_reason: string | null;
  vehicles?: { id: string; license_plate: string | null; make: string | null; model: string | null; vehicle_type: string | null; fleet_group: string | null } | null;
  drivers?: { id: string; first_name: string | null; last_name: string | null } | null;
  photos?: { count: number }[];
}

const STATUS_LABEL: Record<InspectionStatus, string> = {
  draft: 'Brouillon',
  submitted: 'À valider',
  validated: 'Conforme',
  rejected: 'Rejeté',
  expired: 'En retard',
};

const STATUS_VARIANT: Record<InspectionStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  validated: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  expired: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

function isOverdue(row: InspectionRow): boolean {
  return row.status !== 'validated' && new Date(row.due_at).getTime() < Date.now();
}

function daysOverdue(row: InspectionRow): number {
  const ms = Date.now() - new Date(row.due_at).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

export default function FleetControl() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'all' | InspectionStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [activeRow, setActiveRow] = useState<InspectionRow | null>(null);

  const { data: inspections = [], isLoading } = useQuery<InspectionRow[]>({
    queryKey: ['fleet-control', 'inspections'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_inspections' )
        .select(`
          id, vehicle_id, driver_id, status, due_at, submitted_at, validated_at,
          rejection_reason, reminder_count, immobilized_at, immobilization_reason,
          vehicles:vehicles!vehicle_inspections_vehicle_id_fkey ( id, license_plate, make, model, vehicle_type, fleet_group ),
          drivers:drivers!vehicle_inspections_driver_id_fkey ( id, first_name, last_name ),
          photos:vehicle_inspection_photos ( count )
        `)
        .order('due_at', { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as InspectionRow[];
    },
  });

  // Enrich status with derived "expired"
  const enriched = useMemo(
    () => inspections.map((r) => (r.status !== 'validated' && isOverdue(r) ? { ...r, status: 'expired' as InspectionStatus } : r)),
    [inspections],
  );

  const kpis = useMemo(() => {
    const total = enriched.length;
    const conforme = enriched.filter((r) => r.status === 'validated').length;
    const aValider = enriched.filter((r) => r.status === 'submitted').length;
    const enRetard = enriched.filter((r) => r.status === 'expired').length;
    const bloques = enriched.filter((r) => r.immobilized_at != null).length;
    return { total, conforme, aValider, enRetard, bloques };
  }, [enriched]);

  const filtered = useMemo(() => {
    return enriched.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && r.vehicles?.fleet_group !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const plate = r.vehicles?.license_plate?.toLowerCase() ?? '';
        const model = `${r.vehicles?.make ?? ''} ${r.vehicles?.model ?? ''}`.toLowerCase();
        const driver = `${r.drivers?.first_name ?? ''} ${r.drivers?.last_name ?? ''}`.toLowerCase();
        if (!plate.includes(q) && !model.includes(q) && !driver.includes(q)) return false;
      }
      return true;
    });
  }, [enriched, statusFilter, categoryFilter, search]);

  // KIRA categories are sourced from vehicles.fleet_group (VTC / WARREN / CARGO / N'LOOTTO).
  const categories = FLEET_CATEGORIES;

  const validate = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('vehicle_inspections' )
        .update({ status: 'validated', validated_at: new Date().toISOString(), validated_by: u.user?.id ?? null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Inspection validée');
      qc.invalidateQueries({ queryKey: ['fleet-control'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  });

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase
        .from('vehicle_inspections' )
        .update({ status: 'rejected', rejection_reason: reason })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Inspection rejetée');
      qc.invalidateQueries({ queryKey: ['fleet-control'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  });

  const remind = useMutation({
    mutationFn: async (row: InspectionRow) => {
      const { error } = await supabase
        .from('vehicle_inspections' )
        .update({ reminder_count: (row.reminder_count ?? 0) + 1 })
        .eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Relance envoyée');
      qc.invalidateQueries({ queryKey: ['fleet-control'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  });

  const immobilize = useMutation({
    mutationFn: async (row: InspectionRow) => {
      const { data: u } = await supabase.auth.getUser();
      // TODO(uffizio): the real engine-cut command is not yet wired. We insert
      // a 'pending' row in vehicle_immobilization_commands so a future
      // edge function / Uffizio polling worker can pick it up and dispatch
      // the actual SET_OUT command to the device. UI state below is updated
      // optimistically so admins see the inspection as immobilized.
      const { error: cmdErr } = await supabase.from('vehicle_immobilization_commands' ).insert({
        vehicle_id: row.vehicle_id,
        inspection_id: row.id,
        status: 'pending',
        reason: `Inspection en retard de ${daysOverdue(row)} j`,
        requested_by: u.user?.id ?? null,
        source: 'manual',
      });
      if (cmdErr) throw cmdErr;
      const { error: insErr } = await supabase
        .from('vehicle_inspections' )
        .update({
          immobilized_at: new Date().toISOString(),
          immobilization_reason: `Inspection en retard de ${daysOverdue(row)} j`,
        })
        .eq('id', row.id);
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      toast.success('Commande de coupure envoyée au boîtier GPS (en file)');
      qc.invalidateQueries({ queryKey: ['fleet-control'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  });

  const enforceOverdue = useMutation({
    mutationFn: async () => {
      const candidates = enriched.filter((r) => r.status === 'expired' && !r.immobilized_at && (daysOverdue(r) >= 3 || r.reminder_count >= 2));
      for (const row of candidates) {
        await supabase.from('vehicle_immobilization_commands' ).insert({
          vehicle_id: row.vehicle_id,
          inspection_id: row.id,
          status: 'pending',
          reason: `Auto: ${daysOverdue(row)} j de retard, ${row.reminder_count} relance(s)`,
          source: 'auto',
        });
        await supabase
          .from('vehicle_inspections' )
          .update({ immobilized_at: new Date().toISOString(), immobilization_reason: `Auto-immobilisation` })
          .eq('id', row.id);
      }
      return candidates.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} véhicule(s) traité(s)`);
      qc.invalidateQueries({ queryKey: ['fleet-control'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  });

  const candidatesForAutoImmo = enriched.filter(
    (r) => r.status === 'expired' && !r.immobilized_at && (daysOverdue(r) >= 3 || r.reminder_count >= 2),
  ).length;

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Opérations' }, { label: 'Fleet Control' }]} />

      <HeroCard
        eyebrow="Contrôle visuel périodique"
        title="Fleet Control"
        subtitle="Photos chauffeur · validation fleet manager · auto-immobilisation"
        actions={
          <Button
            variant="secondary"
            onClick={() => enforceOverdue.mutate()}
            disabled={candidatesForAutoImmo === 0 || enforceOverdue.isPending}
          >
            <Zap className="mr-2 h-4 w-4" />
            Auto-immobiliser ({candidatesForAutoImmo})
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KpiTile label="Total" value={kpis.total} icon={ListChecks} variant="slate" />
        <KpiTile label="Conformes" value={kpis.conforme} icon={CheckCircle2} variant="green" />
        <KpiTile label="À valider" value={kpis.aValider} icon={Clock} variant="blue" />
        <KpiTile label="En retard" value={kpis.enRetard} icon={AlertTriangle} variant="yellow" />
        <KpiTile label="Bloqués" value={kpis.bloques} icon={Ban} variant="orange" />
      </div>

      {candidatesForAutoImmo > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/30">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                {candidatesForAutoImmo} véhicule(s) — immobilisation automatique éligible
              </p>
              <p className="text-amber-800/80 dark:text-amber-300/80">
                Seuils dépassés (retard ≥ 3 j ou ≥ 2 relances). Cliquez sur «&nbsp;Auto-immobiliser&nbsp;» ou utilisez la coupure manuelle ci-dessous.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <Input
          placeholder="Plaque, chauffeur, modèle…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="md:max-w-sm"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="md:w-48"><SelectValue placeholder="Tous les statuts" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="submitted">À valider</SelectItem>
            <SelectItem value="validated">Conformes</SelectItem>
            <SelectItem value="expired">En retard</SelectItem>
            <SelectItem value="rejected">Rejetés</SelectItem>
            <SelectItem value="draft">Brouillons</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="md:w-48"><SelectValue placeholder="Toutes catégories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes catégories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <PillTabs
        className="mb-4"
        value={statusFilter}
        onChange={(v) => setStatusFilter(v as any)}
        items={[
          { value: 'all', label: 'Toutes', count: enriched.length },
          { value: 'submitted', label: 'À valider', count: kpis.aValider },
          { value: 'expired', label: 'En retard', count: kpis.enRetard },
          { value: 'validated', label: 'Conformes', count: kpis.conforme },
        ]}
      />

      <p className="text-xs text-muted-foreground mb-3">{filtered.length} résultat(s)</p>

      {isLoading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Chargement…</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground space-y-2">
            <ShieldCheck className="h-10 w-10 mx-auto opacity-40" />
            <p>Aucune inspection ne correspond aux filtres.</p>
            <p className="text-xs">Les inspections sont générées automatiquement lorsqu'un véhicule est attribué à un chauffeur.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => (
            <InspectionCard
              key={row.id}
              row={row}
              onOpen={() => setActiveRow(row)}
              onValidate={validate.mutate}
              onReject={(id) => reject.mutate({ id, reason: 'Non conforme' })}
              onRemind={remind.mutate}
              onImmobilize={immobilize.mutate}
            />
          ))}
        </div>
      )}

      <FleetControlDetailDialog
        row={activeRow as any}
        onClose={() => setActiveRow(null)}
        onValidate={(id) => { validate.mutate(id); setActiveRow(null); }}
        onReject={(id) => { reject.mutate({ id, reason: 'Non conforme' }); setActiveRow(null); }}
        onRemind={(r) => { remind.mutate(r as any); }}
        onImmobilize={(r) => { immobilize.mutate(r as any); setActiveRow(null); }}
        busy={validate.isPending || reject.isPending || remind.isPending || immobilize.isPending}
      />
    </AdminLayout>
  );
}

function InspectionCard({
  row,
  onOpen,
  onValidate,
  onReject,
  onRemind,
  onImmobilize,
}: {
  row: InspectionRow;
  onOpen: () => void;
  onValidate: (id: string) => void;
  onReject: (id: string) => void;
  onRemind: (row: InspectionRow) => void;
  onImmobilize: (row: InspectionRow) => void;
}) {
  const plate = row.vehicles?.license_plate ?? '—';
  const model = [row.vehicles?.make, row.vehicles?.model].filter(Boolean).join(' ') || 'Véhicule';
  const driverName = row.drivers ? [row.drivers.first_name, row.drivers.last_name].filter(Boolean).join(' ') : null;
  const photoCount = row.photos?.[0]?.count ?? 0;
  const overdueDays = daysOverdue(row);

  return (
    <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={onOpen}>
      <CardContent className="pt-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="font-semibold">{plate}</span>
            <span className="text-sm text-muted-foreground">{model}</span>
            {row.vehicles?.fleet_group && <Badge variant="outline" className="text-[10px]">{fleetCategoryLabel(row.vehicles.fleet_group)}</Badge>}
            <Badge className={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
            {row.immobilized_at && (
              <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                <Ban className="h-3 w-3 mr-1" /> Auto-immobilisation active
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{driverName ? `👤 ${driverName}` : '⚠️ Non assigné'}</span>
            <span>📅 Échéance {format(new Date(row.due_at), 'd MMM yyyy', { locale: fr })}</span>
            {row.status === 'expired' && <span className="text-amber-600 font-medium">En retard de {overdueDays} j</span>}
            {row.reminder_count > 0 && <span>🔔 {row.reminder_count} relance(s)</span>}
            <span className="inline-flex items-center gap-1"><Camera className="h-3 w-3" /> {photoCount}/11 pièces</span>
          </div>

          {row.rejection_reason && (
            <p className="text-xs text-rose-600 mt-2">Motif rejet : {row.rejection_reason}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 shrink-0 md:items-end" onClick={(e) => e.stopPropagation()}>
          {row.status === 'submitted' && (
            <div className="flex gap-2">
              <Button size="sm" variant="default" onClick={onOpen}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Examiner
              </Button>
            </div>
          )}
          {!row.immobilized_at && (row.status === 'expired' || row.status === 'draft') && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onRemind(row)}>
                <BellRing className="h-4 w-4 mr-1" /> Relancer
              </Button>
              <Button size="sm" variant="destructive" onClick={() => onImmobilize(row)}>
                <Zap className="h-4 w-4 mr-1" /> Couper si stationné
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}