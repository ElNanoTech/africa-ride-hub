import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  Car,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  Gauge,
  History,
  MapPin,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Wrench,
} from 'lucide-react';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { LoadingState } from '@/components/LoadingState';
import { AssignVehicleDialog } from '@/components/admin/AssignVehicleDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency, formatDateShort, formatDateTime } from '@/lib/format';
import { addDaysKey, buildVehicleEconomics, dateKey, isControlOverdue, isVehicleImmobilized } from '@/lib/vehicleOperations';
import { cn } from '@/lib/utils';
import { resolveVehicleImage } from '@/lib/vehicleImages';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useVehicleOperationsData, type VehicleOperationRow } from '@/hooks/useVehicleOperationsData';
import type { VehicleEconomics, VehicleHealthState, VehicleOperationalStatus, VehicleProfitabilityState } from '@/lib/vehicleOperations';

type FinanceRange = '7d' | '30d' | '90d' | '12m';

const FINANCE_RANGES: Array<{ key: FinanceRange; label: string; days: number }> = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
  { key: '12m', label: '12 months', days: 365 },
];

function badgeForHealth(state: VehicleHealthState) {
  if (state === 'Healthy') return 'success';
  if (state === 'Warning') return 'high';
  return 'destructive';
}

function badgeForStatus(status: VehicleOperationalStatus) {
  switch (status) {
    case 'Available': return 'success';
    case 'Assigned': return 'active';
    case 'Maintenance': return 'high';
    case 'Blocked':
    case 'Accident': return 'destructive';
    case 'Retired': return 'outline';
  }
}

function badgeForProfitability(state: VehicleProfitabilityState) {
  if (state === 'Profitable') return 'success';
  if (state === 'Breakeven') return 'high';
  return 'destructive';
}

