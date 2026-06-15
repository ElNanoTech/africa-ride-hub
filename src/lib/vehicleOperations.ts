import { OPEN_RENTAL_STATUSES } from './rentals';

export type VehicleHealthState = 'Healthy' | 'Warning' | 'Critical';
export type VehicleHealthTone = 'healthy' | 'warning' | 'critical';
export type VehicleOperationalStatus = 'Available' | 'Assigned' | 'Maintenance' | 'Blocked' | 'Accident' | 'Retired';
export type VehicleProfitabilityState = 'Profitable' | 'Breakeven' | 'Loss-Making';
export type VehicleAttentionSeverity = 'warning' | 'critical';

export type VehicleMetricLike = {
  id: string;
  license_plate?: string | null;
  model_name?: string | null;
  make?: string | null;
  model_year?: number | null;
  vehicle_type?: string | null;
  fleet_group?: string | null;
  status?: string | null;
  rent_per_day?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  image_url?: string | null;
  gps_active?: boolean | null;
  uffizio_device_id?: string | null;
  uffizio_imei?: string | null;
};

export type DriverMetricLike = {
  id?: string | null;
  full_name?: string | null;
  phone_number?: string | null;
};

export type RentalMetricLike = {
  id: string;
  vehicle_id?: string | null;
  driver_id?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  returned_at?: string | null;
  return_confirmed_at?: string | null;
  approved_rate?: number | null;
  requested_rate?: number | null;
  final_rate?: number | null;
  total_amount?: number | null;
  rental_days?: number | null;
  payment_due_at?: string | null;
  created_at?: string | null;
  drivers?: DriverMetricLike | null;
};

export type PaymentMetricLike = {
  id?: string;
  vehicle_id?: string | null;
  rental_id?: string | null;
  amount?: number | null;
  amount_paid?: number | null;
  status?: string | null;
  due_date?: string | null;
  paid_date?: string | null;
  paid_at?: string | null;
  payment_type?: string | null;
  created_at?: string | null;
};

export type MaintenanceMetricLike = {
  id?: string;
  vehicle_id?: string | null;
  order_number?: string | null;
  order_type?: string | null;
  priority?: string | null;
  status?: string | null;
  actual_cost?: number | null;
  estimated_cost?: number | null;
  scheduled_date?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  description?: string | null;
};

export type OtherChargeMetricLike = {
  id?: string;
  vehicle_id?: string | null;
  amount?: number | null;
  charge_type?: string | null;
  label?: string | null;
  charge_date?: string | null;
  created_at?: string | null;
};

export type FleetControlMetricLike = {
  id?: string;
  vehicle_id?: string | null;
  driver_id?: string | null;
  rental_id?: string | null;
  status?: string | null;
  due_at?: string | null;
  last_validated_at?: string | null;
  validated_at?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reminder_count?: number | null;
  last_reminder_at?: string | null;
  immobilization_state?: string | null;
  immobilized_at?: string | null;
  created_at?: string | null;
};

export type GpsMetricLike = {
  id?: string;
  vehicle_id?: string | null;
  vehicle_no?: string | null;
  imei_no?: string | null;
  device_name?: string | null;
  driver_name?: string | null;
  status?: string | null;
  last_update?: string | null;
  synced_at?: string | null;
  recorded_at?: string | null;
  lat?: number | null;
  lng?: number | null;
  speed?: number | null;
  ignition?: string | null;
};

export type ViolationMetricLike = {
  id?: string;
  vehicle_id?: string | null;
  driver_id?: string | null;
  license_plate?: string | null;
  violation_type?: string | null;
  violation_date?: string | null;
  payment_due_date?: string | null;
  amount?: number | null;
  status?: string | null;
  paid_at?: string | null;
  pv_number?: string | null;
  location?: string | null;
};

export type AccidentMetricLike = {
  id?: string;
  vehicle_id?: string | null;
  driver_id?: string | null;
  case_number?: string | null;
  status?: string | null;
  severity?: string | null;
  accident_datetime?: string | null;
  closed_at?: string | null;
  created_at?: string | null;
  description?: string | null;
};

