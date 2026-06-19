import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  LineChart,
  RefreshCw,
  ShieldAlert,
  Target,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { ListPageSkeleton } from '@/components/AdminSkeletons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ErrorState } from '@/components/ErrorState';
import {
  CREDIT_PORTFOLIO_ANALYTICS_REALTIME_TABLES,
  useCreditPortfolioAnalyticsData,
  useRecordAnalyticsAuditEvent,
  useRecordAnalyticsExport,
  type AdminCreditPortfolioAnalyticsData,
  type PortfolioAccountFactRow,
} from '@/hooks/useCreditPortfolioAnalyticsData';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useAdminUser } from '@/hooks/useAdminUser';
import { logAction } from '@/hooks/useAuditLog';
import { exportToCSV } from '@/lib/export';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/format';
import {
  buildExecutiveNarrative,
  buildPortfolioExportRows,
  freshnessTone,
  normalizeFunnelStages,
  percentLabel,
  recommendedActionLabel,
  riskSegmentLabel,
  severityTone,
} from '@/lib/creditPortfolioAnalytics';
import { cn } from '@/lib/utils';

type AnalyticsTab = 'executive' | 'portfolio' | 'products' | 'risk' | 'ownership' | 'quality' | 'audit';
type DrilldownKind = 'all' | 'past_due' | 'portfolio_at_risk' | 'default_review' | 'ownership_completed';

const tabItems: Array<{ key: AnalyticsTab; label: string }> = [
  { key: 'executive', label: 'Executive' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'products', label: 'Products' },
  { key: 'risk', label: 'Risk' },
  { key: 'ownership', label: 'Ownership' },
  { key: 'quality', label: 'Quality' },
  { key: 'audit', label: 'Audit' },
];

const drilldownLabels: Record<DrilldownKind, string> = {
  all: 'All source accounts',
  past_due: 'Past-due accounts',
  portfolio_at_risk: 'Portfolio-at-risk records',
  default_review: 'Default review records',
  ownership_completed: 'Completed ownership records',
};

function money(value: number | null | undefined) {
  return formatCurrency(Math.round(value ?? 0));
}

function dateTime(value: string | null | undefined) {
  return value ? formatDateTime(value) : 'Not recorded';
}

function badgeVariant(value: string | null | undefined): BadgeProps['variant'] {
  return freshnessTone(value) as BadgeProps['variant'];
}

function MetricButton({
  label,
  value,
  helper,
  icon: Icon,
  tone = 'default',
  onClick,
}: {
  label: string;
  value: string;
  helper: string;
  icon: typeof WalletCards;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-full rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        tone === 'warning' && 'border-warning/40 bg-warning/5',
        tone === 'danger' && 'border-destructive/40 bg-destructive/5',
        tone === 'success' && 'border-success/40 bg-success/5',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-normal">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
        </div>
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </button>
  );
}

function FormulaTooltip({ text }: { text: string }) {
  return (
    <UiTooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <Eye className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <p>{text}</p>
      </TooltipContent>
    </UiTooltip>
  );
}

function EmptyRows({ label }: { label: string }) {
  return (
    <TableRow>
      <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
        {label}
      </TableCell>
    </TableRow>
  );
}

function filterAccounts(accounts: PortfolioAccountFactRow[], drilldown: DrilldownKind) {
  switch (drilldown) {
    case 'past_due':
      return accounts.filter((account) => account.past_due_amount > 0);
    case 'portfolio_at_risk':
      return accounts.filter((account) => !['CURRENT', 'DUE_TODAY'].includes(account.risk_segment));
    case 'default_review':
      return accounts.filter((account) => account.default_reviews_open > 0 || account.formal_default_amount > 0);
    case 'ownership_completed':
      return accounts.filter((account) => account.ownership_status === 'COMPLETED' || account.certificate_issued);
    default:
      return accounts;
  }
}

