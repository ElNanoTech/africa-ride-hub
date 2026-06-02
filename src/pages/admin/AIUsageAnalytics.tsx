import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Bot, 
  FileSearch, 
  TrendingUp, 
  Brain, 
  Activity,
  Zap,
  Clock,
  AlertTriangle,
  BarChart3
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useState } from 'react';

const FEATURE_ICONS: Record<string, React.ReactNode> = {
  ai_driver_chatbot: <Bot className="h-4 w-4" />,
  ai_kyc_validation: <FileSearch className="h-4 w-4" />,
  ai_income_insights: <TrendingUp className="h-4 w-4" />,
  ai_admin_assistant: <Brain className="h-4 w-4" />,
};

const FEATURE_LABELS: Record<string, string> = {
  ai_driver_chatbot: 'Chatbot IA',
  ai_kyc_validation: 'Validation KYC',
  ai_income_insights: 'Insights Revenus',
  ai_admin_assistant: 'Assistant Admin',
};

const CHART_COLORS = [
  'hsl(142, 71%, 45%)',
  'hsl(217, 91%, 60%)',
  'hsl(25, 95%, 53%)',
  'hsl(280, 67%, 60%)',
];

function useAIUsageStats(days: number) {
  return useQuery({
    queryKey: ['ai-usage-stats', days],
    queryFn: async () => {
      const since = subDays(new Date(), days).toISOString();

      const { data, error } = await supabase
        .from('ai_usage_logs')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const logs = (data || []) as Array<{
        id: string;
        feature_key: string;
        total_tokens: number;
        latency_ms: number | null;
        success: boolean;
        created_at: string;
        customer_id: string | null;
      }>;

      // Aggregate stats
      const totalCalls = logs.length;
      const totalTokens = logs.reduce((sum, l) => sum + (l.total_tokens || 0), 0);
      const avgLatency = logs.length > 0 
        ? Math.round(logs.reduce((sum, l) => sum + (l.latency_ms || 0), 0) / logs.length)
        : 0;
      const errorRate = logs.length > 0 
        ? Math.round((logs.filter(l => !l.success).length / logs.length) * 100)
        : 0;

      // By feature
      const byFeature = Object.entries(
        logs.reduce((acc, l) => {
          acc[l.feature_key] = (acc[l.feature_key] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      ).map(([name, value]) => ({ name: FEATURE_LABELS[name] || name, value, key: name }));

      // Daily usage
      const dailyMap: Record<string, Record<string, number>> = {};
      logs.forEach(l => {
        const day = format(new Date(l.created_at), 'dd/MM');
        if (!dailyMap[day]) dailyMap[day] = {};
        dailyMap[day][l.feature_key] = (dailyMap[day][l.feature_key] || 0) + 1;
      });
      const dailyUsage = Object.entries(dailyMap)
        .map(([date, features]) => ({ date, ...features }))
        .reverse();

      // Token trend
      const tokenMap: Record<string, number> = {};
      logs.forEach(l => {
        const day = format(new Date(l.created_at), 'dd/MM');
        tokenMap[day] = (tokenMap[day] || 0) + (l.total_tokens || 0);
      });
      const tokenTrend = Object.entries(tokenMap)
        .map(([date, tokens]) => ({ date, tokens }))
        .reverse();

      return { totalCalls, totalTokens, avgLatency, errorRate, byFeature, dailyUsage, tokenTrend, logs };
    },
  });
}

function StatCard({ icon, label, value, subtext, color }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${color || 'bg-primary/10'}`}>
            {icon}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold">{value}</p>
            {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AIUsageAnalytics() {
  const [period, setPeriod] = useState('30');
  const { data: stats, isLoading } = useAIUsageStats(parseInt(period));

  return (
    <AdminLayout>
      <AdminBreadcrumb
        items={[
          { label: 'Tableau de bord', href: '/admin' },
          { label: 'Usage IA' },
        ]}
      />

      <div className="flex items-center justify-between mb-6">
        <AdminPageHeader
          title="Analytiques IA"
          description="Suivi de la consommation des fonctionnalités IA par client"
        />
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 jours</SelectItem>
            <SelectItem value="30">30 jours</SelectItem>
            <SelectItem value="90">90 jours</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-4 mb-6">
            <StatCard
              icon={<Activity className="h-4 w-4 text-primary" />}
              label="Appels IA total"
              value={stats?.totalCalls.toLocaleString() || '0'}
              subtext={`${period} derniers jours`}
              color="bg-primary/10"
            />
            <StatCard
              icon={<Zap className="h-4 w-4 text-secondary" />}
              label="Tokens consommés"
              value={stats?.totalTokens ? `${(stats.totalTokens / 1000).toFixed(1)}k` : '0'}
              subtext="Estimation coût"
              color="bg-secondary/10"
            />
            <StatCard
              icon={<Clock className="h-4 w-4 text-warning" />}
              label="Latence moyenne"
              value={`${stats?.avgLatency || 0}ms`}
              subtext="Temps de réponse"
              color="bg-warning/10"
            />
            <StatCard
              icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
              label="Taux d'erreur"
              value={`${stats?.errorRate || 0}%`}
              subtext="Fiabilité"
              color="bg-destructive/10"
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2 mb-6">
            {/* Usage by Feature Pie */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Répartition par fonctionnalité
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats?.byFeature && stats.byFeature.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={stats.byFeature}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={4}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {stats.byFeature.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                    Aucune donnée disponible
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Token Consumption Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Tendance tokens
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats?.tokenTrend && stats.tokenTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={stats.tokenTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Line 
                        type="monotone" 
                        dataKey="tokens" 
                        stroke="hsl(142, 71%, 45%)" 
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                    Aucune donnée disponible
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activité récente</CardTitle>
              <CardDescription>Dernières 20 requêtes IA</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Fonctionnalité</th>
                      <th className="text-left p-3 font-medium">Date</th>
                      <th className="text-right p-3 font-medium">Tokens</th>
                      <th className="text-right p-3 font-medium">Latence</th>
                      <th className="text-center p-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats?.logs.slice(0, 20).map((log) => (
                      <tr key={log.id} className="border-b last:border-b-0 hover:bg-muted/30">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {FEATURE_ICONS[log.feature_key] || <Activity className="h-4 w-4" />}
                            <span>{FEATURE_LABELS[log.feature_key] || log.feature_key}</span>
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {format(new Date(log.created_at), 'dd MMM HH:mm', { locale: fr })}
                        </td>
                        <td className="p-3 text-right tabular-nums">{log.total_tokens?.toLocaleString() || '-'}</td>
                        <td className="p-3 text-right tabular-nums">{log.latency_ms ? `${log.latency_ms}ms` : '-'}</td>
                        <td className="p-3 text-center">
                          <Badge variant={log.success ? 'default' : 'destructive'} className="text-xs">
                            {log.success ? 'OK' : 'Erreur'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {(!stats?.logs || stats.logs.length === 0) && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground">
                          Aucune activité IA enregistrée
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </AdminLayout>
  );
}