export type VehicleEconomics = {
  revenue: number;
  maintenanceCost: number;
  fines: number;
  insurance: number;
  netContribution: number;
  profitability: VehicleProfitabilityState;
};

export type VehicleUtilization = {
  assignedDays: number;
  idleDays: number;
  maintenanceDays: number;
  blockedDays: number;
  utilizationRate: number;
  windowDays: number;
};

export type VehicleHealth = {
  state: VehicleHealthState;
  tone: VehicleHealthTone;
  score: number;
  reasons: string[];
};

export type VehicleAttentionItem = {
  vehicleId: string;
  vehicleLabel: string;
  severity: VehicleAttentionSeverity;
  reason: string;
  actionLabel: string;
  route: string;
};

export type VehicleRetirementReadiness = {
  level: 'Normal' | 'Watch' | 'Review';
  reasons: string[];
};

export type VehicleHistoryEvent = {
  id: string;
  type: 'vehicle' | 'driver' | 'finance' | 'maintenance' | 'fleet_control' | 'gps' | 'contravention' | 'sinistre';
  label: string;
  detail: string;
  date: string;
  route?: string;
};

const ACTIVE_RENTAL_STATUS_SET = new Set<string>(OPEN_RENTAL_STATUSES);
const CLOSED_MAINTENANCE_STATUS_SET = new Set(['completed', 'validated', 'cancelled', 'canceled', 'closed', 'done']);
const VALIDATED_CONTROL_STATUS_SET = new Set(['validated', 'approved', 'completed', 'ok', 'passed']);
const CLOSED_ACCIDENT_STATUS_SET = new Set(['closed', 'resolved', 'cancelled', 'canceled', 'rejected']);
const PAID_VIOLATION_STATUS_SET = new Set(['paid', 'liquidated', 'waived', 'cancelled', 'canceled']);
const MS_PER_DAY = 86_400_000;

function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function dateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function dateMs(value: string): number {
  return new Date(`${value}T00:00:00Z`).getTime();
}

export function addDaysKey(value: string, days: number): string {
  return new Date(dateMs(value) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.floor((dateMs(to) - dateMs(from)) / MS_PER_DAY));
}

function isWithinRange(value: string | null | undefined, rangeStart: string, rangeEnd: string): boolean {
  const key = dateKey(value);
  if (!key) return false;
  return key >= rangeStart && key <= rangeEnd;
}

function overlapDays(startValue: string | null | undefined, endValue: string | null | undefined, rangeStart: string, rangeEnd: string): number {
  const rawStart = dateKey(startValue);
  if (!rawStart) return 0;
  const rawEnd = dateKey(endValue) ?? rangeEnd;
  const start = rawStart > rangeStart ? rawStart : rangeStart;
  const end = rawEnd < rangeEnd ? rawEnd : rangeEnd;
  if (end < start) return 0;
  return daysBetween(start, end) + 1;
}

export function vehicleLabel(vehicle: Pick<VehicleMetricLike, 'make' | 'model_name' | 'license_plate'> | null | undefined): string {
  if (!vehicle) return 'Vehicle';
  const model = [vehicle.make, vehicle.model_name].filter(Boolean).join(' ').trim() || 'Vehicle';
  return vehicle.license_plate ? `${model} - ${vehicle.license_plate}` : model;
}

export function isOpenRental(rental: Pick<RentalMetricLike, 'status'>): boolean {
  return ACTIVE_RENTAL_STATUS_SET.has(rental.status ?? '');
}

export function isOpenMaintenance(order: Pick<MaintenanceMetricLike, 'status'>): boolean {
  return !CLOSED_MAINTENANCE_STATUS_SET.has(normalize(order.status));
}

export function isControlOverdue(control: FleetControlMetricLike, today: string): boolean {
  const status = normalize(control.status);
  if (VALIDATED_CONTROL_STATUS_SET.has(status)) return false;
  const due = dateKey(control.due_at);
  return !!due && due < today;
}

