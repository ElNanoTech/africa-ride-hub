import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { toast } from 'sonner';

type TableName = 'drivers' | 'vehicles' | 'rentals' | 'loans' | 'payments' | 'support_tickets' | 'kyc_submissions';

interface RealtimeConfig {
  tables: TableName[];
  showToasts?: boolean;
}

const tableToQueryKeyMap: Record<TableName, string[]> = {
  drivers: ['admin-drivers', 'admin-stats'],
  vehicles: ['admin-vehicles', 'admin-stats'],
  rentals: ['admin-rentals', 'admin-stats'],
  loans: ['admin-loans', 'admin-stats'],
  payments: ['admin-payments', 'admin-stats'],
  support_tickets: ['admin-tickets', 'admin-stats'],
  kyc_submissions: ['admin-kyc', 'admin-drivers', 'admin-stats'],
};

const tableLabels: Record<TableName, string> = {
  drivers: 'Chauffeur',
  vehicles: 'Véhicule',
  rentals: 'Location',
  loans: 'Prêt',
  payments: 'Paiement',
  support_tickets: 'Ticket',
  kyc_submissions: 'KYC',
};

const eventLabels = {
  INSERT: 'ajouté',
  UPDATE: 'mis à jour',
  DELETE: 'supprimé',
};

export function useRealtimeSubscription({ tables, showToasts = true }: RealtimeConfig) {
  const queryClient = useQueryClient();

  useEffect(() => {
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
          const table = payload.table as TableName;
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
          const tableName = payload.table as TableName;
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
  }, [queryClient, tables, showToasts]);
}

// Hook for dashboard real-time updates
export function useDashboardRealtime() {
  useRealtimeSubscription({
    tables: ['drivers', 'rentals', 'loans', 'payments', 'support_tickets', 'kyc_submissions'],
    showToasts: true,
  });
}

// Hook for specific table real-time updates
export function useTableRealtime(table: TableName, showToasts = false) {
  useRealtimeSubscription({
    tables: [table],
    showToasts,
  });
}
