import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { useDriverId } from './useDriverData';
import { toast } from 'sonner';

export interface RentToOwnContract {
  id: string;
  driver_id: string;
  vehicle_id: string;
  customer_id: string | null;
  total_price: number;
  weekly_payment: number;
  contract_duration_weeks: number;
  start_date: string;
  expected_end_date: string;
  total_paid: number;
  weeks_completed: number;
  ownership_percentage: number;
  status: string;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  vehicle?: {
    id: string;
    model_name: string;
    license_plate: string;
    vehicle_type: string;
    image_url: string | null;
  };
  driver?: {
    id: string;
    full_name: string;
    phone_number: string;
  };
}

export interface ContractMilestone {
  id: string;
  contract_id: string;
  milestone_type: string;
  milestone_label: string;
  target_value: number;
  reached_at: string | null;
  reward_description: string | null;
  created_at: string;
}

export interface ContractPayment {
  id: string;
  contract_id: string;
  amount: number;
  payment_date: string;
  week_number: number;
  status: string;
  wave_transaction_id: string | null;
  notes: string | null;
  created_at: string;
}

// Driver: get my active rent-to-own contract
export function useDriverRentToOwnContract() {
  const { data: driverId } = useDriverId();

  return useQuery({
    queryKey: ['driver-rto-contract', driverId],
    queryFn: async () => {
      if (!driverId) return null;

      const { data, error } = await supabase
        .from('rent_to_own_contracts')
        .select(`
          *,
          vehicle:vehicles(id, model_name, license_plate, vehicle_type, image_url)
        `)
        .eq('driver_id', driverId)
        .in('status', ['active', 'pending'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as RentToOwnContract | null;
    },
    enabled: !!driverId,
  });
}

// Driver: get milestones for a contract
export function useContractMilestones(contractId: string | undefined) {
  return useQuery({
    queryKey: ['contract-milestones', contractId],
    queryFn: async () => {
      if (!contractId) return [];

      const { data, error } = await supabase
        .from('contract_milestones')
        .select('*')
        .eq('contract_id', contractId)
        .order('target_value', { ascending: true });

      if (error) throw error;
      return data as ContractMilestone[];
    },
    enabled: !!contractId,
  });
}

// Driver: get payment history for a contract
export function useContractPayments(contractId: string | undefined) {
  return useQuery({
    queryKey: ['contract-payments', contractId],
    queryFn: async () => {
      if (!contractId) return [];

      const { data, error } = await supabase
        .from('contract_payments')
        .select('*')
        .eq('contract_id', contractId)
        .order('week_number', { ascending: false });

      if (error) throw error;
      return data as ContractPayment[];
    },
    enabled: !!contractId,
  });
}

// Admin: get all contracts
export function useAdminRentToOwnContracts(statusFilter?: string) {
  return useQuery({
    queryKey: ['admin-rto-contracts', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('rent_to_own_contracts')
        .select(`
          *,
          vehicle:vehicles(id, model_name, license_plate, vehicle_type, image_url),
          driver:drivers(id, full_name, phone_number)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as RentToOwnContract[];
    },
  });
}

// Admin: create a new contract
export function useCreateRentToOwnContract() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contract: {
      driver_id: string;
      vehicle_id: string;
      total_price: number;
      weekly_payment: number;
      contract_duration_weeks?: number;
      start_date: string;
      expected_end_date: string;
      customer_id?: string;
    }) => {
      // Create contract
      const { data, error } = await supabase
        .from('rent_to_own_contracts')
        .insert(contract)
        .select()
        .single();

      if (error) throw error;

      // Create default milestones
      const milestones = [
        { milestone_type: '25_percent', milestone_label: '25% - Premier quart', target_value: 25, reward_description: '🎉 Bravo! Un quart du chemin parcouru vers la propriété!' },
        { milestone_type: '50_percent', milestone_label: '50% - Mi-parcours', target_value: 50, reward_description: '🏆 À mi-chemin! Le véhicule est presque à vous!' },
        { milestone_type: '75_percent', milestone_label: '75% - Dernier virage', target_value: 75, reward_description: '🚀 Plus que 25%! La ligne d\'arrivée est en vue!' },
        { milestone_type: 'year_1', milestone_label: 'Année 1 complétée', target_value: 33.33, reward_description: '📅 Première année terminée avec succès!' },
        { milestone_type: 'year_2', milestone_label: 'Année 2 complétée', target_value: 66.66, reward_description: '📅 Deux ans de service exemplaire!' },
        { milestone_type: '100_percent', milestone_label: '100% - Propriétaire!', target_value: 100, reward_description: '🎊🚗 FÉLICITATIONS! Le véhicule est officiellement à vous!' },
      ];

      await supabase
        .from('contract_milestones')
        .insert(milestones.map(m => ({ ...m, contract_id: data.id })));

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rto-contracts'] });
      toast.success('Contrat Rent-to-Own créé avec succès!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la création du contrat');
    },
  });
}

// Admin: record a payment
export function useRecordContractPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payment: {
      contract_id: string;
      amount: number;
      week_number: number;
      status?: string;
      payment_date?: string;
    }) => {
      // Insert payment
      const { error: payError } = await supabase
        .from('contract_payments')
        .insert(payment);

      if (payError) throw payError;

      // Update contract totals
      const { data: contract } = await supabase
        .from('rent_to_own_contracts')
        .select('total_paid, total_price, contract_duration_weeks, weeks_completed')
        .eq('id', payment.contract_id)
        .single();

      if (contract) {
        const newTotalPaid = contract.total_paid + payment.amount;
        const newWeeksCompleted = contract.weeks_completed + 1;
        const newPercentage = Math.min((newTotalPaid / contract.total_price) * 100, 100);
        const isComplete = newPercentage >= 100;

        await supabase
          .from('rent_to_own_contracts')
          .update({
            total_paid: newTotalPaid,
            weeks_completed: newWeeksCompleted,
            ownership_percentage: Math.round(newPercentage * 100) / 100,
            status: isComplete ? 'completed' : 'active',
            completed_at: isComplete ? new Date().toISOString() : null,
          })
          .eq('id', payment.contract_id);

        // Check and update milestones
        const { data: milestones } = await supabase
          .from('contract_milestones')
          .select('*')
          .eq('contract_id', payment.contract_id)
          .is('reached_at', null);

        if (milestones) {
          for (const milestone of milestones) {
            if (newPercentage >= milestone.target_value) {
              await supabase
                .from('contract_milestones')
                .update({ reached_at: new Date().toISOString() })
                .eq('id', milestone.id);
            }
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rto-contracts'] });
      queryClient.invalidateQueries({ queryKey: ['driver-rto-contract'] });
      queryClient.invalidateQueries({ queryKey: ['contract-milestones'] });
      queryClient.invalidateQueries({ queryKey: ['contract-payments'] });
      toast.success('Paiement enregistré!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de l\'enregistrement du paiement');
    },
  });
}
