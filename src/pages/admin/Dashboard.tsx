import { useMemo, type ComponentType } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  Filter,
  RefreshCw,
  ShieldAlert,
  Users,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { AdminLayout } from '@/components/AdminLayout';
import { HeroCard } from '@/components/admin/HeroCard';
import { KpiTile } from '@/components/admin/KpiTile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAttentionCenter, type AttentionAction, type AttentionCategory, type AttentionFilter, type AttentionPermission, type AttentionPriority } from '@/hooks/useAttentionCenter';
import { useRealtimePostgresChanges } from '@/hooks/useRealtimePostgresChanges';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { formatRelativeTime } from '@/lib/format';
import { logAction, type TargetType } from '@/hooks/useAuditLog';

const priorityMeta: Record<AttentionPriority, { label: string; className: string }> = {
  critical: { label: 'Critique', className: 'border-destructive/40 bg-destructive/15 text-destructive' },
  high: { label: 'Élevé', className: 'border-warning/40 bg-warning/20 text-warning' },
  medium: { label: 'Moyen', className: 'border-primary/40 bg-primary/15 text-primary' },
  info: { label: 'Info', className: 'border-muted-foreground/30 bg-muted text-muted-foreground' },
};

const categoryMeta: Record<AttentionCategory, { label: string; icon: ComponentType<{ className?: string }>; className: string }> = {
  finance: { label: 'Finance', icon: Wallet, className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  fleet_control: { label: 'Fleet Control', icon: ClipboardCheck, className: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  drivers: { label: 'Chauffeurs', icon: Users, className: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  vehicles: { label: 'Véhicules', icon: Car, className: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
  risk: { label: 'Risque', icon: ShieldAlert, className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  growth: { label: 'Croissance', icon: ArrowRight, className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
};

const kpiIcons: Record<AttentionFilter, ComponentType<{ className?: string }>> = {
  all: Filter,
  today_cash: Wallet,
  overdue: AlertTriangle,
  fleet_control: ClipboardCheck,
  vehicles: Car,
  drivers_risk: ShieldAlert,
  pending_requests: Users,
};

const filterLabels: Record<AttentionFilter, string> = {
  all: 'Tout',
  today_cash: "À encaisser aujourd'hui",
  overdue: 'En retard',
  fleet_control: 'Contrôles',
  vehicles: 'Véhicules',
  drivers_risk: 'Risque',
  pending_requests: 'Demandes',
};

function canUseAction(permission: AttentionPermission, guard: ReturnType<typeof useRoleGuard>) {
  switch (permission) {
    case 'all': return true;
    case 'finance': return guard.canManagePayments();
    case 'fleet': return guard.canManageFleet();
    case 'drivers': return guard.canManageFleet();
    case 'risk': return guard.isManagerOrHigher();
    case 'growth': return guard.canManageLoans();
    case 'support': return guard.canManageSupport();
  }
}

function permissionReason(permission: AttentionPermission) {
  switch (permission) {
    case 'finance': return 'Permission requise : Finance Manager';
    case 'fleet': return 'Permission requise : Fleet Manager';
    case 'drivers': return 'Permission requise : Manager';
    case 'risk': return 'Permission requise : Manager';
    case 'growth': return 'Permission requise : Agent Prêt';
    case 'support': return 'Permission requise : Agent Support';
    case 'all': return '';
  }
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, actions: AttentionAction[]) {
  const rows = [
    ['Priorité', 'Catégorie', 'Type', 'Sujet', 'Impact', 'Age', 'Action', 'Lien'],
    ...actions.map((action) => [
      priorityMeta[action.priority].label,
      categoryMeta[action.category].label,
      action.issueType,
      action.subject,
      action.impact,
      action.age,
      action.recommendedAction,
      action.href,
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function logAttentionOpen(action: AttentionAction) {
  logAction({
    action: 'attention_center_opened_item',
    targetType: action.entityType as TargetType,
    targetId: action.entityId,
    details: {
      source: 'attention_center',
      category: action.category,
      issue_type: action.issueType,
      priority: action.priority,
      href: action.href,
    },
  });
}

function AttentionActionCard({ action, canOpen }: { action: AttentionAction; canOpen: boolean }) {
  const CategoryIcon = categoryMeta[action.category].icon;
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 gap-3">
          <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${categoryMeta[action.category].className}`}>
            <CategoryIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={priorityMeta[action.priority].className}>
                {priorityMeta[action.priority].label}
              </Badge>
              <Badge variant="outline">{categoryMeta[action.category].label}</Badge>
              <span className="text-xs text-muted-foreground">{action.age}</span>
            </div>
            <h3 className="mt-2 text-base font-semibold leading-tight text-foreground">{action.issueType}</h3>
            <p className="mt-1 text-sm font-medium text-foreground">{action.subject}</p>
            <p className="mt-1 text-sm text-muted-foreground">{action.impact}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:w-80">
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {action.recommendedAction}
          </div>
          {canOpen ? (
            <Button asChild className="w-full gap-2" onClick={() => logAttentionOpen(action)}>
              <Link to={action.href}>
                {action.ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button disabled variant="outline" className="w-full justify-start text-left">
              {permissionReason(action.permission)}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyAttentionState() {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="py-12 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h3 className="text-xl font-semibold">Tout est à jour.</h3>
        <p className="mt-2 text-sm text-muted-foreground">Aucune action urgente pour le moment.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline"><Link to="/admin/drivers">Voir les chauffeurs</Link></Button>
          <Button asChild variant="outline"><Link to="/admin/vehicles">Voir les véhicules</Link></Button>
          <Button asChild variant="outline"><Link to="/admin/finance">Voir les finances</Link></Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const guard = useRoleGuard();
  const { data, isLoading, isFetching } = useAttentionCenter();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeFilter = (searchParams.get('filter') as AttentionFilter | null) ?? 'all';

  const setFilter = (filter: AttentionFilter) => {
    const next = new URLSearchParams(searchParams);
    if (filter === 'all') next.delete('filter');
    else next.set('filter', filter);
    setSearchParams(next, { replace: true });
  };

  const invalidateAttention = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-attention-center'] });
  };

  useRealtimePostgresChanges('payments', '*', () => true, invalidateAttention);
  useRealtimePostgresChanges('invoice', '*', () => true, invalidateAttention);
  useRealtimePostgresChanges('vehicle_inspections', '*', () => true, invalidateAttention);
  useRealtimePostgresChanges('kyc_submissions', '*', () => true, invalidateAttention);
  useRealtimePostgresChanges('accidents', '*', () => true, invalidateAttention);
  useRealtimePostgresChanges('traffic_violations', '*', () => true, invalidateAttention);
  useRealtimePostgresChanges('loans', '*', () => true, invalidateAttention);

  const actions = useMemo(() => data?.actions ?? [], [data?.actions]);
  const filteredActions = useMemo(
    () => activeFilter === 'all' ? actions : actions.filter((action) => action.filterTags.includes(activeFilter)),
    [actions, activeFilter],
  );

  const handleRefresh = async () => {
    logAction({
      action: 'attention_center_refreshed',
      targetType: 'attention_center',
      details: { source: 'attention_center' },
    });
    await queryClient.invalidateQueries({ queryKey: ['admin-attention-center'] });
    toast.success('Centre d’attention actualisé');
  };

  const handleExport = () => {
    logAction({
      action: 'attention_center_exported_report',
      targetType: 'attention_center',
      details: { source: 'attention_center', action_count: filteredActions.length, filter: activeFilter },
    });
    downloadCsv(`attention-center-${new Date().toISOString().slice(0, 10)}.csv`, filteredActions);
  };

  return (
    <AdminLayout>
      <HeroCard
        eyebrow="Centre d’attention"
        title="Centre d’attention"
        subtitle="Ce qui nécessite votre action aujourd’hui."
        pills={
          <>
            <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10">
              {data?.generatedAt ? `Mis à jour ${formatRelativeTime(data.generatedAt).toLowerCase()}` : 'Chargement'}
            </Badge>
            {isFetching && <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10">Actualisation</Badge>}
          </>
        }
        actions={
          <>
            <Button variant="secondary" size="sm" className="gap-2 bg-white text-foreground hover:bg-white/90" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
              Actualiser
            </Button>
            <Button variant="secondary" size="sm" className="gap-2 bg-white text-foreground hover:bg-white/90 disabled:bg-white/60 disabled:text-foreground/50" onClick={handleExport} disabled={filteredActions.length === 0}>
              <Download className="h-4 w-4" />
              Exporter le rapport
            </Button>
            <Button asChild size="sm" className="gap-2 bg-white text-foreground hover:bg-white/90">
              <Link to="/admin/alertes">
                <Bell className="h-4 w-4" />
                Voir toutes les alertes
              </Link>
            </Button>
          </>
        }
      />

      {data?.warnings.length ? (
        <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          Données en attente : {data.warnings.slice(0, 3).join(' · ')}
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {isLoading
          ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-[148px] rounded-2xl" />)
          : data?.kpis.map((kpi) => {
              const Icon = kpiIcons[kpi.key];
              const selected = activeFilter === kpi.filter;
              return (
                <button
                  key={kpi.key}
                  type="button"
                  onClick={() => setFilter(selected ? 'all' : kpi.filter)}
                  className="min-w-0 rounded-2xl text-left outline-none ring-primary/30 transition focus-visible:ring-2"
                  aria-pressed={selected}
                >
                  <KpiTile
                    label={kpi.label}
                    value={kpi.value}
                    icon={Icon}
                    variant={kpi.tone}
                    hint={kpi.hint}
                    className={selected ? 'ring-2 ring-primary shadow-md' : undefined}
                  />
                </button>
              );
            })}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-6">
        {data?.categories.map((category) => {
          const Icon = categoryMeta[category.key].icon;
          return (
            <Link
              key={category.key}
              to={category.href}
              className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${categoryMeta[category.key].className}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="text-2xl font-bold">{category.count}</div>
              <div className="mt-1 text-sm font-semibold">{category.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{category.description}</div>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>À traiter maintenant</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeFilter === 'all'
                ? `${filteredActions.length} action(s) priorisée(s)`
                : `${filteredActions.length} action(s) · filtre ${filterLabels[activeFilter]}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'today_cash', 'overdue', 'fleet_control', 'vehicles', 'drivers_risk', 'pending_requests'] as AttentionFilter[]).map((filter) => (
              <Button
                key={filter}
                size="sm"
                variant={activeFilter === filter ? 'default' : 'outline'}
                onClick={() => setFilter(filter)}
              >
                {filterLabels[filter]}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-xl" />)}
            </div>
          ) : filteredActions.length === 0 ? (
            <EmptyAttentionState />
          ) : (
            <div className="space-y-3">
              {filteredActions.map((action) => (
                <AttentionActionCard
                  key={action.id}
                  action={action}
                  canOpen={canUseAction(action.permission, guard)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Les actions pointent vers les modules existants. Les actions non autorisées sont désactivées avec une raison.
          </span>
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <Link to="/admin/dashboard">
              Alias dashboard
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
}
