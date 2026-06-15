import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronsUpDown, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/routeClient';
import { useAdminCreateRental } from '@/hooks/useAdminData';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { OPEN_RENTAL_STATUSES } from '@/lib/rentals';

type DriverOption = {
  id: string;
  full_name: string;
  phone_number: string | null;
  driver_status: string;
  kyc_verified: boolean;
  assignable: boolean;
};

type VehicleOption = {
  id: string;
  model_name: string;
  license_plate: string;
  rent_per_day: number | null;
};

interface AssignVehicleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId?: string;
  driverName?: string;
  vehicleId?: string;
  vehicleLabel?: string;
  defaultRate?: number | null;
  onAssigned?: () => void;
}

function useAvailableDrivers(enabled: boolean) {
  return useQuery({
    queryKey: ['assign-vehicle-available-drivers'],
    enabled,
    queryFn: async (): Promise<DriverOption[]> => {
      const { data: busy, error: busyErr } = await supabase
        .from('rentals')
        .select('driver_id')
        .in('status', OPEN_RENTAL_STATUSES);
      if (busyErr) throw busyErr;
      const busyIds = new Set((busy ?? []).map((r) => r.driver_id as string));

      const { data, error } = await supabase
        .from('drivers')
        .select('id, full_name, phone_number, driver_status, kyc_status')
        .neq('driver_status', 'suspended')
        .order('full_name', { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? [])
        .filter((d) => !busyIds.has(d.id as string))
        .map((d) => {
          const status = (d.driver_status as string) ?? 'inactive';
          const kyc = (d.kyc_status as string) === 'verified';
          return {
            id: d.id as string,
            full_name: d.full_name as string,
            phone_number: (d.phone_number as string) ?? null,
            driver_status: status,
            kyc_verified: kyc,
            assignable: status === 'active' && kyc,
          };
        })
        // Show assignable first, then blocked, alphabetically within each group
        .sort((a, b) => Number(b.assignable) - Number(a.assignable) || a.full_name.localeCompare(b.full_name));
    },
  });
}

function useAvailableVehicles(enabled: boolean) {
  return useQuery({
    queryKey: ['assign-vehicle-available-vehicles'],
    enabled,
    queryFn: async (): Promise<VehicleOption[]> => {
      const { data: busy, error: busyErr } = await supabase
        .from('rentals')
        .select('vehicle_id')
        .in('status', OPEN_RENTAL_STATUSES);
      if (busyErr) throw busyErr;
      const busyIds = new Set((busy ?? []).map((r) => r.vehicle_id as string));

      const { data, error } = await supabase
        .from('vehicles')
        .select('id, model_name, license_plate, rent_per_day')
        .order('model_name', { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? [])
        .filter((v) => !busyIds.has(v.id as string))
        .map((v) => ({
          id: v.id as string,
          model_name: v.model_name as string,
          license_plate: v.license_plate as string,
          rent_per_day: (v.rent_per_day as number) ?? null,
        }));
    },
  });
}

export function AssignVehicleDialog({
  open,
  onOpenChange,
  driverId,
  driverName,
  vehicleId,
  vehicleLabel,
  defaultRate,
  onAssigned,
}: AssignVehicleDialogProps) {
  const [selectedDriverId, setSelectedDriverId] = useState<string | undefined>(driverId);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>(vehicleId);
  const [rate, setRate] = useState<string>(defaultRate ? String(defaultRate) : '');
  const [driverPickerOpen, setDriverPickerOpen] = useState(false);
  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false);

  const driversQuery = useAvailableDrivers(open && !driverId);
  const vehiclesQuery = useAvailableVehicles(open && !vehicleId);
  const createRental = useAdminCreateRental();

  useEffect(() => {
    if (open) {
      setSelectedDriverId(driverId);
      setSelectedVehicleId(vehicleId);
      setRate(defaultRate ? String(defaultRate) : '');
    }
  }, [open, driverId, vehicleId, defaultRate]);

  // Auto-fill rate from selected vehicle default when missing
  useEffect(() => {
    if (!selectedVehicleId || rate) return;
    const v = vehiclesQuery.data?.find((x) => x.id === selectedVehicleId);
    if (v?.rent_per_day) setRate(String(v.rent_per_day));
  }, [selectedVehicleId, rate, vehiclesQuery.data]);

  const selectedDriverLabel = useMemo(() => {
    if (driverId && driverName) return driverName;
    const d = driversQuery.data?.find((x) => x.id === selectedDriverId);
    return d ? `${d.full_name}${d.phone_number ? ` · ${d.phone_number}` : ''}` : '';
  }, [driverId, driverName, selectedDriverId, driversQuery.data]);

  const selectedVehicleLabel = useMemo(() => {
    if (vehicleId && vehicleLabel) return vehicleLabel;
    const v = vehiclesQuery.data?.find((x) => x.id === selectedVehicleId);
    return v ? `${v.model_name} · ${v.license_plate}` : '';
  }, [vehicleId, vehicleLabel, selectedVehicleId, vehiclesQuery.data]);

  const numericRate = Number(rate);
  const canSubmit =
    !!selectedDriverId &&
    !!selectedVehicleId &&
    Number.isFinite(numericRate) &&
    numericRate > 0 &&
    !createRental.isPending;

  const handleSubmit = async () => {
    if (!selectedDriverId || !selectedVehicleId) return;
    try {
      await createRental.mutateAsync({
        driverId: selectedDriverId,
        vehicleId: selectedVehicleId,
        rate: Math.round(numericRate),
      });
      onAssigned?.();
      onOpenChange(false);
    } catch {
      // toast handled in hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Allouer un véhicule</DialogTitle>
          <DialogDescription>
            Créez une location directement pour le conducteur. Une facture initiale sera générée
            automatiquement, comme pour une demande approuvée.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Driver */}
          <div className="space-y-2">
            <Label>Conducteur</Label>
            {driverId ? (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {selectedDriverLabel}
              </div>
            ) : (
              <Popover open={driverPickerOpen} onOpenChange={setDriverPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn('w-full justify-between font-normal', !selectedDriverId && 'text-muted-foreground')}
                  >
                    {selectedDriverLabel || 'Choisir un conducteur…'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Rechercher par nom ou téléphone…" />
                    <CommandList>
                      {driversQuery.isLoading ? (
                        <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Chargement…
                        </div>
                      ) : (
                        <>
                          <CommandEmpty>Aucun conducteur trouvé.</CommandEmpty>
                          <CommandGroup>
                            {(driversQuery.data ?? []).map((d) => (
                              <CommandItem
                                key={d.id}
                                value={`${d.full_name} ${d.phone_number ?? ''}`}
                                disabled={!d.assignable}
                                onSelect={() => {
                                  if (!d.assignable) return;
                                  setSelectedDriverId(d.id);
                                  setDriverPickerOpen(false);
                                }}
                                className={cn(!d.assignable && 'opacity-60')}
                              >
                                <div className="flex flex-col w-full gap-0.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span>{d.full_name}</span>
                                    {!d.assignable && (
                                      <Badge variant="outline" className="text-[10px] shrink-0">
                                        {d.driver_status !== 'active' ? 'Inactif' : 'KYC en attente'}
                                      </Badge>
                                    )}
                                  </div>
                                  {d.phone_number && (
                                    <span className="text-xs text-muted-foreground">{d.phone_number}</span>
                                  )}
                                  {!d.assignable && (
                                    <span className="text-[11px] text-muted-foreground">
                                      {d.driver_status !== 'active'
                                        ? 'Activez ce conducteur avant de lui allouer un véhicule.'
                                        : 'Le KYC doit être vérifié avant l\'allocation.'}
                                    </span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Vehicle */}
          <div className="space-y-2">
            <Label>Véhicule</Label>
            {vehicleId ? (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {selectedVehicleLabel}
              </div>
            ) : (
              <Popover open={vehiclePickerOpen} onOpenChange={setVehiclePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn('w-full justify-between font-normal', !selectedVehicleId && 'text-muted-foreground')}
                  >
                    {selectedVehicleLabel || 'Choisir un véhicule…'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Rechercher modèle ou plaque…" />
                    <CommandList>
                      {vehiclesQuery.isLoading ? (
                        <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Chargement…
                        </div>
                      ) : (
                        <>
                          <CommandEmpty>Aucun véhicule disponible.</CommandEmpty>
                          <CommandGroup>
                            {(vehiclesQuery.data ?? []).map((v) => (
                              <CommandItem
                                key={v.id}
                                value={`${v.model_name} ${v.license_plate}`}
                                onSelect={() => {
                                  setSelectedVehicleId(v.id);
                                  setVehiclePickerOpen(false);
                                }}
                              >
                                <div className="flex flex-col">
                                  <span>{v.model_name} · {v.license_plate}</span>
                                  {v.rent_per_day != null && (
                                    <span className="text-xs text-muted-foreground">
                                      Tarif standard : {formatCurrency(v.rent_per_day)}
                                    </span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Rate */}
          <div className="space-y-2">
            <Label htmlFor="assign-rate">Tarif journalier (FCFA)</Label>
            <Input
              id="assign-rate"
              type="number"
              inputMode="numeric"
              min={1}
              step={500}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="Ex. 15000"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createRental.isPending}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {createRental.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Allocation…
              </>
            ) : (
              'Allouer'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
