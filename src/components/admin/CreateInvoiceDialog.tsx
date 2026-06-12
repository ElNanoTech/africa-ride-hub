import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { InvoiceTagPicker } from '@/components/admin/InvoiceTagPicker';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useGenerateInvoice, useActiveRentalsForDriver } from '@/hooks/useBilling';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, formatDateShort } from '@/lib/format';

export interface InvoiceDraftLine {
  designation: string;
  quantity: number;
  unit_price: number;
}

interface CreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  driverName: string;
  customerId: string | null;
  initialLines?: InvoiceDraftLine[];
  initialNotes?: string;
  initialTags?: string[];
  /** Called after the invoice is issued (in addition to query invalidation). */
  onIssued?: () => void;
}

const EMPTY_LINE: InvoiceDraftLine = { designation: '', quantity: 1, unit_price: 0 };

/**
 * CH-P5 "Créer facture" — same generate-invoice flow as /admin/billing
 * (rental auto-attachment rules included) but prefilled with one driver.
 * Also reused by the Contraventions tab ("Facturer au chauffeur") with a
 * prefilled line.
 */
export function CreateInvoiceDialog({
  open,
  onOpenChange,
  driverId,
  driverName,
  customerId,
  initialLines,
  initialNotes,
  initialTags,
  onIssued,
}: CreateInvoiceDialogProps) {
  const qc = useQueryClient();
  const generate = useGenerateInvoice();

  const [lines, setLines] = useState<InvoiceDraftLine[]>(initialLines?.length ? initialLines : [EMPTY_LINE]);
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [tags, setTags] = useState<string[]>(initialTags ?? []);
  const [rentalId, setRentalId] = useState('');

  // Re-seed prefill on open (the violation panel reuses one dialog instance).
  useEffect(() => {
    if (open) {
      setLines(initialLines?.length ? initialLines.map((l) => ({ ...l })) : [{ ...EMPTY_LINE }]);
      setNotes(initialNotes ?? '');
      setTags(initialTags ?? []);
      setRentalId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const rentalsQuery = useActiveRentalsForDriver(open ? driverId : null);
  const activeRentals = rentalsQuery.data ?? [];
  const needsRentalChoice = activeRentals.length > 1;
  const autoRentalId = activeRentals.length === 1 ? activeRentals[0].id : null;
  const effectiveRentalId = needsRentalChoice ? rentalId : autoRentalId;

  const total = lines.reduce((sum, l) => sum + (Number(l.unit_price) || 0) * (Number(l.quantity) || 0), 0);

  const handleIssue = async () => {
    const cleanLines = lines.filter((l) => l.designation.trim() && Number(l.unit_price) > 0);
    if (cleanLines.length === 0) { toast.error('Au moins une ligne avec désignation et prix > 0'); return; }
    if (!customerId) { toast.error('Aucun client actif'); return; }
    if (needsRentalChoice && !rentalId) { toast.error('Sélectionnez la location à rattacher'); return; }
    try {
      await generate.mutateAsync({
        driver_id: driverId,
        customer_id: customerId,
        rental_id: effectiveRentalId,
        notes: notes || undefined,
        tags: tags.length > 0 ? tags : undefined,
        lines: cleanLines.map((l) => ({ designation: l.designation.trim(), quantity: l.quantity, unit_price: l.unit_price })),
      });
      // The hook invalidates admin-invoices; refresh the profile panels too.
      qc.invalidateQueries({ queryKey: ['driver-invoices', driverId] });
      qc.invalidateQueries({ queryKey: ['driver-360', driverId] });
      qc.invalidateQueries({ queryKey: ['driver-activity-timeline', driverId] });
      onIssued?.();
      onOpenChange(false);
    } catch {
      /* toast already shown by the hook */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Émettre une facture — {driverName}</DialogTitle>
          <DialogDescription>
            La facture sera numérotée et envoyée immédiatement au statut "émise".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!rentalsQuery.isLoading && (
            <div className="rounded-md border p-3 text-sm bg-muted/30">
              {activeRentals.length === 0 && (
                <span className="text-muted-foreground">
                  ℹ️ Aucune location active — la facture sera enregistrée sans paiement chauffeur.
                </span>
              )}
              {activeRentals.length === 1 && (
                <span>
                  🔗 Rattachée à la location en cours
                  {activeRentals[0].vehicle_plate ? ` (${activeRentals[0].vehicle_plate})` : ''}
                  {activeRentals[0].payment_due_at_initial
                    ? ` — échéance ${formatDateShort(activeRentals[0].payment_due_at_initial)}`
                    : ''}
                  . Le chauffeur la verra dans son app pour paiement Wave.
                </span>
              )}
              {needsRentalChoice && (
                <div className="space-y-2">
                  <Label className="text-destructive">⚠️ Plusieurs locations actives — sélection requise</Label>
                  <Select value={rentalId} onValueChange={setRentalId}>
                    <SelectTrigger><SelectValue placeholder="Choisir une location" /></SelectTrigger>
                    <SelectContent>
                      {activeRentals.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.vehicle_plate ?? r.vehicle_label ?? r.id.slice(0, 8)}
                          {r.payment_due_at_initial ? ` — éch. ${formatDateShort(r.payment_due_at_initial)}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Lignes</Label>
              <Button size="sm" variant="outline" onClick={() => setLines((p) => [...p, { ...EMPTY_LINE }])}>
                <Plus className="h-4 w-4 mr-1" />Ajouter
              </Button>
            </div>
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <Input className="col-span-6" placeholder="Désignation" value={l.designation}
                  onChange={(e) => setLines((p) => p.map((x, i) => i === idx ? { ...x, designation: e.target.value } : x))} />
                <Input className="col-span-2" type="number" inputMode="numeric" min={1} placeholder="Qté" value={l.quantity === 0 ? '' : l.quantity}
                  onChange={(e) => setLines((p) => p.map((x, i) => i === idx ? { ...x, quantity: e.target.value === '' ? 0 : Number(e.target.value) } : x))} />
                <Input className="col-span-3" type="number" inputMode="numeric" min={0} placeholder="PU FCFA" value={l.unit_price === 0 ? '' : l.unit_price}
                  onChange={(e) => setLines((p) => p.map((x, i) => i === idx ? { ...x, unit_price: e.target.value === '' ? 0 : Number(e.target.value) } : x))} />
                <Button className="col-span-1" variant="ghost" size="icon" onClick={() => setLines((p) => p.filter((_, i) => i !== idx))} disabled={lines.length === 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="text-right text-sm font-medium pt-2">Sous-total HT : {formatCurrency(total)}</div>
          </div>

          <div>
            <Label>Tags (optionnel)</Label>
            <InvoiceTagPicker value={tags} onChange={setTags} />
          </div>

          <div>
            <Label>Notes (optionnel)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleIssue} disabled={generate.isPending || !customerId} title={!customerId ? 'Aucun client actif' : undefined}>
            {generate.isPending ? 'Émission…' : 'Émettre la facture'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
