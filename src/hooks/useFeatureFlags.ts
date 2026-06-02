import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { useAdminAuth } from './useAdminAuth';

export interface FeatureFlag {
  id: string;
  flag_key: string;
  flag_value: boolean;
  description: string | null;
  is_platform_only: boolean;
  category: string;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformSetting {
  id: string;
  setting_key: string;
  setting_value: Record<string, unknown>;
  description: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface FeatureFlagAuditLog {
  id: string;
  actor_id: string;
  actor_email: string | null;
  flag_key: string;
  old_value: boolean | null;
  new_value: boolean | null;
  customer_id: string | null;
  reason: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Hook to check if a specific feature is enabled
 */
export function useIsFeatureEnabled(flagKey: string) {
  return useQuery({
    queryKey: ['feature-flag', flagKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('is_feature_enabled', { p_flag_key: flagKey });
      
      if (error) {
        console.error('Error checking feature flag:', error);
        return false;
      }
      return data as boolean;
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}

/**
 * Hook to get all feature flags the current user can see
 * Uses the RPC function for proper access control
 */
export function useFeatureFlags() {
  return useQuery({
    queryKey: ['feature-flags'],
    queryFn: async () => {
      // Use the secure RPC function that respects platform owner separation
      const { data, error } = await supabase
        .rpc('get_visible_feature_flags');
      
      if (error) throw error;
      
      // Sort by category then flag_key
      return (data as FeatureFlag[]).sort((a, b) => {
        const catCompare = (a.category || 'general').localeCompare(b.category || 'general');
        if (catCompare !== 0) return catCompare;
        return a.flag_key.localeCompare(b.flag_key);
      });
    },
  });
}

/**
 * Hook to update a feature flag
 */
export function useUpdateFeatureFlag() {
  const queryClient = useQueryClient();
  const { adminUser } = useAdminAuth();

  return useMutation({
    mutationFn: async ({ flagKey, flagValue }: { flagKey: string; flagValue: boolean }) => {
      const { error } = await supabase
        .from('feature_flags')
        .update({ 
          flag_value: flagValue,
          updated_by: adminUser?.id,
          updated_at: new Date().toISOString()
        })
        .eq('flag_key', flagKey);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
      queryClient.invalidateQueries({ queryKey: ['feature-flag', variables.flagKey] });
      queryClient.invalidateQueries({ queryKey: ['feature-flag-audit-logs'] });
    },
  });
}

/**
 * Hook to get platform settings (platform owners only)
 */
export function usePlatformSettings() {
  return useQuery({
    queryKey: ['platform-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*')
        .order('setting_key', { ascending: true });
      
      if (error) {
        // If user doesn't have access, return empty array
        if (error.code === 'PGRST116') return [];
        throw error;
      }
      return data as PlatformSetting[];
    },
  });
}

/**
 * Hook to update a platform setting
 */
export function useUpdatePlatformSetting() {
  const queryClient = useQueryClient();
  const { adminUser } = useAdminAuth();

  return useMutation({
    mutationFn: async ({ 
      settingKey, 
      settingValue 
    }: { 
      settingKey: string; 
      settingValue: Record<string, unknown>;
    }) => {
      const { error } = await supabase
        .from('platform_settings')
        .update({ 
          setting_value: settingValue as unknown as import('@/integrations/supabase/types').Json,
          updated_by: adminUser?.id,
          updated_at: new Date().toISOString()
        })
        .eq('setting_key', settingKey);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
    },
  });
}

/**
 * Hook to check if current user is a platform owner
 */
export function useIsPlatformOwner() {
  const { adminUser } = useAdminAuth();
  
  return useQuery({
    queryKey: ['is-platform-owner', adminUser?.id],
    queryFn: async () => {
      if (!adminUser?.id) return false;
      
      const { data, error } = await supabase
        .rpc('is_platform_owner');
      
      if (error) {
        console.error('Error checking platform owner status:', error);
        return false;
      }
      return data as boolean;
    },
    enabled: !!adminUser?.id,
  });
}

/**
 * Hook to get feature flag audit logs
 */
export function useFeatureFlagAuditLogs(limit: number = 50) {
  return useQuery({
    queryKey: ['feature-flag-audit-logs', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flag_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) {
        // If no access, return empty
        if (error.code === 'PGRST116') return [];
        throw error;
      }
      return data as FeatureFlagAuditLog[];
    },
  });
}

/**
 * Hook to get all customers (platform owners only)
 */
export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name', { ascending: true });
      
      if (error) {
        if (error.code === 'PGRST116') return [];
        throw error;
      }
      return data as Customer[];
    },
  });
}

/**
 * Hook to get current admin's customer
 */
export function useCurrentCustomer() {
  return useQuery({
    queryKey: ['current-customer'],
    queryFn: async () => {
      const { data: customerId, error: rpcError } = await supabase
        .rpc('current_customer_id');
      
      if (rpcError || !customerId) return null;
      
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .maybeSingle();
      
      if (error) return null;
      return data as Customer | null;
    },
  });
}

/**
 * Helper to group flags by category
 */
export function groupFlagsByCategory(flags: FeatureFlag[]): Record<string, FeatureFlag[]> {
  return flags.reduce((acc, flag) => {
    const category = flag.category || 'general';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(flag);
    return acc;
  }, {} as Record<string, FeatureFlag[]>);
}

/**
 * Category display names
 */
export const CATEGORY_LABELS: Record<string, string> = {
  platform: '⚙️ Plateforme',
  auth: '🔐 Authentification',
  drivers: '👤 Conducteurs',
  loans: '💰 Prêts',
  rentals: '🚗 Locations',
  scoring: '📊 Scoring',
  notifications: '🔔 Notifications',
  gamification: '🏆 Gamification (Premium)',
  fleet: '🛰️ Gestion de flotte (Premium)',
  analytics: '📈 Analytiques (Premium)',
  finance: '💳 Finance avancée (Premium)',
  communication: '💬 Communication (Premium)',
  integration: '🔗 Intégrations (Premium)',
  branding: '🎨 Marque blanche (Premium)',
  ai_premium: '🤖 Intelligence Artificielle (Premium)',
  ownership: '🏠 Rent-to-Own (Premium)',
  mechanic: '🔧 Atelier Mécanique (Premium)',
  marketplace: '🏪 Marketplace Véhicules (Premium)',
  general: 'Général',
};

/**
 * Feature tier definitions for packaging
 */
export const FEATURE_TIERS = {
  base: {
    label: 'Base',
    description: 'Fonctionnalités incluses dans le forfait de base',
    categories: ['auth', 'drivers', 'loans', 'rentals', 'scoring', 'notifications'],
  },
  premium: {
    label: 'Premium',
    description: 'Fonctionnalités avancées facturées en supplément',
    categories: ['gamification', 'fleet', 'analytics', 'finance', 'communication', 'integration', 'branding', 'ai_premium', 'ownership', 'mechanic', 'marketplace'],
  },
  platform: {
    label: 'Plateforme',
    description: 'Réservé aux propriétaires de la plateforme',
    categories: ['platform'],
  },
} as const;

export type FeatureTier = keyof typeof FEATURE_TIERS;

export function getFlagTier(category: string): FeatureTier {
  for (const [tier, config] of Object.entries(FEATURE_TIERS)) {
    if ((config.categories as readonly string[]).includes(category)) return tier as FeatureTier;
  }
  return 'base';
}
