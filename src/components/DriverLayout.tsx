import { ReactNode, useEffect, useCallback } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { BottomNav } from './BottomNav';
import { PullToRefresh } from './PullToRefresh';
import { OfflineIndicator } from './OfflineIndicator';
import { OfflineScreen } from './OfflineScreen';
import { OverduePaymentModal } from './OverduePaymentModal';
import { cn } from '@/lib/utils';
import { useDriverAuth } from '@/hooks/useDriverAuth';
import { LoadingState } from './LoadingState';
import { useEnhancedNotifications } from '@/hooks/useEnhancedNotifications';
import { useCapacitorPush } from '@/hooks/useCapacitorPush';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { Bell, Zap, ShieldAlert } from 'lucide-react';
import { useDriverCurrentScore, useDriverNotifications, useDriverId, useDriverCreditScores } from '@/hooks/useDriverData';
import { useIsFeatureEnabled } from '@/hooks/useFeatureFlags';
import { useDailyStreak } from '@/hooks/useDailyStreak';
import damFlotteLogo from '@/assets/dam-flotte-logo.png';

const ROUTE_ORDER = [
  '/driver',
  '/driver/score',
  '/driver/vehicles',
  '/driver/loans',
  '/driver/settings',
  '/driver/profile',
];

function getRouteIndex(pathname: string): number {
  const exactIndex = ROUTE_ORDER.indexOf(pathname);
  if (exactIndex !== -1) return exactIndex;
  for (let i = ROUTE_ORDER.length - 1; i >= 0; i--) {
    if (ROUTE_ORDER[i] !== '/driver' && pathname.startsWith(ROUTE_ORDER[i])) return i;
  }
  if (pathname.startsWith('/driver')) return 0;
  return -1;
}

let previousRouteIndex = 0;

interface DriverLayoutProps {
  children: ReactNode;
  className?: string;
  hideNav?: boolean;
  hideHeader?: boolean;
  requireAuth?: boolean;
  enablePullToRefresh?: boolean;
  enableSwipeNavigation?: boolean;
  onRefresh?: () => Promise<void>;
}

// Mini score ring for the header
function MiniScoreRing({ score, tier }: { score: number; tier: string }) {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 1000) * circumference;
  
  const tierColors: Record<string, string> = {
    A: 'hsl(142, 71%, 45%)',
    B: 'hsl(82, 77%, 44%)',
    C: 'hsl(45, 93%, 47%)',
    D: 'hsl(25, 95%, 53%)',
    E: 'hsl(0, 84%, 60%)',
  };

  return (
    <div className="relative w-9 h-9 flex items-center justify-center">
      <svg width="36" height="36" className="-rotate-90">
        <circle cx="18" cy="18" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
        <circle
          cx="18" cy="18" r={radius}
          fill="none"
          stroke={tierColors[tier] || tierColors.E}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute text-[10px] font-bold">{tier}</span>
    </div>
  );
}

