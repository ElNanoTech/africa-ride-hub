import { useState, useEffect, useCallback } from 'react';

interface OfflineState {
  isOnline: boolean;
  wasOffline: boolean;
}

export function useOfflineStatus() {
  const [state, setState] = useState<OfflineState>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    wasOffline: false,
  });

  const handleOnline = useCallback(() => {
    setState(prev => ({
      isOnline: true,
      wasOffline: !prev.isOnline ? true : prev.wasOffline,
    }));
  }, []);

  const handleOffline = useCallback(() => {
    setState({
      isOnline: false,
      wasOffline: true,
    });
  }, []);

  const clearWasOffline = useCallback(() => {
    setState(prev => ({ ...prev, wasOffline: false }));
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return {
    ...state,
    clearWasOffline,
  };
}
