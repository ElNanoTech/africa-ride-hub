import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { toast } from 'sonner';
import { getInvoiceErrorMessage } from '@/lib/invoiceErrors';
import type { AdminPayment } from '@/types/admin';

// Dashboard stats
export function useAdminStats() {
  return useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [driversRes, vehiclesRes, rentalsRes, loansRes, paymentsRes, ticketsRes] = await Promise.all([
        supabase.from('drivers').select('id, kyc_status, driver_status', { count: 'exact' }),
        supabase.from('vehicles').select('id, status', { count: 'exact' }),
        supabase.from('rentals').select('id, status', { count: 'exact' }),
        supabase.from('loans').select('id, status', { count: 'exact' }),
        supabase.from('payments').select('id, status', { count: 'exact' }),
        supabase.from('support_tickets').select('id, status', { count: 'exact' }),
      ]);

      const rentals = rentalsRes.data || [];
      const loans = loansRes.data || [];
      const payments = paymentsRes.data || [];
      const tickets = ticketsRes.data || [];

      // Fetch pending KYC submissions separately (more accurate than driver status)
      const { count: pendingKycCount } = await supabase
        .from('kyc_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      return {
        totalDrivers: driversRes.count || 0,
        pendingKyc: pendingKycCount || 0,
        activeRentals: rentals.filter(r => r.status === 'active' || r.status === 'approved').length,
        pendingRentals: rentals.filter(r => r.status === 'pending').length,
        pendingLoans: loans.filter(l => l.status === 'pending').length,
        overduePayments: payments.filter(p => p.status === 'overdue').length,
        openTickets: tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length,
      };
    },
  });
}

// Drivers
export function useDrivers() {
  return useQuery({
    queryKey: ['admin-drivers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select(`
          *,
          credit_scores(score, tier),
          kyc_submissions(id, status, submitted_at, rejection_reason)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      return data?.map(driver => {
        // Get the latest KYC submission
        const latestKyc = driver.kyc_submissions?.sort((a: any, b: any) => 
          new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
        )[0] || null;
        
        return {
          ...driver,
          score: driver.credit_scores?.[0]?.score || null,
          tier: driver.credit_scores?.[0]?.tier || 'E',
          latestKycSubmission: latestKyc,
          hasKycSubmission: !!latestKyc,
        };
      }) || [];
    },
  });
}

export function useUpdateDriverStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ driverId, status }: { driverId: string; status: string }) => {
      const { error } = await supabase
        .from('drivers')
        .update({ driver_status: status })
        .eq('id', driverId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-drivers'] });
      toast.success('Statut mis à jour');
    },
    onError: () => {
      toast.error('Erreur lors de la mise à jour');
    },
  });
}

