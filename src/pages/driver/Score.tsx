import { Link } from 'react-router-dom';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { DriverBreadcrumb } from '@/components/DriverBreadcrumb';
import { ScoreGauge, ScoreChangeIndicator, TierBadge } from '@/components/ScoreGauge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { SCORE, TIER_INFO } from '@/lib/i18n';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { getScoreLevel } from '@/lib/scoreLevel';
import { Car, CreditCard, Wallet, AlertCircle, TrendingUp, Trophy, ChevronRight } from 'lucide-react';
import { useFeatureFlag } from '@/components/FeatureFlag';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useDriverCreditScores, useDriverCurrentScore, useDriverId } from '@/hooks/useDriverData';
import { useDriverRealtimeSubscription } from '@/hooks/useDriverRealtimeSubscription';
import { formatDateShort } from '@/lib/format';
import { BadgeGrid } from '@/components/BadgeGrid';
import { useBadgesWithStatus, useBadgeChecker } from '@/hooks/useDriverBadges';
import { BadgeCelebrationModal } from '@/components/BadgeCelebrationModal';
import { useBadgeCelebration } from '@/hooks/useBadgeCelebration';
import { triggerConfetti } from '@/hooks/useConfetti';
import { DrivingEventsList } from '@/components/DrivingEventsList';
import { RecentScoreAdjustments } from '@/components/RecentScoreAdjustments';
import { ScoreBreakdownExplainer } from '@/components/ScoreBreakdownExplainer';

// Hook for score realtime
function useScoreRealtime() {
  useDriverRealtimeSubscription({
    tables: ['credit_scores', 'driver_scores'],
    showToasts: true,
  });
}

const factorIcons: Record<string, typeof Car> = {
  driving: Car,
  payment: CreditCard,
  income: Wallet,
};

const factorLabels: Record<string, string> = {
  driving: SCORE.FACTORS.driving,
  payment: SCORE.FACTORS.payment,
  income: SCORE.FACTORS.income,
  harsh_braking: 'Freinages brusques',
  overspeeding: 'Excès de vitesse',
  idle_time: 'Temps d\'arrêt',
  distance: 'Distance parcourue',
  trip_count: 'Nombre de courses',
  on_time_payments: 'Paiements à temps',
  late_payments: 'Paiements en retard',
  average_income: 'Revenu moyen',
  income_stability: 'Stabilité du revenu',
};

/**
 * B37 — Use centralized score level for tier colors.
 */
function getTierColor(tier: string) {
  // Map tier letter to a score in that range, then use getScoreLevel
  const tierScores: Record<string, number> = { A: 850, B: 700, C: 550, D: 400, E: 200 };
  const score = tierScores[tier] || 200;
  return getScoreLevel(score).hslColor;
}

