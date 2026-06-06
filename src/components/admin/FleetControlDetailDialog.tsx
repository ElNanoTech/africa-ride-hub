import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Camera, FileText, ImageOff, CheckCircle2, XCircle, BellRing, Zap, Ban } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { supabase as _supabase } from '@/integrations/supabase/routeClient';
const supabase = _supabase as any;
import { fleetCategoryLabel } from '@/lib/fleetCategories';

/**
 * KIRA Fleet Control — 7 visual zones + 4 documents.
 * Zone keys map to vehicle_inspection_photos.zone CHECK values.
 * Labels are KIRA-spec French copy; the underlying column stays opaque to UI.
 */
const PHOTO_ZONES: { key: string; label: string }[] = [
  { key: 'front', label: 'Face avant' },
  { key: 'rear', label: 'Face arrière' },
  { key: 'left', label: 'Côté gauche' },
  { key: 'right', label: 'Côté droit' },
  { key: 'dash', label: 'Moteur' },
  { key: 'interior', label: 'Intérieur' },
  { key: 'tires', label: 'Coffre' },
];

const DOC_ZONES: { key: string; label: string }[] = [
  { key: 'doc_vignette', label: 'Vignette' },
  { key: 'doc_assurance', label: 'Assurance' },
  { key: 'doc_carte_parking', label: 'Carte parking' },
  { key: 'doc_carte_grise', label: 'Carte grise' },
];

export interface FleetControlRow {
  id: string;
  vehicle_id: string;
  status: string;
  due_at: string;
  submitted_at: string | null;
  validated_at: string | null;
  rejection_reason: string | null;
  reminder_count: number;
  immobilized_at: string | null;
  immobilization_reason: string | null;
  notes?: string | null;
  vehicles?: { license_plate: string | null; make: string | null; model: string | null; fleet_group: string | null } | null;
  drivers?: { first_name: string | null; last_name: string | null } | null;
}

interface Props {
  row: FleetControlRow | null;
  onClose: () => void;
  onValidate: (id: string) => void;
  onReject: (id: string) => void;
  onRemind: (row: FleetControlRow) => void;
  onImmobilize: (row: FleetControlRow) => void;
  busy?: boolean;
}

interface PhotoRow {
  id: string;
  zone: string;
  storage_path: string;
  notes: string | null;
  created_at: string;
}

export function FleetControlDetailDialog({ row, onClose, onValidate, onReject, onRemind, onImmobilize, busy }: Props) {
  const open = !!row;

  // Fetch the rows + sign URLs in one go. Keep the cache scoped per-inspection.
  const { data, isLoading } = useQuery({
    queryKey: ['fleet-control', 'photos', row?.id],
    enabled: open && !!row?.id,
    queryFn: async () => {
      const { data: photos, error } = await supabase
        .from('vehicle_inspection_photos')
        .select('id, zone, storage_path, notes, created_at')
        .eq('inspection_id', row!.id);
      if (error) throw error;
      const rows = (photos ?? []) as PhotoRow[];
      const signed = await Promise.all(
        rows.map(async (p) => {
          const { data: sig } = await supabase.storage
            .from('vehicle-inspections')
            .createSignedUrl(p.storage_path, 3600);
          return [p.zone, { ...p, url: sig?.signedUrl ?? null }] as const;
        }),
      );
      return Object.fromEntries(signed) as Record<string, PhotoRow & { url: string | null }>;
    },
  });

  const allZones = useMemo(() => [...PHOTO_ZONES, ...DOC_ZONES], []);
  const filledCount = useMemo(() => allZones.filter((z) => data?.[z.key]).length, [allZones, data]);

  if (!row) return null;

  const plate = row.vehicles?.license_plate ?? '—';
  const model = [row.vehicles?.make, row.vehicles?.model].filter(Boolean).join(' ') || 'Véhicule';
  const driverName = row.drivers ? [row.drivers.first_name, row.drivers.last_name].filter(Boolean).join(' ') : '⚠️ Non assigné';
  const isPending = row.status === 'submitted';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-3 border-b">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-lg">{plate}</DialogTitle>
            {row.vehicles?.fleet_group && (
              <Badge variant="outline" className="text-[10px]">{fleetCategoryLabel(row.vehicles.fleet_group)}</Badge>
            )}
            <Badge variant="secondary" className="text-[10px]">
              {filledCount}/{allZones.length} pièces
            </Badge>
            {row.immobilized_at && (
              <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 text-[10px]">
                <Ban className="h-3 w-3 mr-1" /> Immobilisé
              </Badge>
            )}
          </div>
          <DialogDescription className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-1">
            <span>{model}</span>
            <span>👤 {driverName}</span>
            <span>📅 Échéance {format(new Date(row.due_at), 'd MMM yyyy', { locale: fr })}</span>
            {row.submitted_at && <span>📤 Soumis {format(new Date(row.submitted_at), 'd MMM HH:mm', { locale: fr })}</span>}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Camera className="h-4 w-4" /> Zones du véhicule
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {PHOTO_ZONES.map((z) => (
                  <ZoneTile key={z.key} label={z.label} loading={isLoading} photo={data?.[z.key]} />
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4" /> Documents
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {DOC_ZONES.map((z) => (
                  <ZoneTile key={z.key} label={z.label} loading={isLoading} photo={data?.[z.key]} doc />
                ))}
              </div>
            </section>

            {row.rejection_reason && (
              <p className="text-xs text-rose-600 rounded-md border border-rose-200 bg-rose-50 dark:bg-rose-950/30 p-3">
                <strong>Motif rejet précédent :</strong> {row.rejection_reason}
              </p>
            )}
            {row.notes && (
              <p className="text-xs text-muted-foreground rounded-md border bg-muted/40 p-3">
                <strong>Notes chauffeur :</strong> {row.notes}
              </p>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="p-4 border-t bg-muted/30 flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-2">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onRemind(row)} disabled={busy}>
              <BellRing className="h-4 w-4 mr-1" /> Relancer
            </Button>
            {!row.immobilized_at && (
              <Button size="sm" variant="destructive" onClick={() => onImmobilize(row)} disabled={busy}>
                <Zap className="h-4 w-4 mr-1" /> Couper moteur
              </Button>
            )}
          </div>
          {isPending && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onReject(row.id)} disabled={busy}>
                <XCircle className="h-4 w-4 mr-1" /> Rejeter
              </Button>
              <Button size="sm" onClick={() => onValidate(row.id)} disabled={busy}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Valider l'inspection
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ZoneTile({
  label,
  loading,
  photo,
  doc,
}: {
  label: string;
  loading: boolean;
  photo?: PhotoRow & { url: string | null };
  doc?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="relative aspect-square w-full rounded-lg overflow-hidden border bg-muted/40 flex items-center justify-center">
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : photo?.url ? (
          <a href={photo.url} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
            <img src={photo.url} alt={label} className="h-full w-full object-cover hover:scale-105 transition-transform" loading="lazy" />
          </a>
        ) : (
          <div className="flex flex-col items-center justify-center text-muted-foreground gap-1">
            {doc ? <FileText className="h-6 w-6 opacity-40" /> : <ImageOff className="h-6 w-6 opacity-40" />}
            <span className="text-[10px] uppercase tracking-wider">Manquant</span>
          </div>
        )}
        {photo && (
          <span className="absolute top-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
            <CheckCircle2 className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <p className="text-xs font-medium leading-tight text-center">{label}</p>
      {photo?.notes && <p className="text-[10px] text-muted-foreground text-center line-clamp-2">{photo.notes}</p>}
    </div>
  );
}