// Pending KYC count with real-time subscription
export function usePendingKycCount() {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ['pending-kyc-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('kyc_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 30000, // Refetch every 30 seconds as backup
  });

  // Set up real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('kyc-pending-count')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kyc_submissions',
        },
        () => {
          // Invalidate the query to refetch count
          queryClient.invalidateQueries({ queryKey: ['pending-kyc-count'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

// KYC
export function useKycSubmissions() {
  return useQuery({
    queryKey: ['admin-kyc'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kyc_submissions')
        .select(`
          *,
          drivers(full_name, phone_number)
        `)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });
}

export function useUpdateKycStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      kycId, 
      driverId,
      status, 
      rejectionReason 
    }: { 
      kycId: string; 
      driverId: string;
      status: 'verified' | 'rejected'; 
      rejectionReason?: string;
    }) => {
      const { error: kycError } = await supabase
        .from('kyc_submissions')
        .update({ 
          status, 
          rejection_reason: rejectionReason,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', kycId);
      
      if (kycError) throw kycError;

      // Update driver's KYC status
      const { error: driverError } = await supabase
        .from('drivers')
        .update({ kyc_status: status })
        .eq('id', driverId);
      
      if (driverError) throw driverError;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-kyc'] });
      queryClient.invalidateQueries({ queryKey: ['admin-drivers'] });
      // KYC approval automatically activates inactive drivers via DB trigger.
      toast.success(status === 'verified' ? 'KYC approuvé — conducteur activé' : 'KYC rejeté');
    },
    onError: () => {
      toast.error('Erreur lors de la mise à jour du KYC');
    },
  });
}

export function useBulkUpdateKycStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      driverIds,
      status, 
      rejectionReason 
    }: { 
      driverIds: string[];
      status: 'verified' | 'rejected'; 
      rejectionReason?: string;
    }) => {
      // First get KYC submissions for these drivers
      const { data: kycSubmissions, error: fetchError } = await supabase
        .from('kyc_submissions')
        .select('id, driver_id')
        .in('driver_id', driverIds)
        .eq('status', 'pending');
      
      if (fetchError) throw fetchError;
      if (!kycSubmissions || kycSubmissions.length === 0) {
        throw new Error('Aucune soumission KYC en attente trouvée');
      }

      const kycIds = kycSubmissions.map(k => k.id);

      // Update all KYC submissions
      const { error: kycError } = await supabase
        .from('kyc_submissions')
        .update({ 
          status, 
          rejection_reason: rejectionReason || null,
          reviewed_at: new Date().toISOString(),
        })
        .in('id', kycIds);
      
      if (kycError) throw kycError;

      // Update all drivers' KYC status
      const { error: driverError } = await supabase
        .from('drivers')
        .update({ kyc_status: status })
        .in('id', driverIds);
      
      if (driverError) throw driverError;

      return { count: kycSubmissions.length };
    },
    onSuccess: (result, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-kyc'] });
      queryClient.invalidateQueries({ queryKey: ['admin-drivers'] });
      toast.success(
        status === 'verified'
          ? `${result.count} KYC approuvé(s) — conducteurs activés`
          : `${result.count} KYC rejeté(s)`
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la mise à jour en masse');
    },
  });
}

// Vehicles
export function useVehicles() {
  return useQuery({
    queryKey: ['admin-vehicles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (vehicle: {
      model_name: string;
      license_plate: string;
      vehicle_type: string;
      rent_per_day: number;
      uffizio_device_id?: string | null;
      status?: string;
      image_url?: string | null;
      fleet_group?: string | null;
    }) => {
      const { error } = await supabase.from('vehicles').insert(vehicle);
      if (error) {
        console.error('[useCreateVehicle] insert error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-vehicles'] });
      toast.success('Véhicule ajouté');
    },
    onError: (error: any) => {
      console.error('[useCreateVehicle] mutation error:', error);
      const raw = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
      const isDuplicatePlate =
        error?.code === '23505' ||
        raw.includes('vehicles_license_plate_key') ||
        (raw.includes('duplicate') && raw.includes('license_plate'));
      const msg = isDuplicatePlate
        ? 'Cette immatriculation existe déjà. Veuillez en saisir une autre.'
        : error?.message || error?.details || 'Erreur lors de l\'ajout';
      toast.error(msg);
    },
  });
}

