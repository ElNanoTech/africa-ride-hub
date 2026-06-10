import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GraduationCap, Megaphone, Sparkles, Plus, Send, Trash2, Pencil, BarChart3, CheckCircle2, Clock, Circle, Bell } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

type Module = any;
type Broadcast = any;
type Ad = any;

const CATEGORIES = [
  { value: "safety", label: "Sécurité" },
  { value: "driving", label: "Conduite" },
  { value: "customer_service", label: "Service client" },
  { value: "financial", label: "Finance" },
  { value: "platform", label: "Plateforme" },
  { value: "other", label: "Autre" },
];

const AUDIENCES = [
  { value: "all", label: "Tous les chauffeurs" },
  { value: "active", label: "Chauffeurs actifs" },
  { value: "suspended", label: "Chauffeurs suspendus" },
  { value: "top_scorers", label: "Meilleurs scores" },
  { value: "low_scorers", label: "Scores faibles" },
];

export default function Communication() {
  const [modules, setModules] = useState<Module[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [m, b, a] = await Promise.all([
      supabase.from("training_modules").select("*").order("order_index").order("created_at", { ascending: false }),
      supabase.from("broadcasts").select("*").order("created_at", { ascending: false }),
      supabase.from("driver_ads").select("*").order("created_at", { ascending: false }),
    ]);
    if (m.data) setModules(m.data);
    if (b.data) setBroadcasts(b.data);
    if (a.data) setAds(a.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Megaphone className="h-6 w-6" /> Communication
        </h1>
        <p className="text-sm text-muted-foreground">
          Formation, publicités et campagnes marketing pour les chauffeurs.
        </p>
      </div>

      <Tabs defaultValue="formations">
        <TabsList>
          <TabsTrigger value="formations"><GraduationCap className="h-4 w-4 mr-1" /> Formations</TabsTrigger>
          <TabsTrigger value="tracking"><BarChart3 className="h-4 w-4 mr-1" /> Suivi</TabsTrigger>
          <TabsTrigger value="ads"><Sparkles className="h-4 w-4 mr-1" /> Publicités</TabsTrigger>
          <TabsTrigger value="broadcasts"><Send className="h-4 w-4 mr-1" /> Marketing</TabsTrigger>
        </TabsList>

        <TabsContent value="formations" className="space-y-4">
          <ModulesTab modules={modules} loading={loading} reload={load} />
        </TabsContent>
        <TabsContent value="tracking" className="space-y-4">
          <TrackingTab modules={modules} loading={loading} />
        </TabsContent>
        <TabsContent value="ads" className="space-y-4">
          <AdsTab ads={ads} loading={loading} reload={load} />
        </TabsContent>
        <TabsContent value="broadcasts" className="space-y-4">
          <BroadcastsTab broadcasts={broadcasts} loading={loading} reload={load} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Formations ---------------- */
/* ---------------- Tracking ---------------- */
function TrackingTab({ modules, loading }: { modules: Module[]; loading: boolean }) {
  const [selected, setSelected] = useState<Module | null>(null);
  const [stats, setStats] = useState<Record<string, any>>({});
  const [roster, setRoster] = useState<any[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  // Load completion stats for all modules
  useEffect(() => {
    if (modules.length === 0) return;
    (async () => {
      const results: Record<string, any> = {};
      await Promise.all(modules.map(async (m) => {
        const { data } = await supabase.rpc("get_module_completion_stats", { p_module_id: m.id });
        if (data && data[0]) results[m.id] = data[0];
      }));
      setStats(results);
    })();
  }, [modules]);

  const openRoster = async (m: Module) => {
    setSelected(m);
    setRosterLoading(true);
    // Drivers (scoped by customer if module has one) + their progress for this module
    const sb: any = supabase;
    let driversQ: any = sb.from("drivers").select("id, full_name, phone, customer_id").eq("status", "active");
    if (m.customer_id) driversQ = driversQ.eq("customer_id", m.customer_id);
    const [drvRes, progRes] = await Promise.all([
      driversQ,
      supabase.from("training_progress").select("*").eq("module_id", m.id),
    ]);
    const progMap: Record<string, any> = {};
    (progRes.data ?? []).forEach((p: any) => { progMap[p.driver_id] = p; });
    const list = (drvRes.data ?? []).map((d: any) => ({ ...d, progress: progMap[d.id] }));
    list.sort((a, b) => {
      const sa = a.progress?.status ?? "not_started";
      const sb = b.progress?.status ?? "not_started";
      const order: Record<string, number> = { completed: 0, in_progress: 1, not_started: 2 };
      return (order[sa] ?? 3) - (order[sb] ?? 3);
    });
    setRoster(list);
    setRosterLoading(false);
  };

  const exportCSV = () => {
    if (!selected) return;
    const rows = [["Chauffeur", "Téléphone", "Statut", "Progression %", "Score", "Démarré", "Terminé"]];
    roster.forEach((r) => {
      const p = r.progress;
      rows.push([
        r.full_name ?? "",
        r.phone ?? "",
        p?.status ?? "not_started",
        String(p?.progress_percent ?? 0),
        p?.score != null ? String(p.score) : "",
        p?.started_at ? format(new Date(p.started_at), "dd/MM/yyyy HH:mm") : "",
        p?.completed_at ? format(new Date(p.completed_at), "dd/MM/yyyy HH:mm") : "",
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `formation-${selected.title.replace(/\W+/g, "_")}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const sendReminders = async () => {
    const res = await supabase.functions.invoke("training-reminders", { body: { module_id: selected?.id } });
    if (res.error) toast.error("Erreur: " + res.error.message);
    else toast.success(`Rappels envoyés à ${res.data?.sent ?? 0} chauffeurs`);
  };

  return (
    <>
      <Card>
        <CardHeader><CardTitle>Suivi des formations</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-center py-6 text-muted-foreground">Chargement…</p> :
            modules.length === 0 ? <p className="text-center py-6 text-muted-foreground">Aucun module à suivre</p> :
            <Table>
              <TableHeader><TableRow>
                <TableHead>Module</TableHead>
                <TableHead>Chauffeurs</TableHead>
                <TableHead>Terminé</TableHead>
                <TableHead>En cours</TableHead>
                <TableHead>Non démarré</TableHead>
                <TableHead>Taux</TableHead>
                <TableHead>Score moy.</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {modules.map((m) => {
                  const s = stats[m.id];
                  const rate = s ? Number(s.completion_rate) : 0;
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="font-medium">{m.title}</div>
                        <div className="flex gap-1 mt-1">
                          {m.is_mandatory && <Badge variant="outline" className="text-[10px]">Obligatoire</Badge>}
                          {!m.is_published && <Badge variant="secondary" className="text-[10px]">Brouillon</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{s?.total_drivers ?? "—"}</TableCell>
                      <TableCell className="text-green-600 font-medium">{s?.completed ?? 0}</TableCell>
                      <TableCell className="text-amber-600">{s?.in_progress ?? 0}</TableCell>
                      <TableCell className="text-muted-foreground">{s?.not_started ?? 0}</TableCell>
                      <TableCell>
                        <Badge variant={rate >= 70 ? "default" : rate >= 30 ? "secondary" : "outline"}>{rate}%</Badge>
                      </TableCell>
                      <TableCell>{s?.avg_score ? `${s.avg_score}%` : "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openRoster(m)}>Détails</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-sm text-muted-foreground">{roster.length} chauffeur(s)</p>
            <div className="flex gap-2">
              {selected?.is_mandatory && (
                <Button size="sm" variant="outline" onClick={sendReminders}>
                  <Bell className="h-4 w-4 mr-1" /> Envoyer rappels
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={exportCSV}>Export CSV</Button>
            </div>
          </div>
          {rosterLoading ? <p className="text-center py-6 text-muted-foreground">Chargement…</p> :
            <Table>
              <TableHeader><TableRow>
                <TableHead>Chauffeur</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Terminé le</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {roster.map((r) => {
                  const p = r.progress;
                  const status = p?.status ?? "not_started";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.full_name}</TableCell>
                      <TableCell className="text-xs">{r.phone}</TableCell>
                      <TableCell>
                        {status === "completed" ? (
                          <Badge className="bg-green-600 hover:bg-green-700"><CheckCircle2 className="h-3 w-3 mr-1" /> Terminé</Badge>
                        ) : status === "in_progress" ? (
                          <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> En cours ({p.progress_percent}%)</Badge>
                        ) : (
                          <Badge variant="outline"><Circle className="h-3 w-3 mr-1" /> Non démarré</Badge>
                        )}
                      </TableCell>
                      <TableCell>{p?.score != null ? `${p.score}%` : "—"}</TableCell>
                      <TableCell className="text-xs">{p?.completed_at ? format(new Date(p.completed_at), "dd/MM/yyyy HH:mm", { locale: fr }) : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------- Formations ---------------- */
function ModulesTab({ modules, loading, reload }: { modules: Module[]; loading: boolean; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Module | null>(null);
  const [form, setForm] = useState<any>({});

  const openNew = () => { setEditing(null); setForm({ title: "", description: "", category: "safety", video_url: "", duration_minutes: 5, is_mandatory: false, is_published: true, order_index: 0 }); setOpen(true); };
  const openEdit = (m: Module) => { setEditing(m); setForm(m); setOpen(true); };

  const save = async () => {
    const payload = {
      title: form.title, description: form.description, category: form.category,
      video_url: form.video_url || null, content: form.content || null,
      duration_minutes: Number(form.duration_minutes) || 0,
      order_index: Number(form.order_index) || 0,
      is_mandatory: !!form.is_mandatory, is_published: !!form.is_published,
    };
    const res = editing
      ? await supabase.from("training_modules").update(payload).eq("id", editing.id)
      : await supabase.from("training_modules").insert(payload);
    if (res.error) toast.error(res.error.message);
    else { toast.success(editing ? "Module modifié" : "Module créé"); setOpen(false); reload(); }
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer ce module ?")) return;
    const { error } = await supabase.from("training_modules").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Supprimé"); reload(); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Modules de formation</CardTitle>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nouveau module</Button>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-center py-6 text-muted-foreground">Chargement…</p> :
          modules.length === 0 ? <p className="text-center py-6 text-muted-foreground">Aucun module</p> :
          <Table>
            <TableHeader><TableRow>
              <TableHead>Titre</TableHead><TableHead>Catégorie</TableHead><TableHead>Durée</TableHead>
              <TableHead>Statut</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {modules.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="font-medium">{m.title}</div>
                    {m.description && <div className="text-xs text-muted-foreground line-clamp-1">{m.description}</div>}
                  </TableCell>
                  <TableCell>{CATEGORIES.find((c) => c.value === m.category)?.label ?? m.category}</TableCell>
                  <TableCell>{m.duration_minutes} min</TableCell>
                  <TableCell>
                    <Badge variant={m.is_published ? "default" : "secondary"}>{m.is_published ? "Publié" : "Brouillon"}</Badge>
                    {m.is_mandatory && <Badge className="ml-1" variant="outline">Obligatoire</Badge>}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(m.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Modifier le module" : "Nouveau module"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Titre</Label><Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Catégorie</Label>
                <Select value={form.category ?? "safety"} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Durée (min)</Label><Input type="number" value={form.duration_minutes ?? 0} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} /></div>
            </div>
            <div><Label>Lien vidéo (YouTube/MP4)</Label><Input value={form.video_url ?? ""} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="https://" /></div>
            <div><Label>Contenu texte</Label><Textarea rows={4} value={form.content ?? ""} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between"><Label>Obligatoire</Label><Switch checked={!!form.is_mandatory} onCheckedChange={(v) => setForm({ ...form, is_mandatory: v })} /></div>
              <div className="flex items-center justify-between"><Label>Publié</Label><Switch checked={!!form.is_published} onCheckedChange={(v) => setForm({ ...form, is_published: v })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={save}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------------- Broadcasts ---------------- */
function BroadcastsTab({ broadcasts, loading, reload }: { broadcasts: Broadcast[]; loading: boolean; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ title: "", message: "", audience: "all", channel: "in_app" });
  const [sending, setSending] = useState(false);

  const create = async (send: boolean) => {
    if (!form.title || !form.message) { toast.error("Titre et message requis"); return; }
    setSending(true);
    const { data, error } = await supabase.from("broadcasts").insert({
      title: form.title, message: form.message, audience: form.audience,
      channel: form.channel, status: send ? "sending" : "draft",
    }).select().single();
    if (error) { toast.error(error.message); setSending(false); return; }
    if (send) {
      const res = await supabase.functions.invoke("send-broadcast", { body: { broadcast_id: data.id } });
      if (res.error) toast.error("Erreur d'envoi: " + res.error.message);
      else toast.success(`Envoyé à ${res.data?.delivered ?? 0} chauffeurs`);
    } else {
      toast.success("Brouillon enregistré");
    }
    setSending(false); setOpen(false); reload();
  };

  const sendDraft = async (id: string) => {
    const res = await supabase.functions.invoke("send-broadcast", { body: { broadcast_id: id } });
    if (res.error) toast.error("Erreur: " + res.error.message);
    else { toast.success(`Envoyé à ${res.data?.delivered ?? 0} chauffeurs`); reload(); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Campagnes marketing</CardTitle>
        <Button onClick={() => { setForm({ title: "", message: "", audience: "all", channel: "in_app" }); setOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Nouvelle campagne</Button>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-center py-6 text-muted-foreground">Chargement…</p> :
          broadcasts.length === 0 ? <p className="text-center py-6 text-muted-foreground">Aucune diffusion</p> :
          <Table>
            <TableHeader><TableRow>
              <TableHead>Titre</TableHead><TableHead>Audience</TableHead><TableHead>Canal</TableHead>
              <TableHead>Statut</TableHead><TableHead>Envoyés</TableHead><TableHead>Date</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {broadcasts.map((b) => (
                <TableRow key={b.id}>
                  <TableCell><div className="font-medium">{b.title}</div><div className="text-xs text-muted-foreground line-clamp-1">{b.message}</div></TableCell>
                  <TableCell>{AUDIENCES.find(a => a.value === b.audience)?.label ?? b.audience}</TableCell>
                  <TableCell>{b.channel}</TableCell>
                  <TableCell><Badge variant={b.status === "sent" ? "default" : "secondary"}>{b.status}</Badge></TableCell>
                  <TableCell>{b.delivered_count}/{b.recipient_count}</TableCell>
                  <TableCell className="text-xs">{format(new Date(b.created_at), "dd/MM HH:mm", { locale: fr })}</TableCell>
                  <TableCell>{b.status === "draft" && <Button size="sm" onClick={() => sendDraft(b.id)}>Envoyer</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouvelle diffusion</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Titre</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Message</Label><Textarea rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Audience</Label>
                <Select value={form.audience} onValueChange={(v) => setForm({ ...form, audience: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{AUDIENCES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Canal</Label>
                <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_app">Dans l'app</SelectItem>
                    <SelectItem value="push">Push</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => create(false)} disabled={sending}>Brouillon</Button>
            <Button onClick={() => create(true)} disabled={sending}><Send className="h-4 w-4 mr-1" /> Envoyer maintenant</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------------- Ads ---------------- */
function AdsTab({ ads, loading, reload }: { ads: Ad[]; loading: boolean; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Ad | null>(null);
  const [form, setForm] = useState<any>({});

  const openNew = () => { setEditing(null); setForm({ title: "", body: "", placement: "home_banner", is_active: true, priority: 0 }); setOpen(true); };
  const openEdit = (a: Ad) => { setEditing(a); setForm({ ...a, starts_at: a.starts_at?.slice(0, 16), ends_at: a.ends_at?.slice(0, 16) }); setOpen(true); };

  const save = async () => {
    const payload: any = {
      title: form.title, body: form.body || null, image_url: form.image_url || null,
      cta_label: form.cta_label || null, cta_url: form.cta_url || null,
      placement: form.placement, priority: Number(form.priority) || 0,
      is_active: !!form.is_active,
    };
    if (form.starts_at) payload.starts_at = new Date(form.starts_at).toISOString();
    if (form.ends_at) payload.ends_at = new Date(form.ends_at).toISOString();
    const res = editing
      ? await supabase.from("driver_ads").update(payload).eq("id", editing.id)
      : await supabase.from("driver_ads").insert(payload);
    if (res.error) toast.error(res.error.message);
    else { toast.success("Enregistré"); setOpen(false); reload(); }
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer cette annonce ?")) return;
    const { error } = await supabase.from("driver_ads").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Supprimée"); reload(); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Publicités & Bannières</CardTitle>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nouvelle publicité</Button>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-center py-6 text-muted-foreground">Chargement…</p> :
          ads.length === 0 ? <p className="text-center py-6 text-muted-foreground">Aucune annonce</p> :
          <Table>
            <TableHeader><TableRow>
              <TableHead>Titre</TableHead><TableHead>Emplacement</TableHead><TableHead>Période</TableHead>
              <TableHead>Vues</TableHead><TableHead>Clics</TableHead><TableHead>Statut</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {ads.map((a) => (
                <TableRow key={a.id}>
                  <TableCell><div className="font-medium">{a.title}</div></TableCell>
                  <TableCell className="text-xs">{a.placement}</TableCell>
                  <TableCell className="text-xs">{format(new Date(a.starts_at), "dd/MM", { locale: fr })} → {a.ends_at ? format(new Date(a.ends_at), "dd/MM", { locale: fr }) : "—"}</TableCell>
                  <TableCell>{a.view_count}</TableCell>
                  <TableCell>{a.click_count}</TableCell>
                  <TableCell><Badge variant={a.is_active ? "default" : "secondary"}>{a.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(a.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Modifier l'annonce" : "Nouvelle annonce"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Titre</Label><Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Texte</Label><Textarea value={form.body ?? ""} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
            <div><Label>Image (URL)</Label><Input value={form.image_url ?? ""} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Texte du bouton</Label><Input value={form.cta_label ?? ""} onChange={(e) => setForm({ ...form, cta_label: e.target.value })} /></div>
              <div><Label>Lien du bouton</Label><Input value={form.cta_url ?? ""} onChange={(e) => setForm({ ...form, cta_url: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Emplacement</Label>
                <Select value={form.placement ?? "home_banner"} onValueChange={(v) => setForm({ ...form, placement: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="home_banner">Bannière accueil</SelectItem>
                    <SelectItem value="formation_banner">Bannière formation</SelectItem>
                    <SelectItem value="rentals_banner">Bannière locations</SelectItem>
                    <SelectItem value="popup">Pop-up</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Priorité</Label><Input type="number" value={form.priority ?? 0} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Début</Label><Input type="datetime-local" value={form.starts_at ?? ""} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></div>
              <div><Label>Fin</Label><Input type="datetime-local" value={form.ends_at ?? ""} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></div>
            </div>
            <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={!!form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={save}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}