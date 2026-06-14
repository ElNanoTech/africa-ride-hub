import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

export function OfflineIndicator() {
  const { isOnline, wasOffline, clearWasOffline, quality, effectiveType } = useOfflineStatus();
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

  const showLimited = quality === 'poor' && !showReconnected;

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
            'px-3 py-3 flex items-center justify-center gap-2'
          )}
        >
          <WifiOff className="h-4 w-4" />
          <div className="min-w-0">
            <span className="text-sm font-semibold">Hors ligne</span>
            <span className="text-xs opacity-85"> · données en cache disponibles</span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={cn(
              'ml-1 flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1',
              'bg-white/15 hover:bg-white/25 text-xs font-medium transition-colors',
              'active:scale-95'
            )}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
            Réessayer
          </button>
        </motion.div>
      )}

      {/* Limited Connection Banner */}
      {showLimited && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={cn(
            'fixed top-0 left-0 right-0 z-[100] safe-top',
            'bg-warning text-warning-foreground',
            'px-3 py-3 flex items-center justify-center gap-2'
          )}
        >
          <Wifi className="h-4 w-4" />
          <div className="min-w-0">
            <span className="text-sm font-semibold">Connexion limitée</span>
            <span className="text-xs opacity-85">
              {effectiveType ? ` · ${effectiveType.toUpperCase()}` : ' · certaines actions peuvent échouer'}
            </span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={cn(
              'ml-1 flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1',
              'bg-black/10 hover:bg-black/15 text-xs font-medium transition-colors',
              'active:scale-95'
            )}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
            Actualiser
          </button>
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
  const { quality } = useOfflineStatus();

  return (
    <div className="relative">
      <div
        className={cn(
          'w-2 h-2 rounded-full transition-colors',
          quality === 'online' && 'bg-primary',
          quality === 'poor' && 'bg-warning animate-pulse',
          quality === 'offline' && 'bg-destructive animate-pulse'
        )}
      />
      {quality !== 'online' && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive/20 rounded-full animate-ping" />
      )}
    </div>
  );
}
