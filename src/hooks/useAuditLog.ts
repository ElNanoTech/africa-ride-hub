import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import type { Json } from '@/integrations/supabase/types';

export type AuditAction =
  | 'admin_login'
  | 'admin_logout'
  | 'admin_user_created'
  | 'admin_user_updated'
  | 'admin_user_deleted'
  | 'admin_password_reset'
  | 'admin_roles_changed'
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'loan_approved'
  | 'loan_rejected'
  | 'rental_approved'
  | 'rental_rejected'
  | 'rental_terminated'
  | 'rental_return_confirmed'
  | 'rental_pickup_confirmed'
  | 'rental_fee_updated'
  | 'driver_suspended'
  | 'driver_activated'
  | 'drivers_imported'
  | 'config_updated'
  | 'payment_marked_paid'
  | 'vehicle_added'
  | 'vehicle_updated'
  | 'driver_created'
  | 'driver_updated'
  | 'driver_pin_reset'
  | 'auth_mode_changed'
  | 'attention_center_opened_item'
  | 'attention_center_refreshed'
  | 'attention_center_exported_report'
  | 'credit_portfolio_viewed'
  | 'credit_portfolio_exported';

export type TargetType =
  | 'admin_user'
  | 'driver'
  | 'kyc_submission'
  | 'loan'
  | 'rental'
  | 'payment'
  | 'invoice'
  | 'vehicle'
  | 'fleet_control'
  | 'traffic_violation'
  | 'accident'
  | 'maintenance_order'
  | 'support_ticket'
  | 'attention_center'
  | 'analytics'
  | 'scoring_config'
  | 'session';

interface AuditLogParams {
  action: AuditAction;
  targetType: TargetType;
  targetId?: string;
  details?: Json;
}

function reportAuditLogFailure(message: string, error?: unknown): void {
  if (import.meta.env.DEV) {
    console.debug(message, error);
  }
}

// Get the current admin user ID
async function getCurrentAdminUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  return adminUser?.id || null;
}

// Log an admin action
export async function logAdminAction(params: AuditLogParams): Promise<void> {
  try {
    const adminUserId = await getCurrentAdminUserId();
    if (!adminUserId) {
      reportAuditLogFailure('No admin user found for audit log');
      return;
    }

    const { error } = await supabase
      .from('admin_audit_logs')
      .insert([{
        admin_user_id: adminUserId,
        action: params.action,
        entity_type: params.targetType,
        entity_id: params.targetId || null,
        details: params.details || null,
        ip_address: null,
      }]);

    if (error) {
      reportAuditLogFailure('Failed to log admin action', error);
    }
  } catch (error) {
    reportAuditLogFailure('Error logging admin action', error);
  }
}

// Hook for logging with mutation
export function useLogAdminAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logAdminAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-audit-logs'] });
    },
  });
}

// Convenience function to log without waiting
export function logAction(params: AuditLogParams): void {
  logAdminAction(params).catch((error) => {
    reportAuditLogFailure('Error logging admin action', error);
  });
}
