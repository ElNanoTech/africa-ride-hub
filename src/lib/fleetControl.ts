// Shared constants & helpers for the Fleet Control module.
// 7 photo zones + 4 document zones = 11 required items per the spec.

export type FleetControlStatus =
  | 'pending'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'overdue'
  | 'blocked'
  | 'cancelled';

export type ImmobilizationState =
  | 'none'
  | 'requested'
  | 'pending_stop'
  | 'cut_sent'
  | 'failed'
  | 'cancelled'
  | 'unblocked';

export type ItemValidation = 'pending' | 'submitted' | 'approved' | 'rejected';

export type ZoneKey =
  | 'front' | 'rear' | 'left' | 'right'
  | 'interior_front' | 'interior_rear' | 'dash'
  | 'doc_carte_grise' | 'doc_assurance' | 'doc_vignette' | 'doc_permis';

export interface ZoneDef {
  key: ZoneKey;
  label: string;
  help: string;
  kind: 'photo' | 'document';
}

export const PHOTO_ZONES: ZoneDef[] = [
  { key: 'front',           label: 'Avant',            help: 'Pare-chocs et phares',         kind: 'photo' },
  { key: 'rear',            label: 'Arrière',          help: 'Coffre et feux arrière',       kind: 'photo' },
  { key: 'left',            label: 'Côté gauche',      help: 'Portes côté conducteur',       kind: 'photo' },
  { key: 'right',           label: 'Côté droit',       help: 'Portes côté passager',         kind: 'photo' },
  { key: 'interior_front',  label: 'Intérieur avant',  help: 'Sièges avant',                 kind: 'photo' },
  { key: 'interior_rear',   label: 'Intérieur arrière',help: 'Sièges arrière',               kind: 'photo' },
  { key: 'dash',            label: 'Tableau de bord',  help: 'Compteur kilométrique visible', kind: 'photo' },
];

export const DOCUMENT_ZONES: ZoneDef[] = [
  { key: 'doc_carte_grise', label: 'Carte grise',      help: 'Recto lisible',                kind: 'document' },
  { key: 'doc_assurance',   label: 'Assurance',        help: 'Attestation en cours',         kind: 'document' },
  { key: 'doc_vignette',    label: 'Vignette',         help: 'Inspection technique',         kind: 'document' },
  { key: 'doc_permis',      label: 'Permis chauffeur', help: 'Recto du permis',              kind: 'document' },
];

export const ALL_ZONES: ZoneDef[] = [...PHOTO_ZONES, ...DOCUMENT_ZONES];
export const REQUIRED_ITEM_COUNT = ALL_ZONES.length; // 11

/**
 * Derive the required zone set from the require_all_photos /
 * require_documents settings. Mirrors the SQL source of truth
 * `fleet_control_required_zones()` used by fleet_control_submit/approve:
 *   (require_all_photos ? 7 photo zones : none)
 * ∪ (require_documents  ? 4 doc zones   : none)
 * If both flags are off we still require the 7 photos — a control can
 * never be submitted empty.
 */
export function requiredZones(
  settings: Pick<FleetControlSettings, 'require_all_photos' | 'require_documents'>,
): ZoneDef[] {
  const photos = settings.require_all_photos ? PHOTO_ZONES : [];
  const docs = settings.require_documents ? DOCUMENT_ZONES : [];
  if (photos.length === 0 && docs.length === 0) return [...PHOTO_ZONES];
  return [...photos, ...docs];
}

export const STATUS_LABEL: Record<FleetControlStatus, string> = {
  pending:   'En attente',
  submitted: 'À valider',
  approved:  'Conforme',
  rejected:  'Refusé',
  overdue:   'En retard',
  blocked:   'Bloqué',
  cancelled: 'Annulé',
};

export const STATUS_CLASS: Record<FleetControlStatus, string> = {
  pending:   'bg-muted text-muted-foreground',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  approved:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  rejected:  'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  overdue:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  blocked:   'bg-rose-200 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100',
  cancelled: 'bg-muted text-muted-foreground line-through',
};

export const IMMO_LABEL: Record<ImmobilizationState, string> = {
  none:         '—',
  requested:    'Coupure demandée',
  pending_stop: 'En attente d\'arrêt',
  cut_sent:     'Commande envoyée',
  failed:       'Échec',
  cancelled:    'Annulée',
  unblocked:    'Débloqué',
};

export function daysOverdue(dueAt: string | Date): number {
  const t = typeof dueAt === 'string' ? new Date(dueAt).getTime() : dueAt.getTime();
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export function isOverdue(status: FleetControlStatus, dueAt: string): boolean {
  if (status === 'approved' || status === 'cancelled') return false;
  return new Date(dueAt).getTime() < Date.now();
}

/**
 * Derive the effective status for display: if a row is still `pending`/`submitted` but
 * past its due date, treat it as `overdue` until the next recompute job runs.
 */
export function effectiveStatus(status: FleetControlStatus, dueAt: string): FleetControlStatus {
  if (status === 'pending' && isOverdue(status, dueAt)) return 'overdue';
  return status;
}

/**
 * Relative due-date copy for the driver screens (simple French):
 *   "Échéance dans X jours" / "À soumettre aujourd'hui" / "En retard de X jours".
 * Day differences are computed on calendar days (local time).
 */
export function formatDueDateRelative(due: Date | string, now: Date = new Date()): string {
  const d = typeof due === 'string' ? new Date(due) : due;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
  if (diffDays > 0) return `Échéance dans ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
  if (diffDays === 0) return "À soumettre aujourd'hui";
  const late = Math.abs(diffDays);
  return `En retard de ${late} jour${late > 1 ? 's' : ''}`;
}

export interface FleetControlSettings {
  cycle_days: number;
  late_threshold_days: number;
  relance_threshold: number;
  auto_immobilisation_enabled: boolean;
  parking_check_interval_min: number;
  relance_cooldown_hours: number;
  require_all_photos: boolean;
  require_documents: boolean;
  /**
   * When true, the parking-check job authenticates against Uffizio and verifies
   * the device, but does NOT transmit the SET_OUT engine-cut command. The
   * command_ref is stamped `DRY_RUN:...` and audit rows note `dry_run: true`.
   * Defaults to true so we never accidentally cut a live engine.
   */
  uffizio_immobilization_dry_run: boolean;
}

export const DEFAULT_FLEET_CONTROL_SETTINGS: FleetControlSettings = {
  cycle_days: 14,
  late_threshold_days: 3,
  relance_threshold: 2,
  auto_immobilisation_enabled: false,
  parking_check_interval_min: 15,
  relance_cooldown_hours: 24,
  require_all_photos: true,
  require_documents: true,
  uffizio_immobilization_dry_run: true,
};