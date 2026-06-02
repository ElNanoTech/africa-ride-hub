import { useMemo, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Check, ChevronsUpDown, AlertCircle, X, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UffizioVehicle } from '@/hooks/useUffizioLiveData';

export interface UffizioDevicePickerProps {
  /** Current value (IMEI saved on the vehicle row, or any free-text override). */
  value: string;
  onChange: (value: string) => void;
  /** Live device list from Uffizio (vehicle_positions). */
  devices: UffizioVehicle[];
  /** IMEIs already assigned to OTHER vehicles — flagged in the list. */
  assignedImeis?: Set<string>;
  /** License plate currently typed in the form — used to suggest the best match. */
  licensePlateHint?: string;
  /** Optional id of the vehicle being edited (so its own IMEI is not flagged as duplicate). */
  currentVehicleId?: string | null;
  disabled?: boolean;
  className?: string;
}

const normalize = (s: string) => s.replace(/\s+/g, '').replace(/-/g, '').toUpperCase();

export function UffizioDevicePicker({
  value,
  onChange,
  devices,
  assignedImeis,
  licensePlateHint,
  disabled,
  className,
}: UffizioDevicePickerProps) {
  const [open, setOpen] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  const selected = useMemo(
    () => devices.find((d) => d.imei_no === value) ?? null,
    [devices, value],
  );

  const suggestedImei = useMemo(() => {
    if (!licensePlateHint) return null;
    const target = normalize(licensePlateHint);
    if (target.length < 3) return null;
    for (const d of devices) {
      const dn = normalize(d.vehicle_no || '');
      if (dn && (dn.includes(target) || target.includes(dn))) return d.imei_no;
    }
    return null;
  }, [devices, licensePlateHint]);

  // Sort: suggested first, then unassigned, then assigned
  const sortedDevices = useMemo(() => {
    return [...devices].sort((a, b) => {
      if (a.imei_no === suggestedImei) return -1;
      if (b.imei_no === suggestedImei) return 1;
      const aTaken = assignedImeis?.has(a.imei_no) && a.imei_no !== value ? 1 : 0;
      const bTaken = assignedImeis?.has(b.imei_no) && b.imei_no !== value ? 1 : 0;
      if (aTaken !== bTaken) return aTaken - bTaken;
      return (a.vehicle_no || '').localeCompare(b.vehicle_no || '');
    });
  }, [devices, suggestedImei, assignedImeis, value]);

  // Manual mode: free text input (escape hatch)
  if (manualMode) {
    return (
      <div className={cn('space-y-1.5', className)}>
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Saisir un IMEI manuellement"
            disabled={disabled}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setManualMode(false)}
            title="Revenir au sélecteur"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Saisie manuelle — utilisez ce mode uniquement si l'appareil n'apparaît pas dans la liste.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            {selected ? (
              <span className="flex items-center gap-2 truncate">
                <span className="font-mono text-xs">{selected.imei_no}</span>
                <span className="text-muted-foreground truncate">
                  · {selected.device_name || selected.vehicle_no}
                </span>
              </span>
            ) : value ? (
              <span className="flex items-center gap-2 truncate">
                <span className="font-mono text-xs">{value}</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/40 text-amber-600">
                  Manuel
                </Badge>
              </span>
            ) : (
              <span className="text-muted-foreground">Choisir un appareil Uffizio…</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-50 bg-popover" align="start">
          <Command
            filter={(itemValue, search) => {
              if (!search) return 1;
              return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
            }}
          >
            <CommandInput placeholder="Rechercher IMEI, plaque, nom…" />
            <CommandList>
              <CommandEmpty>
                <div className="text-xs text-muted-foreground py-2">
                  Aucun appareil trouvé.
                </div>
              </CommandEmpty>
              <CommandGroup>
                {value && (
                  <CommandItem
                    value="__clear__"
                    onSelect={() => {
                      onChange('');
                      setOpen(false);
                    }}
                    className="text-muted-foreground"
                  >
                    <X className="mr-2 h-3.5 w-3.5" />
                    Aucun appareil (laisser auto-détecter par immatriculation)
                  </CommandItem>
                )}
                {sortedDevices.map((d) => {
                  const isSuggested = d.imei_no === suggestedImei;
                  const isTaken = assignedImeis?.has(d.imei_no) && d.imei_no !== value;
                  const searchKey = `${d.imei_no} ${d.vehicle_no} ${d.device_name} ${d.driver_name}`;
                  return (
                    <CommandItem
                      key={d.imei_no || d.id}
                      value={searchKey}
                      onSelect={() => {
                        onChange(d.imei_no);
                        setOpen(false);
                      }}
                      className="cursor-pointer"
                    >
                      <Check
                        className={cn(
                          'mr-2 h-3.5 w-3.5',
                          value === d.imei_no ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="font-mono">{d.imei_no || '—'}</span>
                          {isSuggested && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-emerald-500/40 text-emerald-600">
                              Suggéré
                            </Badge>
                          )}
                          {isTaken && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/40 text-amber-600">
                              <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
                              Déjà attribué
                            </Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {d.device_name || '—'}
                          {d.vehicle_no && <> · plaque <span className="font-mono">{d.vehicle_no}</span></>}
                        </div>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <button
        type="button"
        onClick={() => setManualMode(true)}
        className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <Pencil className="h-2.5 w-2.5" />
        Saisir manuellement
      </button>
    </div>
  );
}
