import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Award,
  CalendarClock,
  Car,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Clock,
  FileText,
  Flag,
  Gauge,
  HelpCircle,
  Lock,
  Map,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Wallet,
} from 'lucide-react';
import { DriverBreadcrumb } from '@/components/DriverBreadcrumb';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { KiraVoiceButton } from '@/components/driver/KiraVoiceButton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { useDriverJourneyData } from '@/hooks/useDriverJourneyData';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { cn } from '@/lib/utils';
import type {
  DriverJourneyAction,
  DriverJourneyApplicationStage,
  DriverJourneyDocument,
  DriverJourneyOpportunity,
  DriverJourneyRequirement,
  DriverJourneyStage,
  DriverJourneySummary,
} from '@/lib/growthOwnership';

const statusTone: Record<string, string> = {
  completed: 'border-emerald-500/30 bg-emerald-50 text-emerald-700',
  current: 'border-sky-500/30 bg-sky-50 text-sky-700',
  locked: 'border-muted bg-muted/50 text-muted-foreground',
  met: 'border-emerald-500/30 bg-emerald-50 text-emerald-700',
  missing: 'border-red-500/30 bg-red-50 text-red-700',
  in_progress: 'border-amber-500/30 bg-amber-50 text-amber-700',
  Locked: 'border-muted bg-muted/60 text-muted-foreground',
  'Almost Ready': 'border-amber-500/30 bg-amber-50 text-amber-700',
  Available: 'border-emerald-500/30 bg-emerald-50 text-emerald-700',
  'In Progress': 'border-sky-500/30 bg-sky-50 text-sky-700',
  Completed: 'border-emerald-500/30 bg-emerald-50 text-emerald-700',
  Expired: 'border-red-500/30 bg-red-50 text-red-700',
  Missing: 'border-amber-500/30 bg-amber-50 text-amber-700',
  Uploaded: 'border-sky-500/30 bg-sky-50 text-sky-700',
  'Under Review': 'border-sky-500/30 bg-sky-50 text-sky-700',
  Approved: 'border-emerald-500/30 bg-emerald-50 text-emerald-700',
  Rejected: 'border-red-500/30 bg-red-50 text-red-700',
  'Requires Re-upload': 'border-red-500/30 bg-red-50 text-red-700',
  high: 'border-red-500/30 bg-red-50 text-red-700',
  medium: 'border-amber-500/30 bg-amber-50 text-amber-700',
  low: 'border-emerald-500/30 bg-emerald-50 text-emerald-700',
  'Not Eligible': 'border-red-500/30 bg-red-50 text-red-700',
  'Almost Eligible': 'border-amber-500/30 bg-amber-50 text-amber-700',
  'Eligible For Review': 'border-sky-500/30 bg-sky-50 text-sky-700',
  'Offer Available': 'border-emerald-500/30 bg-emerald-50 text-emerald-700',
  'Application In Progress': 'border-sky-500/30 bg-sky-50 text-sky-700',
  'Approved Pending Activation': 'border-emerald-500/30 bg-emerald-50 text-emerald-700',
  'Ownership Active': 'border-emerald-500/30 bg-emerald-50 text-emerald-700',
};

function JourneySkeleton() {
  return (
    <DriverLayout>
      <PageHeader title="Mon Parcours" subtitle="My Journey" />
      <div className="px-4 space-y-4">
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
      </div>
    </DriverLayout>
  );
}

function EmptyJourney() {
  return (
    <DriverLayout>
      <PageHeader title="Mon Parcours" subtitle="My Journey" />
      <div className="px-4">
        <Alert className="border-amber-500/40 bg-amber-50">
          <HelpCircle className="h-4 w-4" />
          <AlertTitle>Profil conducteur requis</AlertTitle>
          <AlertDescription>
            Votre profil doit etre actif pour afficher le parcours de croissance.
          </AlertDescription>
        </Alert>
      </div>
    </DriverLayout>
  );
}

function ErrorJourney() {
  return (
    <DriverLayout>
      <PageHeader title="Mon Parcours" subtitle="My Journey" />
      <div className="px-4">
        <Alert className="border-red-500/40 bg-red-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Connexion instable</AlertTitle>
          <AlertDescription>
            Le parcours ne peut pas etre charge pour le moment.
          </AlertDescription>
        </Alert>
      </div>
    </DriverLayout>
  );
}

function JourneyBadge({ value }: { value: string }) {
  return (
    <Badge variant="outline" className={cn('border', statusTone[value] ?? '')}>
      {value}
    </Badge>
  );
}

