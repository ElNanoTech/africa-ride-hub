import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BadgeCheck,
  ClipboardCheck,
  FileSignature,
  FileText,
  ListChecks,
  RefreshCw,
  Send,
  ShieldCheck,
  Stamp,
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
import { creditStatusLabel, type CreditApplicationRow } from '@/hooks/useCreditProductEngineData';
import type { UnderwritingDecisionRow } from '@/hooks/useUnderwritingOperationsData';
import {
  latestContractForApplication,
  latestDecisionForApplication,
  useAdminContractingOperationsData,
  useAdminSignCreditContract,
  useGenerateCreditContract,
  useReissueCreditContract,
  useSendCreditContract,
  useVoidCreditContract,
  type ContractSignatureEventRow,
  type CreditContractRow,
} from '@/hooks/useContractingOperationsData';

function statusVariant(status: string | null | undefined) {
  if (['ACTIVE', 'APPROVED', 'UNDERWRITING_APPROVED', 'FULLY_EXECUTED', 'SIGNED', 'SENT'].includes(status ?? '')) return 'verified';
  if (['DECLINED', 'UNDERWRITING_DECLINED', 'VOIDED', 'CANCELLED', 'EXPIRED', 'DECLINED_BY_DRIVER', 'SUPERSEDED'].includes(status ?? '')) return 'destructive';
  if (['UNDERWRITING_CONDITIONAL', 'APPROVED_WITH_CONDITIONS', 'DRAFT_CREATED', 'SENT_FOR_SIGNATURE', 'VIEWED', 'PARTIALLY_EXECUTED', 'PENDING'].includes(status ?? '')) return 'secondary';
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

function contractMoney(contract: CreditContractRow | null) {
  const money = contract?.contract_snapshot_json?.money as { principal_amount?: number; principal_currency_code?: string; down_payment_amount?: number } | undefined;
  return {
    principal: typeof money?.principal_amount === 'number' ? money.principal_amount : 0,
    downPayment: typeof money?.down_payment_amount === 'number' ? money.down_payment_amount : 0,
    currency: money?.principal_currency_code ?? 'XOF',
  };
}

function contractProductName(contract: CreditContractRow) {
  const product = contract.contract_snapshot_json?.product as { name?: string } | undefined;
  return product?.name ?? 'Credit contract';
}

function signerProgress(contract: CreditContractRow, events: ContractSignatureEventRow[]) {
  const required = Array.isArray(contract.contract_snapshot_json?.required_signers)
    ? contract.contract_snapshot_json.required_signers as Array<{ signer_type?: string; label?: string; sequence?: number }>
    : [];
  return required.map((signer) => {
    const signed = events.some((event) => event.contract_id === contract.contract_id && event.signer_type === signer.signer_type && event.signature_status === 'SIGNED');
    return {
      key: `${contract.contract_id}-${signer.signer_type}`,
      label: signer.label ?? signer.signer_type ?? 'Signer',
      sequence: signer.sequence ?? 0,
      signed,
    };
  }).sort((a, b) => a.sequence - b.sequence);
}

function ContractActions({
  app,
  decision,
  contract,
}: {
  app: CreditApplicationRow;
  decision: UnderwritingDecisionRow | null;
  contract: CreditContractRow | null;
}) {
  const generate = useGenerateCreditContract();
  const send = useSendCreditContract();
  const sign = useAdminSignCreditContract();
  const voidContract = useVoidCreditContract();
  const reissue = useReissueCreditContract();
  const canGenerate = Boolean(decision && ['APPROVED', 'APPROVED_WITH_CONDITIONS'].includes(decision.decision));
  const canSend = contract?.contract_status === 'DRAFT_CREATED';
  const canSign = Boolean(contract && ['SENT_FOR_SIGNATURE', 'VIEWED', 'PARTIALLY_EXECUTED'].includes(contract.contract_status));
  const canVoid = Boolean(contract && !['VOIDED', 'CANCELLED', 'SUPERSEDED', 'DECLINED_BY_DRIVER'].includes(contract.contract_status));

  const promptReason = (fallback: string) => window.prompt('Reason required for audit', fallback)?.trim();

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={!canGenerate || generate.isPending} onClick={() => generate.mutate(app.application_id)}>
        <FileSignature className="h-4 w-4" />
        Generate
      </Button>
      <Button size="sm" variant="outline" disabled={!canSend || send.isPending} onClick={() => contract && send.mutate(contract.contract_id)}>
        <Send className="h-4 w-4" />
        Send
      </Button>
      <Button size="sm" variant="outline" disabled={!canSign || sign.isPending} onClick={() => contract && sign.mutate({ contractId: contract.contract_id, signerType: 'ADMIN' })}>
        <Stamp className="h-4 w-4" />
        Admin sign
      </Button>
      <Button size="sm" variant="outline" disabled={!canSign || sign.isPending} onClick={() => contract && sign.mutate({ contractId: contract.contract_id, signerType: 'MANAGER' })}>
        <BadgeCheck className="h-4 w-4" />
        Manager sign
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!canVoid || voidContract.isPending}
        onClick={() => {
          if (!contract) return;
          const reason = promptReason('Correction required before execution');
          if (reason) voidContract.mutate({ contractId: contract.contract_id, reason });
        }}
      >
        <XCircle className="h-4 w-4" />
        Void
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!contract || reissue.isPending}
        onClick={() => {
          if (!contract) return;
          const reason = promptReason('Regenerate corrected contract package');
          if (reason) reissue.mutate({ contractId: contract.contract_id, reason });
        }}
      >
        <RefreshCw className="h-4 w-4" />
        Reissue
      </Button>
    </div>
  );
}

