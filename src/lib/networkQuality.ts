export type NetworkQuality = 'online' | 'poor' | 'offline';

export interface BrowserNetworkInfo {
  onLine?: boolean;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

export interface BrowserConnection extends EventTarget {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

const POOR_EFFECTIVE_TYPES = new Set(['slow-2g', '2g']);
const POOR_DOWNLINK_MBIT = 0.75;
const POOR_RTT_MS = 1200;

export function deriveNetworkQuality(info: BrowserNetworkInfo): NetworkQuality {
  if (info.onLine === false) return 'offline';
  if (info.saveData) return 'poor';

  const effectiveType = info.effectiveType?.toLowerCase();
  if (effectiveType && POOR_EFFECTIVE_TYPES.has(effectiveType)) return 'poor';

  if (
    typeof info.downlink === 'number' &&
    Number.isFinite(info.downlink) &&
    info.downlink > 0 &&
    info.downlink < POOR_DOWNLINK_MBIT
  ) {
    return 'poor';
  }

  if (
    typeof info.rtt === 'number' &&
    Number.isFinite(info.rtt) &&
    info.rtt >= POOR_RTT_MS
  ) {
    return 'poor';
  }

  return 'online';
}

export function getBrowserConnection(): BrowserConnection | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const nav = navigator as Navigator & {
    connection?: BrowserConnection;
    mozConnection?: BrowserConnection;
    webkitConnection?: BrowserConnection;
  };
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
}

export function readBrowserNetworkInfo(): BrowserNetworkInfo {
  if (typeof navigator === 'undefined') {
    return { onLine: true };
  }
  const connection = getBrowserConnection();
  return {
    onLine: navigator.onLine,
    effectiveType: connection?.effectiveType,
    downlink: connection?.downlink,
    rtt: connection?.rtt,
    saveData: connection?.saveData,
  };
}
