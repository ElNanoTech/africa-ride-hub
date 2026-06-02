/**
 * Shared display utility functions for the app.
 */

/**
 * B22 — French pluralization helper.
 * Usage: pluralize(count, 'location au total', 'locations au total')
 */
export function pluralize(count: number, singular: string, plural: string): string {
  return count <= 1 ? `${count} ${singular}` : `${count} ${plural}`;
}

/**
 * B14 — Never display a non-zero speed if the last ping is older than 1 hour.
 */
export function displaySpeed(speed: number, lastPing: string | null | undefined): string {
  if (!lastPing) return '—';
  const stale = (Date.now() - new Date(lastPing).getTime()) > 3600000; // 1 hour
  return stale ? '—' : `${speed} km/h`;
}

/**
 * B11 — GPS staleness badge info.
 * Returns a label and severity based on how old the last ping is.
 */
export function getGpsStaleness(lastPing: string | null | undefined): {
  label: string;
  severity: 'fresh' | 'stale' | 'disconnected' | 'unknown';
} {
  if (!lastPing) return { label: 'Aucune donnée', severity: 'unknown' };
  const ageMs = Date.now() - new Date(lastPing).getTime();
  const ageHours = ageMs / 3600000;
  const ageDays = ageHours / 24;

  if (ageHours < 1) return { label: 'GPS actif', severity: 'fresh' };
  if (ageDays < 7) return { label: 'GPS inactif', severity: 'stale' };
  return { label: 'GPS déconnecté', severity: 'disconnected' };
}

/**
 * B51 — Mask Yango internal ID for display.
 */
export function maskYangoId(id: string | null | undefined): string {
  if (!id) return '••••••••';
  return id.length > 8 ? `${id.substring(0, 6)}••••` : '••••••••';
}
