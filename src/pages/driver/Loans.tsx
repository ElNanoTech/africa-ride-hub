import { useState } from 'react';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { DriverBreadcrumb } from '@/components/DriverBreadcrumb';
import { KycGate } from '@/components/KycGate';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HapticButton } from '@/components/HapticButton';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TierBadge } from '@/components/ScoreGauge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { LOAN, UI } from '@/lib/i18n';
import { getScoreLevel } from '@/lib/scoreLevel';
import { Car, Bike, Tv, Lock, Unlock, ChevronRight, AlertCircle, Wallet } from 'lucide-react';
import { useDriverCurrentScore, useDriverLoans, useDriverCreditScores, useDriverId } from '@/hooks/useDriverData';
import { useLoansRealtime } from '@/hooks/useDriverRealtimeSubscription';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { toast } from 'sonner';

const loanTypes = [
  {
    type: 'car_loan',
    label: LOAN.CAR_LOAN,
    icon: Car,
    requiredTier: 'A',
    minAmount: 500000,
    maxAmount: 5000000,
  },
  {
    type: 'bike_loan',
    label: LOAN.BIKE_LOAN,
    icon: Bike,
    requiredTier: 'B',
    minAmount: 100000,
    maxAmount: 1000000,
  },
  {
    type: 'tv_loan',
    label: LOAN.TV_LOAN,
    icon: Tv,
    requiredTier: 'C',
    minAmount: 50000,
    maxAmount: 300000,
  },
];

function getTierOrder(tier: string): number {
  const order: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5 };
  return order[tier] || 5;
}

