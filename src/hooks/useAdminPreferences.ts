import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { toast } from 'sonner';

interface AdminPreferences {
  id: string;
  admin_user_id: string;
  email_notifications: boolean;
  new_request_alerts: boolean;
  kyc_alerts: boolean;
  payment_alerts: boolean;
  support_alerts: boolean;
  created_at: string;
  updated_at: string;
}

export function useAdminPreferences() {
  return useQuery({
    queryKey: ['admin-preferences'],
    queryFn: async () => {
      // First get the admin user id for the current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!adminUser) throw new Error('Not an admin user');

      // Get preferences, create if not exists
      const { data: preferences, error } = await supabase
        .from('admin_preferences')
        .select('*')
        .eq('admin_user_id', adminUser.id)
        .maybeSingle();

      if (error) throw error;

      // If no preferences exist, return defaults
      if (!preferences) {
        return {
          admin_user_id: adminUser.id,
          email_notifications: true,
          new_request_alerts: true,
          kyc_alerts: true,
          payment_alerts: true,
          support_alerts: true,
        } as Partial<AdminPreferences>;
      }

      return preferences as AdminPreferences;
    },
  });
}

export function useUpdateAdminPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (preferences: { 
      email_notifications: boolean; 
      new_request_alerts: boolean;
      kyc_alerts: boolean;
      payment_alerts: boolean;
      support_alerts: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!adminUser) throw new Error('Not an admin user');

      // Check if preferences exist
      const { data: existing } = await supabase
        .from('admin_preferences')
        .select('id')
        .eq('admin_user_id', adminUser.id)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('admin_preferences')
          .update(preferences)
          .eq('admin_user_id', adminUser.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('admin_preferences')
          .insert({
            admin_user_id: adminUser.id,
            ...preferences,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-preferences'] });
      toast.success('Préférences enregistrées');
    },
    onError: () => {
      toast.error('Erreur lors de la sauvegarde');
    },
  });
}
