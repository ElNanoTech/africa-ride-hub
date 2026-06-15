import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Banknote,
  Car,
  CircleDollarSign,
  Eye,
  Gauge,
  MapPin,
  Search,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Wrench,
} from 'lucide-react';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { LoadingState } from '@/components/LoadingState';
import { AssignVehicleDialog } from '@/components/admin/AssignVehicleDialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { cn } from '@/lib/utils';
import { resolveVehicleImage } from '@/lib/vehicleImages';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import {
  useVehicleOperationsData,
  type VehicleOperationRow,
} from '@/hooks/useVehicleOperationsData';
import type {
  VehicleHealthState,
  VehicleOperationalStatus,
  VehicleProfitabilityState,
} from '@/lib/vehicleOperations';

type MetricTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

function metricToneClass(tone: MetricTone) {
  switch (tone) {
    case 'success':
      return 'border-success/30 bg-success/10 text-success';
    case 'warning':
      return 'border-warning/30 bg-warning/10 text-warning';
    case 'danger':
      return 'border-destructive/30 bg-destructive/10 text-destructive';
    case 'info':
      return 'border-primary/30 bg-primary/10 text-primary';
    default:
      return 'border-border bg-card text-foreground';
  }
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Car;
  tone?: MetricTone;
}) {
  return (
    <Card className={cn('border', metricToneClass(tone))}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>
          </div>
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background/80', metricToneClass(tone))}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function healthBadgeVariant(state: VehicleHealthState) {
  if (state === 'Healthy') return 'success';
  if (state === 'Warning') return 'high';
  return 'destructive';
}

function statusBadgeVariant(status: VehicleOperationalStatus) {
  switch (status) {
    case 'Assigned': return 'active';
    case 'Available': return 'success';
    case 'Maintenance': return 'high';
    case 'Blocked':
    case 'Accident': return 'destructive';
    case 'Retired': return 'outline';
  }
}

function profitabilityBadgeVariant(state: VehicleProfitabilityState) {
  if (state === 'Profitable') return 'success';
  if (state === 'Breakeven') return 'high';
  return 'destructive';
}

function VehicleImage({ row }: { row: VehicleOperationRow }) {
  const image = resolveVehicleImage(row.vehicle.image_url, row.vehicle.model_name);
  return (
    <div className="flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
      {image ? (
        <img src={image} alt={row.label} className="h-full w-full object-cover" />
      ) : (
        <Car className="h-7 w-7 text-muted-foreground" />
      )}
    </div>
  );
}

function AttentionQueue({ items }: { items: ReturnType<typeof useVehicleOperationsData>['attentionQueue'] }) {
  const visible = items.slice(0, 6);
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Vehicle Attention Queue</CardTitle>
            <CardDescription>Idle assets, overdue controls, GPS outages, and assignment gaps.</CardDescription>
          </div>
          <Badge variant={items.length > 0 ? 'high' : 'success'}>{items.length} open</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
            No vehicle attention items right now.
          </div>
        ) : (
          <div className="divide-y rounded-md border">
            {visible.map((item, index) => (
              <div key={`${item.vehicleId}-${item.reason}-${index}`} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={item.severity === 'critical' ? 'destructive' : 'high'}>{item.severity}</Badge>
                    <p className="font-medium">{item.vehicleLabel}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
                </div>
                <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                  <Link to={item.route}>
                    {item.actionLabel}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VehicleRowCard({
  row,
  onAssign,
}: {
  row: VehicleOperationRow;
  onAssign: (row: VehicleOperationRow) => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(420px,1fr)] lg:items-center">
          <div className="flex min-w-0 gap-4">
            <VehicleImage row={row} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold">{row.label}</h3>
                <Badge variant={statusBadgeVariant(row.status)}>{row.status}</Badge>
                <Badge variant={healthBadgeVariant(row.health.state)}>{row.health.state}</Badge>
              </div>
              <div className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                <span>Driver: {row.currentDriverName ?? 'Unassigned'}</span>
                <span>Fleet: {row.vehicle.fleet_group ?? row.vehicle.vehicle_type ?? 'Unclassified'}</span>
                <span>Assignment: {row.assignmentDate ? formatDateShort(row.assignmentDate) : 'N/A'}</span>
                <span>GPS: {row.gpsPosition?.status ?? 'offline'}</span>
              </div>
              {row.attentionItems.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {row.attentionItems.slice(0, 3).map((item) => (
                    <Badge key={item.reason} variant={item.severity === 'critical' ? 'destructive' : 'outline'}>
                      {item.reason}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-[repeat(4,minmax(0,1fr))]">
            <div>
              <p className="text-xs text-muted-foreground">Revenue</p>
              <p className="font-semibold">{formatCurrency(row.economics30.revenue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cost</p>
              <p className="font-semibold">{formatCurrency(row.economics30.maintenanceCost + row.economics30.fines + row.economics30.insurance)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Utilization</p>
              <div className="mt-1 flex items-center gap-2">
                <Progress value={row.utilization30.utilizationRate} className="h-2" />
                <span className="w-10 text-right text-sm font-medium">{row.utilization30.utilizationRate}%</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Health Score</p>
              <p className="font-semibold">{row.health.score}/100</p>
            </div>
          </div>
        </div>

        <Separator className="my-4" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={profitabilityBadgeVariant(row.economics30.profitability)}>
              {row.economics30.profitability}
            </Badge>
            <span className={cn('text-sm font-medium', row.economics30.netContribution >= 0 ? 'text-success' : 'text-destructive')}>
              Net {formatCurrency(row.economics30.netContribution)}
            </span>
            <span className="text-sm text-muted-foreground">
              {row.retirement.level === 'Normal' ? 'Retirement normal' : `Retirement ${row.retirement.level}`}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`/admin/vehicles/${row.vehicle.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View 360
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => onAssign(row)}>
              <UserPlus className="mr-2 h-4 w-4" />
              {row.currentRental ? 'Reassign' : 'Assign'}
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/tracking">
                <MapPin className="mr-2 h-4 w-4" />
                Tracking
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminVehicleOperations() {
  const guard = useRoleGuard();
  const canAccessVehicleOps = !guard.isLoading && guard.canManageFleet();
  const data = useVehicleOperationsData(canAccessVehicleOps);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [profitFilter, setProfitFilter] = useState('all');
  const [assigning, setAssigning] = useState<VehicleOperationRow | null>(null);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (healthFilter !== 'all' && row.health.state !== healthFilter) return false;
      if (profitFilter !== 'all' && row.economics30.profitability !== profitFilter) return false;
      if (!term) return true;
      const haystack = [
        row.label,
        row.vehicle.license_plate,
        row.vehicle.model_name,
        row.vehicle.make,
        row.vehicle.fleet_group,
        row.currentDriverName,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [data.rows, healthFilter, profitFilter, search, statusFilter]);

  if (!guard.isLoading && !canAccessVehicleOps) {
    return (
      <AdminLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="text-destructive">Access denied</CardTitle>
              <CardDescription>Layer 2D Vehicle Operations is limited to super_admin and manager roles.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-5">
        <AdminBreadcrumb items={[{ label: 'Vehicle Operations' }]} />
        <AdminPageHeader
          title="Vehicle Operations"
          description="Fleet profitability, utilization, health, assignment gaps, maintenance, controls, GPS, fines, and sinistres in one operator view."
          action={(
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/admin/vehicles">
                  <Car className="mr-2 h-4 w-4" />
                  Inventory
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin/maintenance">
                  <Wrench className="mr-2 h-4 w-4" />
                  Maintenance
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin/fleet-control">
                  <ShieldAlert className="mr-2 h-4 w-4" />
                  Fleet Control
                </Link>
              </Button>
            </div>
          )}
        />

        {guard.isLoading || data.isLoading ? (
          <LoadingState message="Loading vehicle operations..." />
        ) : data.isError ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-destructive">Vehicle operations unavailable</CardTitle>
              <CardDescription>{data.error instanceof Error ? data.error.message : 'Unable to load fleet data.'}</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Total Vehicles" value={data.overview.totalVehicles} detail="Tenant fleet assets visible to this operator." icon={Car} tone="info" />
              <MetricCard label="Assigned" value={data.overview.assigned} detail="Vehicles currently committed to open rentals." icon={UserCheck} tone="success" />
              <MetricCard label="Available" value={data.overview.available} detail="Ready vehicles without an open assignment." icon={Activity} tone="default" />
              <MetricCard label="Maintenance" value={data.overview.maintenance} detail="Vehicles currently marked or inferred in service." icon={Wrench} tone="warning" />
              <MetricCard label="Immobilized" value={data.overview.immobilized} detail="Fleet control immobilization state active." icon={ShieldAlert} tone={data.overview.immobilized > 0 ? 'danger' : 'success'} />
              <MetricCard label="Utilization Rate" value={`${data.overview.utilizationRate}%`} detail="Average assigned days over the last 30 days." icon={Gauge} tone={data.overview.utilizationRate >= 70 ? 'success' : 'warning'} />
              <MetricCard label="Revenue This Month" value={formatCurrency(data.overview.revenueThisMonth)} detail="Paid rental cash tied back to vehicles." icon={Banknote} tone="success" />
              <MetricCard label="Maintenance Cost This Month" value={formatCurrency(data.overview.maintenanceCostThisMonth)} detail="Orders plus repair charges this month." icon={CircleDollarSign} tone={data.overview.maintenanceCostThisMonth > 0 ? 'warning' : 'default'} />
            </div>

            <AttentionQueue items={data.attentionQueue} />

            <section className="space-y-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Vehicle Profitability Index</h2>
                  <p className="text-sm text-muted-foreground">Operational indicator only: revenue minus maintenance, fines, and insurance. Do not use for accounting.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[260px_170px_170px_180px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search vehicle, plate, driver"
                      className="pl-9"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {(['Available', 'Assigned', 'Maintenance', 'Blocked', 'Accident', 'Retired'] as const).map((status) => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={healthFilter} onValueChange={setHealthFilter}>
                    <SelectTrigger><SelectValue placeholder="Health" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All health</SelectItem>
                      {(['Healthy', 'Warning', 'Critical'] as const).map((state) => (
                        <SelectItem key={state} value={state}>{state}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={profitFilter} onValueChange={setProfitFilter}>
                    <SelectTrigger><SelectValue placeholder="Profitability" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All profitability</SelectItem>
                      {(['Profitable', 'Breakeven', 'Loss-Making'] as const).map((state) => (
                        <SelectItem key={state} value={state}>{state}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {filteredRows.length === 0 ? (
                <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No vehicles match the current filters.
                </div>
              ) : (
                filteredRows.map((row) => (
                  <VehicleRowCard key={row.vehicle.id} row={row} onAssign={setAssigning} />
                ))
              )}
            </section>
          </>
        )}
      </div>

      <AssignVehicleDialog
        open={!!assigning}
        onOpenChange={(open) => !open && setAssigning(null)}
        vehicleId={assigning?.vehicle.id}
        vehicleLabel={assigning?.label}
        defaultRate={assigning?.vehicle.rent_per_day ?? null}
        onAssigned={() => setAssigning(null)}
      />
    </AdminLayout>
  );
}
