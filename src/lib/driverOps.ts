import { addDays, differenceInCalendarDays, parseISO } from 'date-fns';
import type { FleetControlStatus } from './fleetControl';

export type VehicleOpsStatus =
  | 'active'
  | 'maintenance_required'
  | 'control_required'
  | 'immobilized'
  | 'return_requested'
  | 'repairing';

export interface VehicleOpsStatusInput {
  vehicleStatus?: string | null;
  rentalStatus?: string | null;
  fleetControlStatus?: FleetControlStatus | null;
  maintenanceStatus?: string | null;
  immobilizationState?: string | null;
}

export const VEHICLE_OPS_STATUS_META: Record<VehicleOpsStatus, {
  label: string;
  tone: 'green' | 'orange' | 'red';
  description: string;
}> = {
  active: {
    label: 'Actif',
    tone: 'green',
    description: 'Vous pouvez travailler avec ce véhicule.',
  },
  maintenance_required: {
    label: 'Maintenance requise',
    tone: 'orange',
    description: 'Un problème est à vérifier par la flotte.',
  },
  control_required: {
    label: 'Contrôle requis',
    tone: 'orange',
    description: 'Complétez le contrôle véhicule avant de continuer.',
  },
  immobilized: {
    label: 'Immobilisé',
    tone: 'red',
    description: 'Le véhicule est bloqué. Contactez votre gestionnaire.',
  },
  return_requested: {
    label: 'Retour demandé',
    tone: 'orange',
    description: 'Une restitution ou vérification de retour est demandée.',
  },
  repairing: {
    label: 'En réparation',
    tone: 'red',
    description: 'Le véhicule est en atelier ou indisponible.',
  },
};

export function deriveVehicleOpsStatus(input: VehicleOpsStatusInput): VehicleOpsStatus {
  const maintenance = input.maintenanceStatus ?? '';
  const rental = input.rentalStatus ?? '';
  const vehicle = input.vehicleStatus ?? '';
  const control = input.fleetControlStatus ?? '';
  const immo = input.immobilizationState ?? '';

  if (immo === 'cut_sent' || control === 'blocked' || rental === 'vehicle_disabled') return 'immobilized';
  if (['in_progress', 'completed'].includes(maintenance) || vehicle === 'maintenance') return 'repairing';
  if (['draft', 'to_validate'].includes(maintenance)) return 'maintenance_required';
  if (['pending', 'rejected', 'overdue'].includes(control)) return 'control_required';
  if (['return_pending', 'overdue_return'].includes(rental)) return 'return_requested';
  return 'active';
}

export type DriverDocumentStatus = 'approved' | 'pending' | 'rejected' | 'expired' | 'expiring_soon' | 'missing';

export function deriveDriverDocumentStatus(
  status?: string | null,
  expiryDate?: string | null,
  now: Date = new Date(),
): DriverDocumentStatus {
  if (!status) return 'missing';
  if (status === 'rejected') return 'rejected';
  if (status === 'expired') return 'expired';
  if (expiryDate) {
    const expiry = parseISO(expiryDate);
    const days = differenceInCalendarDays(expiry, now);
    if (days < 0) return 'expired';
    if (days <= 30 && status === 'approved') return 'expiring_soon';
  }
  if (status === 'approved') return 'approved';
  return 'pending';
}

export const DRIVER_DOCUMENT_STATUS_LABEL: Record<DriverDocumentStatus, string> = {
  approved: 'Validé',
  pending: 'En attente',
  rejected: 'Refusé',
  expired: 'Expiré',
  expiring_soon: 'Expire bientôt',
  missing: 'Manquant',
};

export function alertDeepLink(alert: {
  alert_type?: string | null;
  source_table?: string | null;
  source_id?: string | null;
  metadata?: Record<string, unknown> | null;
}): string {
  const sourceId = alert.source_id;
  switch (alert.alert_type) {
    case 'invoice_overdue':
      return sourceId ? `/driver/factures/${sourceId}` : '/driver/factures';
    case 'payment_overdue':
    case 'rental_overdue':
      return '/driver/finance';
    case 'inspection_overdue':
    case 'vehicle_immobilized':
      return '/driver/fleet-control';
    case 'kyc_expiry':
    case 'kyc_pending_review':
    case 'kyc_rejected':
      return '/driver/profile/kyc';
    case 'insurance_expiry':
    case 'registration_expiry':
      return '/driver/vehicle';
    case 'low_score':
      return '/driver/score';
    case 'accident_unresolved':
      return sourceId ? `/driver/sinistres/cases/${sourceId}` : '/driver/sinistres';
    case 'contravention_pending':
      return '/driver/contraventions';
    default:
      return '/driver/alerts';
  }
}

export function nextDueDateLabel(dueDate?: string | null, now: Date = new Date()): string {
  if (!dueDate) return 'Aucune échéance';
  const due = parseISO(dueDate);
  const days = differenceInCalendarDays(due, now);
  if (days < 0) return `En retard de ${Math.abs(days)} jour${Math.abs(days) > 1 ? 's' : ''}`;
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Demain';
  return `Dans ${days} jours`;
}

export function isExpiringWithin(expiryDate?: string | null, days = 30, now: Date = new Date()): boolean {
  if (!expiryDate) return false;
  const expiry = parseISO(expiryDate);
  return expiry >= now && expiry <= addDays(now, days);
}
