import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BadgeCheck,
  ClipboardCheck,
  Clock3,
  FileSearch,
  GitBranch,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { ListPageSkeleton } from '@/components/AdminSkeletons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { creditStatusLabel, type CreditApplicationRow } from '@/hooks/useCreditProductEngineData';
import {
  latestUnderwritingDecision,
  useAdminUnderwritingOperationsData,
  useEvaluateUnderwritingDecision,
  useFulfillUnderwritingCondition,
  useReviewUnderwritingApplication,
  useTriggerReunderwriting,
  type UnderwritingDecisionRow,
} from '@/hooks/useUnderwritingOperationsData';

function statusVariant(status: string | null | undefined) {
  if (['ACTIVE', 'APPROVED', 'UNDERWRITING_APPROVED', 'FULFILLED', 'RESOLVED'].includes(status ?? '')) return 'verified';
  if (['DECLINED', 'UNDERWRITING_DECLINED', 'ESCALATED', 'UNDERWRITING_ESCALATED', 'EXCEEDS_LIMIT', 'BLOCKING'].includes(status ?? '')) return 'destructive';
  if (['MANUAL_REVIEW', 'UNDERWRITING_REVIEW', 'APPROVED_WITH_CONDITIONS', 'UNDERWRITING_CONDITIONAL', 'PENDING', 'OPEN', 'IN_REVIEW'].includes(status ?? '')) return 'secondary';
  return 'outline';
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
          </div>
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UnderwritingActions({
  app,
  decision,
}: {
  app: CreditApplicationRow;
  decision: UnderwritingDecisionRow | null;
}) {
  const evaluate = useEvaluateUnderwritingDecision();
  const review = useReviewUnderwritingApplication();
  const trigger = useTriggerReunderwriting();

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={evaluate.isPending}
        onClick={() => evaluate.mutate(app.application_id)}
      >
        <FileSearch className="h-4 w-4" />
        Évaluer
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!decision || review.isPending}
        onClick={() => review.mutate({
          applicationId: app.application_id,
          decision: 'APPROVED_WITH_CONDITIONS',
          driverExplanation: 'Votre demande est pré-approuvée avec des actions à compléter avant activation.',
          adminExplanation: 'Revue manuelle Layer 3B: approbation conditionnelle confirmée.',
          conditions: [{ condition_type: 'MANAGER_APPROVAL', description: 'Validation manager requise avant activation.' }],
        })}
      >
        <ListChecks className="h-4 w-4" />
        Conditionner
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!decision || trigger.isPending}
        onClick={() => trigger.mutate({
          applicationId: app.application_id,
          priorDecisionId: decision?.decision_id ?? null,
          triggerType: 'RISK_STATUS_CHANGED',
        })}
      >
        <RefreshCw className="h-4 w-4" />
        Ré-underwrite
      </Button>
    </div>
  );
}

