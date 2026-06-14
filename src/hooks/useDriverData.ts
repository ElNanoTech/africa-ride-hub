import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabaseDriver as supabase } from '@/integrations/supabase/clients';
import { toast } from 'sonner';

// Track the current Supabase auth user id reactively. Without this, the very
// first run of useDriverId can fire before the session is restored, return
// null, and stay cached as null forever — which surfaces in the UI as a
// false "Profil conducteur requis" warning even though the driver row exists.
//
// Returns:
//   undefined → still resolving (initial session restore in flight)
//   null      → resolved, no signed-in user
//   string    → resolved, signed-in user id
export function useAuthUserId() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setUserId(session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return userId;
}

/** True while the initial Supabase session restore is still in flight. */
export function useIsAuthResolving() {
  return useAuthUserId() === undefined;
}

// Get current driver ID for the authenticated user.
// IMPORTANT: keys on auth user id and matches on either user_id OR auth_user_id
// because managed driver accounts (created by an admin) populate both columns
// and historic rows may only have one of them set.
export function useDriverId() {
  const authUserId = useAuthUserId();

  return useQuery({
    queryKey: ['driverId', authUserId],
    queryFn: async () => {
      if (!authUserId) return null;

      const { data, error } = await supabase
        .from('drivers')
        .select('id')
        .or(`user_id.eq.${authUserId},auth_user_id.eq.${authUserId}`)
        .maybeSingle();

      if (error) throw error;
      return data?.id || null;
    },
    enabled: authUserId !== undefined,
    // Resilient against transient/offline failures — keep retrying so we
    // don't surface a false "Profil conducteur requis" warning when the
    // network is temporarily down.
    retry: 5,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15000),
    staleTime: 5 * 60 * 1000,
  });
}

// Fetch driver's support tickets
export function useDriverSupportTickets() {
  const { data: driverId } = useDriverId();

  return useQuery({
    queryKey: ['driverSupportTickets', driverId],
    queryFn: async () => {
      if (!driverId) return [];

      const { data, error } = await supabase
        .from('support_tickets')
        .select(`
          *,
          messages:support_ticket_messages(*)
        `)
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!driverId,
  });
}

// Create a new support ticket
export function useCreateSupportTicket() {
  const queryClient = useQueryClient();
  const { data: driverId } = useDriverId();

  return useMutation({
    mutationFn: async (ticket: {
      category: string;
      subject: string;
      description: string;
      priority?: string;
    }) => {
      if (!driverId) {
        throw new Error('Aucun profil conducteur trouvé. Veuillez compléter votre inscription.');
      }

      const { data, error } = await supabase
        .from('support_tickets')
        .insert({
          driver_id: driverId,
          category: ticket.category,
          subject: ticket.subject,
          description: ticket.description,
          priority: ticket.priority || 'normal',
          status: 'open',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driverSupportTickets'] });
      toast.success('Ticket créé avec succès!');
    },
    onError: (error: Error) => {
      console.error('Error creating ticket:', error);
      toast.error(error.message || 'Erreur lors de la création du ticket');
    },
  });
}

// Add a message to a ticket
export function useAddTicketMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ticketId, message, attachmentUrl, voiceStoragePath }: { ticketId: string; message: string; attachmentUrl?: string; voiceStoragePath?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');

      const { data: driver } = await supabase
        .from('drivers')
        .select('id')
        .or(`user_id.eq.${user.id},auth_user_id.eq.${user.id}`)
        .maybeSingle();

      if (!driver) throw new Error('Profil conducteur non trouvé');

      const { data, error } = await supabase
        .from('support_ticket_messages')
        .insert({
          ticket_id: ticketId,
          sender_id: driver.id,
          sender_type: 'driver',
          message,
          attachment_url: attachmentUrl || null,
          voice_storage_path: voiceStoragePath || null,
          transcript_status: voiceStoragePath ? 'pending' : null,
        })
        .select()
        .single();

      if (error) throw error;

      // Fire-and-forget transcription
      if (voiceStoragePath && data?.id) {
        supabase.functions.invoke('transcribe-support-audio', { body: { message_id: data.id } }).catch((err) => {
          console.error('Transcription invoke failed:', err);
        });
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driverSupportTickets'] });
      toast.success('Message envoyé!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de l\'envoi du message');
    },
  });
}

