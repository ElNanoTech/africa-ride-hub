import { useState, useEffect, useCallback } from 'react';
import {
  deriveNetworkQuality,
  getBrowserConnection,
  readBrowserNetworkInfo,
  type NetworkQuality,
} from '@/lib/networkQuality';

interface OfflineState {
  isOnline: boolean;
  wasOffline: boolean;
  quality: NetworkQuality;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

function readOfflineState(previous?: OfflineState): OfflineState {
  const info = readBrowserNetworkInfo();
  const quality = deriveNetworkQuality(info);
  const isOnline = quality !== 'offline';
  const cameBackOnline = previous ? !previous.isOnline && isOnline : false;

  return {
    isOnline,
    wasOffline: cameBackOnline ? true : previous?.wasOffline ?? false,
    quality,
    effectiveType: info.effectiveType,
    downlink: info.downlink,
    rtt: info.rtt,
    saveData: info.saveData,
  };
}

export function useOfflineStatus() {
  const [state, setState] = useState<OfflineState>(() => readOfflineState());

  const refreshNetworkState = useCallback(() => {
    setState(prev => readOfflineState(prev));
  }, []);

  const clearWasOffline = useCallback(() => {
    setState(prev => ({ ...prev, wasOffline: false }));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const connection = getBrowserConnection();

    refreshNetworkState();
    window.addEventListener('online', refreshNetworkState);
    window.addEventListener('offline', refreshNetworkState);
    connection?.addEventListener?.('change', refreshNetworkState);

    return () => {
      window.removeEventListener('online', refreshNetworkState);
      window.removeEventListener('offline', refreshNetworkState);
      connection?.removeEventListener?.('change', refreshNetworkState);
    };
  }, [refreshNetworkState]);

  return {
    ...state,
    clearWasOffline,
  };
}
