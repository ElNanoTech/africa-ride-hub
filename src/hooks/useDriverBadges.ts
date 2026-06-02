import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { useDriverId } from '@/hooks/useDriverData';
import { useDailyStreak } from '@/hooks/useDailyStreak';
import { useEffect } from 'react';

interface BadgeDefinition {
  id: string;
  badge_key: string;
  name_fr: string;
  description_fr: string;
  icon: string;
  category: string;
  milestone_type: string;
  milestone_value: number;
  tier: string | null;
  sort_order: number;
}

interface DriverBadge {
  id: string;
  driver_id: string;
  badge_id: string;
  earned_at: string;
  seen: boolean;
}

export interface BadgeWithStatus extends BadgeDefinition {
  earned: boolean;
  earned_at: string | null;
  seen: boolean;
  driver_badge_id: string | null;
}

export function useBadgeDefinitions() {
  return useQuery({
    queryKey: ['badgeDefinitions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('badge_definitions')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return data as BadgeDefinition[];
    },
  });
}

export function useDriverBadges() {
  const { data: driverId } = useDriverId();

  return useQuery({
    queryKey: ['driverBadges', driverId],
    queryFn: async () => {
      if (!driverId) return [];
      const { data, error } = await supabase
        .from('driver_badges')
        .select('*')
        .eq('driver_id', driverId);
      if (error) throw error;
      return data as DriverBadge[];
    },
    enabled: !!driverId,
  });
}

export function useBadgesWithStatus(): {
  badges: BadgeWithStatus[];
  isLoading: boolean;
  earnedCount: number;
  totalCount: number;
  unseenCount: number;
} {
  const { data: definitions = [], isLoading: defsLoading } = useBadgeDefinitions();
  const { data: earned = [], isLoading: earnedLoading } = useDriverBadges();

  const badges: BadgeWithStatus[] = definitions.map((def) => {
    const match = earned.find((e) => e.badge_id === def.id);
    return {
      ...def,
      earned: !!match,
      earned_at: match?.earned_at ?? null,
      seen: match?.seen ?? true,
      driver_badge_id: match?.id ?? null,
    };
  });

  return {
    badges,
    isLoading: defsLoading || earnedLoading,
    earnedCount: badges.filter((b) => b.earned).length,
    totalCount: badges.length,
    unseenCount: badges.filter((b) => b.earned && !b.seen).length,
  };
}

export function useMarkBadgeSeen() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (driverBadgeId: string) => {
      const { error } = await supabase
        .from('driver_badges')
        .update({ seen: true })
        .eq('id', driverBadgeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driverBadges'] });
    },
  });
}

/**
 * Checks milestones and awards badges the driver hasn't earned yet.
 * Runs once per session.
 */
export function useBadgeChecker() {
  const { data: driverId } = useDriverId();
  const { badges } = useBadgesWithStatus();
  const { streak } = useDailyStreak();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!driverId || badges.length === 0) return;

    const checkAndAward = async () => {
      const unearnedKeys = badges.filter((b) => !b.earned).map((b) => b.badge_key);
      if (unearnedKeys.length === 0) return;

      const toAward: string[] = [];

      // Check streak badges
      if (streak >= 3 && unearnedKeys.includes('streak_3')) toAward.push('streak_3');
      if (streak >= 7 && unearnedKeys.includes('streak_7')) toAward.push('streak_7');
      if (streak >= 14 && unearnedKeys.includes('streak_14')) toAward.push('streak_14');
      if (streak >= 30 && unearnedKeys.includes('streak_30')) toAward.push('streak_30');

      // Check first_login
      if (unearnedKeys.includes('first_login')) toAward.push('first_login');

      // Check rental count
      if (unearnedKeys.includes('first_rental')) {
        const { count } = await supabase
          .from('rentals')
          .select('*', { count: 'exact', head: true })
          .eq('driver_id', driverId);
        if ((count ?? 0) >= 1) toAward.push('first_rental');
      }

      // Check on-time payments
      const paymentBadges = ['payments_5', 'payments_10', 'payments_25'].filter((k) =>
        unearnedKeys.includes(k)
      );
      if (paymentBadges.length > 0) {
        const { count } = await supabase
          .from('payments')
          .select('*', { count: 'exact', head: true })
          .eq('driver_id', driverId)
          .eq('status', 'paid');
        const paidCount = count ?? 0;
        if (paidCount >= 5 && unearnedKeys.includes('payments_5')) toAward.push('payments_5');
        if (paidCount >= 10 && unearnedKeys.includes('payments_10')) toAward.push('payments_10');
        if (paidCount >= 25 && unearnedKeys.includes('payments_25')) toAward.push('payments_25');
      }

      // Check tier badges
      const tierBadges = ['tier_c', 'tier_b', 'tier_a'].filter((k) => unearnedKeys.includes(k));
      if (tierBadges.length > 0) {
        const { data: scores } = await supabase
          .from('credit_scores')
          .select('tier')
          .eq('driver_id', driverId)
          .order('calculation_week', { ascending: false })
          .limit(1);
        const currentTier = scores?.[0]?.tier;
        const tierOrder: Record<string, number> = { E: 1, D: 2, C: 3, B: 4, A: 5 };
        const currentRank = tierOrder[currentTier ?? 'E'] ?? 0;
        if (currentRank >= 3 && unearnedKeys.includes('tier_c')) toAward.push('tier_c');
        if (currentRank >= 4 && unearnedKeys.includes('tier_b')) toAward.push('tier_b');
        if (currentRank >= 5 && unearnedKeys.includes('tier_a')) toAward.push('tier_a');
      }

      // Check KYC
      if (unearnedKeys.includes('kyc_approved')) {
        const { data: driver } = await supabase
          .from('drivers')
          .select('kyc_status')
          .eq('id', driverId)
          .single();
        if (driver?.kyc_status === 'approved') toAward.push('kyc_approved');
      }

      // Check first income
      if (unearnedKeys.includes('first_income')) {
        const { count } = await supabase
          .from('income_records')
          .select('*', { count: 'exact', head: true })
          .eq('driver_id', driverId);
        if ((count ?? 0) >= 1) toAward.push('first_income');
      }

      // Award badges
      if (toAward.length > 0) {
        const badgeIds = badges
          .filter((b) => toAward.includes(b.badge_key))
          .map((b) => ({
            driver_id: driverId,
            badge_id: b.id,
          }));

        await supabase.from('driver_badges').upsert(badgeIds, {
          onConflict: 'driver_id,badge_id',
        });

        queryClient.invalidateQueries({ queryKey: ['driverBadges'] });
      }
    };

    // Small delay to not block render
    const timer = setTimeout(checkAndAward, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId, badges.length, streak]);
}
