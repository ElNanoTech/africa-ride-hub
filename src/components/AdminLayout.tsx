import { ReactNode, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AdminNotifications } from './AdminNotifications';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, Users, Car, FileText, Wallet, CreditCard, 
  Settings, LogOut, Menu, ChevronLeft, BarChart3, MessageSquare,
  Shield, Bell, LucideIcon, UserCog, Sun, Moon, TrendingUp, X, MapPin, RefreshCw, Flag, Building2, Play, Banknote, ShieldAlert, Activity
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { NAV, AUTH, ADMIN } from '@/lib/i18n';
import { toast } from 'sonner';
import { supabaseAdmin as supabase } from '@/integrations/supabase/clients';
import { LoadingState } from './LoadingState';
import { User } from '@supabase/supabase-js';
import { logAction } from '@/hooks/useAuditLog';
import { useTheme } from 'next-themes';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import damFlotteLogo from '@/assets/dam-flotte-logo.png';
import { useIsMobile } from '@/hooks/use-mobile';
import { PullToRefresh } from './PullToRefresh';
import { AdminFAB } from './AdminFAB';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminSwipeNavigation } from '@/hooks/useAdminSwipeNavigation';
import { usePendingKycCount } from '@/hooks/useAdminData';
import { checkIsAdminWithRetry } from '@/lib/adminAuthCheck';
import { installFocusRefresh, verifySignOut } from '@/lib/adminSessionGuard';