export function useUpdateVehicleStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ vehicleId, status }: { vehicleId: string; status: string }) => {
      const { error } = await supabase
        .from('vehicles')
        .update({ status })
        .eq('id', vehicleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-vehicles'] });
      toast.success('Statut du véhicule mis à jour');
    },
    onError: () => {
      toast.error('Erreur lors de la mise à jour');
    },
  });
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      vehicleId,
      updates,
    }: {
      vehicleId: string;
      updates: {
        model_name?: string;
        license_plate?: string;
        vehicle_type?: string;
        rent_per_day?: number;
        uffizio_device_id?: string | null;
        image_url?: string | null;
        fleet_group?: string | null;
      };
    }) => {
      const { error } = await supabase
        .from('vehicles')
        .update(updates)
        .eq('id', vehicleId);
      if (error) {
        console.error('[useUpdateVehicle] update error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-vehicles'] });
      toast.success('Véhicule mis à jour');
    },
    onError: (error: any) => {
      const raw = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
      const isDuplicatePlate =
        error?.code === '23505' ||
        raw.includes('vehicles_license_plate_key') ||
        (raw.includes('duplicate') && raw.includes('license_plate'));
      const msg = isDuplicatePlate
        ? 'Cette immatriculation existe déjà. Veuillez en saisir une autre.'
        : error?.message || error?.details || 'Erreur lors de la mise à jour';
      toast.error(msg);
    },
  });
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vehicleId: string) => {
      // Block deletion if the vehicle has any rentals (history matters).
      const { count, error: countError } = await supabase
        .from('rentals')
        .select('id', { count: 'exact', head: true })
        .eq('vehicle_id', vehicleId);
      if (countError) throw countError;
      if ((count ?? 0) > 0) {
        throw new Error(
          'Ce véhicule a un historique de locations. Mettez-le en maintenance plutôt que de le supprimer.'
        );
      }

      const { error } = await supabase.from('vehicles').delete().eq('id', vehicleId);
      if (error) {
        console.error('[useDeleteVehicle] delete error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-vehicles'] });
      toast.success('Véhicule supprimé');
    },
    onError: (error: any) => {
      const msg = error?.message || error?.details || 'Erreur lors de la suppression';
      toast.error(msg);
    },
  });
}

