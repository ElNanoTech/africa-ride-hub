import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CheckCircle2, MoreHorizontal, Receipt, FileText, Scale } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase as _supabase } from '@/integrations/supabase/routeClient';
import { formatCurrency } from '@/lib/format';
import { useAdminUser } from '@/hooks/useAdminUser';
import { CreateInvoiceDialog, type InvoiceDraftLine } from '@/components/admin/CreateInvoiceDialog';
import {
  VIOLATION_STATUS_LABEL,
  VIOLATION_STATUS_CLASS,
  violationChargeReference,
  parseViolationChargeReference,
  type ViolationStatus,
} from '@/lib/violations';
import type { Invoice } from '@/types/billing';

const supabase = _supabase as any;

interface ViolationRow {
  id: string;
  pv_number: string | null;
  violation_type: string;
  violation_date: string;
  location: string | null;
  amount: number;
  status: ViolationStatus | string;
  license_plate: string;
  notes: string | null;
  paid_at: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
}

interface DriverViolationsPanelProps {
  driverId: string;
  driverName: string;
  customerId: string | null;
}

/**
 * CH-P3 — Contraventions (traffic_violations) of this driver. Distinct from
 * the "Tickets" (support) tab — decision D-1. Actions: create a linked
 * other_charges row, bill the driver (generate-invoice), mark paid, contest
 * with a mandatory note ('contested' is a real status value — nothing invented).
 */
