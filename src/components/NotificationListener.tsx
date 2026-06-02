import { useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useRealtimePostgresChanges } from '@/hooks/useRealtimePostgresChanges';
import { useDriverAuth } from '@/hooks/useDriverAuth';
import { useDriverId } from '@/hooks/useDriverData';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import {
  isNotificationForDriver,
  NotificationDedupCache,
  type NotificationRow,
} from './notificationFiltering';

/**
 * Global driver-side notification listener.
 *
 * Mounted once at the app root so that any new row in `public.notifications`
 * targeted at the currently signed-in driver triggers:
 *   - a Sonner toast (so the driver sees it without opening the bell screen)
 *   - the existing Web Audio "ding" (respects the user's sound preference)
 *   - a short vibration on Android
 *   - invalidation of the notifications query cache (badge counter, list)
 *
 * Targeting & dedup logic is delegated to pure helpers in
 * `notificationFiltering.ts` so it can be tested exhaustively without React.
 * The two guarantees those helpers provide:
 *   1. We only react to rows whose `driver_id` OR `recipient_user_id`
 *      matches the currently signed-in identity.
 *   2. Each notification id triggers side-effects at most once, even if the
 *      realtime channel replays the same INSERT after a reconnect.
 */
export function NotificationListener() {
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useDriverAuth();
  const { data: driverId } = useDriverId();
  const { playNotificationSound } = useNotificationSound();
  const { preferences } = useNotificationPreferences();

  // Persist the dedup cache across renders. A ref is the right tool: it
  // survives re-renders without causing them, and stays scoped to this
  // mount (cleared when the listener unmounts on logout).
  const dedupRef = useRef<NotificationDedupCache>();
  if (!dedupRef.current) dedupRef.current = new NotificationDedupCache();

  const enabled = isAuthenticated && !!driverId;
  const authUserId = user?.id ?? null;

  useRealtimePostgresChanges<NotificationRow>(
    'notifications',
    'INSERT',
    (payload) =>
      isNotificationForDriver(payload.new, { driverId, authUserId }),
    (payload) => {
      const n = payload.new;

      // Suppress the second delivery of the same notification id.
      if (!dedupRef.current!.registerIfNew(n.id)) return;

      const title = n.title ?? 'Notification';
      const description = n.message ?? undefined;

      toast(title, { description, duration: 5000 });

      if (preferences.soundEnabled) {
        playNotificationSound();
      }

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([200, 100, 200]);
        } catch {
          // Some browsers throw if vibration is gated by user interaction.
        }
      }

      // Refresh the bell counter / notifications page if mounted.
      void queryClient.invalidateQueries({ queryKey: ['driverNotifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications', driverId] });
    },
    enabled,
  );

  return null;
}
