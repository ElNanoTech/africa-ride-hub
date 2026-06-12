import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Undo2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/routeClient';
import { useConfirmRentalReturn } from '@/hooks/useAdminData';
import { logAction } from '@/hooks/useAuditLog';
import { formatCurrency, formatDateShort } from '@/lib/format';

// Same set as the admin Rentals page — statuses an admin can close out.
const RETURNABLE_STATUSES = [
  'approved', 'active', 'paid', 'return_pending', 'overdue_return', 'payment_overdue', 'vehicle_disabled',
];

export const RENTAL_STATUS_LABEL: Record<string, string> = {
  pending: 'En attente',
  approved: 'Approuvée',
  active: 'Active',
  paid: 'Payée',
  return_pending: 'Retour à confirmer',
  overdue_return: 'Retour en retard',
  payment_overdue: 'Paiement en retard',
  vehicle_disabled: 'Véhicule immobilisé',
  completed: 'Terminée',
  rejected: 'Rejetée',
  cancelled: 'Annulée',
};

export function rentalStatusLabel(status: string): string {
  return RENTAL_STATUS_LABEL[status] ?? status;
}

const STATUS_VARIANT = (status: string): 'verified' | 'pending' | 'rejected' | 'default' | 'outline' => {
  if (['active', 'approved', 'paid'].includes(status)) return 'verified';
  if (['pending', 'return_pending'].includes(status)) return 'pending';
  if (['rejected', 'overdue_return', 'payment_overdue', 'vehicle_disabled'].includes(status)) return 'rejected';
  if (status === 'completed') return 'outline';
  return 'default';
};

interface RentalRow {
  id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  returned_at: string | null;
  final_rate: number | null;
  approved_rate: number | null;
  requested_rate: number | null;
  vehicles: { model_name: string; license_plate: string; rent_per_day: number | null } | null;
}

interface DriverRentalsPanelProps {
  driverId: string;
  driverName: string;
}

/**
 * CH-P6 — Full assignment history (no 10-row cap) with daily rate and the
 * admin "Marquer retourné" action (confirm_rental_return RPC: closes the
 * rental, frees the vehicle and lets the server recompute fleet controls —
 * none of that is duplicated client-side).
 */
export function DriverRentalsPanel({ driverId, driverName }: DriverRentalsPanelProps) {
  const qc = useQueryClient();
  const confirmReturn = useConfirmRentalReturn();
  const [returnRental, setReturnRental] = useState<RentalRow | null>(null);
  const [returnNote, setReturnNote] = useState('');

  const { data: rentals, isLoading, error } = useQuery({
    queryKey: ['admin-driver-rentals-full', driverId],
    queryFn: async (): Promise<RentalRow[]> => {
      const { data, error } = await supabase
        .from('rentals')
        .select('id, status, start_date, end_date, returned_at, final_rate, approved_rate, requested_rate, vehicles(model_name, license_plate, rent_per_day)')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RentalRow[];
    },
  });

  const dailyRate = (r: RentalRow): number | null =>
    r.final_rate ?? r.approved_rate ?? r.requested_rate ?? r.vehicles?.rent_per_day ?? null;

  const handleSubmitReturn = () => {
    if (!returnRental) return;
    const rental = returnRental;
    const note = returnNote.trim();
    confirmReturn.mutate(
      { rentalId: rental.id, direct: true, justification: note || 'Retour confirmé par admin' },
      {
        onSuccess: () => {
          logAction({
            action: 'rental_return_confirmed',
            targetType: 'rental',
            targetId: rental.id,
            details: {
              driver_name: driverName,
              vehicle: rental.vehicles?.model_name,
              license_plate: rental.vehicles?.license_plate,
              note: note || null,
            },
          });
          qc.invalidateQueries({ queryKey: ['admin-driver-rentals-full', driverId] });
          qc.invalidateQueries({ queryKey: ['admin-driver-rentals', driverId] });
          qc.invalidateQueries({ queryKey: ['driver-360', driverId] });
          qc.invalidateQueries({ queryKey: ['driver-fleet-controls', driverId] });
          qc.invalidateQueries({ queryKey: ['admin-driver-detail', driverId] });
          setReturnRental(null);
          setReturnNote('');
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historique des Locations</CardTitle>
        <CardDescription>{rentals?.length ?? 0} location(s) — historique complet</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">Erreur de chargement</div>
        ) : !rentals || rentals.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Aucune location</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Véhicule</TableHead>
                <TableHead>Loyer/j</TableHead>
                <TableHead>Début</TableHead>
                <TableHead>Fin</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rentals.map((rental) => (
                <TableRow key={rental.id}>
                  <TableCell>
                    <div className="font-medium">{rental.vehicles?.model_name ?? '—'}</div>
                    <div className="text-sm text-muted-foreground">{rental.vehicles?.license_plate ?? ''}</div>
                  </TableCell>
                  <TableCell>
                    {dailyRate(rental) !== null ? formatCurrency(dailyRate(rental)!) : '—'}
                  </TableCell>
                  <TableCell>{formatDateShort(new Date(rental.start_date))}</TableCell>
                  <TableCell>
                    {rental.returned_at
                      ? formatDateShort(new Date(rental.returned_at))
                      : rental.end_date
                        ? formatDateShort(new Date(rental.end_date))
                        : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT(rental.status) as never}>
                      {rentalStatusLabel(rental.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {RETURNABLE_STATUSES.includes(rental.status) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setReturnNote(''); setReturnRental(rental); }}
                        disabled={confirmReturn.isPending}
                      >
                        <Undo2 className="h-3.5 w-3.5 mr-1" /> Marquer retourné
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Mark-as-returned dialog — same flow as /admin/rentals */}
      <Dialog open={!!returnRental} onOpenChange={(open) => !open && setReturnRental(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marquer la location comme retournée</DialogTitle>
            <DialogDescription>
              Confirme que le véhicule a été rendu. La location sera clôturée et le véhicule libéré.
            </DialogDescription>
          </DialogHeader>
          {returnRental && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                <p><span className="text-muted-foreground">Conducteur :</span> <span className="font-medium">{driverName}</span></p>
                <p><span className="text-muted-foreground">Véhicule :</span> <span className="font-medium">{returnRental.vehicles?.model_name ?? 'N/A'} — {returnRental.vehicles?.license_plate ?? 'N/A'}</span></p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="return-note">Note (optionnelle)</Label>
                <Textarea
                  id="return-note"
                  placeholder="Ex : kilométrage, état du véhicule, observations…"
                  value={returnNote}
                  onChange={(e) => setReturnNote(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnRental(null)} disabled={confirmReturn.isPending}>
              Annuler
            </Button>
            <Button onClick={handleSubmitReturn} disabled={confirmReturn.isPending}>
              <Undo2 className="h-4 w-4 mr-2" />
              {confirmReturn.isPending ? 'Confirmation…' : 'Confirmer le retour'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
