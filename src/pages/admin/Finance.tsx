import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Banknote, TrendingUp, AlertTriangle, Target, ArrowRight, Wallet, FileText, CreditCard } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { supabase } from '@/integrations/supabase/routeClient';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from 'recharts';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--secondary))', 'hsl(var(--muted-foreground))', '#10b981', '#f59e0b'];
const COLLECTION_TARGET = 95;

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function monthLabel(d: Date) {
  return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}

export default function AdminFinance() {
  const today = useMemo(() => new Date(), []);
  const horizon12 = useMemo(() => {
    const arr: { date: Date; label: string }[] = [];
    for (let i = -11; i <= 0; i++) {
      const d = addMonths(startOfMonth(today), i);
      arr.push({ date: d, label: monthLabel(d) });
    }
    return arr;
  }, [today]);

  // Payments (12 months back to current+1 month for projection)
  const fromDate = useMemo(() => addMonths(startOfMonth(today), -11).toISOString().slice(0, 10), [today]);
  const toDate = useMemo(() => addMonths(startOfMonth(today), 2).toISOString().slice(0, 10), [today]);

  const { data: payments = [], isLoading: pLoad } = useQuery({
    queryKey: ['finance-payments', fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('id, amount, amount_paid, due_date, paid_date, status, payment_type, rental_id')
        .gte('due_date', fromDate)
        .lte('due_date', toDate);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: activeRentals = [] } = useQuery({
    queryKey: ['finance-active-rentals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rentals')
        .select('id, approved_rate, requested_rate, rental_days, status, vehicles(vehicle_type)')
        .in('status', ['active', 'approved']);
      if (error) throw error;
      return data || [];
    },
  });

  // Build per-month aggregates
  const monthly = useMemo(() => {
    const map = new Map<string, { label: string; expected: number; collected: number }>();
    horizon12.forEach((m) => {
      const key = m.date.toISOString().slice(0, 7);
      map.set(key, { label: m.label, expected: 0, collected: 0 });
    });
    payments.forEach((p: any) => {
      const key = (p.due_date as string).slice(0, 7);
      const bucket = map.get(key);
      if (!bucket) return;
      bucket.expected += p.amount || 0;
      bucket.collected += p.amount_paid || 0;
    });
    return Array.from(map.values());
  }, [payments, horizon12]);

  // KPIs
  const currentMonthKey = startOfMonth(today).toISOString().slice(0, 7);
  const currentBucket = monthly.find((m) => m.label === monthLabel(startOfMonth(today)));

  const last30From = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const recent = payments.filter((p: any) => p.due_date >= last30From && p.due_date <= today.toISOString().slice(0, 10));
  const expected30 = recent.reduce((s: number, p: any) => s + (p.amount || 0), 0);
  const collected30 = recent.reduce((s: number, p: any) => s + (p.amount_paid || 0), 0);
  const collectionRate = expected30 > 0 ? Math.round((collected30 / expected30) * 100) : 0;

  const overdue = payments.filter((p: any) => (p.status === 'overdue' || p.status === 'late' || p.status === 'partial') && p.due_date <= today.toISOString().slice(0, 10));
  const overdueAmount = overdue.reduce((s: number, p: any) => s + ((p.amount || 0) - (p.amount_paid || 0)), 0);

  // Forward projection: sum scheduled payments next 30 days that are not paid
  const next30 = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const projection30 = payments
    .filter((p: any) => p.due_date > today.toISOString().slice(0, 10) && p.due_date <= next30 && p.status !== 'paid')
    .reduce((s: number, p: any) => s + (p.amount || 0), 0);
  const projection7 = payments
    .filter((p: any) => {
      const d7 = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
      return p.due_date > today.toISOString().slice(0, 10) && p.due_date <= d7 && p.status !== 'paid';
    })
    .reduce((s: number, p: any) => s + (p.amount || 0), 0);

  // Active rentals projection by category (vehicle_type) — daily run-rate
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    activeRentals.forEach((r: any) => {
      const cat = r.vehicles?.vehicle_type || 'autre';
      const rate = r.approved_rate || r.requested_rate || 0;
      m.set(cat, (m.get(cat) || 0) + rate);
    });
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [activeRentals]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminBreadcrumb items={[{ label: 'Finance' }]} />
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold">Finance</h1>
            <p className="text-sm text-muted-foreground">Vue consolidée KPI, facturation, paiements et KiraPay</p>
          </div>
        </div>

        <Tabs defaultValue="kpi" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 max-w-xl">
            <TabsTrigger value="kpi">KPI</TabsTrigger>
            <TabsTrigger value="facturation">Facturation</TabsTrigger>
            <TabsTrigger value="paiements">Paiements</TabsTrigger>
            <TabsTrigger value="kirapay">KiraPay</TabsTrigger>
          </TabsList>

          {/* ============== KPI TAB ============== */}
          <TabsContent value="kpi" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">CA prévisionnel 7j</span>
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-2xl font-bold">{formatCurrency(projection7)}</div>
                  <div className="text-xs text-muted-foreground">Échéances à venir non payées</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">CA prévisionnel 30j</span>
                    <Banknote className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-2xl font-bold">{formatCurrency(projection30)}</div>
                  <div className="text-xs text-muted-foreground">Loyers + prêts planifiés</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Taux de recouvrement</span>
                    <Target className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <div className="text-2xl font-bold">{collectionRate}%</div>
                    <div className="text-xs text-muted-foreground">cible {COLLECTION_TARGET}%</div>
                  </div>
                  <Progress value={Math.min(collectionRate, 100)} className="h-2" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Impayés & retards</span>
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  </div>
                  <div className="text-2xl font-bold text-destructive">{formatCurrency(overdueAmount)}</div>
                  <div className="text-xs text-muted-foreground">{overdue.length} échéance(s)</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Loyers prévus vs collectés (12 mois)</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {pLoad ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Chargement…</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthly}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Legend />
                      <Bar dataKey="expected" name="Prévu" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="collected" name="Collecté" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Loyers actifs par catégorie (FCFA/jour)</CardTitle>
                </CardHeader>
                <CardContent className="h-64">
                  {byCategory.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Aucune location active</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85} label={(e) => e.name}>
                          {byCategory.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Échéances en retard</CardTitle>
                </CardHeader>
                <CardContent>
                  {overdue.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-6 text-center">Aucun retard 🎉</div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {overdue.slice(0, 12).map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                          <div>
                            <div className="font-medium capitalize">{p.payment_type}</div>
                            <div className="text-xs text-muted-foreground">Échéance {p.due_date}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">{formatCurrency((p.amount || 0) - (p.amount_paid || 0))}</div>
                            <Badge variant="destructive" className="text-[10px] mt-1">{p.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button variant="link" size="sm" asChild className="px-0 mt-2">
                    <Link to="/admin/billing/unresolved">Voir tous les impayés <ArrowRight className="h-3 w-3 ml-1" /></Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ============== FACTURATION TAB ============== */}
          <TabsContent value="facturation">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <FileText className="h-8 w-8 text-primary" />
                  <div>
                    <h2 className="text-lg font-semibold">Module Facturation</h2>
                    <p className="text-sm text-muted-foreground">
                      Gérez les factures, audits comptables et règles de facturation depuis l'espace dédié.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild><Link to="/admin/billing">Ouvrir Facturation</Link></Button>
                  <Button variant="outline" asChild><Link to="/admin/billing/settings">Paramètres</Link></Button>
                  <Button variant="outline" asChild><Link to="/admin/billing/unresolved">Impayés</Link></Button>
                  <Button variant="outline" asChild><Link to="/admin/billing/audit">Audit</Link></Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============== PAIEMENTS TAB ============== */}
          <TabsContent value="paiements">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <CreditCard className="h-8 w-8 text-primary" />
                  <div>
                    <h2 className="text-lg font-semibold">Paiements Wave & Mobile Money</h2>
                    <p className="text-sm text-muted-foreground">
                      Suivez chaque encaissement, enregistrez des reçus et créez des échéances manuelles.
                    </p>
                  </div>
                </div>
                <Button asChild><Link to="/admin/payments">Ouvrir Paiements</Link></Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============== KIRAPAY TAB ============== */}
          <TabsContent value="kirapay">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <Wallet className="h-8 w-8 text-primary" />
                  <div>
                    <h2 className="text-lg font-semibold">KiraPay — Portefeuilles chauffeurs</h2>
                    <p className="text-sm text-muted-foreground">
                      Crédits, débits et historiques de portefeuilles utilisés pour les avances et compensations.
                    </p>
                  </div>
                </div>
                <Button asChild><Link to="/admin/billing/wallets">Ouvrir KiraPay</Link></Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}