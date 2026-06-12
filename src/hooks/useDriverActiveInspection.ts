import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { useDriverId } from './useDriverData';
import { effectiveStatus, type FleetControlStatus } from '@/lib/fleetControl';

export interface DriverActiveInspection {
  id: string;
  status: FleetControlStatus;
  effective_status: FleetControlStatus;
  due_at: string;
  submitted_at: string | null;
  rejection_reason: string | null;
  immobilization_state: string;
  vehicle_id: string;
}

const RELEVANT_STATUSES = ['pending', 'submitted', 'rejected', 'overdue', 'blocked', 'approved'];

/**
 * Returns the driver's most-relevant open Fleet Control inspection, or null.
 * Used by BottomNav and Home to surface the Contrôle entry-point.
 */
export function useDriverActiveInspection() {
  const { data: driverId } = useDriverId();
  return useQuery({
    queryKey: ['driver-active-inspection', driverId],
    queryFn: async (): Promise<DriverActiveInspection | null> => {
      if (!driverId) return null;
      const { data, error } = await (supabase as any)
        .from('vehicle_inspections')
        .select('id,status,due_at,submitted_at,rejection_reason,immobilization_state,vehicle_id')
        .eq('driver_id', driverId)
        .in('status', RELEVANT_STATUSES)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        effective_status: effectiveStatus(data.status as FleetControlStatus, data.due_at),
      };
    },
    enabled: !!driverId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}