import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileSearch,
  FileText,
  HandCoins,
  LockKeyhole,
  PauseCircle,
  Route,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { LoadingState } from '@/components/LoadingState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CREDIT_OFFERS } from '@/lib/creditJourney';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  GROWTH_PIPELINE_STAGES,
  OWNERSHIP_PIPELINE_STAGES,
  type DriverOfferState,
  type GrowthBlocker,
  type GrowthBlockerSummary,
  type GrowthDriverProfile,
  type GrowthEligibilityState,
  type GrowthLifecycleStage,
  type GrowthOfferEvaluation,
  type GrowthOverview,
  type GrowthPipelineStage,
  type GrowthPriorityQueueItem,
  type GrowthReviewRecommendation,
  type GrowthOwnershipPipelineStage,
  type OfferStatus,
} from '@/lib/growthOwnership';
import { useGrowthOwnershipData } from '@/hooks/useGrowthOwnershipData';
import { useRoleGuard } from '@/hooks/useRoleGuard';

type BadgeVariant = ComponentProps<typeof Badge>['variant'];
type MetricTone = 'default' | 'success' | 'warning' | 'danger' | 'info';
type PipelineFilter = 'all' | 'eligible' | 'almost' | 'blocked' | 'ownership';
type PipelineView = 'kanban' | 'table';
type GrowthWorkspace = 'overview' | 'pipeline' | 'reviews' | 'offers' | 'ownership' | 'analytics';

const FILTERS: Array<{ key: PipelineFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'eligible', label: 'Eligible' },
  { key: 'almost', label: 'Almost' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'ownership', label: 'Ownership Path' },
];

const WORKSPACES: Array<{ key: GrowthWorkspace; label: string; path: string; icon: typeof TrendingUp }> = [
  { key: 'overview', label: 'Overview', path: '/admin/growth', icon: TrendingUp },
  { key: 'pipeline', label: 'Driver Pipeline', path: '/admin/growth/pipeline', icon: Route },
  { key: 'reviews', label: 'Eligibility Reviews', path: '/admin/growth/reviews', icon: ClipboardCheck },
  { key: 'offers', label: 'Product Offers', path: '/admin/growth/offers', icon: HandCoins },
  { key: 'ownership', label: 'Ownership Pipeline', path: '/admin/growth/ownership', icon: CalendarClock },
  { key: 'analytics', label: 'Growth Analytics', path: '/admin/growth/analytics', icon: BarChart3 },
];

const REVIEW_SECTIONS = ['Identity', 'Trust', 'Financial', 'Vehicle', 'Growth', 'Risk', 'Offer Readiness'] as const;

function workspaceFromPath(pathname: string): GrowthWorkspace {
  if (pathname.includes('/admin/growth/pipeline')) return 'pipeline';
  if (pathname.includes('/admin/growth/reviews')) return 'reviews';
  if (pathname.includes('/admin/growth/offers')) return 'offers';
  if (pathname.includes('/admin/growth/ownership')) return 'ownership';
  if (pathname.includes('/admin/growth/analytics')) return 'analytics';
  return 'overview';
}

function workspaceTitle(workspace: GrowthWorkspace) {
  return WORKSPACES.find((item) => item.key === workspace)?.label ?? 'Overview';
}

function workspaceDescription(workspace: GrowthWorkspace) {
  switch (workspace) {
    case 'pipeline':
      return 'Where every driver sits in the ownership journey, with Kanban and data-grid operating views.';
    case 'reviews':
      return 'Human review of automated eligibility decisions, recommendations, blockers, and note-required actions.';
    case 'offers':
      return 'Controlled ownership product catalog, rule visibility, and disabled publishing guardrails.';
    case 'ownership':
      return 'Application and ownership progression with SLA and escalation visibility.';
    case 'analytics':
      return 'Executive, cohort, funnel, risk, and financial analytics built from current platform records.';
    default:
      return 'Operational command center for growing drivers from renters into owners.';
  }
}

function compactDate(value: string | null) {
  if (!value) return 'None';
  return value.slice(0, 10);
}

function reviewVariant(recommendation: GrowthReviewRecommendation): BadgeVariant {
  if (recommendation === 'Approve') return 'approved';
  if (recommendation === 'Manual Override') return 'high';
  if (recommendation === 'Reject') return 'destructive';
  return 'pending';
}

function pipelineVariant(stage: GrowthPipelineStage): BadgeVariant {
  if (['Eligible', 'Approved'].includes(stage)) return 'approved';
  if (['Ownership Active', 'Fleet Entrepreneur'].includes(stage)) return 'success';
  if (['Almost Eligible', 'Submitted', 'Application Started'].includes(stage)) return 'pending';
  if (stage === 'Offer Published') return 'active';
  return 'outline';
}

function ownershipVariant(stage: GrowthOwnershipPipelineStage | null): BadgeVariant {
  if (!stage) return 'outline';
  if (stage === 'Ownership Active') return 'success';
  if (['Approved', 'Ready For Activation'].includes(stage)) return 'approved';
  if (['Awaiting Down Payment', 'Awaiting Contract', 'Awaiting Vehicle'].includes(stage)) return 'high';
  return 'pending';
}

function metricToneClass(tone: MetricTone) {
  switch (tone) {
    case 'success': return 'border-success/30 bg-success/10 text-success';
    case 'warning': return 'border-warning/30 bg-warning/10 text-warning';
    case 'danger': return 'border-destructive/30 bg-destructive/10 text-destructive';
    case 'info': return 'border-primary/30 bg-primary/10 text-primary';
    default: return 'border-border bg-card text-foreground';
  }
}

function eligibilityVariant(state: GrowthEligibilityState): BadgeVariant {
  if (['ELIGIBLE_FOR_REVIEW', 'OFFER_READY'].includes(state)) return 'approved';
  if (['APPLICATION_SUBMITTED', 'APPLICATION_STARTED', 'APPLICATION_APPROVED', 'ACTIVATION_PENDING'].includes(state)) return 'pending';
  if (['ACTIVE_OWNERSHIP_PATH', 'COMPLETED'].includes(state)) return 'success';
  if (state === 'ALMOST_ELIGIBLE') return 'high';
  if (['NOT_ELIGIBLE', 'SUSPENDED', 'REJECTED'].includes(state)) return 'destructive';
  return 'outline';
}

function offerStatusVariant(status: OfferStatus): BadgeVariant {
  if (status === 'ACTIVE') return 'active';
  if (status === 'PAUSED') return 'high';
  if (status === 'EXPIRED' || status === 'ARCHIVED') return 'outline';
  return 'outline';
}

function driverOfferVariant(state: DriverOfferState): BadgeVariant {
  if (['AVAILABLE', 'VIEWED', 'STARTED'].includes(state)) return 'success';
  if (['SUBMITTED', 'ACCEPTED_FOR_REVIEW', 'MOVED_TO_CREDIT_ENGINE'].includes(state)) return 'approved';
  if (['WITHDRAWN', 'EXPIRED'].includes(state)) return 'destructive';
  if (state === 'LOCKED_WITH_REASON') return 'high';
  return 'outline';
}

