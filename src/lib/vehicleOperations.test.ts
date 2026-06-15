import { describe, expect, it } from 'vitest';
import {
  buildRetirementReadiness,
  buildVehicleAttention,
  buildVehicleEconomics,
  buildVehicleHealth,
  buildVehicleHistory,
  buildVehicleUtilization,
  normalizeVehicleStatus,
} from './vehicleOperations';

describe('vehicle operations metric helpers', () => {
  const today = '2026-06-15';

  it('normalizes operational vehicle status from assignment, control, and incidents', () => {
    expect(normalizeVehicleStatus({
      vehicle: { status: 'available' },
      currentRental: { id: 'r1', vehicle_id: 'v1', status: 'active' },
    })).toBe('Assigned');

    expect(normalizeVehicleStatus({
      vehicle: { status: 'available' },
      currentControl: { vehicle_id: 'v1', immobilization_state: 'requested' },
    })).toBe('Blocked');

    expect(normalizeVehicleStatus({
      vehicle: { status: 'available' },
      openAccidents: [{ vehicle_id: 'v1', status: 'open' }],
    })).toBe('Accident');
  });

  it('calculates vehicle economics as an operational profitability index', () => {
    const economics = buildVehicleEconomics({
      vehicleId: 'v1',
      rentals: [
        { id: 'r1', vehicle_id: 'v1', status: 'active' },
        { id: 'r2', vehicle_id: 'v2', status: 'active' },
      ],
      payments: [
        { rental_id: 'r1', amount: 30_000, amount_paid: 30_000, status: 'paid', paid_at: '2026-06-02' },
        { rental_id: 'r1', amount: 20_000, amount_paid: 5_000, status: 'partial', due_date: '2026-06-04' },
        { rental_id: 'r2', amount: 50_000, amount_paid: 50_000, status: 'paid', paid_at: '2026-06-05' },
      ],
      maintenanceOrders: [
        { vehicle_id: 'v1', actual_cost: 8_000, estimated_cost: 12_000, status: 'completed', completed_at: '2026-06-07' },
      ],
      charges: [
        { vehicle_id: 'v1', amount: 4_000, charge_type: 'insurance', label: 'Assurance', charge_date: '2026-06-08' },
        { vehicle_id: 'v1', amount: 3_000, charge_type: 'garage', label: 'Repair', charge_date: '2026-06-09' },
      ],
      violations: [
        { vehicle_id: 'v1', amount: 6_000, status: 'pending_payment', violation_date: '2026-06-10' },
      ],
      rangeStart: '2026-06-01',
      rangeEnd: today,
    });

    expect(economics).toMatchObject({
      revenue: 35_000,
      maintenanceCost: 11_000,
      fines: 6_000,
      insurance: 4_000,
      netContribution: 14_000,
      profitability: 'Profitable',
    });
  });

  it('tracks assigned, idle, maintenance, and blocked days for utilization', () => {
    const utilization = buildVehicleUtilization({
      vehicleId: 'v1',
      vehicleStatus: 'Assigned',
      rentals: [
        { id: 'r1', vehicle_id: 'v1', status: 'active', start_date: '2026-06-06' },
      ],
      maintenanceOrders: [
        { vehicle_id: 'v1', status: 'in_progress', scheduled_date: '2026-06-03', completed_at: '2026-06-05' },
      ],
      controls: [],
      today,
      windowDays: 15,
    });

    expect(utilization).toMatchObject({
      assignedDays: 10,
      maintenanceDays: 3,
      blockedDays: 0,
      idleDays: 2,
      utilizationRate: 67,
    });
  });

  it('scores health from maintenance, control, fines, GPS, and utilization signals', () => {
    const health = buildVehicleHealth({
      status: 'Blocked',
      utilization: { assignedDays: 0, idleDays: 20, maintenanceDays: 0, blockedDays: 10, utilizationRate: 0, windowDays: 30 },
      openMaintenance: [{ vehicle_id: 'v1', status: 'open', priority: 'urgent', scheduled_date: '2026-06-01' }],
      controls: [{ vehicle_id: 'v1', status: 'pending', due_at: '2026-06-10', immobilization_state: 'requested' }],
      violations: [{ vehicle_id: 'v1', amount: 5_000, status: 'pending_payment' }],
      accidents: [],
      gpsPosition: { status: 'offline', last_update: '2026-06-12' },
      today,
    });

    expect(health.state).toBe('Critical');
    expect(health.score).toBeLessThan(50);
    expect(health.reasons).toEqual(expect.arrayContaining([
      'Maintenance overdue',
      'Immobilized by fleet control',
      'GPS offline',
    ]));
  });

  it('builds the vehicle attention queue with actionable routes only', () => {
    const items = buildVehicleAttention({
      vehicle: { id: 'v1', make: 'Suzuki', model_name: 'Dzire', license_plate: 'AB-1234-CI' },
      status: 'Available',
      currentRental: null,
      utilization: { assignedDays: 0, idleDays: 30, maintenanceDays: 0, blockedDays: 0, utilizationRate: 0, windowDays: 30 },
      controls: [{ vehicle_id: 'v1', status: 'pending', due_at: '2026-06-10' }],
      openMaintenance: [{ vehicle_id: 'v1', status: 'open', scheduled_date: '2026-06-01' }],
      gpsPosition: { status: 'offline', last_update: '2026-06-12' },
      today,
    });

    expect(items.map((item) => item.reason)).toEqual(expect.arrayContaining([
      'Vehicle idle > 14 days',
      'No assigned driver',
      'Maintenance overdue',
      'Control overdue',
      'GPS offline',
    ]));
    expect(items.every((item) => item.route.startsWith('/admin/'))).toBe(true);
  });

  it('adds retirement readiness as an operational recommendation only', () => {
    const readiness = buildRetirementReadiness({
      economics90: {
        revenue: 20_000,
        maintenanceCost: 90_000,
        fines: 0,
        insurance: 0,
        netContribution: -70_000,
        profitability: 'Loss-Making',
      },
      utilization90: { assignedDays: 4, idleDays: 80, maintenanceDays: 6, blockedDays: 0, utilizationRate: 4, windowDays: 90 },
      maintenanceOrders: [
        { vehicle_id: 'v1' },
        { vehicle_id: 'v1' },
        { vehicle_id: 'v1' },
      ],
    });

    expect(readiness).toMatchObject({
      level: 'Review',
      reasons: ['High cost', 'Low revenue', 'Repeated repairs'],
    });
  });

  it('builds a unified vehicle history timeline', () => {
    const history = buildVehicleHistory({
      vehicle: { id: 'v1', make: 'Suzuki', model_name: 'Alto', license_plate: 'AA-1111-CI', created_at: '2026-01-01' },
      rentals: [{ id: 'r1', vehicle_id: 'v1', driver_id: 'd1', status: 'active', start_date: '2026-06-01', drivers: { full_name: 'Awa Kone' } }],
      payments: [{ id: 'p1', rental_id: 'r1', amount: 15_000, status: 'pending', created_at: '2026-06-02' }],
      maintenanceOrders: [{ id: 'm1', vehicle_id: 'v1', status: 'open', created_at: '2026-06-03' }],
      controls: [{ id: 'c1', vehicle_id: 'v1', status: 'validated', validated_at: '2026-06-04', due_at: '2026-06-04' }],
      violations: [{ id: 'pv1', vehicle_id: 'v1', status: 'pending_payment', violation_date: '2026-06-05' }],
      accidents: [{ id: 's1', vehicle_id: 'v1', case_number: 'SIN-1', status: 'open', accident_datetime: '2026-06-06' }],
    });

    expect(history.map((event) => event.label)).toEqual([
      'Accident Reported',
      'Fine Recorded',
      'Control Approved',
      'Maintenance Opened',
      'Invoice Generated',
      'Driver Assigned',
      'Vehicle Created',
    ]);
  });
});
