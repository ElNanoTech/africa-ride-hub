import { describe, expect, it } from 'vitest';
import {
  alertDeepLink,
  deriveDriverDocumentStatus,
  deriveVehicleOpsStatus,
  nextDueDateLabel,
} from './driverOps';

const TODAY = new Date('2026-06-14T12:00:00Z');

describe('deriveVehicleOpsStatus', () => {
  it('shows active when no blocker exists', () => {
    expect(deriveVehicleOpsStatus({ vehicleStatus: 'rented', rentalStatus: 'active' })).toBe('active');
  });

  it('prioritizes immobilized over every other state', () => {
    expect(deriveVehicleOpsStatus({
      vehicleStatus: 'maintenance',
      rentalStatus: 'active',
      fleetControlStatus: 'blocked',
      maintenanceStatus: 'draft',
    })).toBe('immobilized');
  });

  it('maps open maintenance reports before fleet-control warnings', () => {
    expect(deriveVehicleOpsStatus({
      fleetControlStatus: 'pending',
      maintenanceStatus: 'to_validate',
    })).toBe('maintenance_required');
  });

  it('maps return workflow separately from normal activity', () => {
    expect(deriveVehicleOpsStatus({ rentalStatus: 'return_pending' })).toBe('return_requested');
  });
});

describe('deriveDriverDocumentStatus', () => {
  it('treats approved docs inside 30 days as expiring soon', () => {
    expect(deriveDriverDocumentStatus('approved', '2026-07-01', TODAY)).toBe('expiring_soon');
  });

  it('treats past expiry as expired even if the stored status is approved', () => {
    expect(deriveDriverDocumentStatus('approved', '2026-06-01', TODAY)).toBe('expired');
  });

  it('keeps rejected status visible before expiry math', () => {
    expect(deriveDriverDocumentStatus('rejected', '2026-06-01', TODAY)).toBe('rejected');
  });
});

describe('alertDeepLink', () => {
  it('routes vehicle compliance alerts to the vehicle page', () => {
    expect(alertDeepLink({ alert_type: 'insurance_expiry' })).toBe('/driver/vehicle');
  });

  it('routes invoice alerts to the specific invoice when available', () => {
    expect(alertDeepLink({ alert_type: 'invoice_overdue', source_id: 'inv-1' })).toBe('/driver/factures/inv-1');
  });

  it('routes blocked vehicle alerts to fleet control', () => {
    expect(alertDeepLink({ alert_type: 'vehicle_immobilized' })).toBe('/driver/fleet-control');
  });
});

describe('nextDueDateLabel', () => {
  it('renders French relative due labels', () => {
    expect(nextDueDateLabel('2026-06-14', TODAY)).toBe("Aujourd'hui");
    expect(nextDueDateLabel('2026-06-15', TODAY)).toBe('Demain');
    expect(nextDueDateLabel('2026-06-20', TODAY)).toBe('Dans 6 jours');
    expect(nextDueDateLabel('2026-06-12', TODAY)).toBe('En retard de 2 jours');
  });
});