// Rentals
export function useRentals() {
  return useQuery({
    queryKey: ['admin-rentals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rentals')
        .select(`
          *,
          drivers(full_name, phone_number),
          vehicles(model_name, license_plate, rent_per_day),
          invoice!invoice_rental_id_fkey(id, invoice_number, status, total_ttc, paid_at)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });
}

// Admin confirms (or forces) vehicle return
export function useConfirmRentalReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ rentalId, justification, direct }: { rentalId: string; justification?: string; direct?: boolean }) => {
      const { data, error } = await supabase.rpc('confirm_rental_return', {
        p_rental_id: rentalId,
        p_justification: justification ?? null,
        p_direct: !!direct,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rentals'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin-vehicles'] });
      toast.success('Retour confirmé', { description: 'Le véhicule est de nouveau disponible.' });
    },
    onError: (err: Error) => toast.error('Erreur', { description: err.message }),
  });
}

// Admin updates rental fee with justification
export function useUpdateRentalFee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ rentalId, newRate, reason }: { rentalId: string; newRate: number; reason: string }) => {
      const { data, error } = await supabase.rpc('update_rental_fee', {
        p_rental_id: rentalId,
        p_new_rate: newRate,
        p_reason: reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rentals'] });
      queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
      queryClient.invalidateQueries({ queryKey: ['admin-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-linked-payment'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-linked-payments-batch'] });
      queryClient.invalidateQueries({ queryKey: ['payment-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-lines'] });
      toast.success('Tarif mis à jour — paiements et factures recalculés');
    },
    onError: (err: Error) => toast.error('Erreur', { description: getInvoiceErrorMessage(err, err.message) }),
  });
}

export function useUpdateRentalStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      rentalId, 
      status, 
      rejectionReason 
    }: { 
      rentalId: string; 
      status: 'active' | 'approved' | 'rejected' | 'completed'; 
      rejectionReason?: string;
    }) => {
      const effectiveStatus = status === 'active' ? 'approved' : status;

      const updateData: Record<string, unknown> = { 
        status: effectiveStatus, 
        rejection_reason: rejectionReason,
      };
      
      if (effectiveStatus === 'approved') {
        updateData.approval_date = new Date().toISOString();
      }
      if (effectiveStatus === 'completed') {
        updateData.end_date = new Date().toISOString();
      }

      const { error } = await supabase
        .from('rentals')
        .update(updateData)
        .eq('id', rentalId);
      
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-rentals'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      const effectiveStatus = status === 'active' ? 'approved' : status;
      toast.success(
        effectiveStatus === 'rejected' 
          ? 'Location rejetée' 
          : 'Location mise à jour'
      );
    },
    onError: () => {
      toast.error('Erreur lors de la mise à jour');
    },
  });
}

// Simplified one-step approval: approve + activate + set rate + create payment
export function useApproveAndActivateRental() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ rentalId, rate }: { rentalId: string; rate: number }) => {
      const { data, error } = await supabase.rpc('approve_and_activate_rental', {
        p_rental_id: rentalId,
        p_rate: rate,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rentals'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
      toast.success('Location approuvée et active', {
        description: 'Le paiement a été généré pour le conducteur.',
      });
    },
    onError: (err: Error) => {
      toast.error('Erreur', { description: getInvoiceErrorMessage(err, err.message) });
    },
  });
}

// Admin directly assigns a vehicle to a driver (creates pending rental + runs approval flow)
export function useAdminCreateRental() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      driverId,
      vehicleId,
      rate,
    }: {
      driverId: string;
      vehicleId: string;
      rate: number;
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('admin_create_rental', {
        p_driver_id: driverId,
        p_vehicle_id: vehicleId,
        p_rate: rate,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (rentalId, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin-rentals'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
      queryClient.invalidateQueries({ queryKey: ['admin-vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['driver-detail', vars.driverId] });
      queryClient.invalidateQueries({ queryKey: ['admin-driver', vars.driverId] });
      toast.success('Véhicule assigné au conducteur.', {
        description: 'Facture initiale créée.',
        action: {
          label: 'Voir les locations',
          onClick: () => {
            window.location.href = `/admin/rentals?focus=${rentalId}`;
          },
        },
      });
    },
    onError: (err: Error) => {
      toast.error('Erreur', { description: getInvoiceErrorMessage(err, err.message) });
    },
  });
}

// Loans
export function useLoans() {
  return useQuery({
    queryKey: ['admin-loans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loans')
        .select(`
          *,
          drivers(
            full_name, 
            phone_number,
            credit_scores(score, tier)
          )
        `)
        .order('applied_at', { ascending: false });

      if (error) throw error;
      
      return data?.map(loan => ({
        ...loan,
        driver_name: loan.drivers?.full_name,
        driver_phone: loan.drivers?.phone_number,
        score: loan.drivers?.credit_scores?.[0]?.score || null,
        tier: loan.drivers?.credit_scores?.[0]?.tier || 'E',
      })) || [];
    },
  });
}

export function useUpdateLoanStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      loanId, 
      status, 
      amountApproved,
      interestRate,
      rejectionReason 
    }: { 
      loanId: string; 
      status: 'approved' | 'rejected'; 
      amountApproved?: number;
      interestRate?: number;
      rejectionReason?: string;
    }) => {
      const updateData: Record<string, unknown> = { 
        status, 
        rejection_reason: rejectionReason,
      };
      
      if (status === 'approved') {
        updateData.amount_approved = amountApproved;
        updateData.interest_rate = interestRate;
        updateData.approved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('loans')
        .update(updateData)
        .eq('id', loanId);
      
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-loans'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success(status === 'approved' ? 'Prêt approuvé' : 'Prêt rejeté');
    },
    onError: () => {
      toast.error('Erreur lors de la mise à jour');
    },
  });
}

// Payments
export function usePayments() {
  return useQuery({
    queryKey: ['admin-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          drivers(full_name, phone_number),
          rentals(vehicles(model_name, license_plate)),
          loans(loan_type, amount_approved)
        `)
        .order('due_date', { ascending: false });

      if (error) throw error;
      return (data || []) as AdminPayment[];
    },
  });
}

export function useMarkPaymentPaid() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      paymentId, 
      waveTransactionId 
    }: { 
      paymentId: string; 
      waveTransactionId?: string;
    }) => {
      const { error } = await supabase
        .from('payments')
        .update({ 
          status: 'paid', 
          paid_date: new Date().toISOString().split('T')[0],
          wave_transaction_id: waveTransactionId,
        })
        .eq('id', paymentId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success('Paiement marqué comme payé');
    },
    onError: () => {
      toast.error('Erreur lors de la mise à jour');
    },
  });
}

