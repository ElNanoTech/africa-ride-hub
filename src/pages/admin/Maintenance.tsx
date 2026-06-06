import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { HeroCard } from '@/components/admin/HeroCard';
import { KpiTile } from '@/components/admin/KpiTile';
import { PillTabs } from '@/components/admin/PillTabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Wrench, ClipboardList, KanbanSquare, Banknote, Building2, Plus, CheckCircle2, Clock, ListChecks, Car, Trash2 } from 'lucide-react';
import { supabase as _supabase } from '@/integrations/supabase/routeClient';
const supabase = _supabase as any;
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

type OrderStatus = 'draft' | 'to_validate' | 'in_progress' | 'completed' | 'cancelled';

const STATUS_LABEL: Record<OrderStatus, string> = {
  draft: 'Brouillon',
  to_validate: 'À valider',
  in_progress: 'En cours',
  completed: 'Terminé',
  cancelled: 'Annulé',
};

const STATUS_COLOR: Record<OrderStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  to_validate: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  cancelled: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
};

const ORDER_TYPES = [
  { value: 'repair', label: 'Réparation' },
  { value: 'service', label: 'Entretien' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'tire', label: 'Pneus' },
  { value: 'body', label: 'Carrosserie' },
  { value: 'other', label: 'Autre' },
];

const CHARGE_TYPES = [
  { value: 'insurance', label: 'Assurance' },
  { value: 'sub_rental', label: 'Sous-location' },
  { value: 'tax', label: 'Taxe' },
  { value: 'registration', label: 'Immatriculation' },
  { value: 'other', label: 'Autre' },
];

function fcfa(n: number) {
  return new Intl.NumberFormat('fr-FR').format(n || 0) + ' FCFA';
}