function blockerVariant(blocker: Pick<GrowthBlocker, 'severity'>): BadgeVariant {
  if (blocker.severity === 'critical') return 'destructive';
  if (blocker.severity === 'warning') return 'high';
  return 'outline';
}

function stageToneClass(stage: GrowthLifecycleStage) {
  switch (stage) {
    case 'Financing Eligible Driver': return 'border-primary/30 bg-primary/10 text-primary';
    case 'Vehicle Owner':
    case 'Fleet Entrepreneur':
      return 'border-success/30 bg-success/10 text-success';
    case 'Trusted Driver': return 'border-secondary/40 bg-secondary/20 text-secondary';
    case 'Daily Rental Driver': return 'border-warning/30 bg-warning/10 text-warning';
    default: return 'border-border bg-muted text-muted-foreground';
  }
}

function formatState(state: string) {
  return state.replace(/_/g, ' ');
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
  icon: typeof TrendingUp;
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

function WorkspaceNav({ active }: { active: GrowthWorkspace }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {WORKSPACES.map((workspace) => {
        const Icon = workspace.icon;
        const isActive = workspace.key === active;
        return (
          <Button
            key={workspace.key}
            asChild
            variant={isActive ? 'default' : 'outline'}
            className="h-auto min-h-12 justify-start whitespace-normal px-3 py-3 text-left"
          >
            <Link to={workspace.path} aria-current={isActive ? 'page' : undefined}>
              <Icon className="mr-2 h-4 w-4 shrink-0" />
              <span>{workspace.label}</span>
            </Link>
          </Button>
        );
      })}
    </div>
  );
}

function StageBadge({ stage }: { stage: GrowthLifecycleStage }) {
  return (
    <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold', stageToneClass(stage))}>
      {stage}
    </span>
  );
}

function RecommendationList({ recommendations }: { recommendations: string[] }) {
  return (
    <div className="space-y-2">
      {recommendations.map((recommendation) => (
        <div key={recommendation} className="flex gap-2 rounded-md border p-2 text-sm">
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>{recommendation}</span>
        </div>
      ))}
    </div>
  );
}

