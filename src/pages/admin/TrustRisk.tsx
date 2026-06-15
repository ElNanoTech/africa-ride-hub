import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  Gauge,
  IdCard,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { LoadingState } from '@/components/LoadingState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  isFleetControlIssue,
  isKycIssue,
  isOpenAccident,
  isOpenViolation,
  simulateTrustScore,
  type DriverRiskProfile,
  type TrustEvent,
  type TrustRiskLevel,
} from '@/lib/trustRisk';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useTrustRiskData } from '@/hooks/useTrustRiskData';

type MetricTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

function metricToneClass(tone: MetricTone) {
  switch (tone) {
    case 'success': return 'border-success/30 bg-success/10 text-success';
    case 'warning': return 'border-warning/30 bg-warning/10 text-warning';
    case 'danger': return 'border-destructive/30 bg-destructive/10 text-destructive';
    case 'info': return 'border-primary/30 bg-primary/10 text-primary';
    default: return 'border-border bg-card text-foreground';
  }
}

function riskVariant(risk: TrustRiskLevel) {
  if (risk === 'Low') return 'success';
  if (risk === 'Moderate') return 'outline';
  if (risk === 'High') return 'high';
  return 'destructive';
}

function healthVariant(state: string) {
  if (state === 'Healthy') return 'success';
  if (state === 'Warning') return 'high';
  return 'destructive';
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof ShieldCheck;
  tone?: MetricTone;
}) {
  return (
    <Card className={cn('border', metricToneClass(tone))}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>
          </div>
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background/80', metricToneClass(tone))}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function EventRow({ event }: { event: TrustEvent }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{event.event}</p>
          <Badge variant="outline">{event.source}</Badge>
          <span className={cn('text-sm font-medium', event.scoreImpact >= 0 ? 'text-success' : 'text-destructive')}>
            {event.scoreImpact > 0 ? '+' : ''}{event.scoreImpact}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{event.driverName} - {event.entity}</p>
        <p className="mt-1 text-xs text-muted-foreground">{formatDateShort(event.timestamp)}</p>
      </div>
      <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
        <Link to={event.route}>
          Open
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

function DriverRiskRow({
  profile,
  onOpen,
}: {
  profile: DriverRiskProfile;
  onOpen: (profile: DriverRiskProfile) => void;
}) {
  return (
    <div className="grid gap-3 rounded-md border p-4 xl:grid-cols-[1.2fr_110px_110px_110px_1.5fr_190px] xl:items-center">
      <div className="min-w-0">
        <p className="font-semibold">{profile.driverName}</p>
        <p className="text-sm text-muted-foreground">{profile.phone ?? 'No phone'}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Score</p>
        <p className="font-semibold">{profile.score ?? '—'}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Risk</p>
        <Badge variant={riskVariant(profile.risk)}>{profile.risk}</Badge>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Trend</p>
        <p className={cn('font-semibold', profile.trend >= 0 ? 'text-success' : 'text-destructive')}>
          {profile.trend > 0 ? '+' : ''}{profile.trend}
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Reason</p>
        <p className="truncate text-sm">{profile.reasons[0]}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => onOpen(profile)}>
          <FileSearch className="mr-2 h-4 w-4" />
          Detail
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to={`/admin/drivers/${profile.driverId}?tab=risk`}>Driver 360</Link>
        </Button>
      </div>
    </div>
  );
}

function RiskDistribution({ distribution }: { distribution: ReturnType<typeof useTrustRiskData>['distribution'] }) {
  const total = Object.values(distribution).reduce((sum, value) => sum + value, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Risk Distribution</CardTitle>
        <CardDescription>Default score bands: 900-1000, 800-899, 700-799, 600-699, &lt;600.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(distribution).map(([band, count]) => (
          <div key={band} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span>{band}</span>
              <span className="font-medium">{count}</span>
            </div>
            <Progress value={total > 0 ? Math.round((count / total) * 100) : 0} className="h-2" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function OverviewTab({ data }: { data: ReturnType<typeof useTrustRiskData> }) {
  const highRisk = data.driverProfiles.filter((profile) => ['High', 'Critical'].includes(profile.risk)).slice(0, 5);
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <RiskDistribution distribution={data.distribution} />
        <Card>
          <CardHeader>
            <CardTitle>Risk Alerts</CardTitle>
            <CardDescription>Score drops, repeated late payments, repeated accidents, fleet control failures, and KYC issues.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {highRisk.length === 0 ? (
              <p className="text-sm text-muted-foreground">No high or critical driver risks.</p>
            ) : highRisk.map((profile) => (
              <div key={profile.driverId} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{profile.driverName}</p>
                    <Badge variant={riskVariant(profile.risk)}>{profile.risk}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{profile.reasons.slice(0, 2).join(' · ')}</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/admin/drivers/${profile.driverId}?tab=risk`}>Open Risk</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent Trust Events</CardTitle>
          <CardDescription>Traceable score-impacting activity.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.events.slice(0, 7).map((event) => <EventRow key={event.id} event={event} />)}
        </CardContent>
      </Card>
    </div>
  );
}

function ScoreCenterTab({ data }: { data: ReturnType<typeof useTrustRiskData> }) {
  const [paysOverdue, setPaysOverdue] = useState(true);
  const [accidentRemoved, setAccidentRemoved] = useState(false);
  const [kycFixed, setKycFixed] = useState(false);
  const selected = data.driverProfiles.find((profile) => profile.risk !== 'Low') ?? data.driverProfiles[0];
  const simulation = simulateTrustScore({
    score: selected?.score ?? 500,
    paysOverdue,
    accidentRemoved,
    kycFixed,
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Score Breakdown</CardTitle>
            <CardDescription>Weights and current contribution by dimension.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.dimensions.map((dimension) => (
              <div key={dimension.key} className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_90px_130px_130px] sm:items-center">
                <p className="font-medium">{dimension.label}</p>
                <Badge variant="outline">{dimension.weight}%</Badge>
                <p className="text-sm">Current {dimension.currentContribution}</p>
                <p className="text-sm text-muted-foreground">Average {dimension.averageContribution}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Score Changes</CardTitle>
            <CardDescription>Recent movements with source and impact.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.events.filter((event) => event.scoreImpact !== 0).slice(0, 10).map((event) => <EventRow key={event.id} event={event} />)}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Score Simulation</CardTitle>
          <CardDescription>Read-only operational projection. No score changes are saved.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border p-3">
            <p className="text-sm text-muted-foreground">Driver</p>
            <p className="font-semibold">{selected?.driverName ?? 'No driver'}</p>
            <p className="mt-1 text-sm">Current score {selected?.score ?? 500}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={paysOverdue} onCheckedChange={(checked) => setPaysOverdue(checked === true)} />
            What if driver pays?
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={accidentRemoved} onCheckedChange={(checked) => setAccidentRemoved(checked === true)} />
            What if accident removed?
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={kycFixed} onCheckedChange={(checked) => setKycFixed(checked === true)} />
            What if KYC fixed?
          </label>
          <div className="rounded-md border bg-muted/20 p-4">
            <p className="text-xs uppercase text-muted-foreground">Projected score</p>
            <p className="mt-2 text-3xl font-bold">{simulation.projectedScore}</p>
            <p className={cn('mt-1 text-sm font-medium', simulation.delta >= 0 ? 'text-success' : 'text-destructive')}>
              {simulation.delta > 0 ? '+' : ''}{simulation.delta}
            </p>
          </div>
          <div className="space-y-2">
            {simulation.applied.map((line) => (
              <Badge key={line} variant="outline">{line}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminTrustRisk() {
  const guard = useRoleGuard();
  const canAccess = !guard.isLoading && guard.canManageFleet();
  const data = useTrustRiskData(canAccess);
  const [selectedDriver, setSelectedDriver] = useState<DriverRiskProfile | null>(null);

  const openContraventions = useMemo(() => data.violations.filter(isOpenViolation), [data.violations]);
  const openSinistres = useMemo(() => data.accidents.filter(isOpenAccident), [data.accidents]);
  const kycIssues = useMemo(() => data.drivers.filter(isKycIssue), [data.drivers]);
  const fleetIssues = useMemo(() => data.controls.filter((control) => isFleetControlIssue(control, data.today)), [data.controls, data.today]);
  const driverNameById = useMemo(() => new Map(data.drivers.map((driver) => [driver.id, driver.full_name ?? 'Driver'])), [data.drivers]);

  if (!guard.isLoading && !canAccess) {
    return (
      <AdminLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="text-destructive">Access denied</CardTitle>
              <CardDescription>Layer 2E Trust & Risk Center is limited to super_admin and manager roles.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-5">
        <AdminBreadcrumb items={[{ label: 'Trust & Risk' }]} />
        <AdminPageHeader
          title="Trust & Risk"
          description="Driver risk, vehicle risk, score movement, compliance, fines, sinistres, trust events, and audit in one operating center."
          action={(
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><Link to="/admin/scoring"><BarChart3 className="mr-2 h-4 w-4" />Scoring</Link></Button>
              <Button asChild variant="outline"><Link to="/admin/contraventions"><Scale className="mr-2 h-4 w-4" />Contraventions</Link></Button>
              <Button asChild variant="outline"><Link to="/admin/sinistres"><ShieldAlert className="mr-2 h-4 w-4" />Sinistres</Link></Button>
            </div>
          )}
        />

        {guard.isLoading || data.isLoading ? (
          <LoadingState message="Loading trust and risk..." />
        ) : data.isError ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-destructive">Trust & Risk unavailable</CardTitle>
              <CardDescription>{data.error instanceof Error ? data.error.message : 'Unable to load trust and risk data.'}</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Average Score" value={data.overview.averageScore} detail="Latest weekly KIRA score average." icon={Gauge} tone="info" />
              <MetricCard label="Drivers at Risk" value={data.overview.driversAtRisk} detail="High and critical driver risk." icon={Users} tone={data.overview.driversAtRisk > 0 ? 'warning' : 'success'} />
              <MetricCard label="Critical Drivers" value={data.overview.criticalDrivers} detail="Immediate manual review queue." icon={AlertTriangle} tone={data.overview.criticalDrivers > 0 ? 'danger' : 'success'} />
              <MetricCard label="Compliance Rate" value={`${data.overview.complianceRate}%`} detail="KYC plus critical compliance pressure." icon={CheckCircle2} tone={data.overview.complianceRate >= 90 ? 'success' : 'warning'} />
              <MetricCard label="Open Contraventions" value={data.overview.openContraventions} detail="Fines not cleared or liquidated." icon={Scale} tone={data.overview.openContraventions > 0 ? 'warning' : 'success'} />
              <MetricCard label="Open Sinistres" value={data.overview.openSinistres} detail="Accident cases still active." icon={ShieldAlert} tone={data.overview.openSinistres > 0 ? 'danger' : 'success'} />
              <MetricCard label="KYC Issues" value={data.overview.kycIssues} detail="Pending, rejected, missing, or expired KYC." icon={IdCard} tone={data.overview.kycIssues > 0 ? 'warning' : 'success'} />
              <MetricCard label="Fleet Control Issues" value={data.overview.fleetControlIssues} detail="Overdue or immobilized controls." icon={ClipboardCheck} tone={data.overview.fleetControlIssues > 0 ? 'danger' : 'success'} />
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="flex h-auto flex-wrap justify-start gap-1">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="driver-risk">Driver Risk</TabsTrigger>
                <TabsTrigger value="vehicle-risk">Vehicle Risk</TabsTrigger>
                <TabsTrigger value="score-center">Score Center</TabsTrigger>
                <TabsTrigger value="compliance">Compliance</TabsTrigger>
                <TabsTrigger value="contraventions">Contraventions</TabsTrigger>
                <TabsTrigger value="sinistres">Sinistres</TabsTrigger>
                <TabsTrigger value="trust-events">Trust Events</TabsTrigger>
                <TabsTrigger value="audit">Audit</TabsTrigger>
              </TabsList>

              <TabsContent value="overview"><OverviewTab data={data} /></TabsContent>

              <TabsContent value="driver-risk" className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">Driver Risk</h2>
                    <p className="text-sm text-muted-foreground">Every risk label includes reasons and recommended actions.</p>
                  </div>
                  <Button asChild variant="outline"><Link to="/admin/drivers">Drivers</Link></Button>
                </div>
                {data.driverProfiles.map((profile) => (
                  <DriverRiskRow key={profile.driverId} profile={profile} onOpen={setSelectedDriver} />
                ))}
              </TabsContent>

              <TabsContent value="vehicle-risk" className="space-y-3">
                {data.vehicleProfiles.map((vehicle) => (
                  <div key={vehicle.vehicleId} className="grid gap-3 rounded-md border p-4 lg:grid-cols-[1.3fr_1fr_120px_180px] lg:items-center">
                    <div>
                      <p className="font-semibold">{vehicle.vehicleLabel}</p>
                      <p className="text-sm text-muted-foreground">Assigned driver: {vehicle.assignedDriver ?? 'Unassigned'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {vehicle.sources.slice(0, 4).map((source) => <Badge key={source} variant="outline">{source}</Badge>)}
                    </div>
                    <Badge variant={riskVariant(vehicle.risk)}>{vehicle.risk}</Badge>
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/admin/vehicles/${vehicle.vehicleId}`}>{vehicle.recommendedAction}</Link>
                    </Button>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="score-center"><ScoreCenterTab data={data} /></TabsContent>

              <TabsContent value="compliance" className="grid gap-4 xl:grid-cols-[360px_1fr]">
                <Card>
                  <CardHeader>
                    <CardTitle>Compliance</CardTitle>
                    <CardDescription>KYC, fleet control, documents, permits, and insurance.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      ['KYC', data.compliance.kyc],
                      ['Fleet Control', data.compliance.fleetControl],
                      ['Documents', data.compliance.documents],
                      ['Permits', data.compliance.permits],
                      ['Insurance', data.compliance.insurance],
                    ].map(([label, state]) => (
                      <div key={label} className="flex items-center justify-between rounded-md border p-3">
                        <span className="font-medium">{label}</span>
                        <Badge variant={healthVariant(state)}>{state}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <div className="space-y-4">
                  <Card>
                    <CardHeader><CardTitle>KYC Compliance</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {kycIssues.slice(0, 8).map((driver) => (
                        <div key={driver.id} className="flex items-center justify-between rounded-md border p-3">
                          <span>{driver.full_name}</span>
                          <Badge variant="high">{driver.kyc_status ?? 'missing'}</Badge>
                        </div>
                      ))}
                      {kycIssues.length === 0 && <p className="text-sm text-muted-foreground">No KYC issues.</p>}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Fleet Control Compliance</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {fleetIssues.slice(0, 8).map((control) => (
                        <div key={control.id} className="flex items-center justify-between rounded-md border p-3">
                          <span>{control.vehicle_id ?? 'Vehicle'}</span>
                          <Badge variant="destructive">{control.status ?? 'overdue'}</Badge>
                        </div>
                      ))}
                      {fleetIssues.length === 0 && <p className="text-sm text-muted-foreground">No fleet control issues.</p>}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="contraventions" className="space-y-3">
                <div className="flex justify-end"><Button asChild variant="outline"><Link to="/admin/contraventions">Open Contraventions</Link></Button></div>
                <div className="hidden gap-3 rounded-md border bg-muted/20 px-4 py-2 text-xs font-medium uppercase text-muted-foreground md:grid md:grid-cols-[1.1fr_1fr_120px_120px_120px_120px_120px]">
                  <span>Driver</span>
                  <span>Vehicle</span>
                  <span>Amount</span>
                  <span>Status</span>
                  <span>Assigned</span>
                  <span>Score Impact</span>
                  <span>Actions</span>
                </div>
                {openContraventions.slice(0, 12).map((violation) => (
                  <div key={violation.id} className="grid gap-3 rounded-md border p-4 md:grid-cols-[1.1fr_1fr_120px_120px_120px_120px_120px] md:items-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Driver</p>
                      <p className="font-medium">{driverNameById.get(violation.driver_id ?? '') ?? 'Unassigned'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Vehicle</p>
                      <p className="text-sm">{violation.license_plate ?? violation.vehicle_id ?? 'Vehicle'}</p>
                    </div>
                    <p>{formatCurrency(Number(violation.amount ?? 0))}</p>
                    <Badge variant="outline">{violation.status ?? 'pending'}</Badge>
                    <p className="text-sm text-muted-foreground">Assigned</p>
                    <p className="text-sm font-medium text-destructive">Score Impact -8</p>
                    <Button asChild variant="outline" size="sm"><Link to="/admin/contraventions">View</Link></Button>
                  </div>
                ))}
                {openContraventions.length === 0 && <p className="rounded-md border p-4 text-sm text-muted-foreground">No open contraventions.</p>}
              </TabsContent>

              <TabsContent value="sinistres" className="space-y-3">
                <div className="flex justify-end"><Button asChild variant="outline"><Link to="/admin/sinistres">Open Sinistres</Link></Button></div>
                <div className="hidden gap-3 rounded-md border bg-muted/20 px-4 py-2 text-xs font-medium uppercase text-muted-foreground md:grid md:grid-cols-[1.1fr_1fr_1fr_120px_130px_130px_120px]">
                  <span>Accident</span>
                  <span>Driver</span>
                  <span>Vehicle</span>
                  <span>Status</span>
                  <span>Insurance Status</span>
                  <span>Risk Impact</span>
                  <span>Actions</span>
                </div>
                {openSinistres.slice(0, 12).map((accident) => (
                  <div key={accident.id} className="grid gap-3 rounded-md border p-4 md:grid-cols-[1.1fr_1fr_1fr_120px_130px_130px_120px] md:items-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Accident</p>
                      <p className="font-medium">{accident.case_number ?? 'Accident'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Driver</p>
                      <p className="text-sm">{driverNameById.get(accident.driver_id ?? '') ?? 'Unassigned'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Vehicle</p>
                      <p className="text-sm">{accident.vehicle_id ?? 'Vehicle'}</p>
                    </div>
                    <Badge variant="outline">{accident.status ?? 'open'}</Badge>
                    <p className="text-sm text-muted-foreground">Insurance Status</p>
                    <p className="text-sm font-medium text-destructive">Risk Impact -30</p>
                    <Button asChild variant="outline" size="sm"><Link to={accident.id ? `/admin/sinistres/${accident.id}` : '/admin/sinistres'}>Open Case</Link></Button>
                  </div>
                ))}
                {openSinistres.length === 0 && <p className="rounded-md border p-4 text-sm text-muted-foreground">No open sinistres.</p>}
              </TabsContent>

              <TabsContent value="trust-events" className="space-y-3">
                {data.events.slice(0, 30).map((event) => <EventRow key={event.id} event={event} />)}
              </TabsContent>

              <TabsContent value="audit" className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">Trust Audit</h2>
                    <p className="text-sm text-muted-foreground">Every trust event is traceable by event, driver, entity, impact, timestamp, and source.</p>
                  </div>
                  <Button asChild variant="outline"><Link to="/admin/audit">Audit Logs</Link></Button>
                </div>
                {data.events.slice(0, 30).map((event) => (
                  <div key={`audit-${event.id}`} className="grid gap-3 rounded-md border p-4 lg:grid-cols-[1fr_1fr_1fr_110px_130px_130px] lg:items-center">
                    <p className="font-medium">{event.event}</p>
                    <p>{event.driverName}</p>
                    <p className="text-sm text-muted-foreground">{event.entity}</p>
                    <p className={cn('font-medium', event.scoreImpact >= 0 ? 'text-success' : 'text-destructive')}>{event.scoreImpact}</p>
                    <p className="text-sm">{formatDateShort(event.timestamp)}</p>
                    <Badge variant="outline">{event.source}</Badge>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      <Sheet open={!!selectedDriver} onOpenChange={(open) => !open && setSelectedDriver(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selectedDriver && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedDriver.driverName}</SheetTitle>
                <SheetDescription>Driver risk detail, factors, recent events, and recommended actions.</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Score</p>
                    <p className="text-xl font-bold">{selectedDriver.score ?? '—'}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Trend</p>
                    <p className={cn('text-xl font-bold', selectedDriver.trend >= 0 ? 'text-success' : 'text-destructive')}>{selectedDriver.trend}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Risk</p>
                    <Badge variant={riskVariant(selectedDriver.risk)}>{selectedDriver.risk}</Badge>
                  </div>
                </div>
                <section>
                  <h3 className="font-semibold">Risk Factors</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedDriver.reasons.map((reason) => <Badge key={reason} variant="outline">{reason}</Badge>)}
                  </div>
                </section>
                <section>
                  <h3 className="font-semibold">Recommended Actions</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedDriver.recommendedActions.map((action) => <Badge key={action} variant="high">{action}</Badge>)}
                  </div>
                </section>
                <section className="space-y-2">
                  <h3 className="font-semibold">Recent Events</h3>
                  {selectedDriver.recentEvents.map((event) => <EventRow key={event.id} event={event} />)}
                </section>
                <Button asChild>
                  <Link to={`/admin/drivers/${selectedDriver.driverId}?tab=risk`}>
                    Open Driver 360
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}