function SourceRecordsTable({
  accounts,
  drilldown,
  onReset,
}: {
  accounts: PortfolioAccountFactRow[];
  drilldown: DrilldownKind;
  onReset: () => void;
}) {
  const rows = filterAccounts(accounts, drilldown).slice(0, 12);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle className="text-base">Source records</CardTitle>
          <CardDescription>{drilldownLabels[drilldown]} - formulas trace to account facts.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onReset}>
          <Filter className="mr-2 h-4 w-4" />
          Show all
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Past due</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <EmptyRows label="No source records match this drilldown." />
              ) : rows.map((account) => (
                <TableRow key={account.credit_account_id}>
                  <TableCell>
                    <div className="font-medium">{account.driver_name ?? 'Driver'}</div>
                    <div className="text-xs text-muted-foreground">{account.driver_phone ?? account.driver_id.slice(0, 8)}</div>
                  </TableCell>
                  <TableCell>
                    <div>{account.product_name ?? account.product_type ?? 'Product'}</div>
                    <div className="text-xs text-muted-foreground">{account.branch_name ?? 'No branch'}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{account.account_status}</Badge>
                  </TableCell>
                  <TableCell>{riskSegmentLabel(account.risk_segment)}</TableCell>
                  <TableCell className="text-right">{money(account.outstanding_balance)}</TableCell>
                  <TableCell className="text-right">{money(account.past_due_amount)}</TableCell>
                  <TableCell>
                    <FormulaTooltip text={account.formula_description} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ExecutiveTab({
  data,
  narrative,
}: {
  data: AdminCreditPortfolioAnalyticsData;
  narrative: string;
}) {
  const attention = data.attention.slice(0, 6);

  return (
    <div className="space-y-4">
      <Alert>
        <TrendingUp className="h-4 w-4" />
        <AlertTitle>Executive narrative</AlertTitle>
        <AlertDescription>{narrative}</AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Executive attention</CardTitle>
            <CardDescription>Generated from portfolio risk, product performance, ownership backlog, and data-quality source records.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {attention.length === 0 ? (
              <p className="text-sm text-muted-foreground">No executive attention item is open.</p>
            ) : attention.map((item) => (
              <div key={item.attention_item_id} className="rounded-lg border p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={severityTone(item.severity) as BadgeProps['variant']}>{item.severity}</Badge>
                      <p className="font-medium">{item.title}</p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <Badge variant="outline">{item.assigned_owner_role}</Badge>
                </div>
                <p className="mt-2 text-sm">{item.recommended_action}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Data freshness</CardTitle>
            <CardDescription>Each row names its source and freshness status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.freshness.length === 0 ? (
              <p className="text-sm text-muted-foreground">Freshness source has no rows yet.</p>
            ) : data.freshness.map((freshness) => (
              <div key={`${freshness.source_name}-${freshness.last_updated_at}`} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="font-medium">{freshness.source_name}</p>
                  <p className="text-xs text-muted-foreground">{freshness.data_freshness_note}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Updated {dateTime(freshness.last_updated_at)}</p>
                </div>
                <Badge variant={badgeVariant(freshness.data_freshness_status)}>{freshness.data_freshness_status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProductsTab({ data }: { data: AdminCreditPortfolioAnalyticsData }) {
  const chartData = data.products.slice(0, 8).map((product) => ({
    name: product.product_name ?? product.product_type ?? 'Product',
    outstanding: Math.round(product.exposure_outstanding ?? 0),
    pastDue: Math.round((product.exposure_outstanding ?? 0) * ((product.delinquency_rate ?? 0) / 100)),
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Product exposure and risk</CardTitle>
          <CardDescription>Outstanding exposure and delinquency by source-linked product records.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => money(Number(value))} />
                <Bar dataKey="outstanding" fill="hsl(var(--primary))" name="Outstanding" radius={[4, 4, 0, 0]} />
                <Bar dataKey="pastDue" fill="hsl(var(--destructive))" name="Past due" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Product performance</CardTitle>
          <CardDescription>Approval, activation, repayment, delinquency, completion, and recommendation.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Apps</TableHead>
                  <TableHead className="text-right">Approval</TableHead>
                  <TableHead className="text-right">Activation</TableHead>
                  <TableHead className="text-right">Delinquency</TableHead>
                  <TableHead className="text-right">Completion</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.products.length === 0 ? (
                  <EmptyRows label="No product metrics are available yet." />
                ) : data.products.map((product) => (
                  <TableRow key={product.product_id}>
                    <TableCell>
                      <div className="font-medium">{product.product_name ?? 'Product'}</div>
                      <div className="text-xs text-muted-foreground">{product.product_type ?? 'No type'}</div>
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(product.applications_submitted ?? 0)}</TableCell>
                    <TableCell className="text-right">{percentLabel(product.approval_rate)}</TableCell>
                    <TableCell className="text-right">{percentLabel(product.activation_rate)}</TableCell>
                    <TableCell className="text-right">{percentLabel(product.delinquency_rate)}</TableCell>
                    <TableCell className="text-right">{percentLabel(product.completion_rate)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={product.recommended_action === 'continue' ? 'verified' : 'secondary'}>
                          {recommendedActionLabel(product.recommended_action)}
                        </Badge>
                        <FormulaTooltip text={product.calculation_logic} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RiskTab({ data }: { data: AdminCreditPortfolioAnalyticsData }) {
  const riskRows = data.risk.filter((row) => row.account_count > 0 || row.past_due_amount > 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Risk segmentation</CardTitle>
          <CardDescription>Risk bands are derived from days past due, collections, and default review records.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="segment_label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value, name) => (String(name).includes('amount') ? money(Number(value)) : formatNumber(Number(value)))} />
                <Bar dataKey="account_count" fill="hsl(var(--primary))" name="Accounts" radius={[4, 4, 0, 0]} />
                <Bar dataKey="past_due_amount" fill="hsl(var(--destructive))" name="Past due amount" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Risk and delinquency details</CardTitle>
          <CardDescription>Includes obligations due, late bands, collections cases, and default review counts.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Segment</TableHead>
                  <TableHead className="text-right">Accounts</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Past due</TableHead>
                  <TableHead className="text-right">Collections</TableHead>
                  <TableHead className="text-right">Default reviews</TableHead>
                  <TableHead>Formula</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.risk.length === 0 ? (
                  <EmptyRows label="No risk rows are available yet." />
                ) : data.risk.map((row) => (
                  <TableRow key={row.segment_key}>
                    <TableCell>{riskSegmentLabel(row.segment_key)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.account_count)}</TableCell>
                    <TableCell className="text-right">{money(row.outstanding_amount)}</TableCell>
                    <TableCell className="text-right">{money(row.past_due_amount)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.collections_cases_open)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.default_reviews_open)}</TableCell>
                    <TableCell>
                      <FormulaTooltip text={row.calculation_logic} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function OwnershipTab({ data }: { data: AdminCreditPortfolioAnalyticsData }) {
  const stages = normalizeFunnelStages(data.funnel);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Growth and ownership funnel</CardTitle>
        <CardDescription>Each stage is traceable to source records from eligibility through certificate outcomes.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {stages.map((stage) => (
            <div key={stage.stage_key} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Stage {stage.stage_order}</p>
                  <p className="font-medium">{stage.stage_label}</p>
                  <p className="mt-2 text-2xl font-semibold">{formatNumber(stage.record_count)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Conversion {stage.conversion_rate === null ? 'n/a' : percentLabel(stage.conversion_rate)}
                  </p>
                </div>
                <FormulaTooltip text={stage.calculation_logic ?? 'Source logic unavailable'} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{stage.source_tables}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function QualityTab({ data }: { data: AdminCreditPortfolioAnalyticsData }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data quality warnings</CardTitle>
          <CardDescription>Analytics does not hide reconciliation anomalies.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Anomaly</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Detected</TableHead>
                  <TableHead>Formula</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.reconciliation.length === 0 ? (
                  <EmptyRows label="No data quality anomaly is currently visible." />
                ) : data.reconciliation.slice(0, 20).map((row) => (
                  <TableRow key={row.anomaly_id}>
                    <TableCell>
                      <Badge variant={severityTone(row.severity) as BadgeProps['variant']}>{row.severity}</Badge>
                    </TableCell>
                    <TableCell>{row.anomaly_type.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="font-mono text-xs">{row.source_reference_id?.slice(0, 12) ?? 'n/a'}</TableCell>
                    <TableCell>{dateTime(row.detected_at)}</TableCell>
                    <TableCell>
                      <FormulaTooltip text={row.calculation_logic} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metric library</CardTitle>
          <CardDescription>Every metric names its formula, source view, owner, cadence, and limitation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.metricDefinitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Metric definitions are not loaded yet.</p>
          ) : data.metricDefinitions.map((metric) => (
            <div key={metric.metric_id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{metric.metric_name}</p>
                  <p className="text-xs text-muted-foreground">{metric.source_view} - {metric.refresh_cadence}</p>
                </div>
                <Badge variant="outline">{metric.owner_role}</Badge>
              </div>
              <p className="mt-2 text-sm">{metric.formula_description}</p>
              <p className="mt-1 text-xs text-muted-foreground">{metric.known_limitations}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AuditTab({ data }: { data: AdminCreditPortfolioAnalyticsData }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export history</CardTitle>
          <CardDescription>Permissioned exports are recorded before the browser download starts.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead>Confidentiality</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.exports.length === 0 ? (
                <EmptyRows label="No export history yet." />
              ) : data.exports.map((row) => (
                <TableRow key={row.export_id}>
                  <TableCell>{row.export_type}</TableCell>
                  <TableCell>{dateTime(row.generated_at)}</TableCell>
                  <TableCell>{row.confidentiality_label}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Analytics audit</CardTitle>
          <CardDescription>Dashboard access, drilldowns, and exports are captured here.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.auditEvents.length === 0 ? (
                <EmptyRows label="No analytics audit event is visible yet." />
              ) : data.auditEvents.map((row) => (
                <TableRow key={row.audit_event_id}>
                  <TableCell>{row.event_type}</TableCell>
                  <TableCell>{row.target_type}</TableCell>
                  <TableCell>{dateTime(row.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CreditPortfolioAnalytics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTab = (searchParams.get('tab') as AnalyticsTab) || 'executive';
  const [drilldown, setDrilldown] = useState<DrilldownKind>('all');
  const { adminUser } = useAdminUser();
  const dataQuery = useCreditPortfolioAnalyticsData();
  const auditMutation = useRecordAnalyticsAuditEvent();
  const exportMutation = useRecordAnalyticsExport();
  const canExport = ['super_admin', 'manager'].includes(adminUser?.role_key ?? '');

  useRealtimeSubscription({
    tables: CREDIT_PORTFOLIO_ANALYTICS_REALTIME_TABLES,
    showToasts: false,
  });

  useEffect(() => {
    auditMutation.mutate({
      eventType: 'DASHBOARD_ACCESSED',
      targetType: 'credit_portfolio_analytics',
      filters: { tab: selectedTab },
      reportType: 'layer3h_credit_portfolio',
    });
    logAction({
      action: 'credit_portfolio_viewed',
      targetType: 'analytics',
      details: { tab: selectedTab },
    });
    // run once per page mount; tab drilldowns are recorded separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = dataQuery.data;
  const narrative = useMemo(() => (
    buildExecutiveNarrative(data?.health, data?.products ?? [], data?.attention ?? [])
  ), [data]);

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  const handleDrilldown = (next: DrilldownKind) => {
    setDrilldown(next);
    auditMutation.mutate({
      eventType: 'DRILLDOWN_ACCESSED',
      targetType: 'credit_portfolio_metric',
      targetId: next,
      filters: { tab: selectedTab, drilldown: next },
      reportType: 'layer3h_credit_portfolio',
    });
  };

  const handleExport = async () => {
    if (!data) return;
    if (!canExport) {
      toast.error('Export reserve aux roles executive/manager');
      return;
    }

    const exportId = await exportMutation.mutateAsync({
      exportType: 'portfolio_summary',
      filters: { tab: selectedTab, drilldown },
      confidentialityLabel: 'CONFIDENTIAL - DAM Africa',
    });

    const rows = buildPortfolioExportRows(data.health, data.products, data.attention).map((row) => ({
      ...row,
      generated_at: new Date().toISOString(),
      export_id: exportId,
      filters: `tab=${selectedTab};drilldown=${drilldown}`,
      confidentiality: 'CONFIDENTIAL - DAM Africa',
    }));

    exportToCSV(rows, `layer3h-credit-portfolio-${new Date().toISOString().slice(0, 10)}`);
    logAction({
      action: 'credit_portfolio_exported',
      targetType: 'analytics',
      targetId: exportId ?? undefined,
      details: { tab: selectedTab, drilldown },
    });
  };

  if (dataQuery.isLoading) {
    return (
      <AdminLayout>
        <ListPageSkeleton />
      </AdminLayout>
    );
  }

  if (dataQuery.error || !data) {
    return (
      <AdminLayout>
        <ErrorState
          title="Portfolio analytics unavailable"
          message={dataQuery.error instanceof Error ? dataQuery.error.message : 'Layer 3H views are not available yet.'}
          onRetry={() => dataQuery.refetch()}
        />
      </AdminLayout>
    );
  }

  const health = data.health;

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Portfolio Analytics' }]} />
      <AdminPageHeader
        title="Credit Portfolio Analytics"
        description="Source-linked executive intelligence across credit, repayment, collections, default, and ownership completion."
        action={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => dataQuery.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={handleExport} disabled={exportMutation.isPending || !canExport}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        )}
      />

      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricButton
            label="Active accounts"
            value={formatNumber(health?.active_credit_accounts ?? 0)}
            helper="credit_accounts in active states"
            icon={WalletCards}
            onClick={() => handleDrilldown('all')}
          />
          <MetricButton
            label="Outstanding"
            value={money(health?.current_outstanding_balance)}
            helper="unpaid scheduled obligations"
            icon={BarChart3}
            onClick={() => handleDrilldown('all')}
          />
          <MetricButton
            label="Past due"
            value={money(health?.total_past_due_amount)}
            helper="late obligations and active risk queues"
            icon={AlertTriangle}
            tone={(health?.total_past_due_amount ?? 0) > 0 ? 'warning' : 'success'}
            onClick={() => handleDrilldown('past_due')}
          />
          <MetricButton
            label="Portfolio at risk"
            value={percentLabel(health?.portfolio_at_risk_rate)}
            helper={money(health?.portfolio_at_risk_amount)}
            icon={ShieldAlert}
            tone={(health?.portfolio_at_risk_rate ?? 0) > 10 ? 'danger' : 'default'}
            onClick={() => handleDrilldown('portfolio_at_risk')}
          />
          <MetricButton
            label="Default review"
            value={money(health?.default_review_amount)}
            helper="open default review amount"
            icon={Target}
            tone={(health?.default_review_amount ?? 0) > 0 ? 'warning' : 'default'}
            onClick={() => handleDrilldown('default_review')}
          />
          <MetricButton
            label="Formal default"
            value={money(health?.formally_defaulted_amount)}
            helper="confirmed default exposure"
            icon={ShieldAlert}
            tone={(health?.formally_defaulted_amount ?? 0) > 0 ? 'danger' : 'default'}
            onClick={() => handleDrilldown('default_review')}
          />
          <MetricButton
            label="Ownership completed"
            value={formatNumber(health?.completed_ownership_count ?? 0)}
            helper="completed transfers/certificates"
            icon={TrendingUp}
            tone="success"
            onClick={() => handleDrilldown('ownership_completed')}
          />
          <MetricButton
            label="Active products"
            value={formatNumber(health?.active_product_count ?? 0)}
            helper="live product catalog"
            icon={FileSpreadsheet}
            onClick={() => handleDrilldown('all')}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={badgeVariant(health?.data_freshness_status)}>{health?.data_freshness_status ?? 'UNKNOWN'}</Badge>
          <span className="text-sm text-muted-foreground">Last updated {dateTime(health?.last_updated_at)}</span>
          <span className="text-sm text-muted-foreground">Source: {health?.source_view ?? 'v_credit_portfolio_health'}</span>
        </div>

        <Tabs value={selectedTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className="flex h-auto flex-wrap justify-start">
            {tabItems.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="executive">
            <ExecutiveTab data={data} narrative={narrative} />
          </TabsContent>

          <TabsContent value="portfolio">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Portfolio Health</CardTitle>
                  <CardDescription>{health?.calculation_logic ?? 'No calculation loaded.'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between gap-3"><span>Total exposure</span><strong>{money(health?.total_deployed_exposure)}</strong></div>
                  <div className="flex justify-between gap-3"><span>Paid to date</span><strong>{money(health?.total_paid_to_date)}</strong></div>
                  <div className="flex justify-between gap-3"><span>Outstanding</span><strong>{money(health?.current_outstanding_balance)}</strong></div>
                  <div className="flex justify-between gap-3"><span>Past due</span><strong>{money(health?.total_past_due_amount)}</strong></div>
                  <div className="flex justify-between gap-3"><span>PAR</span><strong>{percentLabel(health?.portfolio_at_risk_rate)}</strong></div>
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Branch / city performance</CardTitle>
                  <CardDescription>Branch proxy uses driver city and discloses that limitation.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Location</TableHead>
                        <TableHead className="text-right">Accounts</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                        <TableHead className="text-right">Past due</TableHead>
                        <TableHead>Signal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.branches.length === 0 ? (
                        <EmptyRows label="No branch/city performance rows yet." />
                      ) : data.branches.map((branch) => (
                        <TableRow key={`${branch.branch_name}-${branch.city}`}>
                          <TableCell>{branch.branch_name ?? 'No city'}</TableCell>
                          <TableCell className="text-right">{formatNumber(branch.active_accounts)}</TableCell>
                          <TableCell className="text-right">{money(branch.outstanding_balance)}</TableCell>
                          <TableCell className="text-right">{money(branch.past_due_amount)}</TableCell>
                          <TableCell>{branch.risk_signal}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="products">
            <ProductsTab data={data} />
          </TabsContent>

          <TabsContent value="risk">
            <RiskTab data={data} />
          </TabsContent>

          <TabsContent value="ownership">
            <OwnershipTab data={data} />
          </TabsContent>

          <TabsContent value="quality">
            <QualityTab data={data} />
          </TabsContent>

          <TabsContent value="audit">
            <AuditTab data={data} />
          </TabsContent>
        </Tabs>

        <SourceRecordsTable
          accounts={data.accounts}
          drilldown={drilldown}
          onReset={() => handleDrilldown('all')}
        />
      </div>
    </AdminLayout>
  );
}
