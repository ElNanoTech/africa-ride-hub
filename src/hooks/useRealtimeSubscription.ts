import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { toast } from 'sonner';

export type RealtimeTableName =
  | 'drivers'
  | 'vehicles'
  | 'rentals'
  | 'loans'
  | 'payments'
  | 'credit_scores'
  | 'driver_scores'
  | 'driver_score_events'
  | 'support_tickets'
  | 'kyc_submissions'
  | 'maintenance_orders'
  | 'vehicle_inspections'
  | 'vehicle_positions'
  | 'accidents'
  | 'traffic_violations'
  | 'other_charges';

interface RealtimeConfig {
  tables: RealtimeTableName[];
  showToasts?: boolean;
  enabled?: boolean;
}

const tableToQueryKeyMap: Record<RealtimeTableName, string[]> = {
  drivers: ['admin-drivers', 'admin-stats', 'vehicle-operations', 'trust-risk'],
  vehicles: ['admin-vehicles', 'admin-stats', 'vehicle-operations'],
  rentals: ['admin-rentals', 'admin-stats', 'vehicle-operations'],
  loans: ['admin-loans', 'admin-stats'],
  payments: ['admin-payments', 'admin-stats', 'trust-risk'],
  credit_scores: ['admin-score-distribution', 'admin-score-trends', 'trust-risk'],
  driver_scores: ['trust-risk'],
  driver_score_events: ['driver-score-events', 'trust-risk'],
  support_tickets: ['admin-tickets', 'admin-stats'],
  kyc_submissions: ['admin-kyc', 'admin-drivers', 'admin-stats', 'trust-risk'],
  maintenance_orders: ['maintenance', 'vehicle-operations'],
  vehicle_inspections: ['fleet-control', 'vehicle-operations', 'trust-risk'],
  vehicle_positions: ['vehicle-positions', 'vehicle-operations'],
  accidents: ['admin-accidents', 'vehicle-operations', 'trust-risk'],
  traffic_violations: ['contraventions', 'vehicle-operations', 'trust-risk'],
  other_charges: ['maintenance', 'vehicle-operations'],
};

const tableLabels: Record<RealtimeTableName, string> = {
  drivers: 'Chauffeur',
  vehicles: 'Véhicule',
  rentals: 'Location',
  loans: 'Prêt',
  payments: 'Paiement',
  credit_scores: 'Score',
  driver_scores: 'Score conducteur',
  driver_score_events: 'Evenement score',
  support_tickets: 'Ticket',
  kyc_submissions: 'KYC',
  maintenance_orders: 'Maintenance',
  vehicle_inspections: 'Controle vehicule',
  vehicle_positions: 'GPS',
  accidents: 'Sinistre',
  traffic_violations: 'Contravention',
  other_charges: 'Charge',
};

const eventLabels = {
  INSERT: 'ajouté',
  UPDATE: 'mis à jour',
  DELETE: 'supprimé',
};

export function useRealtimeSubscription({ tables, showToasts = true, enabled = true }: RealtimeConfig) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || tables.length === 0) return;

    const channel = supabase
      .channel('admin-realtime-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tables[0],
        },
        (payload) => {
          const table = payload.table as RealtimeTableName;
          const event = payload.eventType;
          
          // Invalidate related queries
          tableToQueryKeyMap[table]?.forEach(key => {
            queryClient.invalidateQueries({ queryKey: [key] });
          });

          // Show toast notification
          if (showToasts && event !== 'DELETE') {
            const label = tableLabels[table] || table;
            const action = eventLabels[event] || event;
            toast.info(`${label} ${action}`, {
              duration: 3000,
              position: 'bottom-right',
            });
          }
        }
      );

    // Subscribe to all specified tables
    tables.slice(1).forEach(table => {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
        },
        (payload) => {
          const tableName = payload.table as RealtimeTableName;
          const event = payload.eventType;
          
          // Invalidate related queries
          tableToQueryKeyMap[tableName]?.forEach(key => {
            queryClient.invalidateQueries({ queryKey: [key] });
          });

          // Show toast notification
          if (showToasts && event !== 'DELETE') {
            const label = tableLabels[tableName] || tableName;
            const action = eventLabels[event] || event;
            toast.info(`${label} ${action}`, {
              duration: 3000,
              position: 'bottom-right',
            });
          }
        }
      );
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient, tables, showToasts]);
}

// Hook for dashboard real-time updates
export function useDashboardRealtime() {
  useRealtimeSubscription({
    tables: ['drivers', 'rentals', 'loans', 'payments', 'support_tickets', 'kyc_submissions'],
    showToasts: true,
  });
}

// Hook for specific table real-time updates
export function useTableRealtime(table: RealtimeTableName, showToasts = false) {
  useRealtimeSubscription({
    tables: [table],
    showToasts,
  });
}
