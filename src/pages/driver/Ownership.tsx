import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Car, Trophy, Calendar, Banknote, CheckCircle, Clock, Target, ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';
import { useDriverRentToOwnContract, useContractMilestones, useContractPayments } from '@/hooks/useRentToOwn';
import { useIsFeatureEnabled } from '@/hooks/useFeatureFlags';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { FeatureFlag } from '@/components/FeatureFlag';
import { StatusBadge } from '@/lib/statusBadges';

function ProgressRing({ percentage, size = 160, strokeWidth = 14 }: { percentage: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  const getColor = (pct: number) => {
    if (pct >= 75) return 'hsl(var(--primary))';
    if (pct >= 50) return 'hsl(var(--tier-b))';
    if (pct >= 25) return 'hsl(var(--warning))';
    return 'hsl(var(--tier-d))';
  };

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth} />
        <circle
          cx={size/2} cy={size/2} r={radius} fill="none"
          stroke={getColor(percentage)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold">{Math.round(percentage)}%</span>
        <span className="text-xs text-muted-foreground font-medium">Propriété</span>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, className }: { icon: typeof Car; label: string; value: string; className?: string }) {
  return (
    <div className={cn('text-center p-3 rounded-xl bg-muted/40', className)}>
      <Icon className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

export default function DriverOwnership() {
  const navigate = useNavigate();
  const { data: enabled, isLoading: flagLoading } = useIsFeatureEnabled('rent_to_own_tracker');
  const { data: contract, isLoading } = useDriverRentToOwnContract();
  const { data: milestones = [] } = useContractMilestones(contract?.id);
  const { data: payments = [] } = useContractPayments(contract?.id);

  useEffect(() => {
    if (!flagLoading && !enabled) navigate('/driver');
  }, [enabled, flagLoading, navigate]);

  if (isLoading || flagLoading) {
    return (
      <DriverLayout>
        <PageHeader title="Mon Véhicule" subtitle="Progression vers la propriété" />
        <div className="px-4 space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </DriverLayout>
    );
  }

  if (!contract) {
    return (
      <DriverLayout>
        <PageHeader title="Mon Véhicule" subtitle="Progression vers la propriété" />
        <div className="px-4 py-12 text-center">
          <Car className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Aucun contrat Rent-to-Own</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Contactez votre gestionnaire pour démarrer votre parcours vers la propriété.
          </p>
        </div>
      </DriverLayout>
    );
  }

  const weeksRemaining = Math.max(0, contract.contract_duration_weeks - contract.weeks_completed);
  const remaining = contract.total_price - contract.total_paid;
  const recentPayments = payments.slice(0, 10);

  return (
    <DriverLayout>
      <PageHeader title="Mon Véhicule" subtitle={contract.vehicle?.model_name || 'Rent-to-Own'} />

      <div className="px-4 space-y-6 pb-24">
        {/* Hero progress ring */}
        <Card className="overflow-hidden border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-card to-warning/5">
          <CardContent className="py-8">
            <ProgressRing percentage={contract.ownership_percentage} />
            
            <div className="text-center mt-4">
              <h2 className="text-xl font-bold">{contract.vehicle?.model_name}</h2>
              <p className="text-sm text-muted-foreground">{contract.vehicle?.license_plate}</p>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-6">
              <StatCard icon={Banknote} label="Payé" value={formatCurrency(contract.total_paid)} />
              <StatCard icon={Calendar} label="Semaines" value={`${contract.weeks_completed}/${contract.contract_duration_weeks}`} />
              <StatCard icon={Target} label="Restant" value={formatCurrency(remaining)} />
            </div>

            <div className="mt-4 text-center">
              <p className="text-xs text-muted-foreground">
                Paiement hebdomadaire: <span className="font-semibold text-foreground">{formatCurrency(contract.weekly_payment)}</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Milestones */}
        <FeatureFlag flagKey="rent_to_own_milestones" fallback={null}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-warning" />
                Jalons de Propriété
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {milestones.map((milestone) => (
                <div
                  key={milestone.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border transition-all',
                    milestone.reached_at
                      ? 'bg-primary/5 border-primary/20'
                      : 'bg-muted/30 border-transparent'
                  )}
                >
                  <div className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                    milestone.reached_at
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    {milestone.reached_at ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <Target className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-sm font-medium',
                      milestone.reached_at && 'text-primary'
                    )}>
                      {milestone.milestone_label}
                    </p>
                    {milestone.reached_at ? (
                      <p className="text-xs text-muted-foreground">
                        Atteint le {format(parseISO(milestone.reached_at), 'dd MMM yyyy', { locale: fr })}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Objectif: {milestone.target_value}%
                      </p>
                    )}
                    {milestone.reached_at && milestone.reward_description && (
                      <p className="text-xs mt-1 font-medium">{milestone.reward_description}</p>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </FeatureFlag>

        {/* Recent payments */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Banknote className="h-4 w-4 text-primary" />
              Derniers Paiements
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun paiement enregistré</p>
            ) : (
              <div className="space-y-2">
                {recentPayments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center',
                        (payment.status === 'paid' || payment.status === 'overpaid') ? 'bg-primary/20 text-primary' :
                        (payment.status === 'late' || payment.status === 'partial') ? 'bg-warning/20 text-warning' :
                        'bg-destructive/20 text-destructive'
                      )}>
                        {(payment.status === 'paid' || payment.status === 'overpaid') ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium">Semaine {payment.week_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(payment.payment_date), 'dd MMM yyyy', { locale: fr })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{formatCurrency(payment.amount)}</span>
                      <StatusBadge kind="payment" status={payment.status} withTooltip={false} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contract info */}
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Détails du contrat</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prix total du véhicule</span>
                <span className="font-medium">{formatCurrency(contract.total_price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paiement hebdomadaire</span>
                <span className="font-medium">{formatCurrency(contract.weekly_payment)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Début du contrat</span>
                <span className="font-medium">{format(parseISO(contract.start_date), 'dd MMM yyyy', { locale: fr })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fin prévue</span>
                <span className="font-medium">{format(parseISO(contract.expected_end_date), 'dd MMM yyyy', { locale: fr })}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DriverLayout>
  );
}
