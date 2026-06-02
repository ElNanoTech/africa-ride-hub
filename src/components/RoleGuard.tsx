import { ReactNode } from 'react';
import { useRoleGuard, AppRole } from '@/hooks/useRoleGuard';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface RoleGuardProps {
  /** Required roles to show the children */
  allowedRoles: AppRole[];
  /** Content to render if user has permission */
  children: ReactNode;
  /** If true, renders nothing when no access. If false, renders disabled version */
  hideWhenNoAccess?: boolean;
  /** Custom fallback content when no access (only used if hideWhenNoAccess is false) */
  fallback?: ReactNode;
  /** Tooltip message shown when hovering over disabled content */
  disabledTooltip?: string;
}

/**
 * Component that conditionally renders children based on user role
 * Can either hide content completely or show a disabled version
 */
export function RoleGuard({
  allowedRoles,
  children,
  hideWhenNoAccess = true,
  fallback,
  disabledTooltip = "Vous n'avez pas les permissions nécessaires",
}: RoleGuardProps) {
  const { hasRole, isLoading } = useRoleGuard();

  // During loading, hide content to prevent flash
  if (isLoading) {
    return null;
  }

  const hasAccess = hasRole(...allowedRoles);

  if (hasAccess) {
    return <>{children}</>;
  }

  if (hideWhenNoAccess) {
    return null;
  }

  // Show fallback or disabled version with tooltip
  if (fallback) {
    return <>{fallback}</>;
  }

  // Wrap children in disabled state with tooltip
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="opacity-50 cursor-not-allowed pointer-events-none">
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{disabledTooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface RoleGuardButtonProps {
  /** Required roles to enable the button */
  allowedRoles: AppRole[];
  /** Button element to wrap */
  children: ReactNode;
  /** Tooltip message shown when button is disabled */
  disabledTooltip?: string;
}

/**
 * Wrapper specifically for buttons - shows them disabled with tooltip when no access
 */
export function RoleGuardButton({
  allowedRoles,
  children,
  disabledTooltip = "Vous n'avez pas les permissions nécessaires",
}: RoleGuardButtonProps) {
  const { hasRole, isLoading } = useRoleGuard();

  if (isLoading) {
    return <>{children}</>;
  }

  const hasAccess = hasRole(...allowedRoles);

  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-block">
          <div className="pointer-events-none opacity-50">
            {children}
          </div>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>{disabledTooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
