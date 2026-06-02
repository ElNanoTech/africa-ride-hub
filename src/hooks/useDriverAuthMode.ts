import { useQuery } from '@tanstack/react-query';
import { supabaseDriver as supabase } from '@/integrations/supabase/clients';

export type DriverAuthMode = 'org_managed' | 'yango_oauth' | 'whatsapp_otp';

const VALID_MODES: DriverAuthMode[] = ['org_managed', 'yango_oauth', 'whatsapp_otp'];

/**
 * Reads the active driver login mode chosen by the platform owner.
 * Uses the SECURITY DEFINER `get_driver_auth_mode` RPC so it works for
 * unauthenticated visitors on the driver login screen.
 */
export function useDriverAuthMode() {
  return useQuery<DriverAuthMode>({
    queryKey: ['driver-auth-mode'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_driver_auth_mode');
      if (error) {
        console.warn('[useDriverAuthMode] falling back to org_managed:', error.message);
        return 'org_managed';
      }
      const value = (data as string) || 'org_managed';
      return (VALID_MODES.includes(value as DriverAuthMode) ? value : 'org_managed') as DriverAuthMode;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Reads the current platform setting from the privileged table (admin-only).
 * Used by the admin Settings page to display + edit the active mode.
 */
export function useDriverAuthModeAdmin() {
  return useQuery<DriverAuthMode>({
    queryKey: ['driver-auth-mode-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('setting_value')
        .eq('setting_key', 'driver_auth_mode')
        .maybeSingle();
      if (error) throw error;
      const raw = (data?.setting_value as string | null) ?? 'org_managed';
      return (VALID_MODES.includes(raw as DriverAuthMode) ? raw : 'org_managed') as DriverAuthMode;
    },
    staleTime: 30 * 1000,
  });
}
