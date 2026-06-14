import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseDriver as supabase } from '@/integrations/supabase/clients';
import { toast } from 'sonner';

// Fetch full driver profile with KYC data
export function useDriverFullProfile() {
  return useQuery({
    queryKey: ['driverFullProfile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .select('*')
        .or(`user_id.eq.${user.id},auth_user_id.eq.${user.id}`)
        .maybeSingle();

      if (driverError) throw driverError;
      if (!driver) return null;

      // Fetch latest KYC submission
      const { data: kyc, error: kycError } = await supabase
        .from('kyc_submissions')
        .select('*')
        .eq('driver_id', driver.id)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (kycError) console.error('Error fetching KYC:', kycError);

      return {
        ...driver,
        kyc: kyc || null,
        email: user.email || null,
      };
    },
  });
}

// Update driver profile
export function useUpdateDriverProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: {
      full_name?: string;
      phone_number?: string;
      email?: string;
      profile_image_url?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');

      // Update driver table
      const driverUpdates: Record<string, string> = {};
      if (updates.full_name) driverUpdates.full_name = updates.full_name;
      if (updates.phone_number) driverUpdates.phone_number = updates.phone_number;
      if (updates.profile_image_url) driverUpdates.profile_image_url = updates.profile_image_url;

      if (Object.keys(driverUpdates).length > 0) {
        const { error: driverError } = await supabase
          .from('drivers')
          .update(driverUpdates)
          .or(`user_id.eq.${user.id},auth_user_id.eq.${user.id}`);

        if (driverError) throw driverError;
      }

      // Update email in auth if provided
      if (updates.email && updates.email !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: updates.email,
        });

        if (emailError) throw emailError;
      }

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driverFullProfile'] });
      queryClient.invalidateQueries({ queryKey: ['driverProfile'] });
      toast.success('Profil mis à jour avec succès!');
    },
    onError: (error: Error) => {
      console.error('Error updating profile:', error);
      toast.error(error.message || 'Erreur lors de la mise à jour du profil');
    },
  });
}
