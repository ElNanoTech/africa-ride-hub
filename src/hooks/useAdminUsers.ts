import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { toast } from 'sonner';
import { logAction } from './useAuditLog';

export interface AdminUserWithRoles {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  roles: string[];
}

// Fetch all admin users with their roles
export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin-users-management'],
    queryFn: async () => {
      const { data: adminUsers, error: usersError } = await supabase
        .from('admin_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersError) throw usersError;

      // Fetch roles for each admin user
      const usersWithRoles: AdminUserWithRoles[] = await Promise.all(
        (adminUsers || []).map(async (user) => {
          const { data: roles } = await supabase
            .from('admin_roles')
            .select('role')
            .eq('admin_user_id', user.id);

          return {
            ...user,
            roles: roles?.map(r => r.role) || [],
          };
        })
      );

      return usersWithRoles;
    },
  });
}

// Create a new admin user
export function useCreateAdminUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      email,
      password,
      full_name,
      roles,
      customer_id,
    }: {
      email: string;
      password: string;
      full_name: string;
      roles: string[];
      // Optional — only honored server-side for platform owners. Restricted
      // admins always inherit their own customer_id regardless of this value.
      customer_id?: string | null;
    }) => {
      const { data, error } = await supabase.functions.invoke('create-admin-user', {
        body: {
          email,
          password,
          full_name,
          roles,
          customer_id: customer_id ?? null,
        },
      });

      if (error) {
        // Supabase wraps function errors a bit differently depending on transport
        const msg = (error as any)?.message || (data as any)?.error || 'Erreur lors de la création';
        throw new Error(msg);
      }

      if ((data as any)?.error) {
        throw new Error((data as any).error);
      }

      return (data as any).adminUser;
    },
    onSuccess: (adminUser, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users-management'] });
      logAction({
        action: 'admin_user_created',
        targetType: 'admin_user',
        targetId: adminUser.id,
        details: { email: variables.email, full_name: variables.full_name, roles: variables.roles },
      });
      toast.success('Administrateur créé avec succès');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la création');
    },
  });
}

// Update admin user
export function useUpdateAdminUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      adminUserId,
      full_name,
      is_active,
      roles,
    }: {
      adminUserId: string;
      full_name: string;
      is_active: boolean;
      roles: string[];
    }) => {
      // Update admin_users entry
      const { error: updateError } = await supabase
        .from('admin_users')
        .update({ full_name, is_active })
        .eq('id', adminUserId);

      if (updateError) throw updateError;

      // Delete existing roles
      const { error: deleteError } = await supabase
        .from('admin_roles')
        .delete()
        .eq('admin_user_id', adminUserId);

      if (deleteError) throw deleteError;

      // Add new roles
      if (roles.length > 0) {
        const roleInserts = roles.map(role => ({
          admin_user_id: adminUserId,
          role: role as 'super_admin' | 'manager' | 'loan_officer' | 'support_agent',
        }));

        const { error: rolesError } = await supabase
          .from('admin_roles')
          .insert(roleInserts);

        if (rolesError) throw rolesError;
      }
      return { adminUserId, full_name, is_active, roles };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users-management'] });
      logAction({
        action: 'admin_user_updated',
        targetType: 'admin_user',
        targetId: variables.adminUserId,
        details: { full_name: variables.full_name, is_active: variables.is_active, roles: variables.roles },
      });
      toast.success('Administrateur mis à jour');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la mise à jour');
    },
  });
}

// Delete admin user
export function useDeleteAdminUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (adminUserId: string) => {
      // Delete roles first
      const { error: rolesError } = await supabase
        .from('admin_roles')
        .delete()
        .eq('admin_user_id', adminUserId);

      if (rolesError) throw rolesError;

      // Delete admin user
      const { error: deleteError } = await supabase
        .from('admin_users')
        .delete()
        .eq('id', adminUserId);

      if (deleteError) throw deleteError;
      return adminUserId;
    },
    onSuccess: (adminUserId) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users-management'] });
      logAction({
        action: 'admin_user_deleted',
        targetType: 'admin_user',
        targetId: adminUserId,
      });
      toast.success('Administrateur supprimé');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la suppression');
    },
  });
}

// Send password reset email
//
// Security policy: password resets are NEVER performed by overwriting the
// password from server code. We always trigger Supabase's standard recovery
// flow → the user receives an email link and chooses their own password.
// Every reset is recorded in admin_audit_logs with actor, timestamp, target
// email and the reason supplied by the operator.
export function useResetAdminPassword() {
  return useMutation({
    mutationFn: async ({ email, reason }: { email: string; reason?: string }) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/admin/login`,
      });
      if (error) throw error;
      return { email, reason: reason ?? 'manual_admin_reset' };
    },
    onSuccess: ({ email, reason }) => {
      logAction({
        action: 'admin_password_reset',
        targetType: 'admin_user',
        details: { email, reason, method: 'email_recovery_link', initiated_at: new Date().toISOString() },
      });
      toast.success('Email de réinitialisation envoyé');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de l\'envoi');
    },
  });
}