export function isVehicleImmobilized(control: FleetControlMetricLike | null | undefined): boolean {
  if (!control) return false;
  const state = normalize(control.immobilization_state);
  return !!control.immobilized_at || (!!state && !['none', 'cancelled', 'canceled', 'released', 'clear'].includes(state));
}

export function isGpsOffline(position: GpsMetricLike | null | undefined, today: string): boolean {
  if (!position) return true;
  const status = normalize(position.status);
  if (status === 'offline') return true;
  const last = dateKey(position.last_update ?? position.recorded_at ?? position.synced_at);
  return !!last && daysBetween(last, today) > 1;
}

export function normalizeVehicleStatus(input: {
  vehicle: Pick<VehicleMetricLike, 'status'>;
  currentRental?: RentalMetricLike | null;
  currentControl?: FleetControlMetricLike | null;
  openAccidents?: AccidentMetricLike[];
}): VehicleOperationalStatus {
  const raw = normalize(input.vehicle.status);
  if (raw === 'retired' || raw === 'scrapped') return 'Retired';
  if (raw === 'accident' || (input.openAccidents?.length ?? 0) > 0) return 'Accident';
  if (raw === 'blocked' || raw === 'immobilized' || raw === 'vehicle_disabled' || isVehicleImmobilized(input.currentControl)) return 'Blocked';
  if (raw === 'maintenance' || raw === 'repair') return 'Maintenance';
  if (input.currentRental || raw === 'rented' || raw === 'assigned' || raw === 'active') return 'Assigned';
  return 'Available';
}

export function buildVehicleEconomics(input: {
  vehicleId: string;
  rentals: RentalMetricLike[];
  payments: PaymentMetricLike[];
  maintenanceOrders: MaintenanceMetricLike[];
  charges: OtherChargeMetricLike[];
  violations: ViolationMetricLike[];
  rangeStart: string;
  rangeEnd: string;
}): VehicleEconomics {
  const rentalIds = new Set(input.rentals.filter((r) => r.vehicle_id === input.vehicleId).map((r) => r.id));
  const revenue = input.payments
    .filter((payment) => {
      const vehicleMatches = payment.vehicle_id === input.vehicleId || (!!payment.rental_id && rentalIds.has(payment.rental_id));
      const date = payment.paid_at ?? payment.paid_date ?? payment.due_date ?? payment.created_at;
      return vehicleMatches && isWithinRange(date, input.rangeStart, input.rangeEnd);
    })
    .reduce((sum, payment) => {
      const paid = Number(payment.amount_paid ?? 0);
      if (paid > 0) return sum + paid;
      return normalize(payment.status) === 'paid' ? sum + Number(payment.amount ?? 0) : sum;
    }, 0);

  const orderCost = input.maintenanceOrders
    .filter((order) => order.vehicle_id === input.vehicleId)
    .filter((order) => isWithinRange(order.completed_at ?? order.scheduled_date ?? order.created_at, input.rangeStart, input.rangeEnd))
    .reduce((sum, order) => {
      const actual = Number(order.actual_cost ?? 0);
      return sum + (actual > 0 ? actual : Number(order.estimated_cost ?? 0));
    }, 0);

  const maintenanceChargeCost = input.charges
    .filter((charge) => charge.vehicle_id === input.vehicleId)
    .filter((charge) => isWithinRange(charge.charge_date ?? charge.created_at, input.rangeStart, input.rangeEnd))
    .filter((charge) => {
      const text = normalize(`${charge.charge_type ?? ''} ${charge.label ?? ''}`);
      return text.includes('maintenance') || text.includes('repair') || text.includes('reparation') || text.includes('garage');
    })
    .reduce((sum, charge) => sum + Number(charge.amount ?? 0), 0);

  const insurance = input.charges
    .filter((charge) => charge.vehicle_id === input.vehicleId)
    .filter((charge) => isWithinRange(charge.charge_date ?? charge.created_at, input.rangeStart, input.rangeEnd))
    .filter((charge) => {
      const text = normalize(`${charge.charge_type ?? ''} ${charge.label ?? ''}`);
      return text.includes('insurance') || text.includes('assurance');
    })
    .reduce((sum, charge) => sum + Number(charge.amount ?? 0), 0);

  const fines = input.violations
    .filter((violation) => violation.vehicle_id === input.vehicleId)
    .filter((violation) => isWithinRange(violation.violation_date, input.rangeStart, input.rangeEnd))
    .reduce((sum, violation) => sum + Number(violation.amount ?? 0), 0);

  const maintenanceCost = orderCost + maintenanceChargeCost;
  const netContribution = revenue - maintenanceCost - fines - insurance;

  let profitability: VehicleProfitabilityState = 'Loss-Making';
  const breakevenBand = Math.max(5000, revenue * 0.05);
  if (netContribution > breakevenBand) profitability = 'Profitable';
  else if (Math.abs(netContribution) <= breakevenBand) profitability = 'Breakeven';

  return {
    revenue,
    maintenanceCost,
    fines,
    insurance,
    netContribution,
    profitability,
  };
}

