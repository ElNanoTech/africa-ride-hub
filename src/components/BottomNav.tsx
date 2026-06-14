import { Link, useLocation } from 'react-router-dom';
import { Home, Car, User, Wallet, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useDriverRentals } from '@/hooks/useDriverData';
import { useDriverActiveInspection } from '@/hooks/useDriverActiveInspection';
import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { isToday, isPast, parseISO, differenceInHours, differenceInMinutes } from 'date-fns';
import { supabase } from '@/integrations/supabase/routeClient';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeWhen?: string[];
  badge?: string | number;
  badgeVariant?: 'default' | 'warning' | 'danger' | 'countdown';
}

type DriverRentalSummary = {
  id: string;
  status: string | null;
};

type RentalPaymentSummary = {
  id: string;
  due_date: string;
  status: string | null;
};

const baseNavItems: NavItem[] = [
  { to: '/driver', label: 'Accueil', icon: Home, activeWhen: ['/driver-dashboard'] },
  {
    to: '/driver/finance',
    label: 'Finance',
    icon: Wallet,
    activeWhen: ['/driver/portefeuille', '/driver/wallet', '/driver/factures', '/driver/loans', '/driver/credit', '/driver/ownership', '/driver/income'],
  },
  { to: '/driver/vehicles', label: 'Véhicule', icon: Car, activeWhen: ['/vehicles', '/driver/vehicle', '/driver/rental'] },
  { to: '/driver/fleet-control', label: 'Contrôle', icon: ClipboardCheck, activeWhen: ['/driver/inspection'] },
  { to: '/driver/profile', label: 'Profil', icon: User, activeWhen: ['/profile', '/driver/settings', '/driver/support', '/driver/kyc', '/driver/profile/kyc'] },
];