export function DriverViolationsPanel({ driverId, driverName, customerId }: DriverViolationsPanelProps) {
  const qc = useQueryClient();
  const { customerId: scopedCustomer } = useAdminUser();

  const [chargeTarget, setChargeTarget] = useState<ViolationRow | null>(null);
  const [contestTarget, setContestTarget] = useState<ViolationRow | null>(null);
  const [contestNote, setContestNote] = useState('');
  const [invoiceTarget, setInvoiceTarget] = useState<ViolationRow | null>(null);

  const { data: violations, isLoading, error } = useQuery({
    queryKey: ['driver-violations', driverId],
    queryFn: async (): Promise<ViolationRow[]> => {
      // No FK exists between traffic_violations.vehicle_id and vehicles, so a
      // PostgREST embed is impossible — the row's own license_plate text
      // column is the vehicle display.
      const { data, error } = await supabase
        .from('traffic_violations')
        .select('id, pv_number, violation_type, violation_date, location, amount, status, license_plate, notes, paid_at, customer_id, vehicle_id')
        .eq('driver_id', driverId)
        .order('violation_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ViolationRow[];
    },
  });

  // Linked charges in ONE batched query via the reference convention
  // (other_charges has no violation_id column).
  const refs = useMemo(
    () => (violations ?? []).map((v) => violationChargeReference(v.id)),
    [violations],
  );
  const { data: linkedCharges = {} } = useQuery<Record<string, { id: string; label: string; amount: number }>>({
    queryKey: ['driver-violation-charges', driverId, refs.slice().sort().join(',')],
    enabled: refs.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('other_charges')
        .select('id, label, amount, reference')
        .in('reference', refs);
      if (error) throw error;
      const map: Record<string, { id: string; label: string; amount: number }> = {};
      for (const c of (data as any[] ?? [])) {
        const violationId = parseViolationChargeReference(c.reference);
        if (violationId) map[violationId] = { id: c.id, label: c.label, amount: c.amount };
      }
      return map;
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['driver-violations', driverId] });
    qc.invalidateQueries({ queryKey: ['driver-violation-charges', driverId] });
    qc.invalidateQueries({ queryKey: ['contraventions'] });
    qc.invalidateQueries({ queryKey: ['driver-risk', driverId] });
    qc.invalidateQueries({ queryKey: ['drivers-risk-summary'] });
  };

  const createCharge = useMutation({
    mutationFn: async (v: ViolationRow) => {
      const resolvedCustomer = v.customer_id ?? customerId ?? scopedCustomer;
      if (!resolvedCustomer) throw new Error('Aucun client actif');
      const label = `Contravention ${v.pv_number ? `PV ${v.pv_number}` : v.violation_type} — ${v.license_plate}`;
      const { error } = await supabase.from('other_charges').insert({
        charge_type: 'other',
        label,
        amount: v.amount,
        charge_date: v.violation_date.slice(0, 10),
        vehicle_id: v.vehicle_id,
        customer_id: resolvedCustomer,
        reference: violationChargeReference(v.id),
        notes: `Chauffeur : ${driverName}${v.location ? ` · Lieu : ${v.location}` : ''}`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Charge créée', { description: 'Visible dans Maintenance & Charges.' });
      setChargeTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error('Création impossible', { description: e.message }),
  });

  const markPaid = useMutation({
    mutationFn: async (v: ViolationRow) => {
      const { error } = await supabase
        .from('traffic_violations')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', v.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Contravention marquée payée'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // After a successful "Facturer au chauffeur": persist the linkage so the
  // violation cannot be billed twice — status → 'invoiced' (documented in
  // src/lib/violations.ts) and "Facture {invoice_number}" appended to notes.
  const markInvoiced = useMutation({
    mutationFn: async ({ v, invoice }: { v: ViolationRow; invoice: Invoice }) => {
      const ref = `Facture ${invoice.invoice_number ?? invoice.id}`;
      const appended = `${v.notes ? `${v.notes}\n` : ''}${ref}`;
      const { error } = await supabase
        .from('traffic_violations')
        .update({ status: 'invoiced', notes: appended })
        .eq('id', v.id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) =>
      toast.error('Facture émise, mais le marquage de la contravention a échoué', { description: e.message }),
  });

  const contest = useMutation({
    mutationFn: async ({ v, note }: { v: ViolationRow; note: string }) => {
      const stamp = format(new Date(), 'dd/MM/yyyy');
      const appended = `${v.notes ? `${v.notes}\n` : ''}[Recours ${stamp}] ${note}`;
      const { error } = await supabase
        .from('traffic_violations')
        .update({ status: 'contested', notes: appended })
        .eq('id', v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Contravention passée en recours');
      setContestTarget(null);
      setContestNote('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const invoiceLines: InvoiceDraftLine[] = invoiceTarget
    ? [{
        designation: `Contravention ${invoiceTarget.pv_number ? `PV ${invoiceTarget.pv_number}` : invoiceTarget.violation_type} — ${invoiceTarget.license_plate}`,
        quantity: 1,
        unit_price: invoiceTarget.amount,
      }]
    : [];

  const statusBadge = (status: string) => (
    <Badge className={VIOLATION_STATUS_CLASS[status as ViolationStatus] ?? 'bg-muted text-muted-foreground'}>
      {VIOLATION_STATUS_LABEL[status as ViolationStatus] ?? status}
    </Badge>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contraventions</CardTitle>
        <CardDescription>Amendes routières attribuées à ce conducteur</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">Erreur de chargement</div>
        ) : !violations || violations.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Aucune contravention</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Véhicule</TableHead>
                <TableHead>Charge liée</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {violations.map((v) => {
                const charge = linkedCharges[v.id];
                const payable = v.status === 'pending_payment' || v.status === 'contested';
                const contestable = v.status === 'pending_payment';
                return (
                  <TableRow key={v.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(v.violation_date), 'dd MMM yyyy', { locale: fr })}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{v.violation_type}</div>
                      <div className="text-xs text-muted-foreground">
                        {v.pv_number ? `PV ${v.pv_number}` : ''}{v.pv_number && v.location ? ' · ' : ''}{v.location ?? ''}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{formatCurrency(v.amount)}</TableCell>
                    <TableCell>{statusBadge(v.status)}</TableCell>
                    <TableCell className="text-xs">{v.license_plate}</TableCell>
                    <TableCell className="text-xs">
                      {charge ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground" title={charge.label}>
                          <Receipt className="h-3 w-3" /> {formatCurrency(charge.amount)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!charge && (
                            <DropdownMenuItem onClick={() => setChargeTarget(v)}>
                              <Receipt className="h-4 w-4 mr-2" /> Créer une charge
                            </DropdownMenuItem>
                          )}
                          {v.status !== 'invoiced' && (
                            <DropdownMenuItem
                              disabled={!customerId}
                              title={!customerId ? 'Aucun client actif' : undefined}
                              onClick={() => customerId && setInvoiceTarget(v)}
                            >
                              <FileText className="h-4 w-4 mr-2" /> Facturer au chauffeur
                            </DropdownMenuItem>
                          )}
                          {payable && (
                            <DropdownMenuItem onClick={() => markPaid.mutate(v)} disabled={markPaid.isPending}>
                              <CheckCircle2 className="h-4 w-4 mr-2" /> Marquer payée
                            </DropdownMenuItem>
                          )}
                          {contestable && (
                            <DropdownMenuItem onClick={() => { setContestNote(''); setContestTarget(v); }}>
                              <Scale className="h-4 w-4 mr-2" /> Contester
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Create charge confirmation */}
      <Dialog open={!!chargeTarget} onOpenChange={(o) => !o && setChargeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer une charge</DialogTitle>
            <DialogDescription>
              Une charge sera enregistrée dans le registre des charges (Maintenance &amp; Charges), liée à cette contravention.
            </DialogDescription>
          </DialogHeader>
          {chargeTarget && (
            <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Libellé :</span>{' '}
                <span className="font-medium">
                  Contravention {chargeTarget.pv_number ? `PV ${chargeTarget.pv_number}` : chargeTarget.violation_type} — {chargeTarget.license_plate}
                </span>
              </p>
              <p><span className="text-muted-foreground">Montant :</span> <span className="font-medium">{formatCurrency(chargeTarget.amount)}</span></p>
              <p><span className="text-muted-foreground">Date :</span> {format(new Date(chargeTarget.violation_date), 'dd MMM yyyy', { locale: fr })}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setChargeTarget(null)} disabled={createCharge.isPending}>
              Annuler
            </Button>
            <Button onClick={() => chargeTarget && createCharge.mutate(chargeTarget)} disabled={createCharge.isPending}>
              {createCharge.isPending ? 'Création…' : 'Créer la charge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contest dialog — note is mandatory */}
      <Dialog open={!!contestTarget} onOpenChange={(o) => { if (!o) { setContestTarget(null); setContestNote(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contester la contravention</DialogTitle>
            <DialogDescription>
              La contravention passera au statut "En recours". Le motif est obligatoire et sera conservé dans les notes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="contest-note">Motif du recours *</Label>
            <Textarea
              id="contest-note"
              rows={3}
              value={contestNote}
              onChange={(e) => setContestNote(e.target.value)}
              placeholder="Ex : véhicule vendu à cette date, PV en doublon…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setContestTarget(null); setContestNote(''); }} disabled={contest.isPending}>
              Annuler
            </Button>
            <Button
              onClick={() => contestTarget && contest.mutate({ v: contestTarget, note: contestNote.trim() })}
              disabled={!contestNote.trim() || contest.isPending}
            >
              {contest.isPending ? 'Enregistrement…' : 'Confirmer le recours'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bill the driver — shared invoice dialog prefilled with the violation */}
      <CreateInvoiceDialog
        open={!!invoiceTarget}
        onOpenChange={(o) => !o && setInvoiceTarget(null)}
        driverId={driverId}
        driverName={driverName}
        customerId={customerId}
        initialLines={invoiceLines}
        initialNotes={invoiceTarget ? `Contravention du ${format(new Date(invoiceTarget.violation_date), 'dd/MM/yyyy')}${invoiceTarget.pv_number ? ` — PV ${invoiceTarget.pv_number}` : ''}` : ''}
        onIssued={(invoice) => {
          if (invoiceTarget) markInvoiced.mutate({ v: invoiceTarget, invoice });
        }}
      />
    </Card>
  );
}
