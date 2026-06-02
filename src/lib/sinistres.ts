// Shared types & constants for the Sinistres (accident) module.

export type AccidentStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'WAITING_DOCS'
  | 'INVESTIGATING'
  | 'PENDING_DETERMINATION'
  | 'RESOLVED_NOT_AT_FAULT'
  | 'RESOLVED_AT_FAULT'
  | 'CLOSED'
  | 'CANCELLED';

export type AccidentSeverity = 'UNKNOWN' | 'MINOR' | 'MODERATE' | 'SEVERE';

export type FileType = 'PHOTO' | 'VIDEO' | 'DOCUMENT' | 'POLICE_REPORT' | 'WITNESS';

export type PartyType = 'OTHER_DRIVER' | 'WITNESS' | 'POLICE';

export const STATUS_LABELS_FR: Record<AccidentStatus, string> = {
  DRAFT: 'Brouillon',
  SUBMITTED: 'Soumis',
  UNDER_REVIEW: 'En revue',
  WAITING_DOCS: 'En attente de documents',
  INVESTIGATING: 'Enquête',
  PENDING_DETERMINATION: 'Détermination en cours',
  RESOLVED_NOT_AT_FAULT: 'Non responsable',
  RESOLVED_AT_FAULT: 'Responsable',
  CLOSED: 'Clôturé',
  CANCELLED: 'Annulé',
};

export const STATUS_TONE: Record<AccidentStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  UNDER_REVIEW: 'info',
  WAITING_DOCS: 'warning',
  INVESTIGATING: 'info',
  PENDING_DETERMINATION: 'warning',
  RESOLVED_NOT_AT_FAULT: 'success',
  RESOLVED_AT_FAULT: 'danger',
  CLOSED: 'neutral',
  CANCELLED: 'neutral',
};

export const SEVERITY_LABELS_FR: Record<AccidentSeverity, string> = {
  UNKNOWN: 'À déterminer',
  MINOR: 'Mineur',
  MODERATE: 'Modéré',
  SEVERE: 'Grave',
};

export const EVIDENCE_CHECKLIST: { key: string; label: string }[] = [
  { key: 'front', label: 'Avant du véhicule' },
  { key: 'rear', label: 'Arrière du véhicule' },
  { key: 'left', label: 'Côté gauche' },
  { key: 'right', label: 'Côté droit' },
  { key: 'closeup', label: 'Gros plan des dégâts' },
  { key: 'other_vehicle', label: "L'autre véhicule" },
  { key: 'plate', label: "Plaque d'immatriculation" },
  { key: 'scene', label: 'Vue d’ensemble de la scène' },
  { key: 'signs', label: 'Panneaux / intersection' },
  { key: 'police_report', label: 'Rapport de police' },
  { key: 'witness', label: 'Témoignage' },
];

export const ACCIDENT_BUCKET = 'accident-evidence';

export function fileTypeFromMime(mime: string | null | undefined): FileType {
  if (!mime) return 'DOCUMENT';
  if (mime.startsWith('image/')) return 'PHOTO';
  if (mime.startsWith('video/')) return 'VIDEO';
  return 'DOCUMENT';
}
