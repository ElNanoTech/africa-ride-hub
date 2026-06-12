import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, History } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { supabase as _supabase } from '@/integrations/supabase/routeClient';
import { useDriverAuth } from '@/hooks/useDriverAuth';
import { FleetControlZoneTile, type ZoneTilePhoto } from '@/components/driver/FleetControlZoneTile';
import {
  PHOTO_ZONES,
  DOCUMENT_ZONES,
  STATUS_LABEL,
  STATUS_CLASS,
  type FleetControlStatus,
  type ZoneKey,
} from '@/lib/fleetControl';

// Supabase types lag the migration sync; cast for the new fleet-control columns.
const supabase = _supabase as any;

interface DetailPhoto extends ZoneTilePhoto {
  zone: ZoneKey;
}

interface DetailControl {
  id: string;
  status: FleetControlStatus;
  due_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  vehicles?: { license_plate: string | null; make: string | null; model_name: string | null } | null;
}

// Statuses still handled by the main /driver/fleet-control screen.
const ACTIVE_STATUSES: FleetControlStatus[] = ['pending', 'submitted', 'rejected', 'overdue', 'blocked'];

/**
 * FC-D1 — Read-only detail of a closed fleet control (history). An active
 * control redirects to the main screen, which owns the upload flow.
 * RLS limits reads to the driver's own controls.
 */
export default function FleetControlDetail() {
  const { id } = useParams<{ id: string }>();
  const { driverProfile } = useDriverAuth();
  const navigate = useNavigate();
  const driverId = driverProfile?.id;

  const { data, isLoading } = useQuery({
    queryKey: ['driver-inspection-detail', id],
    enabled: !!id && !!driverId,
    queryFn: async () => {
      const { data: control, error } = await supabase
        .from('vehicle_inspections')
        .select(`
          id, status, due_at, submitted_at, reviewed_at, rejection_reason, notes, created_at,
          vehicles:vehicles!vehicle_inspections_vehicle_id_fkey ( license_plate, make, model_name )
        `)
        .eq('id', id)
        .eq('driver_id', driverId)
        .maybeSingle();
      if (error) throw error;
      if (!control) return { control: null as DetailControl | null, photos: [] as DetailPhoto[], urls: {} as Record<string, string> };

      const { data: photos } = await supabase
        .from('vehicle_inspection_photos')
        .select('id, zone, storage_path, validation_status, rejection_reason')
        .eq('inspection_id', control.id);

      const urls: Record<string, string> = {};
      await Promise.all(((photos ?? []) as DetailPhoto[]).map(async (p) => {
        const { data: sig } = await supabase.storage
          .from('vehicle-inspections')
          .createSignedUrl(p.storage_path, 3600);
        if (sig?.signedUrl) urls[p.id] = sig.signedUrl;
      }));

      return { control: control as DetailControl, photos: (photos ?? []) as DetailPhoto[], urls };
    },
  });

  const control = data?.control ?? null;
  const photos = data?.photos ?? [];
  const urls = data?.urls ?? {};

  // An active control belongs to the main screen.
  useEffect(() => {
    if (control && ACTIVE_STATUSES.includes(control.status)) {
      navigate('/driver/fleet-control', { replace: true });
    }
  }, [control, navigate]);

  const photosByZone = useMemo(() => {
    const map: Record<string, DetailPhoto> = {};
    for (const p of photos) map[p.zone] = p;
    return map;
  }, [photos]);

  if (isLoading || !driverId) {
    return (
      <DriverLayout>
        <PageHeader title="Détail du contrôle" />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DriverLayout>
    );
  }

  if (!control) {
    return (
      <DriverLayout>
        <PageHeader title="Détail du contrôle" />
        <div className="p-4">
          <Card>
            <CardContent className="p-6 text-center space-y-3">
              <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Ce contrôle est introuvable.</p>
              <Button variant="outline" onClick={() => navigate('/driver/fleet-control/history')}>
                <History className="h-4 w-4 mr-2" /> Retour à l'historique
              </Button>
            </CardContent>
          </Card>
        </div>
      </DriverLayout>
    );
  }

  const renderTile = (z: { key: ZoneKey; label: string; help: string }, kind: 'camera' | 'doc') => {
    const photo = photosByZone[z.key];
    const thumbUrl = photo ? urls[photo.id] : undefined;
    return (
      <FleetControlZoneTile
        key={z.key}
        zone={z}
        kind={kind}
        photo={photo ?? null}
        thumbUrl={thumbUrl}
        thumbFailed={!!photo && !thumbUrl}
        readOnly
        itemLocked
        onView={thumbUrl ? () => window.open(thumbUrl, '_blank') : undefined}
      />
    );
  };

  const uploadedPhotoZones = PHOTO_ZONES.filter((z) => photosByZone[z.key]);
  const uploadedDocZones = DOCUMENT_ZONES.filter((z) => photosByZone[z.key]);

  return (
    <DriverLayout>
      <PageHeader title="Détail du contrôle" subtitle={control.vehicles?.license_plate || ''} />
      <div className="p-4 space-y-4 max-w-2xl mx-auto pb-28">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">
                  {[control.vehicles?.make, control.vehicles?.model_name].filter(Boolean).join(' ') || 'Véhicule'}
                </div>
                <div className="text-xs text-muted-foreground">
                  Contrôle du {format(new Date(control.created_at), 'PPP', { locale: fr })}
                </div>
              </div>
              <Badge className={STATUS_CLASS[control.status]}>{STATUS_LABEL[control.status]}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {control.submitted_at && (
                <div>
                  <div className="text-muted-foreground">Envoyé</div>
                  <div className="font-medium">{format(new Date(control.submitted_at), 'd MMM yyyy HH:mm', { locale: fr })}</div>
                </div>
              )}
              {control.reviewed_at && (
                <div>
                  <div className="text-muted-foreground">Vérifié</div>
                  <div className="font-medium">{format(new Date(control.reviewed_at), 'd MMM yyyy HH:mm', { locale: fr })}</div>
                </div>
              )}
            </div>
            {control.rejection_reason && (
              <div className="rounded-md bg-rose-50 dark:bg-rose-950/30 p-3 text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Motif</div>
                  <div className="opacity-90">{control.rejection_reason}</div>
                </div>
              </div>
            )}
            {control.notes && (
              <p className="text-xs text-muted-foreground rounded-md border bg-muted/40 p-3">
                <strong>Vos remarques :</strong> {control.notes}
              </p>
            )}
          </CardContent>
        </Card>

        {uploadedPhotoZones.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Photos du véhicule
            </div>
            <div className="grid grid-cols-2 gap-3">
              {uploadedPhotoZones.map((z) => renderTile(z, 'camera'))}
            </div>
          </div>
        )}

        {uploadedDocZones.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Documents
            </div>
            <div className="grid grid-cols-2 gap-3">
              {uploadedDocZones.map((z) => renderTile(z, 'doc'))}
            </div>
          </div>
        )}

        {photos.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Aucune pièce n'a été envoyée pour ce contrôle.
            </CardContent>
          </Card>
        )}

        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={() => navigate('/driver/fleet-control/history')}>
            <History className="h-4 w-4 mr-2" /> Retour à l'historique
          </Button>
        </div>
      </div>
    </DriverLayout>
  );
}
