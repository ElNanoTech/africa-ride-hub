import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  Download,
  FileText,
  GraduationCap,
  HelpCircle,
  History,
  LayoutDashboard,
  Lightbulb,
  Lock,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminUser } from '@/hooks/useAdminUser';
import { logAction } from '@/hooks/useAuditLog';
import {
  OPERATING_EXPERIENCE_REALTIME_TABLES,
  useAdvanceGuidedWorkflow,
  useOperatingExperienceData,
  useOperatingKnowledgeSearch,
  useRecalculateTenantHealthScore,
  useRecordOperatingAuditEvent,
  useRefreshNextBestActions,
  useSetLearningProgress,
  type ContextualHelpRow,
  type GuidedWorkflowStatusRow,
  type LearningCenterProgressRow,
  type OperatingNextBestActionRow,
  type OperatingPlaybookRow,
  type RoleExperienceHomepageRow,
  type TenantHealthDashboardRow,
} from '@/hooks/useOperatingExperienceData';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { exportToCSV } from '@/lib/export';
import {
  buildOperatingExperienceExportRows,
  disabledActionExplanation,
  groupActionsByUrgency,
  guidanceEmptyState,
  healthScoreTone,
  roleExperienceForAdminRole,
  searchResultKindLabel,
  urgencyTone,
  workflowProgressLabel,
} from '@/lib/operatingExperience';
import { cn } from '@/lib/utils';

type OperatingTab = 'home' | 'actions' | 'learning' | 'knowledge' | 'workflows' | 'playbooks' | 'guidance' | 'health' | 'audit';

const tabItems: Array<{ key: OperatingTab; label: string; icon: typeof Compass }> = [
  { key: 'home', label: 'Role Homepage', icon: LayoutDashboard },
  { key: 'actions', label: 'Next Best Action', icon: Sparkles },
  { key: 'learning', label: 'Training Center', icon: GraduationCap },
  { key: 'knowledge', label: 'Knowledge Search', icon: Search },
  { key: 'workflows', label: 'Guided Workflow', icon: ClipboardCheck },
  { key: 'playbooks', label: 'Playbooks', icon: BookOpen },
  { key: 'guidance', label: 'Empty & Disabled States', icon: HelpCircle },
  { key: 'health', label: 'Tenant Health Dashboard', icon: ShieldCheck },
  { key: 'audit', label: 'Audit', icon: History },
];

function safeItems<T extends Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function firstString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function LoadingState() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminBreadcrumb items={[{ label: 'Operating Experience' }]} />
        <AdminPageHeader title="Operating Experience" description="Loading role guidance..." />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    </AdminLayout>
  );
}