function LoadingSkeleton() {
  return (
    <>
      <div className="px-4 mb-6">
        <Card>
          <CardContent className="p-6 flex flex-col items-center">
            <Skeleton className="w-48 h-48 rounded-full" />
            <Skeleton className="h-6 w-32 mt-4" />
          </CardContent>
        </Card>
      </div>
      <div className="px-4 mb-6">
        <Skeleton className="h-4 w-32 mb-3" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
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
              Vous devez compléter votre inscription pour voir votre score.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NoScoreState() {
  return (
    <div className="px-4">
      <Card>
        <CardContent className="p-8 text-center">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="h-10 w-10 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Aucun score disponible</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Votre score de crédit sera calculé après votre première semaine d'activité.
            Continuez à conduire et effectuer vos paiements pour générer votre premier score.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function LeaderboardCTA() {
  const { isEnabled, isLoading } = useFeatureFlag('gamification_leaderboard');
  if (isLoading || !isEnabled) return null;
  
  return (
    <div className="px-4 mb-4">
      <Link to="/driver/leaderboard">
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20 hover:shadow-md transition-all">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Trophy className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">Classement des conducteurs</p>
              <p className="text-xs text-muted-foreground">Voir votre position parmi les autres</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

export default function Score() {
  const tierUpgradeCheckedRef = useRef(false);
  
  const { data: driverId, isLoading: isDriverIdLoading, isSuccess: isDriverIdSuccess } = useDriverId();
  const { data: creditScores = [], isLoading: isScoresLoading } = useDriverCreditScores();
  const { data: currentScore, isLoading: isCurrentScoreLoading } = useDriverCurrentScore();
  const { badges, isLoading: badgesLoading, earnedCount, totalCount } = useBadgesWithStatus();
  
  // Check and award badges
  useBadgeChecker();
  
  // Badge celebration
  const { currentBadge, dismissCelebration } = useBadgeCelebration(badges);
  
  // Enable real-time updates
  useScoreRealtime();

  // Get AI explanation for latest score snapshot
  const latestScore = creditScores[0];
  const displayedScore = currentScore ?? latestScore?.score ?? 0;
  const displayedTier = getScoreLevel(displayedScore).level;
  const displayedStatus = latestScore?.status === 'provisional' ? 'provisional' : 'active';

  const isLoading = isDriverIdLoading || isScoresLoading || isCurrentScoreLoading;
  const hasDriverProfile = !!driverId;

  // Calculate score change from previous week
  const scoreChange = creditScores.length >= 2 
    ? creditScores[0].score - creditScores[1].score 
    : 0;

  // Detect tier upgrade → trigger confetti
  const tierUpgraded = creditScores.length >= 2 && creditScores[0].tier < creditScores[1].tier;
  
  useEffect(() => {
    if (tierUpgraded && !tierUpgradeCheckedRef.current && !isLoading) {
      tierUpgradeCheckedRef.current = true;
      const timer = setTimeout(() => triggerConfetti(), 1500);
      return () => clearTimeout(timer);
    }
  }, [tierUpgraded, isLoading]);

  // Prepare breakdown data from latest score snapshot
  const breakdownData = latestScore?.breakdowns || [];
  
  const mainBreakdown = [
    {
      factor: 'driving',
      label: SCORE.FACTORS.driving,
      impact: latestScore?.driving_impact || 0,
      maxImpact: 100,
      available: latestScore?.driving_data_available || false,
      icon: Car,
    },
    {
      factor: 'payment',
      label: SCORE.FACTORS.payment,
      impact: latestScore?.payment_impact || 0,
      maxImpact: 100,
      available: latestScore?.payment_data_available || false,
      icon: CreditCard,
    },
    {
      factor: 'income',
      label: SCORE.FACTORS.income,
      impact: latestScore?.income_impact || 0,
      maxImpact: 100,
      available: latestScore?.income_data_available || false,
      icon: Wallet,
    },
  ];

  const historyData = creditScores
    .slice(0, 8)
    .reverse()
    .map((score, index) => ({
      week: `S${index + 1}`,
      score: score.score,
      date: formatDateShort(new Date(score.calculation_week)),
    }));

  if (isDriverIdSuccess && driverId === null) {
    return (
      <DriverLayout>
        <DriverBreadcrumb items={[{ label: SCORE.TITLE }]} />
        <PageHeader title={SCORE.TITLE} />
        <NoDriverProfileAlert />
      </DriverLayout>
    );
  }

  if (isLoading) {
    return (
      <DriverLayout>
        <DriverBreadcrumb items={[{ label: SCORE.TITLE }]} />
        <PageHeader title={SCORE.TITLE} />
        <LoadingSkeleton />
      </DriverLayout>
    );
  }

  if (creditScores.length === 0 && currentScore == null) {
    return (
      <DriverLayout>
        <DriverBreadcrumb items={[{ label: SCORE.TITLE }]} />
        <PageHeader title={SCORE.TITLE} />
        <NoScoreState />
      </DriverLayout>
    );
  }

  return (
    <DriverLayout>
      <DriverBreadcrumb items={[{ label: SCORE.TITLE }]} />
      <PageHeader title={SCORE.TITLE} />

      {/* Main Score Display */}
      <div className="px-4 mb-6">
        <Card className="overflow-hidden">
          <CardContent className="p-6 flex flex-col items-center">
            <ScoreGauge
              score={displayedScore}
              size="lg"
              status={displayedStatus}
              scoreChange={scoreChange}
              tierUpgraded={tierUpgraded}
            />
            
            <div className="mt-4 flex items-center gap-3">
              <span className="text-muted-foreground text-sm">{SCORE.THIS_WEEK}:</span>
              <ScoreChangeIndicator change={scoreChange} />
            </div>

            {displayedStatus === 'provisional' && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Score provisoire - basé sur données limitées
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Factor Breakdown */}
      <div className="px-4 mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Répartition du score
        </h2>
        <div className="space-y-3">
          {mainBreakdown.map((factor) => (
            <Card key={factor.factor} className={!factor.available ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    factor.available ? "bg-primary/10" : "bg-muted"
                  )}>
                    <factor.icon className={cn(
                      "h-5 w-5",
                      factor.available ? "text-primary" : "text-muted-foreground"
                    )} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{factor.label}</span>
                      {factor.available ? (
                        <span className="text-sm font-semibold text-primary">
                          +{factor.impact} pts
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Données insuffisantes
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Progress 
                  value={factor.available ? (factor.impact / factor.maxImpact) * 100 : 0} 
                  className="h-2" 
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Score History Chart */}
      {historyData.length > 1 && (
        <div className="px-4 mb-6">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
            {SCORE.HISTORY} - {SCORE.LAST_WEEKS}
          </h2>
          <Card>
            <CardContent className="p-4">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="week" 
                      tick={{ fontSize: 12 }} 
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis 
                      domain={['dataMin - 50', 'dataMax + 50']} 
                      tick={{ fontSize: 12 }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`${value} pts`, 'Score']}
                      labelFormatter={(label, payload) => {
                        const item = payload?.[0]?.payload;
                        return item?.date || label;
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="score" 
                      stroke={getTierColor(displayedTier)}
                      strokeWidth={3}
                      dot={{ fill: getTierColor(displayedTier), strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Clear, transparent explainer: 500 → events → current + 3 tips + read-aloud */}
      <ScoreBreakdownExplainer driverId={driverId} currentScore={displayedScore} />

      {/* Recent score adjustments — accident penalties etc. */}
      <RecentScoreAdjustments driverId={driverId} />

      {/* Driving Event History — Uffizio-ingested alerts */}
      <div className="px-4 mb-6">
        <DrivingEventsList driverId={driverId} />
      </div>

      {/* Leaderboard CTA - Premium feature */}
      <LeaderboardCTA />

      {/* Achievement Badges */}
      <div className="px-4 mb-6">
        <BadgeGrid
          badges={badges}
          isLoading={badgesLoading}
          earnedCount={earnedCount}
          totalCount={totalCount}
        />
      </div>

      {/* Tier Legend */}
      <div className="px-4 mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Niveaux de score
        </h2>
        <Card>
          <CardContent className="p-4 space-y-3">
            {Object.entries(TIER_INFO).map(([tier, info]) => (
              <div 
                key={tier} 
                className={cn(
                  "flex items-center justify-between p-2 rounded-lg transition-colors",
                  tier === displayedTier && "bg-primary/5 ring-1 ring-primary/20"
                )}
              >
                <div className="flex items-center gap-3">
                  <TierBadge tier={tier} showLabel={false} size="sm" />
                  <span className={cn(
                    "text-sm",
                    tier === displayedTier && "font-semibold"
                  )}>
                    {info.label}
                  </span>
                  {tier === displayedTier && (
                    <span className="text-xs text-primary font-medium">← Vous</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {info.minScore}+ pts
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      {/* Badge Celebration Modal */}
      <BadgeCelebrationModal
        badge={currentBadge}
        open={!!currentBadge}
        onClose={dismissCelebration}
      />
    </DriverLayout>
  );
}
