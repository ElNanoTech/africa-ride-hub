import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity, Users, Car, Banknote, ShieldAlert, GraduationCap, TrendingUp,
  AlertTriangle, CheckCircle2, ExternalLink, Sparkles, Flag, Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area,
} from "recharts";
import { format, subDays } from "date-fns";
import { fr } from "date-fns/locale";

const fmtFCFA = (n: number) =>
  new Intl.NumberFormat("fr-FR").format(Math.round(n || 0)) + " FCFA";

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#8b5cf6", "#0ea5e9", "#ef4444"];

export default function Kira() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({});

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const since30 = subDays(new Date(), 30).toISOString();
    const since7 = subDays(new Date(), 7).toISOString();

    const [
      drivers, vehicles, rentals, payments, accidents, contraventions,
      alerts, maintenance, scores, modules, broadcasts, inspections,
    ] = await Promise.all([
      supabase.from("drivers").select("id,status,created_at,full_name").limit(2000),
      supabase.from("vehicles").select("id,status,vehicle_type,license_plate").limit(2000),
      supabase.from("rentals").select("id,status,start_date,total_amount,driver_id,created_at").gte("created_at", since30).limit(5000),
      supabase.from("payments").select("id,amount,status,created_at").gte("created_at", since30).limit(5000),
      supabase.from("accidents").select("id,status,severity,accident_date,created_at").gte("created_at", since30).limit(2000),
      supabase.from("traffic_violations").select("id,status,amount,violation_date").gte("violation_date", since30).limit(2000),
      supabase.from("alerts").select("id,alert_type,severity,status,created_at").limit(2000),
      supabase.from("maintenance_orders").select("id,status,total_cost,created_at").gte("created_at", since30).limit(2000),
      supabase.from("credit_scores").select("driver_id,score,updated_at").limit(2000),
      supabase.from("training_progress").select("status").limit(5000),
      supabase.from("broadcasts").select("id,status,delivered_count,read_count").limit(500),
      supabase.from("vehicle_inspections").select("id,status,created_at").gte("created_at", since30).limit(2000),
    ]);

    setData({
      drivers: drivers.data ?? [],
      vehicles: vehicles.data ?? [],
      rentals: rentals.data ?? [],
      payments: payments.data ?? [],
      accidents: accidents.data ?? [],
      contraventions: contraventions.data ?? [],
      alerts: alerts.data ?? [],
      maintenance: maintenance.data ?? [],
      scores: scores.data ?? [],
      modules: modules.data ?? [],
      broadcasts: broadcasts.data ?? [],
      inspections: inspections.data ?? [],
    });
    setLoading(false);
  };

  const kpis = useMemo(() => {
    const drivers = data.drivers ?? [];
    const vehicles = data.vehicles ?? [];
    const rentals = data.rentals ?? [];
    const payments = data.payments ?? [];
    const accidents = data.accidents ?? [];
    const alerts = data.alerts ?? [];
    const maintenance = data.maintenance ?? [];
    const scores = data.scores ?? [];

    const activeDrivers = drivers.filter((d: any) => d.status === "active").length;
    const activeVehicles = vehicles.filter((v: any) => v.status === "active" || v.status === "rented").length;
    const utilization = vehicles.length ? Math.round((vehicles.filter((v: any) => v.status === "rented").length / vehicles.length) * 100) : 0;
    const revenue30 = payments.filter((p: any) => p.status === "completed").reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const collectionRate = payments.length ? Math.round((payments.filter((p: any) => p.status === "completed").length / payments.length) * 100) : 0;
    const openAlerts = alerts.filter((a: any) => a.status === "open").length;
    const criticalAlerts = alerts.filter((a: any) => a.status === "open" && a.severity === "critical").length;
    const accidents30 = accidents.length;
    const maintCost = maintenance.reduce((s: number, m: any) => s + (m.total_cost || 0), 0);
    const avgScore = scores.length ? Math.round(scores.reduce((s: number, x: any) => s + (x.score || 0), 0) / scores.length) : 0;

    return { activeDrivers, totalDrivers: drivers.length, activeVehicles, totalVehicles: vehicles.length,
      utilization, revenue30, collectionRate, openAlerts, criticalAlerts, accidents30, maintCost, avgScore };
  }, [data]);

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> KIRA Analytics
          </h1>
          <p className="text-sm text-muted-foreground">Vue 360° de votre flotte sur les 30 derniers jours.</p>
        </div>
        <Link to="/admin/analytics">
          <Button variant="outline" size="sm"><ExternalLink className="h-4 w-4 mr-1" /> Vue chauffeurs détaillée</Button>
        </Link>
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted-foreground">Chargement…</div>
      ) : (
        <Tabs defaultValue="overview">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="overview"><Activity className="h-4 w-4 mr-1" /> Vue d'ensemble</TabsTrigger>
            <TabsTrigger value="fleet"><Car className="h-4 w-4 mr-1" /> Flotte</TabsTrigger>
            <TabsTrigger value="finance"><Banknote className="h-4 w-4 mr-1" /> Finance</TabsTrigger>
            <TabsTrigger value="safety"><ShieldAlert className="h-4 w-4 mr-1" /> Sécurité</TabsTrigger>
            <TabsTrigger value="drivers"><Users className="h-4 w-4 mr-1" /> Chauffeurs</TabsTrigger>
            <TabsTrigger value="engagement"><GraduationCap className="h-4 w-4 mr-1" /> Engagement</TabsTrigger>
          </TabsList>

          {/* ---------------- OVERVIEW ---------------- */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi icon={Users} label="Chauffeurs actifs" value={`${kpis.activeDrivers}/${kpis.totalDrivers}`} />
              <Kpi icon={Car} label="Utilisation flotte" value={`${kpis.utilization}%`} tone="info" />
              <Kpi icon={Banknote} label="Recettes 30j" value={fmtFCFA(kpis.revenue30)} tone="positive" />
              <Kpi icon={AlertTriangle} label="Alertes ouvertes" value={kpis.openAlerts}
                   tone={kpis.criticalAlerts > 0 ? "critical" : "warning"}
                   sub={kpis.criticalAlerts ? `${kpis.criticalAlerts} critiques` : undefined} />
              <Kpi icon={CheckCircle2} label="Taux de collecte" value={`${kpis.collectionRate}%`} tone="positive" />
              <Kpi icon={TrendingUp} label="Score DAM moyen" value={kpis.avgScore} />
              <Kpi icon={ShieldAlert} label="Accidents 30j" value={kpis.accidents30} tone={kpis.accidents30 > 5 ? "warning" : "default"} />
              <Kpi icon={Wrench} label="Coût maintenance 30j" value={fmtFCFA(kpis.maintCost)} />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle>Alertes par type</CardTitle></CardHeader>
                <CardContent className="h-64">
                  <AlertsByTypeChart alerts={data.alerts ?? []} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Revenus quotidiens (30j)</CardTitle></CardHeader>
                <CardContent className="h-64">
                  <DailyRevenueChart payments={data.payments ?? []} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ---------------- FLEET ---------------- */}
          <TabsContent value="fleet" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi icon={Car} label="Véhicules totaux" value={kpis.totalVehicles} />
              <Kpi icon={Activity} label="En service" value={kpis.activeVehicles} tone="positive" />
              <Kpi icon={TrendingUp} label="Utilisation" value={`${kpis.utilization}%`} tone="info" />
              <Kpi icon={Wrench} label="Inspections 30j" value={(data.inspections ?? []).length} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle>État des véhicules</CardTitle></CardHeader>
                <CardContent className="h-64"><VehicleStatusChart vehicles={data.vehicles ?? []} /></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Type de véhicule</CardTitle></CardHeader>
                <CardContent className="h-64"><VehicleTypeChart vehicles={data.vehicles ?? []} /></CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ---------------- FINANCE ---------------- */}
          <TabsContent value="finance" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi icon={Banknote} label="Recettes 30j" value={fmtFCFA(kpis.revenue30)} tone="positive" />
              <Kpi icon={CheckCircle2} label="Taux collecte" value={`${kpis.collectionRate}%`} tone="positive" />
              <Kpi icon={Wrench} label="Maintenance 30j" value={fmtFCFA(kpis.maintCost)} />
              <Kpi icon={Flag} label="PV en attente" value={(data.contraventions ?? []).filter((c: any) => c.status === "pending").length} />
            </div>
            <Card>
              <CardHeader><CardTitle>Revenus quotidiens</CardTitle></CardHeader>
              <CardContent className="h-72"><DailyRevenueChart payments={data.payments ?? []} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Paiements par statut</CardTitle></CardHeader>
              <CardContent className="h-64"><PaymentStatusChart payments={data.payments ?? []} /></CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- SAFETY ---------------- */}
          <TabsContent value="safety" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi icon={ShieldAlert} label="Accidents 30j" value={kpis.accidents30} tone={kpis.accidents30 > 5 ? "critical" : "warning"} />
              <Kpi icon={Flag} label="Contraventions" value={(data.contraventions ?? []).length} />
              <Kpi icon={AlertTriangle} label="Alertes critiques" value={kpis.criticalAlerts} tone="critical" />
              <Kpi icon={CheckCircle2} label="Inspections OK"
                value={(data.inspections ?? []).filter((i: any) => i.status === "approved" || i.status === "completed").length} tone="positive" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle>Accidents par sévérité</CardTitle></CardHeader>
                <CardContent className="h-64"><AccidentSeverityChart accidents={data.accidents ?? []} /></CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Alertes par sévérité</CardTitle></CardHeader>
                <CardContent className="h-64"><AlertsBySeverityChart alerts={data.alerts ?? []} /></CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ---------------- DRIVERS ---------------- */}
          <TabsContent value="drivers" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi icon={Users} label="Total chauffeurs" value={kpis.totalDrivers} />
              <Kpi icon={CheckCircle2} label="Actifs" value={kpis.activeDrivers} tone="positive" />
              <Kpi icon={AlertTriangle} label="Suspendus"
                value={(data.drivers ?? []).filter((d: any) => d.status === "suspended").length} tone="warning" />
              <Kpi icon={TrendingUp} label="Score moyen" value={kpis.avgScore} />
            </div>
            <Card>
              <CardHeader><CardTitle>Distribution des scores DAM</CardTitle></CardHeader>
              <CardContent className="h-72"><ScoreDistChart scores={data.scores ?? []} /></CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- ENGAGEMENT ---------------- */}
          <TabsContent value="engagement" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi icon={GraduationCap} label="Formations terminées"
                value={(data.modules ?? []).filter((m: any) => m.status === "completed").length} tone="positive" />
              <Kpi icon={Activity} label="En cours"
                value={(data.modules ?? []).filter((m: any) => m.status === "in_progress").length} />
              <Kpi icon={Sparkles} label="Diffusions envoyées"
                value={(data.broadcasts ?? []).filter((b: any) => b.status === "sent").length} />
              <Kpi icon={CheckCircle2} label="Total livraisons"
                value={(data.broadcasts ?? []).reduce((s: number, b: any) => s + (b.delivered_count || 0), 0)} />
            </div>
            <Card>
              <CardHeader><CardTitle>Progression des formations</CardTitle></CardHeader>
              <CardContent className="h-64"><TrainingProgressChart progress={data.modules ?? []} /></CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/* ============== Helpers / Charts ============== */