export default function Maintenance() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'dashboard' | 'orders' | 'kanban' | 'charges' | 'providers'>('dashboard');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [search, setSearch] = useState('');
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [showProviderDialog, setShowProviderDialog] = useState(false);
  const [showChargeDialog, setShowChargeDialog] = useState(false);

  const { data: orders = [] } = useQuery<any[]>({
    queryKey: ['maintenance', 'orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_orders')
        .select('*, vehicles:vehicles!maintenance_orders_vehicle_id_fkey ( id, license_plate, make, model ), provider:maintenance_providers ( id, name )')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: providers = [] } = useQuery<any[]>({
    queryKey: ['maintenance', 'providers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_providers')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: charges = [] } = useQuery<any[]>({
    queryKey: ['maintenance', 'charges'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('other_charges')
        .select('*, vehicles:vehicles!other_charges_vehicle_id_fkey ( id, license_plate, make, model )')
        .order('charge_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: vehicles = [] } = useQuery<any[]>({
    queryKey: ['maintenance', 'vehicles-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, license_plate, make, model')
        .order('license_plate');
      if (error) throw error;
      return data || [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      const patch: any = { status };
      if (status === 'in_progress') patch.started_at = new Date().toISOString();
      if (status === 'completed') patch.completed_at = new Date().toISOString();
      const { error } = await supabase.from('maintenance_orders').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance', 'orders'] });
      toast.success('Statut mis à jour');
    },
    onError: (e: any) => toast.error(e?.message || 'Erreur'),
  });

  const deleteOrder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('maintenance_orders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance', 'orders'] });
      toast.success('Ordre supprimé');
    },
  });

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const v = o.vehicles;
        const haystack = [
          v?.license_plate, v?.make, v?.model, o.description, o.order_number, o.provider?.name,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(s)) return false;
      }
      return true;
    });
  }, [orders, statusFilter, search]);

  const kpis = useMemo(() => {
    const total = orders.length;
    const toValidate = orders.filter((o) => o.status === 'to_validate').length;
    const inProgress = orders.filter((o) => o.status === 'in_progress').length;
    const completed = orders.filter((o) => o.status === 'completed');
    const totalCost = completed.reduce((s, o) => s + (o.actual_cost || 0), 0)
      + charges.reduce((s, c) => s + (c.amount || 0), 0);
    const busyVehicleIds = new Set(orders.filter((o) => o.status === 'in_progress').map((o) => o.vehicle_id));
    const fleetAvailable = Math.max(0, vehicles.length - busyVehicleIds.size);
    return { total, toValidate, inProgress, totalCost, fleetAvailable, fleetTotal: vehicles.length };
  }, [orders, charges, vehicles]);

  const ordersByStatus = useMemo(() => {
    const map: Record<OrderStatus, any[]> = { draft: [], to_validate: [], in_progress: [], completed: [], cancelled: [] };
    orders.forEach((o) => { map[o.status as OrderStatus]?.push(o); });
    return map;
  }, [orders]);

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6">
        <AdminBreadcrumb items={[{ label: 'Maintenance' }]} />

        <HeroCard
          icon={Wrench}
          title="Maintenance & Charges"
          subtitle="Ordres de travail, suivi atelier, prestataires et autres charges flotte"
          actions={
            <Button onClick={() => setShowOrderDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Nouvel ordre
            </Button>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiTile icon={ListChecks} label="Total ordres" value={String(kpis.total)} />
          <KpiTile icon={Clock} label="À valider" value={String(kpis.toValidate)} tone="warning" />
          <KpiTile icon={Wrench} label="En cours" value={String(kpis.inProgress)} tone="info" />
          <KpiTile icon={Banknote} label="Coût total" value={fcfa(kpis.totalCost)} />
          <KpiTile icon={Car} label="Dispo flotte" value={`${kpis.fleetAvailable}/${kpis.fleetTotal}`} tone="success" />
        </div>

        <PillTabs
          value={tab}
          onValueChange={(v) => setTab(v as any)}
          tabs={[
            { value: 'dashboard', label: 'Tableau de bord' },
            { value: 'orders', label: 'Ordres' },
            { value: 'kanban', label: 'Suivi Kanban' },
            { value: 'charges', label: 'Autres charges' },
            { value: 'providers', label: 'Prestataires' },
          ]}
        />

        {tab === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Répartition par statut</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => {
                  const count = ordersByStatus[s].length;
                  const pct = orders.length ? Math.round((count / orders.length) * 100) : 0;
                  return (
                    <div key={s} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{STATUS_LABEL[s]}</span>
                        <span className="text-muted-foreground">{count} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-muted rounded overflow-hidden">
                        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Top 5 véhicules (coût)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(
                  orders.filter((o) => o.status === 'completed').reduce<Record<string, number>>((acc, o) => {
                    const key = o.vehicles?.license_plate || 'Inconnu';
                    acc[key] = (acc[key] || 0) + (o.actual_cost || 0);
                    return acc;
                  }, {})
                )
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([plate, cost]) => (
                    <div key={plate} className="flex justify-between text-sm border-b border-border/40 pb-1.5">
                      <span className="font-medium">{plate}</span>
                      <span className="text-muted-foreground">{fcfa(cost)}</span>
                    </div>
                  ))}
                {orders.filter((o) => o.status === 'completed').length === 0 && (
                  <p className="text-sm text-muted-foreground">Aucun ordre terminé</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Par type d'ordre</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {ORDER_TYPES.map((t) => {
                  const count = orders.filter((o) => o.order_type === t.value).length;
                  return (
                    <div key={t.value} className="flex justify-between text-sm">
                      <span>{t.label}</span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Autres charges (récap)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {CHARGE_TYPES.map((t) => {
                  const items = charges.filter((c) => c.charge_type === t.value);
                  const sum = items.reduce((s, c) => s + (c.amount || 0), 0);
                  return (
                    <div key={t.value} className="flex justify-between text-sm">
                      <span>{t.label} ({items.length})</span>
                      <span className="text-muted-foreground">{fcfa(sum)}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === 'orders' && (
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex flex-col md:flex-row gap-2">
                <Input placeholder="Rechercher plaque, modèle, n° ordre…" value={search} onChange={(e) => setSearch(e.target.value)} className="md:max-w-sm" />
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les statuts</SelectItem>
                    {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                {filteredOrders.map((o) => (
                  <div key={o.id} className="flex flex-col md:flex-row md:items-center gap-3 p-3 border border-border rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{o.vehicles?.license_plate || '—'}</span>
                        <span className="text-sm text-muted-foreground">{o.vehicles?.make} {o.vehicles?.model}</span>
                        <Badge className={STATUS_COLOR[o.status as OrderStatus]}>{STATUS_LABEL[o.status as OrderStatus]}</Badge>
                        <Badge variant="outline">{ORDER_TYPES.find((t) => t.value === o.order_type)?.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">{o.description || 'Pas de description'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {o.provider?.name ? `Prestataire: ${o.provider.name} · ` : ''}
                        Créé le {format(new Date(o.created_at), 'dd MMM yyyy', { locale: fr })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className="text-sm font-semibold">{fcfa(o.actual_cost || o.estimated_cost)}</p>
                        <p className="text-xs text-muted-foreground">{o.actual_cost ? 'réel' : 'estimé'}</p>
                      </div>
                      <Select value={o.status} onValueChange={(v) => updateStatus.mutate({ id: o.id, status: v as OrderStatus })}>
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => (
                            <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="icon" variant="ghost" onClick={() => { if (confirm('Supprimer cet ordre ?')) deleteOrder.mutate(o.id); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
                {filteredOrders.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">Aucun ordre</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {tab === 'kanban' && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 overflow-x-auto">
            {(['draft', 'to_validate', 'in_progress', 'completed', 'cancelled'] as OrderStatus[]).map((s) => (
              <div key={s} className="bg-muted/30 rounded-lg p-3 min-h-[300px]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">{STATUS_LABEL[s]}</h3>
                  <Badge variant="outline">{ordersByStatus[s].length}</Badge>
                </div>
                <div className="space-y-2">
                  {ordersByStatus[s].map((o) => (
                    <Card key={o.id} className="p-2.5 cursor-pointer hover:shadow-md transition-shadow">
                      <div className="text-sm font-medium">{o.vehicles?.license_plate || '—'}</div>
                      <div className="text-xs text-muted-foreground truncate">{o.description}</div>
                      <div className="flex items-center justify-between mt-1.5">
                        <Badge variant="outline" className="text-[10px]">{ORDER_TYPES.find((t) => t.value === o.order_type)?.label}</Badge>
                        <span className="text-xs font-semibold">{fcfa(o.actual_cost || o.estimated_cost)}</span>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'charges' && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">Autres charges</h3>
                <Button size="sm" onClick={() => setShowChargeDialog(true)} className="gap-2"><Plus className="h-4 w-4" /> Ajouter</Button>
              </div>
              <div className="space-y-2">
                {charges.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 p-3 border border-border rounded-lg">
                    <Badge variant="outline">{CHARGE_TYPES.find((t) => t.value === c.charge_type)?.label}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{c.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.vehicles?.license_plate ? `${c.vehicles.license_plate} · ` : ''}
                        {format(new Date(c.charge_date), 'dd MMM yyyy', { locale: fr })}
                        {c.provider_name ? ` · ${c.provider_name}` : ''}
                      </p>
                    </div>
                    <span className="font-semibold">{fcfa(c.amount)}</span>
                    <Button size="icon" variant="ghost" onClick={async () => {
                      if (!confirm('Supprimer cette charge ?')) return;
                      const { error } = await supabase.from('other_charges').delete().eq('id', c.id);
                      if (error) toast.error(error.message);
                      else { qc.invalidateQueries({ queryKey: ['maintenance', 'charges'] }); toast.success('Supprimé'); }
                    }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                {charges.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Aucune charge</p>}
              </div>
            </CardContent>
          </Card>
        )}

        {tab === 'providers' && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">Prestataires</h3>
                <Button size="sm" onClick={() => setShowProviderDialog(true)} className="gap-2"><Plus className="h-4 w-4" /> Ajouter</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {providers.map((p) => (
                  <Card key={p.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{p.name}</p>
                        {p.specialty && <p className="text-xs text-muted-foreground">{p.specialty}</p>}
                      </div>
                      <Badge variant={p.is_active ? 'default' : 'secondary'}>{p.is_active ? 'Actif' : 'Inactif'}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                      {p.phone && <p>📞 {p.phone}</p>}
                      {p.email && <p>✉️ {p.email}</p>}
                      {(p.city || p.address) && <p>📍 {[p.address, p.city].filter(Boolean).join(', ')}</p>}
                    </div>
                    <div className="mt-2 flex justify-end">
                      <Button size="sm" variant="ghost" onClick={async () => {
                        if (!confirm('Supprimer ce prestataire ?')) return;
                        const { error } = await supabase.from('maintenance_providers').delete().eq('id', p.id);
                        if (error) toast.error(error.message);
                        else { qc.invalidateQueries({ queryKey: ['maintenance', 'providers'] }); toast.success('Supprimé'); }
                      }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </Card>
                ))}
                {providers.length === 0 && <p className="text-sm text-muted-foreground text-center py-8 col-span-full">Aucun prestataire</p>}
              </div>
            </CardContent>
          </Card>
        )}

        <OrderDialog
          open={showOrderDialog}
          onOpenChange={setShowOrderDialog}
          vehicles={vehicles}
          providers={providers}
          onCreated={() => qc.invalidateQueries({ queryKey: ['maintenance', 'orders'] })}
        />
        <ProviderDialog
          open={showProviderDialog}
          onOpenChange={setShowProviderDialog}
          onCreated={() => qc.invalidateQueries({ queryKey: ['maintenance', 'providers'] })}
        />
        <ChargeDialog
          open={showChargeDialog}
          onOpenChange={setShowChargeDialog}
          vehicles={vehicles}
          onCreated={() => qc.invalidateQueries({ queryKey: ['maintenance', 'charges'] })}
        />
      </div>
    </AdminLayout>
  );
}

function OrderDialog({ open, onOpenChange, vehicles, providers, onCreated }: any) {
  const [form, setForm] = useState({
    vehicle_id: '', provider_id: '', order_type: 'repair', priority: 'normal',
    description: '', scheduled_date: '', estimated_cost: '',
  });
  const submit = async () => {
    if (!form.vehicle_id) return toast.error('Sélectionnez un véhicule');
    const { error } = await supabase.from('maintenance_orders').insert({
      vehicle_id: form.vehicle_id,
      provider_id: form.provider_id || null,
      order_type: form.order_type,
      priority: form.priority,
      description: form.description || null,
      scheduled_date: form.scheduled_date || null,
      estimated_cost: parseInt(form.estimated_cost || '0', 10) || 0,
      status: 'to_validate',
    });
    if (error) return toast.error(error.message);
    toast.success('Ordre créé');
    onCreated();
    onOpenChange(false);
    setForm({ vehicle_id: '', provider_id: '', order_type: 'repair', priority: 'normal', description: '', scheduled_date: '', estimated_cost: '' });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nouvel ordre de travail</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Véhicule</Label>
            <Select value={form.vehicle_id} onValueChange={(v) => setForm({ ...form, vehicle_id: v })}>
              <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
              <SelectContent>
                {vehicles.map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>{v.license_plate} — {v.make} {v.model}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Prestataire</Label>
            <Select value={form.provider_id || 'none'} onValueChange={(v) => setForm({ ...form, provider_id: v === 'none' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun</SelectItem>
                {providers.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={form.order_type} onValueChange={(v) => setForm({ ...form, order_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ORDER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priorité</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Basse</SelectItem>
                  <SelectItem value="normal">Normale</SelectItem>
                  <SelectItem value="high">Haute</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date prévue</Label>
              <Input type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} />
            </div>
            <div>
              <Label>Coût estimé (FCFA)</Label>
              <Input type="number" value={form.estimated_cost} onChange={(e) => setForm({ ...form, estimated_cost: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit}>Créer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProviderDialog({ open, onOpenChange, onCreated }: any) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', city: '', specialty: '' });
  const submit = async () => {
    if (!form.name) return toast.error('Nom requis');
    const { error } = await supabase.from('maintenance_providers').insert(form);
    if (error) return toast.error(error.message);
    toast.success('Prestataire ajouté');
    onCreated();
    onOpenChange(false);
    setForm({ name: '', phone: '', email: '', address: '', city: '', specialty: '' });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nouveau prestataire</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nom</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Spécialité</Label><Input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="Mécanique générale, carrosserie…" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Téléphone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <div><Label>Adresse</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><Label>Ville</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit}>Créer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChargeDialog({ open, onOpenChange, vehicles, onCreated }: any) {
  const [form, setForm] = useState({
    charge_type: 'insurance', label: '', amount: '', charge_date: new Date().toISOString().slice(0, 10),
    period_start: '', period_end: '', vehicle_id: '', provider_name: '', reference: '',
  });
  const submit = async () => {
    if (!form.label || !form.amount) return toast.error('Libellé et montant requis');
    const { error } = await supabase.from('other_charges').insert({
      charge_type: form.charge_type,
      label: form.label,
      amount: parseInt(form.amount, 10) || 0,
      charge_date: form.charge_date,
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      vehicle_id: form.vehicle_id || null,
      provider_name: form.provider_name || null,
      reference: form.reference || null,
    });
    if (error) return toast.error(error.message);
    toast.success('Charge ajoutée');
    onCreated();
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nouvelle charge</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Type</Label>
            <Select value={form.charge_type} onValueChange={(v) => setForm({ ...form, charge_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CHARGE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Libellé</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Montant (FCFA)</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div><Label>Date</Label><Input type="date" value={form.charge_date} onChange={(e) => setForm({ ...form, charge_date: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Période début</Label><Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></div>
            <div><Label>Période fin</Label><Input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></div>
          </div>
          <div>
            <Label>Véhicule (optionnel)</Label>
            <Select value={form.vehicle_id || 'none'} onValueChange={(v) => setForm({ ...form, vehicle_id: v === 'none' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun</SelectItem>
                {vehicles.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.license_plate}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Prestataire</Label><Input value={form.provider_name} onChange={(e) => setForm({ ...form, provider_name: e.target.value })} /></div>
            <div><Label>Référence</Label><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit}>Créer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}