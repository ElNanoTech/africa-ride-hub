import { ReactNode } from 'react';
import { Lock, Play, Send, ShieldCheck } from 'lucide-react';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminUser } from '@/hooks/useAdminUser';
import { useFeatureEntitlement, useRequestFeatureUpgrade, useStartFeatureTrial } from '@/hooks/usePlatformLicensingData';
import {
  accessStateLabel,
  accessStateTone,
  isFeatureAllowed,
  lockedModuleMessage,
  lockedModuleTitle,
  type FeatureAccessResult,
} from '@/lib/platformLicensing';

type LockedUpgradeCardProps = {
  featureKey: string;
  moduleName: string;
  access?: FeatureAccessResult | null;
  customerId?: string | null;
  compact?: boolean;
};

export function LockedUpgradeCard({ featureKey, moduleName, access, customerId, compact = false }: LockedUpgradeCardProps) {
  const requestUpgrade = useRequestFeatureUpgrade();
  const startTrial = useStartFeatureTrial();
  const benefits = access?.upgrade_copy?.benefits ?? [
    'Unlock premium operating workflows without removing Fleet Core.',
    'Keep existing data intact while the module is activated.',
    'Audit every licensing change from Platform Administration.',
  ];

  const canStartTrial = !!customerId && !['HIDDEN', 'EXPIRED'].includes(access?.access_state ?? '');

  return (
    <Card className={compact ? 'border-dashed' : 'max-w-5xl'}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={accessStateTone(access?.access_state)}>
            {accessStateLabel(access?.access_state ?? 'LOCKED')}
          </Badge>
          <Badge variant="outline">{access?.code ?? 'FEATURE_NOT_LICENSED'}</Badge>
        </div>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Lock className="h-5 w-5" />
          {lockedModuleTitle(access, moduleName)}
        </CardTitle>
        <CardDescription>
          {lockedModuleMessage(access, moduleName)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          {benefits.slice(0, 3).map((benefit) => (
            <div key={benefit} className="rounded-md border bg-muted/30 p-3 text-sm">
              <ShieldCheck className="mb-2 h-4 w-4 text-primary" />
              {benefit}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => requestUpgrade.mutate({ featureKey, reason: `${moduleName} upgrade requested from locked module` })}
            disabled={requestUpgrade.isPending}
          >
            <Send className="mr-2 h-4 w-4" />
            Request upgrade
          </Button>
          <Button
            variant="outline"
            onClick={() => startTrial.mutate({ customerId: customerId ?? '', featureKey, reason: `${moduleName} trial started from locked module` })}
            disabled={!canStartTrial || startTrial.isPending}
          >
            <Play className="mr-2 h-4 w-4" />
            Start trial
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type EntitlementGateProps = {
  featureKey: string;
  moduleName: string;
  children: ReactNode;
};

export function EntitlementGate({ featureKey, moduleName, children }: EntitlementGateProps) {
  const { customerId, isResolving } = useAdminUser();
  const accessQuery = useFeatureEntitlement(featureKey, customerId, !isResolving);
  const access = accessQuery.data;

  if (isResolving || accessQuery.isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <AdminBreadcrumb />
          <AdminPageHeader title={moduleName} description="Checking licensing state..." />
          <Skeleton className="h-48 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (accessQuery.isError || !access) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <AdminBreadcrumb />
          <AdminPageHeader title={moduleName} description="Licensing check unavailable" />
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertTitle>Licensing check unavailable</AlertTitle>
            <AlertDescription>
              The module remains accessible while the licensing service is unavailable.
            </AlertDescription>
          </Alert>
          {children}
        </div>
      </AdminLayout>
    );
  }

  if (isFeatureAllowed(access)) {
    return <>{children}</>;
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminBreadcrumb />
        <AdminPageHeader title={moduleName} description="Premium module access" />
        <LockedUpgradeCard featureKey={featureKey} moduleName={moduleName} access={access} customerId={customerId} />
      </div>
    </AdminLayout>
  );
}
