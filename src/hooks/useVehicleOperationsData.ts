import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { fetchAllRows } from '@/lib/fetchAll';
import {
  addDaysKey,
  buildFleetOverview,
  buildRetirementReadiness,
  buildVehicleAttention,
  buildVehicleEconomics,
  buildVehicleHealth,
  buildVehicleHistory,
  buildVehicleUtilization,
  dateKey,
  isOpenMaintenance,
  isOpenRental,
  normalizeVehicleStatus,
  vehicleLabel,
  type AccidentMetricLike,
  type FleetControlMetricLike,
  type GpsMetricLike,
  type MaintenanceMetricLike,
  type OtherChargeMetricLike,
  type PaymentMetricLike,
  type RentalMetricLike,
  type VehicleAttentionItem,
  type VehicleEconomics,
  type VehicleHealth,
  type VehicleHistoryEvent,
  type VehicleMetricLike,
  type VehicleOperationalStatus,
  type VehicleRetirementReadiness,
  type VehicleUtilization,
  type ViolationMetricLike,
} from '@/lib/vehicleOperations';
import {
  useRealtimeSubscription,
  type RealtimeTableName,
} from '@/hooks/useRealtimeSubscription';

const VEHICLE_REALTIME_TABLES: RealtimeTableName[] = [
  'vehicles',
  'rentals',
  'payments',
  'maintenance_orders',
  'other_charges',
  'vehicle_inspections',
  'vehicle_positions',
  'accidents',
  'traffic_violations',
];

type CreditScoreRow = {
  driver_id: string;
  score: number;
  calculation_week: string;
  created_at: string;
};

export type VehicleOperationRow = {
  vehicle: VehicleMetricLike;
  label: string;
  status: VehicleOperationalStatus;
  currentRental: RentalMetricLike | null;
  currentDriverName: string | null;
  currentDriverScore: number | null;
  assignmentDate: string | null;
  latestControl: FleetControlMetricLike | null;
  gpsPosition: GpsMetricLike | null;
  economicsThisMonth: VehicleEconomics;
  economics30: VehicleEconomics;
  economics90: VehicleEconomics;
  utilization30: VehicleUtilization;
  utilization90: VehicleUtilization;
  health: VehicleHealth;
  attentionItems: VehicleAttentionItem[];
  retirement: VehicleRetirementReadiness;
  rentals: RentalMetricLike[];
  payments: PaymentMetricLike[];
  maintenanceOrders: MaintenanceMetricLike[];
  openMaintenance: MaintenanceMetricLike[];
  controls: FleetControlMetricLike[];
  violations: ViolationMetricLike[];
  accidents: AccidentMetricLike[];
  charges: OtherChargeMetricLike[];
  history: VehicleHistoryEvent[];
};

type VehicleOperationsOverview = ReturnType<typeof buildFleetOverview>;

function compareDateDesc(a?: string | null, b?: string | null): number {
  return (dateKey(b) ?? '').localeCompare(dateKey(a) ?? '');
}

function latestByDate<T>(rows: T[], getDate: (row: T) => string | null | undefined): T | null {
  const sorted = [...rows].sort((a, b) => compareDateDesc(getDate(a), getDate(b)));
  return sorted[0] ?? null;
}

function normalizeLookup(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, '').replace(/-/g, '').toUpperCase();
}

function groupByVehicle<T extends { vehicle_id?: string | null }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  rows.forEach((row) => {
    if (!row.vehicle_id) return;
    const list = map.get(row.vehicle_id) ?? [];
    list.push(row);
    map.set(row.vehicle_id, list);
  });
  return map;
}

function statusRank(status: VehicleOperationalStatus): number {
  switch (status) {
    case 'Accident': return 5;
    case 'Blocked': return 4;
    case 'Maintenance': return 3;
    case 'Assigned': return 2;
    case 'Available': return 1;
    case 'Retired': return 0;
  }
}

function healthRank(health: VehicleHealth): number {
  switch (health.state) {
    case 'Critical': return 3;
    case 'Warning': return 2;
    case 'Healthy': return 1;
  }
}

