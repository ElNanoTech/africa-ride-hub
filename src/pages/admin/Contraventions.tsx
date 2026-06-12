import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { useAdminUser } from '@/hooks/useAdminUser';
import {
  VIOLATION_STATUS_LABEL as STATUS_LABEL,
  VIOLATION_STATUS_CLASS as STATUS_COLOR,
  type ViolationStatus,
} from '@/lib/violations';

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

/** Display name of an attributed driver (first/last may be null — fall back to full_name). */
function violationDriverName(d: { first_name?: string | null; last_name?: string | null; full_name?: string | null } | null): string | null {
  if (!d) return null;
  const name = `${d.first_name || ''} ${d.last_name || ''}`.trim();
  return name || d.full_name || null;
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
      // traffic_violations has NO foreign keys on vehicle_id/driver_id, so
      // PostgREST embeds are impossible (the whole query would 400). Fetch the
      // rows, then resolve the linked drivers/vehicles with two batched
      // lookups joined client-side. The vehicle display falls back to the
      // row's own license_plate text column.
      const { data, error } = await supabase
        .from('traffic_violations')
        .select('*')
        .order('violation_date', { ascending: false });
      if (error) throw error;
      const rows: any[] = data || [];

      const driverIds = [...new Set(rows.map((r) => r.driver_id).filter(Boolean))];
      const vehicleIds = [...new Set(rows.map((r) => r.vehicle_id).filter(Boolean))];
      const [driversRes, vehiclesRes] = await Promise.all([
        driverIds.length
          ? supabase.from('drivers').select('id, first_name, last_name, full_name').in('id', driverIds)
          : Promise.resolve({ data: [], error: null }),
        vehicleIds.length
          ? supabase.from('vehicles').select('id, license_plate, make, model:model_name').in('id', vehicleIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (driversRes.error) throw driversRes.error;
      if (vehiclesRes.error) throw vehiclesRes.error;
      const driverById = new Map((driversRes.data || []).map((d: any) => [d.id, d]));
      const vehicleById = new Map((vehiclesRes.data || []).map((v: any) => [v.id, v]));
      return rows.map((r) => ({
        ...r,
        drivers: r.driver_id ? driverById.get(r.driver_id) ?? null : null,
        vehicles: r.vehicle_id ? vehicleById.get(r.vehicle_id) ?? null : null,
      }));
    },
  });

  const { data: vehicles = [] } = useQuery<any[]>({
    queryKey: ['contraventions', 'vehicles-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vehicles').select('id, license_plate, make, model:model_name, customer_id').order('license_plate');
      if (error) throw error;
      return data || [];
    },
  });

  const { customerId } = useAdminUser();

  const filtered = useMemo(() => {
    return violations.filter((v) => {
      if (tab !== 'all' && v.status !== tab) return false;
      if (search) {
        const s = search.toLowerCase();
        const driver = violationDriverName(v.drivers) || '';
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
        violationDriverName(v.drivers) || '',
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
                      {violationDriverName(v.drivers) ? ` · ${violationDriverName(v.drivers)}` : ' · Non attribué'}
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
          customerId={customerId}
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

function AddViolationDialog({ open, onOpenChange, vehicles, customerId, onCreated }: any) {
  const [form, setForm] = useState({
    license_plate: '', pv_number: '', violation_type: 'Excès de vitesse',
    violation_date: new Date().toISOString().slice(0, 16), location: '',
    amount: '', vehicle_id: '', notes: '',
  });

  const submit = async () => {
    if (!form.license_plate || !form.amount) return toast.error('Plaque et montant requis');
    // Auto-derive customer_id from selected vehicle if present, otherwise from
    // current admin scope. Required so customer-restricted admins can see the
    // row they just created (RLS scopes by customer_id).
    let resolvedCustomerId: string | null = customerId ?? null;
    if (form.vehicle_id) {
      const veh = vehicles.find((v: any) => v.id === form.vehicle_id);
      if (veh?.customer_id) resolvedCustomerId = veh.customer_id;
    }
    if (!resolvedCustomerId && form.license_plate) {
      const { data: veh } = await supabase
        .from('vehicles')
        .select('customer_id')
        .ilike('license_plate', form.license_plate.toUpperCase().trim())
        .maybeSingle();
      if (veh?.customer_id) resolvedCustomerId = veh.customer_id;
    }
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
      customer_id: resolvedCustomerId,
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

function ViolationDetailDrawer({ violation, onClose, onChanged }: { violation: any | null; onClose: () => void; onChanged: () => void }) {
  const [notes, setNotes] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset local state when violation changes
  const id = violation?.id;
  useEffect(() => {
    setNotes(violation?.notes || '');
    setPaymentRef(violation?.payment_reference || '');
  }, [id, violation?.notes, violation?.payment_reference]);

  if (!violation) {
    return (
      <Sheet open={false} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent />
      </Sheet>
    );
  }

  const v = violation;
  const driverName = violationDriverName(v.drivers);
  const vehicleLabel = v.vehicles ? `${v.vehicles.license_plate}${v.vehicles.make ? ` — ${v.vehicles.make} ${v.vehicles.model || ''}` : ''}` : null;

  const setStatus = async (status: ViolationStatus) => {
    setSaving(true);
    const patch: any = { status };
    if (status === 'paid' || status === 'liquidated') patch.paid_at = new Date().toISOString();
    const { error } = await supabase.from('traffic_violations').update(patch).eq('id', v.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Statut mis à jour');
    onChanged();
    onClose();
  };

  const saveDetails = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('traffic_violations')
      .update({ notes: notes || null, payment_reference: paymentRef || null })
      .eq('id', v.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Détails enregistrés');
    onChanged();
  };

  return (
    <Sheet open={!!violation} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-primary" /> {v.license_plate}
          </SheetTitle>
          <SheetDescription>{v.violation_type}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={STATUS_COLOR[v.status as ViolationStatus]}>{STATUS_LABEL[v.status as ViolationStatus]}</Badge>
            {v.gps_matched && <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" /> GPS</Badge>}
            <Badge variant="outline">{v.source === 'cgi_portal' ? 'CGI' : v.source === 'import' ? 'Import' : 'Manuel'}</Badge>
            {v.attribution_method && <Badge variant="outline">Attr. {v.attribution_method}</Badge>}
          </div>

          <Card>
            <CardContent className="p-4 space-y-3 text-sm">
              <Row icon={Receipt} label="Montant" value={<span className="font-semibold">{fcfa(v.amount)}</span>} />
              <Row icon={Hash} label="N° PV" value={v.pv_number || '—'} />
              <Row icon={Calendar} label="Date" value={format(new Date(v.violation_date), 'dd MMM yyyy à HH:mm', { locale: fr })} />
              <Row icon={MapPin} label="Lieu" value={v.location || '—'} />
              <Row icon={Car} label="Véhicule" value={vehicleLabel || 'Non lié'} />
              <Row icon={User} label="Chauffeur" value={driverName || 'Non attribué'} />
              {v.payment_due_date && (
                <Row icon={Calendar} label="Échéance" value={format(new Date(v.payment_due_date), 'dd MMM yyyy', { locale: fr })} />
              )}
              {v.paid_at && (
                <Row icon={CheckCircle2} label="Payé le" value={format(new Date(v.paid_at), 'dd MMM yyyy', { locale: fr })} />
              )}
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label>Référence paiement</Label>
            <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="Réf. quittance / virement" />
          </div>

          <div className="space-y-2">
            <Label>Notes internes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex flex-wrap gap-2">
            {v.status !== 'paid' && v.status !== 'liquidated' && (
              <Button size="sm" className="gap-2" onClick={() => setStatus('paid')} disabled={saving}>
                <CheckCircle2 className="h-4 w-4" /> Marquer payé
              </Button>
            )}
            {v.status !== 'contested' && (
              <Button size="sm" variant="outline" onClick={() => setStatus('contested')} disabled={saving}>
                En recours
              </Button>
            )}
            {v.status !== 'cancelled' && (
              <Button size="sm" variant="outline" onClick={() => setStatus('cancelled')} disabled={saving}>
                Annuler
              </Button>
            )}
            {v.pdf_url && (
              <a href={v.pdf_url} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" className="gap-2"><FileText className="h-4 w-4" /> Voir PV</Button>
              </a>
            )}
          </div>

          {v.raw_data && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Données brutes</summary>
              <pre className="mt-2 p-2 bg-muted rounded overflow-x-auto">{JSON.stringify(v.raw_data, null, 2)}</pre>
            </details>
          )}
        </div>

        <SheetFooter className="mt-6">
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          <Button onClick={saveDetails} disabled={saving}>Enregistrer</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Row({ icon: Icon, label, value }: { icon: any; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="flex-1">{value}</span>
    </div>
  );
}