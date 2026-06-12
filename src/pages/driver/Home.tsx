import { Link, useNavigate } from 'react-router-dom';
import { resolveVehicleImage } from '@/lib/vehicleImages';
import { Car, CreditCard, Wallet, Bell, ChevronRight, TrendingUp, Award, Flame, Target, Shield, Calendar, ArrowRight, AlertCircle, AlertTriangle, Download, X, Sparkles, Zap, Heart, Star, CheckCircle, Clock, XCircle, Trophy, Crown, Medal, TrendingDown, Minus, Banknote, MapPin, ShieldAlert, ClipboardCheck, Camera, Ban } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { usePWA } from '@/hooks/usePWA';
import { useDailyStreak } from '@/hooks/useDailyStreak';
// OnboardingTour intentionally not imported — see note in DriverHome.
import { useDailyTip, DailyTip, DailyTipContext } from '@/hooks/useDailyTip';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { ScoreGauge, ScoreChangeIndicator } from '@/components/ScoreGauge';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HapticButton } from '@/components/HapticButton';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatRelativeTime, formatDateShort } from '@/lib/format';
import { UI, NAV, SCORE, RENTAL, KYC } from '@/lib/i18n';
import { getScoreLevel } from '@/lib/scoreLevel';
import { cn } from '@/lib/utils';
import { useDriverCurrentScore, useDriverId, useDriverCreditScores, useDriverRentals, useDriverNotifications, useDriverLoans, useDriverPayments, useIsAuthResolving } from '@/hooks/useDriverData';
import { useDriverActiveInspection } from '@/hooks/useDriverActiveInspection';
import { format, differenceInCalendarDays } from 'date-fns';
import { fr as frLocale } from 'date-fns/locale';
import { formatCurrency as fmtCurrency, formatNumber } from '@/lib/format';
import { useDriverDashboardRealtime } from '@/hooks/useDriverRealtimeSubscription';
import { useFinancialRealtime } from '@/hooks/useFinancialRealtime';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';

import { useIsFeatureEnabled } from '@/hooks/useFeatureFlags';
import { AIChatbot } from '@/components/AIChatbot';
import { AIIncomeInsights } from '@/components/AIIncomeInsights';
import { OwnershipProgressCard } from '@/components/OwnershipProgressCard';
import { DriverAdBanner } from '@/components/DriverAdBanner';
import { MVP_HIDE_DRIVER_KYC } from '@/lib/mvpFlags';


