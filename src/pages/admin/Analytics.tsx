import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Legend, PieChart, Pie, Cell } from 'recharts';
import { format, subWeeks, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Users, Target, Award, AlertTriangle, Download, FileText, FileSpreadsheet, ChevronsUpDown, UserSearch } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Driver360Report } from '@/components/admin/driver360/Driver360Report';
import { cn } from '@/lib/utils';
import { exportToCSV, exportAnalyticsToPDF } from '@/lib/export';
import { toast } from 'sonner';
import { DateRange } from 'react-day-picker';
import { DateRangePicker } from '@/components/DateRangePicker';

/**
 * B37 — Use centralized score level for tier colors and labels.
 */
import { getScoreLevel } from '@/lib/scoreLevel';

const TIER_COLORS: Record<string, string> = {
  A: getScoreLevel(850).hslColor,
  B: getScoreLevel(700).hslColor,
  C: getScoreLevel(550).hslColor,
  D: getScoreLevel(400).hslColor,
  E: getScoreLevel(200).hslColor,
};

const TIER_LABELS: Record<string, string> = {
  A: getScoreLevel(850).label,
  B: getScoreLevel(700).label,
  C: getScoreLevel(550).label,
  D: getScoreLevel(400).label,
  E: getScoreLevel(200).label,
};

type DateFilterMode = 'preset' | 'custom';