function KpiCard({ title, value, detail, icon: Icon, tone = 'default' }: {
  title: string;
  value: string | number;
  detail: string;
  icon: typeof Compass;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  return (
    <Card className={cn(
      tone === 'warning' && 'border-warning/30 bg-warning/5',
      tone === 'danger' && 'border-destructive/30 bg-destructive/5',
      tone === 'success' && 'border-success/30 bg-success/5',
    )}>
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

function RoleHomepagePanel({ role, openActions, learningRows }: {
  role: RoleExperienceHomepageRow | null;
  openActions: OperatingNextBestActionRow[];
  learningRows: LearningCenterProgressRow[];
}) {
  if (!role) {
    return (
      <Alert>
        <Lightbulb className="h-4 w-4" />
        <AlertTitle>Role Homepage unavailable</AlertTitle>
        <AlertDescription>Refresh Layer 3X seed data after the migration is applied.</AlertDescription>
      </Alert>
    );
  }

  const navigation = safeItems<{ label?: string; href?: string }>(role.navigation_json);
  const actions = safeItems<{ label?: string; href?: string }>(role.primary_actions_json);
  const dashboardCards = safeItems<{ label?: string; metric?: string }>(role.dashboard_cards_json);
  const completedTraining = learningRows.filter((row) => row.progress_status === 'COMPLETED').length;
  const trainingPercent = learningRows.length ? Math.round((completedTraining / learningRows.length) * 100) : 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle>Role Homepage: {role.role_name}</CardTitle>
                <CardDescription>{role.focus_area}</CardDescription>
              </div>
              <Badge variant="verified">Role-based experience operational</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {dashboardCards.map((card) => (
              <div key={firstString(card.label, firstString(card.metric, 'Metric'))} className="rounded-lg border p-3">
                <p className="text-sm font-medium">{firstString(card.label, 'Role metric')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{firstString(card.metric, 'operating_metric').replace(/_/g, ' ')}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Smart navigation</CardTitle>
            <CardDescription>Visible shortcuts for this responsibility set.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-3">
            {navigation.map((item) => (
              <Button key={firstString(item.href, firstString(item.label, 'nav'))} variant="outline" className="justify-start" asChild>
                <Link to={firstString(item.href, '/admin/operating-experience')}>
                  <Compass className="mr-2 h-4 w-4" />
                  {firstString(item.label, 'Open')}
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What should I do next?</CardTitle>
            <CardDescription>{openActions.length} open action cards for this role and tenant.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {openActions.slice(0, 4).map((action) => (
              <NextBestActionCard key={action.action_id} action={action} compact />
            ))}
            {openActions.length === 0 && (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No open actions for this role.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Training track</CardTitle>
            <CardDescription>{completedTraining}/{learningRows.length} learning modules complete.</CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={trainingPercent} className="h-2" />
            <div className="mt-3 flex flex-wrap gap-2">
              {role.training_track_keys.map((key) => <Badge key={key} variant="outline">{key.replace(/_/g, ' ')}</Badge>)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Primary actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {actions.map((action) => (
              <Button key={firstString(action.label, 'action')} className="w-full justify-start" asChild>
                <Link to={firstString(action.href, '/admin/operating-experience')}>
                  <Play className="mr-2 h-4 w-4" />
                  {firstString(action.label, 'Start')}
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function NextBestActionCard({ action, compact = false }: { action: OperatingNextBestActionRow; compact?: boolean }) {
  return (
    <div className={cn('rounded-lg border p-4', action.urgency === 'URGENT' && 'border-destructive/40 bg-destructive/5')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={urgencyTone(action.urgency) as BadgeProps['variant']}>{action.urgency_label}</Badge>
            <Badge variant="outline">{action.role_key.replace(/_/g, ' ')}</Badge>
          </div>
          <h3 className={cn('mt-2 font-semibold', compact ? 'text-sm' : 'text-base')}>{action.title}</h3>
          {!compact && <p className="mt-1 text-sm text-muted-foreground">{action.description}</p>}
        </div>
        <Button size="sm" asChild>
          <Link to={action.href}>{action.cta_label}</Link>
        </Button>
      </div>
    </div>
  );
}

function NextActionsPanel({ actions }: { actions: OperatingNextBestActionRow[] }) {
  const groups = groupActionsByUrgency(actions);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.urgency} className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={urgencyTone(group.urgency) as BadgeProps['variant']}>{group.label}</Badge>
            <p className="text-sm text-muted-foreground">{group.items.length} action{group.items.length === 1 ? '' : 's'}</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {group.items.map((action) => <NextBestActionCard key={action.action_id} action={action} />)}
          </div>
        </section>
      ))}
      {groups.length === 0 && (
        <GuidanceEmptyState
          title="No next-best-actions"
          what="The action engine turns operational blockers into role-owned cards."
          why="No cards are open for the selected tenant because the current queues are clear or have not been refreshed."
          ctaLabel="Refresh actions"
          href="/admin/operating-experience?tab=actions"
        />
      )}
    </div>
  );
}

function LearningCenterPanel({ rows, onComplete, isSaving }: {
  rows: LearningCenterProgressRow[];
  onComplete: (row: LearningCenterProgressRow) => void;
  isSaving: boolean;
}) {
  const adminRows = rows.filter((row) => !row.is_driver_education);
  const driverRows = rows.filter((row) => row.is_driver_education);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Training Center</CardTitle>
          <CardDescription>Learning Module completion is tracked for operators and driver education.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[...adminRows, ...driverRows].map((row) => (
            <div key={`${row.module_key}-${row.progress_id ?? 'catalog'}`} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Badge variant={row.is_driver_education ? 'secondary' : 'outline'}>{row.category}</Badge>
                  <h3 className="mt-2 font-semibold">{row.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{row.description}</p>
                </div>
                <Badge variant={row.progress_status === 'COMPLETED' ? 'verified' : 'outline'}>
                  {workflowProgressLabel(row.progress_status)}
                </Badge>
              </div>
              <Progress value={row.progress_percent} className="mt-4 h-2" />
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>{row.estimated_minutes} min</span>
                <span>{row.audience_role_keys.join(', ')}</span>
              </div>
              <Button
                className="mt-4 w-full"
                variant={row.progress_status === 'COMPLETED' ? 'outline' : 'default'}
                onClick={() => onComplete(row)}
                disabled={isSaving}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {row.progress_status === 'COMPLETED' ? 'Reconfirm completion' : 'Mark complete'}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function KnowledgePanel() {
  const [query, setQuery] = useState('driver onboarding');
  const search = useOperatingKnowledgeSearch(query, true);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Knowledge Search</CardTitle>
          <CardDescription>Search help articles, training guides, playbooks, workflows, and contextual help.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search KYC, invoices, ownership, licensing..." />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {(search.data ?? []).map((result) => (
          <Card key={`${result.object_type}-${result.object_id}`}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge variant="outline">{searchResultKindLabel(result.object_type)}</Badge>
                  <CardTitle className="mt-2 text-base">{result.title}</CardTitle>
                  <CardDescription>{result.description}</CardDescription>
                </div>
                <Badge variant="secondary">{result.category}</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {result.routes.slice(0, 2).map((route) => (
                <Button key={route} size="sm" variant="outline" asChild>
                  <Link to={route}>Open source</Link>
                </Button>
              ))}
              {result.tags.slice(0, 4).map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}
            </CardContent>
          </Card>
        ))}
        {search.isLoading && <Skeleton className="h-36" />}
        {!search.isLoading && (search.data ?? []).length === 0 && (
          <GuidanceEmptyState
            title="No knowledge results"
            what="Knowledge search finds help articles, playbooks, workflows, and learning modules."
            why="No result matched the current query."
            ctaLabel="Search onboarding"
            href="/admin/operating-experience?tab=knowledge"
          />
        )}
      </div>
    </div>
  );
}

function WorkflowsPanel({ workflows, onAdvance, isSaving }: {
  workflows: GuidedWorkflowStatusRow[];
  onAdvance: (workflow: GuidedWorkflowStatusRow, complete?: boolean) => void;
  isSaving: boolean;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {workflows.map((workflow) => {
        const steps = safeItems<{ key?: string; label?: string }>(workflow.steps_json);
        return (
          <Card key={`${workflow.workflow_key}-${workflow.progress_id ?? 'catalog'}`}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge variant="outline">{workflow.category}</Badge>
                  <CardTitle className="mt-2 text-base">{workflow.title}</CardTitle>
                  <CardDescription>{workflow.description}</CardDescription>
                </div>
                <Badge variant={workflow.progress_status === 'COMPLETED' ? 'verified' : 'secondary'}>
                  {workflowProgressLabel(workflow.progress_status)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={workflow.progress_percent} className="h-2" />
              <div className="grid gap-2">
                {steps.map((step, index) => {
                  const active = firstString(step.key, String(index)) === workflow.current_step_key;
                  return (
                    <div key={firstString(step.key, String(index))} className={cn('flex items-center gap-3 rounded-lg border px-3 py-2', active && 'border-primary bg-primary/5')}>
                      <div className={cn('flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold', active && 'border-primary text-primary')}>
                        {index + 1}
                      </div>
                      <span className="text-sm font-medium">{firstString(step.label, firstString(step.key, `Step ${index + 1}`))}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1" onClick={() => onAdvance(workflow)} disabled={isSaving}>
                  <Play className="mr-2 h-4 w-4" />
                  Save progress
                </Button>
                <Button className="flex-1" variant="outline" onClick={() => onAdvance(workflow, true)} disabled={isSaving}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Complete workflow
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function PlaybooksPanel({ playbooks }: { playbooks: OperatingPlaybookRow[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {playbooks.map((playbook) => (
        <Card key={playbook.playbook_id}>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Badge variant="outline">{playbook.category}</Badge>
                <CardTitle className="mt-2 text-base">{playbook.title}</CardTitle>
                <CardDescription>{playbook.purpose}</CardDescription>
              </div>
              <Badge variant="secondary">{playbook.owner_role_key.replace(/_/g, ' ')}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{playbook.trigger_conditions}</p>
            <div className="mt-4 space-y-2">
              {safeItems<{ label?: string; key?: string }>(playbook.steps_json).map((step) => (
                <div key={firstString(step.key, firstString(step.label, 'step'))} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>{firstString(step.label, 'Step')}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function GuidanceEmptyState({ title, what, why, ctaLabel, href }: {
  title: string;
  what: string;
  why: string;
  ctaLabel: string;
  href: string;
}) {
  const empty = guidanceEmptyState({ title, what, why, ctaLabel, href });
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center py-10 text-center">
        <FileText className="h-10 w-10 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">{empty.title}</h3>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">{empty.body}</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link to={empty.href}>{empty.ctaLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function DisabledReasonCard() {
  const explanation = disabledActionExplanation('Activate account', [
    {
      requirement: 'Signed contract',
      isMet: false,
      fix: 'Open Contracts, send the agreement, and wait for signature evidence.',
      href: '/admin/contracts',
    },
    {
      requirement: 'KYC approved',
      isMet: true,
      fix: 'Review driver documents.',
      href: '/admin/drivers',
    },
  ]);

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-warning" />
          <CardTitle>Disabled State</CardTitle>
        </div>
        <CardDescription>{explanation.title}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm font-medium">{explanation.reason}</p>
        <p className="mt-1 text-sm text-muted-foreground">{explanation.fix}</p>
        <Button className="mt-4" variant="outline" asChild disabled={!explanation.href}>
          <Link to={explanation.href ?? '/admin/operating-experience'}>Fix requirement</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function GuidancePanel({ helpContent }: { helpContent: ContextualHelpRow[] }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <GuidanceEmptyState
          title="Empty State"
          what="A module with no records still explains what it does."
          why="The user sees why no records exist and which first action creates value."
          ctaLabel="Create first record"
          href="/admin/drivers/new"
        />
        <DisabledReasonCard />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Contextual Help</CardTitle>
          <CardDescription>Screen-specific help, FAQs, examples, and quick tips.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {helpContent.map((help) => (
              <div key={help.help_id} className="rounded-lg border p-4">
                <Badge variant="outline">{help.route_pattern}</Badge>
                <h3 className="mt-2 font-semibold">{help.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{help.body_md}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HealthPanel({ healthScores }: { healthScores: TenantHealthDashboardRow[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {healthScores.map((score) => (
        <Card key={score.score_id}>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{score.customer_name}</CardTitle>
                <CardDescription>Generated {new Date(score.generated_at).toLocaleString()}</CardDescription>
              </div>
              <Badge variant={healthScoreTone(score.health_score) as BadgeProps['variant']}>{score.score_status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-semibold">{score.health_score}</span>
                <span className="pb-1 text-sm text-muted-foreground">/100</span>
              </div>
              <Progress value={score.health_score} className="mt-3 h-2" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Feature adoption', score.feature_adoption_score],
                ['Workflow completion', score.workflow_completion_score],
                ['Training completion', score.training_completion_score],
                ['Collections efficiency', score.collections_efficiency_score],
                ['Driver adoption', score.driver_adoption_score],
                ['Open actions', score.open_action_count],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AuditPanel({ data }: { data: ReturnType<typeof useOperatingExperienceData>['data'] }) {
  const rows = data?.auditEvents ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Operating guidance audit</CardTitle>
        <CardDescription>Training, workflow, help, search, health, and next-best-action events.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 20).map((event) => (
                <TableRow key={event.audit_event_id}>
                  <TableCell className="font-medium">{event.event_type}</TableCell>
                  <TableCell>{event.actor_name ?? event.driver_name ?? event.actor_role ?? 'System'}</TableCell>
                  <TableCell>{event.target_type} {event.target_id ? `· ${event.target_id}` : ''}</TableCell>
                  <TableCell>{event.customer_name ?? 'Global'}</TableCell>
                  <TableCell>{new Date(event.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No operating guidance audit events yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OperatingExperience() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as OperatingTab | null) ?? 'home';
  const dataQuery = useOperatingExperienceData();
  const { adminUser, customerId, isPlatformOwner } = useAdminUser();
  const setLearningProgress = useSetLearningProgress();
  const advanceWorkflow = useAdvanceGuidedWorkflow();
  const refreshActions = useRefreshNextBestActions();
  const recalculateHealth = useRecalculateTenantHealthScore();
  const recordAudit = useRecordOperatingAuditEvent();
  const recordedViewRef = useRef(false);

  const [tab, setTab] = useState<OperatingTab>(tabItems.some((item) => item.key === initialTab) ? initialTab : 'home');
  const [selectedRoleKey, setSelectedRoleKey] = useState(searchParams.get('role') ?? roleExperienceForAdminRole(adminUser?.role_key));
  const [selectedTenantId, setSelectedTenantId] = useState(searchParams.get('tenant') ?? customerId ?? '');

  useRealtimeSubscription({
    tables: OPERATING_EXPERIENCE_REALTIME_TABLES,
    showToasts: false,
  });

  useEffect(() => {
    if (selectedTenantId || !dataQuery.data?.customers.length) return;
    const preferred = dataQuery.data.customers.find((customer) => customer.slug === 'qa-layer3x-operations')
      ?? dataQuery.data.customers.find((customer) => customer.id === customerId)
      ?? dataQuery.data.customers[0];
    setSelectedTenantId(preferred.id);
  }, [customerId, dataQuery.data?.customers, selectedTenantId]);

  useEffect(() => {
    if (recordedViewRef.current) return;
    recordedViewRef.current = true;
    recordAudit.mutate({
      eventType: 'OPERATING_EXPERIENCE_VIEWED',
      targetType: 'operating_experience',
      reason: 'Operating Experience opened',
    });
    logAction({
      action: 'operating_experience_viewed',
      targetType: 'operating_experience',
      details: { layer: '3X' },
    });
  }, [recordAudit]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    if (selectedRoleKey) next.set('role', selectedRoleKey);
    if (selectedTenantId) next.set('tenant', selectedTenantId);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, selectedRoleKey, selectedTenantId, setSearchParams, tab]);

  const data = dataQuery.data;

  const selectedRole = useMemo(
    () => data?.roleHomepages.find((role) => role.role_key === selectedRoleKey) ?? data?.roleHomepages[0] ?? null,
    [data?.roleHomepages, selectedRoleKey],
  );

  const selectedTenant = useMemo(
    () => data?.customers.find((tenant) => tenant.id === selectedTenantId) ?? data?.customers[0] ?? null,
    [data?.customers, selectedTenantId],
  );

  const openActions = useMemo(() => {
    return (data?.nextBestActions ?? [])
      .filter((action) => action.status === 'OPEN')
      .filter((action) => !selectedTenant?.id || action.customer_id === selectedTenant.id)
      .filter((action) => action.role_key === selectedRoleKey || selectedRoleKey === 'owner' || action.role_key === 'manager')
      .sort((a, b) => b.priority_score - a.priority_score);
  }, [data?.nextBestActions, selectedRoleKey, selectedTenant?.id]);

  const learningRows = useMemo(() => {
    const source = (data?.learningProgress ?? []).filter((row) => {
      const roleMatch = row.audience_role_keys.includes(selectedRoleKey) || (selectedRoleKey === 'owner' && !row.is_driver_education);
      const tenantMatch = !row.customer_id || !selectedTenant?.id || row.customer_id === selectedTenant.id;
      return roleMatch && tenantMatch;
    });
    const byModule = new Map<string, LearningCenterProgressRow>();
    for (const row of source) {
      const existing = byModule.get(row.module_key);
      if (!existing || (row.customer_id === selectedTenant?.id && !existing.customer_id)) {
        byModule.set(row.module_key, row);
      }
    }
    return Array.from(byModule.values()).sort((a, b) => a.sort_order - b.sort_order);
  }, [data?.learningProgress, selectedRoleKey, selectedTenant?.id]);

  const workflows = useMemo(() => {
    const byWorkflow = new Map<string, GuidedWorkflowStatusRow>();
    for (const workflow of data?.workflows ?? []) {
      if (workflow.customer_id && selectedTenant?.id && workflow.customer_id !== selectedTenant.id) continue;
      const existing = byWorkflow.get(workflow.workflow_key);
      if (!existing || (workflow.customer_id === selectedTenant?.id && !existing.customer_id)) {
        byWorkflow.set(workflow.workflow_key, workflow);
      }
    }
    return Array.from(byWorkflow.values());
  }, [data?.workflows, selectedTenant?.id]);

  const healthScores = useMemo(
    () => (data?.healthScores ?? []).filter((score) => !selectedTenant?.id || score.customer_id === selectedTenant.id),
    [data?.healthScores, selectedTenant?.id],
  );

  const handleTabChange = (value: string) => {
    if (tabItems.some((item) => item.key === value)) setTab(value as OperatingTab);
  };

  const handleExport = () => {
    if (!data) return;
    exportToCSV(
      buildOperatingExperienceExportRows({
        actions: openActions,
        healthScores,
        learningRows,
      }),
      `layer3x-operating-experience-${new Date().toISOString().slice(0, 10)}`,
    );
    recordAudit.mutate({
      eventType: 'OPERATING_EXPERIENCE_EXPORTED',
      targetType: 'operating_experience',
      customerId: selectedTenant?.id,
      reason: 'Layer 3X operating export',
    });
    logAction({
      action: 'operating_experience_exported',
      targetType: 'operating_experience',
      details: { layer: '3X', tenant: selectedTenant?.slug },
    });
  };

  const handleWorkflowAdvance = (workflow: GuidedWorkflowStatusRow, complete = false) => {
    const steps = safeItems<{ key?: string }>(workflow.steps_json);
    const stepKey = complete
      ? firstString(steps[steps.length - 1]?.key, workflow.current_step_key ?? 'complete')
      : workflow.current_step_key ?? firstString(steps[0]?.key, 'start');
    advanceWorkflow.mutate({
      workflowKey: workflow.workflow_key,
      currentStepKey: stepKey,
      status: complete ? 'COMPLETED' : 'IN_PROGRESS',
      customerId: selectedTenant?.id,
      context: { source: 'operating_experience_page' },
    });
  };

  if (dataQuery.isLoading) return <LoadingState />;

  if (dataQuery.error || !data) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <AdminBreadcrumb items={[{ label: 'Operating Experience' }]} />
          <AdminPageHeader title="Operating Experience" description="Layer 3X guidance data unavailable" />
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Could not load Layer 3X</AlertTitle>
            <AlertDescription>{dataQuery.error instanceof Error ? dataQuery.error.message : 'Unknown error'}</AlertDescription>
          </Alert>
        </div>
      </AdminLayout>
    );
  }

  const totalOpenActions = data.nextBestActions.filter((action) => action.status === 'OPEN' && (!selectedTenant?.id || action.customer_id === selectedTenant.id)).length;
  const trainingComplete = learningRows.filter((row) => row.progress_status === 'COMPLETED').length;
  const health = healthScores[0];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminBreadcrumb items={[{ label: 'Operating Experience' }]} />
        <AdminPageHeader
          title="Operating Experience"
          description="Layer 3X role guidance, learning, search, workflows, next-best-actions, and tenant health."
          action={(
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => refreshActions.mutate(selectedTenant?.id)} disabled={refreshActions.isPending}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh actions
              </Button>
              <Button variant="outline" onClick={() => recalculateHealth.mutate(selectedTenant?.id)} disabled={recalculateHealth.isPending}>
                <Target className="mr-2 h-4 w-4" />
                Recalculate health
              </Button>
              <Button onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </div>
          )}
        />

        <div className="grid gap-4 md:grid-cols-4">
          <KpiCard title="Open actions" value={totalOpenActions} detail="Urgent, today, weekly, opportunity, training" icon={Sparkles} tone={totalOpenActions > 0 ? 'warning' : 'success'} />
          <KpiCard title="Training completion" value={`${trainingComplete}/${learningRows.length}`} detail="Role learning modules" icon={GraduationCap} />
          <KpiCard title="Guided workflows" value={workflows.length} detail="Saved progress and resume states" icon={ClipboardCheck} />
          <KpiCard title="Tenant health" value={health ? health.health_score : 'n/a'} detail={health?.score_status ?? 'No score'} icon={ShieldCheck} tone={health && health.health_score < 65 ? 'danger' : 'success'} />
        </div>

        <Card>
          <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto]">
            <Select value={selectedRoleKey} onValueChange={setSelectedRoleKey}>
              <SelectTrigger>
                <SelectValue placeholder="Select role experience" />
              </SelectTrigger>
              <SelectContent>
                {data.roleHomepages.map((role) => (
                  <SelectItem key={role.role_key} value={role.role_key}>{role.role_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedTenant?.id ?? ''} onValueChange={setSelectedTenantId} disabled={!isPlatformOwner && !!customerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select tenant" />
              </SelectTrigger>
              <SelectContent>
                {data.customers.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="justify-center py-2">
              {selectedTenant?.slug ?? 'tenant'} · {adminUser?.role_key ?? 'admin'}
            </Badge>
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className="flex h-auto flex-wrap justify-start">
            {tabItems.map(({ key, label, icon: Icon }) => (
              <TabsTrigger key={key} value={key} className="gap-2">
                <Icon className="h-4 w-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="home">
            <RoleHomepagePanel role={selectedRole} openActions={openActions} learningRows={learningRows} />
          </TabsContent>

          <TabsContent value="actions">
            <NextActionsPanel actions={openActions} />
          </TabsContent>

          <TabsContent value="learning">
            <LearningCenterPanel
              rows={learningRows}
              isSaving={setLearningProgress.isPending}
              onComplete={(row) => setLearningProgress.mutate({
                moduleKey: row.module_key,
                customerId: selectedTenant?.id,
                status: 'COMPLETED',
                progressPercent: 100,
                evidence: { source: 'operating_experience_page', role: selectedRoleKey },
              })}
            />
          </TabsContent>

          <TabsContent value="knowledge">
            <KnowledgePanel />
          </TabsContent>

          <TabsContent value="workflows">
            <WorkflowsPanel workflows={workflows} onAdvance={handleWorkflowAdvance} isSaving={advanceWorkflow.isPending} />
          </TabsContent>

          <TabsContent value="playbooks">
            <PlaybooksPanel playbooks={data.playbooks} />
          </TabsContent>

          <TabsContent value="guidance">
            <GuidancePanel helpContent={data.helpContent} />
          </TabsContent>

          <TabsContent value="health">
            <HealthPanel healthScores={healthScores} />
          </TabsContent>

          <TabsContent value="audit">
            <AuditPanel data={data} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
