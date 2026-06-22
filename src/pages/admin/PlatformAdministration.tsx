import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Boxes,
  Download,
  Flag,
  Gauge,
  History,
  Layers3,
  Lock,
  PackageCheck,
  Play,
  RefreshCw,
  ShieldCheck,
  Store,
} from 'lucide-react';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { LockedUpgradeCard } from '@/components/admin/EntitlementGate';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAdminUser } from '@/hooks/useAdminUser';
import { logAction } from '@/hooks/useAuditLog';
import {
  PLATFORM_LICENSING_REALTIME_TABLES,
  useAssignPlatformPlan,
  useGrantTenantEntitlement,
  usePlatformLicensingData,
  useRecordPlatformAuditEvent,
  useRevokeTenantEntitlement,
  useSetFeatureFlagState,
  useSetUsageLimit,
  useStartFeatureTrial,
  useSyncExpiredTrials,
} from '@/hooks/usePlatformLicensingData';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { exportToCSV } from '@/lib/export';
import {
  accessStateLabel,
  accessStateTone,
  buildLicensingExportRows,
  summarizeTenantAccess,
  usagePercent,
  usageStatusTone,
  type FeatureAccessResult,
} from '@/lib/platformLicensing';

function KpiCard({ title, value, detail, icon: Icon }: { title: string; value: string | number; detail: string; icon: typeof PackageCheck }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminBreadcrumb />
        <AdminPageHeader title="Platform Administration" description="Loading licensing state..." />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    </AdminLayout>
  );
}