export default function UnderwritingOperations() {
  const { data, isLoading, isError, error } = useAdminUnderwritingOperationsData();
  const fulfillCondition = useFulfillUnderwritingCondition();

  if (isLoading) {
    return (
      <AdminLayout>
        <AdminBreadcrumb items={[{ label: 'Underwriting Operations' }]} />
        <ListPageSkeleton columns={8} rows={7} />
      </AdminLayout>
    );
  }

  const applications = data?.applications ?? [];
  const decisions = data?.decisions ?? [];
  const conditions = data?.conditions ?? [];
  const assignments = data?.reviewAssignments ?? [];
  const triggers = data?.reunderwritingTriggers ?? [];
  const policies = data?.policySets ?? [];
  const extensions = data?.extensions ?? [];
  const pendingReviews = assignments.filter((assignment) => ['OPEN', 'IN_REVIEW'].includes(assignment.status));
  const pendingConditions = conditions.filter((condition) => condition.status === 'PENDING');
  const blockingTriggers = triggers.filter((trigger) => ['PENDING', 'BLOCKING'].includes(trigger.status));

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Underwriting Operations' }]} />
      <AdminPageHeader
        title="Underwriting Operations"
        description="Layer 3B decision queue, policy evidence, conditions, review assignments, and re-underwriting triggers."
      />

      <div className="space-y-6">
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Layer 3B owns approvals</AlertTitle>
          <AlertDescription>
            Activation, contracting, billing, and fulfillment consume the latest persisted underwriting decision.
          </AlertDescription>
        </Alert>
        {isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Underwriting data unavailable</AlertTitle>
            <AlertDescription>{error instanceof Error ? error.message : 'Apply the Layer 3B migration before use.'}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={ClipboardCheck} label="Decisions" value={decisions.length} helper="Persisted 3B outcomes" />
          <MetricCard icon={Clock3} label="Review Queue" value={pendingReviews.length} helper="Expiry-aware assignments" />
          <MetricCard icon={ListChecks} label="Pending Conditions" value={pendingConditions.length} helper="Activation remains locked" />
          <MetricCard icon={RefreshCw} label="Re-underwriting" value={blockingTriggers.length} helper="Blocking trigger events" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/admin/credit-operations"><BadgeCheck className="h-4 w-4" /> Credit Operations</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/admin/trust-risk"><ShieldAlert className="h-4 w-4" /> Trust & Risk</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/admin/contracts"><ClipboardCheck className="h-4 w-4" /> Contracts</Link></Button>
        </div>

        <Tabs defaultValue="queue">
          <TabsList className="mb-4 flex h-auto flex-wrap">
            <TabsTrigger value="queue">Queue</TabsTrigger>
            <TabsTrigger value="evidence">Decision Evidence</TabsTrigger>
            <TabsTrigger value="conditions">Conditions</TabsTrigger>
            <TabsTrigger value="triggers">Re-underwriting</TabsTrigger>
            <TabsTrigger value="policy">Policy</TabsTrigger>
          </TabsList>

          <TabsContent value="queue">
            <Card>
              <CardHeader>
                <CardTitle>Underwriting Queue</CardTitle>
                <CardDescription>Applications are evaluated against immutable snapshots and active policy versions.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Application</TableHead>
                      <TableHead>Decision</TableHead>
                      <TableHead>Risk</TableHead>
                      <TableHead>Exposure</TableHead>
                      <TableHead>Valid Until</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {applications.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No applications in underwriting</TableCell></TableRow>
                    ) : applications.map((app) => {
                      const decision = latestUnderwritingDecision(app.application_id, decisions);
                      return (
                        <TableRow key={app.application_id}>
                          <TableCell>
                            <p className="font-medium">{app.credit_products?.name ?? 'Credit product'}</p>
                            <p className="text-xs text-muted-foreground">v{app.product_versions?.version_number ?? 1}</p>
                          </TableCell>
                          <TableCell>{decision?.decision_score_value ?? app.score_snapshot ?? 'Pending'}{decision?.decision_score_grade ? ` · ${decision.decision_score_grade}` : ''}</TableCell>
                          <TableCell><Badge variant={statusVariant(app.status) as never}>{creditStatusLabel(app.status)}</Badge></TableCell>
                          <TableCell>
                            {decision ? <Badge variant={statusVariant(decision.decision) as never}>{creditStatusLabel(decision.decision)}</Badge> : <Badge variant="outline">No 3B decision</Badge>}
                          </TableCell>
                          <TableCell>{decision ? <Badge variant={statusVariant(decision.risk_assessment) as never}>{decision.risk_assessment}</Badge> : '-'}</TableCell>
                          <TableCell>{decision ? `${formatCurrency(decision.requested_exposure_amount)} / ${formatCurrency(decision.available_exposure_amount)}` : '-'}</TableCell>
                          <TableCell>{decision?.decision_valid_until ? formatDateShort(decision.decision_valid_until) : '-'}</TableCell>
                          <TableCell><UnderwritingActions app={app} decision={decision} /></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="evidence">
            <div className="grid gap-4 xl:grid-cols-2">
              {decisions.length === 0 ? (
                <Card><CardContent className="p-6 text-sm text-muted-foreground">No decision evidence yet.</CardContent></Card>
              ) : decisions.slice(0, 8).map((decision) => (
                <Card key={decision.decision_id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{creditStatusLabel(decision.decision)}</CardTitle>
                        <CardDescription>{formatDateShort(decision.decision_timestamp)} · policy v{decision.evaluated_policy_version}</CardDescription>
                      </div>
                      <Badge variant={statusVariant(decision.decision) as never}>{decision.decision}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid grid-cols-4 gap-2">
                      <div className="rounded-lg border p-2"><p className="text-muted-foreground">Trust</p><p className="font-semibold">{decision.trust_assessment}</p></div>
                      <div className="rounded-lg border p-2"><p className="text-muted-foreground">Financial</p><p className="font-semibold">{decision.financial_assessment}</p></div>
                      <div className="rounded-lg border p-2"><p className="text-muted-foreground">Risk</p><p className="font-semibold">{decision.risk_assessment}</p></div>
                      <div className="rounded-lg border p-2"><p className="text-muted-foreground">Exposure</p><p className="font-semibold">{decision.exposure_assessment}</p></div>
                    </div>
                    <p>{decision.admin_explanation}</p>
                    <p className="text-xs text-muted-foreground">Reason codes: {(decision.reason_codes_json ?? []).join(', ') || 'None'}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="conditions">
            <Card>
              <CardHeader>
                <CardTitle>Underwriting Conditions</CardTitle>
                <CardDescription>Activation cannot complete while a condition is pending.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Condition</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conditions.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No conditions yet</TableCell></TableRow>
                    ) : conditions.map((condition) => (
                      <TableRow key={condition.condition_id}>
                        <TableCell>
                          <p className="font-medium">{condition.condition_type.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-muted-foreground">{condition.description}</p>
                        </TableCell>
                        <TableCell><Badge variant={statusVariant(condition.status) as never}>{creditStatusLabel(condition.status)}</Badge></TableCell>
                        <TableCell>{formatDateShort(condition.created_at)}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={condition.status !== 'PENDING' || fulfillCondition.isPending}
                            onClick={() => fulfillCondition.mutate({ conditionId: condition.condition_id, status: 'FULFILLED' })}
                          >
                            <BadgeCheck className="h-4 w-4" />
                            Fulfill
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="triggers">
            <Card>
              <CardHeader>
                <CardTitle>Re-underwriting Triggers</CardTitle>
                <CardDescription>Trigger events block downstream progress until a fresh 3B outcome exists.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trigger</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {triggers.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No re-underwriting triggers</TableCell></TableRow>
                    ) : triggers.map((trigger) => (
                      <TableRow key={trigger.trigger_id}>
                        <TableCell className="font-medium">{trigger.trigger_type.replace(/_/g, ' ')}</TableCell>
                        <TableCell>{trigger.trigger_source}</TableCell>
                        <TableCell><Badge variant={statusVariant(trigger.status) as never}>{creditStatusLabel(trigger.status)}</Badge></TableCell>
                        <TableCell>{formatDateShort(trigger.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="policy">
            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Active Underwriting Policies</CardTitle>
                  <CardDescription>Decision matrices and approval authorities are versioned policy data.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {policies.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No active underwriting policy.</p>
                  ) : policies.map((policy) => (
                    <div key={policy.policy_id} className="rounded-lg border p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{policy.policy_name}</p>
                          <p className="text-xs text-muted-foreground">v{policy.version} · effective {formatDateShort(policy.effective_from)}</p>
                        </div>
                        <Badge variant={statusVariant(policy.status) as never}>{creditStatusLabel(policy.status)}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">Matrix rows: {policy.decision_matrix_json?.length ?? 0}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Product Extensions</CardTitle>
                  <CardDescription>Extensions add gates and conditions; the core engine owns final outcomes.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {extensions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No product extensions configured.</p>
                  ) : extensions.map((extension) => (
                    <div key={extension.extension_id} className="rounded-lg border p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{extension.extension_key.replace(/_/g, ' ')}</span>
                        <Badge variant={statusVariant(extension.status) as never}>{creditStatusLabel(extension.status)}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Outputs: {Array.isArray(extension.extension_config_json.output_only) ? extension.extension_config_json.output_only.join(', ') : 'structured gates'}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
