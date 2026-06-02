import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { DriverBreadcrumb } from '@/components/DriverBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { useDriverId } from '@/hooks/useDriverData';
import { useFeatureFlag } from '@/components/FeatureFlag';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Trophy, Medal, TrendingUp, TrendingDown, Minus, Lock, Crown, Star, Flame, Shield, Zap } from 'lucide-react';

// Tier badge configuration
const TIER_CONFIG: Record<string, { color: string; label: string }> = {
  A: { color: 'bg-tier-a text-white', label: 'A' },
  B: { color: 'bg-tier-b text-white', label: 'B' },
  C: { color: 'bg-tier-c text-foreground', label: 'C' },
  D: { color: 'bg-tier-d text-white', label: 'D' },
  E: { color: 'bg-tier-e text-white', label: 'E' },
};

// Rank badges for top 3
const RANK_BADGES = [
  { icon: Crown, color: 'text-yellow-500', bg: 'bg-yellow-500/15', label: '🥇' },
  { icon: Medal, color: 'text-gray-400', bg: 'bg-gray-400/15', label: '🥈' },
  { icon: Medal, color: 'text-amber-700', bg: 'bg-amber-700/15', label: '🥉' },
];

// Achievement badges based on score
function getDriverBadges(score: number, rank: number, scoreChange: number): { icon: typeof Star; label: string; color: string }[] {
  const badges: { icon: typeof Star; label: string; color: string }[] = [];
  
  if (rank === 1) badges.push({ icon: Crown, label: 'Champion', color: 'text-yellow-500' });
  if (rank <= 3) badges.push({ icon: Trophy, label: 'Podium', color: 'text-primary' });
  if (score >= 800) badges.push({ icon: Star, label: 'Excellent', color: 'text-tier-a' });
  if (score >= 650) badges.push({ icon: Shield, label: 'Fiable', color: 'text-tier-b' });
  if (scoreChange > 50) badges.push({ icon: Flame, label: 'En feu', color: 'text-warning' });
  if (scoreChange > 0) badges.push({ icon: Zap, label: 'Progression', color: 'text-secondary' });
  
  return badges.slice(0, 3); // Max 3 badges displayed
}

interface LeaderboardEntry {
  driver_id: string;
  driver_name: string;
  profile_image_url: string | null;
  score: number;
  tier: string;
  score_change: number;
  rank: number;
}

function useLeaderboard() {
  return useQuery({
    queryKey: ['driver-leaderboard'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_driver_leaderboard', { p_limit: 20 });
      if (error) throw error;
      return (data || []) as LeaderboardEntry[];
    },
    staleTime: 1000 * 60 * 5,
  });
}

