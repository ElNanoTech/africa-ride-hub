import { ReactNode } from 'react';
import { useIsFeatureEnabled } from '@/hooks/useFeatureFlags';

interface FeatureFlagProps {
  /** The feature flag key to check */
  flagKey: string;
  /** Content to render if feature is enabled */
  children: ReactNode;
  /** Optional fallback content when feature is disabled */
  fallback?: ReactNode;
  /** If true, shows a loading skeleton while checking flag */
  showLoading?: boolean;
}

/**
 * Component that conditionally renders children based on a feature flag
 * 
 * Usage:
 * ```tsx
 * <FeatureFlag flagKey="enable_loans">
 *   <LoanApplicationForm />
 * </FeatureFlag>
 * ```
 */
export function FeatureFlag({ 
  flagKey, 
  children, 
  fallback = null,
  showLoading = false 
}: FeatureFlagProps) {
  const { data: isEnabled, isLoading } = useIsFeatureEnabled(flagKey);

  if (isLoading) {
    return showLoading ? (
      <div className="animate-pulse bg-muted rounded h-8 w-full" />
    ) : null;
  }

  if (!isEnabled) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Hook-based alternative for more complex conditional rendering
 */
export function useFeatureFlag(flagKey: string) {
  const { data: isEnabled, isLoading } = useIsFeatureEnabled(flagKey);
  return { isEnabled: isEnabled ?? false, isLoading };
}
