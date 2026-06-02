import { useState } from 'react';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ListPageSkeleton } from '@/components/AdminSkeletons';
import { TierBadge } from '@/components/ScoreGauge';
import { ADMIN, LOAN, UI } from '@/lib/i18n';
import { formatDateShort, formatCurrency } from '@/lib/format';
import { CheckCircle, XCircle, Eye, MoreHorizontal, User, AlertTriangle, TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useLoans, useUpdateLoanStatus } from '@/hooks/useAdminData';
import { useRoleGuard } from '@/hooks/useRoleGuard';

const getLoanTypeLabel = (type: string) => {
  switch (type) {
    case 'car_loan': return LOAN.CAR_LOAN;
    case 'bike_loan': return LOAN.BIKE_LOAN;
    case 'tv_loan': return LOAN.TV_LOAN;
    case 'fuel': return 'Prêt Carburant';
    case 'emergency': return 'Prêt Urgence';
    default: return type;
  }
};

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'pending': return 'pending';
    case 'approved': return 'verified';
    case 'rejected': return 'rejected';
    case 'disbursed': return 'active';
    case 'repaying': return 'active';
    case 'completed': return 'default';
    default: return 'default';
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'pending': return LOAN.PENDING;
    case 'approved': return LOAN.APPROVED;
    case 'rejected': return LOAN.REJECTED;
    case 'disbursed': return LOAN.DISBURSED;
    case 'repaying': return LOAN.REPAYING;
    case 'completed': return LOAN.COMPLETED;
    default: return status;
  }
};

