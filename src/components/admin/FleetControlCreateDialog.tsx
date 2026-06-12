import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, User } from 'lucide-react';
import { toast } from 'sonner';
import { supabase as _supabase } from '@/integrations/supabase/routeClient';
import { isMissingRpcError, MISSING_RPC_FR } from '@/lib/rpcErrors';

const supabase = _supabase as any;

interface VehicleOption {
  id: string;
  license_plate: string | null;
  make: string | null;
  model_name: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * FC-A1 — "Nouveau contrôle": manual fleet-control creation by an admin.
 * Vehicle select (tenant-scoped via RLS), driver auto-derived from the
 * active rental server-side, optional reason. Calls the SECURITY DEFINER
 * RPC `fleet_control_create_manual` which enforces the one-active-control
 * rule, audits the action and notifies the driver.
 */
export function FleetControlCreateDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [vehicleId, setVehicleId] = useState<string>('');
  const [reason, setReason] = useState('');

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (open) {
      setVehicleId('');
      setReason('');
    }
  }, [open]);

  const { data: vehicles = [], isLoading: vehiclesLoading } = useQuery<VehicleOption[]>({
    queryKey: ['fleet-control', 'create-vehicles'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, license_plate, make, model_name')
        .order('license_plate', { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as VehicleOption[];
    },
  });

  // Driver autofill preview: the active rental's driver for the selected vehicle.
  const { data: activeDriver, isLoading: driverLoading } = useQuery({
    queryKey: ['fleet-control', 'create-active-driver', vehicleId],
    enabled: open && !!vehicleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rentals')
        .select('driver_id, drivers:drivers!rentals_driver_id_fkey ( full_name )')
        .eq('vehicle_id', vehicleId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { driver_id: string; drivers?: { full_name: string | null } | null } | null;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('fleet_control_create_manual', {
        p_vehicle: vehicleId,
        p_driver: null, // server derives the driver from the active rental
        p_reason: reason.trim() || null,
      });
      if (error) throw error;
      return data as { created: boolean; control_id: string; driver_id: string | null; notified: boolean };
    },
    onSuccess: (r) => {
      if (r?.created) {
        // Honest toast: derive from the RPC's actual outcome, not the
        // client-side driver preview (which can be stale or race the server).
        toast.success('Contrôle créé', {
          description: r.notified
            ? 'Le chauffeur assigné a été notifié.'
            : 'Aucun chauffeur actif — le contrôle est créé sans assignation.',
        });
      } else {
        toast.info('Un contrôle est déjà en cours pour ce véhicule', {
          description: 'Utilisez « Relancer » sur le contrôle existant.',
        });
      }
      qc.invalidateQueries({ queryKey: ['fleet-control'] });
      onClose();
    },
    onError: (e: any) =>
      toast.error('Création du contrôle impossible', {
        description: isMissingRpcError(e)
          ? MISSING_RPC_FR
          : e?.message ?? 'Erreur inconnue — réessayez.',
      }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau contrôle</DialogTitle>
          <DialogDescription>
            Demandez un contrôle visuel immédiat pour un véhicule. Le chauffeur de la
            location active est notifié automatiquement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Véhicule</Label>
            <Select value={vehicleId} onValueChange={setVehicleId} disabled={vehiclesLoading}>
              <SelectTrigger>
                <SelectValue placeholder={vehiclesLoading ? 'Chargement…' : 'Choisir un véhicule'} />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.license_plate ?? '—'} · {[v.make, v.model_name].filter(Boolean).join(' ') || 'Véhicule'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {vehicleId && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              {driverLoading ? (
                <span className="text-muted-foreground">Recherche du chauffeur…</span>
              ) : activeDriver?.drivers?.full_name ? (
                <span>Chauffeur : <strong>{activeDriver.drivers.full_name}</strong> (location active)</span>
              ) : (
                <span className="text-muted-foreground">Aucune location active — contrôle sans chauffeur assigné.</span>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Motif (facultatif)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex. : signalement d'un dommage, retour de maintenance…"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>Annuler</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!vehicleId || create.isPending}
          >
            {create.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
            Créer le contrôle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