export function useVehicleOperationsData(enabled = true) {
  useRealtimeSubscription({
    tables: VEHICLE_REALTIME_TABLES,
    showToasts: false,
    enabled,
  });

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const monthStart = `${today.slice(0, 7)}-01`;
  const range30Start = addDaysKey(today, -29);
  const range90Start = addDaysKey(today, -89);
  const range12Start = addDaysKey(today, -364);

  const vehiclesQuery = useQuery({
    queryKey: ['vehicle-operations', 'vehicles'],
    enabled,
    queryFn: async () => {
      const rows = await fetchAllRows<VehicleMetricLike>((from, to) =>
        supabase
          .from('vehicles')
          .select('id, customer_id, make, model_name, model_year, license_plate, vehicle_type, fleet_group, status, rent_per_day, image_url, gps_active, gps_installed_at, uffizio_device_id, uffizio_imei, created_at, updated_at')
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows;
    },
  });

  const rentalsQuery = useQuery({
    queryKey: ['vehicle-operations', 'rentals'],
    enabled,
    queryFn: async () => {
      const rows = await fetchAllRows<RentalMetricLike>((from, to) =>
        supabase
          .from('rentals')
          .select('id, vehicle_id, driver_id, customer_id, status, start_date, end_date, returned_at, return_confirmed_at, approved_rate, requested_rate, final_rate, total_amount, rental_days, payment_due_at, created_at, drivers(id, full_name, phone_number)')
          .order('start_date', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows;
    },
  });

  const paymentsQuery = useQuery({
    queryKey: ['vehicle-operations', 'payments', range12Start, today],
    enabled,
    queryFn: async () => {
      const rows = await fetchAllRows<PaymentMetricLike>((from, to) =>
        supabase
          .from('payments')
          .select('id, rental_id, amount, amount_paid, status, due_date, paid_date, paid_at, payment_type, created_at')
          .gte('due_date', range12Start)
          .lte('due_date', today)
          .order('due_date', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows;
    },
  });

  const maintenanceQuery = useQuery({
    queryKey: ['vehicle-operations', 'maintenance'],
    enabled,
    queryFn: async () => {
      const rows = await fetchAllRows<MaintenanceMetricLike>((from, to) =>
        supabase
          .from('maintenance_orders')
          .select('id, vehicle_id, order_number, order_type, priority, status, actual_cost, estimated_cost, scheduled_date, started_at, completed_at, created_at, description')
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows;
    },
  });

  const chargesQuery = useQuery({
    queryKey: ['vehicle-operations', 'charges', range12Start, today],
    enabled,
    queryFn: async () => {
      const rows = await fetchAllRows<OtherChargeMetricLike>((from, to) =>
        supabase
          .from('other_charges')
          .select('id, vehicle_id, amount, charge_type, label, charge_date, created_at')
          .gte('charge_date', range12Start)
          .lte('charge_date', today)
          .order('charge_date', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows;
    },
  });

  const controlsQuery = useQuery({
    queryKey: ['vehicle-operations', 'fleet-control'],
    enabled,
    queryFn: async () => {
      const rows = await fetchAllRows<FleetControlMetricLike>((from, to) =>
        supabase
          .from('vehicle_inspections')
          .select('id, vehicle_id, driver_id, rental_id, status, due_at, last_validated_at, validated_at, submitted_at, reviewed_at, reminder_count, last_reminder_at, immobilization_state, immobilized_at, created_at')
          .order('due_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows;
    },
  });

  const positionsQuery = useQuery({
    queryKey: ['vehicle-operations', 'positions'],
    enabled,
    queryFn: async () => {
      const rows = await fetchAllRows<GpsMetricLike>((from, to) =>
        supabase
          .from('vehicle_positions')
          .select('id, vehicle_no, imei_no, device_name, driver_name, status, last_update, synced_at, lat, lng, speed, ignition')
          .order('synced_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows;
    },
  });

  const violationsQuery = useQuery({
    queryKey: ['vehicle-operations', 'violations', range12Start, today],
    enabled,
    queryFn: async () => {
      const rows = await fetchAllRows<ViolationMetricLike>((from, to) =>
        supabase
          .from('traffic_violations')
          .select('id, vehicle_id, driver_id, license_plate, violation_type, violation_date, payment_due_date, amount, status, paid_at, pv_number, location')
          .gte('violation_date', range12Start)
          .lte('violation_date', today)
          .order('violation_date', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows;
    },
  });

  const accidentsQuery = useQuery({
    queryKey: ['vehicle-operations', 'accidents'],
    enabled,
    queryFn: async () => {
      const rows = await fetchAllRows<AccidentMetricLike>((from, to) =>
        supabase
          .from('accidents')
          .select('id, vehicle_id, driver_id, case_number, status, severity, accident_datetime, closed_at, created_at, description')
          .order('accident_datetime', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows;
    },
  });

  const creditScoresQuery = useQuery({
    queryKey: ['vehicle-operations', 'credit-scores'],
    enabled,
    queryFn: async () => {
      const rows = await fetchAllRows<CreditScoreRow>((from, to) =>
        supabase
          .from('credit_scores')
          .select('driver_id, score, calculation_week, created_at')
          .order('calculation_week', { ascending: false })
          .order('driver_id', { ascending: true })
          .range(from, to),
      );
      return rows;
    },
  });

  const rows = useMemo<VehicleOperationRow[]>(() => {
    const vehicles = vehiclesQuery.data ?? [];
    const rentals = rentalsQuery.data ?? [];
    const payments = paymentsQuery.data ?? [];
    const maintenanceOrders = maintenanceQuery.data ?? [];
    const charges = chargesQuery.data ?? [];
    const controls = controlsQuery.data ?? [];
    const positions = positionsQuery.data ?? [];
    const accidents = accidentsQuery.data ?? [];
    const creditScores = creditScoresQuery.data ?? [];

    const vehicleByPlate = new Map(vehicles.map((vehicle) => [normalizeLookup(vehicle.license_plate), vehicle]));
    const violations = (violationsQuery.data ?? []).map((violation) => ({
      ...violation,
      vehicle_id: violation.vehicle_id ?? vehicleByPlate.get(normalizeLookup(violation.license_plate))?.id ?? null,
    }));

    const rentalsByVehicle = groupByVehicle(rentals);
    const maintenanceByVehicle = groupByVehicle(maintenanceOrders);
    const controlsByVehicle = groupByVehicle(controls);
    const violationsByVehicle = groupByVehicle(violations);
    const accidentsByVehicle = groupByVehicle(accidents);
    const chargesByVehicle = groupByVehicle(charges);

    const latestScoreByDriver = new Map<string, number>();
    creditScores.forEach((score) => {
      if (!latestScoreByDriver.has(score.driver_id)) latestScoreByDriver.set(score.driver_id, score.score);
    });

    const positionsByLookup = new Map<string, GpsMetricLike>();
    positions.forEach((position) => {
      const keys = [
        normalizeLookup(position.vehicle_no),
        normalizeLookup(position.imei_no),
        normalizeLookup(position.device_name),
      ].filter(Boolean);
      keys.forEach((key) => {
        if (!positionsByLookup.has(key)) positionsByLookup.set(key, position);
      });
    });

    return vehicles.map((vehicle) => {
      const vehicleRentals = rentalsByVehicle.get(vehicle.id) ?? [];
      const vehicleMaintenance = maintenanceByVehicle.get(vehicle.id) ?? [];
      const vehicleControls = controlsByVehicle.get(vehicle.id) ?? [];
      const vehicleViolations = violationsByVehicle.get(vehicle.id) ?? [];
      const vehicleAccidents = accidentsByVehicle.get(vehicle.id) ?? [];
      const vehicleCharges = chargesByVehicle.get(vehicle.id) ?? [];
      const currentRental = latestByDate(
        vehicleRentals.filter(isOpenRental),
        (rental) => rental.start_date ?? rental.created_at,
      );
      const openAccidents = vehicleAccidents.filter((accident) => !['closed', 'resolved', 'cancelled', 'canceled', 'rejected'].includes((accident.status ?? '').toLowerCase()));
      const latestControl = latestByDate(vehicleControls, (control) => control.due_at ?? control.created_at);
      const gpsPosition = [
        positionsByLookup.get(normalizeLookup(vehicle.license_plate)),
        positionsByLookup.get(normalizeLookup(vehicle.uffizio_imei)),
        positionsByLookup.get(normalizeLookup(vehicle.uffizio_device_id)),
      ].find(Boolean) ?? null;

      const status = normalizeVehicleStatus({
        vehicle,
        currentRental,
        currentControl: latestControl,
        openAccidents,
      });

      const economicsThisMonth = buildVehicleEconomics({
        vehicleId: vehicle.id,
        rentals,
        payments,
        maintenanceOrders,
        charges,
        violations,
        rangeStart: monthStart,
        rangeEnd: today,
      });
      const economics30 = buildVehicleEconomics({
        vehicleId: vehicle.id,
        rentals,
        payments,
        maintenanceOrders,
        charges,
        violations,
        rangeStart: range30Start,
        rangeEnd: today,
      });
      const economics90 = buildVehicleEconomics({
        vehicleId: vehicle.id,
        rentals,
        payments,
        maintenanceOrders,
        charges,
        violations,
        rangeStart: range90Start,
        rangeEnd: today,
      });
      const utilization30 = buildVehicleUtilization({
        vehicleId: vehicle.id,
        vehicleStatus: status,
        rentals,
        maintenanceOrders,
        controls,
        today,
        windowDays: 30,
      });
      const utilization90 = buildVehicleUtilization({
        vehicleId: vehicle.id,
        vehicleStatus: status,
        rentals,
        maintenanceOrders,
        controls,
        today,
        windowDays: 90,
      });
      const openMaintenance = vehicleMaintenance.filter(isOpenMaintenance);
      const health = buildVehicleHealth({
        status,
        utilization: utilization30,
        openMaintenance,
        controls: vehicleControls,
        violations: vehicleViolations,
        accidents: vehicleAccidents,
        gpsPosition,
        today,
      });
      const attentionItems = buildVehicleAttention({
        vehicle,
        status,
        currentRental,
        utilization: utilization30,
        controls: vehicleControls,
        openMaintenance,
        gpsPosition,
        today,
      });
      const retirement = buildRetirementReadiness({
        economics90,
        utilization90,
        maintenanceOrders: vehicleMaintenance,
      });
      const vehiclePayments = payments.filter((payment) => !!payment.rental_id && vehicleRentals.some((rental) => rental.id === payment.rental_id));
      const history = buildVehicleHistory({
        vehicle,
        rentals: vehicleRentals,
        payments: vehiclePayments,
        maintenanceOrders: vehicleMaintenance,
        controls: vehicleControls,
        violations: vehicleViolations,
        accidents: vehicleAccidents,
      });

      return {
        vehicle,
        label: vehicleLabel(vehicle),
        status,
        currentRental,
        currentDriverName: currentRental?.drivers?.full_name ?? null,
        currentDriverScore: currentRental?.driver_id ? latestScoreByDriver.get(currentRental.driver_id) ?? null : null,
        assignmentDate: currentRental?.start_date ?? currentRental?.created_at ?? null,
        latestControl,
        gpsPosition,
        economicsThisMonth,
        economics30,
        economics90,
        utilization30,
        utilization90,
        health,
        attentionItems,
        retirement,
        rentals: vehicleRentals,
        payments: vehiclePayments,
        maintenanceOrders: vehicleMaintenance,
        openMaintenance,
        controls: vehicleControls,
        violations: vehicleViolations,
        accidents: vehicleAccidents,
        charges: vehicleCharges,
        history,
      };
    }).sort((a, b) =>
      healthRank(b.health) - healthRank(a.health) ||
      b.attentionItems.length - a.attentionItems.length ||
      statusRank(b.status) - statusRank(a.status) ||
      b.economics30.netContribution - a.economics30.netContribution ||
      a.label.localeCompare(b.label),
    );
  }, [
    accidentsQuery.data,
    chargesQuery.data,
    controlsQuery.data,
    creditScoresQuery.data,
    maintenanceQuery.data,
    monthStart,
    paymentsQuery.data,
    positionsQuery.data,
    range30Start,
    range90Start,
    rentalsQuery.data,
    today,
    vehiclesQuery.data,
    violationsQuery.data,
  ]);

  const overview = useMemo<VehicleOperationsOverview>(() => {
    const statuses = new Map(rows.map((row) => [row.vehicle.id, row.status]));
    const utilizations = new Map(rows.map((row) => [row.vehicle.id, row.utilization30]));
    const economicsThisMonth = new Map(rows.map((row) => [row.vehicle.id, row.economicsThisMonth]));
    return buildFleetOverview({
      vehicles: rows.map((row) => row.vehicle),
      statuses,
      utilizations,
      economicsThisMonth,
      controls: controlsQuery.data ?? [],
    });
  }, [controlsQuery.data, rows]);

  const attentionQueue = useMemo(() => rows
    .flatMap((row) => row.attentionItems)
    .sort((a, b) => {
      const severity = Number(b.severity === 'critical') - Number(a.severity === 'critical');
      return severity || a.vehicleLabel.localeCompare(b.vehicleLabel);
    }), [rows]);

  const isLoading = [
    vehiclesQuery,
    rentalsQuery,
    paymentsQuery,
    maintenanceQuery,
    chargesQuery,
    controlsQuery,
    positionsQuery,
    violationsQuery,
    accidentsQuery,
    creditScoresQuery,
  ].some((query) => query.isLoading);

  const isError = [
    vehiclesQuery,
    rentalsQuery,
    paymentsQuery,
    maintenanceQuery,
    chargesQuery,
    controlsQuery,
    positionsQuery,
    violationsQuery,
    accidentsQuery,
    creditScoresQuery,
  ].some((query) => query.isError);

  const firstError = [
    vehiclesQuery.error,
    rentalsQuery.error,
    paymentsQuery.error,
    maintenanceQuery.error,
    chargesQuery.error,
    controlsQuery.error,
    positionsQuery.error,
    violationsQuery.error,
    accidentsQuery.error,
    creditScoresQuery.error,
  ].find(Boolean);

  return {
    today,
    monthStart,
    rows,
    overview,
    attentionQueue,
    isLoading,
    isError,
    error: firstError,
  };
}