// Hook to fetch driver profile.
// Uses useDriverId so it stays in sync with auth state (avoids the race where
// the very first call to supabase.auth.getUser() returns null, caches a null
// profile forever, and surfaces a false "Profil conducteur requis" alert).
function useDriverProfile() {
  const { data: driverId } = useDriverId();
  return useQuery({
    queryKey: ['driverProfile', driverId],
    queryFn: async () => {
      if (!driverId) return null;
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .eq('id', driverId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!driverId,
  });
}

interface DriverData {
  full_name: string;
  score: number;
  tier: string;
  scoreStatus: 'provisional' | 'active';
  scoreChange: number;
  kycStatus: 'pending' | 'verified' | 'rejected' | 'not_submitted';
  paymentStreak: number;
  unreadNotifications: number;
}

// Calculate payment streak from payments (paid + overpaid both count)
function calculatePaymentStreak(payments: any[]): number {
  const isPaid = (s: string) => s === 'paid' || s === 'overpaid';
  const paidPayments = payments
    .filter(p => isPaid(p.status))
    .sort((a, b) => new Date(b.paid_date || b.due_date).getTime() - new Date(a.paid_date || a.due_date).getTime());

  let streak = 0;
  for (const payment of paidPayments) {
    if (isPaid(payment.status)) {
      streak++;
    } else {
      break;
    }
  }
  return Math.min(streak, 52); // Cap at 52 weeks
}

// Determine next best action based on driver state
function getNextBestAction(driver: DriverData | null, hasActiveRental: boolean) {
  if (!driver) return null;

  // KYC-related actions are suppressed during MVP — admin handles KYC.
  if (!MVP_HIDE_DRIVER_KYC) {
    if (driver.kycStatus === 'not_submitted') {
      return {
        title: 'Vérifiez votre identité',
        description: 'Complétez votre KYC pour louer un véhicule',
        action: '/driver/kyc',
        actionLabel: 'Commencer',
        variant: 'primary' as const,
      };
    }

    if (driver.kycStatus === 'pending') {
      return {
        title: 'Vérification en cours',
        description: 'Votre KYC est en attente de validation',
        action: '/driver/kyc',
        actionLabel: 'Voir le statut',
        variant: 'warning' as const,
      };
    }

    if (driver.kycStatus === 'rejected') {
      return {
        title: 'KYC refusé',
        description: 'Veuillez soumettre à nouveau vos documents',
        action: '/driver/kyc',
        actionLabel: 'Recommencer',
        variant: 'warning' as const,
      };
    }
  }

  // If close to next tier
  const pointsToTierA = 800 - driver.score;
  if (pointsToTierA <= 100 && driver.tier === 'B') {
    return {
      title: `Plus que ${pointsToTierA} points!`,
      description: 'Atteignez le Niveau A pour le Prêt Voiture',
      action: '/driver/score',
      actionLabel: 'Voir mon score',
      variant: 'success' as const,
    };
  }

  if (!hasActiveRental) {
    return {
      title: 'Louez un véhicule',
      description: 'Parcourez notre flotte de véhicules disponibles',
      action: '/driver/vehicles',
      actionLabel: 'Voir les véhicules',
      variant: 'primary' as const,
    };
  }

  return null;
}

interface InsightCardProps {
  title: string;
  value: string | number;
  icon: typeof TrendingUp;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  className?: string;
}

function InsightCard({ title, value, icon: Icon, trend, trendValue, className }: InsightCardProps) {
  return (
    <Card className={cn('flex-1', className)}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{title}</p>
          </div>
        </div>
        {trend && trendValue && (
          <div className={cn(
            'mt-2 text-xs font-medium',
            trend === 'up' && 'text-primary',
            trend === 'down' && 'text-destructive',
            trend === 'neutral' && 'text-muted-foreground'
          )}>
            {trend === 'up' && '↑ '}{trend === 'down' && '↓ '}{trendValue}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Fleet Control summary card (driver-side companion to the admin module).
function FleetControlCard() {
  const { data: inspection, isLoading } = useDriverActiveInspection();
  if (isLoading || !inspection) return null;

  const status = inspection.effective_status;
  const due = new Date(inspection.due_at);
  const daysLeft = differenceInCalendarDays(due, new Date());

  const config: Record<string, {
    title: string;
    description: string;
    cta: string;
    icon: typeof ClipboardCheck;
    bg: string;
    iconBg: string;
  }> = {
    pending: {
      title: 'Contrôle visuel requis',
      description: daysLeft >= 0
        ? `Soumettez les photos avant le ${format(due, 'd MMM', { locale: frLocale })}.`
        : 'À soumettre dès que possible.',
      cta: 'Commencer',
      icon: Camera,
      bg: 'from-primary/10 to-primary/5 border-primary/30',
      iconBg: 'bg-primary/20 text-primary',
    },
    submitted: {
      title: 'Contrôle envoyé',
      description: 'En attente de validation par votre gestionnaire.',
      cta: 'Voir le contrôle',
      icon: Clock,
      bg: 'from-blue-500/10 to-blue-500/5 border-blue-500/30',
      iconBg: 'bg-blue-500/20 text-blue-600 dark:text-blue-300',
    },
    rejected: {
      title: 'Contrôle refusé',
      description: inspection.rejection_reason || 'Corrigez les éléments refusés.',
      cta: 'Corriger maintenant',
      icon: XCircle,
      bg: 'from-destructive/10 to-destructive/5 border-destructive/30',
      iconBg: 'bg-destructive/20 text-destructive',
    },
    overdue: {
      title: 'Contrôle en retard',
      description: `En retard de ${Math.abs(daysLeft)} jour${Math.abs(daysLeft) > 1 ? 's' : ''} — soumettez-le rapidement.`,
      cta: 'Soumettre',
      icon: AlertTriangle,
      bg: 'from-warning/10 to-warning/5 border-warning/30',
      iconBg: 'bg-warning/20 text-warning',
    },
    blocked: {
      title: 'Véhicule immobilisé',
      description: 'Contactez votre gestionnaire.',
      cta: 'Voir les détails',
      icon: Ban,
      bg: 'from-destructive/10 to-destructive/5 border-destructive/40',
      iconBg: 'bg-destructive/20 text-destructive',
    },
  };

  const c = config[status] || config.pending;
  const Icon = c.icon;

  return (
    <div className="px-4 mt-6">
      <Link to="/driver/fleet-control" aria-label="Ouvrir le contrôle visuel">
        <Card className={cn('border bg-gradient-to-r overflow-hidden', c.bg)}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', c.iconBg)}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-sm">{c.title}</h3>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{c.description}</p>
                <div className="mt-2">
                  <Button variant="ghost" size="sm" className="h-7 px-2 -ml-2 text-xs">
                    {c.cta}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

function DailyStreakBadge() {
  const { streak, isNewDay, getStreakEmoji } = useDailyStreak();
  
  if (streak <= 0) return null;
  
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full transition-all",
        isNewDay ? "bg-white/20 animate-scale-in" : "bg-white/10"
      )}>
        <div className="flex items-center gap-1">
          <Zap className="h-4 w-4 text-warning" />
          <span className="text-sm font-semibold">{streak}</span>
        </div>
        <span className="text-xs text-white/80">
          {streak === 1 ? 'jour' : 'jours consécutifs'}
        </span>
        <span className="text-sm">{getStreakEmoji(streak)}</span>
      </div>
      {isNewDay && streak > 1 && (
        <span className="text-xs text-white/60 animate-fade-in">
          +1 jour!
        </span>
      )}
    </div>
  );
}

function KYCStatusBadge({ status }: { status: 'pending' | 'verified' | 'rejected' | 'not_submitted' | string }) {
  const config = {
    verified: {
      icon: CheckCircle,
      label: 'KYC Vérifié',
      className: 'bg-primary/20 text-primary border-primary/30',
    },
    pending: {
      icon: Clock,
      label: 'KYC En attente',
      className: 'bg-warning/20 text-warning border-warning/30',
    },
    rejected: {
      icon: XCircle,
      label: 'KYC Refusé',
      className: 'bg-destructive/20 text-destructive border-destructive/30',
    },
    not_submitted: {
      icon: AlertCircle,
      label: 'KYC Requis',
      className: 'bg-muted/20 text-muted-foreground border-muted-foreground/30',
    },
  };
  
  const { icon: Icon, label, className } = config[status as keyof typeof config] || config.not_submitted;
  
  return (
    <Link to="/driver/kyc">
      <div className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all hover:opacity-80",
        className
      )}>
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
    </Link>
  );
}

// Persistent KYC Status Banner - shows detailed status after submission
function KYCStatusBanner({ status, rejectionReason }: { status: string; rejectionReason?: string | null }) {
  // Don't show for not_submitted (handled by next action CTA) or verified (celebration is one-time)
  if (status === 'not_submitted') return null;
  
  const config = {
    pending: {
      icon: Clock,
      title: 'Vérification en cours',
      description: 'Vos documents sont en cours d\'examen. Vous serez notifié dès que votre identité sera vérifiée.',
      bgClass: 'bg-gradient-to-r from-warning/10 to-warning/5 border-warning/30',
      iconClass: 'bg-warning/20 text-warning',
      showProgress: true,
    },
    verified: {
      icon: CheckCircle,
      title: 'Identité vérifiée ✓',
      description: 'Félicitations! Votre KYC est approuvé. Vous pouvez maintenant louer des véhicules et demander des prêts.',
      bgClass: 'bg-gradient-to-r from-primary/10 to-primary/5 border-primary/30',
      iconClass: 'bg-primary/20 text-primary',
      showProgress: false,
    },
    approved: {
      icon: CheckCircle,
      title: 'Identité vérifiée ✓',
      description: 'Félicitations! Votre KYC est approuvé. Vous pouvez maintenant louer des véhicules et demander des prêts.',
      bgClass: 'bg-gradient-to-r from-primary/10 to-primary/5 border-primary/30',
      iconClass: 'bg-primary/20 text-primary',
      showProgress: false,
    },
    rejected: {
      icon: XCircle,
      title: 'Vérification refusée',
      description: rejectionReason || 'Veuillez soumettre à nouveau vos documents avec les corrections demandées.',
      bgClass: 'bg-gradient-to-r from-destructive/10 to-destructive/5 border-destructive/30',
      iconClass: 'bg-destructive/20 text-destructive',
      showProgress: false,
    },
  };
  
  const statusConfig = config[status as keyof typeof config];
  if (!statusConfig) return null;
  
  const { icon: Icon, title, description, bgClass, iconClass, showProgress } = statusConfig;
  
  return (
    <Link to="/driver/kyc">
      <Card className={cn('border overflow-hidden', bgClass)}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', iconClass)}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-sm">{title}</h3>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
              {showProgress && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full w-1/2 bg-warning rounded-full animate-pulse" />
                  </div>
                  <span className="text-xs text-muted-foreground">En cours...</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

const TIP_ICONS = {
  'sparkles': Sparkles,
  'car': Car,
  'wallet': Wallet,
  'trending-up': TrendingUp,
  'heart': Heart,
  'star': Star,
  'target': Target,
} as const;

function DailyTipCard({ tipContext }: { tipContext?: DailyTipContext }) {
  const tip = useDailyTip(tipContext);
  const Icon = TIP_ICONS[tip.icon];
  
  const categoryColors = {
    motivation: 'from-primary/10 to-primary/5 border-primary/20',
    driving: 'from-tier-a/10 to-tier-a/5 border-tier-a/20',
    finance: 'from-warning/10 to-warning/5 border-warning/20',
    score: 'from-secondary/10 to-secondary/5 border-secondary/20',
  };
  
  const iconColors = {
    motivation: 'text-primary bg-primary/20',
    driving: 'text-tier-a bg-tier-a/20',
    finance: 'text-warning bg-warning/20',
    score: 'text-secondary bg-secondary/20',
  };

  const tierLabel = tipContext?.tier ? `Niveau ${tipContext.tier}` : null;
  
  return (
    <Card className={cn(
      'border bg-gradient-to-r overflow-hidden',
      categoryColors[tip.category]
    )}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
          iconColors[tip.category]
        )}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-xs text-muted-foreground">💡 Conseil du jour</p>
            {tierLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground font-medium">
                {tierLabel}
              </span>
            )}
          </div>
          <p className="text-sm font-medium leading-snug">{tip.text}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const TIER_COLORS: Record<string, string> = {
  A: 'bg-tier-a text-white',
  B: 'bg-tier-b text-white',
  C: 'bg-tier-c text-foreground',
  D: 'bg-tier-d text-white',
  E: 'bg-tier-e text-white',
};

const RANK_ICONS = [
  { label: '🥇', bg: 'bg-yellow-500/15' },
  { label: '🥈', bg: 'bg-gray-400/15' },
  { label: '🥉', bg: 'bg-amber-700/15' },
];

// Weekly Income Summary Card
function WeeklyIncomeSummary({ driverId }: { driverId: string | undefined }) {
  const { data, isLoading } = useQuery({
    queryKey: ['driver-weekly-income', driverId],
    queryFn: async () => {
      if (!driverId) return null;
      // Get start of current week (Monday)
      const now = new Date();
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      monday.setHours(0, 0, 0, 0);
      const mondayStr = monday.toISOString().split('T')[0];

      const { data: records, error } = await supabase
        .from('income_records')
        .select('net_income, gross_income, trip_count, record_date')
        .eq('driver_id', driverId)
        .gte('record_date', mondayStr)
        .in('status', ['approved', 'pending']);

      if (error) throw error;

      const totalNet = (records || []).reduce((s, r) => s + (r.net_income || 0), 0);
      const totalGross = (records || []).reduce((s, r) => s + (r.gross_income || 0), 0);
      const totalTrips = (records || []).reduce((s, r) => s + (r.trip_count || 0), 0);
      const daysWorked = new Set((records || []).map(r => r.record_date)).size;

      return { totalNet, totalGross, totalTrips, daysWorked };
    },
    enabled: !!driverId,
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading || !data) return null;

  return (
    <div className="px-4 mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Banknote className="h-3.5 w-3.5" />
          Revenus cette semaine
        </h2>
        <Link to="/driver/income" className="text-xs text-primary font-medium flex items-center gap-0.5">
          Détails
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <Card className="overflow-hidden border bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-2xl font-bold">{fmtCurrency(data.totalNet)}</p>
              <p className="text-xs text-muted-foreground">Revenu net</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Wallet className="h-6 w-6 text-primary" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-2 rounded-xl bg-muted/40">
              <p className="text-lg font-bold">{data.totalTrips}</p>
              <p className="text-[10px] text-muted-foreground">Courses</p>
            </div>
            <div className="text-center p-2 rounded-xl bg-muted/40">
              <p className="text-lg font-bold">{data.daysWorked}</p>
              <p className="text-[10px] text-muted-foreground">Jours</p>
            </div>
            <div className="text-center p-2 rounded-xl bg-muted/40">
              <p className="text-lg font-bold">{data.totalTrips > 0 ? formatNumber(Math.round(data.totalNet / data.totalTrips)) : '0'}</p>
              <p className="text-[10px] text-muted-foreground">Moy/course</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LeaderboardPreview({ driverId }: { driverId: string | undefined }) {
  const { data: leaderboard = [], isLoading } = useQuery({
    queryKey: ['driver-leaderboard-preview'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_driver_leaderboard', { p_limit: 20 });
      if (error) throw error;
      return (data || []) as { driver_id: string; driver_name: string; profile_image_url: string | null; score: number; tier: string; score_change: number; rank: number }[];
    },
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading || leaderboard.length === 0) return null;

  const myEntry = leaderboard.find(e => e.driver_id === driverId);
  
  const top3 = leaderboard.slice(0, 3);
  let nearby: typeof leaderboard = [];
  if (myEntry && myEntry.rank > 3) {
    const myIdx = leaderboard.findIndex(e => e.driver_id === driverId);
    const start = Math.max(0, myIdx - 1);
    const end = Math.min(leaderboard.length, myIdx + 2);
    nearby = leaderboard.slice(start, end);
  }

  const renderEntry = (entry: typeof leaderboard[0], index: number) => {
    const isMe = entry.driver_id === driverId;
    const rankBadge = entry.rank <= 3 ? RANK_ICONS[entry.rank - 1] : null;
    const initials = entry.driver_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    
    return (
      <div
        key={entry.driver_id}
        className={cn(
          'flex items-center gap-3 px-4 py-3 transition-all',
          isMe && 'bg-primary/5 border-l-2 border-l-primary',
        )}
        style={{ animationDelay: `${index * 80}ms` }}
      >
        {/* Rank */}
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0 font-bold',
          rankBadge ? rankBadge.bg : 'bg-muted text-muted-foreground'
        )}>
          {rankBadge ? rankBadge.label : entry.rank}
        </div>

        {/* Avatar + tier */}
        <div className="relative flex-shrink-0">
          {entry.profile_image_url ? (
            <img src={entry.profile_image_url} alt="" className="w-9 h-9 rounded-full object-cover border-2 border-border" />
          ) : (
            <div className={cn(
              'w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2',
              isMe ? 'bg-primary/10 text-primary border-primary/30' : 'bg-muted text-muted-foreground border-border'
            )}>
              {initials}
            </div>
          )}
          <div className={cn(
            'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ring-2 ring-background',
            TIER_COLORS[entry.tier] || TIER_COLORS.E
          )}>
            {entry.tier}
          </div>
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <span className={cn('text-sm truncate block', isMe ? 'font-bold text-primary' : 'font-medium')}>
            {isMe ? '⭐ Vous' : entry.driver_name}
          </span>
        </div>

        {/* Score + change */}
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-bold">{entry.score}</div>
          <div className={cn(
            'text-[10px] font-semibold flex items-center justify-end gap-0.5 transition-colors',
            entry.score_change > 0 && 'text-primary',
            entry.score_change < 0 && 'text-destructive',
            entry.score_change === 0 && 'text-muted-foreground',
          )}>
            {entry.score_change > 0 && <TrendingUp className="h-2.5 w-2.5" />}
            {entry.score_change < 0 && <TrendingDown className="h-2.5 w-2.5" />}
            {entry.score_change === 0 && <Minus className="h-2.5 w-2.5" />}
            {entry.score_change > 0 ? '+' : ''}{entry.score_change}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Trophy className="h-3.5 w-3.5" />
          Classement
        </h2>
        <Link to="/driver/leaderboard" className="text-xs text-primary font-medium flex items-center gap-0.5">
          Voir tout
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0 divide-y divide-border">
          {top3.map((entry, i) => renderEntry(entry, i))}

          {nearby.length > 0 && (
            <>
              <div className="px-4 py-1.5 bg-muted/30 flex items-center gap-2">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Votre position</span>
              </div>
              {nearby.map((entry, i) => renderEntry(entry, i + 3))}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <DriverLayout className="bg-background">
      <div className="bg-gradient-hero text-white p-6 pb-24 rounded-b-3xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Skeleton className="h-4 w-20 bg-white/20 mb-2" />
            <Skeleton className="h-8 w-40 bg-white/20" />
          </div>
          <Skeleton className="h-10 w-10 rounded-full bg-white/20" />
        </div>
      </div>
      <div className="px-4 -mt-20 relative z-10">
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
      <div className="px-4 mt-6">
        <Skeleton className="h-4 w-32 mb-3" />
        <div className="flex gap-3">
          <Skeleton className="h-24 flex-1" />
          <Skeleton className="h-24 flex-1" />
        </div>
      </div>
    </DriverLayout>
  );
}

function NoDriverProfileAlert() {
  const navigate = useNavigate();
  
  return (
    <Card 
      className="border-warning/50 bg-warning/5 mx-4 mt-4 cursor-pointer hover:bg-warning/10 transition-colors"
      onClick={() => navigate('/driver-onboarding')}
    >
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-warning/20 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertCircle className="h-6 w-6 text-warning" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground mb-1">Profil conducteur requis</h3>
            <p className="text-sm text-muted-foreground">
              Vous devez compléter votre inscription pour accéder à l'application.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function DriverHome() {
  const navigate = useNavigate();
  const isAuthResolving = useIsAuthResolving();
  const { data: driverId, isLoading: isDriverIdLoading, isSuccess: isDriverIdSuccess } = useDriverId();
  const { data: driverProfile, isLoading: isProfileLoading } = useDriverProfile();
  const { data: creditScores = [], isLoading: isScoresLoading } = useDriverCreditScores();
  const { data: currentScore, isLoading: isCurrentScoreLoading } = useDriverCurrentScore();
  const { data: rentals = [], isLoading: isRentalsLoading } = useDriverRentals();
  const { data: notifications = [], isLoading: isNotificationsLoading } = useDriverNotifications();
  const { data: loans = [], isLoading: isLoansLoading } = useDriverLoans();
  const { data: payments = [], isLoading: isPaymentsLoading } = useDriverPayments();
  useFinancialRealtime({ scope: 'driver', driverId: driverId ?? null });
  const { data: isChatbotEnabled } = useIsFeatureEnabled('ai_driver_chatbot');
  const { data: isIncomeInsightsEnabled } = useIsFeatureEnabled('ai_income_insights');
  
  // Fetch latest KYC submission for rejection reason
  const { data: kycSubmission } = useQuery({
    queryKey: ['driver-kyc-submission', driverId],
    queryFn: async () => {
      if (!driverId) return null;
      const { data } = await supabase
        .from('kyc_submissions')
        .select('status, rejection_reason')
        .eq('driver_id', driverId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!driverId,
  });
  
  const { isInstallable, isInstalled, promptInstall } = usePWA();
  const [installDismissed, setInstallDismissed] = useState(() => {
    return localStorage.getItem('pwa-install-dismissed') === 'true';
  });
  

  const handleDismissInstall = () => {
    setInstallDismissed(true);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  useDriverDashboardRealtime();

  const isLoading = isAuthResolving || isDriverIdLoading || isProfileLoading || isScoresLoading || isCurrentScoreLoading || isRentalsLoading;
  // Only treat the profile as truly missing once the driverId query has
  // resolved successfully with null. If the query errored (e.g. offline), we
  // keep the dashboard rendering instead of falsely warning the driver.
  const hasDriverProfile = !!driverId;
  const isProfileMissing = isDriverIdSuccess && driverId === null;

  const latestScore = creditScores[0];
  const previousScore = creditScores[1];
  const scoreChange = latestScore && previousScore ? latestScore.score - previousScore.score : 0;
  const displayedScore = currentScore ?? latestScore?.score ?? 0;
  const displayedTier = getScoreLevel(displayedScore).level;
  const displayedScoreStatus = (latestScore?.status === 'provisional' ? 'provisional' : 'active') as 'provisional' | 'active';

  const unreadNotifications = notifications.filter((n: any) => !n.is_read).length;
  const activeRental = (rentals as any[]).find(r => r.status === 'active');
  const pendingLoans = (loans as any[]).filter(l => l.status === 'pending').length;
  const paymentStreak = calculatePaymentStreak(payments as any[]);

  const driverData: DriverData | null = driverProfile ? {
    full_name: driverProfile.full_name,
    score: displayedScore,
    tier: displayedTier,
    scoreStatus: displayedScoreStatus,
    scoreChange,
    kycStatus: driverProfile.kyc_status as 'pending' | 'verified' | 'rejected',
    paymentStreak,
    unreadNotifications,
  } : null;

  const nextAction = getNextBestAction(driverData, !!activeRental);

  // Welcome back logic - detect returning users
  const welcomeMessage = useMemo(() => {
    const LAST_VISIT_KEY = 'driver-last-visit';
    const lastVisit = localStorage.getItem(LAST_VISIT_KEY);
    const now = new Date();
    const hour = now.getHours();
    
    // Update last visit time
    localStorage.setItem(LAST_VISIT_KEY, now.toISOString());
    
    // Time-based greeting
    let timeGreeting: string;
    if (hour < 12) {
      timeGreeting = UI.GREETING_MORNING;
    } else if (hour < 18) {
      timeGreeting = UI.GREETING_AFTERNOON;
    } else {
      timeGreeting = UI.GREETING_EVENING;
    }
    
    // Check if returning user (visited more than 1 hour ago)
    const isReturning = lastVisit && (now.getTime() - new Date(lastVisit).getTime() > 3600000);
    
    return {
      greeting: isReturning ? UI.WELCOME_BACK : timeGreeting,
      isReturning,
    };
  }, []);
  // Get next payment for active rental
  const nextPayment = activeRental ? (payments as any[])
    .filter(p => p.rental_id === activeRental.id && p.status !== 'paid')
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0]
    : null;

  // Calculate days remaining for active rental
  const daysRemaining = activeRental?.end_date 
    ? Math.max(0, Math.ceil((new Date(activeRental.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  // Build badges based on real data
  const badges = [
    paymentStreak >= 4 && { 
      id: 'streak', 
      label: `${paymentStreak} semaines`, 
      icon: Flame, 
      color: 'text-warning', 
      bgColor: 'bg-warning/10' 
    },
    latestScore?.driving_impact && latestScore.driving_impact >= 40 && { 
      id: 'safety', 
      label: 'Conduite sûre', 
      icon: Shield, 
      color: 'text-primary', 
      bgColor: 'bg-primary/10' 
    },
    paymentStreak >= 2 && { 
      id: 'early', 
      label: 'Payeur ponctuel', 
      icon: Calendar, 
      color: 'text-secondary', 
      bgColor: 'bg-secondary/10' 
    },
  ].filter(Boolean) as { id: string; label: string; icon: typeof Flame; color: string; bgColor: string }[];

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (isProfileMissing) {
    return (
      <DriverLayout className="bg-background">
        <div className="bg-gradient-hero text-white p-6 pb-12 rounded-b-3xl">
          <div>
            <p className="text-white/70 text-sm">{UI.GREETING},</p>
            <h1 className="text-2xl font-bold">Bienvenue!</h1>
          </div>
        </div>
        <NoDriverProfileAlert />
      </DriverLayout>
    );
  }

  return (
    <DriverLayout className="bg-background">
      {/* Header with greeting */}
      <div className="bg-gradient-hero text-white p-6 pb-24 rounded-b-3xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-white/70 text-sm">{welcomeMessage.greeting}</p>
              {welcomeMessage.isReturning && (
                <Sparkles className="h-3.5 w-3.5 text-white/70" />
              )}
            </div>
            <h1 className="text-2xl font-bold">{driverData?.full_name || 'Conducteur'}!</h1>
          </div>
          <Link to="/driver/notifications" className="relative">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <Bell className="h-6 w-6" />
            </Button>
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive rounded-full text-xs flex items-center justify-center font-semibold">
                {unreadNotifications}
              </span>
            )}
          </Link>
        </div>
        
        {/* KYC Status & Daily Streak */}
        <div className="flex items-center gap-3 flex-wrap">
          <KYCStatusBadge status={driverData?.kycStatus || 'not_submitted'} />
          <DailyStreakBadge />
        </div>
        {/* Test version indicator */}
        <div className="absolute top-6 right-20">
          <span className="bg-primary/20 text-primary text-[10px] px-2 py-0.5 rounded-full">v3</span>
        </div>
      </div>

      {/* Score Card - overlapping header */}
      <div className="px-4 -mt-20 relative z-10">
        <Card className="overflow-hidden" data-tour="score-card">
          <CardContent className="p-6">
            {driverData ? (
              <div className="flex items-center gap-6">
                <ScoreGauge 
                  score={driverData.score} 
                  size="sm"
                  status={driverData.scoreStatus}
                  showTier={false}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={`tier-${driverData.tier.toLowerCase()}` as any}>
                      Niveau {driverData.tier}
                    </Badge>
                    <ScoreChangeIndicator change={scoreChange} />
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {driverData.scoreStatus === 'provisional' ? SCORE.PROVISIONAL : SCORE.ACTIVE}
                  </p>
                  <Link to="/driver/score">
                    <Button variant="ghost" size="sm" className="text-primary -ml-3">
                      {SCORE.WHY_THIS_SCORE}
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Score en cours de calcul...</p>
                <Link to="/driver/score">
                  <Button variant="ghost" size="sm" className="text-primary mt-2">
                    En savoir plus
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>


      {/* KYC Status Banner — hidden during MVP (admin handles KYC) */}
      {!MVP_HIDE_DRIVER_KYC && driverData?.kycStatus && driverData.kycStatus !== 'not_submitted' && (
        <div className="px-4 mt-4">
          <KYCStatusBanner 
            status={driverData.kycStatus} 
            rejectionReason={kycSubmission?.rejection_reason}
          />
        </div>
      )}

      {/* Next Best Action CTA */}
      {nextAction && (
        <div className="px-4 mt-4">
          <Link to={nextAction.action}>
            <Card className={cn(
              'overflow-hidden border-2',
              nextAction.variant === 'primary' && 'border-primary bg-primary/5',
              nextAction.variant === 'warning' && 'border-warning bg-warning/5',
              nextAction.variant === 'success' && 'border-tier-a bg-tier-a/5',
            )}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center',
                    nextAction.variant === 'primary' && 'bg-primary/20',
                    nextAction.variant === 'warning' && 'bg-warning/20',
                    nextAction.variant === 'success' && 'bg-tier-a/20',
                  )}>
                    <Target className={cn(
                      'h-5 w-5',
                      nextAction.variant === 'primary' && 'text-primary',
                      nextAction.variant === 'warning' && 'text-warning',
                      nextAction.variant === 'success' && 'text-tier-a',
                    )} />
                  </div>
                  <div>
                    <p className="font-semibold">{nextAction.title}</p>
                    <p className="text-xs text-muted-foreground">{nextAction.description}</p>
                  </div>
                </div>
                <ArrowRight className={cn(
                  'h-5 w-5',
                  nextAction.variant === 'primary' && 'text-primary',
                  nextAction.variant === 'warning' && 'text-warning',
                  nextAction.variant === 'success' && 'text-tier-a',
                )} />
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

      {/* Daily Tip - personalized by tier & activity */}
      <div className="px-4 mt-4">
        <DailyTipCard tipContext={{
          tier: driverData?.tier,
          paymentStreak,
          scoreChange,
          hasOverduePayment: (payments as any[]).some(p => p.status === 'overdue'),
        }} />
      </div>

      {/* Rent-to-Own Ownership Progress - Premium */}
      <OwnershipProgressCard />

      {/* In-app sponsored banner */}
      <DriverAdBanner />

      {/* Weekly Income Summary */}
      <WeeklyIncomeSummary driverId={driverId} />

      {/* AI Income Insights - Premium */}
      {isIncomeInsightsEnabled && driverId && (
        <AIIncomeInsights driverId={driverId} />
      )}

      {/* Leaderboard Preview */}
      <LeaderboardPreview driverId={driverId} />
      {/* Streaks & Badges */}
      {badges.length > 0 && (
        <div className="px-4 mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Vos récompenses
            </h2>
            <span className="text-xs text-primary font-medium flex items-center gap-1">
              <Award className="h-3 w-3" />
              {badges.length} badges
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
            {badges.map((badge) => (
              <div 
                key={badge.id}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 rounded-xl flex-shrink-0',
                  badge.bgColor
                )}
              >
                <badge.icon className={cn('h-5 w-5', badge.color)} />
                <span className="text-sm font-medium whitespace-nowrap">{badge.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* This Week Insights */}
      <div className="px-4 mt-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Cette semaine
        </h2>
        <div className="flex gap-3">
          <InsightCard
            title="Séries paiements"
            value={`${paymentStreak}`}
            icon={Flame}
            trend={paymentStreak > 0 ? 'up' : 'neutral'}
            trendValue={paymentStreak > 0 ? `${paymentStreak} à temps` : 'Pas encore'}
          />
          <InsightCard
            title="Prêts actifs"
            value={`${pendingLoans}`}
            icon={Wallet}
            trend="neutral"
            trendValue={pendingLoans > 0 ? 'En attente' : 'Aucun'}
          />
        </div>
      </div>

      {/* Active Rental Card */}
      {activeRental && (
        <div className="px-4 mt-6">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
            {NAV.RENTAL}
          </h2>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <Badge variant="active">{RENTAL.ACTIVE}</Badge>
                {daysRemaining > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {daysRemaining} jours restants
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-muted rounded-xl flex items-center justify-center overflow-hidden">
                  {(() => {
                    const resolved = resolveVehicleImage(activeRental.vehicle?.image_url, activeRental.vehicle?.model_name);
                    return resolved ? (
                      <img
                        src={resolved}
                        alt={activeRental.vehicle?.model_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Car className="h-8 w-8 text-muted-foreground" />
                    );
                  })()}
                </div>
                <div className="flex-1">
                  <p className="font-medium">{activeRental.vehicle?.model_name || 'Véhicule'}</p>
                  <p className="text-xs text-muted-foreground">{activeRental.vehicle?.license_plate}</p>
                  {nextPayment && (
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">
                        {formatCurrency(nextPayment.amount)} · {formatDateShort(new Date(nextPayment.due_date))}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
              <Link to="/driver/rental">
                <Button variant="outline" className="w-full mt-4">
                  Voir les détails
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Fleet Control entry-point */}
      <FleetControlCard />

      {/* Quick Actions */}
      <div className="px-4 mt-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          Actions rapides
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Link to="/driver/vehicles">
            <Card interactive className="h-24">
              <CardContent className="p-4 flex flex-col items-center justify-center h-full">
                <Car className="h-6 w-6 text-primary mb-2" />
                <span className="text-xs text-center font-medium">Louer</span>
              </CardContent>
            </Card>
          </Link>
          <Link to="/driver/score">
            <Card interactive className="h-24">
              <CardContent className="p-4 flex flex-col items-center justify-center h-full">
                <TrendingUp className="h-6 w-6 text-secondary mb-2" />
                <span className="text-xs text-center font-medium">Score</span>
              </CardContent>
            </Card>
          </Link>
          <Link to="/driver/loans">
            <Card interactive className="h-24">
              <CardContent className="p-4 flex flex-col items-center justify-center h-full">
                <Wallet className="h-6 w-6 text-warning mb-2" />
                <span className="text-xs text-center font-medium">Prêts</span>
              </CardContent>
            </Card>
          </Link>
          <Link to="/driver/sinistres">
            <Card interactive className="h-24">
              <CardContent className="p-4 flex flex-col items-center justify-center h-full">
                <ShieldAlert className="h-6 w-6 text-destructive mb-2" />
                <span className="text-xs text-center font-medium">Sinistre</span>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Recent Notifications */}
      <div className="px-4 mt-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {NAV.NOTIFICATIONS}
          </h2>
          <Link to="/driver/notifications" className="text-xs text-primary font-medium">
            Voir tout
          </Link>
        </div>
        {notifications.length > 0 ? (
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {(notifications as any[]).slice(0, 3).map((notif) => (
                <div key={notif.id} className="p-4 flex items-start gap-3">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                    notif.notification_type === 'score_update' && 'bg-primary/10',
                    notif.notification_type === 'payment_reminder' && 'bg-warning/10',
                    !['score_update', 'payment_reminder'].includes(notif.notification_type) && 'bg-secondary/10'
                  )}>
                    {notif.notification_type === 'score_update' && <TrendingUp className="h-4 w-4 text-primary" />}
                    {notif.notification_type === 'payment_reminder' && <CreditCard className="h-4 w-4 text-warning" />}
                    {!['score_update', 'payment_reminder'].includes(notif.notification_type) && <Bell className="h-4 w-4 text-secondary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm', !notif.is_read && 'font-medium')}>{notif.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{notif.message}</p>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {formatRelativeTime(new Date(notif.created_at))}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Aucune notification</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Floating Install Button */}
      {isInstallable && !isInstalled && !installDismissed && (
        <div className="fixed bottom-24 right-4 z-50 animate-fade-in">
          <div className="relative">
            <Button
              onClick={promptInstall}
              className="shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-4 py-2 flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Installer l'app
            </Button>
            <button
              onClick={handleDismissInstall}
              className="absolute -top-2 -right-2 w-6 h-6 bg-muted rounded-full flex items-center justify-center shadow-md hover:bg-muted-foreground/20 transition-colors"
              aria-label="Fermer"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}

      {/* AI Chatbot FAB - Premium */}
      {isChatbotEnabled && driverId && (
        <AIChatbot driverId={driverId} />
      )}

      {/* Onboarding Tour removed — superseded by /driver/onboarding flow. */}
    </DriverLayout>
  );
}