function isLoanUnlocked(requiredTier: string, driverTier: string): boolean {
  return getTierOrder(driverTier) <= getTierOrder(requiredTier);
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return <Badge variant="pending">En attente</Badge>;
    case 'approved':
      return <Badge variant="active">Approuvé</Badge>;
    case 'rejected':
      return <Badge variant="destructive">Refusé</Badge>;
    case 'repaying':
      return <Badge variant="secondary">En remboursement</Badge>;
    case 'completed':
      return <Badge variant="verified">Remboursé</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function useApplyForLoan() {
  const queryClient = useQueryClient();
  const { data: driverId } = useDriverId();

  return useMutation({
    mutationFn: async ({ loanType, amount }: { loanType: string; amount: number }) => {
      if (!driverId) throw new Error('Profil conducteur non trouvé');

      const { data, error } = await supabase
        .from('loans')
        .insert({
          driver_id: driverId,
          loan_type: loanType,
          amount_requested: amount,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driverLoans'] });
      toast.success('Demande de prêt soumise avec succès!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la soumission');
    },
  });
}

function ApplyLoanDialog({ 
  loanType, 
  isOpen, 
  onClose 
}: { 
  loanType: typeof loanTypes[0]; 
  isOpen: boolean; 
  onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const applyLoan = useApplyForLoan();

  const amountNum = parseInt(amount) || 0;
  const isValidAmount = amountNum >= loanType.minAmount && amountNum <= loanType.maxAmount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidAmount) return;

    applyLoan.mutate(
      { loanType: loanType.type, amount: amountNum },
      { onSuccess: () => onClose() }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <loanType.icon className="h-5 w-5 text-primary" />
            {loanType.label}
          </DialogTitle>
          <DialogDescription>
            Montant: {formatCurrency(loanType.minAmount)} - {formatCurrency(loanType.maxAmount)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Montant demandé (FCFA)</Label>
            <Input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Ex: ${loanType.minAmount}`}
              min={loanType.minAmount}
              max={loanType.maxAmount}
            />
            {amount && !isValidAmount && (
              <p className="text-sm text-destructive">
                Le montant doit être entre {formatCurrency(loanType.minAmount)} et {formatCurrency(loanType.maxAmount)}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              {UI.CANCEL}
            </Button>
            <Button 
              type="submit" 
              className="flex-1" 
              disabled={!isValidAmount || applyLoan.isPending}
            >
              {applyLoan.isPending ? UI.LOADING : 'Soumettre'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LoadingSkeleton() {
  return (
    <>
      <div className="px-4 mb-6">
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
      <div className="px-4 mb-6">
        <Skeleton className="h-4 w-32 mb-3" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </>
  );
}

function NoDriverProfileAlert() {
  return (
    <Card className="border-warning/50 bg-warning/5 mx-4">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-warning/20 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertCircle className="h-6 w-6 text-warning" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1">Profil conducteur requis</h3>
            <p className="text-sm text-muted-foreground">
              Vous devez compléter votre inscription pour accéder aux prêts.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Loans() {
  const { data: driverId, isLoading: isDriverIdLoading, isSuccess: isDriverIdSuccess } = useDriverId();
  const { data: loans = [], isLoading: isLoansLoading } = useDriverLoans();
  const { data: creditScores = [], isLoading: isScoresLoading } = useDriverCreditScores();
  const { data: currentScore, isLoading: isCurrentScoreLoading } = useDriverCurrentScore();
  const [selectedLoanType, setSelectedLoanType] = useState<typeof loanTypes[0] | null>(null);

  // Enable real-time updates
  useLoansRealtime();

  const isLoading = isDriverIdLoading || isLoansLoading || isScoresLoading || isCurrentScoreLoading;
  const hasDriverProfile = !!driverId;

  // Get latest score and tier
  const latestScore = creditScores[0];
  const rollingAverage = currentScore ?? latestScore?.score ?? 0;
  const driverTier = getScoreLevel(rollingAverage).level;
  const weeksHistory = creditScores.length;

  // Filter active loans (pending, approved, repaying)
  const activeLoans = loans.filter((loan) => 
    ['pending', 'approved', 'repaying'].includes(loan.status)
  );

  return (
    <DriverLayout>
      <DriverBreadcrumb items={[{ label: LOAN.TITLE }]} />
      <PageHeader title={LOAN.TITLE} />
      <KycGate>

      {isDriverIdSuccess && driverId === null ? (
        <NoDriverProfileAlert />
      ) : isLoading ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/* Eligibility Summary */}
          <div className="px-4 mb-6">
            <Card className="bg-gradient-hero text-white overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-white/70 text-sm">{LOAN.ROLLING_AVERAGE}</p>
                    <p className="text-3xl font-bold">{rollingAverage} pts</p>
                  </div>
                  <TierBadge tier={driverTier} size="lg" />
                </div>
                <div className="flex items-center gap-2 text-sm text-white/70">
                  <span>{weeksHistory} {LOAN.WEEKS_HISTORY}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Loan Options */}
          <div className="px-4 mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
              Options de prêt
            </h2>
            <div className="space-y-4">
              {loanTypes.map((loan) => {
                const unlocked = isLoanUnlocked(loan.requiredTier, driverTier);
                
                return (
                  <Card 
                    key={loan.type}
                    className={!unlocked ? 'opacity-60' : ''}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                          unlocked ? 'bg-primary/10' : 'bg-muted'
                        }`}>
                          <loan.icon className={`h-7 w-7 ${unlocked ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <h3 className="font-semibold text-lg">{loan.label}</h3>
                            {unlocked ? (
                              <Unlock className="h-5 w-5 text-primary" />
                            ) : (
                              <Lock className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 mb-3">
                            <Badge variant={unlocked ? 'verified' : 'pending'}>
                              {unlocked ? LOAN.UNLOCKED : LOAN.LOCKED}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {LOAN.REQUIRED_TIER}: Niveau {loan.requiredTier}
                            </span>
                          </div>
                          
                          <p className="text-sm text-muted-foreground mb-4">
                            {formatCurrency(loan.minAmount)} - {formatCurrency(loan.maxAmount)}
                          </p>
                          
                          <HapticButton 
                            className="w-full" 
                            variant={unlocked ? 'default' : 'outline'}
                            disabled={!unlocked}
                            onClick={() => unlocked && setSelectedLoanType(loan)}
                            hapticType={unlocked ? 'medium' : 'light'}
                          >
                            {unlocked ? (
                              <>
                                {LOAN.APPLY_BUTTON}
                                <ChevronRight className="h-4 w-4 ml-1" />
                              </>
                            ) : (
                              `Niveau ${loan.requiredTier} requis`
                            )}
                          </HapticButton>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Active/Past Loans */}
          {loans.length > 0 && (
            <div className="px-4 mb-6">
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                {LOAN.MY_LOANS}
              </h2>
              <div className="space-y-3">
                {loans.map((loan) => {
                  const loanInfo = loanTypes.find(l => l.type === loan.loan_type);
                  
                  return (
                    <Card key={loan.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            {loanInfo ? (
                              <loanInfo.icon className="h-5 w-5 text-primary" />
                            ) : (
                              <Wallet className="h-5 w-5 text-primary" />
                            )}
                            <span className="font-medium">{loanInfo?.label || loan.loan_type}</span>
                          </div>
                          {getStatusBadge(loan.status)}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Montant demandé</p>
                            <p className="font-semibold">{formatCurrency(loan.amount_requested)}</p>
                          </div>
                          {loan.amount_approved && (
                            <div>
                              <p className="text-muted-foreground">Montant approuvé</p>
                              <p className="font-semibold text-primary">{formatCurrency(loan.amount_approved)}</p>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Demandé le {formatDateShort(new Date(loan.applied_at))}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* How it works */}
          <div className="px-4 mb-6">
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-base">Comment ça marche ?</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-primary">1</span>
                    <span>Votre score de crédit est calculé chaque semaine basé sur votre conduite, vos paiements et vos revenus.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-primary">2</span>
                    <span>Votre éligibilité est basée sur la moyenne de vos 4 dernières semaines (minimum 3 semaines d'historique).</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-primary">3</span>
                    <span>Plus votre niveau est élevé, plus vous avez accès à des prêts importants.</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      </KycGate>

      {/* Apply Loan Dialog */}
      {selectedLoanType && (
        <ApplyLoanDialog
          loanType={selectedLoanType}
          isOpen={!!selectedLoanType}
          onClose={() => setSelectedLoanType(null)}
        />
      )}
    </DriverLayout>
  );
}
