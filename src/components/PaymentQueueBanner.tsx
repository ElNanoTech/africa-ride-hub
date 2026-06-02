import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePaymentQueue } from '@/hooks/usePaymentQueue';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { cn } from '@/lib/utils';

/**
 * Floating banner shown to drivers whenever there is at least one queued
 * payment. Behaviour:
 *   - Offline: explain that the payment will go through once back online.
 *   - Online: a single "Finaliser" button mints the Wave session and
 *     redirects to the hosted checkout.
 *
 * Mounted globally in App.tsx so it follows the driver across screens.
 */
export function PaymentQueueBanner() {
  const { queue, isFlushing, flush } = usePaymentQueue();
  const { isOnline } = useOfflineStatus();

  const count = queue.length;
  if (count === 0) return null;

  const total = queue.reduce((sum, q) => sum + q.amount, 0);

  const handleFinalize = () => {
    void flush({ autoRedirect: true });
  };

  return (
    <AnimatePresence>
      <motion.div
        key="payment-queue-banner"
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className={cn(
          // Sit above the bottom nav (h-16 ~= 64px) with a comfortable gap.
          'fixed left-3 right-3 bottom-20 z-[90]',
          'rounded-2xl shadow-lg border',
          'bg-card text-card-foreground',
        )}
      >
        <div className="p-3 flex items-center gap-3">
          <div
            className={cn(
              'shrink-0 h-10 w-10 rounded-full flex items-center justify-center',
              isOnline
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground',
            )}
            aria-hidden
          >
            {isOnline ? (
              <Wifi className="h-5 w-5" />
            ) : (
              <WifiOff className="h-5 w-5" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">
              {isOnline
                ? count === 1
                  ? 'Paiement en attente'
                  : `${count} paiements en attente`
                : 'Hors ligne'}
            </p>
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {isOnline
                ? `Total: ${total.toLocaleString('fr-FR')} FCFA — appuyez pour finaliser`
                : 'Sera envoyé dès le retour de la connexion'}
            </p>
          </div>
          {isOnline && (
            <Button
              size="sm"
              onClick={handleFinalize}
              disabled={isFlushing}
              className="shrink-0"
            >
              {isFlushing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Finaliser'
              )}
            </Button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