function InfoTile({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon: typeof Car;
}) {
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
          <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/40">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      {detail && <p className="mt-2 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function VehiclePortrait({ row }: { row: VehicleOperationRow }) {
  const image = resolveVehicleImage(row.vehicle.image_url, row.vehicle.model_name);
  return (
    <div className="flex flex-col gap-4 rounded-md border bg-card p-4 md:flex-row md:items-center">
      <div className="flex h-32 w-full items-center justify-center overflow-hidden rounded-md border bg-muted/30 md:w-44">
        {image ? (
          <img src={image} alt={row.label} className="h-full w-full object-cover" />
        ) : (
          <Car className="h-10 w-10 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight">{row.label}</h2>
          <Badge variant={badgeForStatus(row.status)}>{row.status}</Badge>
          <Badge variant={badgeForHealth(row.health.state)}>{row.health.state}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {row.vehicle.fleet_group ?? row.vehicle.vehicle_type ?? 'Unclassified'} fleet asset with {row.utilization30.utilizationRate}% utilization over the last 30 days.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Health score</p>
            <p className="font-semibold">{row.health.score}/100</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Current driver</p>
            <p className="font-semibold">{row.currentDriverName ?? 'Unassigned'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Net contribution</p>
            <p className={cn('font-semibold', row.economics30.netContribution >= 0 ? 'text-success' : 'text-destructive')}>
              {formatCurrency(row.economics30.netContribution)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ row }: { row: VehicleOperationRow }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>Identity, assignment, utilization, and health score.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <InfoLine label="Plate" value={row.vehicle.license_plate ?? 'N/A'} />
          <InfoLine label="Model" value={[row.vehicle.make, row.vehicle.model_name, row.vehicle.model_year].filter(Boolean).join(' ') || 'N/A'} />
          <InfoLine label="Category" value={row.vehicle.vehicle_type ?? 'N/A'} />
          <InfoLine label="Fleet" value={row.vehicle.fleet_group ?? 'N/A'} />
          <InfoLine label="Status" value={row.status} />
          <InfoLine label="Current driver" value={row.currentDriverName ?? 'Unassigned'} />
          <InfoLine label="Assignment date" value={row.assignmentDate ? formatDateShort(row.assignmentDate) : 'N/A'} />
          <InfoLine label="Health score" value={`${row.health.score}/100`} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Utilization Engine</CardTitle>
          <CardDescription>Last 30 days.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span>Utilization</span>
              <span className="font-medium">{row.utilization30.utilizationRate}%</span>
            </div>
            <Progress value={row.utilization30.utilizationRate} className="h-2" />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoLine label="Assigned days" value={row.utilization30.assignedDays} />
            <InfoLine label="Idle days" value={row.utilization30.idleDays} />
            <InfoLine label="Maintenance days" value={row.utilization30.maintenanceDays} />
            <InfoLine label="Blocked days" value={row.utilization30.blockedDays} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function DriverTab({ row, onAssign }: { row: VehicleOperationRow; onAssign: () => void }) {
  const ownershipEligible = (row.currentDriverScore ?? 0) >= 700 && row.health.state !== 'Critical' && row.economics90.netContribution > 0;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle>Driver Assignment</CardTitle>
          <CardDescription>Primary driver, rental context, score, and assignment history.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoLine label="Primary driver" value={row.currentDriverName ?? 'Unassigned'} />
            <InfoLine label="Secondary driver" value="Not configured" />
            <InfoLine label="Current rental" value={row.currentRental?.id ? row.currentRental.status ?? 'Active' : 'None'} />
            <InfoLine label="Assigned driver score" value={row.currentDriverScore != null ? row.currentDriverScore : 'N/A'} />
            <InfoLine label="Ownership eligibility" value={ownershipEligible ? 'Eligible' : 'Not eligible'} />
            <InfoLine label="Assignment date" value={row.assignmentDate ? formatDateShort(row.assignmentDate) : 'N/A'} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onAssign}>
              <UserPlus className="mr-2 h-4 w-4" />
              {row.currentRental ? 'Reassign' : 'Assign'}
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/rentals">
                <UserMinus className="mr-2 h-4 w-4" />
                Remove
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/rentals">
                <FileText className="mr-2 h-4 w-4" />
                Rentals
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Assignment History</CardTitle>
          <CardDescription>{row.rentals.length} rental record(s).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {row.rentals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assignment history.</p>
          ) : row.rentals.slice(0, 8).map((rental) => (
            <div key={rental.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{rental.drivers?.full_name ?? 'Driver'}</span>
                <Badge variant="outline">{rental.status ?? 'rental'}</Badge>
              </div>
              <p className="mt-1 text-muted-foreground">{rental.start_date ? formatDateShort(rental.start_date) : 'N/A'}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function FinanceTab({ row, today }: { row: VehicleOperationRow; today: string }) {
  const [range, setRange] = useState<FinanceRange>('30d');
  const selected = FINANCE_RANGES.find((item) => item.key === range) ?? FINANCE_RANGES[1];
  const economics = useMemo<VehicleEconomics>(() => buildVehicleEconomics({
    vehicleId: row.vehicle.id,
    rentals: row.rentals,
    payments: row.payments,
    maintenanceOrders: row.maintenanceOrders,
    charges: row.charges,
    violations: row.violations,
    rangeStart: addDaysKey(today, -(selected.days - 1)),
    rangeEnd: today,
  }), [row, selected.days, today]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FINANCE_RANGES.map((item) => (
          <Button
            key={item.key}
            variant={range === item.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setRange(item.key)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <InfoTile label="Revenue" value={formatCurrency(economics.revenue)} icon={Banknote} detail="Paid rental cash tied to this vehicle." />
        <InfoTile label="Maintenance Cost" value={formatCurrency(economics.maintenanceCost)} icon={Wrench} detail="Orders and repair charges." />
        <InfoTile label="Fines" value={formatCurrency(economics.fines)} icon={AlertTriangle} detail="Contraventions in range." />
        <InfoTile label="Insurance" value={formatCurrency(economics.insurance)} icon={ShieldCheck} detail="Insurance or assurance charges." />
        <InfoTile label="Net Contribution" value={formatCurrency(economics.netContribution)} icon={CircleDollarSign} detail="Operational indicator only." />
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Vehicle Profitability Index</CardTitle>
              <CardDescription>Revenue - maintenance - fines - insurance. Do not use for accounting.</CardDescription>
            </div>
            <Badge variant={badgeForProfitability(economics.profitability)}>{economics.profitability}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className={cn('text-3xl font-bold', economics.netContribution >= 0 ? 'text-success' : 'text-destructive')}>
            {formatCurrency(economics.netContribution)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function FleetControlTab({ row, today }: { row: VehicleOperationRow; today: string }) {
  const overdue = row.controls.filter((control) => isControlOverdue(control, today)).length;
  const lastValidation = row.latestControl?.validated_at ?? row.latestControl?.last_validated_at ?? null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fleet Control</CardTitle>
        <CardDescription>Current control, validation, overdue count, reminders, and immobilization.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <InfoLine label="Current control" value={row.latestControl?.status ?? 'None'} />
          <InfoLine label="Last validation" value={lastValidation ? formatDateShort(lastValidation) : 'N/A'} />
          <InfoLine label="Overdue count" value={overdue} />
          <InfoLine label="Reminders" value={row.latestControl?.reminder_count ?? 0} />
          <InfoLine label="Immobilization" value={isVehicleImmobilized(row.latestControl) ? row.latestControl?.immobilization_state ?? 'active' : 'None'} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/admin/fleet-control">
              <ClipboardCheck className="mr-2 h-4 w-4" />
              View Control
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/fleet-control">
              Open Review
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MaintenanceTab({ row }: { row: VehicleOperationRow }) {
  const completed = row.maintenanceOrders.filter((order) => ['completed', 'validated', 'closed'].includes((order.status ?? '').toLowerCase()));
  const totalCost = row.maintenanceOrders.reduce((sum, order) => sum + (Number(order.actual_cost ?? 0) || Number(order.estimated_cost ?? 0)), 0);
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Maintenance Summary</CardTitle>
          <CardDescription>Orders, repairs, cost, and downtime.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoLine label="Open orders" value={row.openMaintenance.length} />
          <InfoLine label="Completed repairs" value={completed.length} />
          <InfoLine label="Total maintenance cost" value={formatCurrency(totalCost)} />
          <InfoLine label="Downtime" value={`${row.utilization30.maintenanceDays} days`} />
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild>
              <Link to="/admin/maintenance">
                <Wrench className="mr-2 h-4 w-4" />
                Create Order
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/maintenance">View Orders</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {row.maintenanceOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No maintenance records.</p>
          ) : row.maintenanceOrders.slice(0, 8).map((order) => (
            <div key={order.id ?? order.order_number} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{order.order_number ?? order.order_type ?? 'Maintenance order'}</p>
                <Badge variant={order.status === 'completed' ? 'success' : 'outline'}>{order.status ?? 'open'}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{order.description ?? 'No description'}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function GpsTab({ row }: { row: VehicleOperationRow }) {
  const position = row.gpsPosition;
  const location = position?.lat != null && position?.lng != null ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}` : 'N/A';
  return (
    <Card>
      <CardHeader>
        <CardTitle>GPS</CardTitle>
        <CardDescription>Device, status, driver, and last known location.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <InfoLine label="Current location" value={location} />
          <InfoLine label="Last location" value={position?.last_update || position?.synced_at ? formatDateTime(position.last_update ?? position.synced_at ?? '') : 'N/A'} />
          <InfoLine label="Online/offline" value={position?.status ?? 'offline'} />
          <InfoLine label="GPS device" value={position?.imei_no ?? row.vehicle.uffizio_imei ?? row.vehicle.uffizio_device_id ?? 'N/A'} />
          <InfoLine label="Driver" value={position?.driver_name ?? row.currentDriverName ?? 'N/A'} />
        </div>
        <Button asChild>
          <Link to="/admin/tracking">
            <MapPin className="mr-2 h-4 w-4" />
            Open Tracking
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ContraventionsTab({ row }: { row: VehicleOperationRow }) {
  const unpaid = row.violations.filter((violation) => !['paid', 'liquidated', 'waived', 'cancelled', 'canceled'].includes((violation.status ?? '').toLowerCase()));
  const paid = row.violations.filter((violation) => !unpaid.includes(violation));
  const total = row.violations.reduce((sum, violation) => sum + Number(violation.amount ?? 0), 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoTile label="Unpaid fines" value={unpaid.length} icon={AlertTriangle} detail={formatCurrency(unpaid.reduce((sum, violation) => sum + Number(violation.amount ?? 0), 0))} />
        <InfoTile label="Paid fines" value={paid.length} icon={ShieldCheck} />
        <InfoTile label="Driver attribution" value={row.violations.filter((violation) => violation.driver_id).length} icon={UserPlus} />
        <InfoTile label="Amount" value={formatCurrency(total)} icon={Banknote} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Contraventions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {row.violations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contraventions for this vehicle.</p>
          ) : row.violations.slice(0, 8).map((violation) => (
            <div key={violation.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{violation.pv_number ?? violation.violation_type ?? 'Contravention'}</p>
                <p className="text-sm text-muted-foreground">{violation.violation_date ? formatDateShort(violation.violation_date) : 'N/A'} - {formatCurrency(Number(violation.amount ?? 0))}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm"><Link to="/admin/contraventions">View Fine</Link></Button>
                <Button asChild variant="outline" size="sm"><Link to="/admin/contraventions">Assign Driver</Link></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SinistresTab({ row }: { row: VehicleOperationRow }) {
  const open = row.accidents.filter((accident) => !['closed', 'resolved', 'cancelled', 'canceled'].includes((accident.status ?? '').toLowerCase()));
  const repairCosts = row.maintenanceOrders.reduce((sum, order) => sum + (Number(order.actual_cost ?? 0) || Number(order.estimated_cost ?? 0)), 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoTile label="Accidents" value={row.accidents.length} icon={AlertTriangle} />
        <InfoTile label="Open claims" value={open.length} icon={FileText} />
        <InfoTile label="Repair costs" value={formatCurrency(repairCosts)} icon={Wrench} />
        <InfoTile label="Insurance status" value={open.length > 0 ? 'Review' : 'Clear'} icon={ShieldCheck} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Sinistres</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {row.accidents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sinistres for this vehicle.</p>
          ) : row.accidents.slice(0, 8).map((accident) => (
            <div key={accident.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{accident.case_number ?? 'Sinistre'}</p>
                <p className="text-sm text-muted-foreground">{accident.accident_datetime ? formatDateShort(accident.accident_datetime) : 'N/A'} - {accident.status ?? 'open'}</p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to={accident.id ? `/admin/sinistres/${accident.id}` : '/admin/sinistres'}>Open Case</Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function HistoryTab({ row }: { row: VehicleOperationRow }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
        <CardDescription>Unified timeline from assignment, finance, control, maintenance, fines, and sinistres.</CardDescription>
      </CardHeader>
      <CardContent>
        {row.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No history events yet.</p>
        ) : (
          <div className="space-y-3">
            {row.history.slice(0, 20).map((event) => (
              <div key={event.id} className="flex gap-3 rounded-md border p-3">
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                  <History className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{event.label}</p>
                    <Badge variant="outline">{event.type}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{event.detail}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{dateKey(event.date) ? formatDateShort(event.date) : 'N/A'}</p>
                </div>
                {event.route && (
                  <Button asChild variant="ghost" size="sm">
                    <Link to={event.route}>Open</Link>
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminVehicleDetail() {
  const { id } = useParams();
  const guard = useRoleGuard();
  const canAccessVehicleOps = !guard.isLoading && guard.canManageFleet();
  const data = useVehicleOperationsData(canAccessVehicleOps);
  const [assignOpen, setAssignOpen] = useState(false);

  const row = data.rows.find((item) => item.vehicle.id === id) ?? null;

  if (!guard.isLoading && !canAccessVehicleOps) {
    return (
      <AdminLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="text-destructive">Access denied</CardTitle>
              <CardDescription>Vehicle 360 is limited to super_admin and manager roles.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-5">
        <AdminBreadcrumb items={[{ label: 'Vehicle Operations', href: '/admin/vehicle-operations' }, { label: row?.vehicle.license_plate ?? 'Vehicle 360' }]} />
        <AdminPageHeader
          title="Vehicle 360"
          description={row ? row.label : 'Operational profile for one fleet asset.'}
          action={(
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/admin/vehicle-operations">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Operations
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin/vehicles">
                  <Car className="mr-2 h-4 w-4" />
                  Inventory
                </Link>
              </Button>
            </div>
          )}
        />

        {guard.isLoading || data.isLoading ? (
          <LoadingState message="Loading vehicle 360..." />
        ) : !row ? (
          <Card>
            <CardHeader>
              <CardTitle>Vehicle not found</CardTitle>
              <CardDescription>This vehicle may have been removed or is outside your tenant scope.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild><Link to="/admin/vehicle-operations">Back to Vehicle Operations</Link></Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <VehiclePortrait row={row} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <InfoTile label="Utilization" value={`${row.utilization30.utilizationRate}%`} icon={Gauge} detail="Last 30 days." />
              <InfoTile label="Revenue 30 days" value={formatCurrency(row.economics30.revenue)} icon={Banknote} />
              <InfoTile label="Net Contribution" value={formatCurrency(row.economics30.netContribution)} icon={CircleDollarSign} />
              <InfoTile label="Health" value={row.health.state} icon={AlertTriangle} detail={row.health.reasons.slice(0, 2).join(', ')} />
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="flex h-auto flex-wrap justify-start gap-1">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="driver">Driver</TabsTrigger>
                <TabsTrigger value="finance">Finance</TabsTrigger>
                <TabsTrigger value="fleet-control">Fleet Control</TabsTrigger>
                <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
                <TabsTrigger value="gps">GPS</TabsTrigger>
                <TabsTrigger value="contraventions">Contraventions</TabsTrigger>
                <TabsTrigger value="sinistres">Sinistres</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
              <TabsContent value="overview"><OverviewTab row={row} /></TabsContent>
              <TabsContent value="driver"><DriverTab row={row} onAssign={() => setAssignOpen(true)} /></TabsContent>
              <TabsContent value="finance"><FinanceTab row={row} today={data.today} /></TabsContent>
              <TabsContent value="fleet-control"><FleetControlTab row={row} today={data.today} /></TabsContent>
              <TabsContent value="maintenance"><MaintenanceTab row={row} /></TabsContent>
              <TabsContent value="gps"><GpsTab row={row} /></TabsContent>
              <TabsContent value="contraventions"><ContraventionsTab row={row} /></TabsContent>
              <TabsContent value="sinistres"><SinistresTab row={row} /></TabsContent>
              <TabsContent value="history"><HistoryTab row={row} /></TabsContent>
            </Tabs>

            <AssignVehicleDialog
              open={assignOpen}
              onOpenChange={setAssignOpen}
              vehicleId={row.vehicle.id}
              vehicleLabel={row.label}
              defaultRate={row.vehicle.rent_per_day ?? null}
              onAssigned={() => setAssignOpen(false)}
            />
          </>
        )}
      </div>
    </AdminLayout>
  );
}