function Kpi({ icon: Icon, label, value, tone = "default", sub }: any) {
  const tones: Record<string, string> = {
    default: "text-foreground",
    positive: "text-green-600",
    warning: "text-orange-600",
    critical: "text-red-600",
    info: "text-blue-600",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
          <Icon className={`h-4 w-4 ${tones[tone]}`} />
        </div>
        <div className={`text-2xl font-bold mt-2 ${tones[tone]}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function groupBy<T>(arr: T[], key: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of arr) { const k = key(x); out[k] = (out[k] ?? 0) + 1; }
  return out;
}

function AlertsByTypeChart({ alerts }: { alerts: any[] }) {
  const grouped = groupBy(alerts, (a) => a.alert_type);
  const rows = Object.entries(grouped).map(([name, value]) => ({ name, value }));
  if (rows.length === 0) return <Empty />;
  return (
    <ResponsiveContainer><BarChart data={rows}>
      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
      <YAxis tick={{ fontSize: 11 }} /><Tooltip />
      <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
    </BarChart></ResponsiveContainer>
  );
}

function AlertsBySeverityChart({ alerts }: { alerts: any[] }) {
  const grouped = groupBy(alerts, (a) => a.severity);
  const rows = Object.entries(grouped).map(([name, value], i) => ({ name, value }));
  if (rows.length === 0) return <Empty />;
  return (
    <ResponsiveContainer><PieChart>
      <Pie data={rows} dataKey="value" nameKey="name" outerRadius={80} label>
        {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
      </Pie>
      <Legend /><Tooltip />
    </PieChart></ResponsiveContainer>
  );
}

function DailyRevenueChart({ payments }: { payments: any[] }) {
  const byDay: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const k = format(subDays(new Date(), i), "dd/MM");
    byDay[k] = 0;
  }
  payments.filter((p) => p.status === "completed").forEach((p) => {
    const k = format(new Date(p.created_at), "dd/MM");
    if (k in byDay) byDay[k] += p.amount || 0;
  });
  const rows = Object.entries(byDay).map(([day, total]) => ({ day, total }));
  return (
    <ResponsiveContainer><AreaChart data={rows}>
      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
      <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={3} />
      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
      <Tooltip formatter={(v: any) => fmtFCFA(v)} />
      <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
    </AreaChart></ResponsiveContainer>
  );
}

function PaymentStatusChart({ payments }: { payments: any[] }) {
  const grouped = groupBy(payments, (p) => p.status);
  const rows = Object.entries(grouped).map(([name, value]) => ({ name, value }));
  if (rows.length === 0) return <Empty />;
  return (
    <ResponsiveContainer><PieChart>
      <Pie data={rows} dataKey="value" nameKey="name" outerRadius={80} label>
        {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
      </Pie>
      <Legend /><Tooltip />
    </PieChart></ResponsiveContainer>
  );
}

function VehicleStatusChart({ vehicles }: { vehicles: any[] }) {
  const grouped = groupBy(vehicles, (v) => v.status || "unknown");
  const rows = Object.entries(grouped).map(([name, value]) => ({ name, value }));
  if (rows.length === 0) return <Empty />;
  return (
    <ResponsiveContainer><BarChart data={rows}>
      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
      <YAxis tick={{ fontSize: 11 }} /><Tooltip />
      <Bar dataKey="value" fill="#16a34a" radius={[4, 4, 0, 0]} />
    </BarChart></ResponsiveContainer>
  );
}

function VehicleTypeChart({ vehicles }: { vehicles: any[] }) {
  const grouped = groupBy(vehicles, (v) => v.vehicle_type || "autre");
  const rows = Object.entries(grouped).map(([name, value]) => ({ name, value }));
  if (rows.length === 0) return <Empty />;
  return (
    <ResponsiveContainer><PieChart>
      <Pie data={rows} dataKey="value" nameKey="name" outerRadius={80} label>
        {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
      </Pie>
      <Legend /><Tooltip />
    </PieChart></ResponsiveContainer>
  );
}

function AccidentSeverityChart({ accidents }: { accidents: any[] }) {
  const grouped = groupBy(accidents, (a) => a.severity || "minor");
  const rows = Object.entries(grouped).map(([name, value]) => ({ name, value }));
  if (rows.length === 0) return <Empty />;
  return (
    <ResponsiveContainer><BarChart data={rows}>
      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
      <YAxis tick={{ fontSize: 11 }} /><Tooltip />
      <Bar dataKey="value" fill="#dc2626" radius={[4, 4, 0, 0]} />
    </BarChart></ResponsiveContainer>
  );
}

function ScoreDistChart({ scores }: { scores: any[] }) {
  const buckets = [
    { name: "<400", min: 0, max: 399, count: 0 },
    { name: "400-499", min: 400, max: 499, count: 0 },
    { name: "500-599", min: 500, max: 599, count: 0 },
    { name: "600-699", min: 600, max: 699, count: 0 },
    { name: "700-799", min: 700, max: 799, count: 0 },
    { name: "800+", min: 800, max: 9999, count: 0 },
  ];
  for (const s of scores) {
    const sc = s.score || 0;
    const b = buckets.find((x) => sc >= x.min && sc <= x.max);
    if (b) b.count += 1;
  }
  if (scores.length === 0) return <Empty />;
  return (
    <ResponsiveContainer><BarChart data={buckets}>
      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
      <YAxis tick={{ fontSize: 11 }} /><Tooltip />
      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
    </BarChart></ResponsiveContainer>
  );
}

function TrainingProgressChart({ progress }: { progress: any[] }) {
  const grouped = groupBy(progress, (p) => p.status || "not_started");
  const rows = Object.entries(grouped).map(([name, value]) => ({ name, value }));
  if (rows.length === 0) return <Empty />;
  return (
    <ResponsiveContainer><PieChart>
      <Pie data={rows} dataKey="value" nameKey="name" outerRadius={80} label>
        {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
      </Pie>
      <Legend /><Tooltip />
    </PieChart></ResponsiveContainer>
  );
}

function Empty() {
  return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Aucune donnée</div>;
}