// Role badge configuration
const getRoleBadgeConfig = (roleKey: string) => {
  switch (roleKey) {
    case 'super_admin':
      return { label: 'Super Admin', className: 'bg-destructive/15 text-destructive border-destructive/30' };
    case 'manager':
      return { label: 'Manager', className: 'bg-primary/15 text-primary border-primary/30' };
    case 'agent_pret':
      return { label: 'Agent Prêt', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' };
    case 'agent_support':
      return { label: 'Agent Support', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' };
    default:
      return { label: roleKey?.replace(/_/g, ' ') || 'Admin', className: 'bg-muted text-muted-foreground' };
  }
};

// Route order for determining animation direction
const ADMIN_ROUTE_ORDER = [
  '/admin',
  '/admin/drivers',
  '/admin/vehicles',
  '/admin/vehicles/gps-mapping',
  '/admin/tracking',
  '/admin/driving-behavior',
  '/admin/platform-sync',
  '/admin/rentals',
  '/admin/loans',
  '/admin/payments',
  '/admin/support',
  '/admin/scoring',
  '/admin/analytics',
  '/admin/audit',
  '/admin/users',
  '/admin/settings',
];

function getAdminRouteIndex(pathname: string): number {
  const exactIndex = ADMIN_ROUTE_ORDER.indexOf(pathname);
  if (exactIndex !== -1) return exactIndex;

  for (let i = ADMIN_ROUTE_ORDER.length - 1; i >= 0; i--) {
    if (ADMIN_ROUTE_ORDER[i] !== '/admin' && pathname.startsWith(ADMIN_ROUTE_ORDER[i])) {
      return i;
    }
  }

  if (pathname.startsWith('/admin')) return 0;
  return -1;
}

let previousAdminRouteIndex = 0;
interface AdminLayoutProps {
  children: ReactNode;
}

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  role_key: string;
  roles: string[]; // For backwards compatibility
}

type AppRole = 'super_admin' | 'manager' | 'agent_pret' | 'agent_support';

interface SidebarItem {
  to: string;
  icon: LucideIcon;
  label: string;
  exact?: boolean;
  allowedRoles: AppRole[];
  badgeKey?: 'pendingKyc'; // Key to get badge count
  section?: 'operations' | 'gestion' | 'analyse' | 'systeme';
}

// Role-based menu configuration
const sidebarItems: SidebarItem[] = [
  { 
    to: '/admin', 
    icon: LayoutDashboard, 
    label: ADMIN.DASHBOARD.TITLE, 
    exact: true,
    allowedRoles: ['super_admin', 'manager'],
    section: 'operations',
  },
  { 
    to: '/admin/drivers', 
    icon: Users, 
    label: NAV.DRIVERS,
    allowedRoles: ['super_admin', 'manager'],
    badgeKey: 'pendingKyc', // Show pending KYC count
    section: 'operations',
  },
  { 
    to: '/admin/vehicles', 
    icon: Car, 
    label: NAV.VEHICLES,
    allowedRoles: ['super_admin', 'manager'],
    exact: true,
    section: 'operations',
  },
  { 
    to: '/admin/vehicles/gps-mapping', 
    icon: MapPin, 
    label: 'Mapping GPS',
    allowedRoles: ['super_admin', 'manager'],
    section: 'operations',
  },
  { 
    to: '/admin/tracking', 
    icon: MapPin, 
    label: 'Suivi GPS',
    allowedRoles: ['super_admin', 'manager'],
    section: 'operations',
  },
  { 
    to: '/admin/driving-behavior', 
    icon: Activity, 
    label: 'Conduite',
    allowedRoles: ['super_admin', 'manager'],
    section: 'operations',
  },
  {
    to: '/admin/platform-sync', 
    icon: RefreshCw, 
    label: 'Sync Plateformes',
    allowedRoles: ['super_admin', 'manager'],
    section: 'operations',
  },
  { 
    to: '/admin/rentals', 
    icon: FileText, 
    label: NAV.RENTALS,
    allowedRoles: ['super_admin', 'manager'],
    section: 'gestion',
  },
  { 
    to: '/admin/loans', 
    icon: Wallet, 
    label: NAV.LOANS,
    allowedRoles: ['super_admin', 'manager', 'agent_pret'],
    section: 'gestion',
  },
  { 
    to: '/admin/payments', 
    icon: CreditCard, 
    label: NAV.PAYMENTS,
    allowedRoles: ['super_admin', 'manager'],
    section: 'gestion',
  },
  {
    to: '/admin/billing',
    icon: FileText,
    label: 'Facturation',
    allowedRoles: ['super_admin', 'manager'],
    section: 'gestion',
  },
  {
    to: '/admin/billing/wallets',
    icon: Wallet,
    label: 'Portefeuilles',
    allowedRoles: ['super_admin', 'manager'],
    section: 'gestion',
  },
  { 
    to: '/admin/support', 
    icon: MessageSquare, 
    label: NAV.SUPPORT,
    allowedRoles: ['super_admin', 'manager', 'agent_support'],
    section: 'gestion',
  },
  { 
    to: '/admin/scoring', 
    icon: BarChart3, 
    label: ADMIN.SCORING.TITLE,
    allowedRoles: ['super_admin', 'manager'],
    section: 'analyse',
  },
  { 
    to: '/admin/analytics', 
    icon: TrendingUp, 
    label: 'Analytique',
    allowedRoles: ['super_admin', 'manager'],
    section: 'analyse',
  },
  { 
    to: '/admin/audit', 
    icon: Shield, 
    label: NAV.AUDIT,
    allowedRoles: ['super_admin'],
    section: 'systeme',
  },
  { 
    to: '/admin/users', 
    icon: UserCog, 
    label: 'Administrateurs',
    allowedRoles: ['super_admin'],
    section: 'systeme',
  },
  { 
    to: '/admin/settings', 
    icon: Settings, 
    label: NAV.SETTINGS,
    allowedRoles: ['super_admin'],
    section: 'systeme',
  },
  { 
    to: '/admin/feature-flags', 
    icon: Flag, 
    label: 'Feature Flags',
    allowedRoles: ['super_admin'],
    section: 'systeme',
  },
  { 
    to: '/admin/customers', 
    icon: Building2, 
    label: 'Clients',
    allowedRoles: ['super_admin'], // Platform owners only, checked via RLS
    section: 'systeme',
  },
  { 
    to: '/admin/income-entry', 
    icon: Banknote, 
    label: 'Saisie revenus',
    allowedRoles: ['super_admin', 'manager'], // For Yango-independence fallback
    section: 'gestion',
  },
  { 
    to: '/admin/income-approvals', 
    icon: FileText, 
    label: 'Approbations',
    allowedRoles: ['super_admin', 'manager'],
    section: 'gestion',
  },
  {
    to: '/admin/sinistres',
    icon: ShieldAlert,
    label: 'Sinistres',
    allowedRoles: ['super_admin', 'manager'],
    section: 'gestion',
  },

];

// Helper to check if user has access to a menu item
const hasAccess = (userRoleKey: string, allowedRoles: AppRole[]): boolean => {
  return allowedRoles.includes(userRoleKey as AppRole);
};

export function AdminLayout({ children }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const loginLoggedRef = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  
  // Fetch pending KYC count for badge
  const { data: pendingKycCount = 0 } = usePendingKycCount();
  
  // Calculate animation direction based on route
  const currentIndex = getAdminRouteIndex(location.pathname);
  const direction = currentIndex >= previousAdminRouteIndex ? 1 : -1;
  
  // Update previous index for next navigation
  useEffect(() => {
    if (currentIndex !== -1) {
      previousAdminRouteIndex = currentIndex;
    }
  }, [currentIndex]);

  // Swipe navigation disabled — caused conflicts with table scrolling on mobile
  useAdminSwipeNavigation({ enabled: false });

  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
    toast.success('Données actualisées');
  }, [queryClient]);

  // Close sidebar on route change for mobile
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [location.pathname, isMobile]);

  useEffect(() => {
    let cancelled = false;
    // Track consecutive transient is_admin failures so we only redirect to
    // /admin/login after a real failure threshold (not a single hiccup).
    let transientFailureCount = 0;
    const MAX_TRANSIENT_FAILURES = 3;

    const loadAdminProfile = async (sessionUser: User) => {
      try {
        if (cancelled) return;
        setUser(sessionUser);

        const result = await checkIsAdminWithRetry(sessionUser.id);
        if (cancelled) return;

        if (!result.ok) {
          // Transient (network/RPC) failure even after retries.
          transientFailureCount += 1;
          console.warn(
            `[AdminLayout] is_admin transient failure ${transientFailureCount}/${MAX_TRANSIENT_FAILURES}:`,
            result.error,
          );
          if (transientFailureCount >= MAX_TRANSIENT_FAILURES) {
            toast.error('Connexion instable. Veuillez vous reconnecter.');
            navigate('/admin/login');
          } else {
            // Stop the loading spinner so the admin can keep using the page
            // they're already authorised on; we'll re-check on next SIGNED_IN.
            setIsLoading(false);
          }
          return;
        }

        // Definitive answer received — reset the transient counter.
        transientFailureCount = 0;

        if (!result.isAdmin) {
          toast.error('Accès refusé');
          await supabase.auth.signOut();
          navigate('/admin/login');
          return;
        }

        const { data: adminData } = await supabase
          .from('admin_users')
          .select('id, email, full_name, is_active, role_key')
          .eq('user_id', sessionUser.id)
          .single();

        if (cancelled) return;

        if (adminData) {
          setAdminUser({
            id: adminData.id,
            email: adminData.email,
            full_name: adminData.full_name,
            is_active: adminData.is_active,
            role_key: adminData.role_key || 'manager',
            roles: [adminData.role_key || 'manager'],
          });

          if (!loginLoggedRef.current) {
            loginLoggedRef.current = true;
            logAction({
              action: 'admin_login',
              targetType: 'session',
              targetId: adminData.id,
              details: { email: adminData.email },
            });
          }
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Auth check error:', error);
        if (!cancelled) setIsLoading(false);
      }
    };

    // 1. Subscribe FIRST so we don't miss the SIGNED_IN event that fires
    //    right after redirect from /admin/login (race condition on mobile
    //    browsers where getSession() resolves before the token is persisted).
    //    We only react to explicit SIGNED_OUT and to (re)hydration events
    //    (SIGNED_IN / INITIAL_SESSION). TOKEN_REFRESHED is intentionally
    //    ignored — the existing in-memory profile remains valid and reloading
    //    on every refresh caused intermittent sign-outs on flaky networks.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        // Verify with one getSession() round-trip before redirecting:
        // Supabase emits phantom SIGNED_OUT events on refresh-token rotation
        // races and brief offline windows. See src/lib/adminSessionGuard.ts.
        verifySignOut().then((reallyOut) => {
          if (cancelled) return;
          if (reallyOut) {
            navigate('/admin/login');
          }
        });
        return;
      }
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        // Defer to avoid running inside the auth callback (Supabase guidance).
        setTimeout(() => loadAdminProfile(session.user), 0);
      }
    });

    // Proactively refresh JWT when the admin tab regains focus, so long-idle
    // tabs don't wake up with an expired access token (which previously
    // produced a SIGNED_OUT bounce on the next API call).
    const cleanupFocus = installFocusRefresh();

    // 2. Then check the existing session for the very first render.
    //    INITIAL_SESSION will also fire and trigger loadAdminProfile, but
    //    calling it eagerly here avoids waiting on the listener round-trip
    //    on cold loads where the token is already in storage.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session?.user) {
        navigate('/admin/login');
        return;
      }
      loadAdminProfile(session.user);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      cleanupFocus();
    };
  }, [navigate]);

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  // Filter menu items based on user role_key
  const filteredSidebarItems = useMemo(() => {
    if (!adminUser?.role_key) return [];
    return sidebarItems.filter(item => hasAccess(adminUser.role_key, item.allowedRoles));
  }, [adminUser?.role_key]);

  const handleLogout = async () => {
    try {
      // Log logout before signing out
      if (adminUser) {
        logAction({
          action: 'admin_logout',
          targetType: 'session',
          targetId: adminUser.id,
          details: { email: adminUser.email },
        });
      }
      await supabase.auth.signOut();
      toast.success('Déconnexion réussie');
      navigate('/admin/login');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Erreur lors de la déconnexion');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingState message="Vérification des droits d'accès..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile Overlay Backdrop */}
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Desktop: always visible, Mobile: slide-in overlay */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen bg-sidebar text-sidebar-foreground flex flex-col z-50',
          'transition-all duration-300 ease-out',
          // Desktop behavior
          !isMobile && (collapsed ? 'w-16' : 'w-64'),
          // Mobile behavior - full width overlay
          isMobile && 'w-[85vw] max-w-[320px] shadow-2xl',
          isMobile && (sidebarOpen ? 'translate-x-0' : '-translate-x-full')
        )}
      >
        {/* Logo & Close */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border safe-top">
          <Link to="/admin" className="flex items-center gap-3">
            <img src={damFlotteLogo} alt="DAM Flotte" className="w-9 h-9 rounded-xl object-contain" />
            {(!collapsed || isMobile) && (
              <span className="font-semibold text-lg tracking-tight">DAM Flotte</span>
            )}
          </Link>
          {isMobile ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(false)}
              className="text-sidebar-foreground hover:bg-sidebar-accent -mr-2 h-10 w-10"
            >
              <X className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed(!collapsed)}
              className="text-sidebar-foreground hover:bg-sidebar-accent"
            >
              {collapsed ? <Menu className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </Button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto overscroll-contain">
          <ul className="space-y-1 px-3">
            {filteredSidebarItems.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={() => isMobile && setSidebarOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 relative',
                    'active:scale-[0.98] touch-manipulation',
                    isActive(item.to, item.exact)
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent active:bg-sidebar-accent'
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {(!collapsed || isMobile) && (
                    <span className="text-[15px] font-medium flex-1">{item.label}</span>
                  )}
                  {/* Badge for pending items */}
                  {item.badgeKey === 'pendingKyc' && pendingKycCount > 0 && (
                    <Badge 
                      variant="destructive" 
                      className={cn(
                        "h-5 min-w-5 px-1.5 text-xs font-bold animate-pulse",
                        collapsed && !isMobile && "absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px]"
                      )}
                    >
                      {pendingKycCount > 99 ? '99+' : pendingKycCount}
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* User & Logout */}
        <div className="p-4 border-t border-sidebar-border safe-bottom space-y-3">
          {/* Mobile Role Badge */}
          {isMobile && adminUser?.role_key && (
            <div className="flex items-center gap-3 px-4 py-2">
              <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center">
                <span className="text-sm font-semibold">
                  {adminUser?.full_name?.charAt(0) || 'A'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{adminUser?.full_name || 'Admin'}</p>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "h-5 px-2 text-[10px] font-medium border mt-0.5",
                    getRoleBadgeConfig(adminUser.role_key).className
                  )}
                >
                  <Shield className="h-2.5 w-2.5 mr-1" />
                  {getRoleBadgeConfig(adminUser.role_key).label}
                </Badge>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className={cn(
              'flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all duration-200',
              'text-sidebar-foreground hover:bg-sidebar-accent active:bg-sidebar-accent',
              'active:scale-[0.98] touch-manipulation'
            )}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {(!collapsed || isMobile) && (
              <span className="text-[15px] font-medium">{AUTH.LOGOUT}</span>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn(
        'flex-1 transition-all duration-300 min-w-0',
        !isMobile && (collapsed ? 'ml-16' : 'ml-64'),
        isMobile && 'ml-0'
      )}>
        {/* Top Bar */}
        <header className={cn(
          'h-14 md:h-16 bg-card/80 backdrop-blur-xl border-b border-border',
          'flex items-center justify-between px-4 md:px-6 sticky top-0 z-30',
          'safe-top'
        )}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (isMobile) {
                setSidebarOpen(true);
                return;
              }
              setCollapsed((prev) => !prev);
            }}
            className="h-10 w-10 -ml-2"
            aria-label={isMobile ? 'Ouvrir le menu' : collapsed ? 'Développer le menu' : 'Réduire le menu'}
          >
            <Menu className="h-5 w-5" />
          </Button>
          
          <div className="flex items-center gap-2 md:gap-4">
            {/* Theme Toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className="text-muted-foreground hover:text-foreground h-10 w-10"
                  >
                    {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <AdminNotifications />
            <div className="flex items-center gap-2 md:gap-3">
              {/* Role Badge - visible on all screens */}
              {adminUser?.role_key && (
                <Badge 
                  variant="outline" 
                  className={cn(
                    "hidden sm:flex h-6 px-2.5 text-xs font-medium border",
                    getRoleBadgeConfig(adminUser.role_key).className
                  )}
                >
                  <Shield className="h-3 w-3 mr-1.5" />
                  {getRoleBadgeConfig(adminUser.role_key).label}
                </Badge>
              )}
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center ring-2 ring-primary/20">
                <span className="text-sm font-semibold text-primary">
                  {adminUser?.full_name?.charAt(0) || 'A'}
                </span>
              </div>
              <div className="text-sm hidden md:block">
                <p className="font-medium leading-tight">{adminUser?.full_name || 'Admin'}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content with animations on mobile */}
        {isMobile ? (
          <PullToRefresh 
            onRefresh={handleRefresh}
            className="h-[calc(100vh-3.5rem)] safe-bottom"
          >
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={location.pathname}
                custom={direction}
                initial={{ x: direction > 0 ? '12%' : '-12%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction > 0 ? '-12%' : '12%', opacity: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 40,
                  mass: 0.8,
                }}
                className="p-4 min-h-full"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </PullToRefresh>
        ) : (
          <div className="p-4 md:p-6">
            {children}
          </div>
        )}
        
        
        {/* Floating action button for quick actions */}
        {isMobile && <AdminFAB />}
      </main>
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function AdminPageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold truncate">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{description}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
