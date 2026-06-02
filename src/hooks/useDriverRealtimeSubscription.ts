import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { toast } from 'sonner';
import { useDriverId } from './useDriverData';
import { triggerConfetti } from './useConfetti';

type DriverTableName = 'notifications' | 'loans' | 'rentals' | 'payments' | 'support_tickets' | 'support_ticket_messages' | 'credit_scores' | 'driver_scores' | 'kyc_submissions' | 'vehicles';

interface DriverRealtimeConfig {
  tables: DriverTableName[];
  showToasts?: boolean;
}

const tableToQueryKeyMap: Record<DriverTableName, string[]> = {
  notifications: ['driverNotifications'],
  loans: ['driverLoans'],
  rentals: ['driverRentals'],
  payments: ['driverPayments'],
  support_tickets: ['driverSupportTickets'],
  support_ticket_messages: ['driverSupportTickets'],
  credit_scores: ['driverCreditScores'],
  driver_scores: ['driverCurrentScore', 'driverCreditScores'],
  kyc_submissions: ['driver-kyc-submission', 'driverProfile'],
  vehicles: ['driverVehicles', 'driverRentals'],
};

const tableLabels: Record<DriverTableName, string> = {
  notifications: 'Notification',
  loans: 'Prêt',
  rentals: 'Location',
  payments: 'Paiement',
  support_tickets: 'Ticket',
  support_ticket_messages: 'Message',
  credit_scores: 'Score',
  driver_scores: 'Score',
  kyc_submissions: 'KYC',
  vehicles: 'Véhicule',
};

// Tables that don't have a driver_id column — subscribe without filter
const TABLES_WITHOUT_DRIVER_FILTER: DriverTableName[] = ['support_ticket_messages', 'vehicles'];

const eventLabels = {
  INSERT: 'reçu',
  UPDATE: 'mis à jour',
  DELETE: 'supprimé',
};

export function useDriverRealtimeSubscription({ tables, showToasts = true }: DriverRealtimeConfig) {
  const queryClient = useQueryClient();
  const { data: driverId } = useDriverId();

  useEffect(() => {
    if (!driverId) return;

    const channel = supabase.channel(`driver-realtime-${driverId}`);

    // Subscribe to each table
    tables.forEach(table => {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: TABLES_WITHOUT_DRIVER_FILTER.includes(table) ? undefined : `driver_id=eq.${driverId}`,
        },
        (payload) => {
          const tableName = (payload.table as DriverTableName) || table;
          const event = payload.eventType;

          // Invalidate related queries
          tableToQueryKeyMap[tableName]?.forEach(key => {
            queryClient.invalidateQueries({ queryKey: [key] });
          });

          // Belt-and-suspenders: when a rental_status notification lands,
          // also refresh rentals/vehicles so the driver sees the status flip
          // immediately even if the rentals broadcast is briefly delayed.
          if (tableName === 'notifications' && event === 'INSERT') {
            const newNotif = payload.new as { notification_type?: string };
            if (newNotif?.notification_type === 'rental_status') {
              queryClient.invalidateQueries({ queryKey: ['driverRentals'] });
              queryClient.invalidateQueries({ queryKey: ['driverVehicles'] });
              queryClient.invalidateQueries({ queryKey: ['driverPayments'] });
            }
          }

          // Special handling for KYC status changes
          if (tableName === 'kyc_submissions' && event === 'UPDATE') {
            const newRecord = payload.new as { status?: string };
            if (newRecord.status === 'approved' || newRecord.status === 'verified') {
              // Trigger confetti celebration!
              triggerConfetti();
              
              toast.success('🎉 KYC Approuvé!', {
                description: 'Votre identité a été vérifiée. Vous pouvez maintenant louer des véhicules!',
                duration: 6000,
                position: 'top-center',
              });
            } else if (newRecord.status === 'rejected') {
              toast.error('KYC Refusé', {
                description: 'Veuillez vérifier les détails et soumettre à nouveau.',
                duration: 6000,
                position: 'top-center',
              });
            }
          }

          // Celebrate rental approval with a clear, actionable toast.
          if (tableName === 'rentals' && event === 'UPDATE') {
            const newRecord = payload.new as { status?: string };
            const oldRecord = payload.old as { status?: string };
            if (oldRecord?.status === 'pending' && newRecord?.status === 'active') {
              toast.success('🚗 Location approuvée!', {
                description: 'Votre véhicule est prêt. Consultez les détails.',
                duration: 5000,
                position: 'top-center',
              });
            }
          }

          // Show toast notification for new items (except KYC which has custom handling)
          if (showToasts && event === 'INSERT' && tableName !== 'kyc_submissions') {
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
  }, [queryClient, tables, showToasts, driverId]);
}

// Hook for notifications page real-time updates
export function useNotificationsRealtime() {
  useDriverRealtimeSubscription({
    tables: ['notifications'],
    showToasts: true,
  });
}

// Hook for loans page real-time updates
export function useLoansRealtime() {
  useDriverRealtimeSubscription({
    tables: ['loans', 'credit_scores', 'driver_scores'],
    showToasts: true,
  });
}


// Hook for rentals page real-time updates (also watches vehicles so the
// fleet list flips from "Disponible" to "Loué" the instant an admin approves,
// plus notifications as a safety net for instant status flips).
export function useRentalsRealtime() {
  useDriverRealtimeSubscription({
    tables: ['rentals', 'payments', 'vehicles', 'notifications'],
    showToasts: true,
  });
}

// Hook for the vehicles browsing page — watches vehicles + rentals + notifications
// so the status badges stay in sync in near real-time.
export function useVehiclesRealtime() {
  useDriverRealtimeSubscription({
    tables: ['vehicles', 'rentals', 'notifications'],
    showToasts: false,
  });
}

// Hook for support page real-time updates
export function useSupportRealtime() {
  useDriverRealtimeSubscription({
    tables: ['support_tickets', 'support_ticket_messages'],
    showToasts: true,
  });
}

// Hook for all driver data real-time updates (including KYC and vehicles)
export function useDriverDashboardRealtime() {
  useDriverRealtimeSubscription({
    tables: ['notifications', 'loans', 'rentals', 'payments', 'support_tickets', 'credit_scores', 'driver_scores', 'kyc_submissions', 'vehicles'],
    showToasts: false,
  });
}
