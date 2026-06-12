import { Link, useLocation } from 'react-router-dom';
import { Home, Star, Car, User, Banknote, KeyRound, AlertTriangle, Clock, Wallet, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useDriverRentals } from '@/hooks/useDriverData';
import { useDriverActiveInspection } from '@/hooks/useDriverActiveInspection';
import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { differenceInDays, isToday, isPast, parseISO, differenceInHours, differenceInMinutes } from 'date-fns';
import { supabase } from '@/integrations/supabase/routeClient';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  badgeVariant?: 'default' | 'warning' | 'danger' | 'countdown';
  isNew?: boolean;
}

const baseNavItems: NavItem[] = [
  { to: '/driver', icon: Home },
  { to: '/driver/score', icon: Star },
  { to: '/driver/income', icon: Banknote },
  { to: '/driver/vehicles', icon: Car },
  { to: '/driver/fleet-control', icon: ClipboardCheck },
  { to: '/driver/loans', icon: Wallet },
  { to: '/driver/sinistres', icon: AlertTriangle },
  { to: '/driver/profile', icon: User },
];

export function BottomNav() {
  const location = useLocation();
  const haptic = useHapticFeedback();
  const { data: rentals = [] } = useDriverRentals();
  const { data: activeInspection } = useDriverActiveInspection();
  const [showNewAnimation, setShowNewAnimation] = useState(false);
  const [previousHadRental, setPreviousHadRental] = useState<boolean | null>(null);
  const [previousPaymentStatus, setPreviousPaymentStatus] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeRental = useMemo(() => 
    rentals.find((r: any) => r.status === 'active'),
    [rentals]
  );

  const hasActiveRental = !!activeRental;

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
      return data || [];
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
    const overduePayment = rentalPayments.find((p: any) => {
      const dueDate = parseISO(p.due_date);
      return isPast(dueDate) && !isToday(dueDate);
    });
    const dueTodayPayment = rentalPayments.find((p: any) => isToday(parseISO(p.due_date)));
    if (overduePayment) return 'overdue';
    if (dueTodayPayment) return 'due_today';
    if (countdown) return 'countdown';
    return null;
  }, [rentalPayments, countdown]);

  useEffect(() => {
    if (previousPaymentStatus !== 'overdue' && paymentStatus === 'overdue') haptic.error();
    setPreviousPaymentStatus(paymentStatus);
  }, [paymentStatus, previousPaymentStatus, haptic]);

  const { rentalBadge, badgeVariant } = useMemo(() => {
    if (!activeRental) return { rentalBadge: undefined, badgeVariant: 'default' as const };
    if (paymentStatus === 'overdue') return { rentalBadge: '!', badgeVariant: 'danger' as const };
    if (paymentStatus === 'due_today') return { rentalBadge: '!', badgeVariant: 'warning' as const };
    if (countdown) return { rentalBadge: countdown, badgeVariant: 'countdown' as const };
    const daysActive = differenceInDays(new Date(), new Date(activeRental.start_date));
    if (daysActive === 0) return { rentalBadge: '✨', badgeVariant: 'default' as const };
    return { rentalBadge: `${daysActive}`, badgeVariant: 'default' as const };
  }, [activeRental, paymentStatus, countdown]);

  useEffect(() => {
    if (previousHadRental === false && hasActiveRental) {
      setShowNewAnimation(true);
      const timer = setTimeout(() => setShowNewAnimation(false), 3000);
      return () => clearTimeout(timer);
    }
    setPreviousHadRental(hasActiveRental);
  }, [hasActiveRental, previousHadRental]);

  const getRentalIcon = () => {
    if (paymentStatus === 'overdue' || paymentStatus === 'due_today') return AlertTriangle;
    if (countdown) return Clock;
    return KeyRound;
  };

  const navItems = useMemo(() => {
    const withControl = baseNavItems.map(item => {
      if (item.to !== '/driver/fleet-control') return item;
      if (!activeInspection) return item;
      const s = activeInspection.effective_status;
      const variant: NavItem['badgeVariant'] =
        s === 'rejected' || s === 'overdue' || s === 'blocked' ? 'danger'
        : s === 'pending' ? 'warning'
        : 'default';
      return { ...item, badge: '!', badgeVariant: variant };
    });
    if (!hasActiveRental) return withControl;
    const items: NavItem[] = [...withControl];
    items.splice(items.length - 1, 0, {
      to: '/driver/rental',
      icon: getRentalIcon(),
      badge: rentalBadge,
      badgeVariant,
      isNew: showNewAnimation,
    });
    return items;
  }, [hasActiveRental, rentalBadge, badgeVariant, showNewAnimation, paymentStatus, countdown, activeInspection]);

  const handleNavClick = (to: string) => {
    const isActive = location.pathname === to || 
      (to !== '/driver' && location.pathname.startsWith(to));
    if (!isActive) haptic.selection();
  };

  const getActiveIndex = () => {
    for (let i = navItems.length - 1; i >= 0; i--) {
      const item = navItems[i];
      if (location.pathname === item.to || 
          (item.to !== '/driver' && location.pathname.startsWith(item.to))) {
        return i;
      }
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
                      'relative flex h-10 w-full min-w-0 items-center justify-center rounded-xl px-1 transition-all duration-200 sm:h-14 sm:max-w-14 sm:px-0 sm:rounded-2xl',
                      isActive && 'bg-primary/15',
                      !isActive && 'active:bg-muted/50',
                      item.isNew && 'animate-bounce'
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
                        'h-4.5 w-4.5 shrink-0 transition-all duration-200 sm:h-6 sm:w-6',
                      isActive && 'text-primary scale-110',
                      !isActive && 'text-muted-foreground',
                      item.badgeVariant === 'danger' && 'text-destructive',
                      item.badgeVariant === 'warning' && 'text-warning',
                      item.badgeVariant === 'countdown' && 'text-orange-500',
                      item.isNew && 'text-primary',
                    )} />

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
