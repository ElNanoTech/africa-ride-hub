import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  PackageCheck,
  ShieldCheck,
  Wallet,
  XCircle,
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
import {
  creditStatusLabel,
  useActivateCreditAccount,
  useAdminCreditEngineData,
  useCreateDownPaymentInvoice,
  useEvaluateActivationPackage,
  useReviewCreditApplication,
  type ActivationPackageRow,
  type CreditApplicationRow,
  type CreditDecisionRow,
  type CreditInvoiceRow,
} from '@/hooks/useCreditProductEngineData';

function statusVariant(status: string) {
  if (['ACTIVE', 'APPROVED', 'READY', 'ACTIVATED', 'ELIGIBLE'].includes(status)) return 'verified';
  if (['DECLINED', 'FAILED', 'CANCELLED', 'BLOCKED', 'NOT_ELIGIBLE'].includes(status)) return 'destructive';
  if (['SUBMITTED', 'UNDER_REVIEW', 'PENDING', 'ALMOST_ELIGIBLE', 'ELIGIBLE_FOR_REVIEW'].includes(status)) return 'secondary';
  return 'outline';
}

function latestDecision(app: CreditApplicationRow, decisions: CreditDecisionRow[]) {
  return decisions.find((decision) => decision.application_id === app.application_id) ?? null;
}

function activationFor(app: CreditApplicationRow, packages: ActivationPackageRow[]) {
  return packages.find((pkg) => pkg.application_id === app.application_id) ?? null;
}

function invoiceFor(app: CreditApplicationRow, invoices: CreditInvoiceRow[]) {
  return invoices.find((invoice) => invoice.source_application_id === app.application_id && invoice.obligation_type === 'DOWN_PAYMENT') ?? null;
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

function ApplicationActions({
  app,
  decision,
  activation,
  invoice,
}: {
  app: CreditApplicationRow;
  decision: CreditDecisionRow | null;
  activation: ActivationPackageRow | null;
  invoice: CreditInvoiceRow | null;
}) {
  const review = useReviewCreditApplication();
  const createInvoice = useCreateDownPaymentInvoice();
  const evaluateActivation = useEvaluateActivationPackage();
  const activate = useActivateCreditAccount();
  const canReview = ['SUBMITTED', 'UNDER_REVIEW'].includes(app.status);
  const canInvoice = app.status === 'APPROVED' && app.down_payment_amount > 0 && !invoice;
  const canEvaluate = app.status === 'APPROVED';
  const canActivate = activation?.status === 'READY';

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={!canReview || review.isPending}
        onClick={() => review.mutate({
          applicationId: app.application_id,
          decision: 'APPROVED',
          explanation: 'Approuvé pour activation Layer 3A. Dette active uniquement après package prêt et possession confirmée.',
        })}
      >
        <CheckCircle2 className="h-4 w-4" />
        Approuver
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!canReview || review.isPending}
        onClick={() => review.mutate({
          applicationId: app.application_id,
          decision: 'DECLINED',
          explanation: 'Non retenue pour le moment. Voir conditions et progression KIRA.',
        })}
      >
        <XCircle className="h-4 w-4" />
        Refuser
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!canInvoice || createInvoice.isPending}
        onClick={() => createInvoice.mutate(app.application_id)}
      >
        <Banknote className="h-4 w-4" />
        Facturer apport
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!canEvaluate || evaluateActivation.isPending}
        onClick={() => evaluateActivation.mutate(app.application_id)}
      >
        <ClipboardCheck className="h-4 w-4" />
        Évaluer package
      </Button>
      <Button
        size="sm"
        disabled={!canActivate || activate.isPending}
        onClick={() => activate.mutate(app.application_id)}
      >
        <BadgeCheck className="h-4 w-4" />
        Activer
      </Button>
      {decision && <span className="sr-only">{decision.explanation}</span>}
    </div>
  );
}

