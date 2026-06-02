import { describe, it, expect, beforeEach } from 'vitest';
import {
  isNotificationForDriver,
  NotificationDedupCache,
  type NotificationRow,
  type RecipientContext,
} from './notificationFiltering';

const ME_DRIVER_ID = 'driver-aaaa-1111';
const ME_USER_ID = 'auth-aaaa-1111';
const OTHER_DRIVER_ID = 'driver-bbbb-2222';
const OTHER_USER_ID = 'auth-bbbb-2222';

const baseRow = (
  overrides: Partial<NotificationRow> = {},
): NotificationRow => ({
  id: 'n-1',
  driver_id: null,
  recipient_user_id: null,
  title: 'Hello',
  message: 'World',
  notification_type: 'info',
  created_at: '2026-04-22T00:00:00Z',
  ...overrides,
});

const meCtx: RecipientContext = {
  driverId: ME_DRIVER_ID,
  authUserId: ME_USER_ID,
};

describe('isNotificationForDriver', () => {
  describe('matching cases (must return true)', () => {
    it('matches when driver_id equals the current driverId', () => {
      const row = baseRow({ driver_id: ME_DRIVER_ID });
      expect(isNotificationForDriver(row, meCtx)).toBe(true);
    });

    it('matches when only recipient_user_id matches the auth user id', () => {
      const row = baseRow({ recipient_user_id: ME_USER_ID });
      expect(isNotificationForDriver(row, meCtx)).toBe(true);
    });

    it('matches when both targeting columns match', () => {
      const row = baseRow({
        driver_id: ME_DRIVER_ID,
        recipient_user_id: ME_USER_ID,
      });
      expect(isNotificationForDriver(row, meCtx)).toBe(true);
    });

    it('matches via driver_id even when recipient_user_id targets someone else (driver_id wins)', () => {
      const row = baseRow({
        driver_id: ME_DRIVER_ID,
        recipient_user_id: OTHER_USER_ID,
      });
      expect(isNotificationForDriver(row, meCtx)).toBe(true);
    });

    it('matches via recipient_user_id when context has no driverId yet', () => {
      const row = baseRow({ recipient_user_id: ME_USER_ID });
      expect(
        isNotificationForDriver(row, {
          driverId: null,
          authUserId: ME_USER_ID,
        }),
      ).toBe(true);
    });
  });

  describe('rejection cases (must return false)', () => {
    it('rejects rows targeting a different driver', () => {
      const row = baseRow({ driver_id: OTHER_DRIVER_ID });
      expect(isNotificationForDriver(row, meCtx)).toBe(false);
    });

    it('rejects rows targeting a different auth user', () => {
      const row = baseRow({ recipient_user_id: OTHER_USER_ID });
      expect(isNotificationForDriver(row, meCtx)).toBe(false);
    });

    it('rejects rows whose driver_id and user_id both target other people', () => {
      const row = baseRow({
        driver_id: OTHER_DRIVER_ID,
        recipient_user_id: OTHER_USER_ID,
      });
      expect(isNotificationForDriver(row, meCtx)).toBe(false);
    });

    it('rejects rows with no targeting columns set (broadcast-style)', () => {
      const row = baseRow({ driver_id: null, recipient_user_id: null });
      expect(isNotificationForDriver(row, meCtx)).toBe(false);
    });

    it('rejects when no driver is signed in at all', () => {
      const row = baseRow({ driver_id: ME_DRIVER_ID });
      expect(
        isNotificationForDriver(row, {
          driverId: null,
          authUserId: null,
        }),
      ).toBe(false);
    });

    it('rejects null/undefined rows defensively', () => {
      expect(isNotificationForDriver(null, meCtx)).toBe(false);
      expect(isNotificationForDriver(undefined, meCtx)).toBe(false);
    });

    it('does NOT cross-match (driver_id of row must not equal authUserId of context)', () => {
      // Defends against a future bug where someone confuses the two columns.
      const row = baseRow({ driver_id: ME_USER_ID });
      expect(isNotificationForDriver(row, meCtx)).toBe(false);
    });

    it('does NOT cross-match (recipient_user_id of row must not equal driverId of context)', () => {
      const row = baseRow({ recipient_user_id: ME_DRIVER_ID });
      expect(isNotificationForDriver(row, meCtx)).toBe(false);
    });

    it('treats empty strings as missing identifiers', () => {
      const row = baseRow({ driver_id: '', recipient_user_id: '' });
      expect(isNotificationForDriver(row, meCtx)).toBe(false);
      expect(
        isNotificationForDriver(baseRow({ driver_id: ME_DRIVER_ID }), {
          driverId: '',
          authUserId: '',
        }),
      ).toBe(false);
    });
  });
});