export function buildVehicleUtilization(input: {
  vehicleId: string;
  vehicleStatus?: VehicleOperationalStatus;
  rentals: RentalMetricLike[];
  maintenanceOrders: MaintenanceMetricLike[];
  controls: FleetControlMetricLike[];
  today: string;
  windowDays: number;
}): VehicleUtilization {
  const rangeEnd = input.today;
  const rangeStart = addDaysKey(input.today, -(input.windowDays - 1));

  const assignedDays = Math.min(input.windowDays, input.rentals
    .filter((rental) => rental.vehicle_id === input.vehicleId)
    .reduce((sum, rental) => {
      const end = rental.returned_at ?? rental.return_confirmed_at ?? rental.end_date ?? (isOpenRental(rental) ? rangeEnd : rental.end_date);
      return sum + overlapDays(rental.start_date ?? rental.created_at, end, rangeStart, rangeEnd);
    }, 0));

  const maintenanceDays = Math.min(input.windowDays - assignedDays, input.maintenanceOrders
    .filter((order) => order.vehicle_id === input.vehicleId && isOpenMaintenance(order))
    .reduce((sum, order) => sum + overlapDays(order.started_at ?? order.scheduled_date ?? order.created_at, order.completed_at, rangeStart, rangeEnd), 0));

  const hasImmobilization = input.controls.some((control) => control.vehicle_id === input.vehicleId && isVehicleImmobilized(control));
  const isBlockedStatus = ['Blocked', 'Accident', 'Retired'].includes(input.vehicleStatus ?? 'Available');
  const blockedDays = hasImmobilization || isBlockedStatus
    ? Math.max(1, input.windowDays - assignedDays - maintenanceDays)
    : 0;

  const usedDays = Math.min(input.windowDays, assignedDays + maintenanceDays + blockedDays);
  const idleDays = Math.max(0, input.windowDays - usedDays);

  return {
    assignedDays,
    idleDays,
    maintenanceDays,
    blockedDays,
    utilizationRate: input.windowDays > 0 ? Math.round((assignedDays / input.windowDays) * 100) : 0,
    windowDays: input.windowDays,
  };
}

