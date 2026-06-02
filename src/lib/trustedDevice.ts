/**
 * Trusted Device Management
 * Handles "Remember this device" functionality for 30-day session persistence
 */

const TRUSTED_DEVICE_KEY = 'dam_flotte_trusted_device';
const TRUSTED_DEVICE_EXPIRY_KEY = 'dam_flotte_trusted_device_expiry';
const THIRTY_DAYS_MS = 90 * 24 * 60 * 60 * 1000; // 90 days — keep drivers logged in for ~3 months

export interface TrustedDeviceInfo {
  isTrusted: boolean;
  expiresAt: number | null;
  daysRemaining: number | null;
}

/**
 * Mark the current device as trusted for 30 days
 */
export function setDeviceTrusted(): void {
  const expiresAt = Date.now() + THIRTY_DAYS_MS;
  localStorage.setItem(TRUSTED_DEVICE_KEY, 'true');
  localStorage.setItem(TRUSTED_DEVICE_EXPIRY_KEY, expiresAt.toString());
}

/**
 * Remove trusted device status
 */
export function removeDeviceTrust(): void {
  localStorage.removeItem(TRUSTED_DEVICE_KEY);
  localStorage.removeItem(TRUSTED_DEVICE_EXPIRY_KEY);
}

/**
 * Check if the current device is trusted and not expired
 */
export function isDeviceTrusted(): boolean {
  const trusted = localStorage.getItem(TRUSTED_DEVICE_KEY);
  const expiresAt = localStorage.getItem(TRUSTED_DEVICE_EXPIRY_KEY);
  
  if (!trusted || !expiresAt) {
    return false;
  }
  
  const expiryTime = parseInt(expiresAt, 10);
  if (isNaN(expiryTime) || Date.now() > expiryTime) {
    // Expired - clean up
    removeDeviceTrust();
    return false;
  }
  
  return true;
}

/**
 * Get detailed info about the trusted device status
 */
export function getTrustedDeviceInfo(): TrustedDeviceInfo {
  const trusted = localStorage.getItem(TRUSTED_DEVICE_KEY);
  const expiresAtStr = localStorage.getItem(TRUSTED_DEVICE_EXPIRY_KEY);
  
  if (!trusted || !expiresAtStr) {
    return { isTrusted: false, expiresAt: null, daysRemaining: null };
  }
  
  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(expiresAt) || Date.now() > expiresAt) {
    removeDeviceTrust();
    return { isTrusted: false, expiresAt: null, daysRemaining: null };
  }
  
  const msRemaining = expiresAt - Date.now();
  const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
  
  return { isTrusted: true, expiresAt, daysRemaining };
}

/**
 * Extend the trusted device expiry by another 30 days
 * Call this on each successful login to keep the device trusted
 */
export function extendDeviceTrust(): void {
  if (isDeviceTrusted()) {
    setDeviceTrusted();
  }
}