describe('NotificationDedupCache', () => {
  let cache: NotificationDedupCache;

  beforeEach(() => {
    cache = new NotificationDedupCache(5);
  });

  it('returns true the first time an id is seen', () => {
    expect(cache.registerIfNew('n-1')).toBe(true);
    expect(cache.has('n-1')).toBe(true);
  });

  it('returns false on duplicate ids (the core anti-double-toast guarantee)', () => {
    cache.registerIfNew('n-1');
    expect(cache.registerIfNew('n-1')).toBe(false);
    expect(cache.registerIfNew('n-1')).toBe(false);
  });

  it('treats different ids independently', () => {
    expect(cache.registerIfNew('n-1')).toBe(true);
    expect(cache.registerIfNew('n-2')).toBe(true);
    expect(cache.registerIfNew('n-1')).toBe(false);
    expect(cache.registerIfNew('n-2')).toBe(false);
  });

  it('refuses to track null/undefined/empty ids', () => {
    expect(cache.registerIfNew(null)).toBe(false);
    expect(cache.registerIfNew(undefined)).toBe(false);
    expect(cache.registerIfNew('')).toBe(false);
    expect(cache.size()).toBe(0);
  });

  it('evicts the oldest entry when maxSize is exceeded', () => {
    for (let i = 0; i < 5; i++) cache.registerIfNew(`n-${i}`);
    expect(cache.size()).toBe(5);
    expect(cache.registerIfNew('n-5')).toBe(true); // overflow triggers eviction
    expect(cache.size()).toBe(5);
    expect(cache.has('n-0')).toBe(false); // oldest evicted
    expect(cache.has('n-5')).toBe(true);
  });

  it('rejects non-positive maxSize', () => {
    expect(() => new NotificationDedupCache(0)).toThrow();
    expect(() => new NotificationDedupCache(-1)).toThrow();
  });

  it('clear() empties the cache', () => {
    cache.registerIfNew('n-1');
    cache.registerIfNew('n-2');
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.registerIfNew('n-1')).toBe(true);
  });
});

/**
 * Integration-style assertions that mirror the actual runtime path inside
 * NotificationListener: filter by recipient, then dedupe by id.
 *
 * These don't render React; they exercise the same two helpers in the same
 * order the component uses them so a regression in either function shows up
 * here, even if the component file is refactored.
 */
describe('NotificationListener pipeline (filter + dedupe)', () => {
  const cache = new NotificationDedupCache();

  beforeEach(() => cache.clear());

  function shouldFire(row: NotificationRow, ctx: RecipientContext): boolean {
    if (!isNotificationForDriver(row, ctx)) return false;
    return cache.registerIfNew(row.id);
  }

  it('fires exactly once for a row addressed to me, even if delivered twice', () => {
    const row = baseRow({ id: 'dup-1', driver_id: ME_DRIVER_ID });
    expect(shouldFire(row, meCtx)).toBe(true);
    expect(shouldFire(row, meCtx)).toBe(false); // duplicate suppressed
  });

  it('never fires for rows addressed to a different driver, no matter how many times', () => {
    const row = baseRow({ id: 'other-1', driver_id: OTHER_DRIVER_ID });
    expect(shouldFire(row, meCtx)).toBe(false);
    expect(shouldFire(row, meCtx)).toBe(false);
    expect(shouldFire(row, meCtx)).toBe(false);
  });

  it('treats two distinct notifications addressed to me as two separate fires', () => {
    expect(
      shouldFire(baseRow({ id: 'a', driver_id: ME_DRIVER_ID }), meCtx),
    ).toBe(true);
    expect(
      shouldFire(baseRow({ id: 'b', driver_id: ME_DRIVER_ID }), meCtx),
    ).toBe(true);
  });

  it('does not register an id if the recipient filter rejects it (so a later legitimate row with the same id would still fire — guards against accidental cross-driver dedup leakage)', () => {
    // Someone else's row arrives first; we ignore it and DO NOT cache its id.
    expect(
      shouldFire(baseRow({ id: 'shared-id', driver_id: OTHER_DRIVER_ID }), meCtx),
    ).toBe(false);
    // Hypothetically, if a row with the same id were also addressed to me
    // (shouldn't happen in practice but defends against bad backfills), it
    // should still fire because the cache only tracks rows we accepted.
    expect(
      shouldFire(baseRow({ id: 'shared-id', driver_id: ME_DRIVER_ID }), meCtx),
    ).toBe(true);
  });
});
