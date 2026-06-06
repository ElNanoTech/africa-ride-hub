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
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Flag, Banknote, CheckCircle2, Car, ExternalLink, Plus, RefreshCw, Wand2, Trash2, MapPin, FileDown, User, Calendar, Hash, FileText, Receipt } from 'lucide-react';
import { supabase as _supabase } from '@/integrations/supabase/routeClient';
const supabase = _supabase as any;
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

type ViolationStatus = 'pending_payment' | 'paid' | 'contested' | 'cancelled' | 'liquidated';

const STATUS_LABEL: Record<ViolationStatus, string> = {
  pending_payment: 'En attente',
  paid: 'Payé',
  liquidated: 'Liquidé',
  contested: 'En recours',
  cancelled: 'Annulé',
};

const STATUS_COLOR: Record<ViolationStatus, string> = {
  pending_payment: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  liquidated: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  contested: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  cancelled: 'bg-muted text-muted-foreground',
};

const VIOLATION_TYPES = [
  'Excès de vitesse',
  'Stationnement interdit',
  'Feu rouge',
  'Ceinture',
  'Téléphone au volant',
  'Défaut de papiers',
  'Surcharge',
  'Autre',
];

function fcfa(n: number) {
  return new Intl.NumberFormat('fr-FR').format(n || 0) + ' FCFA';
}

