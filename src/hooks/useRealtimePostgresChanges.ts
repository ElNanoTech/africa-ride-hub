import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/routeClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

type Event = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface ChangePayload<T> {
  new: T;
  old: T;
  eventType: Event;
  table: string;
  schema: string;
}

/**
 * Generic, low-level realtime subscription for a single Postgres table/event.
 *
 * Why this exists alongside the older `useRealtimeSubscription`:
 *   - `useRealtimeSubscription` is admin-list oriented (config object with
 *     a fixed list of admin tables, auto-invalidates known query keys, shows
 *     toasts). Great for admin pages, wrong shape for driver-side flows.
 *   - This hook is the lightweight building block from the realtime spec:
 *     pass any table, an event, a filter predicate, and a callback. The
 *     callback/filter are stored in refs so consumers don't have to
 *     `useCallback` everything (which would silently re-create the channel
 *     on every render — bad on 3G/Edge).
 */
export function useRealtimePostgresChanges<T = Record<string, unknown>>(
  table: string,
  event: Event,
  filter: (payload: ChangePayload<T>) => boolean,
  callback: (payload: ChangePayload<T>) => void,
  enabled: boolean = true,
) {
  const callbackRef = useRef(callback);
  const filterRef = useRef(filter);

  // Keep refs fresh so consumers don't have to memoize callback/filter.
  useEffect(() => {
    callbackRef.current = callback;
    filterRef.current = filter;
  }, [callback, filter]);

  useEffect(() => {
    if (!enabled) return;

    // Resubscribe with backoff on transport failures (flaky 3G/Edge, server
    // restarts): 5s → 15s → 60s, then keep retrying forever at 60s. The
    // backoff resets once a subscription succeeds.
    const BACKOFF_MS = [5_000, 15_000, 60_000];
    let disposed = false;
    let channel: RealtimeChannel | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const scheduleResubscribe = () => {
      if (disposed || retryTimer) return;
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      attempt += 1;
      // eslint-disable-next-line no-console
      console.warn(`[Realtime] ${table}:${event} dropped — retrying in ${delay / 1000}s`);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (disposed) return;
        if (channel) supabase.removeChannel(channel);
        channel = null;
        subscribe();
      }, delay);
    };

    const subscribe = () => {
      if (disposed) return;
      // Unique channel name per (table,event,mount) so multiple listeners
      // for the same table can coexist without stomping on each other.
      const channelName = `rt:${table}:${event}:${Math.random().toString(36).slice(2, 8)}`;
      const self: RealtimeChannel = supabase
        .channel(channelName)
        .on(
          // @ts-expect-error - supabase-js types for postgres_changes are loose
          'postgres_changes',
          { event, schema: 'public', table },
          (payload: ChangePayload<T>) => {
            try {
              if (filterRef.current(payload)) {
                callbackRef.current(payload);
              }
            } catch (err) {
              console.error(`[Realtime ${table}] handler error`, err);
            }
          },
        );
      channel = self;
      self.subscribe((status) => {
        // Ignore status callbacks from channels we already replaced/removed.
        if (disposed || channel !== self) return;
        if (status === 'SUBSCRIBED') {
          attempt = 0;
          // eslint-disable-next-line no-console
          console.log(`[Realtime] subscribed to ${table}:${event}`);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          scheduleResubscribe();
        }
      });
    };

    subscribe();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (channel) supabase.removeChannel(channel);
    };
    // We intentionally exclude callback/filter — they're handled via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, event, enabled]);
}