export function buildVehicleHealth(input: {
  status: VehicleOperationalStatus;
  utilization: VehicleUtilization;
  openMaintenance: MaintenanceMetricLike[];
  controls: FleetControlMetricLike[];
  violations: ViolationMetricLike[];
  accidents: AccidentMetricLike[];
  gpsPosition?: GpsMetricLike | null;
  today: string;
}): VehicleHealth {
  const reasons: string[] = [];
  let score = 100;

  const urgentMaintenance = input.openMaintenance.some((order) => ['high', 'urgent', 'critical'].includes(normalize(order.priority)));
  const overdueMaintenance = input.openMaintenance.some((order) => {
    const scheduled = dateKey(order.scheduled_date ?? order.created_at);
    return !!scheduled && scheduled < input.today;
  });
  if (input.openMaintenance.length > 0) {
    score -= urgentMaintenance || overdueMaintenance ? 25 : 15;
    reasons.push(overdueMaintenance ? 'Maintenance overdue' : 'Open maintenance');
  }

  const overdueControls = input.controls.filter((control) => isControlOverdue(control, input.today)).length;
  const immobilized = input.controls.some(isVehicleImmobilized);
  if (immobilized) {
    score -= 35;
    reasons.push('Immobilized by fleet control');
  } else if (overdueControls > 0) {
    score -= 20;
    reasons.push('Fleet control overdue');
  }

  const openAccidents = input.accidents.filter((accident) => !CLOSED_ACCIDENT_STATUS_SET.has(normalize(accident.status)));
  if (openAccidents.length > 0) {
    score -= 25;
    reasons.push('Open sinistre');
  }

  const unpaidFines = input.violations.filter((violation) => !PAID_VIOLATION_STATUS_SET.has(normalize(violation.status)));
  if (unpaidFines.length > 0) {
    score -= Math.min(20, 8 + unpaidFines.length * 4);
    reasons.push('Unpaid fines');
  }

  if (isGpsOffline(input.gpsPosition, input.today)) {
    score -= 15;
    reasons.push('GPS offline');
  }

  if (input.utilization.idleDays > 14) {
    score -= 12;
    reasons.push('Idle more than 14 days');
  } else if (input.utilization.utilizationRate < 25) {
    score -= 8;
    reasons.push('Low utilization');
  }

  if (['Blocked', 'Accident', 'Retired'].includes(input.status)) {
    score -= 20;
    if (!reasons.includes(`${input.status} status`)) reasons.push(`${input.status} status`);
  } else if (input.status === 'Maintenance') {
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));

  const critical = score < 50 || immobilized || openAccidents.length > 0 || input.status === 'Blocked' || input.status === 'Accident';
  const warning = score < 80 || reasons.length > 0;
  const state: VehicleHealthState = critical ? 'Critical' : warning ? 'Warning' : 'Healthy';

  return {
    state,
    tone: state === 'Healthy' ? 'healthy' : state === 'Warning' ? 'warning' : 'critical',
    score,
    reasons: reasons.length > 0 ? reasons : ['No active operational issue'],
  };
}

export function buildVehicleAttention(input: {
  vehicle: VehicleMetricLike;
  status: VehicleOperationalStatus;
  currentRental?: RentalMetricLike | null;
  utilization: VehicleUtilization;
  controls: FleetControlMetricLike[];
  openMaintenance: MaintenanceMetricLike[];
  gpsPosition?: GpsMetricLike | null;
  today: string;
}): VehicleAttentionItem[] {
  const label = vehicleLabel(input.vehicle);
  const items: VehicleAttentionItem[] = [];

  if (!input.currentRental && input.status === 'Available' && input.utilization.idleDays > 14) {
    items.push({
      vehicleId: input.vehicle.id,
      vehicleLabel: label,
      severity: 'warning',
      reason: 'Vehicle idle > 14 days',
      actionLabel: 'Assign driver',
      route: `/admin/vehicles/${input.vehicle.id}`,
    });
  }

  if (!input.currentRental && !['Maintenance', 'Blocked', 'Accident', 'Retired'].includes(input.status)) {
    items.push({
      vehicleId: input.vehicle.id,
      vehicleLabel: label,
      severity: 'warning',
      reason: 'No assigned driver',
      actionLabel: 'Assign',
      route: `/admin/vehicles/${input.vehicle.id}`,
    });
  }

  if (input.openMaintenance.some((order) => {
    const scheduled = dateKey(order.scheduled_date ?? order.created_at);
    return !!scheduled && scheduled < input.today;
  })) {
    items.push({
      vehicleId: input.vehicle.id,
      vehicleLabel: label,
      severity: 'critical',
      reason: 'Maintenance overdue',
      actionLabel: 'Open maintenance',
      route: '/admin/maintenance',
    });
  }

  if (input.controls.some((control) => isControlOverdue(control, input.today))) {
    items.push({
      vehicleId: input.vehicle.id,
      vehicleLabel: label,
      severity: 'critical',
      reason: 'Control overdue',
      actionLabel: 'Open review',
      route: '/admin/fleet-control',
    });
  }

  if (isGpsOffline(input.gpsPosition, input.today)) {
    items.push({
      vehicleId: input.vehicle.id,
      vehicleLabel: label,
      severity: 'warning',
      reason: 'GPS offline',
      actionLabel: 'Open tracking',
      route: '/admin/tracking',
    });
  }

  if (input.controls.some(isVehicleImmobilized)) {
    items.push({
      vehicleId: input.vehicle.id,
      vehicleLabel: label,
      severity: 'critical',
      reason: 'Vehicle immobilized',
      actionLabel: 'View control',
      route: '/admin/fleet-control',
    });
  }

  return items;
}