function LeaderboardCard({ entry, isCurrentDriver, index }: { 
  entry: LeaderboardEntry; 
  isCurrentDriver: boolean;
  index: number;
}) {
  const isTopThree = entry.rank <= 3;
  const rankBadge = isTopThree ? RANK_BADGES[entry.rank - 1] : null;
  const tierConfig = TIER_CONFIG[entry.tier] || TIER_CONFIG.E;
  const badges = getDriverBadges(entry.score, entry.rank, entry.score_change);
  
  // Get initials for avatar
  const initials = entry.driver_name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <Card className={cn(
        'overflow-hidden transition-all',
        isCurrentDriver && 'ring-2 ring-primary/50 bg-primary/5',
        isTopThree && 'shadow-md',
      )}>
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            {/* Rank */}
            <div className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0',
              rankBadge ? rankBadge.bg : 'bg-muted'
            )}>
              {rankBadge ? (
                <span className="text-lg">{rankBadge.label}</span>
              ) : (
                <span className="text-muted-foreground">{entry.rank}</span>
              )}
            </div>

            {/* Avatar */}
            <div className="relative flex-shrink-0">
              {entry.profile_image_url ? (
                <img 
                  src={entry.profile_image_url} 
                  alt={entry.driver_name}
                  className="w-11 h-11 rounded-full object-cover border-2 border-border"
                />
              ) : (
                <div className={cn(
                  'w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold border-2 border-border',
                  isTopThree ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                )}>
                  {initials}
                </div>
              )}
              {/* Tier badge overlay */}
              <div className={cn(
                'absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold',
                tierConfig.color
              )}>
                {tierConfig.label}
              </div>
            </div>

            {/* Name + badges */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  'font-semibold text-sm truncate',
                  isCurrentDriver && 'text-primary'
                )}>
                  {isCurrentDriver ? 'Vous' : entry.driver_name}
                </span>
                {isCurrentDriver && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/30 text-primary">
                    MOI
                  </Badge>
                )}
              </div>
              {/* Achievement badges */}
              <div className="flex items-center gap-1 mt-0.5">
                {badges.map((badge, i) => (
                  <div key={i} className="flex items-center gap-0.5" title={badge.label}>
                    <badge.icon className={cn('h-3 w-3', badge.color)} />
                    <span className="text-[9px] text-muted-foreground">{badge.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Score + change */}
            <div className="text-right flex-shrink-0">
              <div className="text-lg font-bold">{entry.score}</div>
              <div className={cn(
                'flex items-center justify-end gap-0.5 text-xs font-medium',
                entry.score_change > 0 && 'text-primary',
                entry.score_change < 0 && 'text-destructive',
                entry.score_change === 0 && 'text-muted-foreground'
              )}>
                {entry.score_change > 0 && <TrendingUp className="h-3 w-3" />}
                {entry.score_change < 0 && <TrendingDown className="h-3 w-3" />}
                {entry.score_change === 0 && <Minus className="h-3 w-3" />}
                <span>{entry.score_change > 0 ? '+' : ''}{entry.score_change}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 px-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <Skeleton className="w-11 h-11 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-24 mb-1" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-6 w-10" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function LockedState() {
  return (
    <div className="px-4 mt-8">
      <Card>
        <CardContent className="p-8 text-center">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="h-10 w-10 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Classement Premium</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Le classement des conducteurs est une fonctionnalité premium. 
            Contactez votre gestionnaire de flotte pour activer cette fonctionnalité.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-4 mt-8">
      <Card>
        <CardContent className="p-8 text-center">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trophy className="h-10 w-10 text-primary" />
          </div>
          <h3 className="font-semibold text-lg mb-2">Classement à venir</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Le classement sera disponible une fois que les premiers scores seront calculés. 
            Continuez à conduire pour apparaître ici!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Leaderboard() {
  const { data: driverId } = useDriverId();
  const { isEnabled, isLoading: isFlagLoading } = useFeatureFlag('gamification_leaderboard');
  const { data: leaderboard = [], isLoading } = useLeaderboard();

  // Find current driver's position
  const currentDriverEntry = leaderboard.find(e => e.driver_id === driverId);

  return (
    <DriverLayout>
      <DriverBreadcrumb items={[{ label: 'Classement' }]} />
      <PageHeader 
        title="Classement" 
        subtitle={isEnabled ? `${leaderboard.length} conducteurs` : undefined}
      />

      {/* Feature gate */}
      {isFlagLoading ? (
        <LoadingSkeleton />
      ) : !isEnabled ? (
        <LockedState />
      ) : isLoading ? (
        <LoadingSkeleton />
      ) : leaderboard.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Current driver highlight if not in top view */}
          {currentDriverEntry && currentDriverEntry.rank > 5 && (
            <div className="px-4 mb-4">
              <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wide font-semibold">
                Votre position
              </p>
              <LeaderboardCard 
                entry={currentDriverEntry} 
                isCurrentDriver={true}
                index={0}
              />
            </div>
          )}

          {/* Full leaderboard */}
          <div className="px-4 space-y-2 mb-6">
            {/* Top 3 header */}
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5" />
              Classement de la semaine
            </p>
            
            {leaderboard.map((entry, index) => (
              <LeaderboardCard
                key={entry.driver_id}
                entry={entry}
                isCurrentDriver={entry.driver_id === driverId}
                index={index}
              />
            ))}
          </div>
        </>
      )}
    </DriverLayout>
  );
}