export default function AdminAnalytics() {
  const [selectedDriver, setSelectedDriver] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('12');
  const [filterMode, setFilterMode] = useState<DateFilterMode>('preset');
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
  const [report360DriverId, setReport360DriverId] = useState<string | undefined>(undefined);
  const [report360PickerOpen, setReport360PickerOpen] = useState(false);

  // Fetch all drivers
  const { data: drivers } = useQuery({
    queryKey: ['admin-drivers-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, full_name, yango_driver_id, phone_number')
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });

  // Compute date range based on filter mode
  const dateFilter = useMemo(() => {
    if (filterMode === 'custom' && customDateRange?.from) {
      return {
        from: format(customDateRange.from, 'yyyy-MM-dd'),
        to: customDateRange.to ? format(customDateRange.to, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      };
    }
    const weeksAgo = subWeeks(new Date(), parseInt(timeRange));
    return {
      from: format(weeksAgo, 'yyyy-MM-dd'),
      to: format(new Date(), 'yyyy-MM-dd'),
    };
  }, [filterMode, customDateRange, timeRange]);

  // Fetch credit scores with driver info
  const { data: scores, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-analytics-scores', selectedDriver, dateFilter.from, dateFilter.to],
    queryFn: async () => {
      let query = supabase
        .from('credit_scores')
        .select(`
          id,
          score,
          tier,
          calculation_week,
          driving_impact,
          payment_impact,
          income_impact,
          driving_data_available,
          payment_data_available,
          income_data_available,
          status,
          driver_id,
          drivers (
            id,
            full_name,
            yango_driver_id
          )
        `)
        .gte('calculation_week', dateFilter.from)
        .lte('calculation_week', dateFilter.to)
        .order('calculation_week', { ascending: true });

      if (selectedDriver !== 'all') {
        query = query.eq('driver_id', selectedDriver);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Process data for charts
  const chartData = useMemo(() => {
    if (!scores?.length) return { trend: [], tierDistribution: [], factorImpact: [], weeklyAverages: [] };

    // Group by week for trend line
    const weeklyScores = scores.reduce((acc, score) => {
      const week = score.calculation_week;
      if (!acc[week]) {
        acc[week] = { week, scores: [], driving: [], payment: [], income: [] };
      }
      acc[week].scores.push(score.score);
      if (score.driving_impact !== null) acc[week].driving.push(score.driving_impact);
      if (score.payment_impact !== null) acc[week].payment.push(score.payment_impact);
      if (score.income_impact !== null) acc[week].income.push(score.income_impact);
      return acc;
    }, {} as Record<string, { week: string; scores: number[]; driving: number[]; payment: number[]; income: number[] }>);

    const trend = Object.values(weeklyScores).map(week => ({
      week: format(parseISO(week.week), 'dd MMM', { locale: fr }),
      weekFull: week.week,
      avgScore: Math.round(week.scores.reduce((a, b) => a + b, 0) / week.scores.length),
      minScore: Math.min(...week.scores),
      maxScore: Math.max(...week.scores),
      driverCount: week.scores.length,
      avgDriving: week.driving.length ? Math.round(week.driving.reduce((a, b) => a + b, 0) / week.driving.length) : 0,
      avgPayment: week.payment.length ? Math.round(week.payment.reduce((a, b) => a + b, 0) / week.payment.length) : 0,
      avgIncome: week.income.length ? Math.round(week.income.reduce((a, b) => a + b, 0) / week.income.length) : 0,
    }));

    // Get latest scores for tier distribution
    const latestByDriver = scores.reduce((acc, score) => {
      if (!acc[score.driver_id] || score.calculation_week > acc[score.driver_id].calculation_week) {
        acc[score.driver_id] = score;
      }
      return acc;
    }, {} as Record<string, typeof scores[0]>);

    const tierCounts = Object.values(latestByDriver).reduce((acc, score) => {
      const tier = score.tier as keyof typeof TIER_LABELS;
      acc[tier] = (acc[tier] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const tierDistribution = Object.entries(tierCounts).map(([tier, count]) => ({
      tier,
      label: TIER_LABELS[tier as keyof typeof TIER_LABELS] || tier,
      count,
      color: TIER_COLORS[tier as keyof typeof TIER_COLORS] || 'hsl(var(--muted))',
    }));

    // Factor impact over time
    const factorImpact = trend.map(t => ({
      week: t.week,
      Conduite: t.avgDriving,
      Paiement: t.avgPayment,
      Revenu: t.avgIncome,
    }));

    return { trend, tierDistribution, factorImpact, weeklyAverages: trend };
  }, [scores]);

  // Calculate summary stats
  const stats = useMemo(() => {
    if (!scores?.length) return null;

    const latestWeek = chartData.trend[chartData.trend.length - 1];
    const previousWeek = chartData.trend[chartData.trend.length - 2];
    
    const change = latestWeek && previousWeek 
      ? latestWeek.avgScore - previousWeek.avgScore 
      : 0;

    const uniqueDrivers = new Set(scores.map(s => s.driver_id)).size;
    
    const latestByDriver = scores.reduce((acc, score) => {
      if (!acc[score.driver_id] || score.calculation_week > acc[score.driver_id].calculation_week) {
        acc[score.driver_id] = score;
      }
      return acc;
    }, {} as Record<string, typeof scores[0]>);

    const latestScores = Object.values(latestByDriver);
    const avgScore = latestScores.length 
      ? Math.round(latestScores.reduce((a, b) => a + b.score, 0) / latestScores.length)
      : 0;
    
    const highPerformers = latestScores.filter(s => s.tier === 'A' || s.tier === 'B').length;
    const atRisk = latestScores.filter(s => s.tier === 'D' || s.tier === 'E').length;

    return {
      avgScore,
      change,
      uniqueDrivers,
      highPerformers,
      atRisk,
      totalScores: scores.length,
    };
  }, [scores, chartData]);

  // Export handlers
  const handleExportCSV = () => {
    if (!scores?.length) {
      toast.error('Aucune donnée à exporter');
      return;
    }

    // Prepare data for CSV export
    const csvData = scores.map(score => ({
      conducteur: score.drivers?.full_name || 'N/A',
      yango_id: score.drivers?.yango_driver_id || 'N/A',
      semaine: score.calculation_week,
      score: score.score,
      niveau: score.tier,
      conduite: score.driving_impact || 0,
      paiement: score.payment_impact || 0,
      revenu: score.income_impact || 0,
      statut: score.status,
    }));

    const headers = {
      conducteur: 'Conducteur',
      yango_id: 'ID Yango',
      semaine: 'Semaine',
      score: 'Score',
      niveau: 'Niveau',
      conduite: 'Impact Conduite',
      paiement: 'Impact Paiement',
      revenu: 'Impact Revenu',
      statut: 'Statut',
    };

    const filename = `analytique-scores-${format(new Date(), 'yyyy-MM-dd')}`;
    exportToCSV(csvData, filename, headers);
    toast.success('Fichier CSV exporté');
  };

  const handleExportPDF = () => {
    if (!scores?.length || !stats) {
      toast.error('Aucune donnée à exporter');
      return;
    }

    // Prepare drivers data for PDF
    const latestByDriver = scores.reduce((acc, score) => {
      if (!acc[score.driver_id] || score.calculation_week > acc[score.driver_id].calculation_week) {
        acc[score.driver_id] = score;
      }
      return acc;
    }, {} as Record<string, typeof scores[0]>);

    const driversData = Object.values(latestByDriver).map(score => ({
      name: score.drivers?.full_name || 'N/A',
      score: score.score,
      tier: score.tier,
      driving: score.driving_impact || 0,
      payment: score.payment_impact || 0,
      income: score.income_impact || 0,
    }));

    const filename = `rapport-analytique-${format(new Date(), 'yyyy-MM-dd')}`;
    
    exportAnalyticsToPDF({
      title: 'Rapport Analytique des Performances',
      generatedAt: new Date(),
      stats: {
        avgScore: stats.avgScore,
        uniqueDrivers: stats.uniqueDrivers,
        highPerformers: stats.highPerformers,
        atRisk: stats.atRisk,
      },
      trendData: chartData.trend,
      tierDistribution: chartData.tierDistribution,
      driversData,
    }, filename);

    toast.success('Rapport PDF exporté');
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <LoadingState message="Chargement des données analytiques..." />
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <ErrorState 
          title="Erreur de chargement"
          message="Impossible de charger les données analytiques"
          onRetry={refetch}
        />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Analytique' }]} />
      
      <AdminPageHeader 
        title="Analytique des Performances" 
        description="Suivez l'évolution des scores de crédit et des performances des conducteurs"
      />

      {/* Filters and Export */}
      <div className="flex flex-wrap gap-4 mb-6 justify-between">
        <div className="flex flex-wrap gap-4">
          <Select value={selectedDriver} onValueChange={setSelectedDriver}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Tous les conducteurs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les conducteurs</SelectItem>
              {drivers?.map(driver => (
                <SelectItem key={driver.id} value={driver.id}>
                  {driver.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select 
            value={filterMode === 'preset' ? timeRange : 'custom'} 
            onValueChange={(value) => {
              if (value === 'custom') {
                setFilterMode('custom');
              } else {
                setFilterMode('preset');
                setTimeRange(value);
              }
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Période" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="4">4 dernières semaines</SelectItem>
              <SelectItem value="8">8 dernières semaines</SelectItem>
              <SelectItem value="12">12 dernières semaines</SelectItem>
              <SelectItem value="24">24 dernières semaines</SelectItem>
              <SelectItem value="custom">Période personnalisée</SelectItem>
            </SelectContent>
          </Select>

          {filterMode === 'custom' && (
            <DateRangePicker
              dateRange={customDateRange}
              onDateRangeChange={setCustomDateRange}
            />
          )}
        </div>

        {/* Export Button */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Exporter
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleExportCSV}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Exporter en CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportPDF}>
              <FileText className="h-4 w-4 mr-2" />
              Exporter en PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Summary Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Score Moyen</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avgScore}</div>
              <div className="flex items-center text-xs text-muted-foreground">
                {stats.change > 0 ? (
                  <>
                    <TrendingUp className="h-3 w-3 mr-1 text-emerald-500" />
                    <span className="text-emerald-500">+{stats.change} pts</span>
                  </>
                ) : stats.change < 0 ? (
                  <>
                    <TrendingDown className="h-3 w-3 mr-1 text-destructive" />
                    <span className="text-destructive">{stats.change} pts</span>
                  </>
                ) : (
                  <span>Stable</span>
                )}
                <span className="ml-1">vs semaine précédente</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conducteurs Évalués</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.uniqueDrivers}</div>
              <p className="text-xs text-muted-foreground">
                {stats.totalScores} évaluations au total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Hautes Performances</CardTitle>
              <Award className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{stats.highPerformers}</div>
              <p className="text-xs text-muted-foreground">
                Conducteurs niveaux A et B
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">À Risque</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.atRisk}</div>
              <p className="text-xs text-muted-foreground">
                Conducteurs niveaux D et E
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="trend" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="trend">Évolution des Scores</TabsTrigger>
          <TabsTrigger value="factors">Impact des Facteurs</TabsTrigger>
          <TabsTrigger value="distribution">Distribution par Niveau</TabsTrigger>
          <TabsTrigger value="report360">Rapport Chauffeur 360</TabsTrigger>
        </TabsList>

        <TabsContent value="trend" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Évolution du Score Moyen</CardTitle>
              <CardDescription>
                Score moyen, minimum et maximum par semaine
              </CardDescription>
            </CardHeader>
            <CardContent>
              {chartData.trend.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={chartData.trend}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="week" 
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <YAxis 
                      domain={[0, 1000]} 
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number, name: string) => {
                        const labels: Record<string, string> = {
                          avgScore: 'Score moyen',
                          minScore: 'Score min',
                          maxScore: 'Score max',
                        };
                        return [value, labels[name] || name];
                      }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="avgScore"
                      stroke="hsl(var(--primary))"
                      fillOpacity={1}
                      fill="url(#colorScore)"
                      name="Score moyen"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="maxScore"
                      stroke="hsl(142, 76%, 36%)"
                      strokeDasharray="5 5"
                      name="Score max"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="minScore"
                      stroke="hsl(0, 84%, 60%)"
                      strokeDasharray="5 5"
                      name="Score min"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                  Aucune donnée disponible pour cette période
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="factors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Impact des Facteurs par Semaine</CardTitle>
              <CardDescription>
                Contribution moyenne de chaque facteur au score final
              </CardDescription>
            </CardHeader>
            <CardContent>
              {chartData.factorImpact.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={chartData.factorImpact}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="week" 
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => [`${value} pts`, '']}
                    />
                    <Legend />
                    <Bar dataKey="Conduite" fill="hsl(200, 95%, 53%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Paiement" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Revenu" fill="hsl(280, 85%, 60%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                  Aucune donnée disponible pour cette période
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="distribution" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Distribution par Niveau</CardTitle>
                <CardDescription>
                  Répartition actuelle des conducteurs par niveau de score
                </CardDescription>
              </CardHeader>
              <CardContent>
                {chartData.tierDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={chartData.tierDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="count"
                        label={({ label, count }) => `${label}: ${count}`}
                      >
                        {chartData.tierDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    Aucune donnée disponible
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Détail par Niveau</CardTitle>
                <CardDescription>
                  Nombre de conducteurs dans chaque niveau
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {chartData.tierDistribution.length > 0 ? (
                    chartData.tierDistribution
                      .sort((a, b) => a.tier.localeCompare(b.tier))
                      .map((tier) => (
                        <div key={tier.tier} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-4 h-4 rounded-full" 
                              style={{ backgroundColor: tier.color }}
                            />
                            <span className="font-medium">Niveau {tier.tier}</span>
                            <Badge variant="outline">{tier.label}</Badge>
                          </div>
                          <span className="text-xl font-bold">{tier.count}</span>
                        </div>
                      ))
                  ) : (
                    <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                      Aucune donnée disponible
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="report360" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Rapport Chauffeur 360</CardTitle>
              <CardDescription>
                Sélectionnez un conducteur pour afficher son rapport complet (KPIs,
                factures, sinistres, activité).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Popover open={report360PickerOpen} onOpenChange={setReport360PickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      'w-full sm:w-[360px] justify-between font-normal',
                      !report360DriverId && 'text-muted-foreground'
                    )}
                  >
                    {report360DriverId
                      ? drivers?.find((d) => d.id === report360DriverId)?.full_name ?? 'Conducteur'
                      : 'Choisir un conducteur…'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Rechercher par nom ou téléphone…" />
                    <CommandList>
                      <CommandEmpty>Aucun conducteur.</CommandEmpty>
                      <CommandGroup>
                        {(drivers ?? []).map((d) => (
                          <CommandItem
                            key={d.id}
                            value={`${d.full_name} ${d.phone_number ?? ''}`}
                            onSelect={() => {
                              setReport360DriverId(d.id);
                              setReport360PickerOpen(false);
                            }}
                          >
                            <div className="flex flex-col">
                              <span>{d.full_name}</span>
                              {d.phone_number && (
                                <span className="text-xs text-muted-foreground">{d.phone_number}</span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </CardContent>
          </Card>

          {report360DriverId ? (
            <Driver360Report driverId={report360DriverId} />
          ) : (
            <Card>
              <CardContent className="p-10 flex flex-col items-center gap-3 text-center">
                <UserSearch className="h-10 w-10 text-muted-foreground" />
                <div className="text-sm text-muted-foreground">
                  Sélectionnez un chauffeur pour afficher son rapport 360°.
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}