export default function PlatformAdministration() {
  const { data, isLoading, error } = usePlatformLicensingData();
  const { isPlatformOwner, customerId } = useAdminUser();
  const assignPlan = useAssignPlatformPlan();
  const grantEntitlement = useGrantTenantEntitlement();
  const revokeEntitlement = useRevokeTenantEntitlement();
  const startTrial = useStartFeatureTrial();
  const syncExpiredTrials = useSyncExpiredTrials();
  const setFeatureState = useSetFeatureFlagState();
  const setUsageLimit = useSetUsageLimit();
  const recordAudit = useRecordPlatformAuditEvent();
  const recordedViewRef = useRef(false);

  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [selectedPlanKey, setSelectedPlanKey] = useState('enterprise');
  const [selectedFeatureKey, setSelectedFeatureKey] = useState('growth_center');
  const [selectedFeatureState, setSelectedFeatureState] = useState('ENABLED');
  const [selectedLimitKey, setSelectedLimitKey] = useState('driver_count');
  const [limitValue, setLimitValue] = useState('50');
  const [reason, setReason] = useState('Layer 3I platform administration action');

  useRealtimeSubscription({
    tables: PLATFORM_LICENSING_REALTIME_TABLES,
    showToasts: false,
  });

  useEffect(() => {
    if (!data?.customers.length || selectedTenantId) return;
    const preferred = data.customers.find((customer) => customer.slug === 'qa-layer3i-fleet-core')
      ?? data.customers.find((customer) => customer.id === customerId)
      ?? data.customers[0];
    setSelectedTenantId(preferred.id);
  }, [customerId, data?.customers, selectedTenantId]);

  const activeTenantId = useMemo(() => {
    if (selectedTenantId) return selectedTenantId;
    if (!data?.customers.length) return '';
    return data.customers.find((customer) => customer.slug === 'qa-layer3i-fleet-core')?.id
      ?? data.customers.find((customer) => customer.id === customerId)?.id
      ?? data.customers[0]?.id
      ?? '';
  }, [customerId, data?.customers, selectedTenantId]);

  useEffect(() => {
    if (recordedViewRef.current) return;
    recordedViewRef.current = true;
    recordAudit.mutate({
      eventType: 'PLATFORM_ADMINISTRATION_VIEWED',
      targetType: 'platform_licensing',
      reason: 'Platform Administration opened',
    });
    logAction({
      action: 'platform_licensing_viewed',
      targetType: 'platform_licensing',
      details: { layer: '3I' },
    });
  }, [recordAudit]);

  const selectedTenant = useMemo(
    () => data?.customers.find((customer) => customer.id === activeTenantId) ?? null,
    [activeTenantId, data?.customers],
  );

  const selectedTenantEntitlements = useMemo(
    () => (data?.entitlements ?? []).filter((row) => row.tenant_id === activeTenantId),
    [activeTenantId, data?.entitlements],
  );

  const selectedUsageLimits = useMemo(
    () => (data?.usageLimits ?? []).filter((row) => row.tenant_id === activeTenantId),
    [activeTenantId, data?.usageLimits],
  );

  const tenantSummary = useMemo(() => summarizeTenantAccess(selectedTenantEntitlements), [selectedTenantEntitlements]);

  const qaFleetCoreCreditAccess = useMemo<FeatureAccessResult | null>(() => {
    const row = (data?.entitlements ?? []).find(
      (entitlement) => entitlement.tenant_slug === 'qa-layer3i-fleet-core' && entitlement.feature_key === 'credit_products',
    );
    if (!row) return null;
    return {
      allowed: ['ENABLED', 'TRIAL', 'BETA'].includes(row.access_state),
      code: row.access_state === 'DISABLED' ? 'FEATURE_NOT_LICENSED' : row.access_state,
      message: `${row.feature_name} is not included in ${row.plan_name ?? 'this package'}.`,
      feature_key: row.feature_key,
      feature_name: row.feature_name,
      category: row.category,
      module_key: row.module_key,
      access_state: row.access_state,
      feature_state: row.feature_state,
      entitlement_status: row.entitlement_status,
      source: row.source,
      plan_name: row.plan_name,
      expires_at: row.expires_at ?? null,
      upgrade_copy: {
        benefits: [
          'Activate credit products only when the tenant is commercially ready.',
          'Keep Fleet Core fully usable without premium credit workflows.',
          'Record every upgrade request and trial action in the platform audit trail.',
        ],
        cta: 'Request KIRA Credit',
      },
    };
  }, [data?.entitlements]);

  if (isLoading) return <LoadingState />;

  if (error || !data) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <AdminBreadcrumb />
          <AdminPageHeader title="Platform Administration" description="Licensing engine unavailable" />
          <Alert variant="destructive">
            <Lock className="h-4 w-4" />
            <AlertTitle>Could not load platform licensing</AlertTitle>
            <AlertDescription>{error instanceof Error ? error.message : 'Unknown error'}</AlertDescription>
          </Alert>
        </div>
      </AdminLayout>
    );
  }

  const activePlans = data.plans.filter((plan) => plan.status === 'ACTIVE').length;
  const activeTrials = data.trials.filter((trial) => trial.trial_status === 'ACTIVE').length;
  const lockedSelected = selectedTenantEntitlements.filter((row) => ['DISABLED', 'LOCKED', 'EXPIRED'].includes(row.access_state)).length;
  const exceededLimits = data.usageLimits.filter((limit) => limit.limit_status === 'EXCEEDED').length;

  const handleExport = () => {
    const rows = buildLicensingExportRows(data.entitlements, data.usageLimits);
    exportToCSV(rows, `layer3i-platform-licensing-${new Date().toISOString().slice(0, 10)}`);
    recordAudit.mutate({
      eventType: 'PLATFORM_LICENSING_EXPORTED',
      targetType: 'platform_licensing',
      reason: 'Layer 3I licensing CSV exported',
      after: { row_count: rows.length },
    });
    logAction({
      action: 'platform_licensing_exported',
      targetType: 'platform_licensing',
      details: { row_count: rows.length },
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminBreadcrumb />
        <AdminPageHeader
          title="Platform Administration"
          description="Plans, feature entitlements, trials, usage limits, add-ons, and licensing audit"
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => syncExpiredTrials.mutate()} disabled={syncExpiredTrials.isPending}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync trials
              </Button>
              <Button onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </div>
          }
        />

        {!isPlatformOwner && (
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Tenant-scoped view</AlertTitle>
            <AlertDescription>
              Platform owners can manage every tenant. Tenant admins see their own licensing state and upgrade paths.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <KpiCard title="Active plans" value={activePlans} detail={`${data.plans.length} total packages`} icon={PackageCheck} />
          <KpiCard title="Commercial features" value={data.features.length} detail={`${data.addOns.length} add-ons seeded`} icon={Boxes} />
          <KpiCard title="Active trials" value={activeTrials} detail={`${data.trials.length} trial records`} icon={Play} />
          <KpiCard title="Exceeded limits" value={exceededLimits} detail="Hard limits requiring attention" icon={Gauge} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tenant focus</CardTitle>
            <CardDescription>Select a tenant to inspect entitlements, trials, and limits.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[minmax(260px,360px)_1fr]">
            <Select value={activeTenantId || undefined} onValueChange={setSelectedTenantId}>
              <SelectTrigger aria-label="Tenant focus">
                <SelectValue placeholder="Select tenant" />
              </SelectTrigger>
              <SelectContent>
                {data.customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Package</p>
                <p className="font-medium">{selectedTenantEntitlements[0]?.plan_name ?? 'No active package'}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Enabled</p>
                <p className="font-medium">{tenantSummary.enabled}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Locked</p>
                <p className="font-medium">{lockedSelected}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Hidden</p>
                <p className="font-medium">{tenantSummary.hidden}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="plans" className="space-y-4">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="plans">Plans</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
            <TabsTrigger value="entitlements">Entitlements</TabsTrigger>
            <TabsTrigger value="trials">Trials</TabsTrigger>
            <TabsTrigger value="usage">Usage Limits</TabsTrigger>
            <TabsTrigger value="addons">Add-Ons</TabsTrigger>
            <TabsTrigger value="upgrade">Upgrade</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="plans" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              {data.plans.map((plan) => (
                <Card key={plan.plan_id}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle>{plan.plan_name}</CardTitle>
                      <Badge variant={plan.status === 'ACTIVE' ? 'verified' : 'outline'}>{plan.status}</Badge>
                    </div>
                    <CardDescription>{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Badge variant={plan.is_base_plan ? 'secondary' : 'outline'}>
                      {plan.is_base_plan ? 'Required base' : plan.plan_key}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Assign plan</CardTitle>
                <CardDescription>High-risk plan changes require a reason and are audited.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto]">
                <Select value={activeTenantId || undefined} onValueChange={setSelectedTenantId}>
                  <SelectTrigger><SelectValue placeholder="Tenant" /></SelectTrigger>
                  <SelectContent>
                    {data.customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={selectedPlanKey} onValueChange={setSelectedPlanKey}>
                  <SelectTrigger><SelectValue placeholder="Plan" /></SelectTrigger>
                  <SelectContent>
                    {data.plans.map((plan) => <SelectItem key={plan.plan_key} value={plan.plan_key}>{plan.plan_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason" />
                <Button onClick={() => assignPlan.mutate({ customerId: activeTenantId, planKey: selectedPlanKey, reason })} disabled={!activeTenantId || !reason || assignPlan.isPending}>
                  Assign
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="features" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              {data.features.map((feature) => (
                <Card key={feature.feature_id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{feature.category}</Badge>
                      <Badge variant={accessStateTone(feature.default_flag_state)}>{feature.default_flag_state}</Badge>
                    </div>
                    <CardTitle>{feature.feature_name}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Feature state</CardTitle>
                <CardDescription>Control whether a feature is enabled, disabled, hidden, beta, or trial-gated.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto]">
                <Select value={selectedFeatureKey} onValueChange={setSelectedFeatureKey}>
                  <SelectTrigger><SelectValue placeholder="Feature" /></SelectTrigger>
                  <SelectContent>
                    {data.features.map((feature) => <SelectItem key={feature.feature_key} value={feature.feature_key}>{feature.feature_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={selectedFeatureState} onValueChange={setSelectedFeatureState}>
                  <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
                  <SelectContent>
                    {['ENABLED', 'DISABLED', 'HIDDEN', 'BETA', 'TRIAL'].map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason" />
                <Button onClick={() => setFeatureState.mutate({ featureKey: selectedFeatureKey, featureState: selectedFeatureState, reason })} disabled={!reason || setFeatureState.isPending}>
                  Update
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="entitlements" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{selectedTenant?.name ?? 'Tenant'} entitlements</CardTitle>
                <CardDescription>Module activation combines package state, feature state, and tenant entitlement.</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[460px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Feature</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Access</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Expires</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedTenantEntitlements.map((row) => (
                        <TableRow key={`${row.tenant_id}-${row.feature_key}`}>
                          <TableCell className="font-medium">{row.feature_name}</TableCell>
                          <TableCell>{row.category}</TableCell>
                          <TableCell><Badge variant={accessStateTone(row.access_state)}>{accessStateLabel(row.access_state)}</Badge></TableCell>
                          <TableCell>{row.entitlement_status ?? 'n/a'}</TableCell>
                          <TableCell>{row.source ?? 'n/a'}</TableCell>
                          <TableCell>{row.expires_at ? new Date(row.expires_at).toLocaleDateString() : 'None'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Grant or revoke entitlement</CardTitle>
                <CardDescription>Manual overrides are audited with a required reason.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto_auto]">
                <Select value={selectedFeatureKey} onValueChange={setSelectedFeatureKey}>
                  <SelectTrigger><SelectValue placeholder="Feature" /></SelectTrigger>
                  <SelectContent>
                    {data.features.map((feature) => <SelectItem key={feature.feature_key} value={feature.feature_key}>{feature.feature_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={activeTenantId || undefined} onValueChange={setSelectedTenantId}>
                  <SelectTrigger><SelectValue placeholder="Tenant" /></SelectTrigger>
                  <SelectContent>
                    {data.customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason" />
                <Button onClick={() => grantEntitlement.mutate({ customerId: activeTenantId, featureKey: selectedFeatureKey, reason })} disabled={!activeTenantId || !reason || grantEntitlement.isPending}>
                  Grant
                </Button>
                <Button variant="outline" onClick={() => revokeEntitlement.mutate({ customerId: activeTenantId, featureKey: selectedFeatureKey, reason })} disabled={!activeTenantId || !reason || revokeEntitlement.isPending}>
                  Revoke
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trials" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Trial management</CardTitle>
                <CardDescription>Trials are time-limited; expiration removes access while preserving data.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Feature</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.trials.map((trial) => (
                      <TableRow key={trial.trial_id}>
                        <TableCell>{trial.tenant_name}</TableCell>
                        <TableCell>{trial.feature_name}</TableCell>
                        <TableCell><Badge variant={trial.trial_status === 'ACTIVE' ? 'secondary' : 'outline'}>{trial.trial_status}</Badge></TableCell>
                        <TableCell>{new Date(trial.expires_at).toLocaleString()}</TableCell>
                        <TableCell className="max-w-xs truncate">{trial.reason ?? 'n/a'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Start trial</CardTitle>
                <CardDescription>Trial usage is auditable and can be synced after expiration.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto]">
                <Select value={activeTenantId || undefined} onValueChange={setSelectedTenantId}>
                  <SelectTrigger><SelectValue placeholder="Tenant" /></SelectTrigger>
                  <SelectContent>{data.customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={selectedFeatureKey} onValueChange={setSelectedFeatureKey}>
                  <SelectTrigger><SelectValue placeholder="Feature" /></SelectTrigger>
                  <SelectContent>{data.features.map((feature) => <SelectItem key={feature.feature_key} value={feature.feature_key}>{feature.feature_name}</SelectItem>)}</SelectContent>
                </Select>
                <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason" />
                <Button onClick={() => startTrial.mutate({ customerId: activeTenantId, featureKey: selectedFeatureKey, reason })} disabled={!activeTenantId || !reason || startTrial.isPending}>
                  Start trial
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="usage" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {selectedUsageLimits.map((limit) => (
                <Card key={limit.usage_limit_id ?? `${limit.tenant_id}-${limit.limit_key}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle>{limit.limit_name}</CardTitle>
                      <Badge variant={usageStatusTone(limit.limit_status)}>{limit.limit_status}</Badge>
                    </div>
                    <CardDescription>{limit.hard_limit ? 'Hard limit' : 'Soft limit'}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{limit.current_usage} used</span>
                      <span>{limit.limit_value === null ? 'Unlimited' : `${limit.limit_value} allowed`}</span>
                    </div>
                    <Progress value={usagePercent(limit)} />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Set usage limit</CardTitle>
                <CardDescription>Driver, vehicle, credit account, admin user, storage, and branch limits are configurable.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_2fr_auto]">
                <Select value={activeTenantId || undefined} onValueChange={setSelectedTenantId}>
                  <SelectTrigger><SelectValue placeholder="Tenant" /></SelectTrigger>
                  <SelectContent>{data.customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={selectedLimitKey} onValueChange={setSelectedLimitKey}>
                  <SelectTrigger><SelectValue placeholder="Limit" /></SelectTrigger>
                  <SelectContent>
                    {['driver_count', 'vehicle_count', 'credit_account_count', 'admin_user_count', 'storage_gb', 'branch_count'].map((key) => <SelectItem key={key} value={key}>{key}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="number" value={limitValue} onChange={(event) => setLimitValue(event.target.value)} />
                <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason" />
                <Button onClick={() => setUsageLimit.mutate({ customerId: activeTenantId, limitKey: selectedLimitKey, limitValue: Number(limitValue), reason })} disabled={!activeTenantId || !reason || setUsageLimit.isPending}>
                  Save
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="addons" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              {data.addOns.map((addOn) => (
                <Card key={addOn.add_on_id}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Store className="h-4 w-4 text-muted-foreground" />
                      <Badge variant={addOn.status === 'ACTIVE' ? 'verified' : 'outline'}>{addOn.status}</Badge>
                    </div>
                    <CardTitle>{addOn.add_on_name}</CardTitle>
                    <CardDescription>{addOn.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <code className="rounded bg-muted px-2 py-1 text-xs">{addOn.add_on_key}</code>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="upgrade" className="space-y-4">
            <Alert>
              <Layers3 className="h-4 w-4" />
              <AlertTitle>Upgrade experience</AlertTitle>
              <AlertDescription>
                Fleet Core remains complete. Premium modules explain the value, expose trial/upgrade actions, and avoid placeholder functionality.
              </AlertDescription>
            </Alert>
            <LockedUpgradeCard
              featureKey="credit_products"
              moduleName="KIRA Credit"
              access={qaFleetCoreCreditAccess}
              customerId={data.customers.find((customer) => customer.slug === 'qa-layer3i-fleet-core')?.id ?? activeTenantId}
            />
          </TabsContent>

          <TabsContent value="audit" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Immutable audit timeline</CardTitle>
                <CardDescription>Plan changes, entitlement changes, feature state changes, trials, usage limits, and upgrade requests are recorded here.</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {data.auditEvents.map((event) => (
                      <div key={event.audit_event_id} className="rounded-md border p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <History className="h-4 w-4 text-muted-foreground" />
                          <Badge variant="outline">{event.event_type}</Badge>
                          <span className="text-sm font-medium">{event.tenant_name ?? 'Platform'}</span>
                          <span className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString()}</span>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">{event.reason ?? 'No reason provided'}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