export default function CreditOperations() {
  const { data, isLoading, isError, error } = useAdminCreditEngineData();

  if (isLoading) {
    return (
      <AdminLayout>
        <AdminBreadcrumb items={[{ label: 'Credit Operations' }]} />
        <ListPageSkeleton columns={7} rows={7} />
      </AdminLayout>
    );
  }

  const products = data?.products ?? [];
  const applications = data?.applications ?? [];
  const decisions = data?.decisions ?? [];
  const activationPackages = data?.activationPackages ?? [];
  const accounts = data?.accounts ?? [];
  const invoices = data?.invoices ?? [];
  const assets = data?.assets ?? [];
  const fulfillmentRecords = data?.fulfillmentRecords ?? [];
  const exposureProfiles = data?.exposureProfiles ?? [];
  const activeProducts = products.filter((product) => product.status === 'ACTIVE');
  const pendingApplications = applications.filter((app) => ['SUBMITTED', 'UNDER_REVIEW'].includes(app.status));
  const readyPackages = activationPackages.filter((pkg) => pkg.status === 'READY');
  const activeAccounts = accounts.filter((account) => account.status === 'ACTIVE');

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Credit Operations' }]} />
      <AdminPageHeader
        title="Credit Operations"
        description="Layer 3A product catalog, applications, activation packages, fulfillment, accounts, exposure, and audit handoffs."
      />

      <div className="space-y-6">
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Layer 3A boundary</AlertTitle>
          <AlertDescription>
            Activation creates a credit account only after approval, settled one-time obligations, signed agreement, and possession confirmation. No recurring repayment schedule is generated in this layer.
          </AlertDescription>
        </Alert>
        {isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Credit engine data unavailable</AlertTitle>
            <AlertDescription>
              Apply the Layer 3A database migration before using persisted credit operations. {error instanceof Error ? error.message : null}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Boxes} label="Active Products" value={activeProducts.length} helper="Versioned catalog records" />
          <MetricCard icon={FileCheck2} label="Applications" value={applications.length} helper={`${pendingApplications.length} pending review`} />
          <MetricCard icon={PackageCheck} label="Activation Ready" value={readyPackages.length} helper="Possession-gated packages" />
          <MetricCard icon={Wallet} label="Credit Accounts" value={activeAccounts.length} helper="No recurring schedules in 3A" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/admin/financial-operations"><CreditCard className="h-4 w-4" /> Financial Operations</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/admin/billing/wallets"><Wallet className="h-4 w-4" /> Wallets</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/admin/trust-risk"><ShieldCheck className="h-4 w-4" /> Trust & Risk</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/admin/growth-ownership"><BadgeCheck className="h-4 w-4" /> Growth</Link></Button>
        </div>

        <Tabs defaultValue="applications">
          <TabsList className="mb-4 flex h-auto flex-wrap">
            <TabsTrigger value="applications">Applications</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="activation">Activation</TabsTrigger>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="fulfillment">Fulfillment</TabsTrigger>
            <TabsTrigger value="exposure">Exposure</TabsTrigger>
          </TabsList>

          <TabsContent value="applications">
            <Card>
              <CardHeader>
                <CardTitle>Application Queue</CardTitle>
                <CardDescription>Submitted applications reference product versions and immutable snapshots.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Eligibility</TableHead>
                      <TableHead>Down Payment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Decision</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {applications.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No credit applications yet</TableCell></TableRow>
                    ) : applications.map((app) => {
                      const decision = latestDecision(app, decisions);
                      const activation = activationFor(app, activationPackages);
                      const invoice = invoiceFor(app, invoices);
                      return (
                        <TableRow key={app.application_id}>
                          <TableCell>
                            <p className="font-medium">{app.credit_products?.name ?? 'Credit product'}</p>
                            <p className="text-xs text-muted-foreground">Version {app.product_versions?.version_number ?? 1}</p>
                          </TableCell>
                          <TableCell>{app.score_snapshot ?? 'Pending'}</TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(app.eligibility_result) as never}>{creditStatusLabel(app.eligibility_result)}</Badge>
                            <p className="mt-1 max-w-[260px] truncate text-xs text-muted-foreground">{app.eligibility_explanation}</p>
                          </TableCell>
                          <TableCell>{formatCurrency(app.down_payment_amount)}</TableCell>
                          <TableCell><Badge variant={statusVariant(app.status) as never}>{creditStatusLabel(app.status)}</Badge></TableCell>
                          <TableCell>
                            {decision ? (
                              <Badge variant={statusVariant(decision.decision) as never}>{creditStatusLabel(decision.decision)}</Badge>
                            ) : (
                              <Badge variant="outline">No decision</Badge>
                            )}
                            {activation && <p className="mt-1 text-xs text-muted-foreground">Package {creditStatusLabel(activation.status)}</p>}
                            {invoice && <p className="mt-1 text-xs text-muted-foreground">Invoice {creditStatusLabel(invoice.status)}</p>}
                          </TableCell>
                          <TableCell>
                            <ApplicationActions app={app} decision={decision} activation={activation} invoice={invoice} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products">
            <div className="grid gap-4 lg:grid-cols-2">
              {products.map((product) => {
                const activeVersion = product.product_versions?.find((version) => version.status === 'ACTIVE');
                return (
                  <Card key={product.product_id}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-base">{product.name}</CardTitle>
                          <CardDescription>{product.description}</CardDescription>
                        </div>
                        <Badge variant={statusVariant(product.status) as never}>{creditStatusLabel(product.status)}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="rounded-lg border p-3"><p className="text-muted-foreground">Type</p><p className="font-semibold">{product.product_type.replace(/_/g, ' ')}</p></div>
                        <div className="rounded-lg border p-3"><p className="text-muted-foreground">Version</p><p className="font-semibold">v{activeVersion?.version_number ?? '-'}</p></div>
                        <div className="rounded-lg border p-3"><p className="text-muted-foreground">Vendor</p><p className="font-semibold">{product.vendors?.vendor_name ?? 'Reference pending'}</p></div>
                      </div>
                      <p className="text-xs text-muted-foreground">Rules snapshot is held on product version; applications reference the version active at submission.</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="activation">
            <Card>
              <CardHeader>
                <CardTitle>Activation Packages</CardTitle>
                <CardDescription>Atomic readiness checks: agreement, down payment, fulfillment, possession, risk/compliance.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Package</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Validation</TableHead>
                      <TableHead>Down Payment Invoice</TableHead>
                      <TableHead>Blockers</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activationPackages.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No activation packages yet</TableCell></TableRow>
                    ) : activationPackages.map((pkg) => {
                      const blockers = Array.isArray(pkg.validation_results_json?.blockers)
                        ? pkg.validation_results_json.blockers as string[]
                        : [];
                      return (
                        <TableRow key={pkg.package_id}>
                          <TableCell className="font-mono text-xs">{pkg.package_id.slice(0, 8)}</TableCell>
                          <TableCell><Badge variant={statusVariant(pkg.status) as never}>{creditStatusLabel(pkg.status)}</Badge></TableCell>
                          <TableCell>{creditStatusLabel(pkg.validation_status)}</TableCell>
                          <TableCell>{pkg.down_payment_invoice_id ? pkg.down_payment_invoice_id.slice(0, 8) : 'Not created'}</TableCell>
                          <TableCell>
                            {blockers.length > 0 ? (
                              <div className="flex items-center gap-2 text-warning"><AlertTriangle className="h-4 w-4" /> {blockers.join(', ')}</div>
                            ) : 'None'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="accounts">
            <Card>
              <CardHeader>
                <CardTitle>Credit Accounts</CardTitle>
                <CardDescription>Active financing relationships created only after activation.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Principal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Activated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No active credit accounts</TableCell></TableRow>
                    ) : accounts.map((account) => (
                      <TableRow key={account.credit_account_id}>
                        <TableCell>{account.credit_products?.name ?? 'Credit account'}</TableCell>
                        <TableCell>{formatCurrency(account.principal_amount)}</TableCell>
                        <TableCell><Badge variant={statusVariant(account.status) as never}>{creditStatusLabel(account.status)}</Badge></TableCell>
                        <TableCell>{formatDateShort(account.activated_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fulfillment">
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Financed Assets</CardTitle>
                  <CardDescription>Vendor-referenced assets; sensitive serial/VIN/IMEI stay out of driver labels.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Asset</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Fulfillment</TableHead>
                        <TableHead>Possession</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assets.map((asset) => (
                        <TableRow key={asset.asset_id}>
                          <TableCell>
                            <p className="font-medium">{asset.description}</p>
                            <p className="text-xs text-muted-foreground">{asset.asset_type}</p>
                          </TableCell>
                          <TableCell>{asset.vendors?.vendor_name ?? 'Reference pending'}</TableCell>
                          <TableCell>{formatCurrency(asset.purchase_price)}</TableCell>
                          <TableCell><Badge variant={statusVariant(asset.fulfillment_status) as never}>{creditStatusLabel(asset.fulfillment_status)}</Badge></TableCell>
                          <TableCell>{creditStatusLabel(asset.possession_status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Fulfillment Records</CardTitle>
                  <CardDescription>Damage/loss before possession blocks activation and avoids driver liability.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {fulfillmentRecords.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No fulfillment records yet.</p>
                  ) : fulfillmentRecords.map((record) => (
                    <div key={record.fulfillment_id} className="rounded-lg border p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{record.fulfillment_id.slice(0, 8)}</span>
                        <Badge variant={statusVariant(record.status) as never}>{creditStatusLabel(record.status)}</Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        Possession: {record.possession_confirmed_at ? formatDateShort(record.possession_confirmed_at) : 'Not confirmed'}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="exposure">
            <Card>
              <CardHeader>
                <CardTitle>Exposure Foundation</CardTitle>
                <CardDescription>Stored for Layer 3B policy enforcement; 3A does not reject based on exposure.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver</TableHead>
                      <TableHead>Current Exposure</TableHead>
                      <TableHead>Maximum Limit</TableHead>
                      <TableHead>Available</TableHead>
                      <TableHead>Calculated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exposureProfiles.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Exposure profiles appear after activation/recalculation</TableCell></TableRow>
                    ) : exposureProfiles.map((profile) => (
                      <TableRow key={`${profile.driver_id}-${profile.currency_code}`}>
                        <TableCell className="font-mono text-xs">{profile.driver_id.slice(0, 8)}</TableCell>
                        <TableCell>{formatCurrency(profile.current_exposure)}</TableCell>
                        <TableCell>{formatCurrency(profile.maximum_exposure_limit)}</TableCell>
                        <TableCell>{formatCurrency(profile.available_exposure)}</TableCell>
                        <TableCell>{profile.last_calculated_at ? formatDateShort(profile.last_calculated_at) : 'Pending'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