export function DriverLayout({ 
  children, className, hideNav = false, hideHeader = false,
  requireAuth = true, enablePullToRefresh = true,
  enableSwipeNavigation = true, onRefresh
}: DriverLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading } = useDriverAuth();
  const { data: driverId } = useDriverId();
  const { data: notifications = [] } = useDriverNotifications();
  const { data: creditScores = [] } = useDriverCreditScores();
  const { data: currentScore } = useDriverCurrentScore();
  const { streak } = useDailyStreak();
  const { isOnline } = useOfflineStatus();
  
  const latestScore = creditScores?.[0];
  const displayedScore = currentScore ?? latestScore?.score ?? 0;
  const displayedTier = latestScore?.tier ?? 'E';
  const unreadCount = notifications.filter((n: { is_read: boolean }) => !n.is_read).length;

  const currentIndex = getRouteIndex(location.pathname);
  const direction = currentIndex >= previousRouteIndex ? 1 : -1;
  
  useEffect(() => {
    if (currentIndex !== -1) previousRouteIndex = currentIndex;
  }, [currentIndex]);
  
  useEnhancedNotifications();
  useCapacitorPush();
  useSwipeNavigation({ enabled: enableSwipeNavigation && !hideNav });

  const handleRefresh = useCallback(async () => {
    if (onRefresh) {
      await onRefresh();
    } else {
      await queryClient.invalidateQueries({ queryKey: ['driver'] });
      await queryClient.invalidateQueries({ queryKey: ['driverNotifications'] });
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }, [onRefresh, queryClient]);

  useEffect(() => {
    if (requireAuth && !isLoading && !isAuthenticated) {
      navigate('/driver/login', { replace: true });
    }
  }, [requireAuth, isAuthenticated, isLoading, navigate]);

  if (requireAuth && isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingState message="Chargement..." />
      </div>
    );
  }

  if (requireAuth && !isAuthenticated) return null;

  // Full-screen offline state — shown only when truly offline and no cached data is rendering
  if (!isOnline && !queryClient.getQueryCache().getAll().length) {
    return (
      <OfflineScreen onRetry={() => {
        queryClient.invalidateQueries();
      }} />
    );
  }

  const mainContent = (
    <AnimatePresence mode="wait" initial={false} custom={direction}>
      <motion.main
        key={location.pathname}
        custom={direction}
        initial={{ x: direction > 0 ? '8%' : '-8%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: direction > 0 ? '-8%' : '8%', opacity: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className={cn('pb-24', className)}
      >
        {children}
      </motion.main>
    </AnimatePresence>
  );

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      <OverduePaymentModal />
      <OfflineIndicator />
      
      {/* Compact gamified header */}
      {!hideHeader && (
        <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-xl border-b border-border/50">
          <div className="flex items-center justify-between px-4 h-14">
            {/* Logo + streak */}
            <Link to="/driver" className="flex items-center gap-2.5">
              <img src={damFlotteLogo} alt="DAM" className="w-8 h-8 rounded-xl object-contain" />
              {streak > 0 && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10">
                  <Zap className="h-3.5 w-3.5 text-warning" />
                  <span className="text-xs font-bold text-warning">{streak}</span>
                </div>
              )}
            </Link>

            {/* Right side: score ring + notifications */}
            <div className="flex items-center gap-2">
              {driverId && (currentScore != null || latestScore) && (
                <Link to="/driver/score">
                  <MiniScoreRing score={displayedScore} tier={displayedTier} />
                </Link>
              )}

              <Link 
                to="/driver/notifications" 
                className="relative p-2.5 rounded-xl hover:bg-muted/50 transition-colors active:scale-95"
              >
                <Bell className="h-5 w-5 text-muted-foreground" />
                {driverId && unreadCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-1 right-1 min-w-[16px] h-[16px] bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full flex items-center justify-center px-0.5"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </motion.span>
                )}
              </Link>
            </div>
          </div>
        </header>
      )}
      
      {enablePullToRefresh ? (
        <PullToRefresh onRefresh={handleRefresh} className="flex-1 overflow-y-auto overscroll-contain">
          {mainContent}
        </PullToRefresh>
      ) : (
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {mainContent}
        </div>
      )}
      
      {!hideNav && <BottomNav />}
      {!hideNav && <AccidentFAB />}
    </div>
  );
}

function AccidentFAB() {
  const location = useLocation();
  const { data: isEnabled } = useIsFeatureEnabled('enable_accident_reporting');

  // Hide on accident page itself
  if (!isEnabled || location.pathname === '/driver/accident') return null;

  return (
    <Link
      to="/driver/accident"
      className="fixed bottom-20 right-4 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-destructive text-destructive-foreground shadow-lg active:scale-95 transition-transform"
      aria-label="Déclarer un accident"
    >
      <ShieldAlert className="h-6 w-6" />
    </Link>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between p-4', className)}>
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