function PriorityQueueRow({ item }: { item: GrowthPriorityQueueItem }) {
  const tone: BadgeVariant = item.priority === 'high' ? 'destructive' : item.priority === 'medium' ? 'high' : 'outline';
  return (
    <Link to={item.route} className="block rounded-md border p-3 transition-colors hover:bg-muted/60">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{item.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{item.count} item(s)</p>
        </div>
        <Badge variant={tone}>{item.priority}</Badge>
      </div>
    </Link>
  );
}

function OverviewTab({
  overview,
  attentionQueue,
  onOpen,
}: {
  overview: GrowthOverview;
  attentionQueue: GrowthDriverProfile[];
  onOpen: (profile: GrowthDriverProfile) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Eligible Drivers" value={overview.eligibleDrivers} detail="Ready for human eligibility review." icon={BadgeCheck} tone={overview.eligibleDrivers > 0 ? 'success' : 'default'} />
        <MetricCard label="Almost Eligible" value={overview.almostEligibleDrivers} detail="Need intervention before review." icon={TrendingUp} tone="info" />
        <MetricCard label="Offers Published" value={overview.offersPublished} detail="Must remain zero until persisted product offers and audit exist." icon={LockKeyhole} tone="default" />
        <MetricCard label="Applications Started" value={overview.applicationsStarted} detail="Application records in an initial state." icon={FileText} tone="info" />
        <MetricCard label="Applications Submitted" value={overview.applicationsSubmitted} detail="Submitted or further along in ownership review." icon={ClipboardCheck} tone="warning" />
        <MetricCard label="Applications Approved" value={overview.applicationsApproved} detail="Approved by existing credit or ownership workflows." icon={CheckCircle2} tone="success" />
        <MetricCard label="Ownership Active" value={overview.ownershipActive} detail="Active ownership path or completed owner records." icon={Route} tone="success" />
        <MetricCard label="Fleet Entrepreneurs" value={overview.fleetEntrepreneurs} detail="Fleet expansion stage from persisted ownership records." icon={Users} tone="info" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_390px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Growth Funnel</CardTitle>
              <CardDescription>Verified Driver to Ownership Active. Every stage links to its operating view.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {overview.growthFunnel.map((stage, index) => {
                const percent = Math.round((stage.count / Math.max(1, overview.totalDrivers)) * 100);
                return (
                  <Link key={stage.key} to={stage.route} className="block rounded-md border p-3 transition-colors hover:bg-muted/60">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-muted text-xs font-semibold">
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium">{stage.label}</p>
                          <p className="text-xs text-muted-foreground">{stage.count} driver(s)</p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <Progress value={percent} className="mt-3 h-2" />
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Blockers Panel</CardTitle>
              <CardDescription>Top eligibility blockers with direct links to filtered drivers.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {overview.topBlockers.length === 0 ? (
                <div className="rounded-md border p-3 text-sm text-muted-foreground md:col-span-2">No blockers are currently detected.</div>
              ) : overview.topBlockers.map((blocker) => (
                <Link key={`${blocker.source}-${blocker.key}`} to={blocker.route} className="rounded-md border p-3 transition-colors hover:bg-muted/60">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{blocker.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{blocker.source}</p>
                    </div>
                    <Badge variant={blockerVariant(blocker)}>{blocker.count}</Badge>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Operating Guardrails</CardTitle>
              <CardDescription>Part 2 adds screen architecture without enabling unsafe financial side effects.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border p-3">
                <LockKeyhole className="mb-2 h-4 w-4 text-warning" />
                <p className="font-medium">Publishing disabled</p>
                <p className="mt-1 text-sm text-muted-foreground">Requires persisted product offers, immutable eligibility snapshots, and audit events.</p>
              </div>
              <div className="rounded-md border p-3">
                <ShieldCheck className="mb-2 h-4 w-4 text-primary" />
                <p className="font-medium">Trust gates applied</p>
                <p className="mt-1 text-sm text-muted-foreground">KYC, risk flags, sinistres, contraventions, fleet controls, and overdue payments can block review.</p>
              </div>
              <div className="rounded-md border p-3">
                <Banknote className="mb-2 h-4 w-4 text-success" />
                <p className="font-medium">Existing engine handoffs</p>
                <p className="mt-1 text-sm text-muted-foreground">Loans, contracts, finance, wallets, Trust & Risk, and Driver 360 remain systems of record.</p>
              </div>
              <div className="rounded-md border p-3">
                <ClipboardCheck className="mb-2 h-4 w-4 text-primary" />
                <p className="font-medium">Permission model</p>
                <p className="mt-1 text-sm text-muted-foreground">growth.view, growth.review, growth.publish, growth.override, growth.manage_offers, growth.analytics, growth.admin.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Priority Queue</CardTitle>
              <CardDescription>System-generated operational queue.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {overview.priorityQueue.map((item) => (
                <PriorityQueueRow key={item.key} item={item} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Growth Attention Queue</CardTitle>
              <CardDescription>Review-ready, almost-ready, blocked, and ownership-path drivers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {attentionQueue.length === 0 ? (
                <p className="text-sm text-muted-foreground">No drivers need growth review.</p>
              ) : attentionQueue.map((profile) => (
                <div key={profile.driverId} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{profile.driverName}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={reviewVariant(profile.reviewRecommendation)}>{profile.reviewRecommendation}</Badge>
                      <Button type="button" variant="outline" size="sm" onClick={() => onOpen(profile)}>
                        <FileSearch className="mr-2 h-4 w-4" />
                        Review
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{profile.score ?? 'No score'} score</span>
                    <span>{profile.weeksHistory} weeks</span>
                    <span>{profile.onTimeRate}% on-time</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{profile.nextAction}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PipelineTab({
  profiles,
  filter,
  view,
  onFilterChange,
  onViewChange,
  onOpen,
}: {
  profiles: GrowthDriverProfile[];
  filter: PipelineFilter;
  view: PipelineView;
  onFilterChange: (filter: PipelineFilter) => void;
  onViewChange: (view: PipelineView) => void;
  onOpen: (profile: GrowthDriverProfile) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedCount = selectedIds.size;
  const toggleDriver = (driverId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(driverId)) next.delete(driverId);
      else next.add(driverId);
      return next;
    });
  };
  const toggleAll = () => {
    setSelectedIds((current) => current.size === profiles.length ? new Set() : new Set(profiles.map((profile) => profile.driverId)));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle>Driver Pipeline</CardTitle>
              <CardDescription>Operational growth management across verified, trusted, eligible, application, and ownership stages.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant={view === 'kanban' ? 'default' : 'outline'} size="sm" onClick={() => onViewChange('kanban')}>
                <Route className="mr-2 h-4 w-4" />
                Pipeline View
              </Button>
              <Button type="button" variant={view === 'table' ? 'default' : 'outline'} size="sm" onClick={() => onViewChange('table')}>
                <ClipboardList className="mr-2 h-4 w-4" />
                Data Grid View
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <Button key={item.key} type="button" variant={filter === item.key ? 'default' : 'outline'} size="sm" onClick={() => onFilterChange(item.key)}>
                {item.label}
              </Button>
            ))}
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-medium">Bulk Actions</p>
                <p className="text-sm text-muted-foreground">{selectedCount} selected. Workflow actions require notes, audit identity, and persisted queue records before they can mutate state.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {['Assign Reviewer', 'Request Documents', 'Send Reminder', 'Move To Review Queue', 'Export'].map((action) => (
                  <Button key={action} type="button" variant="outline" size="sm" disabled>
                    <LockKeyhole className="mr-2 h-4 w-4" />
                    {action}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {view === 'kanban' ? (
            <div className="grid gap-3 xl:grid-cols-5">
              {GROWTH_PIPELINE_STAGES.map((stage) => {
                const stageProfiles = profiles.filter((profile) => profile.pipelineStage === stage);
                return (
                  <div key={stage} className="min-h-[220px] rounded-md border bg-background">
                    <div className="flex items-center justify-between gap-2 border-b p-3">
                      <Badge variant={pipelineVariant(stage)}>{stage}</Badge>
                      <span className="text-sm font-semibold">{stageProfiles.length}</span>
                    </div>
                    <div className="space-y-2 p-2">
                      {stageProfiles.length === 0 ? (
                        <p className="px-2 py-4 text-sm text-muted-foreground">No drivers in this stage.</p>
                      ) : stageProfiles.map((profile) => (
                        <PipelineDriverCard
                          key={profile.driverId}
                          profile={profile}
                          selected={selectedIds.has(profile.driverId)}
                          onToggle={() => toggleDriver(profile.driverId)}
                          onOpen={() => onOpen(profile)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all drivers"
                      checked={profiles.length > 0 && selectedCount === profiles.length}
                      onChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      No drivers match this growth filter.
                    </TableCell>
                  </TableRow>
                ) : profiles.map((profile) => (
                  <PipelineDriverRow
                    key={profile.driverId}
                    profile={profile}
                    selected={selectedIds.has(profile.driverId)}
                    onToggle={() => toggleDriver(profile.driverId)}
                    onOpen={() => onOpen(profile)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DriverAvatar({ profile }: { profile: GrowthDriverProfile }) {
  const initials = profile.driverName
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'DR';

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted text-xs font-semibold">
      {initials}
    </div>
  );
}

function QuickActions({ profile, onOpen, compact = false }: { profile: GrowthDriverProfile; onOpen: () => void; compact?: boolean }) {
  const size = compact ? 'sm' : 'default';
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" size={size} onClick={onOpen}>
        <FileSearch className="mr-2 h-4 w-4" />
        View Profile
      </Button>
      <Button asChild variant="outline" size={size}>
        <Link to={`/admin/growth/reviews?driver=${profile.driverId}`}>
          <ClipboardCheck className="mr-2 h-4 w-4" />
          Review Eligibility
        </Link>
      </Button>
      <Button type="button" variant="outline" size={size} disabled title={profile.publishDisabledReason}>
        <LockKeyhole className="mr-2 h-4 w-4" />
        Publish Offer
      </Button>
      <Button type="button" variant="outline" size={size} disabled title="Pause requires a persisted eligibility state, required note, and audit record.">
        <PauseCircle className="mr-2 h-4 w-4" />
        Pause
      </Button>
      <Button asChild variant="outline" size={size}>
        <Link to="/admin/trust-risk">
          <ShieldAlert className="mr-2 h-4 w-4" />
          Escalate Risk
        </Link>
      </Button>
      <Button asChild variant="outline" size={size}>
        <Link to={`/admin/drivers/${profile.driverId}?tab=activity`}>
          <FileText className="mr-2 h-4 w-4" />
          Add Note
        </Link>
      </Button>
    </div>
  );
}

function PipelineDriverCard({
  profile,
  selected,
  onToggle,
  onOpen,
}: {
  profile: GrowthDriverProfile;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start gap-3">
        <input type="checkbox" aria-label={`Select ${profile.driverName}`} checked={selected} onChange={onToggle} />
        <DriverAvatar profile={profile} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{profile.driverName}</p>
            <Badge variant={pipelineVariant(profile.pipelineStage)}>{profile.pipelineStage}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">ID {profile.driverId}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Score</p>
              <p className="font-semibold">{profile.score ?? 'None'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Days</p>
              <p className="font-semibold">{profile.daysInStage}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Vehicle</p>
              <p className="truncate font-semibold">{profile.currentVehicleLabel ?? 'No vehicle'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Payment</p>
              <p className="font-semibold">{compactDate(profile.lastPaymentDate)}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant={reviewVariant(profile.reviewRecommendation)}>{profile.reviewRecommendation}</Badge>
            <Badge variant={profile.riskLevel ? 'high' : 'outline'}>{profile.riskLevel ?? 'No risk hold'}</Badge>
          </div>
          <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{profile.nextAction}</p>
          <div className="mt-3">
            <QuickActions profile={profile} onOpen={onOpen} compact />
          </div>
        </div>
      </div>
    </div>
  );
}

function PipelineDriverRow({
  profile,
  selected,
  onToggle,
  onOpen,
}: {
  profile: GrowthDriverProfile;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <TableRow>
      <TableCell>
        <input type="checkbox" aria-label={`Select ${profile.driverName}`} checked={selected} onChange={onToggle} />
      </TableCell>
      <TableCell>
        <div className="flex min-w-[190px] items-center gap-3">
          <DriverAvatar profile={profile} />
          <div>
            <p className="font-semibold">{profile.driverName}</p>
            <p className="text-xs text-muted-foreground">ID {profile.driverId}</p>
          </div>
        </div>
      </TableCell>
      <TableCell><Badge variant={pipelineVariant(profile.pipelineStage)}>{profile.pipelineStage}</Badge></TableCell>
      <TableCell>
        <p className="font-semibold">{profile.score ?? 'None'}</p>
        <Progress value={profile.scoreProgress} className="mt-2 h-2 min-w-[110px]" />
      </TableCell>
      <TableCell>{profile.currentVehicleLabel ?? 'No vehicle'}</TableCell>
      <TableCell>{profile.daysInStage}</TableCell>
      <TableCell>{compactDate(profile.lastPaymentDate)}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={reviewVariant(profile.reviewRecommendation)}>{profile.reviewRecommendation}</Badge>
          <Badge variant={profile.riskLevel ? 'high' : 'outline'}>{profile.riskLevel ?? 'Clear'}</Badge>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <QuickActions profile={profile} onOpen={onOpen} compact />
      </TableCell>
    </TableRow>
  );
}

function EligibilityReviewsWorkspace({
  profiles,
  selectedProfile,
  onOpen,
}: {
  profiles: GrowthDriverProfile[];
  selectedProfile: GrowthDriverProfile | null;
  onOpen: (profile: GrowthDriverProfile) => void;
}) {
  const queue = profiles
    .filter((profile) => profile.reviewRecommendation !== 'Reject' || profile.blockers.some((blocker) => blocker.severity === 'critical'))
    .slice(0, 25);
  const detail = selectedProfile ?? queue[0] ?? profiles[0] ?? null;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_430px]">
      <Card>
        <CardHeader>
          <CardTitle>Review Queue</CardTitle>
          <CardDescription>Should this driver receive ownership opportunities?</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Rental History</TableHead>
                <TableHead>Payment Reliability</TableHead>
                <TableHead>KYC Status</TableHead>
                <TableHead>Risk Flags</TableHead>
                <TableHead>Recommendation</TableHead>
                <TableHead className="text-right">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No drivers are currently in the eligibility review queue.</TableCell>
                </TableRow>
              ) : queue.map((profile) => {
                const kycBlocked = profile.blockers.some((blocker) => blocker.key === 'kyc');
                return (
                  <TableRow key={profile.driverId}>
                    <TableCell>
                      <div className="min-w-[180px]">
                        <p className="font-semibold">{profile.driverName}</p>
                        <p className="text-xs text-muted-foreground">ID {profile.driverId}</p>
                      </div>
                    </TableCell>
                    <TableCell>{profile.score ?? 'None'}</TableCell>
                    <TableCell>{profile.weeksHistory} scored week(s)</TableCell>
                    <TableCell>{profile.onTimeRate}% on-time</TableCell>
                    <TableCell><Badge variant={kycBlocked ? 'destructive' : 'success'}>{kycBlocked ? 'KYC Missing' : 'KYC Clear'}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={profile.riskLevel ? 'high' : 'outline'}>{profile.riskLevel ?? 'None'}</Badge>
                    </TableCell>
                    <TableCell><Badge variant={reviewVariant(profile.reviewRecommendation)}>{profile.reviewRecommendation}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button type="button" variant="outline" size="sm" onClick={() => onOpen(profile)}>
                        <FileSearch className="mr-2 h-4 w-4" />
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Review Screen</CardTitle>
          <CardDescription>Core operating sections for one eligibility decision.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {detail ? (
            <>
              <div className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{detail.driverName}</p>
                    <p className="text-sm text-muted-foreground">{detail.phone ?? 'No phone'} · ID {detail.driverId}</p>
                  </div>
                  <Badge variant={reviewVariant(detail.reviewRecommendation)}>{detail.reviewRecommendation}</Badge>
                </div>
              </div>

              <div className="space-y-3">
                {REVIEW_SECTIONS.map((section) => (
                  <ReviewSection key={section} section={section} profile={detail} />
                ))}
              </div>

              <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
                <p className="font-medium">Decision actions require notes</p>
                <p className="mt-1 text-sm text-muted-foreground">Approve, reject, pause, override, publish, and document requests remain disabled until notes, user identity, timestamp, before/after state, and audit write support exist.</p>
                <textarea
                  className="mt-3 min-h-20 w-full rounded-md border bg-background p-2 text-sm"
                  placeholder="Decision note required before future action enablement"
                  disabled
                />
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {['Approve Eligibility', 'Reject Eligibility', 'Pause Eligibility', 'Escalate Risk', 'Manual Override', 'Publish Offer', 'Request Documents'].map((action) => (
                    <Button key={action} type="button" variant="outline" disabled>
                      <LockKeyhole className="mr-2 h-4 w-4" />
                      {action}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No review detail is available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReviewSection({ section, profile }: { section: (typeof REVIEW_SECTIONS)[number]; profile: GrowthDriverProfile }) {
  const missingRequirements = profile.blockers.map((blocker) => blocker.label).slice(0, 3);
  const eligibleOffers = profile.offers.filter((offer) => offer.criteriaMet);
  const blockedOffers = profile.offers.filter((offer) => !offer.criteriaMet);

  switch (section) {
    case 'Identity':
      return <ReviewInfo title="Identity" rows={[['Name', profile.driverName], ['License', 'Driver 360 source'], ['KYC', profile.blockers.some((blocker) => blocker.key === 'kyc') ? 'Missing or incomplete' : 'No KYC blocker'], ['Phone', profile.phone ?? 'No phone'], ['Address', 'Driver 360 source'], ['Verification dates', compactDate(profile.createdAt)]]} />;
    case 'Trust':
      return <ReviewInfo title="Trust" rows={[['Current KIRA Score', String(profile.score ?? 'None')], ['30-day trend', 'Score history source'], ['90-day trend', 'Score history source'], ['Score factor breakdown', `${profile.growthProgress}% growth readiness`], ['Explainability panel', profile.recommendations[0] ?? 'Continue monitoring']]} />;
    case 'Financial':
      return <ReviewInfo title="Financial" rows={[['Invoice History', `${profile.weeksHistory} scored week(s)`], ['On-Time %', `${profile.onTimeRate}%`], ['Wallet History', formatCurrency(profile.walletBalance)], ['Collections History', 'Financial Operations source'], ['Overdue Behavior', profile.blockers.find((blocker) => blocker.key === 'overdue')?.label ?? 'No overdue blocker']]} />;
    case 'Vehicle':
      return <ReviewInfo title="Vehicle" rows={[['Assignments', profile.currentVehicleLabel ?? 'No active vehicle'], ['Returns', 'Driver 360 rentals source'], ['Damage Events', profile.blockers.find((blocker) => blocker.source === 'sinistres')?.label ?? 'No open sinistre blocker'], ['Maintenance Events', 'Vehicle Operations source'], ['Utilization', profile.activeRental ? 'Active rental' : 'No active rental']]} />;
    case 'Growth':
      return <ReviewInfo title="Growth" rows={[['Current Stage', profile.pipelineStage], ['Next Stage', profile.nextStage], ['Progress %', `${profile.growthProgress}%`], ['Missing Requirements', missingRequirements.length > 0 ? missingRequirements.join(' · ') : 'None detected'], ['Projected Eligibility Date', profile.projectedEligibilityDate ?? 'Manual review required']]} />;
    case 'Risk':
      return <ReviewInfo title="Risk" rows={[['Contraventions', profile.blockers.find((blocker) => blocker.source === 'contraventions')?.label ?? 'No contravention blocker'], ['Sinistres', profile.blockers.find((blocker) => blocker.source === 'sinistres')?.label ?? 'No sinistre blocker'], ['Compliance Issues', profile.blockers.find((blocker) => blocker.source === 'fleet_control')?.label ?? 'No fleet-control blocker'], ['Manual Flags', profile.riskReasons.join(' · ') || profile.riskLevel || 'None']]} />;
    case 'Offer Readiness':
      return <ReviewInfo title="Offer Readiness" rows={[['Eligible Offers', String(eligibleOffers.length)], ['Blocked Offers', String(blockedOffers.length)], ['Reasons', profile.publishDisabledReason], ['Required Down Payment', eligibleOffers[0] ? formatCurrency(eligibleOffers[0].terms.downPayment) : 'No eligible draft offer'], ['Required Documents', profile.offers[0]?.requiredDocuments.join(', ') ?? 'No offer template']]} />;
    default:
      return null;
  }
}

function ReviewInfo({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="rounded-md border p-3">
      <p className="font-semibold">{title}</p>
      <div className="mt-3 space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 text-sm sm:grid-cols-[145px_1fr]">
            <p className="text-muted-foreground">{label}</p>
            <p className="font-medium">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function OfferReadinessCard({ offer }: { offer: GrowthOfferEvaluation }) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{offer.offerName}</p>
          <p className="text-sm text-muted-foreground">{formatCurrency(offer.terms.amount)} · {offer.terms.termMonths} months</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={offerStatusVariant(offer.offerStatus)}>{offer.offerStatus}</Badge>
          <Badge variant={driverOfferVariant(offer.driverOfferState)}>{formatState(offer.driverOfferState)}</Badge>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Daily</p>
          <p className="font-medium">{formatCurrency(offer.terms.dailyPayment)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Down payment</p>
          <p className="font-medium">{formatCurrency(offer.terms.downPayment)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Score gap</p>
          <p className="font-medium">{offer.gaps.score}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Weeks gap</p>
          <p className="font-medium">{offer.gaps.weeks}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{offer.unavailableReason ?? offer.adminApprovalRule}</p>
    </div>
  );
}

function OffersTab({
  profiles,
  selectedProfile,
  onOpenProfile,
}: {
  profiles: GrowthDriverProfile[];
  selectedProfile: GrowthDriverProfile | null;
  onOpenProfile: (profile: GrowthDriverProfile) => void;
}) {
  const templateRows = CREDIT_OFFERS.map((offer) => {
    const evaluations = profiles
      .map((profile) => profile.offers.find((evaluation) => evaluation.offerType === offer.type))
      .filter((evaluation): evaluation is GrowthOfferEvaluation => Boolean(evaluation));
    const applications = profiles.filter((profile) => profile.currentApplication?.loan_type === offer.type || profile.currentApplication?.loan_type === offer.type.replace('_loan', '')).length;
    const approvals = profiles.filter((profile) =>
      (profile.currentApplication?.loan_type === offer.type || profile.currentApplication?.loan_type === offer.type.replace('_loan', ''))
      && normalizeLoanStatus(profile.currentApplication?.status) === 'approved',
    ).length;
    return {
      offer,
      readyDrivers: evaluations.filter((evaluation) => evaluation.criteriaMet).length,
      lockedDrivers: evaluations.filter((evaluation) => !evaluation.criteriaMet).length,
      applications,
      approvals,
    };
  });
  const profile = selectedProfile ?? profiles[0] ?? null;
  const selectedOffer = templateRows[templateRows.length - 1] ?? templateRows[0] ?? null;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_430px]">
      <Card>
        <CardHeader>
          <CardTitle>Offer Catalog</CardTitle>
          <CardDescription>Ownership product templates are DRAFT and not driver-visible. Published Count must remain 0.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {templateRows.map(({ offer, readyDrivers, lockedDrivers, applications, approvals }) => (
              <Card key={offer.type} className="border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{offer.title}</p>
                      <p className="text-sm text-muted-foreground">{catalogNameFor(offer.category)}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Badge variant="outline">DRAFT</Badge>
                      <Badge variant="outline">NOT_VISIBLE</Badge>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <CatalogMetric label="Eligibility Count" value={readyDrivers} />
                    <CatalogMetric label="Published Count" value={0} />
                    <CatalogMetric label="Application Count" value={applications} />
                    <CatalogMetric label="Approval Count" value={approvals} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-md border bg-muted/40 p-2 text-sm">
                    <span className="text-muted-foreground">Conversion %</span>
                    <span className="font-semibold">0%</span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">{lockedDrivers} driver(s) remain blocked by eligibility, risk, or missing source requirements.</p>
                  <Button type="button" variant="outline" size="sm" className="mt-3 w-full justify-start" disabled>
                    <LockKeyhole className="mr-2 h-4 w-4" />
                    Publish disabled
                  </Button>
                </CardContent>
              </Card>
            ))}

            <Card className="border border-dashed">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">Fleet Entrepreneur Program</p>
                    <p className="text-sm text-muted-foreground">Not configured as a persisted offer</p>
                  </div>
                  <Badge variant="outline">NOT_CONFIGURED</Badge>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">Shown only as a future catalog slot from the Part 2 specification. It is not a driver-visible offer.</p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Offer Detail</CardTitle>
            <CardDescription>Overview, rules, terms, documents, approvals, analytics, and audit readiness.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedOffer ? (
              <>
                {['Overview', 'Eligibility Rules', 'Terms', 'Documents', 'Approvals', 'Analytics', 'Audit'].map((section) => (
                  <div key={section} className="rounded-md border p-3">
                    <p className="font-medium">{section}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{offerDetailText(section, selectedOffer.offer.title)}</p>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No draft offer template is available.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rule Builder</CardTitle>
            <CardDescription>No-code configuration preview. Rules are read-only until product-offer persistence exists.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedOffer && [
              ['Minimum Score', `KIRA score must be at least ${selectedOffer.offer.requiredScore}`, `score >= ${selectedOffer.offer.requiredScore}`, selectedOffer.readyDrivers],
              ['Minimum Rental Days', `${selectedOffer.offer.requiredWeeks} scored weeks required`, `weeksHistory >= ${selectedOffer.offer.requiredWeeks}`, selectedOffer.readyDrivers],
              ['Maximum Overdue Invoices', 'No overdue invoice/payment blockers', 'critical overdue blockers = 0', selectedOffer.lockedDrivers],
              ['Minimum On-Time %', `Payment reliability at least ${selectedOffer.offer.requiredOnTimeRate}%`, `onTimeRate >= ${selectedOffer.offer.requiredOnTimeRate}`, selectedOffer.readyDrivers],
              ['Minimum Wallet Activity', 'Wallet must not be negative', 'walletBalance >= 0', profiles.filter((profile) => profile.walletBalance >= 0).length],
              ['Required KYC Level', 'KYC must be clear', 'kyc blocker absent', profiles.filter((profile) => !profile.blockers.some((blocker) => blocker.key === 'kyc')).length],
              ['No Serious Risk Flags', 'Risk, sinistre, and contravention blockers must be clear', 'critical trust blockers = 0', profiles.filter((profile) => !profile.blockers.some((blocker) => ['risk', 'sinistres', 'contraventions'].includes(blocker.source))).length],
            ].map(([meaning, business, logic, affected]) => (
              <div key={meaning} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{meaning}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Business meaning: {business}</p>
                    <p className="mt-1 text-xs text-muted-foreground">System logic: {logic}</p>
                  </div>
                  <Badge variant="outline">{affected} affected</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Driver Offer Readiness</CardTitle>
            <CardDescription>Per-driver evaluation without publishing or financial activation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile ? (
              <>
                <div className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{profile.driverName}</p>
                      <p className="text-sm text-muted-foreground">{profile.score ?? 'No score'} score · {profile.onTimeRate}% on-time</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => onOpenProfile(profile)}>
                      <FileSearch className="mr-2 h-4 w-4" />
                      Review
                    </Button>
                  </div>
                </div>
                {profile.offers.map((offer) => (
                  <OfferReadinessCard key={offer.offerType} offer={offer} />
                ))}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No driver is available for offer readiness.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function normalizeLoanStatus(status: string | null | undefined) {
  return (status ?? '').toLowerCase().trim();
}

function catalogNameFor(category: string) {
  if (category === 'Voiture') return 'Lease-to-Own / Vehicle Financing';
  if (category === 'Moto') return 'Vehicle Financing';
  return 'Premium Driver Program';
}

function CatalogMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function offerDetailText(section: string, offerName: string) {
  switch (section) {
    case 'Overview':
      return `${offerName} is a draft template and is not visible to drivers.`;
    case 'Eligibility Rules':
      return 'Rules are computed for admin review only; no persisted product offer is active.';
    case 'Terms':
      return 'Template terms are displayed for readiness only and do not create loans or contracts.';
    case 'Documents':
      return 'Required documents are surfaced from readiness rules and Driver 360 remains the document source.';
    case 'Approvals':
      return 'Approval actions require notes, immutable snapshots, and audit records before enablement.';
    case 'Analytics':
      return 'Conversion remains 0% until published offer inventory exists.';
    case 'Audit':
      return 'Audit trail requirements are visible, but this screen does not write growth audit events yet.';
    default:
      return 'Read-only draft section.';
  }
}

function OwnershipPipelineWorkspace({
  profiles,
  onOpen,
}: {
  profiles: GrowthDriverProfile[];
  onOpen: (profile: GrowthDriverProfile) => void;
}) {
  const ownershipProfiles = profiles.filter((profile) => profile.ownershipPipelineStage || ['Approved', 'Ownership Active', 'Fleet Entrepreneur'].includes(profile.pipelineStage));
  const visibleProfiles = ownershipProfiles.length > 0 ? ownershipProfiles : profiles.filter((profile) => ['ELIGIBLE_FOR_REVIEW', 'OFFER_READY'].includes(profile.eligibilityState)).slice(0, 6);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Ownership Pipeline</CardTitle>
          <CardDescription>Track active ownership opportunities after application handoff.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-3 2xl:grid-cols-5">
            {OWNERSHIP_PIPELINE_STAGES.map((stage) => {
              const stageProfiles = visibleProfiles.filter((profile) => profile.ownershipPipelineStage === stage);
              return (
                <div key={stage} className="rounded-md border">
                  <div className="flex items-center justify-between gap-2 border-b p-3">
                    <Badge variant={ownershipVariant(stage)}>{stage}</Badge>
                    <span className="text-sm font-semibold">{stageProfiles.length}</span>
                  </div>
                  <div className="space-y-2 p-2">
                    {stageProfiles.length === 0 ? (
                      <p className="px-2 py-4 text-sm text-muted-foreground">No active records.</p>
                    ) : stageProfiles.map((profile) => (
                      <OwnershipPipelineCard key={profile.driverId} profile={profile} onOpen={() => onOpen(profile)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle>SLA Tracking</CardTitle>
            <CardDescription>Days in stage, missed reviews, pending documents, signatures, payments, and escalations.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Offer</TableHead>
                  <TableHead>Application Date</TableHead>
                  <TableHead>Reviewer</TableHead>
                  <TableHead>Days Waiting</TableHead>
                  <TableHead>Current Stage</TableHead>
                  <TableHead>Next Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleProfiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No ownership pipeline records are available.</TableCell>
                  </TableRow>
                ) : visibleProfiles.map((profile) => (
                  <TableRow key={profile.driverId}>
                    <TableCell>
                      <p className="font-semibold">{profile.driverName}</p>
                      <p className="text-xs text-muted-foreground">{profile.score ?? 'No score'} score</p>
                    </TableCell>
                    <TableCell>{profile.offers.find((offer) => offer.criteriaMet)?.offerName ?? 'No published offer'}</TableCell>
                    <TableCell>{compactDate(profile.applicationDate)}</TableCell>
                    <TableCell>{profile.reviewer ?? 'Unassigned'}</TableCell>
                    <TableCell>{profile.daysInStage}</TableCell>
                    <TableCell><Badge variant={ownershipVariant(profile.ownershipPipelineStage)}>{profile.ownershipPipelineStage ?? profile.pipelineStage}</Badge></TableCell>
                    <TableCell className="max-w-[260px] text-sm text-muted-foreground">{profile.nextAction}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Escalation Engine</CardTitle>
            <CardDescription>Automatic flags from source state. No escalation write occurs here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleProfiles.flatMap((profile) => profile.slaFlags.map((flag) => ({ profile, flag }))).length === 0 ? (
              <p className="text-sm text-muted-foreground">No ownership escalation flags are currently detected.</p>
            ) : visibleProfiles.flatMap((profile) => profile.slaFlags.map((flag) => ({ profile, flag }))).map(({ profile, flag }) => (
              <div key={`${profile.driverId}-${flag}`} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{flag}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{profile.driverName} · {profile.daysInStage} day(s)</p>
                  </div>
                  <Badge variant="high">Escalation</Badge>
                </div>
              </div>
            ))}
            <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
              <p className="font-medium">Down payment and signatures are read-only</p>
              <p className="mt-1 text-muted-foreground">Payments, contracts, and vehicle activation stay in Financial Operations, Contracts, Wallets, and Vehicle Operations.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OwnershipPipelineCard({ profile, onOpen }: { profile: GrowthDriverProfile; onOpen: () => void }) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{profile.driverName}</p>
          <p className="text-xs text-muted-foreground">{profile.offers.find((offer) => offer.criteriaMet)?.offerName ?? 'No published offer'}</p>
        </div>
        <Badge variant={ownershipVariant(profile.ownershipPipelineStage)}>{profile.daysInStage}d</Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Score</p>
          <p className="font-semibold">{profile.score ?? 'None'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Reviewer</p>
          <p className="font-semibold">{profile.reviewer ?? 'Unassigned'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Application</p>
          <p className="font-semibold">{compactDate(profile.applicationDate)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Next</p>
          <p className="font-semibold">{profile.ownershipPipelineStage ?? profile.pipelineStage}</p>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{profile.nextAction}</p>
      <Button type="button" variant="outline" size="sm" className="mt-3 w-full justify-start" onClick={onOpen}>
        <FileSearch className="mr-2 h-4 w-4" />
        Review
      </Button>
    </div>
  );
}

function GrowthAnalyticsWorkspace({ overview }: { overview: GrowthOverview }) {
  const analytics = overview.analytics;
  const executive = [
    ['Eligible Growth Rate', analytics.eligibleGrowthRate, 'Eligible drivers divided by total drivers'],
    ['Offer Acceptance Rate', analytics.offerAcceptanceRate, '0 until published offer events exist'],
    ['Application Conversion Rate', analytics.applicationConversionRate, 'Submitted applications divided by eligible drivers'],
    ['Approval Rate', analytics.approvalRate, 'Approved applications divided by submitted applications'],
    ['Ownership Activation Rate', analytics.ownershipActivationRate, 'Active ownership divided by approved applications'],
    ['Fleet Entrepreneur Rate', analytics.fleetEntrepreneurRate, 'Fleet entrepreneurs divided by active owners'],
  ] as const;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Executive Metrics</CardTitle>
          <CardDescription>Growth program health from current platform source records.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {executive.map(([label, value, detail]) => (
            <div key={label} className="rounded-md border p-4">
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-bold">{value}%</p>
              <Progress value={value} className="mt-3 h-2" />
              <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <AnalyticsList title="Cohort Analysis: Join Month" rows={analytics.cohortsByJoinMonth} />
        <AnalyticsList title="Cohort Analysis: Score Band" rows={analytics.scoreBands} />
        <AnalyticsList title="Cohort Analysis: Vehicle Type" rows={analytics.vehicleAssignment} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Funnel Analytics</CardTitle>
            <CardDescription>Verified → Trusted → Eligible → Offer → Application → Approval → Ownership.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.funnel.map((stage) => (
              <Link key={stage.key} to={stage.route} className="block rounded-md border p-3 transition-colors hover:bg-muted/60">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{stage.label}</p>
                  <Badge variant="outline">{stage.count}</Badge>
                </div>
                <Progress value={Math.round((stage.count / Math.max(1, overview.totalDrivers)) * 100)} className="mt-3 h-2" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Risk Analytics</CardTitle>
            <CardDescription>Default predictors, blockers, score factors, and rejection reasons.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.riskBlockers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No risk blockers are currently detected.</p>
            ) : analytics.riskBlockers.map((blocker) => (
              <Link key={`${blocker.source}-${blocker.key}`} to={blocker.route} className="block rounded-md border p-3 transition-colors hover:bg-muted/60">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{blocker.label}</p>
                    <p className="text-xs text-muted-foreground">{blocker.source}</p>
                  </div>
                  <Badge variant={blockerVariant(blocker)}>{blocker.count}</Badge>
                </div>
              </Link>
            ))}
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">Rejected application reasons</p>
              <p className="mt-1 text-muted-foreground">Read from loan rejection records when present; no synthetic reason generation.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Financial Analytics</CardTitle>
          <CardDescription>Ownership economics only use persisted finance and ownership sources.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <FinancialAnalyticsTile label="Average Down Payment" value={analytics.averageDownPayment === null ? 'Source pending' : formatCurrency(analytics.averageDownPayment)} />
          <FinancialAnalyticsTile label="Average Ownership Duration" value={analytics.averageOwnershipDurationDays === null ? 'Source pending' : `${analytics.averageOwnershipDurationDays} days`} />
          <FinancialAnalyticsTile label="Revenue by Ownership Cohort" value={analytics.revenueByOwnershipCohortAvailable ? 'Available' : 'Source pending'} />
        </CardContent>
      </Card>
    </div>
  );
}

function AnalyticsList({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cohort data available.</p>
        ) : rows.map((row) => (
          <div key={row.label} className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>{row.label}</span>
              <span className="font-semibold">{row.count}</span>
            </div>
            <Progress value={Math.round((row.count / Math.max(1, total)) * 100)} className="h-2" />
          </div>
        ))}
        {title.includes('Vehicle Type') && (
          <p className="text-xs text-muted-foreground">City and branch cohorts require explicit city/branch source columns before they can be measured.</p>
        )}
      </CardContent>
    </Card>
  );
}

function FinancialAnalyticsTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-4">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function DriverProfileSheet({
  profile,
  onClose,
}: {
  profile: GrowthDriverProfile | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={Boolean(profile)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {profile && (
          <>
            <SheetHeader>
              <SheetTitle>{profile.driverName}</SheetTitle>
              <SheetDescription>
                Growth profile, eligibility reasoning, blockers, and Credit Engine handoff context.
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Lifecycle</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <StageBadge stage={profile.lifecycleStage} />
                      <Badge variant={eligibilityVariant(profile.eligibilityState)}>{formatState(profile.eligibilityState)}</Badge>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">Next: {profile.nextStage}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Score readiness</p>
                    <div className="mt-2 flex items-end justify-between gap-3">
                      <p className="text-2xl font-bold">{profile.score ?? 'None'}</p>
                      <p className="text-sm text-muted-foreground">{profile.tier ?? 'No tier'}</p>
                    </div>
                    <Progress value={profile.scoreProgress} className="mt-3 h-2" />
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Operating Signals</CardTitle>
                  <CardDescription>Rental, payment, wallet, vehicle, risk, and ownership context.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Rental history</p>
                    <p className="mt-1 font-semibold">{profile.weeksHistory} scored weeks</p>
                    <p className="text-muted-foreground">{profile.activeRental ? 'Active rental' : 'No active rental detected'}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Payment history</p>
                    <p className="mt-1 font-semibold">{profile.onTimeRate}% on-time</p>
                    <p className="text-muted-foreground">Outstanding blockers appear below.</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Wallet</p>
                    <p className="mt-1 font-semibold">{formatCurrency(profile.walletBalance)}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Vehicle</p>
                    <p className="mt-1 font-semibold">{profile.activeVehicleId ?? 'No active vehicle'}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Risk</p>
                    <p className="mt-1 font-semibold">{profile.riskLevel ?? 'No elevated risk'}</p>
                    {profile.riskReasons.length > 0 && (
                      <p className="mt-1 text-muted-foreground">{profile.riskReasons.slice(0, 2).join(' · ')}</p>
                    )}
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Current application</p>
                    <p className="mt-1 font-semibold">{profile.currentApplication?.status ? formatState(profile.currentApplication.status) : 'None'}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Eligibility Blockers</CardTitle>
                  <CardDescription>Explainable reasons from KYC, score, payments, wallet, trust, fleet, or vehicle state.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {profile.blockers.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-md border p-3 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      No blockers are currently detected.
                    </div>
                  ) : profile.blockers.map((blocker) => (
                    <div key={`${blocker.source}-${blocker.key}`} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">{blocker.label}</p>
                        <p className="text-sm text-muted-foreground">{blocker.source}</p>
                      </div>
                      <Badge variant={blockerVariant(blocker)}>{blocker.severity}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recommended Actions</CardTitle>
                  <CardDescription>Safe routing for operations and credit teams.</CardDescription>
                </CardHeader>
                <CardContent>
                  <RecommendationList recommendations={profile.recommendations} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Offer Readiness</CardTitle>
                  <CardDescription>Readiness only. Publishing is disabled in Part 1.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {profile.offers.map((offer) => (
                    <OfferReadinessCard key={offer.offerType} offer={offer} />
                  ))}
                  <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
                    <p className="font-medium text-foreground">Publish disabled</p>
                    <p className="mt-1 text-muted-foreground">{profile.publishDisabledReason}</p>
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-wrap gap-2 pb-4">
                <Button asChild variant="outline">
                  <Link to={`/admin/drivers/${profile.driverId}?tab=growth`}>Driver 360</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/admin/loans">Loan Review</Link>
                </Button>
                <Button disabled>
                  <LockKeyhole className="mr-2 h-4 w-4" />
                  Publish Offer
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function AdminGrowthOwnership() {
  const guard = useRoleGuard();
  const canAccess = !guard.isLoading && guard.canManageLoans();
  const data = useGrowthOwnershipData(canAccess);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeWorkspace = workspaceFromPath(location.pathname);
  const [activeFilter, setActiveFilter] = useState<PipelineFilter>('all');
  const [pipelineView, setPipelineView] = useState<PipelineView>('kanban');
  const [selectedProfile, setSelectedProfile] = useState<GrowthDriverProfile | null>(null);
  const driverIdParam = searchParams.get('driver');
  const stageParam = searchParams.get('stage');
  const blockerParam = searchParams.get('blocker');
  const filterParam = searchParams.get('filter');

  useEffect(() => {
    if (!driverIdParam) return;
    const match = data.profiles.find((profile) => profile.driverId === driverIdParam);
    if (match && selectedProfile?.driverId !== match.driverId) {
      setSelectedProfile(match);
    }
  }, [data.profiles, driverIdParam, selectedProfile?.driverId]);

  const filteredProfiles = useMemo(() => {
    const routeFilter = filterParam === 'blocked' ? 'blocked' : activeFilter;
    let next = data.profiles;
    switch (routeFilter) {
      case 'eligible':
        next = next.filter((profile) => ['ELIGIBLE_FOR_REVIEW', 'OFFER_READY'].includes(profile.eligibilityState));
        break;
      case 'almost':
        next = next.filter((profile) => profile.eligibilityState === 'ALMOST_ELIGIBLE');
        break;
      case 'blocked':
        next = next.filter((profile) => ['NOT_ELIGIBLE', 'SUSPENDED', 'REJECTED'].includes(profile.eligibilityState));
        break;
      case 'ownership':
        next = next.filter((profile) => ['ACTIVATION_PENDING', 'ACTIVE_OWNERSHIP_PATH', 'COMPLETED'].includes(profile.eligibilityState));
        break;
      default:
        break;
    }
    if (stageParam) {
      next = next.filter((profile) => profile.pipelineStage === stageParam);
    }
    if (blockerParam) {
      next = next.filter((profile) => profile.blockers.some((blocker) => blocker.key === blockerParam));
    }
    return next;
  }, [activeFilter, blockerParam, data.profiles, filterParam, stageParam]);

  const attentionQueue = useMemo(() => (
    data.profiles
      .filter((profile) =>
        ['ELIGIBLE_FOR_REVIEW', 'ALMOST_ELIGIBLE', 'NOT_ELIGIBLE', 'SUSPENDED', 'ACTIVATION_PENDING'].includes(profile.eligibilityState)
        || profile.blockers.some((blocker) => blocker.severity === 'critical'),
      )
      .slice(0, 8)
  ), [data.profiles]);

  const openProfile = (profile: GrowthDriverProfile) => {
    setSelectedProfile(profile);
    const next = new URLSearchParams(searchParams);
    next.set('driver', profile.driverId);
    setSearchParams(next, { replace: true });
  };

  const closeProfile = () => {
    setSelectedProfile(null);
    const next = new URLSearchParams(searchParams);
    next.delete('driver');
    setSearchParams(next, { replace: true });
  };

  const renderWorkspace = () => {
    switch (activeWorkspace) {
      case 'pipeline':
        return (
          <PipelineTab
            profiles={filteredProfiles}
            filter={filterParam === 'blocked' ? 'blocked' : activeFilter}
            view={pipelineView}
            onFilterChange={setActiveFilter}
            onViewChange={setPipelineView}
            onOpen={openProfile}
          />
        );
      case 'reviews':
        return (
          <EligibilityReviewsWorkspace
            profiles={data.profiles}
            selectedProfile={selectedProfile}
            onOpen={openProfile}
          />
        );
      case 'offers':
        return <OffersTab profiles={data.profiles} selectedProfile={selectedProfile} onOpenProfile={openProfile} />;
      case 'ownership':
        return <OwnershipPipelineWorkspace profiles={filteredProfiles} onOpen={openProfile} />;
      case 'analytics':
        return <GrowthAnalyticsWorkspace overview={data.overview} />;
      default:
        return (
          <OverviewTab
            overview={data.overview}
            attentionQueue={attentionQueue}
            onOpen={openProfile}
          />
        );
    }
  };

  if (!guard.isLoading && !canAccess) {
    return (
      <AdminLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="text-destructive">Access denied</CardTitle>
              <CardDescription>Layer 2F Growth & Ownership Center is limited to super_admin, manager, and agent_pret roles.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-5">
        <AdminBreadcrumb items={[{ label: 'Growth & Ownership' }, { label: workspaceTitle(activeWorkspace) }]} />
        <AdminPageHeader
          title="Growth & Ownership Center"
          description={workspaceDescription(activeWorkspace)}
          action={(
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/admin/loans"><HandCoins className="mr-2 h-4 w-4" />Loans</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin/trust-risk"><ShieldAlert className="mr-2 h-4 w-4" />Trust & Risk</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/admin/financial-operations"><Banknote className="mr-2 h-4 w-4" />Finance</Link>
              </Button>
            </div>
          )}
        />

        {guard.isLoading || data.isLoading ? (
          <LoadingState message="Loading growth and ownership..." />
        ) : data.isError ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-destructive">Growth & Ownership unavailable</CardTitle>
              <CardDescription>{data.error instanceof Error ? data.error.message : 'Unable to load growth and ownership data.'}</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <WorkspaceNav active={activeWorkspace} />
            {renderWorkspace()}
          </>
        )}
      </div>

      <DriverProfileSheet profile={selectedProfile} onClose={closeProfile} />
    </AdminLayout>
  );
}
