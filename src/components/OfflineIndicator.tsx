import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

export function OfflineIndicator() {
  const { isOnline, wasOffline, clearWasOffline } = useOfflineStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  // Show "reconnected" message briefly when coming back online
  useEffect(() => {
    if (isOnline && wasOffline) {
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
        clearWasOffline();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline, clearWasOffline]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setIsRefreshing(false);
    setShowReconnected(false);
    clearWasOffline();
  };

  return (
    <AnimatePresence>
      {/* Offline Banner */}
      {!isOnline && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={cn(
            'fixed top-0 left-0 right-0 z-[100] safe-top',
            'bg-destructive text-destructive-foreground',
            'px-4 py-3 flex items-center justify-center gap-2'
          )}
        >
          <WifiOff className="h-4 w-4" />
          <span className="text-sm font-medium">
            Vous êtes hors ligne
          </span>
          <span className="text-sm opacity-80">
            • Les données en cache sont disponibles
          </span>
        </motion.div>
      )}

      {/* Reconnected Banner */}
      {isOnline && showReconnected && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={cn(
            'fixed top-0 left-0 right-0 z-[100] safe-top',
            'bg-primary text-primary-foreground',
            'px-4 py-3 flex items-center justify-center gap-3'
          )}
        >
          <Wifi className="h-4 w-4" />
          <span className="text-sm font-medium">
            Connexion rétablie
          </span>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-full',
              'bg-primary-foreground/20 hover:bg-primary-foreground/30',
              'text-sm font-medium transition-colors',
              'active:scale-95'
            )}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
            Actualiser
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Compact version for header integration
export function OfflineStatusDot() {
  const { isOnline } = useOfflineStatus();

  return (
    <div className="relative">
      <div
        className={cn(
          'w-2 h-2 rounded-full transition-colors',
          isOnline ? 'bg-primary' : 'bg-destructive animate-pulse'
        )}
      />
      {!isOnline && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive/20 rounded-full animate-ping" />
      )}
    </div>
  );
}
