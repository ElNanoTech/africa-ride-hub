/**
 * Pure routing/dedup helpers for the global NotificationListener.
 *
 * These live outside the React component so they can be unit-tested
 * exhaustively without spinning up jsdom or mocking Supabase Realtime.
 * The component imports them as the single source of truth for "should
 * this realtime payload trigger a toast?".
 */

export interface NotificationRow {
  id: string;
  driver_id: string | null;
  /** Auth user id for whom the notification is intended (legacy column). */
  recipient_user_id: string | null;
  title: string | null;
  message: string | null;
  notification_type: string | null;
  created_at: string;
}

export interface RecipientContext {
  /** The current driver's row id (matches `notifications.driver_id`). */
  driverId: string | null | undefined;
  /** The current auth user id (matches `notifications.recipient_user_id`). */
  authUserId: string | null | undefined;
}

/**
 * Returns true iff a notification row is targeted at the currently signed-in
 * driver. We accept either column because the table has both:
 *   - `driver_id` (used by all current writers)
 *   - `recipient_user_id` (older code paths and edge functions)
 *
 * A row is rejected when:
 *   - either the row or the context is missing both targeting columns,
 *   - the row targets a different driver,
 *   - the context has no signed-in driver at all.
 */
export function isNotificationForDriver(
  row: Pick<NotificationRow, 'driver_id' | 'recipient_user_id'> | null | undefined,
  ctx: RecipientContext,
): boolean {
  if (!row) return false;
  if (!ctx.driverId && !ctx.authUserId) return false;

  // Row must declare at least one targeting column.
  if (!row.driver_id && !row.recipient_user_id) return false;

  const matchesDriver =
    !!ctx.driverId && !!row.driver_id && row.driver_id === ctx.driverId;
  const matchesUser =
    !!ctx.authUserId &&
    !!row.recipient_user_id &&
    row.recipient_user_id === ctx.authUserId;

  return matchesDriver || matchesUser;
}

/**
 * Bounded LRU-ish set used to dedupe realtime payloads. Realtime can deliver
 * the same INSERT twice in pathological reconnect scenarios (server replay,
 * multiple channels racing during a refresh). Without dedup the driver hears
 * two "dings" for the same notification — confusing on a noisy street.
 *
 * The set keeps at most `maxSize` ids and evicts the oldest on overflow.
 */
export class NotificationDedupCache {
  private readonly seen = new Set<string>();
  private readonly maxSize: number;

  constructor(maxSize = 200) {
    if (maxSize <= 0) throw new Error('maxSize must be positive');
    this.maxSize = maxSize;
  }

  /**
   * Records an id and returns `true` if it had never been seen before
   * (i.e., the caller should fire side-effects). Returns `false` when the
   * id is a duplicate and side-effects should be suppressed.
   */
  registerIfNew(id: string | null | undefined): boolean {
    if (!id) return false; // refuse to track untargeted rows
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    if (this.seen.size > this.maxSize) {
      // Sets preserve insertion order: drop the oldest entry.
      const oldest = this.seen.values().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    return true;
  }

  /** Test/inspection helpers. */
  size(): number {
    return this.seen.size;
  }
  has(id: string): boolean {
    return this.seen.has(id);
  }
  clear(): void {
    this.seen.clear();
  }
}