export function BottomNav() {
  const location = useLocation();
  const haptic = useHapticFeedback();
  const { data: rentals = [] } = useDriverRentals();
  const { data: activeInspection } = useDriverActiveInspection();
  const [previousPaymentStatus, setPreviousPaymentStatus] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeRental = useMemo(() => 
    (rentals as DriverRentalSummary[]).find((r) => r.status === 'active'),
    [rentals]
  );

  const { data: rentalPayments = [] } = useQuery({
    queryKey: ['rentalPayments', activeRental?.id],
    queryFn: async () => {
      if (!activeRental?.id) return [];
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('rental_id', activeRental.id)
        .eq('status', 'pending')
        .order('due_date', { ascending: true });
      if (error) throw error;
      return (data || []) as RentalPaymentSummary[];
    },
    enabled: !!activeRental?.id,
    refetchInterval: 60000,
  });

  const nextDuePayment = useMemo(() => {
    if (!rentalPayments.length) return null;
    return rentalPayments[0];
  }, [rentalPayments]);

  const calculateCountdown = useCallback(() => {
    if (!nextDuePayment) return null;
    const dueDate = parseISO(nextDuePayment.due_date);
    const now = new Date();
    if (isPast(dueDate) && !isToday(dueDate)) return null;
    const hoursRemaining = differenceInHours(dueDate, now);
    const minutesRemaining = differenceInMinutes(dueDate, now) % 60;
    if (hoursRemaining >= 24 || hoursRemaining < 0) return null;
    if (hoursRemaining === 0) return `${Math.max(0, minutesRemaining)}m`;
    return `${hoursRemaining}h`;
  }, [nextDuePayment]);

  useEffect(() => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    const updateCountdown = () => setCountdown(calculateCountdown());
    updateCountdown();
    countdownIntervalRef.current = setInterval(updateCountdown, 60000);
    return () => { if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current); };
  }, [calculateCountdown]);

  const paymentStatus = useMemo(() => {
    if (!rentalPayments.length) return null;
    const overduePayment = rentalPayments.find((p) => {
      const dueDate = parseISO(p.due_date);
      return isPast(dueDate) && !isToday(dueDate);
    });
    const dueTodayPayment = rentalPayments.find((p) => isToday(parseISO(p.due_date)));
    if (overduePayment) return 'overdue';
    if (dueTodayPayment) return 'due_today';
    if (countdown) return 'countdown';
    return null;
  }, [rentalPayments, countdown]);

  useEffect(() => {
    if (previousPaymentStatus !== 'overdue' && paymentStatus === 'overdue') haptic.error();
    setPreviousPaymentStatus(paymentStatus);
  }, [paymentStatus, previousPaymentStatus, haptic]);

  const { financeBadge, financeBadgeVariant } = useMemo(() => {
    if (!activeRental) return { financeBadge: undefined, financeBadgeVariant: 'default' as const };
    if (paymentStatus === 'overdue') return { financeBadge: '!', financeBadgeVariant: 'danger' as const };
    if (paymentStatus === 'due_today') return { financeBadge: '!', financeBadgeVariant: 'warning' as const };
    if (countdown) return { financeBadge: countdown, financeBadgeVariant: 'countdown' as const };
    return { financeBadge: undefined, financeBadgeVariant: 'default' as const };
  }, [activeRental, paymentStatus, countdown]);

  const navItems = useMemo(() => {
    return baseNavItems.map(item => {
      if (item.to === '/driver/finance') {
        return { ...item, badge: financeBadge, badgeVariant: financeBadgeVariant };
      }

      if (item.to !== '/driver/fleet-control' || !activeInspection) return item;

      const s = activeInspection.effective_status;
      // Only badge when driver action is required.
      // approved = done, submitted = waiting on admin -> no urgent badge needed.
      if (s === 'approved' || s === 'submitted') return item;
      const variant: NavItem['badgeVariant'] =
        s === 'rejected' || s === 'overdue' || s === 'blocked' ? 'danger'
        : s === 'pending' ? 'warning'
        : 'default';
      return { ...item, badge: '!', badgeVariant: variant };
    });
  }, [financeBadge, financeBadgeVariant, activeInspection]);

  const handleNavClick = (to: string) => {
    const item = navItems.find((n) => n.to === to);
    const isActive = isNavItemActive(item, location.pathname);
    if (!isActive) haptic.selection();
  };

  const getActiveIndex = () => {
    for (let i = navItems.length - 1; i >= 0; i--) {
      if (isNavItemActive(navItems[i], location.pathname)) return i;
    }
    return location.pathname.startsWith('/driver') ? 0 : -1;
  };

  const activeIndex = getActiveIndex();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 safe-bottom" data-tour="bottom-nav">
      <div className="mx-2 mb-2 sm:mx-3">
        <div className="bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg px-1.5 py-1 sm:px-2">
          <div className="flex items-center justify-between gap-0.5">
            {navItems.map((item, index) => {
              const isActive = index === activeIndex;
              const Icon = item.icon;

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => handleNavClick(item.to)}
                  className="relative flex min-w-0 flex-1 items-center justify-center overflow-visible"
                >
                  <motion.div
                    whileTap={{ scale: 0.85 }}
                    className={cn(
                      'relative flex h-14 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 transition-all duration-200',
                      isActive && 'bg-primary/15',
                      !isActive && 'active:bg-muted/50',
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="nav-glow"
                        className="absolute inset-1 rounded-lg border-2 border-primary/40 sm:rounded-xl"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    
                      <Icon className={cn(
                        'h-5 w-5 shrink-0 transition-all duration-200',
                      isActive && 'text-primary scale-110',
                      !isActive && 'text-muted-foreground',
                      item.badgeVariant === 'danger' && 'text-destructive',
                      item.badgeVariant === 'warning' && 'text-warning',
                      item.badgeVariant === 'countdown' && 'text-orange-500',
                    )} />

                    <span className={cn(
                      'max-w-full truncate text-[10px] font-semibold leading-none',
                      isActive ? 'text-primary' : 'text-muted-foreground',
                      item.badgeVariant === 'danger' && 'text-destructive',
                      item.badgeVariant === 'warning' && 'text-warning',
                    )}>
                      {item.label}
                    </span>

                    <AnimatePresence>
                      {isActive && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          className="absolute -bottom-0.5 h-1.5 w-1.5 rounded-full bg-primary"
                        />
                      )}
                    </AnimatePresence>

                    {item.badge && (
                      <span className={cn(
                        'absolute -top-0.5 -right-0.5 flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-bold',
                        item.badgeVariant === 'danger' && 'bg-destructive text-destructive-foreground animate-pulse',
                        item.badgeVariant === 'warning' && 'bg-warning text-warning-foreground animate-pulse',
                        item.badgeVariant === 'countdown' && 'bg-orange-500 text-white',
                        (!item.badgeVariant || item.badgeVariant === 'default') && 'bg-primary text-primary-foreground',
                      )}>
                        {item.badge}
                      </span>
                    )}
                  </motion.div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}

function isNavItemActive(item: NavItem | undefined, pathname: string) {
  if (!item) return false;
  if (item.to === '/driver') {
    return pathname === '/driver' || pathname === '/driver-dashboard' || pathname === '/driver/home';
  }
  if (pathname === item.to || pathname.startsWith(`${item.to}/`)) return true;
  return item.activeWhen?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ?? false;
}