export default function AdminContracts() {
  const { data, isLoading, isError, error } = useAdminContractingOperationsData();

  if (isLoading) {
    return (
      <AdminLayout>
        <AdminBreadcrumb items={[{ label: 'Contracting & E-Signature' }]} />
        <ListPageSkeleton columns={8} rows={7} />
      </AdminLayout>
    );
  }

  const applications = data?.applications ?? [];
  const decisions = data?.underwritingDecisions ?? [];
  const templates = data?.templates ?? [];
  const contracts = data?.contracts ?? [];
  const signatureEvents = data?.signatureEvents ?? [];
  const auditEvents = data?.auditEvents ?? [];
  const files = data?.files ?? [];
  const activeTemplates = templates.filter((template) => template.status === 'ACTIVE');
  const inSignature = contracts.filter((contract) => ['SENT_FOR_SIGNATURE', 'VIEWED', 'PARTIALLY_EXECUTED'].includes(contract.contract_status));
  const executed = contracts.filter((contract) => contract.contract_status === 'FULLY_EXECUTED');
  const unsignedApproved = applications.filter((app) => {
    const decision = latestDecisionForApplication(app.application_id, decisions);
    const contract = latestContractForApplication(app.application_id, contracts);
    return decision && ['APPROVED', 'APPROVED_WITH_CONDITIONS'].includes(decision.decision) && !contract;
  });

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Contracting & E-Signature' }]} />
      <AdminPageHeader
        title="Contracting & E-Signature"
        description="Layer 3C contract queue, versioned templates, signer evidence, and agreement activation bridge."
      />

      <div className="space-y-6">
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Layer 3C legal execution boundary</AlertTitle>
          <AlertDescription>
            Contracts are generated only from the latest Layer 3B approved decision. Activation consumes the latest valid fully executed agreement.
          </AlertDescription>
        </Alert>
        {isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Contracting data unavailable</AlertTitle>
            <AlertDescription>{error instanceof Error ? error.message : 'Apply the Layer 3C migration before use.'}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={FileText} label="Active Templates" value={activeTemplates.length} helper="Versioned legal language" />
          <MetricCard icon={ClipboardCheck} label="Ready to Generate" value={unsignedApproved.length} helper="Approved 3B decisions" />
          <MetricCard icon={FileSignature} label="In Signature" value={inSignature.length} helper="Driver/internal progress" />
          <MetricCard icon={BadgeCheck} label="Executed Agreements" value={executed.length} helper="Activation source records" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/admin/underwriting-operations"><ShieldCheck className="h-4 w-4" /> Underwriting</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/admin/credit-operations"><ClipboardCheck className="h-4 w-4" /> Credit Operations</Link></Button>
        </div>

        <Tabs defaultValue="queue">
          <TabsList className="mb-4 flex h-auto flex-wrap">
            <TabsTrigger value="queue">Contract Queue</TabsTrigger>
            <TabsTrigger value="signers">Signer Status</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="evidence">Evidence</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="queue">
            <Card>
              <CardHeader>
                <CardTitle>Contract Queue</CardTitle>
                <CardDescription>Approved applications generate immutable contract snapshots pinned to product and template versions.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Decision</TableHead>
                      <TableHead>Contract</TableHead>
                      <TableHead>Template</TableHead>
                      <TableHead>Money</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {applications.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No approved applications for contracting</TableCell></TableRow>
                    ) : applications.map((app) => {
                      const decision = latestDecisionForApplication(app.application_id, decisions);
                      const contract = latestContractForApplication(app.application_id, contracts);
                      const money = contractMoney(contract);
                      return (
                        <TableRow key={app.application_id}>
                          <TableCell>
                            <p className="font-medium">{app.credit_products?.name ?? 'Credit product'}</p>
                            <p className="text-xs text-muted-foreground">v{app.product_versions?.version_number ?? 1}</p>
                          </TableCell>
                          <TableCell>
                            {decision ? <Badge variant={statusVariant(decision.decision) as never}>{creditStatusLabel(decision.decision)}</Badge> : <Badge variant="outline">No 3B decision</Badge>}
                            {decision?.decision_valid_until && <p className="mt-1 text-xs text-muted-foreground">Valid {formatDateShort(decision.decision_valid_until)}</p>}
                          </TableCell>
                          <TableCell>
                            {contract ? (
                              <>
                                <Badge variant={statusVariant(contract.contract_status) as never}>{creditStatusLabel(contract.contract_status)}</Badge>
                                <p className="mt-1 font-mono text-xs text-muted-foreground">{contract.contract_id.slice(0, 8)}</p>
                              </>
                            ) : <Badge variant="outline">Not generated</Badge>}
                          </TableCell>
                          <TableCell>{contract ? `v${contract.template_version}` : '-'}</TableCell>
                          <TableCell>{contract ? `${formatCurrency(money.principal)} · DP ${formatCurrency(money.downPayment)}` : '-'}</TableCell>
                          <TableCell>{contract?.expires_at ? formatDateShort(contract.expires_at) : '-'}</TableCell>
                          <TableCell><ContractActions app={app} decision={decision} contract={contract} /></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="signers">
            <div className="grid gap-4 xl:grid-cols-2">
              {contracts.length === 0 ? (
                <Card><CardContent className="p-6 text-sm text-muted-foreground">No contract signer state yet.</CardContent></Card>
              ) : contracts.slice(0, 10).map((contract) => (
                <Card key={contract.contract_id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{contractProductName(contract)}</CardTitle>
                        <CardDescription>{contract.contract_id.slice(0, 8)} · template v{contract.template_version}</CardDescription>
                      </div>
                      <Badge variant={statusVariant(contract.contract_status) as never}>{creditStatusLabel(contract.contract_status)}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {signerProgress(contract, signatureEvents).map((signer) => (
                      <div key={signer.key} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                        <div>
                          <p className="font-medium">{signer.label}</p>
                          <p className="text-xs text-muted-foreground">Sequence {signer.sequence}</p>
                        </div>
                        <Badge variant={signer.signed ? 'verified' : 'outline'}>{signer.signed ? 'Signed' : 'Pending'}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="templates">
            <div className="grid gap-4 xl:grid-cols-2">
              {templates.length === 0 ? (
                <Card><CardContent className="p-6 text-sm text-muted-foreground">No active Layer 3C templates. Seed or create a template before generation.</CardContent></Card>
              ) : templates.map((template) => (
                <Card key={template.template_id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{template.template_name}</CardTitle>
                        <CardDescription>{template.language} · {template.country} · v{template.version}</CardDescription>
                      </div>
                      <Badge variant={statusVariant(template.status) as never}>{creditStatusLabel(template.status)}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p className="line-clamp-3 text-muted-foreground">{template.plain_language_summary}</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg border p-2"><p className="text-muted-foreground">Type</p><p className="font-semibold">{template.template_type}</p></div>
                      <div className="rounded-lg border p-2"><p className="text-muted-foreground">Summary</p><p className="font-semibold">v{template.summary_version}</p></div>
                      <div className="rounded-lg border p-2"><p className="text-muted-foreground">Signers</p><p className="font-semibold">{template.required_signers_json?.length ?? 0}</p></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="evidence">
            <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Signature Evidence</CardTitle>
                  <CardDescription>Immutable signer events without exposing encrypted IP evidence inline.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Signer</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {signatureEvents.slice(0, 12).map((event) => (
                        <TableRow key={event.signature_event_id}>
                          <TableCell>{event.signer_type}</TableCell>
                          <TableCell><Badge variant={statusVariant(event.signature_status) as never}>{event.signature_status}</Badge></TableCell>
                          <TableCell>{event.signature_method}</TableCell>
                          <TableCell>{formatDateShort(event.signed_at ?? event.event_at)}</TableCell>
                        </TableRow>
                      ))}
                      {signatureEvents.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No signature evidence yet</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Generated Files</CardTitle>
                  <CardDescription>Snapshot HTML and executed PDF-equivalent hash records.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {files.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No generated contract files yet.</p>
                  ) : files.slice(0, 10).map((file) => (
                    <div key={file.file_id} className="rounded-lg border p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{file.file_type.replace(/_/g, ' ')}</span>
                        <Badge variant="outline">{file.file_hash.slice(0, 10)}</Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{file.storage_reference}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="audit">
            <Card>
              <CardHeader>
                <CardTitle>Contract Audit Trail</CardTitle>
                <CardDescription>Generation, send, view, signature, void, reissue, manual upload, and evidence access events.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditEvents.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No contract audit events yet</TableCell></TableRow>
                    ) : auditEvents.slice(0, 20).map((event) => (
                      <TableRow key={event.audit_event_id}>
                        <TableCell className="font-medium">{event.event_type.replace(/_/g, ' ')}</TableCell>
                        <TableCell>{event.actor_type}</TableCell>
                        <TableCell className="max-w-[340px] truncate">{event.reason ?? '-'}</TableCell>
                        <TableCell>{formatDateShort(event.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Alert>
          <ListChecks className="h-4 w-4" />
          <AlertTitle>Layer 3D remains out of scope</AlertTitle>
          <AlertDescription>
            Contract execution does not create schedules, recurring invoices, ownership transfer, or title actions.
          </AlertDescription>
        </Alert>
      </div>
    </AdminLayout>
  );
}
