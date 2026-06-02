import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/routeClient';
import { useDriverAuth } from '@/hooks/useDriverAuth';
import { cn } from '@/lib/utils';

/**
 * Tiny pill that surfaces realtime websocket health to drivers.
 *
 * Why this is *not* a probe channel anymore:
 *   The previous version opened an empty `rt-connection-probe` channel with no
 *   bindings. Empty channels are unstable — Supabase Realtime can close them
 *   or time out their join handshake even though the underlying socket and
 *   every other bound channel (notifications, billing, sinistres…) keep
 *   working fine. That produced a permanent red "Hors ligne" pill while the
 *   app was actually online.
 *
 * Now we observe the *shared* websocket directly via `supabase.realtime`
 * socket callbacks, debounce visibility, and gate on `navigator.onLine` so
 * the truly-offline case is owned by `OfflineIndicator` (single source of
 * truth, no duplicate banners).
 */
export function RealtimeConnectionBanner() {
  const { isAuthenticated } = useDriverAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Access the underlying phoenix-style socket exposed by supabase-js.
    // Typed loosely because the public type doesn't surface onOpen/onClose.
    const socket = (supabase as unknown as {
      realtime: {
        isConnected?: () => boolean;
        onOpen?: (cb: () => void) => unknown;
        onClose?: (cb: () => void) => unknown;
        onError?: (cb: () => void) => unknown;
        off?: (ref: unknown) => void;
      };
    }).realtime;

    let pendingTimer: ReturnType<typeof setTimeout> | null = null;

    const clearPending = () => {
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
    };

    const evaluate = () => {
      const online = typeof navigator === 'undefined' ? true : navigator.onLine;
      const connected = socket?.isConnected?.() ?? true;

      // True offline → let OfflineIndicator handle it, hide the pill.
      if (!online) {
        clearPending();
        setShow(false);
        return;
      }

      if (connected) {
        clearPending();
        setShow(false);
        return;
      }

      // Online but socket not ready — debounce ~3s before nagging the driver.
      if (!pendingTimer) {
        pendingTimer = setTimeout(() => {
          // Re-check on fire: state may have changed.
          const stillOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
          const nowConnected = socket?.isConnected?.() ?? true;
          setShow(stillOnline && !nowConnected);
        }, 3000);
      }
    };

    const onOpenRef = socket?.onOpen?.(() => {
      clearPending();
      setShow(false);
    });
    const onCloseRef = socket?.onClose?.(evaluate);
    const onErrorRef = socket?.onError?.(evaluate);

    // Re-evaluate when the device toggles online/offline.
    window.addEventListener('online', evaluate);
    window.addEventListener('offline', evaluate);

    // Periodic safety net in case the socket callbacks aren't supported.
    const interval = setInterval(evaluate, 5000);

    // Initial assessment.
    evaluate();

    return () => {
      clearPending();
      clearInterval(interval);
      window.removeEventListener('online', evaluate);
      window.removeEventListener('offline', evaluate);
      try {
        socket?.off?.(onOpenRef);
        socket?.off?.(onCloseRef);
        socket?.off?.(onErrorRef);
      } catch {
        // Older supabase-js versions may not expose `off`; safe to ignore.
      }
    };
  }, [isAuthenticated]);

  if (!isAuthenticated || !show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-20 left-1/2 -translate-x-1/2 z-[80]',
        'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium shadow-md',
        'bg-muted text-muted-foreground',
      )}
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span>Reconnexion en cours…</span>
    </div>
  );
}
