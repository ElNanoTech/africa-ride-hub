import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bell, RefreshCw, CheckCircle2, AlertTriangle, ShieldAlert, Clock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

type Alert = {
  id: string;
  alert_type: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  message: string | null;
  status: "open" | "acknowledged" | "resolved" | "dismissed";
  driver_id: string | null;
  vehicle_id: string | null;
  due_date: string | null;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  metadata: any;
};

const TYPE_LABELS: Record<string, string> = {
  kyc_expiry: "KYC expiré",
  insurance_expiry: "Assurance",
  registration_expiry: "Document véhicule",
  rental_overdue: "Retour en retard",
  payment_overdue: "Paiement en retard",
  low_score: "Score DAM faible",
  accident_unresolved: "Accident non résolu",
  contravention_pending: "Contravention",
  inspection_overdue: "Inspection",
  vehicle_immobilized: "Véhicule immobilisé",
  invoice_overdue: "Facture impayée",
  kyc_pending_review: "KYC en attente",
  kyc_rejected: "KYC refusée",
};

const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  critical: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export default function Alertes() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [statusTab, setStatusTab] = useState<"open" | "acknowledged" | "resolved" | "all">("open");
  const [typeFilter, setTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error("Erreur de chargement");
    else setAlerts((data ?? []) as Alert[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("alerts-stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const generate = async () => {
    setGenerating(true);
    const { error } = await supabase.rpc("generate_fleet_alerts");
    if (error) toast.error("Échec de la génération");
    else {
      toast.success("Alertes mises à jour");
      load();
    }
    setGenerating(false);
  };

  const updateStatus = async (id: string, status: Alert["status"]) => {
    const patch: any = { status };
    if (status === "acknowledged") patch.acknowledged_at = new Date().toISOString();
    if (status === "resolved" || status === "dismissed") patch.resolved_at = new Date().toISOString();
    const { error } = await supabase.from("alerts").update(patch).eq("id", id);
    if (error) toast.error("Échec");
    else {
      toast.success("Mis à jour");
      load();
    }
  };

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (statusTab !== "all" && a.status !== statusTab) return false;
      if (typeFilter !== "all" && a.alert_type !== typeFilter) return false;
      if (severityFilter !== "all" && a.severity !== severityFilter) return false;
      return true;
    });
  }, [alerts, statusTab, typeFilter, severityFilter]);

  const kpis = useMemo(() => {
    const open = alerts.filter((a) => a.status === "open");
    return {
      open: open.length,
      critical: open.filter((a) => a.severity === "critical").length,
      high: open.filter((a) => a.severity === "high").length,
      acknowledged: alerts.filter((a) => a.status === "acknowledged").length,
    };
  }, [alerts]);

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" /> Alertes
          </h1>
          <p className="text-sm text-muted-foreground">
            Inbox centralisée des risques flotte — expirations, retards, scores et incidents.
          </p>
        </div>
        <Button onClick={generate} disabled={generating} variant="default">
          <RefreshCw className={`h-4 w-4 mr-2 ${generating ? "animate-spin" : ""}`} />
          Régénérer
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Bell} label="Ouvertes" value={kpis.open} tone="default" />
        <KpiCard icon={ShieldAlert} label="Critiques" value={kpis.critical} tone="critical" />
        <KpiCard icon={AlertTriangle} label="Élevées" value={kpis.high} tone="high" />
        <KpiCard icon={Clock} label="En cours" value={kpis.acknowledged} tone="default" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as any)} className="flex-1">
              <TabsList>
                <TabsTrigger value="open">Ouvertes</TabsTrigger>
                <TabsTrigger value="acknowledged">En cours</TabsTrigger>
                <TabsTrigger value="resolved">Résolues</TabsTrigger>
                <TabsTrigger value="all">Toutes</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full md:w-[200px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-full md:w-[160px]"><SelectValue placeholder="Sévérité" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="critical">Critique</SelectItem>
                <SelectItem value="high">Élevée</SelectItem>
                <SelectItem value="medium">Moyenne</SelectItem>
                <SelectItem value="low">Faible</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-muted-foreground">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">Aucune alerte</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sévérité</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Titre</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead>Créée</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Badge className={SEVERITY_STYLES[a.severity]} variant="outline">
                          {a.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>{TYPE_LABELS[a.alert_type] ?? a.alert_type}</TableCell>
                      <TableCell>
                        <div className="font-medium">{a.title}</div>
                        {a.message && (
                          <div className="text-xs text-muted-foreground">{a.message}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {a.due_date ? format(new Date(a.due_date), "dd MMM yyyy", { locale: fr }) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(a.created_at), "dd/MM HH:mm", { locale: fr })}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {a.status === "open" && (
                          <Button size="sm" variant="outline" onClick={() => updateStatus(a.id, "acknowledged")}>
                            Prendre
                          </Button>
                        )}
                        {a.status !== "resolved" && (
                          <Button size="sm" variant="default" onClick={() => updateStatus(a.id, "resolved")}>
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Résoudre
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: "default" | "critical" | "high" }) {
  const toneClass =
    tone === "critical" ? "text-red-600" : tone === "high" ? "text-orange-600" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
          <Icon className={`h-4 w-4 ${toneClass}`} />
        </div>
        <div className={`text-3xl font-bold mt-2 ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}