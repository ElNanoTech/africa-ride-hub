import { useAdminAuth } from './useAdminAuth';

export type AppRole = 'super_admin' | 'manager' | 'agent_pret' | 'agent_support';

// Role hierarchy for permission checks
const ROLE_PERMISSIONS: Record<AppRole, AppRole[]> = {
  super_admin: ['super_admin', 'manager', 'agent_pret', 'agent_support'],
  manager: ['manager', 'agent_pret', 'agent_support'],
  agent_pret: ['agent_pret'],
  agent_support: ['agent_support'],
};

export function useRoleGuard() {
  const { adminUser, isLoading } = useAdminAuth();
  
  const currentRole = (adminUser?.role_key as AppRole) || null;

  /**
   * Check if the current user has one of the allowed roles
   */
  const hasRole = (...allowedRoles: AppRole[]): boolean => {
    if (!currentRole) return false;
    return allowedRoles.includes(currentRole);
  };

  /**
   * Check if the current user can perform an action that requires any of the specified roles
   */
  const canAccess = (...requiredRoles: AppRole[]): boolean => {
    if (!currentRole) return false;
    return requiredRoles.includes(currentRole);
  };

  /**
   * Check if user is super_admin
   */
  const isSuperAdmin = (): boolean => currentRole === 'super_admin';

  /**
   * Check if user is manager or higher
   */
  const isManagerOrHigher = (): boolean => hasRole('super_admin', 'manager');

  /**
   * Check if user can manage loans (super_admin, manager, agent_pret)
   */
  const canManageLoans = (): boolean => hasRole('super_admin', 'manager', 'agent_pret');

  /**
   * Check if user can manage support (super_admin, manager, agent_support)
   */
  const canManageSupport = (): boolean => hasRole('super_admin', 'manager', 'agent_support');

  /**
   * Check if user can manage payments (super_admin, manager only)
   */
  const canManagePayments = (): boolean => hasRole('super_admin', 'manager');

  /**
   * Check if user can manage drivers/vehicles/rentals (super_admin, manager only)
   */
  const canManageFleet = (): boolean => hasRole('super_admin', 'manager');

  /**
   * Check if user can manage admin users (super_admin only)
   */
  const canManageAdmins = (): boolean => isSuperAdmin();

  /**
   * Check if user can access audit logs (super_admin only)
   */
  const canAccessAudit = (): boolean => isSuperAdmin();

  /**
   * Check if user can modify settings (super_admin only)
   */
  const canModifySettings = (): boolean => isSuperAdmin();

  /**
   * Check if user can approve/reject loans
   */
  const canApproveLoan = (): boolean => hasRole('super_admin', 'manager', 'agent_pret');

  /**
   * Check if user can approve/reject rentals
   */
  const canApproveRental = (): boolean => hasRole('super_admin', 'manager');

  return {
    currentRole,
    isLoading,
    hasRole,
    canAccess,
    isSuperAdmin,
    isManagerOrHigher,
    canManageLoans,
    canManageSupport,
    canManagePayments,
    canManageFleet,
    canManageAdmins,
    canAccessAudit,
    canModifySettings,
    canApproveLoan,
    canApproveRental,
  };
}