export function buildRetirementReadiness(input: {
  economics90: VehicleEconomics;
  utilization90: VehicleUtilization;
  maintenanceOrders: MaintenanceMetricLike[];
}): VehicleRetirementReadiness {
  const reasons: string[] = [];
  if (input.economics90.maintenanceCost > Math.max(50_000, input.economics90.revenue * 0.4)) {
    reasons.push('High cost');
  }
  if (input.economics90.revenue < 25_000 && input.utilization90.utilizationRate < 20) {
    reasons.push('Low revenue');
  }
  if (input.maintenanceOrders.length >= 3) {
    reasons.push('Repeated repairs');
  }

  return {
    level: reasons.length >= 2 ? 'Review' : reasons.length === 1 ? 'Watch' : 'Normal',
    reasons: reasons.length > 0 ? reasons : ['No retirement signal'],
  };
}

export function buildFleetOverview(input: {
  vehicles: VehicleMetricLike[];
  statuses: Map<string, VehicleOperationalStatus>;
  utilizations: Map<string, VehicleUtilization>;
  economicsThisMonth: Map<string, VehicleEconomics>;
  controls: FleetControlMetricLike[];
}): {
  totalVehicles: number;
  assigned: number;
  available: number;
  maintenance: number;
  immobilized: number;
  utilizationRate: number;
  revenueThisMonth: number;
  maintenanceCostThisMonth: number;
} {
  const statusValues = input.vehicles.map((vehicle) => input.statuses.get(vehicle.id) ?? 'Available');
  const avgUtilization = input.vehicles.length
    ? Math.round(input.vehicles.reduce((sum, vehicle) => sum + (input.utilizations.get(vehicle.id)?.utilizationRate ?? 0), 0) / input.vehicles.length)
    : 0;

  return {
    totalVehicles: input.vehicles.length,
    assigned: statusValues.filter((status) => status === 'Assigned').length,
    available: statusValues.filter((status) => status === 'Available').length,
    maintenance: statusValues.filter((status) => status === 'Maintenance').length,
    immobilized: input.vehicles.filter((vehicle) => input.controls.some((control) => control.vehicle_id === vehicle.id && isVehicleImmobilized(control))).length,
    utilizationRate: avgUtilization,
    revenueThisMonth: input.vehicles.reduce((sum, vehicle) => sum + (input.economicsThisMonth.get(vehicle.id)?.revenue ?? 0), 0),
    maintenanceCostThisMonth: input.vehicles.reduce((sum, vehicle) => sum + (input.economicsThisMonth.get(vehicle.id)?.maintenanceCost ?? 0), 0),
  };
}