export default function Contraventions() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'all' | ViolationStatus>('all');
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);

  const { data: violations = [], isLoading } = useQuery<any[]>({
    queryKey: ['contraventions', 'violations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('traffic_violations')
        .select('*, vehicles:vehicles!traffic_violations_vehicle_id_fkey ( id, license_plate, make, model ), drivers:drivers!traffic_violations_driver_id_fkey ( id, first_name, last_name )')
        .order('violation_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: vehicles = [] } = useQuery<any[]>({
    queryKey: ['contraventions', 'vehicles-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vehicles').select('id, license_plate, make, model:model_name').order('license_plate');
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    return violations.filter((v) => {
      if (tab !== 'all' && v.status !== tab) return false;
      if (search) {
        const s = search.toLowerCase();
        const driver = v.drivers ? `${v.drivers.first_name || ''} ${v.drivers.last_name || ''}` : '';
        const hay = [v.license_plate, v.pv_number, v.violation_type, driver, v.location].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [violations, tab, search]);

  const kpis = useMemo(() => {
    const total = violations.length;
    const pending = violations.filter((v) => v.status === 'pending_payment');
    const liquidated = violations.filter((v) => v.status === 'paid' || v.status === 'liquidated');
    const totalAmount = violations.reduce((s, v) => s + (v.amount || 0), 0);
    const vehiclesInvolved = new Set(violations.map((v) => v.vehicle_id || v.license_plate)).size;
    return {
      total,
      pendingCount: pending.length,
      pendingAmount: pending.reduce((s, v) => s + (v.amount || 0), 0),
      liquidatedCount: liquidated.length,
      totalAmount,
      vehiclesInvolved,
    };
  }, [violations]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ViolationStatus }) => {
      const patch: any = { status };
      if (status === 'paid' || status === 'liquidated') patch.paid_at = new Date().toISOString();
      const { error } = await supabase.from('traffic_violations').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contraventions'] }); toast.success('Statut mis à jour'); },
    onError: (e: any) => toast.error(e?.message),
  });

  const deleteViolation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('traffic_violations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contraventions'] }); toast.success('Supprimé'); },
  });

  const runAttribution = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('assign-violations', { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Attribution: ${data?.assigned ?? 0} chauffeurs trouvés, ${data?.unmatched ?? 0} non attribués`);
      qc.invalidateQueries({ queryKey: ['contraventions'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erreur attribution'),
  });

  const handleSyncCgi = () => {
    toast.info('Synchronisation CGI à brancher (en attente des identifiants portail).');
  };

  const exportCsv = () => {
    const rows = [
      ['PV', 'Plaque', 'Type', 'Date', 'Lieu', 'Montant', 'Statut', 'Chauffeur'],
      ...filtered.map((v) => [
        v.pv_number || '',
        v.license_plate || '',
        v.violation_type || '',
        format(new Date(v.violation_date), 'yyyy-MM-dd HH:mm'),
        v.location || '',
        String(v.amount || 0),
        STATUS_LABEL[v.status as ViolationStatus] || v.status,
        v.drivers ? `${v.drivers.first_name || ''} ${v.drivers.last_name || ''}`.trim() : '',
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contraventions-${format(new Date(), 'yyyyMMdd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6">
        <AdminBreadcrumb items={[{ label: 'Contraventions' }]} />

        <HeroCard
          title="Contraventions"
          subtitle="Amendes routières CGI — synchronisation, attribution chauffeur et suivi paiement"
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="gap-2" onClick={handleSyncCgi}>
                <RefreshCw className="h-4 w-4" /> Synchroniser CGI
              </Button>
              <Button variant="secondary" className="gap-2" onClick={() => runAttribution.mutate()} disabled={runAttribution.isPending}>
                <Wand2 className="h-4 w-4" /> Attribuer aux chauffeurs
              </Button>
              <Button onClick={() => setShowAddDialog(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Ajouter
              </Button>
            </div>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiTile icon={Flag} label="En attente paiement" value={kpis.pendingCount} variant="orange" hint={fcfa(kpis.pendingAmount)} />
          <KpiTile icon={CheckCircle2} label="Liquidées" value={kpis.liquidatedCount} variant="green" />
          <KpiTile icon={Car} label="Véhicules impliqués" value={kpis.vehiclesInvolved} variant="blue" />
          <KpiTile icon={Banknote} label="Total" value={fcfa(kpis.totalAmount)} variant="yellow" />
        </div>

        <PillTabs
          value={tab}
          onChange={(v) => setTab(v as any)}
          items={[
            { value: 'all', label: 'Toutes', count: violations.length },
            { value: 'pending_payment', label: 'En attente', count: kpis.pendingCount },
            { value: 'paid', label: 'Payé', count: violations.filter((v) => v.status === 'paid').length },
            { value: 'liquidated', label: 'Liquidé', count: violations.filter((v) => v.status === 'liquidated').length },
            { value: 'contested', label: 'En recours', count: violations.filter((v) => v.status === 'contested').length },
          ]}
        />

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center">
              <Input
                placeholder="Rechercher plaque, PV, chauffeur, type…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="md:max-w-md"
              />
              <div className="flex gap-2 md:ml-auto">
                <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv}>
                  <FileDown className="h-4 w-4" /> Export CSV
                </Button>
                <a href="https://eservices.cgi.ci" target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm" className="gap-2">
                    <ExternalLink className="h-4 w-4" /> Portail CGI
                  </Button>
                </a>
              </div>
            </div>

            <div className="space-y-2">
              {isLoading && <p className="text-sm text-muted-foreground text-center py-8">Chargement…</p>}
              {!isLoading && filtered.map((v) => (
                <div
                  key={v.id}
                  className="flex flex-col md:flex-row md:items-center gap-3 p-3 border border-border rounded-lg hover:bg-muted/40 cursor-pointer transition-colors"
                  onClick={() => setSelected(v)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') setSelected(v); }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{v.license_plate}</span>
                      <Badge className={STATUS_COLOR[v.status as ViolationStatus]}>{STATUS_LABEL[v.status as ViolationStatus]}</Badge>
                      {v.gps_matched && <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" /> GPS</Badge>}
                      {v.pv_number && <Badge variant="outline">PV {v.pv_number}</Badge>}
                      <Badge variant="outline">{v.source === 'cgi_portal' ? 'CGI' : v.source === 'import' ? 'Import' : 'Manuel'}</Badge>
                    </div>
                    <p className="text-sm mt-0.5">{v.violation_type}{v.location ? ` · ${v.location}` : ''}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(v.violation_date), 'dd MMM yyyy à HH:mm', { locale: fr })}
                      {v.drivers ? ` · ${v.drivers.first_name || ''} ${v.drivers.last_name || ''}` : ' · Non attribué'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{fcfa(v.amount)}</p>
                      {v.paid_at && <p className="text-xs text-muted-foreground">Payé {format(new Date(v.paid_at), 'dd/MM', { locale: fr })}</p>}
                    </div>
                    <Select value={v.status} onValueChange={(val) => updateStatus.mutate({ id: v.id, status: val as ViolationStatus })}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(STATUS_LABEL) as ViolationStatus[]).map((s) => (
                          <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {v.pdf_url && (
                      <a href={v.pdf_url} target="_blank" rel="noreferrer">
                        <Button size="icon" variant="ghost"><FileDown className="h-4 w-4" /></Button>
                      </a>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => { if (confirm('Supprimer cette contravention ?')) deleteViolation.mutate(v.id); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              {!isLoading && filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Aucune contravention</p>
              )}
            </div>
          </CardContent>
        </Card>

        <AddViolationDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          vehicles={vehicles}
          onCreated={() => qc.invalidateQueries({ queryKey: ['contraventions'] })}
        />

        <ViolationDetailDrawer
          violation={selected}
          onClose={() => setSelected(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ['contraventions'] })}
        />
      </div>
    </AdminLayout>
  );
}

function AddViolationDialog({ open, onOpenChange, vehicles, onCreated }: any) {
  const [form, setForm] = useState({
    license_plate: '', pv_number: '', violation_type: 'Excès de vitesse',
    violation_date: new Date().toISOString().slice(0, 16), location: '',
    amount: '', vehicle_id: '', notes: '',
  });

  const submit = async () => {
    if (!form.license_plate || !form.amount) return toast.error('Plaque et montant requis');
    const { error } = await supabase.from('traffic_violations').insert({
      license_plate: form.license_plate.toUpperCase().trim(),
      pv_number: form.pv_number || null,
      violation_type: form.violation_type,
      violation_date: new Date(form.violation_date).toISOString(),
      location: form.location || null,
      amount: parseInt(form.amount, 10) || 0,
      vehicle_id: form.vehicle_id || null,
      notes: form.notes || null,
      source: 'manual',
      status: 'pending_payment',
    });
    if (error) return toast.error(error.message);
    toast.success('Contravention enregistrée');
    onCreated();
    onOpenChange(false);
    setForm({ license_plate: '', pv_number: '', violation_type: 'Excès de vitesse', violation_date: new Date().toISOString().slice(0, 16), location: '', amount: '', vehicle_id: '', notes: '' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nouvelle contravention</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Plaque *</Label>
              <Input value={form.license_plate} onChange={(e) => setForm({ ...form, license_plate: e.target.value })} placeholder="1234 AB 01" />
            </div>
            <div>
              <Label>N° PV</Label>
              <Input value={form.pv_number} onChange={(e) => setForm({ ...form, pv_number: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Véhicule lié (optionnel)</Label>
            <Select value={form.vehicle_id || 'none'} onValueChange={(v) => setForm({ ...form, vehicle_id: v === 'none' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Auto via plaque" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Auto (via plaque)</SelectItem>
                {vehicles.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.license_plate} — {v.make} {v.model}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={form.violation_type} onValueChange={(v) => setForm({ ...form, violation_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{VIOLATION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Montant (FCFA) *</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date & heure</Label>
              <Input type="datetime-local" value={form.violation_date} onChange={(e) => setForm({ ...form, violation_date: e.target.value })} />
            </div>
            <div>
              <Label>Lieu</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Cocody, Plateau…" />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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