function CurrentStageCard({ journey }: { journey: DriverJourneySummary }) {
  return (
    <Card className="overflow-hidden border-0 bg-gradient-to-br from-emerald-700 via-teal-700 to-sky-800 text-white shadow-lg">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white/75">Current Stage</p>
            <h2 className="mt-1 text-3xl font-bold leading-tight">{journey.currentStageLabel}</h2>
            <p className="mt-2 text-sm text-white/80">{journey.currentStageDescription}</p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <Trophy className="h-6 w-6" />
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/75">Next Stage</span>
            <span className="font-semibold">{journey.nextStage}</span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-white transition-all" style={{ width: `${journey.progress}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-white/70">
            <span>Progress</span>
            <span>{journey.progress}%</span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button asChild variant="secondary" className="min-h-11 bg-white text-emerald-800 hover:bg-white/90">
            <Link to="/journey/eligibility">
              View Details
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 border-white/40 bg-white/10 text-white hover:bg-white/20">
            <Link to="/journey/eligibility">
              How To Improve
              <Target className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RoadmapCard({ roadmap }: { roadmap: DriverJourneyStage[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Map className="h-4 w-4 text-sky-600" />
          Journey Roadmap
        </CardTitle>
        <CardDescription>Good behavior builds trust. Trust creates opportunities.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {roadmap.map((stage) => (
          <Link
            key={stage.stage}
            to="/journey/eligibility"
            className="flex min-h-14 items-center gap-3 rounded-xl border bg-background p-3 transition-colors active:bg-muted/70"
          >
            <div className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border',
              stage.status === 'completed' && 'border-emerald-500 bg-emerald-50 text-emerald-700',
              stage.status === 'current' && 'border-sky-500 bg-sky-50 text-sky-700',
              stage.status === 'locked' && 'border-muted bg-muted text-muted-foreground',
            )}>
              {stage.status === 'completed' ? <CheckCircle2 className="h-5 w-5" /> : stage.status === 'current' ? <Flag className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold">{stage.label}</p>
                <JourneyBadge value={stage.status} />
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{stage.description}</p>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function RequirementLine({ requirement }: { requirement: DriverJourneyRequirement }) {
  const Icon = requirement.status === 'met' ? CheckCircle2 : requirement.status === 'missing' ? AlertTriangle : Clock;
  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="flex items-start gap-3">
        <Icon className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          requirement.status === 'met' && 'text-emerald-600',
          requirement.status === 'missing' && 'text-red-600',
          requirement.status === 'in_progress' && 'text-amber-600',
        )} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{requirement.label}</p>
            <JourneyBadge value={requirement.status} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{requirement.explanation}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-muted/50 p-2">
              <p className="text-muted-foreground">Current</p>
              <p className="mt-0.5 font-semibold">{requirement.current}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-2">
              <p className="text-muted-foreground">Target</p>
              <p className="mt-0.5 font-semibold">{requirement.target}</p>
            </div>
          </div>
          <p className="mt-2 text-xs font-medium text-foreground">{requirement.suggestion}</p>
        </div>
      </div>
    </div>
  );
}

function EligibilityStatusCard({ journey }: { journey: DriverJourneySummary }) {
  const total = journey.eligibility.requirementsMet.length
    + journey.eligibility.requirementsMissing.length
    + journey.eligibility.requirementsInProgress.length;
  const metPct = total ? Math.round((journey.eligibility.requirementsMet.length / total) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Eligibility Status
        </CardTitle>
        <CardDescription>{journey.eligibility.explanation}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <JourneyBadge value={journey.eligibility.state} />
          <Button asChild variant="outline" size="sm" className="min-h-10">
            <Link to="/journey/eligibility">
              Why?
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div>
          <div className="mb-2 flex justify-between text-xs text-muted-foreground">
            <span>Requirements Met</span>
            <span>{journey.eligibility.requirementsMet.length}/{total}</span>
          </div>
          <Progress value={metPct} className="h-2" />
        </div>
      </CardContent>
    </Card>
  );
}

function OwnershipProgressCard({ journey }: { journey: DriverJourneySummary }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-sky-600" />
          Ownership Readiness
        </CardTitle>
        <CardDescription>Based on score, payments, rental consistency, KYC, vehicle care, wallet behavior, and documentation.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-4xl font-bold">{journey.progress}%</p>
            <p className="text-xs text-muted-foreground">Current value</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold">Target 100%</p>
            <p className="text-xs text-muted-foreground">Readiness, not approval</p>
          </div>
        </div>
        <Progress value={journey.progress} className="h-3" />
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="font-semibold">{journey.eligibility.requirementsMet.length}</p>
            <p className="text-muted-foreground">Met</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="font-semibold">{journey.eligibility.requirementsInProgress.length}</p>
            <p className="text-muted-foreground">In Progress</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="font-semibold">{journey.eligibility.requirementsMissing.length}</p>
            <p className="text-muted-foreground">Missing</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NextActionsCard({ actions }: { actions: DriverJourneyAction[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-amber-600" />
          Next Actions
        </CardTitle>
        <CardDescription>What should I do today?</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.map((action, index) => (
          <Link key={action.key} to={action.route} className="flex min-h-14 items-center gap-3 rounded-xl border bg-background p-3 active:bg-muted/70">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
              {index + 1}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{action.label}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{action.explanation}</p>
            </div>
            <JourneyBadge value={action.impact} />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function OpportunityCard({ opportunity }: { opportunity: DriverJourneyOpportunity }) {
  return (
    <Link to={opportunity.detailRoute} className="block">
      <Card className="transition-colors active:bg-muted/60">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
              <Car className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{opportunity.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{opportunity.eligibilityLevel}</p>
                </div>
                <JourneyBadge value={opportunity.status} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{opportunity.reason}</p>
              <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Remaining</span>
                <span className="text-right font-semibold">{opportunity.remaining}</span>
              </div>
            </div>
            <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function OpportunitiesPreview({ journey }: { journey: DriverJourneySummary }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-emerald-600" />
          Available Opportunities
        </CardTitle>
        <CardDescription>{journey.activeOpportunityCount} active published opportunity.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {journey.opportunities.length ? (
          journey.opportunities.map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} />)
        ) : (
          <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
            Aucune opportunite publiee pour le moment.
          </div>
        )}
        <Button asChild variant="outline" className="min-h-11 w-full">
          <Link to="/journey/opportunities">
            Opportunity Center
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function JourneyShortcuts() {
  const items = [
    { label: 'Simulator', route: '/journey/simulator', icon: Gauge },
    { label: 'Application Tracker', route: '/journey/application', icon: ClipboardCheckIcon },
    { label: 'Milestones', route: '/journey/milestones', icon: CalendarClock },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link key={item.route} to={item.route} className="flex min-h-24 flex-col items-center justify-center rounded-xl border bg-background p-2 text-center active:bg-muted/70">
            <Icon className="h-5 w-5 text-sky-700" />
            <span className="mt-2 text-xs font-semibold leading-tight">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function ClipboardCheckIcon({ className }: { className?: string }) {
  return <ClipboardCheck className={className} />;
}

function AchievementsVision({ journey }: { journey: DriverJourneySummary }) {
  const achieved = journey.achievements.filter((item) => item.achieved);
  const next = journey.achievements.find((item) => !item.achieved);

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Award className="h-4 w-4 text-amber-600" />
            Achievements
          </CardTitle>
          <CardDescription>Recognition backed by existing platform evidence.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          {journey.achievements.map((achievement) => (
            <div key={achievement.key} className={cn(
              'min-h-24 rounded-xl border p-3',
              achievement.achieved ? 'border-emerald-500/30 bg-emerald-50' : 'bg-muted/30',
            )}>
              <div className="flex items-center gap-2">
                {achievement.achieved ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                <p className="text-sm font-semibold">{achievement.label}</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{achievement.evidence}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-sky-500/20 bg-sky-50/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Flag className="h-4 w-4 text-sky-700" />
            Ownership Vision
          </CardTitle>
          <CardDescription>Ownership creates entrepreneurship when each step is earned.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-white/70 p-3">
            <p className="text-muted-foreground">Confirmed</p>
            <p className="mt-1 text-2xl font-bold">{achieved.length}</p>
          </div>
          <div className="rounded-xl bg-white/70 p-3">
            <p className="text-muted-foreground">Next milestone</p>
            <p className="mt-1 font-semibold">{next?.label ?? 'Maintain ownership health'}</p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function JourneyHome({ journey }: { journey: DriverJourneySummary }) {
  const voiceText = `Vous etes a l etape ${journey.currentStageLabel}. Votre progression est de ${journey.progress} pour cent. Prochaine action: ${journey.nextActions[0]?.label ?? 'continuer les bons comportements'}.`;

  return (
    <DriverLayout>
      <PageHeader
        title="Mon Parcours"
        subtitle="My Journey"
        action={<KiraVoiceButton text={voiceText} compact />}
      />
      <div className="px-4 space-y-4 pb-8">
        <CurrentStageCard journey={journey} />
        <RoadmapCard roadmap={journey.roadmap} />
        <OwnershipProgressCard journey={journey} />
        <EligibilityStatusCard journey={journey} />
        <OpportunitiesPreview journey={journey} />
        <NextActionsCard actions={journey.nextActions} />
        <JourneyShortcuts />
        <AchievementsVision journey={journey} />
      </div>
    </DriverLayout>
  );
}

function RequirementGroup({ title, items }: { title: string; items: DriverJourneyRequirement[] }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-semibold">{title}</h2>
      {items.length ? (
        <div className="space-y-2">
          {items.map((requirement) => <RequirementLine key={requirement.key} requirement={requirement} />)}
        </div>
      ) : (
        <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">Aucun element dans cette categorie.</div>
      )}
    </section>
  );
}

function EligibilityScreen({ journey }: { journey: DriverJourneySummary }) {
  return (
    <DriverLayout>
      <PageHeader title="Eligibility Screen" subtitle="Why Am I Not Eligible?" />
      <DriverBreadcrumb items={[{ label: 'Mon Parcours', href: '/journey' }, { label: 'Eligibility' }]} />
      <div className="px-4 space-y-4 pb-8">
        <EligibilityStatusCard journey={journey} />
        <RequirementGroup title="Requirements Met" items={journey.eligibility.requirementsMet} />
        <RequirementGroup title="Requirements Missing" items={journey.eligibility.requirementsMissing} />
        <RequirementGroup title="Requirements In Progress" items={journey.eligibility.requirementsInProgress} />
        <NextActionsCard actions={journey.nextActions} />
      </div>
    </DriverLayout>
  );
}

function OpportunityCenter({ journey }: { journey: DriverJourneySummary }) {
  return (
    <DriverLayout>
      <PageHeader title="Opportunity Center" subtitle="/journey/opportunities" />
      <DriverBreadcrumb items={[{ label: 'Mon Parcours', href: '/journey' }, { label: 'Opportunities' }]} />
      <div className="px-4 space-y-4 pb-8">
        <Alert className="border-sky-500/40 bg-sky-50">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>No fake pre-approvals</AlertTitle>
          <AlertDescription>
            Available means a real active published offer exists. Locked cards explain readiness only.
          </AlertDescription>
        </Alert>
        {journey.opportunities.map((opportunity) => (
          <OpportunityCard key={opportunity.id} opportunity={opportunity} />
        ))}
        {journey.opportunities.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center">
              <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 font-semibold">Aucune opportunite publiee</p>
              <p className="mt-1 text-sm text-muted-foreground">Votre progression reste visible sans creer de fausse offre.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DriverLayout>
  );
}

function OpportunityDetail({ journey }: { journey: DriverJourneySummary }) {
  const { opportunityId } = useParams();
  const opportunity = journey.opportunities.find((item) => item.id === opportunityId) ?? journey.opportunities[0];

  if (!opportunity) return <OpportunityCenter journey={journey} />;

  return (
    <DriverLayout>
      <PageHeader title={opportunity.name} subtitle="Opportunity Detail Screen" />
      <DriverBreadcrumb items={[{ label: 'Mon Parcours', href: '/journey' }, { label: 'Opportunities', href: '/journey/opportunities' }, { label: opportunity.name }]} />
      <div className="px-4 space-y-4 pb-8">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Overview</CardTitle>
                <CardDescription>{opportunity.reason}</CardDescription>
              </div>
              <JourneyBadge value={opportunity.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Alert className="border-amber-500/40 bg-amber-50">
              <Lock className="h-4 w-4" />
              <AlertTitle>Locked Opportunity Experience</AlertTitle>
              <AlertDescription>{opportunity.disclaimer}</AlertDescription>
            </Alert>
            <div className="rounded-xl bg-muted/40 p-3 text-sm">
              <p className="text-muted-foreground">Remaining</p>
              <p className="mt-1 font-semibold">{opportunity.remaining}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Benefits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {opportunity.benefits.map((benefit) => (
              <div key={benefit} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>{benefit}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold">Requirements</h2>
          {opportunity.requirements.map((requirement) => <RequirementLine key={requirement.key} requirement={requirement} />)}
        </section>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Documents Needed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {journey.documents.map((document) => <DocumentLine key={document.key} document={document} />)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Financial Expectations</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm">
            <InfoTile label="Down Payment" value={formatCurrency(opportunity.financialExpectations.downPayment)} />
            <InfoTile label="Monthly Estimate" value={formatCurrency(opportunity.financialExpectations.estimatedMonthlyObligation)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Timeline</CardTitle>
            <CardDescription>{opportunity.timeline}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="min-h-11 w-full">
              <Link to="/journey/simulator">
                Ownership Simulator
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Frequently Asked Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-semibold">Is this an approval?</p>
              <p className="text-muted-foreground">No. Approval requires a real application, review, contract, and audit trail.</p>
            </div>
            <div>
              <p className="font-semibold">Can I start now?</p>
              <p className="text-muted-foreground">
                {opportunity.canStartApplication ? 'A real active offer is available.' : 'Start Application is hidden until an active published offer exists.'}
              </p>
            </div>
          </CardContent>
        </Card>

        {opportunity.canStartApplication && (
          <div className="space-y-2">
            <Button className="min-h-12 w-full" disabled>
              Start Application
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Application entry requires persisted workflow and audit events.
            </p>
          </div>
        )}
      </div>
    </DriverLayout>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function SimulatorScreen({ journey }: { journey: DriverJourneySummary }) {
  const opportunity = journey.opportunities[0];
  const totalAmount = opportunity?.financialExpectations.totalAmount ?? 4_000_000;
  const minimumDownPayment = opportunity?.financialExpectations.downPayment ?? 500_000;
  const [downPayment, setDownPayment] = useState(minimumDownPayment);
  const [termMonths, setTermMonths] = useState(36);
  const financed = Math.max(0, totalAmount - downPayment);
  const monthly = Math.ceil(financed / termMonths);
  const ownershipDate = useMemo(() => {
    const date = new Date();
    date.setMonth(date.getMonth() + termMonths);
    return formatDateShort(date);
  }, [termMonths]);

  return (
    <DriverLayout>
      <PageHeader title="Ownership Simulator" subtitle="Simulation only" />
      <DriverBreadcrumb items={[{ label: 'Mon Parcours', href: '/journey' }, { label: 'Simulator' }]} />
      <div className="px-4 space-y-4 pb-8">
        <Alert className="border-amber-500/40 bg-amber-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Illustrative only</AlertTitle>
          <AlertDescription>{journey.simulatorDisclaimer}</AlertDescription>
        </Alert>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Vehicle Options</CardTitle>
            <CardDescription>Vehicle Ownership Program estimate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-background p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                  <Car className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold">Suzuki Alto</p>
                  <p className="text-sm text-muted-foreground">{formatCurrency(totalAmount)}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Down Payment</p>
                <p className="text-sm font-bold">{formatCurrency(downPayment)}</p>
              </div>
              <Slider
                min={minimumDownPayment}
                max={Math.max(minimumDownPayment, Math.round(totalAmount * 0.5))}
                step={25_000}
                value={[downPayment]}
                onValueChange={(value) => setDownPayment(value[0] ?? minimumDownPayment)}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Projected Ownership Timeline</p>
                <p className="text-sm font-bold">{termMonths} months</p>
              </div>
              <Slider
                min={24}
                max={48}
                step={6}
                value={[termMonths]}
                onValueChange={(value) => setTermMonths(value[0] ?? 36)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-emerald-50/70">
          <CardHeader className="pb-3">
            <CardTitle>Estimated Monthly Obligation</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm">
            <InfoTile label="Financed Amount" value={formatCurrency(financed)} />
            <InfoTile label="Monthly Estimate" value={formatCurrency(monthly)} />
            <InfoTile label="Down Payment" value={formatCurrency(downPayment)} />
            <InfoTile label="Projected Date" value={ownershipDate} />
          </CardContent>
        </Card>
      </div>
    </DriverLayout>
  );
}

function DocumentLine({ document }: { document: DriverJourneyDocument }) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold">{document.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{document.explanation}</p>
            {document.rejectionReason && <p className="mt-1 text-xs font-medium text-red-700">{document.rejectionReason}</p>}
          </div>
        </div>
        <JourneyBadge value={document.status} />
      </div>
    </div>
  );
}

function ApplicationStageLine({ stage }: { stage: DriverJourneyApplicationStage }) {
  const Icon = stage.status === 'completed' ? CheckCircle2 : stage.status === 'current' ? Clock : Circle;
  return (
    <div className="flex gap-3 rounded-xl border bg-background p-3">
      <div className={cn(
        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
        stage.status === 'completed' && 'bg-emerald-50 text-emerald-700',
        stage.status === 'current' && 'bg-sky-50 text-sky-700',
        stage.status === 'locked' && 'bg-muted text-muted-foreground',
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{stage.label}</p>
          <JourneyBadge value={stage.status} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{stage.explanation}</p>
        <p className="mt-2 text-xs font-medium">{stage.nextStep}</p>
      </div>
    </div>
  );
}

function ApplicationTrackerScreen({ journey }: { journey: DriverJourneySummary }) {
  return (
    <DriverLayout>
      <PageHeader title="Application Progress Tracker" subtitle="Reduce anxiety with clear status" />
      <DriverBreadcrumb items={[{ label: 'Mon Parcours', href: '/journey' }, { label: 'Application' }]} />
      <div className="px-4 space-y-4 pb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Application Progress Tracker</CardTitle>
            <CardDescription>Every stage shows status, explanation, and estimated next step.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {journey.applicationTracker.map((stage) => <ApplicationStageLine key={stage.key} stage={stage} />)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Document Collection</CardTitle>
            <CardDescription>Every rejection requires an explanation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {journey.documents.map((document) => <DocumentLine key={document.key} document={document} />)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-600" />
              Down Payment Readiness
            </CardTitle>
            <CardDescription>Read-only readiness tracking. No money movement is created here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <InfoTile label="Required Down Payment" value={formatCurrency(journey.downPaymentReadiness.required)} />
              <InfoTile label="Saved Amount" value={formatCurrency(journey.downPaymentReadiness.saved)} />
              <InfoTile label="Remaining Amount" value={formatCurrency(journey.downPaymentReadiness.remaining)} />
              <InfoTile label="Estimated Completion Date" value={journey.downPaymentReadiness.estimatedCompletionDate ? formatDateShort(journey.downPaymentReadiness.estimatedCompletionDate) : 'Source pending'} />
            </div>
            <Progress
              value={journey.downPaymentReadiness.required > 0
                ? Math.min(100, Math.round((journey.downPaymentReadiness.saved / journey.downPaymentReadiness.required) * 100))
                : 0}
              className="h-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Ownership Activation</CardTitle>
            <CardDescription>{journey.activationReason}</CardDescription>
          </CardHeader>
          <CardContent>
            {journey.activationVisible ? (
              <Button className="min-h-12 w-full" disabled>
                Activate Ownership Path
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" />
                Activation is not visible until all real conditions are complete.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DriverLayout>
  );
}

function MilestonesScreen({ journey }: { journey: DriverJourneySummary }) {
  return (
    <DriverLayout>
      <PageHeader title="Milestones" subtitle="Ownership Milestones and Achievements" />
      <DriverBreadcrumb items={[{ label: 'Mon Parcours', href: '/journey' }, { label: 'Milestones' }]} />
      <div className="px-4 space-y-4 pb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-sky-600" />
              Ownership Milestones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {journey.milestones.map((milestone) => (
              <div key={milestone.key} className="flex gap-3 rounded-xl border bg-background p-3">
                <div className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  milestone.achieved ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground',
                )}>
                  {milestone.achieved ? <CheckCircle2 className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{milestone.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{milestone.explanation}</p>
                  {milestone.date && <p className="mt-1 text-xs font-medium">{formatDateShort(milestone.date)}</p>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <AchievementsVision journey={journey} />
      </div>
    </DriverLayout>
  );
}

export default function DriverJourney() {
  const location = useLocation();
  const data = useDriverJourneyData();

  if (data.isLoading) return <JourneySkeleton />;
  if (data.isError) return <ErrorJourney />;
  if (!data.journey) return <EmptyJourney />;

  if (location.pathname.startsWith('/journey/opportunities/')) return <OpportunityDetail journey={data.journey} />;
  if (location.pathname === '/journey/opportunities') return <OpportunityCenter journey={data.journey} />;
  if (location.pathname === '/journey/eligibility') return <EligibilityScreen journey={data.journey} />;
  if (location.pathname === '/journey/simulator') return <SimulatorScreen journey={data.journey} />;
  if (location.pathname === '/journey/application') return <ApplicationTrackerScreen journey={data.journey} />;
  if (location.pathname === '/journey/milestones') return <MilestonesScreen journey={data.journey} />;

  return <JourneyHome journey={data.journey} />;
}
