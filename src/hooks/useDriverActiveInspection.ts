import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { useDriverId } from './useDriverData';
import { useRealtimePostgresChanges } from './useRealtimePostgresChanges';
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
  const queryClient = useQueryClient();

  // FC-D5: realtime is the primary refresh path — an admin approval/rejection
  // updates the nav badge and home card immediately. RLS limits events to the
  // driver's own rows; the filter is belt-and-braces.
  useRealtimePostgresChanges<{ driver_id?: string }>(
    'vehicle_inspections',
    '*',
    (p) => (p.new?.driver_id ?? p.old?.driver_id) === driverId,
    () => queryClient.invalidateQueries({ queryKey: ['driver-active-inspection', driverId] }),
    !!driverId,
  );

  return useQuery({
    queryKey: ['driver-active-inspection', driverId],
    queryFn: async (): Promise<DriverActiveInspection | null> => {
      if (!driverId) return null;
      // Fetch all relevant inspections, then pick the most actionable one in JS.
      // Sorting purely by updated_at can surface an already-approved row when
      // an admin action (e.g. Relancer) bumps its timestamp, hiding a newer
      // pending/rejected/overdue cycle the driver actually needs to act on.
      const { data: rows, error } = await (supabase as any)
        .from('vehicle_inspections')
        .select('id,status,due_at,submitted_at,rejection_reason,immobilization_state,vehicle_id,created_at,updated_at')
        .eq('driver_id', driverId)
        .in('status', RELEVANT_STATUSES)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      if (!rows || rows.length === 0) return null;

      // Priority: actionable (pending/rejected/overdue/blocked) > submitted > approved.
      const priority: Record<string, number> = {
        rejected: 0, overdue: 0, blocked: 0, pending: 1,
        submitted: 2, approved: 3,
      };
      const sorted = [...rows].sort((a, b) => {
        const pa = priority[a.status] ?? 9;
        const pb = priority[b.status] ?? 9;
        if (pa !== pb) return pa - pb;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      const data = sorted[0];
      return {
        ...data,
        effective_status: effectiveStatus(data.status as FleetControlStatus, data.due_at),
      };
    },
    enabled: !!driverId,
    // Slow fallback poll for dropped websockets — realtime does the live work.
    refetchInterval: 5 * 60_000,
    staleTime: 30_000,
  });
}