import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import type { DriverRiskLevel } from '@/lib/driverRisk';
import { retryUnlessMissingRpc } from '@/lib/rpcErrors';

export interface DriverRisk {
  level: DriverRiskLevel;
  reasons: string[];
  computed_at: string;
}

export interface DriverRiskSummaryRow {
  driver_id: string;
  level: DriverRiskLevel;
  reasons: string[];
  /**
   * Count of overdue payments — same "en retard" rule as /admin/payments
   * (see isPaymentOverdue() in src/lib/payments.ts; SQL twin lives in the
   * RPC). Lets the drivers list derive its overdue filter without an
   * unbounded payments companion query.
   */
  overdue_payments: number;
}

/**
 * Computed risk for one driver — `driver_risk(p_driver)` RPC (CH-B1,
 * decision D-2: computed, never stored). Used by the profile page
 * (CH-P1/P4); a driver may also call it for self.
 */
export function useDriverRisk(driverId?: string) {
  return useQuery<DriverRisk>({
    queryKey: ['driver-risk', driverId],
    enabled: !!driverId,
    staleTime: 60_000,
    // Pre-deploy the RPC may not exist (PGRST202) — retrying never helps.
    retry: retryUnlessMissingRpc,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('driver_risk', {
        p_driver: driverId as string,
      });
      if (error) throw error;
      return data as DriverRisk;
    },
  });
}

/**
 * Batched risk for the current tenant's drivers — `drivers_risk_summary()`
 * RPC (one SQL pass, sized for ~500 drivers). Used by the list page
 * (CH-L1/L2/L3).
 */
export function useDriversRiskSummary(enabled = true) {
  return useQuery<DriverRiskSummaryRow[]>({
    queryKey: ['drivers-risk-summary'],
    enabled,
    staleTime: 60_000,
    // Pre-deploy the RPC may not exist (PGRST202) — retrying never helps.
    retry: retryUnlessMissingRpc,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('drivers_risk_summary');
      if (error) throw error;
      return (data ?? []) as DriverRiskSummaryRow[];
    },
  });
}