export default function AdminLoans() {
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedLoan, setSelectedLoan] = useState<ReturnType<typeof useLoans>['data'] extends (infer T)[] | undefined ? T : never>(null as never);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [approvedAmount, setApprovedAmount] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  const { data: loans, isLoading } = useLoans();
  const updateLoanStatus = useUpdateLoanStatus();
  const { canApproveLoan } = useRoleGuard();

  const filteredLoans = (loans || []).filter((loan) => {
    if (activeTab === 'pending') return loan.status === 'pending';
    if (activeTab === 'approved') return ['approved', 'disbursed', 'repaying'].includes(loan.status);
    if (activeTab === 'rejected') return loan.status === 'rejected';
    return true;
  });

  const handleApprove = () => {
    if (!approvedAmount || parseInt(approvedAmount) <= 0) {
      return;
    }
    updateLoanStatus.mutate({
      loanId: selectedLoan?.id,
      status: 'approved',
      amountApproved: parseInt(approvedAmount),
      interestRate: 10, // Default interest rate
    });
    setIsReviewOpen(false);
    setSelectedLoan(null as never);
    setApprovedAmount('');
  };

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      return;
    }
    updateLoanStatus.mutate({
      loanId: selectedLoan?.id,
      status: 'rejected',
      rejectionReason,
    });
    setIsReviewOpen(false);
    setSelectedLoan(null as never);
    setRejectionReason('');
  };

  const pendingCount = (loans || []).filter(l => l.status === 'pending').length;
  const approvedCount = (loans || []).filter(l => ['approved', 'disbursed', 'repaying'].includes(l.status)).length;
  const rejectedCount = (loans || []).filter(l => l.status === 'rejected').length;

  // Show skeleton while loading
  if (isLoading) {
    return (
      <AdminLayout>
        <AdminBreadcrumb items={[{ label: 'Prêts' }]} />
        <ListPageSkeleton columns={6} rows={6} />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Prêts' }]} />
      <AdminPageHeader 
        title={ADMIN.LOANS.TITLE}
        description="Examiner et gérer les demandes de prêt"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="pending" className="gap-2">
            {ADMIN.LOANS.PENDING}
            {pendingCount > 0 && <Badge variant="destructive" className="h-5 w-5 p-0 justify-center">{pendingCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-2">
            {ADMIN.LOANS.APPROVED}
            <Badge variant="secondary">{approvedCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="rejected" className="gap-2">
            {ADMIN.LOANS.REJECTED}
            <Badge variant="outline">{rejectedCount}</Badge>
          </TabsTrigger>
        </TabsList>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conducteur</TableHead>
                  <TableHead>Type de prêt</TableHead>
                  <TableHead>{ADMIN.LOANS.AMOUNT_REQUESTED}</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Demandé le</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-12">{UI.ACTIONS}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-10 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredLoans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Aucun prêt trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLoans.map((loan) => (
                    <TableRow key={loan.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                            <User className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium">{loan.driver_name || 'N/A'}</p>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{loan.score || '-'} pts</span>
                              <TierBadge tier={loan.tier || 'E'} size="sm" showLabel={false} />
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{getLoanTypeLabel(loan.loan_type)}</Badge>
                      </TableCell>
                      <TableCell className="font-semibold">{formatCurrency(loan.amount_requested)}</TableCell>
                      <TableCell>
                        <span>{loan.score || '-'} pts</span>
                      </TableCell>
                      <TableCell>{formatDateShort(new Date(loan.applied_at))}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(loan.status) as never}>
                          {getStatusLabel(loan.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedLoan(loan);
                                setApprovedAmount(loan.amount_requested.toString());
                                setIsReviewOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              {UI.VIEW}
                            </DropdownMenuItem>
                            {loan.status === 'pending' && canApproveLoan() && (
                              <>
                                <DropdownMenuItem 
                                  className="text-primary"
                                  onClick={() => {
                                    setSelectedLoan(loan);
                                    setApprovedAmount(loan.amount_requested.toString());
                                    setIsReviewOpen(true);
                                  }}
                                >
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  {UI.APPROVE}
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-destructive"
                                  onClick={() => {
                                    setSelectedLoan(loan);
                                    setIsReviewOpen(true);
                                  }}
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  {UI.REJECT}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Examen du prêt</DialogTitle>
            <DialogDescription>
              Analysez le profil et prenez une décision
            </DialogDescription>
          </DialogHeader>
          {selectedLoan && (
            <div className="space-y-4 py-4">
              {/* Risk Summary */}
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-medium mb-3">{ADMIN.LOANS.RISK_SUMMARY}</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    <span>Score actuel: {selectedLoan.score || 'Non disponible'} pts</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    <span>Niveau: {selectedLoan.tier || 'E'}</span>
                  </div>
                </div>
              </div>

              {/* Driver info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Conducteur:</span>
                  <span className="ml-2 font-medium">{selectedLoan.driver_name || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Téléphone:</span>
                  <span className="ml-2 font-medium">{selectedLoan.driver_phone || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Type de prêt:</span>
                  <span className="ml-2 font-medium">{getLoanTypeLabel(selectedLoan.loan_type)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Montant demandé:</span>
                  <span className="ml-2 font-medium">{formatCurrency(selectedLoan.amount_requested)}</span>
                </div>
              </div>

              {selectedLoan.status === 'pending' && (
                <>
                  <div className="space-y-2">
                    <Label>{ADMIN.LOANS.APPROVE_WITH_AMOUNT}</Label>
                    <Input
                      type="number"
                      value={approvedAmount}
                      onChange={(e) => setApprovedAmount(e.target.value)}
                      placeholder="Montant approuvé"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{ADMIN.LOANS.REJECT_WITH_REASON}</Label>
                    <Textarea
                      placeholder="Motif du rejet (requis pour rejeter)"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button variant="outline" className="flex-1" onClick={() => setIsReviewOpen(false)}>
                      {UI.CANCEL}
                    </Button>
                    <Button 
                      variant="destructive" 
                      className="flex-1" 
                      onClick={handleReject}
                      disabled={updateLoanStatus.isPending}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      {UI.REJECT}
                    </Button>
                    <Button 
                      className="flex-1" 
                      onClick={handleApprove}
                      disabled={updateLoanStatus.isPending}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      {UI.APPROVE}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
