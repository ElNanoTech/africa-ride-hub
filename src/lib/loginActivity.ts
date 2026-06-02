/**
 * Login Activity Tracking
 * Records and retrieves login attempts for security monitoring
 */

import { supabaseDriver as supabase } from '@/integrations/supabase/clients';

export interface LoginActivityRecord {
  id: string;
  driver_id: string;
  login_method: 'pin' | 'biometric' | 'yango' | 'test' | 'otp';
  device_info: string | null;
  ip_address: string | null;
  location: string | null;
  user_agent: string | null;
  success: boolean;
  failure_reason: string | null;
  created_at: string;
}

/**
 * Get device info from the browser
 */
function getDeviceInfo(): string {
  const ua = navigator.userAgent;
  
  // Detect device type
  let device = 'Unknown Device';
  if (/iPhone/.test(ua)) device = 'iPhone';
  else if (/iPad/.test(ua)) device = 'iPad';
  else if (/Android/.test(ua) && /Mobile/.test(ua)) device = 'Android Phone';
  else if (/Android/.test(ua)) device = 'Android Tablet';
  else if (/Mac/.test(ua)) device = 'Mac';
  else if (/Windows/.test(ua)) device = 'Windows PC';
  else if (/Linux/.test(ua)) device = 'Linux PC';
  
  // Detect browser
  let browser = 'Unknown Browser';
  if (/Chrome/.test(ua) && !/Edge/.test(ua)) browser = 'Chrome';
  else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
  else if (/Firefox/.test(ua)) browser = 'Firefox';
  else if (/Edge/.test(ua)) browser = 'Edge';
  else if (/Opera/.test(ua)) browser = 'Opera';
  
  return `${device} - ${browser}`;
}

/**
 * Get approximate location (using timezone as proxy)
 */
function getApproximateLocation(): string {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Extract region from timezone (e.g., "Africa/Abidjan" -> "Abidjan")
    const parts = timezone.split('/');
    return parts[parts.length - 1].replace(/_/g, ' ');
  } catch {
    return 'Unknown Location';
  }
}

/**
 * Record a login attempt
 */
export async function recordLoginActivity(
  driverId: string,
  loginMethod: LoginActivityRecord['login_method'],
  success: boolean,
  failureReason?: string
): Promise<void> {
  try {
    const deviceInfo = getDeviceInfo();
    const location = getApproximateLocation();
    const userAgent = navigator.userAgent;

    const { error } = await supabase
      .from('login_activity')
      .insert({
        driver_id: driverId,
        login_method: loginMethod,
        device_info: deviceInfo,
        location: location,
        user_agent: userAgent,
        success: success,
        failure_reason: failureReason || null,
      });

    if (error) {
      console.error('Failed to record login activity:', error);
    }
  } catch (err) {
    console.error('Error recording login activity:', err);
  }
}

/**
 * Get login activity for the current driver
 */
export async function getLoginActivity(limit: number = 10): Promise<LoginActivityRecord[]> {
  try {
    const { data, error } = await supabase
      .from('login_activity')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch login activity:', error);
      return [];
    }

    return (data || []) as LoginActivityRecord[];
  } catch (err) {
    console.error('Error fetching login activity:', err);
    return [];
  }
}

/**
 * Format login method for display
 */
export function formatLoginMethod(method: string): string {
  const methods: Record<string, string> = {
    pin: 'Code PIN',
    biometric: 'Biométrie',
    yango: 'Yango',
    test: 'Mode Test',
    otp: 'SMS OTP',
  };
  return methods[method] || method;
}

/**
 * Get icon for login method
 */
export function getLoginMethodIcon(method: string): 'key' | 'fingerprint' | 'smartphone' | 'test-tube' | 'message-square' {
  const icons: Record<string, 'key' | 'fingerprint' | 'smartphone' | 'test-tube' | 'message-square'> = {
    pin: 'key',
    biometric: 'fingerprint',
    yango: 'smartphone',
    test: 'test-tube',
    otp: 'message-square',
  };
  return icons[method] || 'key';
}
