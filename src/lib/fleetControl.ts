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
 * Statuses of a cycle the driver/admin still has to act on. The complement
 * (CLOSED_FLEET_CONTROL_STATUSES) is what the history screens list.
 * Single source of truth — do not hand-maintain copies of these lists.
 */
export const OPEN_FLEET_CONTROL_STATUSES: readonly FleetControlStatus[] =
  ['pending', 'submitted', 'rejected', 'overdue', 'blocked'];

/** Closed cycles — shown in the driver history, never on the active screen. */
export const CLOSED_FLEET_CONTROL_STATUSES: readonly FleetControlStatus[] =
  ['approved', 'cancelled'];

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

/**
 * Required zone set for ADMIN APPROVAL. Mirrors `fleet_control_approve` in
 * SQL: when both require flags are off, the completeness check is skipped
 * entirely (admin judgment) — the photos-fallback of requiredZones()
 * applies to driver SUBMIT only. Use this where the UI gates approval.
 */
export function approvalRequiredZones(
  settings: Pick<FleetControlSettings, 'require_all_photos' | 'require_documents'>,
): ZoneDef[] {
  if (!settings.require_all_photos && !settings.require_documents) return [];
  return requiredZones(settings);
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

/**
 * FC-D6 — Honest immobilization copy shared by the driver screen banner and
 * the Home FleetControlCard. Never claims an engine cut unless `cut_sent`,
 * and never claims that submitting the control cancels the restriction
 * (only the manager / parking check decides that).
 */
export function immobilizationBanner(
  state: ImmobilizationState,
  status: FleetControlStatus,
): { title: string; description: string } | null {
  if (state === 'cut_sent') {
    return {
      title: 'Véhicule immobilisé',
      description: 'Contactez votre gestionnaire.',
    };
  }
  if (state === 'requested' || state === 'pending_stop' || status === 'blocked') {
    return {
      title: 'Restriction demandée',
      description: 'En attente de vérification du stationnement. Contactez votre gestionnaire.',
    };
  }
  return null;
}

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

/** Minimal shape needed to sign a storage URL for an inspection item. */
export interface SignablePhotoRef {
  id: string;
  storage_path: string;
}

/**
 * Batch-sign storage URLs for inspection items in ONE round-trip via
 * `createSignedUrls` (instead of N `createSignedUrl` calls). Missing or
 * broken objects land in `failed` keyed by photo id so tiles can show an
 * honest "Pièce non disponible" state instead of a broken image.
 */
export async function signInspectionPhotoUrls(
  client: { storage: { from: (bucket: string) => any } },
  photos: SignablePhotoRef[],
  ttl = 3600,
): Promise<{ urls: Record<string, string>; failed: Record<string, true> }> {
  const urls: Record<string, string> = {};
  const failed: Record<string, true> = {};
  const signable = photos.filter((p) => !!p.storage_path);
  for (const p of photos) {
    if (!p.storage_path) failed[p.id] = true;
  }
  if (signable.length === 0) return { urls, failed };

  const { data, error } = await client.storage
    .from('vehicle-inspections')
    .createSignedUrls(signable.map((p) => p.storage_path), ttl);
  if (error || !data) {
    for (const p of signable) failed[p.id] = true;
    return { urls, failed };
  }
  const byPath = new Map<string, string>();
  for (const row of data as Array<{ path: string | null; signedUrl: string | null; error: string | null }>) {
    if (row?.path && row.signedUrl && !row.error) byPath.set(row.path, row.signedUrl);
  }
  for (const p of signable) {
    const url = byPath.get(p.storage_path);
    if (url) urls[p.id] = url;
    else failed[p.id] = true;
  }
  return { urls, failed };
}

/**
 * Row shape + select columns shared by the driver history list and the
 * read-only detail view (FleetControlHistory / FleetControlDetail).
 */
export interface FleetControlDriverRow {
  id: string;
  status: FleetControlStatus;
  due_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  vehicles?: { license_plate: string | null; make: string | null; model_name: string | null } | null;
}

export const FLEET_CONTROL_DRIVER_ROW_SELECT = `
  id, status, due_at, submitted_at, reviewed_at, rejection_reason, notes, created_at,
  vehicles:vehicles!vehicle_inspections_vehicle_id_fkey ( license_plate, make, model_name )
`;

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