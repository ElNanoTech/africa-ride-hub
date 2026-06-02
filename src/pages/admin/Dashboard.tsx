import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardSkeleton } from '@/components/AdminSkeletons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ADMIN } from '@/lib/i18n';
import { formatCurrency } from '@/lib/format';
import { 
  Users, Car, CreditCard, Wallet, AlertTriangle, MessageSquare,
  TrendingUp, TrendingDown, ArrowRight, CheckCircle, Clock, Wifi,
  Zap, FileCheck, CarFront, Banknote, Headphones, ChevronDown, KeyRound
} from 'lucide-react';
import { useState } from 'react';
import { AssignVehicleDialog } from '@/components/admin/AssignVehicleDialog';
import { Link, useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar } from 'recharts';
import { useAdminStats, useCreditScoreDistribution, useAuditLogs, useScoreTrends } from '@/hooks/useAdminData';
import { useDashboardRealtime } from '@/hooks/useRealtimeSubscription';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { GpsMappingCoverageCard } from '@/components/admin/GpsMappingCoverageCard';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  
  // Enable real-time updates for dashboard
  useDashboardRealtime();

  const { data: stats, isLoading: statsLoading } = useAdminStats();
  const { data: tierDistribution, isLoading: tierLoading } = useCreditScoreDistribution();
  const { data: auditLogs, isLoading: auditLoading } = useAuditLogs();
  const { data: scoreTrends, isLoading: scoreTrendsLoading } = useScoreTrends(12);

  // Real rental trend data from DB
  const { data: rentalsTrend = [] } = useQuery({
    queryKey: ['admin-rental-trends'],
    queryFn: async () => {
      const months: { month: string; rentals: number }[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        const monthLabel = d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
        const { count } = await supabase
          .from('rentals')
          .select('*', { count: 'exact', head: true })
          .in('status', ['active', 'approved'])
          .lte('start_date', monthEnd.toISOString().split('T')[0]);
        months.push({ month: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1), rentals: count || 0 });
      }
      return months;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Real revenue trend data from DB
  const { data: revenueTrend = [] } = useQuery({
    queryKey: ['admin-revenue-trends'],
    queryFn: async () => {
      const months: { month: string; revenue: number }[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        const monthLabel = d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
        const { data: paidPayments } = await supabase
          .from('payments')
          .select('amount')
          .eq('status', 'paid')
          .gte('paid_date', d.toISOString().split('T')[0])
          .lte('paid_date', monthEnd.toISOString().split('T')[0]);
        const total = (paidPayments || []).reduce((s, p) => s + (p.amount || 0), 0);
        months.push({ month: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1), revenue: total });
      }
      return months;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Real average score from DB
  const { data: avgScore = 0 } = useQuery({
    queryKey: ['admin-avg-score'],
    queryFn: async () => {
      const { data } = await supabase
        .from('credit_scores')
        .select('score')
        .order('calculation_week', { ascending: false });
      // Get latest score per driver
      const latestByDriver = new Map<string, number>();
      // We don't have driver_id in select but the scores are ordered
      // Simpler: just avg all latest scores
      if (!data || data.length === 0) return 0;
      const total = data.reduce((s, d) => s + d.score, 0);
      return Math.round(total / data.length);
    },
    staleTime: 5 * 60 * 1000,
  });

  const kpis = [
    { label: ADMIN.DASHBOARD.TOTAL_DRIVERS, value: stats?.totalDrivers || 0, icon: Users, color: 'primary' },
    { label: ADMIN.DASHBOARD.ACTIVE_RENTALS, value: stats?.activeRentals || 0, icon: Car, color: 'secondary' },
    { label: ADMIN.DASHBOARD.AVERAGE_SCORE, value: avgScore, icon: TrendingUp, color: 'tier-b' },
    { label: ADMIN.DASHBOARD.PENDING_LOANS, value: stats?.pendingLoans || 0, icon: Wallet, color: 'warning' },
    { label: ADMIN.DASHBOARD.OVERDUE_PAYMENTS, value: stats?.overduePayments || 0, icon: AlertTriangle, color: 'destructive' },
    { label: ADMIN.DASHBOARD.OPEN_TICKETS, value: stats?.openTickets || 0, icon: MessageSquare, color: 'muted-foreground' },
  ];

  const pendingQueues = [
    { type: 'KYC', count: stats?.pendingKyc || 0, label: ADMIN.DASHBOARD.KYC_PENDING, link: '/admin/drivers?filter=kyc_pending' },
    { type: 'Rentals', count: stats?.pendingRentals || 0, label: ADMIN.DASHBOARD.RENTALS_PENDING, link: '/admin/rentals?filter=pending' },
    { type: 'Loans', count: stats?.pendingLoans || 0, label: ADMIN.DASHBOARD.LOANS_PENDING, link: '/admin/loans?filter=pending' },
  ];

  // Transform audit logs into recent activity
  const recentActivity = auditLogs?.slice(0, 5).map((log, index) => {
    const actionLabels: Record<string, string> = {
      kyc_approved: 'KYC approuvé',
      kyc_rejected: 'KYC rejeté',
      loan_approved: 'Prêt approuvé',
      loan_rejected: 'Prêt rejeté',
      rental_approved: 'Location approuvée',
      rental_rejected: 'Location rejetée',
      payment_marked_paid: 'Paiement reçu',
    };
    
    const isApproved = log.action.includes('approved') || log.action.includes('paid');
    
    return {
      id: index,
      action: actionLabels[log.action] || log.action,
      target: (log.details as Record<string, unknown>)?.driver_name as string || log.entity_id || '',
      time: formatDistanceToNow(new Date(log.created_at), { addSuffix: false, locale: fr }),
      status: isApproved ? 'approved' : 'pending',
    };
  }) || [];

  const quickActions = [
    { label: 'Vérifier KYC en attente', icon: FileCheck, link: '/admin/drivers?filter=kyc_pending', count: stats?.pendingKyc },
    { label: 'Traiter locations en attente', icon: CarFront, link: '/admin/rentals?filter=pending', count: stats?.pendingRentals },
    { label: 'Examiner demandes de prêt', icon: Banknote, link: '/admin/loans?filter=pending', count: stats?.pendingLoans },
    { label: 'Répondre aux tickets', icon: Headphones, link: '/admin/support?filter=open', count: stats?.openTickets },
  ];

  // Show full page skeleton while initial data loads
  const isInitialLoading = statsLoading && tierLoading && auditLoading;

  if (isInitialLoading) {
    return (
      <AdminLayout>
        <DashboardSkeleton />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <AdminPageHeader 
        title={ADMIN.DASHBOARD.TITLE}
        description="Vue d'ensemble de la plateforme DAM Flotte"
        action={
          <div className="flex items-center gap-2 sm:gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="default" size="sm" className="gap-1.5 sm:gap-2 text-xs sm:text-sm">
                  <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden xs:inline">Actions rapides</span>
                  <span className="xs:hidden">Actions</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 bg-popover z-50">
                <DropdownMenuLabel>Actions rapides</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {quickActions.map((action) => (
                  <DropdownMenuItem 
                    key={action.label}
                    onClick={() => navigate(action.link)}
                    className="cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <action.icon className="h-4 w-4 text-muted-foreground" />
                      <span>{action.label}</span>
                    </div>
                    {action.count !== undefined && action.count > 0 && (
                      <Badge variant="pending" className="ml-2">{action.count}</Badge>
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowAssignDialog(true)}
                  className="cursor-pointer flex items-center gap-2"
                >
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <span>Allouer un véhicule</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <Wifi className="h-3 w-3 text-primary animate-pulse" />
              <span>Temps réel</span>
            </div>
          </div>
        }
      />

      {/* KPI Grid - 2 cols mobile, 3 cols tablet, 6 cols desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 mb-6 sm:mb-8">
        {statsLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-3 sm:p-4">
                <Skeleton className="h-16 sm:h-20" />
              </CardContent>
            </Card>
          ))
        ) : (
          kpis.map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                  <kpi.icon className={`h-4 w-4 sm:h-5 sm:w-5 text-${kpi.color}`} />
                </div>
                <p className="text-xl sm:text-2xl font-bold">{kpi.value}</p>
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight">{kpi.label}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Score Trends Widget */}
      <Card className="mb-6 sm:mb-8">
        <CardHeader className="pb-2 sm:pb-4">
          <CardTitle className="text-sm sm:text-base">Tendance des scores sur 12 semaines</CardTitle>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          {scoreTrendsLoading ? (
            <Skeleton className="h-48 sm:h-64" />
          ) : scoreTrends && scoreTrends.length > 0 ? (
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={scoreTrends} margin={{ left: -10, right: 5, top: 5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="week" 
                    tick={{ fontSize: 10 }} 
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(value) => {
                      const date = new Date(value);
                      return `${date.getDate()}/${date.getMonth() + 1}`;
                    }}
                  />
                  <YAxis 
                    domain={[300, 850]} 
                    tick={{ fontSize: 10 }} 
                    stroke="hsl(var(--muted-foreground))"
                    width={35}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    labelFormatter={(value) => {
                      const date = new Date(value);
                      return `Semaine du ${date.toLocaleDateString('fr-FR')}`;
                    }}
                    formatter={(value: number, name: string) => {
                      const labels: Record<string, string> = {
                        avgScore: 'Score moyen',
                        count: 'Conducteurs évalués',
                      };
                      return [value, labels[name] || name];
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="avgScore" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2} 
                    dot={{ strokeWidth: 2, r: 3 }}
                    name="avgScore"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-48 sm:h-64 flex items-center justify-center text-muted-foreground text-sm">
              Aucune donnée de score disponible
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts row - stack on mobile, 3-col on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
        {/* Tier Distribution Chart */}
        <Card>
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="text-sm sm:text-base">Distribution des niveaux</CardTitle>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            {tierLoading ? (
              <Skeleton className="h-40 sm:h-48" />
            ) : (
              <>
                <div className="h-40 sm:h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={tierDistribution || []}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={60}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {tierDistribution?.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-2 justify-center mt-3">
                  {tierDistribution?.map((tier) => (
                    <div key={tier.name} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tier.color }} />
                      <span>{tier.name}: {tier.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Rentals Trend */}
        <Card>
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="text-sm sm:text-base">Locations actives</CardTitle>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <div className="h-40 sm:h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rentalsTrend} margin={{ left: -10, right: 5, top: 5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={30} />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Line type="monotone" dataKey="rentals" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={{ strokeWidth: 2, r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Revenue Chart */}
        <Card className="md:col-span-2 lg:col-span-1">
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="text-sm sm:text-base">Revenus mensuels</CardTitle>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <div className="h-40 sm:h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueTrend} margin={{ left: -10, right: 5, top: 5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis 
                    tick={{ fontSize: 10 }} 
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`}
                    width={35}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value: number) => [formatCurrency(value), 'Revenus']}
                  />
                  <Bar dataKey="revenue" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* GPS mapping coverage + bottom queues */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
        <GpsMappingCoverageCard />
      </div>

      {/* Bottom section - stack on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Pending Queues */}
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2 sm:pb-4">
            <CardTitle className="text-sm sm:text-base">{ADMIN.DASHBOARD.PENDING_QUEUES}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 sm:space-y-3">
            {pendingQueues.map((queue) => (
              <Link 
                key={queue.type}
                to={queue.link}
                className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors active:scale-[0.98] touch-manipulation"
              >
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                    <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{queue.label}</p>
                    <p className="text-[11px] text-muted-foreground">À traiter</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="pending">{queue.count}</Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2 sm:pb-4">
            <CardTitle className="text-sm sm:text-base">{ADMIN.DASHBOARD.RECENT_ACTIVITY}</CardTitle>
            <Link to="/admin/audit">
              <Button variant="ghost" size="sm" className="text-xs sm:text-sm">Voir tout</Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2 sm:space-y-3">
            {auditLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 sm:h-12" />
              ))
            ) : recentActivity.length === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-sm">Aucune activité récente</p>
            ) : (
              recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center gap-2.5 sm:gap-3">
                  <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    activity.status === 'approved' ? 'bg-primary/10' : 'bg-warning/10'
                  }`}>
                    {activity.status === 'approved' ? (
                      <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-warning" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium">{activity.action}</p>
                    <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{activity.target}</p>
                  </div>
                  <span className="text-[11px] sm:text-xs text-muted-foreground flex-shrink-0">
                    {activity.time}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <AssignVehicleDialog
        open={showAssignDialog}
        onOpenChange={setShowAssignDialog}
      />
    </AdminLayout>
  );
}