export function useCreatePayment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (payment: {
      driver_id: string;
      amount: number;
      due_date: string;
      payment_type: string;
      rental_id?: string;
      loan_id?: string;
    }) => {
      const { error } = await supabase.from('payments').insert({
        driver_id: payment.driver_id,
        amount: payment.amount,
        due_date: payment.due_date,
        payment_type: payment.payment_type,
        rental_id: payment.rental_id || null,
        loan_id: payment.loan_id || null,
        status: 'pending',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success('Paiement créé avec succès');
    },
    onError: () => {
      toast.error('Erreur lors de la création du paiement');
    },
  });
}

// Support Tickets
export function useSupportTickets() {
  return useQuery({
    queryKey: ['admin-tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select(`
          *,
          drivers(full_name, phone_number),
          support_ticket_messages(*)
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });
}

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      ticketId, 
      status, 
      assignedTo 
    }: { 
      ticketId: string; 
      status?: string; 
      assignedTo?: string;
    }) => {
      const updateData: Record<string, unknown> = {};
      if (status) updateData.status = status;
      if (assignedTo) updateData.assigned_to = assignedTo;
      if (status === 'resolved') updateData.resolved_at = new Date().toISOString();

      const { error } = await supabase
        .from('support_tickets')
        .update(updateData)
        .eq('id', ticketId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tickets'] });
      toast.success('Ticket mis à jour');
    },
    onError: () => {
      toast.error('Erreur lors de la mise à jour');
    },
  });
}

export function useSendTicketReply() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      ticketId, 
      message,
      senderId,
      attachmentUrl,
      voiceStoragePath,
    }: { 
      ticketId: string; 
      message: string;
      senderId: string;
      attachmentUrl?: string;
      voiceStoragePath?: string;
    }) => {
      const { data, error } = await supabase
        .from('support_ticket_messages')
        .insert({
          ticket_id: ticketId,
          message,
          sender_id: senderId,
          sender_type: 'admin',
          attachment_url: attachmentUrl || null,
          voice_storage_path: voiceStoragePath || null,
          transcript_status: voiceStoragePath ? 'pending' : null,
        })
        .select('id')
        .single();
      
      if (error) throw error;

      if (voiceStoragePath && data?.id) {
        supabase.functions.invoke('transcribe-support-audio', { body: { message_id: data.id } }).catch((err) => {
          console.error('Transcription invoke failed:', err);
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tickets'] });
      toast.success('Réponse envoyée');
    },
    onError: () => {
      toast.error('Erreur lors de l\'envoi');
    },
  });
}