// Upload a voice note to storage
export function useUploadVoiceNote() {
  return useMutation({
    mutationFn: async ({ ticketId, audioBlob }: { ticketId: string; audioBlob: Blob }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');

      const fileName = `${user.id}/${ticketId}/${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from('voice-notes')
        .upload(fileName, audioBlob, { contentType: 'audio/webm' });

      if (uploadError) throw uploadError;

      // Bucket is private — issue a long-lived signed URL (1 year).
      // VoicePlayer re-signs on demand if the URL ever expires.
      const { data: signed, error: signError } = await supabase.storage
        .from('voice-notes')
        .createSignedUrl(fileName, 60 * 60 * 24 * 365);

      if (signError || !signed) throw signError ?? new Error('Signed URL failed');
      return { signedUrl: signed.signedUrl, storagePath: fileName };
    },
    onError: (error: Error) => {
      toast.error('Erreur lors de l\'envoi du vocal');
      console.error('Voice upload error:', error);
    },
  });
}

// Fetch driver's notifications
export function useDriverNotifications() {
  const { data: driverId } = useDriverId();

  return useQuery({
    queryKey: ['driverNotifications', driverId],
    queryFn: async () => {
      if (!driverId) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!driverId,
  });
}

// Mark notification as read
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driverNotifications'] });
    },
  });
}

// Fetch driver's rentals
export function useDriverRentals() {
  const { data: driverId } = useDriverId();

  return useQuery({
    queryKey: ['driverRentals', driverId],
    queryFn: async () => {
      if (!driverId) return [];

      const { data, error } = await supabase
        .from('rentals')
        .select(`
          *,
          vehicle:vehicles(*)
        `)
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!driverId,
  });
}

// Fetch driver's loans
export function useDriverLoans() {
  const { data: driverId } = useDriverId();

  return useQuery({
    queryKey: ['driverLoans', driverId],
    queryFn: async () => {
      if (!driverId) return [];

      const { data, error } = await supabase
        .from('loans')
        .select('*')
        .eq('driver_id', driverId)
        .order('applied_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!driverId,
  });
}

// Fetch driver's payments
export function useDriverPayments() {
  const { data: driverId } = useDriverId();

  return useQuery({
    queryKey: ['driverPayments', driverId],
    queryFn: async () => {
      if (!driverId) return [];

      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          rental:rentals(*),
          loan:loans(*)
        `)
        .eq('driver_id', driverId)
        .order('due_date', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!driverId,
  });
}

// Fetch driver's credit score history
export function useDriverCreditScores() {
  const { data: driverId } = useDriverId();

  return useQuery({
    queryKey: ['driverCreditScores', driverId],
    queryFn: async () => {
      if (!driverId) return [];

      const { data, error } = await supabase
        .from('credit_scores')
        .select(`
          *,
          breakdowns:credit_score_breakdowns(*)
        `)
        .eq('driver_id', driverId)
        .order('calculation_week', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!driverId,
  });
}

// Fetch driver's authoritative live score
export function useDriverCurrentScore() {
  const { data: driverId } = useDriverId();

  return useQuery({
    queryKey: ['driverCurrentScore', driverId],
    queryFn: async () => {
      if (!driverId) return null;

      const { data, error } = await supabase
        .from('driver_scores')
        .select('current_score')
        .eq('driver_id', driverId)
        .maybeSingle();

      if (error) throw error;
      return data?.current_score ?? null;
    },
    enabled: !!driverId,
  });
}

// Fetch driver's telemetry data for today
export function useDriverTelemetry() {
  const { data: driverId } = useDriverId();

  return useQuery({
    queryKey: ['driverTelemetry', driverId],
    queryFn: async () => {
      if (!driverId) return null;

      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('telemetry_events')
        .select('*')
        .eq('driver_id', driverId)
        .eq('event_date', today)
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!driverId,
  });
}

// Fetch driver's favorite vehicles
export function useDriverFavorites() {
  const { data: driverId } = useDriverId();

  return useQuery({
    queryKey: ['driverFavorites', driverId],
    queryFn: async () => {
      if (!driverId) return [];

      const { data, error } = await supabase
        .from('driver_favorites')
        .select('vehicle_id')
        .eq('driver_id', driverId);

      if (error) throw error;
      return data?.map(f => f.vehicle_id) || [];
    },
    enabled: !!driverId,
  });
}

// Toggle vehicle favorite
export function useToggleFavorite() {
  const queryClient = useQueryClient();
  const { data: driverId } = useDriverId();

  return useMutation({
    mutationFn: async ({ vehicleId, isFavorite }: { vehicleId: string; isFavorite: boolean }) => {
      if (!driverId) throw new Error('Profil conducteur non trouvé');

      if (isFavorite) {
        // Remove from favorites
        const { error } = await supabase
          .from('driver_favorites')
          .delete()
          .eq('driver_id', driverId)
          .eq('vehicle_id', vehicleId);

        if (error) throw error;
      } else {
        // Add to favorites
        const { error } = await supabase
          .from('driver_favorites')
          .insert({ driver_id: driverId, vehicle_id: vehicleId });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driverFavorites'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la mise à jour des favoris');
    },
  });
}
