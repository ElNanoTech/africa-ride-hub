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
  | 'invoice'
  | 'credit_scores'
  | 'driver_scores'
  | 'driver_score_events'
  | 'driver_wallets'
  | 'driver_wallet_transactions'
  | 'credit_collections_cases'
  | 'credit_collection_actions'
  | 'credit_promises_to_pay'
  | 'credit_reminders'
  | 'credit_risk_escalations'
  | 'credit_default_reviews'
  | 'credit_default_evidence'
  | 'credit_default_decisions'
  | 'credit_recovery_plans'
  | 'credit_asset_protection_reviews'
  | 'credit_default_notices'
  | 'credit_default_audit_events'
  | 'support_tickets'
  | 'kyc_submissions'
  | 'maintenance_orders'
  | 'vehicle_inspections'
  | 'vehicle_positions'
  | 'accidents'
  | 'traffic_violations'
  | 'rent_to_own_contracts'
  | 'other_charges';

interface RealtimeConfig {
  tables: RealtimeTableName[];
  showToasts?: boolean;
  enabled?: boolean;
}

const tableToQueryKeyMap: Record<RealtimeTableName, string[]> = {
  drivers: ['admin-drivers', 'admin-stats', 'vehicle-operations', 'trust-risk', 'growth-ownership'],
  vehicles: ['admin-vehicles', 'admin-stats', 'vehicle-operations', 'growth-ownership'],
  rentals: ['admin-rentals', 'admin-stats', 'vehicle-operations', 'growth-ownership'],
  loans: ['admin-loans', 'admin-stats', 'growth-ownership'],
  payments: ['admin-payments', 'admin-stats', 'trust-risk', 'growth-ownership'],
  invoice: ['billing', 'financial-operations', 'growth-ownership'],
  credit_scores: ['admin-score-distribution', 'admin-score-trends', 'trust-risk', 'growth-ownership'],
  driver_scores: ['trust-risk', 'growth-ownership'],
  driver_score_events: ['driver-score-events', 'trust-risk', 'growth-ownership'],
  driver_wallets: ['wallets', 'financial-operations', 'growth-ownership'],
  driver_wallet_transactions: ['wallets', 'financial-operations', 'growth-ownership'],
  credit_collections_cases: ['admin-credit-collections', 'financial-operations', 'admin-attention-center', 'trust-risk', 'growth-ownership'],
  credit_collection_actions: ['admin-credit-collections', 'admin-attention-center', 'growth-ownership'],
  credit_promises_to_pay: ['admin-credit-collections', 'admin-attention-center', 'financial-operations', 'growth-ownership'],
  credit_reminders: ['admin-credit-collections', 'admin-attention-center', 'growth-ownership'],
  credit_risk_escalations: ['admin-credit-collections', 'admin-attention-center', 'trust-risk', 'growth-ownership'],
  credit_default_reviews: ['admin-credit-defaults', 'admin-credit-collections', 'admin-attention-center', 'trust-risk', 'growth-ownership'],
  credit_default_evidence: ['admin-credit-defaults', 'admin-attention-center'],
  credit_default_decisions: ['admin-credit-defaults', 'admin-attention-center', 'trust-risk', 'growth-ownership'],
  credit_recovery_plans: ['admin-credit-defaults', 'admin-attention-center', 'growth-ownership'],
  credit_asset_protection_reviews: ['admin-credit-defaults', 'admin-attention-center', 'trust-risk', 'vehicle-operations'],
  credit_default_notices: ['admin-credit-defaults', 'admin-attention-center'],
  credit_default_audit_events: ['admin-credit-defaults', 'admin-attention-center', 'trust-risk'],
  support_tickets: ['admin-tickets', 'admin-stats'],
  kyc_submissions: ['admin-kyc', 'admin-drivers', 'admin-stats', 'trust-risk', 'growth-ownership'],
  maintenance_orders: ['maintenance', 'vehicle-operations'],
  vehicle_inspections: ['fleet-control', 'vehicle-operations', 'trust-risk', 'growth-ownership'],
  vehicle_positions: ['vehicle-positions', 'vehicle-operations'],
  accidents: ['admin-accidents', 'vehicle-operations', 'trust-risk', 'growth-ownership'],
  traffic_violations: ['contraventions', 'vehicle-operations', 'trust-risk', 'growth-ownership'],
  rent_to_own_contracts: ['rent-to-own-contracts', 'growth-ownership'],
  other_charges: ['maintenance', 'vehicle-operations'],
};

const tableLabels: Record<RealtimeTableName, string> = {
  drivers: 'Chauffeur',
  vehicles: 'Véhicule',
  rentals: 'Location',
  loans: 'Prêt',
  payments: 'Paiement',
  invoice: 'Facture',
  credit_scores: 'Score',
  driver_scores: 'Score conducteur',
  driver_score_events: 'Evenement score',
  driver_wallets: 'Portefeuille',
  driver_wallet_transactions: 'Transaction portefeuille',
  credit_collections_cases: 'Dossier collections',
  credit_collection_actions: 'Action collections',
  credit_promises_to_pay: 'Promesse de paiement',
  credit_reminders: 'Rappel credit',
  credit_risk_escalations: 'Escalade risque credit',
  credit_default_reviews: 'Revision defaut',
  credit_default_evidence: 'Piece defaut',
  credit_default_decisions: 'Decision defaut',
  credit_recovery_plans: 'Plan de regularisation',
  credit_asset_protection_reviews: 'Revue protection actif',
  credit_default_notices: 'Notification defaut',
  credit_default_audit_events: 'Audit defaut',
  support_tickets: 'Ticket',
  kyc_submissions: 'KYC',
  maintenance_orders: 'Maintenance',
  vehicle_inspections: 'Controle vehicule',
  vehicle_positions: 'GPS',
  accidents: 'Sinistre',
  traffic_violations: 'Contravention',
  rent_to_own_contracts: 'Contrat propriete',
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