// Audit Logs
export function useAuditLogs() {
  return useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_audit_logs')
        .select(`
          *,
          admin_users(full_name, email)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data || [];
    },
  });
}

// Scoring Config
export function useScoringConfig() {
  return useQuery({
    queryKey: ['admin-scoring-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scoring_config')
        .select('*');

      if (error) throw error;
      
      // Transform array to config object
      const config: Record<string, unknown> = {};
      data?.forEach(item => {
        config[item.config_key] = item.config_value;
      });
      
      return config;
    },
  });
}

export function useUpdateScoringConfig() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (configs: { key: string; value: unknown }[]) => {
      for (const config of configs) {
        // Check if config exists
        const { data: existing } = await supabase
          .from('scoring_config')
          .select('id')
          .eq('config_key', config.key)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from('scoring_config')
            .update({
              config_value: config.value as never,
              updated_at: new Date().toISOString(),
            })
            .eq('config_key', config.key);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('scoring_config')
            .insert([{
              config_key: config.key,
              config_value: config.value as never,
            }]);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-scoring-config'] });
      toast.success('Configuration sauvegardée');
    },
    onError: () => {
      toast.error('Erreur lors de la sauvegarde');
    },
  });
}

// Credit Scores distribution
export function useCreditScoreDistribution() {
  return useQuery({
    queryKey: ['admin-score-distribution'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('credit_scores')
        .select('tier')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Get latest score per tier
      const tierCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
      data?.forEach(score => {
        if (score.tier && tierCounts[score.tier] !== undefined) {
          tierCounts[score.tier]++;
        }
      });
      
      return [
        { name: 'Niveau A', value: tierCounts.A, color: 'hsl(142, 71%, 45%)' },
        { name: 'Niveau B', value: tierCounts.B, color: 'hsl(82, 77%, 44%)' },
        { name: 'Niveau C', value: tierCounts.C, color: 'hsl(45, 93%, 47%)' },
        { name: 'Niveau D', value: tierCounts.D, color: 'hsl(25, 95%, 53%)' },
        { name: 'Niveau E', value: tierCounts.E, color: 'hsl(0, 84%, 60%)' },
      ];
    },
  });
}

// Score Trends Over Time
export function useScoreTrends(weeks: number = 12) {
  return useQuery({
    queryKey: ['admin-score-trends', weeks],
    queryFn: async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - weeks * 7);
      
      const { data, error } = await supabase
        .from('credit_scores')
        .select('score, calculation_week, tier')
        .gte('calculation_week', startDate.toISOString().split('T')[0])
        .order('calculation_week', { ascending: true });
      
      if (error) throw error;
      
      // Group by week and calculate averages
      const weeklyData: Record<string, { scores: number[]; tiers: Record<string, number> }> = {};
      
      data?.forEach((record) => {
        const week = record.calculation_week;
        if (!weeklyData[week]) {
          weeklyData[week] = { scores: [], tiers: {} };
        }
        weeklyData[week].scores.push(record.score);
        weeklyData[week].tiers[record.tier] = (weeklyData[week].tiers[record.tier] || 0) + 1;
      });
      
      return Object.entries(weeklyData)
        .map(([week, weekData]) => ({
          week,
          avgScore: Math.round(weekData.scores.reduce((a, b) => a + b, 0) / weekData.scores.length),
          count: weekData.scores.length,
        }))
        .sort((a, b) => a.week.localeCompare(b.week));
    },
  });
}

// Driver wallet (upfront balance) ----------------------------------
export function useDriverWallet(driverId?: string) {
  return useQuery({
    queryKey: ['driver-wallet', driverId],
    enabled: !!driverId,
    queryFn: async () => {
      const [walletRes, txnsRes] = await Promise.all([
        supabase.from('driver_wallets').select('*').eq('driver_id', driverId!).maybeSingle(),
        supabase.from('driver_wallet_transactions').select('*').eq('driver_id', driverId!).order('created_at', { ascending: false }).limit(50),
      ]);
      if (walletRes.error) throw walletRes.error;
      if (txnsRes.error) throw txnsRes.error;
      return { wallet: walletRes.data, transactions: txnsRes.data || [] };
    },
  });
}

export function useRecordDriverDeposit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ driverId, amount, method, reference, note }: {
      driverId: string; amount: number; method: string; reference?: string; note?: string;
    }) => {
      const { data, error } = await supabase.rpc('record_driver_deposit', {
        p_driver_id: driverId,
        p_amount: amount,
        p_method: method,
        p_reference: reference ?? null,
        p_note: note ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { driverId }) => {
      queryClient.invalidateQueries({ queryKey: ['driver-wallet', driverId] });
      toast.success('Dépôt enregistré');
    },
    onError: (err: Error) => toast.error('Erreur', { description: err.message }),
  });
}

// ============================================================
// Driver 360 (summary + activity timeline)
// ============================================================
export interface Driver360Summary {
  driver: {
    id: string;
    full_name: string;
    phone: string | null;
    status: string;
    customer_id: string | null;
    active_since: string;
    score: number | null;
  };
  totals: {
    invoices_count: number;
    paid_count: number;
    issued_count: number;
    cancelled_count: number;
    total_owed_fcfa: number;
    total_paid_fcfa: number;
    total_revenue_fcfa: number;
  };
  current_rental: {
    id: string;
    vehicle_id: string | null;
    vehicle_plate: string | null;
    vehicle_model: string | null;
    status: string;
    started_at: string | null;
    daily_rate: number | null;
    return_due_at: string | null;
  } | null;
  accidents: { open_count: number; total_count: number; last_at: string | null };
  tickets: { open_count: number; total_count: number; last_at: string | null };
  wallet: { balance_fcfa: number };
  kyc: { status: string; last_submitted_at: string | null };
  credit_score: { current: number | null; tier: string | null; last_event_at: string | null } | null;
}

export function useDriver360Summary(driverId?: string) {
  return useQuery({
    queryKey: ['driver-360', driverId],
    enabled: !!driverId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Driver360Summary> => {
      const { data, error } = await supabase.rpc('get_driver_360_summary', {
        p_driver_id: driverId as string,
      });
      if (error) throw error;
      return data as unknown as Driver360Summary;
    },
  });
}

export interface DriverActivityTimelineEntry {
  occurred_at: string;
  source: 'invoice' | 'payment' | 'accident' | 'admin_audit' | 'score' | string;
  action: string;
  summary: string;
  reference_id: string | null;
  metadata: Record<string, unknown> | null;
}

export function useDriverActivityTimeline(driverId?: string, limit = 100) {
  return useQuery({
    queryKey: ['driver-activity-timeline', driverId, limit],
    enabled: !!driverId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<DriverActivityTimelineEntry[]> => {
      const { data, error } = await supabase.rpc('get_driver_activity_timeline', {
        p_driver_id: driverId as string,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as unknown as DriverActivityTimelineEntry[];
    },
  });
}

// Driver invoices (for Driver 360 "Factures" tab)
export interface DriverInvoiceRow {
  id: string;
  invoice_number: string | null;
  status: string;
  total_ttc: number;
  issued_at: string | null;
  created_at: string;
  tags: string[];
  invoice_kind: string;
}

export function useDriverInvoices(driverId?: string) {
  return useQuery({
    queryKey: ['driver-invoices', driverId],
    enabled: !!driverId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<DriverInvoiceRow[]> => {
      const { data, error } = await supabase
        .from('invoice')
        .select('id, invoice_number, status, total_ttc, issued_at, created_at, tags, invoice_kind')
        .eq('driver_id', driverId as string)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as DriverInvoiceRow[];
    },
  });
}

// Driver accidents (for Driver 360 "Sinistres" tab)
export interface DriverAccidentRow {
  id: string;
  case_number: string | null;
  status: string;
  severity: string;
  accident_datetime: string;
  description: string | null;
  vehicle_id: string | null;
  vehicles?: { license_plate: string; model_name: string } | null;
}

export function useDriverAccidents(driverId?: string) {
  return useQuery({
    queryKey: ['driver-accidents', driverId],
    enabled: !!driverId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<DriverAccidentRow[]> => {
      const { data, error } = await supabase
        .from('accidents')
        .select('id, case_number, status, severity, accident_datetime, description, vehicle_id, vehicles(license_plate, model_name)')
        .eq('driver_id', driverId as string)
        .order('accident_datetime', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as DriverAccidentRow[];
    },
  });
}

// Driver support tickets (for Driver 360 "Tickets" tab)
export interface DriverTicketRow {
  id: string;
  ticket_number: string | null;
  subject: string;
  status: string;
  priority: string;
  category: string;
  updated_at: string;
  created_at: string;
}

export function useDriverTickets(driverId?: string) {
  return useQuery({
    queryKey: ['driver-tickets', driverId],
    enabled: !!driverId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<DriverTicketRow[]> => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('id, ticket_number, subject, status, priority, category, updated_at, created_at')
        .eq('driver_id', driverId as string)
        .order('updated_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as DriverTicketRow[];
    },
  });
}
