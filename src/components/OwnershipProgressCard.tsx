import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Car, ChevronRight, Trophy, Target, Calendar, Banknote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';
import { useDriverRentToOwnContract, useContractMilestones } from '@/hooks/useRentToOwn';
import { useIsFeatureEnabled } from '@/hooks/useFeatureFlags';
import { parseISO } from 'date-fns';

function ProgressRing({ percentage, size = 100, strokeWidth = 8 }: { percentage: number; size?: number; strokeWidth?: number }) {
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
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor(percentage)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{Math.round(percentage)}%</span>
        <span className="text-[10px] text-muted-foreground">Propriété</span>
      </div>
    </div>
  );
}

export function OwnershipProgressCard() {
  const { data: enabled } = useIsFeatureEnabled('rent_to_own_tracker');
  const { data: contract, isLoading } = useDriverRentToOwnContract();
  const { data: milestones = [] } = useContractMilestones(contract?.id);

  if (!enabled || isLoading || !contract) return null;

  const weeksRemaining = Math.max(0, contract.contract_duration_weeks - contract.weeks_completed);
  const nextMilestone = milestones.find(m => !m.reached_at);
  const reachedCount = milestones.filter(m => m.reached_at).length;
  const remaining = contract.total_price - contract.total_paid;

  return (
    <div className="px-4 mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Car className="h-3.5 w-3.5" />
          Mon Véhicule
        </h2>
        <Link to="/driver/ownership" className="text-xs text-primary font-medium flex items-center gap-0.5">
          Détails
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <Card className="overflow-hidden border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-warning/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-5">
            <ProgressRing percentage={contract.ownership_percentage} size={110} strokeWidth={10} />
            
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg leading-tight">{contract.vehicle?.model_name}</h3>
              <p className="text-xs text-muted-foreground">{contract.vehicle?.license_plate}</p>
              
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Banknote className="h-3.5 w-3.5 text-primary" />
                  <span className="text-muted-foreground">Restant:</span>
                  <span className="font-semibold">{formatCurrency(remaining)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-3.5 w-3.5 text-secondary" />
                  <span className="text-muted-foreground">Semaines:</span>
                  <span className="font-semibold">{weeksRemaining} restantes</span>
                </div>
              </div>
            </div>
          </div>

          {/* Milestones mini-track */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">
                <Trophy className="h-3 w-3 inline mr-1" />
                Jalons: {reachedCount}/{milestones.length}
              </span>
              {nextMilestone && (
                <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                  <Target className="h-2.5 w-2.5 mr-1" />
                  Prochain: {nextMilestone.milestone_label}
                </Badge>
              )}
            </div>
            <div className="flex gap-1">
              {milestones.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'flex-1 h-2 rounded-full transition-all',
                    m.reached_at
                      ? 'bg-primary'
                      : 'bg-muted'
                  )}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
