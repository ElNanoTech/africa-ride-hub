import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  HandCoins,
  LockKeyhole,
  PauseCircle,
  Route,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CREDIT_OFFERS } from '@/lib/creditJourney';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  GROWTH_STAGE_ORDER,
  type DriverOfferState,
  type GrowthBlocker,
  type GrowthDriverProfile,
  type GrowthEligibilityState,
  type GrowthLifecycleStage,
  type GrowthOfferEvaluation,
  type OfferStatus,
} from '@/lib/growthOwnership';
import { useGrowthOwnershipData } from '@/hooks/useGrowthOwnershipData';
import { useRoleGuard } from '@/hooks/useRoleGuard';

type BadgeVariant = ComponentProps<typeof Badge>['variant'];
type MetricTone = 'default' | 'success' | 'warning' | 'danger' | 'info';
type PipelineFilter = 'all' | 'eligible' | 'almost' | 'blocked' | 'ownership';

const FILTERS: Array<{ key: PipelineFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'eligible', label: 'Eligible' },
  { key: 'almost', label: 'Almost' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'ownership', label: 'Ownership Path' },
];

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

function blockerVariant(blocker: GrowthBlocker): BadgeVariant {
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

function StageBadge({ stage }: { stage: GrowthLifecycleStage }) {
  return (
    <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold', stageToneClass(stage))}>
      {stage}
    </span>
  );
}

function BlockerList({ blockers, limit = 3 }: { blockers: GrowthBlocker[]; limit?: number }) {
  const visible = blockers.slice(0, limit);
  if (visible.length === 0) {
    return <Badge variant="success">No blockers</Badge>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((blocker) => (
        <Badge key={`${blocker.source}-${blocker.key}`} variant={blockerVariant(blocker)}>
          {blocker.source}
        </Badge>
      ))}
      {blockers.length > limit && <Badge variant="outline">+{blockers.length - limit}</Badge>}
    </div>
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

function DriverProfileRow({
  profile,
  onOpen,
}: {
  profile: GrowthDriverProfile;
  onOpen: (profile: GrowthDriverProfile) => void;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="min-w-[180px]">
          <p className="font-semibold">{profile.driverName}</p>
          <p className="text-sm text-muted-foreground">{profile.phone ?? 'No phone'}</p>
        </div>
      </TableCell>
      <TableCell>
        <StageBadge stage={profile.lifecycleStage} />
      </TableCell>
      <TableCell>
        <Badge variant={eligibilityVariant(profile.eligibilityState)}>{formatState(profile.eligibilityState)}</Badge>
      </TableCell>
      <TableCell>
        <div className="min-w-[120px]">
          <p className="font-semibold">{profile.score ?? 'No score'}</p>
          <Progress value={profile.scoreProgress} className="mt-2 h-2" />
        </div>
      </TableCell>
      <TableCell>
        <p className="font-medium">{profile.weeksHistory}</p>
        <p className="text-xs text-muted-foreground">scored weeks</p>
      </TableCell>
      <TableCell>
        <p className="font-medium">{profile.onTimeRate}%</p>
        <p className="text-xs text-muted-foreground">on-time</p>
      </TableCell>
      <TableCell>
        <BlockerList blockers={profile.blockers} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpen(profile)}>
            <FileSearch className="mr-2 h-4 w-4" />
            Review
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/admin/drivers/${profile.driverId}?tab=growth`}>Driver 360</Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function OverviewTab({
  profiles,
  totalDrivers,
  attentionQueue,
  onOpen,
}: {
  profiles: GrowthDriverProfile[];
  totalDrivers: number;
  attentionQueue: GrowthDriverProfile[];
  onOpen: (profile: GrowthDriverProfile) => void;
}) {
  const funnelTotal = Math.max(1, totalDrivers);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_390px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Growth Conversion Funnel</CardTitle>
            <CardDescription>Daily Rental to Trust to Eligibility to Credit Engine handoff.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {GROWTH_STAGE_ORDER.map((stage) => {
              const count = profiles.filter((profile) => profile.lifecycleStage === stage).length;
              const percent = Math.round((count / funnelTotal) * 100);
              return (
                <div key={stage} className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <StageBadge stage={stage} />
                      <span className="text-muted-foreground">{count} driver(s)</span>
                    </div>
                    <span className="font-medium">{percent}%</span>
                  </div>
                  <Progress value={percent} className="h-2" />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Phase 1 Guardrails</CardTitle>
            <CardDescription>Growth eligibility is computed from existing platform signals. Driver-visible offers remain blocked.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border p-3">
              <LockKeyhole className="mb-2 h-4 w-4 text-warning" />
              <p className="font-medium">Publishing disabled</p>
              <p className="mt-1 text-sm text-muted-foreground">Requires product offers, immutable eligibility snapshots, and audit events.</p>
            </div>
            <div className="rounded-md border p-3">
              <ShieldCheck className="mb-2 h-4 w-4 text-primary" />
              <p className="font-medium">Trust gates applied</p>
              <p className="mt-1 text-sm text-muted-foreground">KYC, risk flags, sinistres, contraventions, fleet controls, and overdue payments can block review.</p>
            </div>
            <div className="rounded-md border p-3">
              <Banknote className="mb-2 h-4 w-4 text-success" />
              <p className="font-medium">Credit Engine handoff</p>
              <p className="mt-1 text-sm text-muted-foreground">Applications continue through existing loans and finance operations workflows.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Growth Attention Queue</CardTitle>
          <CardDescription>Review-ready, almost-ready, and blocked drivers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {attentionQueue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No drivers need growth review.</p>
          ) : attentionQueue.map((profile) => (
            <div
              key={profile.driverId}
              className="rounded-md border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{profile.driverName}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={eligibilityVariant(profile.eligibilityState)}>{formatState(profile.eligibilityState)}</Badge>
                  <Button type="button" variant="outline" size="sm" onClick={() => onOpen(profile)}>
                    Review
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{profile.score ?? 'No score'} score</span>
                <span>{profile.weeksHistory} weeks</span>
                <span>{profile.onTimeRate}% on-time</span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{profile.recommendations[0]}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function PipelineTab({
  profiles,
  filter,
  onFilterChange,
  onOpen,
}: {
  profiles: GrowthDriverProfile[];
  filter: PipelineFilter;
  onFilterChange: (filter: PipelineFilter) => void;
  onOpen: (profile: GrowthDriverProfile) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <CardTitle>Eligibility Pipeline</CardTitle>
            <CardDescription>Computed growth states over rental, score, payment, wallet, trust, and ownership signals.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <Button
                key={item.key}
                type="button"
                variant={filter === item.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => onFilterChange(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Driver</TableHead>
              <TableHead>Lifecycle</TableHead>
              <TableHead>Eligibility</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>History</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Blockers</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  No drivers match this growth filter.
                </TableCell>
              </TableRow>
            ) : profiles.map((profile) => (
              <DriverProfileRow key={profile.driverId} profile={profile} onOpen={onOpen} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DriverProfilesTab({
  profiles,
  onOpen,
}: {
  profiles: GrowthDriverProfile[];
  onOpen: (profile: GrowthDriverProfile) => void;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {profiles.map((profile) => (
        <Card key={profile.driverId}>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{profile.driverName}</p>
                  <Badge variant={eligibilityVariant(profile.eligibilityState)}>{formatState(profile.eligibilityState)}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{profile.phone ?? 'No phone'} · Next: {profile.nextStage}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => onOpen(profile)}>
                <FileSearch className="mr-2 h-4 w-4" />
                Profile
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Score</p>
                <p className="font-semibold">{profile.score ?? 'None'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Weeks</p>
                <p className="font-semibold">{profile.weeksHistory}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">On-time</p>
                <p className="font-semibold">{profile.onTimeRate}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Wallet</p>
                <p className="font-semibold">{formatCurrency(profile.walletBalance)}</p>
              </div>
            </div>
            <div className="mt-4">
              <BlockerList blockers={profile.blockers} limit={4} />
            </div>
          </CardContent>
        </Card>
      ))}
      {profiles.length === 0 && (
        <Card className="lg:col-span-2">
          <CardContent className="py-8 text-center text-muted-foreground">No driver profiles are available.</CardContent>
        </Card>
      )}
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
    return {
      offer,
      readyDrivers: evaluations.filter((evaluation) => evaluation.criteriaMet).length,
      lockedDrivers: evaluations.filter((evaluation) => !evaluation.criteriaMet).length,
    };
  });
  const profile = selectedProfile ?? profiles[0] ?? null;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <Card>
        <CardHeader>
          <CardTitle>Offer Readiness Templates</CardTitle>
          <CardDescription>Templates are DRAFT and not driver-visible in Part 1.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Minimum Rules</TableHead>
                <TableHead>Terms</TableHead>
                <TableHead>Readiness</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templateRows.map(({ offer, readyDrivers, lockedDrivers }) => (
                <TableRow key={offer.type}>
                  <TableCell>
                    <p className="font-semibold">{offer.title}</p>
                    <p className="text-sm text-muted-foreground">{offer.category}</p>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{offer.requiredScore} score</p>
                    <p className="text-xs text-muted-foreground">{offer.requiredWeeks} weeks · {offer.requiredOnTimeRate}% on-time</p>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{formatCurrency(offer.amount)}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(offer.downPayment)} down</p>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{readyDrivers} ready</p>
                    <p className="text-xs text-muted-foreground">{lockedDrivers} locked</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline">DRAFT</Badge>
                      <Badge variant="outline">NOT VISIBLE</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" disabled>
                      <LockKeyhole className="mr-2 h-4 w-4" />
                      Publish
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
  );
}

function RulesTab({ canAccessAudit }: { canAccessAudit: boolean }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle>Eligibility Rules Display</CardTitle>
          <CardDescription>Read-only thresholds used for explainable growth readiness.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {CREDIT_OFFERS.map((offer) => (
            <div key={offer.type} className="rounded-md border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{offer.title}</p>
                  <p className="text-sm text-muted-foreground">{offer.category}</p>
                </div>
                <Badge variant="outline">DRAFT</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Minimum KIRA Score</p>
                  <p className="font-semibold">{offer.requiredScore}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Scored weeks</p>
                  <p className="font-semibold">{offer.requiredWeeks}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">On-time payment rate</p>
                  <p className="font-semibold">{offer.requiredOnTimeRate}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Down payment</p>
                  <p className="font-semibold">{formatCurrency(offer.downPayment)}</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{offer.commitment}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Governance</CardTitle>
            <CardDescription>Roles and restrictions for Part 1.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-md border p-3">
              <p className="font-medium">View and review</p>
              <p className="mt-1 text-muted-foreground">super_admin, manager, agent_pret.</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="font-medium">Publish and pause</p>
              <p className="mt-1 text-muted-foreground">Blocked in Part 1 until product offer persistence and audit snapshots are available.</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="font-medium">Rules and audit</p>
              <p className="mt-1 text-muted-foreground">{canAccessAudit ? 'Current role can access audit.' : 'Audit detail is limited to super_admin.'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Signal Sources</CardTitle>
            <CardDescription>No backend rewrite is required for this layer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>KIRA score and score history.</p>
            <p>Daily rental and payment status.</p>
            <p>Wallet balance and overdue pressure.</p>
            <p>KYC, Trust & Risk, sinistres, contraventions, and fleet controls.</p>
            <p>Loans and rent-to-own contracts for downstream ownership states.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AuditTab({ canAccessAudit }: { canAccessAudit: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Growth Audit</CardTitle>
          <CardDescription>Part 1 does not write growth audit events.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-md border p-3">
            <p className="font-medium">No silent eligibility override</p>
            <p className="mt-1 text-muted-foreground">Eligibility is recomputed from source data and displayed with blockers.</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="font-medium">No driver-visible offer publish</p>
            <p className="mt-1 text-muted-foreground">All templates stay DRAFT and NOT_VISIBLE.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Safe Actions</CardTitle>
          <CardDescription>Review and route. Do not mutate credit state here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button asChild variant="outline" className="w-full justify-start">
            <Link to="/admin/loans">
              <HandCoins className="mr-2 h-4 w-4" />
              Open Loan Review
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full justify-start">
            <Link to="/admin/trust-risk">
              <ShieldAlert className="mr-2 h-4 w-4" />
              Open Trust & Risk
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full justify-start">
            <Link to="/admin/contracts">
              <ClipboardCheck className="mr-2 h-4 w-4" />
              Open Ownership Contracts
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full justify-start">
            <Link to="/admin/financial-operations">
              <Banknote className="mr-2 h-4 w-4" />
              Open Financial Operations
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full justify-start">
            <Link to="/admin/billing/wallets">
              <Wallet className="mr-2 h-4 w-4" />
              Open Wallets
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit Log Handoff</CardTitle>
          <CardDescription>Central audit remains the system of record for admin activity.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Button asChild variant="outline" disabled={!canAccessAudit} className="w-full justify-start">
            <Link to="/admin/audit">
              <ClipboardCheck className="mr-2 h-4 w-4" />
              Open Admin Audit
            </Link>
          </Button>
          {!canAccessAudit && (
            <p className="text-muted-foreground">Audit log access is restricted to super_admin.</p>
          )}
        </CardContent>
      </Card>
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
  const canAccessAudit = !guard.isLoading && guard.canAccessAudit();
  const data = useGrowthOwnershipData(canAccess);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeFilter, setActiveFilter] = useState<PipelineFilter>('all');
  const [selectedProfile, setSelectedProfile] = useState<GrowthDriverProfile | null>(null);
  const driverIdParam = searchParams.get('driver');

  useEffect(() => {
    if (!driverIdParam) return;
    const match = data.profiles.find((profile) => profile.driverId === driverIdParam);
    if (match && selectedProfile?.driverId !== match.driverId) {
      setSelectedProfile(match);
    }
  }, [data.profiles, driverIdParam, selectedProfile?.driverId]);

  const filteredProfiles = useMemo(() => {
    switch (activeFilter) {
      case 'eligible':
        return data.profiles.filter((profile) => ['ELIGIBLE_FOR_REVIEW', 'OFFER_READY'].includes(profile.eligibilityState));
      case 'almost':
        return data.profiles.filter((profile) => profile.eligibilityState === 'ALMOST_ELIGIBLE');
      case 'blocked':
        return data.profiles.filter((profile) => ['NOT_ELIGIBLE', 'SUSPENDED', 'REJECTED'].includes(profile.eligibilityState));
      case 'ownership':
        return data.profiles.filter((profile) => ['ACTIVATION_PENDING', 'ACTIVE_OWNERSHIP_PATH', 'COMPLETED'].includes(profile.eligibilityState));
      default:
        return data.profiles;
    }
  }, [activeFilter, data.profiles]);

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
        <AdminBreadcrumb items={[{ label: 'Growth & Ownership' }]} />
        <AdminPageHeader
          title="Growth & Ownership"
          description="Daily Rental to Trust to Eligibility to Credit Engine to ownership visibility, with driver-visible offers blocked for Part 1."
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Eligible Drivers" value={data.overview.eligibleDrivers} detail="Ready for admin review, not driver-visible offer publishing." icon={BadgeCheck} tone={data.overview.eligibleDrivers > 0 ? 'success' : 'default'} />
              <MetricCard label="Close To Eligibility" value={data.overview.closeToEligibility} detail="Drivers with warning-level gaps or missing history." icon={TrendingUp} tone="info" />
              <MetricCard label="Blocked Drivers" value={data.overview.blockedDrivers} detail="Critical blockers from KYC, risk, payments, wallet, fleet, or vehicle state." icon={AlertTriangle} tone={data.overview.blockedDrivers > 0 ? 'warning' : 'success'} />
              <MetricCard label="Ownership Path" value={data.overview.ownershipPathDrivers} detail="Activation pending, active ownership path, or completed ownership." icon={Route} tone="success" />
              <MetricCard label="Active Offers" value={data.overview.activeOffers} detail="Zero in Part 1 because product offers are not persisted or published." icon={PauseCircle} tone="default" />
              <MetricCard label="Expiring Offers" value={data.overview.expiringOffers} detail="Zero until offer lifecycle persistence is introduced." icon={LockKeyhole} tone="default" />
              <MetricCard label="Risk Exceptions" value={data.overview.riskExceptions} detail="Drivers with risk or sinistre blockers affecting growth review." icon={ShieldAlert} tone={data.overview.riskExceptions > 0 ? 'danger' : 'success'} />
              <MetricCard label="Total Drivers" value={data.overview.totalDrivers} detail="Profiles computed from existing platform engines." icon={Users} tone="info" />
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList className="flex h-auto flex-wrap justify-start gap-1">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
                <TabsTrigger value="profiles">Driver Profiles</TabsTrigger>
                <TabsTrigger value="offers">Offers</TabsTrigger>
                <TabsTrigger value="rules">Rules</TabsTrigger>
                <TabsTrigger value="audit">Audit</TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <OverviewTab
                  profiles={data.profiles}
                  totalDrivers={data.overview.totalDrivers}
                  attentionQueue={attentionQueue}
                  onOpen={openProfile}
                />
              </TabsContent>

              <TabsContent value="pipeline">
                <PipelineTab
                  profiles={filteredProfiles}
                  filter={activeFilter}
                  onFilterChange={setActiveFilter}
                  onOpen={openProfile}
                />
              </TabsContent>

              <TabsContent value="profiles">
                <DriverProfilesTab profiles={data.profiles} onOpen={openProfile} />
              </TabsContent>

              <TabsContent value="offers">
                <OffersTab profiles={data.profiles} selectedProfile={selectedProfile} onOpenProfile={openProfile} />
              </TabsContent>

              <TabsContent value="rules">
                <RulesTab canAccessAudit={canAccessAudit} />
              </TabsContent>

              <TabsContent value="audit">
                <AuditTab canAccessAudit={canAccessAudit} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      <DriverProfileSheet profile={selectedProfile} onClose={closeProfile} />
    </AdminLayout>
  );
}