export function buildVehicleHistory(input: {
  vehicle: VehicleMetricLike;
  rentals: RentalMetricLike[];
  payments: PaymentMetricLike[];
  maintenanceOrders: MaintenanceMetricLike[];
  controls: FleetControlMetricLike[];
  violations: ViolationMetricLike[];
  accidents: AccidentMetricLike[];
}): VehicleHistoryEvent[] {
  const events: VehicleHistoryEvent[] = [];
  const label = vehicleLabel(input.vehicle);

  if (input.vehicle.created_at) {
    events.push({
      id: `vehicle-created-${input.vehicle.id}`,
      type: 'vehicle',
      label: 'Vehicle Created',
      detail: label,
      date: input.vehicle.created_at,
      route: `/admin/vehicles/${input.vehicle.id}`,
    });
  }

  const rentalIds = new Set(input.rentals.map((rental) => rental.id));

  input.rentals.forEach((rental) => {
    const driver = rental.drivers?.full_name ?? 'Driver';
    events.push({
      id: `rental-${rental.id}`,
      type: 'driver',
      label: 'Driver Assigned',
      detail: `${driver} - ${rental.status ?? 'rental'}`,
      date: rental.start_date ?? rental.created_at ?? input.vehicle.created_at ?? '',
      route: rental.driver_id ? `/admin/drivers/${rental.driver_id}` : '/admin/rentals',
    });
  });

  input.payments
    .filter((payment) => payment.rental_id && rentalIds.has(payment.rental_id))
    .forEach((payment) => {
      events.push({
        id: `payment-${payment.id ?? `${payment.rental_id}-${payment.due_date}`}`,
        type: 'finance',
        label: 'Invoice Generated',
        detail: `${Number(payment.amount ?? 0).toLocaleString('fr-FR')} FCFA - ${payment.status ?? 'scheduled'}`,
        date: payment.created_at ?? payment.due_date ?? input.vehicle.created_at ?? '',
        route: '/admin/financial-operations',
      });
    });

  input.maintenanceOrders.forEach((order) => {
    events.push({
      id: `maintenance-${order.id ?? order.order_number}`,
      type: 'maintenance',
      label: order.completed_at ? 'Maintenance Completed' : 'Maintenance Opened',
      detail: `${order.order_number ?? order.order_type ?? 'Order'} - ${order.status ?? 'open'}`,
      date: order.completed_at ?? order.created_at ?? order.scheduled_date ?? input.vehicle.created_at ?? '',
      route: '/admin/maintenance',
    });
  });

  input.controls.forEach((control) => {
    events.push({
      id: `control-${control.id}`,
      type: 'fleet_control',
      label: VALIDATED_CONTROL_STATUS_SET.has(normalize(control.status)) ? 'Control Approved' : 'Control Review',
      detail: `${control.status ?? 'control'} - due ${dateKey(control.due_at) ?? 'N/A'}`,
      date: control.validated_at ?? control.last_validated_at ?? control.reviewed_at ?? control.submitted_at ?? control.created_at ?? control.due_at ?? '',
      route: '/admin/fleet-control',
    });
  });

  input.accidents.forEach((accident) => {
    events.push({
      id: `accident-${accident.id}`,
      type: 'sinistre',
      label: 'Accident Reported',
      detail: `${accident.case_number ?? 'Case'} - ${accident.status ?? 'open'}`,
      date: accident.accident_datetime ?? accident.created_at ?? input.vehicle.created_at ?? '',
      route: accident.id ? `/admin/sinistres/${accident.id}` : '/admin/sinistres',
    });
  });

  input.violations.forEach((violation) => {
    events.push({
      id: `violation-${violation.id}`,
      type: 'contravention',
      label: 'Fine Recorded',
      detail: `${violation.pv_number ?? violation.violation_type ?? 'Contravention'} - ${violation.status ?? 'pending'}`,
      date: violation.violation_date ?? input.vehicle.created_at ?? '',
      route: '/admin/contraventions',
    });
  });

  return events
    .filter((event) => !!dateKey(event.date))
    .sort((a, b) => (dateKey(b.date) ?? '').localeCompare(dateKey(a.date) ?? ''));
}
