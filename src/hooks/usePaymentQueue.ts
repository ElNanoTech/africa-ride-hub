import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/routeClient';
import {
  getQueue,
  removeFromQueue,
  markAttempt,
  PAYMENT_QUEUE_EVENT,
  type QueuedPayment,
} from '@/lib/paymentQueue';
import { useOfflineStatus } from './useOfflineStatus';

interface FlushResult {
  paymentId: string;
  status: 'redirected' | 'ready' | 'failed';
  checkoutUrl?: string;
  error?: string;
}

/**
 * Subscribes to the local payment queue and exposes:
 *   - `queue`: live list of queued payments
 *   - `isFlushing`: true while we're trying to mint Wave sessions
 *   - `flush(autoRedirect)`: manually trigger processing
 *
 * Auto-flushes whenever the browser comes back online.
 */
export function usePaymentQueue() {
  const [queue, setQueue] = useState<QueuedPayment[]>(() => getQueue());
  const [isFlushing, setIsFlushing] = useState(false);
  const { isOnline } = useOfflineStatus();

  // Sync local state with localStorage changes (same-tab + cross-tab).
  useEffect(() => {
    const sync = () => setQueue(getQueue());
    window.addEventListener(PAYMENT_QUEUE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PAYMENT_QUEUE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const processOne = useCallback(
    async (entry: QueuedPayment): Promise<FlushResult> => {
      try {
        const response = await supabase.functions.invoke('wave-checkout', {
          body: {
            paymentId: entry.paymentId,
            amount: entry.amount,
            successUrl: entry.successUrl,
            errorUrl: entry.errorUrl,
          },
        });
        if (response.error) throw new Error(response.error.message);
        const checkoutUrl = (response.data as { checkout_url?: string } | null)
          ?.checkout_url;
        if (!checkoutUrl) throw new Error('No checkout URL returned');
        // Success: drop from queue, the caller decides whether to redirect.
        removeFromQueue(entry.paymentId);
        return { paymentId: entry.paymentId, status: 'ready', checkoutUrl };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erreur inconnue';
        markAttempt(entry.paymentId, msg);
        return { paymentId: entry.paymentId, status: 'failed', error: msg };
      }
    },
    [],
  );

  const flush = useCallback(
    async (options?: { autoRedirect?: boolean }): Promise<FlushResult[]> => {
      const current = getQueue();
      if (current.length === 0) return [];
      if (typeof navigator !== 'undefined' && !navigator.onLine) return [];
      setIsFlushing(true);
      const results: FlushResult[] = [];
      try {
        for (const entry of current) {
          const result = await processOne(entry);
          results.push(result);
          // Auto-redirect to the FIRST successful checkout URL (Wave only
          // supports one foreground redirect at a time). Remaining queued
          // payments stay ready and the driver can finalize them next.
          if (
            options?.autoRedirect &&
            result.status === 'ready' &&
            result.checkoutUrl
          ) {
            window.location.href = result.checkoutUrl;
            break;
          }
        }
      } finally {
        setIsFlushing(false);
      }
      return results;
    },
    [processOne],
  );

  // Auto-flush when network returns. We do NOT auto-redirect here: the driver
  // may have switched apps / locked the phone. Instead we surface a banner
  // and let them tap to finalize.
  useEffect(() => {
    if (!isOnline) return;
    if (queue.length === 0) return;
    let cancelled = false;
    void (async () => {
      const before = queue.length;
      const results = await flush({ autoRedirect: false });
      if (cancelled) return;
      // Surface a toast if at least one became ready.
      const ready = results.filter((r) => r.status === 'ready').length;
      if (ready > 0 && before > 0) {
        // Lazy-import sonner to avoid circular deps with components.
        const { toast } = await import('sonner');
        toast.success(
          ready === 1
            ? 'Paiement prêt à finaliser'
            : `${ready} paiements prêts à finaliser`,
          {
            description:
              'Votre connexion est rétablie. Appuyez sur le bouton ci-dessous pour payer avec Wave.',
            duration: 8000,
          },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // We intentionally only react to the online flip and queue size changes,
    // not to the array identity, to avoid loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, queue.length]);

  return { queue, isFlushing, flush };
}
