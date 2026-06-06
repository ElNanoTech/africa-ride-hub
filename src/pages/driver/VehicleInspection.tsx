import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Camera, CheckCircle2, AlertTriangle, ShieldCheck, Send, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase as _supabase } from '@/integrations/supabase/routeClient';
import { useDriverAuth } from '@/hooks/useDriverAuth';
import { compressImage } from '@/lib/imageCompression';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

// Cast for new Phase 3 tables until types regenerate
const supabase = _supabase as any;

type Zone = 'front' | 'rear' | 'left' | 'right' | 'dash' | 'interior' | 'tires';

const ZONES: { key: Zone; label: string; help: string }[] = [
  { key: 'front', label: 'Avant', help: 'Pare-chocs et phares' },
  { key: 'rear', label: 'Arrière', help: 'Coffre et feux' },
  { key: 'left', label: 'Côté gauche', help: 'Portes côté conducteur' },
  { key: 'right', label: 'Côté droit', help: 'Portes côté passager' },
  { key: 'dash', label: 'Tableau de bord', help: 'Compteur kilométrique visible' },
  { key: 'interior', label: 'Intérieur', help: 'Sièges et propreté' },
  { key: 'tires', label: 'Pneus', help: 'État et usure' },
];

interface Photo {
  id: string;
  zone: Zone;
  storage_path: string;
}

interface Inspection {
  id: string;
  vehicle_id: string;
  driver_id: string;
  status: 'draft' | 'submitted' | 'validated' | 'rejected' | 'expired';
  due_at: string;
  submitted_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  vehicles?: { license_plate: string | null; make: string | null; model: string | null } | null;
}

export default function VehicleInspection() {
  const { driverProfile } = useDriverAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [uploadingZone, setUploadingZone] = useState<Zone | null>(null);
  const [notes, setNotes] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingZone, setPendingZone] = useState<Zone | null>(null);

  const driverId = driverProfile?.id;

  // Get or create the current open inspection for this driver
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['driver-inspection', driverId],
    enabled: !!driverId,
    queryFn: async () => {
      // Find current open inspection
      const { data: existing, error } = await supabase
        .from('vehicle_inspections')
        .select(`
          id, vehicle_id, driver_id, status, due_at, submitted_at, rejection_reason, notes,
          vehicles:vehicles!vehicle_inspections_vehicle_id_fkey ( license_plate, make, model )
        `)
        .eq('driver_id', driverId)
        .in('status', ['draft', 'submitted', 'rejected'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      let inspection: Inspection | null = existing as any;

      if (!inspection) {
        // Find assigned vehicle via active rental
        const { data: rental } = await supabase
          .from('rentals')
          .select('vehicle_id')
          .eq('driver_id', driverId)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();

        if (!rental?.vehicle_id) return { inspection: null, photos: [] as Photo[], vehicle: null };

        const { data: created, error: cErr } = await supabase
          .from('vehicle_inspections')
          .insert({
            vehicle_id: rental.vehicle_id,
            driver_id: driverId,
            customer_id: driverProfile?.customer_id ?? null,
            status: 'draft',
          })
          .select(`
            id, vehicle_id, driver_id, status, due_at, submitted_at, rejection_reason, notes,
            vehicles:vehicles!vehicle_inspections_vehicle_id_fkey ( license_plate, make, model )
          `)
          .single();
        if (cErr) throw cErr;
        inspection = created as any;
      }

      const { data: photos } = await supabase
        .from('vehicle_inspection_photos')
        .select('id, zone, storage_path')
        .eq('inspection_id', inspection!.id);

      return { inspection, photos: (photos || []) as Photo[] };
    },
  });

  const inspection = data?.inspection ?? null;
  const photos = data?.photos ?? [];

  const photosByZone = useMemo(() => {
    const map: Record<string, Photo> = {};
    for (const p of photos) map[p.zone] = p;
    return map;
  }, [photos]);

  const completedCount = ZONES.filter(z => photosByZone[z.key]).length;
  const canSubmit = completedCount === ZONES.length && inspection?.status !== 'submitted' && inspection?.status !== 'validated';

  const handlePickPhoto = (zone: Zone) => {
    if (!inspection) return;
    setPendingZone(zone);
    fileRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !pendingZone || !inspection) return;
    const zone = pendingZone;
    setPendingZone(null);
    setUploadingZone(zone);
    try {
      const compressed = await compressImage(file);
      const ext = compressed.name.split('.').pop() || 'jpg';
      const path = `${inspection.id}/${zone}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('vehicle-inspections')
        .upload(path, compressed, { contentType: compressed.type, upsert: true });
      if (upErr) throw upErr;

      // Upsert photo row (unique on inspection_id+zone)
      const existing = photosByZone[zone];
      if (existing) {
        // Remove the old storage object (best-effort)
        await supabase.storage.from('vehicle-inspections').remove([existing.storage_path]).catch(() => {});
        await supabase
          .from('vehicle_inspection_photos')
          .update({ storage_path: path })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('vehicle_inspection_photos')
          .insert({ inspection_id: inspection.id, zone, storage_path: path });
      }

      // Move back to draft if previously rejected
      if (inspection.status === 'rejected') {
        await supabase
          .from('vehicle_inspections')
          .update({ status: 'draft', rejection_reason: null })
          .eq('id', inspection.id);
      }

      toast.success('Photo enregistrée');
      queryClient.invalidateQueries({ queryKey: ['driver-inspection', driverId] });
    } catch (err: any) {
      console.error(err);
      toast.error("Échec de l'envoi de la photo");
    } finally {
      setUploadingZone(null);
    }
  };

  const handleSubmit = async () => {
    if (!inspection || !canSubmit) return;
    try {
      const { error } = await supabase
        .from('vehicle_inspections')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          notes: notes || inspection.notes,
        })
        .eq('id', inspection.id);
      if (error) throw error;
      toast.success('Inspection envoyée pour validation');
      queryClient.invalidateQueries({ queryKey: ['driver-inspection', driverId] });
    } catch (err: any) {
      console.error(err);
      toast.error("Échec de l'envoi");
    }
  };

  if (isLoading) {
    return (
      <DriverLayout>
        <PageHeader title="Contrôle du véhicule" />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DriverLayout>
    );
  }

  if (!inspection) {
    return (
      <DriverLayout>
        <PageHeader title="Contrôle du véhicule" />
        <div className="p-4">
          <Card>
            <CardContent className="p-6 text-center space-y-3">
              <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Aucun véhicule actif. Le contrôle sera disponible dès qu'un véhicule vous sera assigné.
              </p>
              <Button variant="outline" onClick={() => navigate('/driver')}>Retour</Button>
            </CardContent>
          </Card>
        </div>
      </DriverLayout>
    );
  }

  const isLate = new Date(inspection.due_at).getTime() < Date.now() && inspection.status !== 'validated';

  return (
    <DriverLayout>
      <PageHeader title="Contrôle du véhicule" subtitle={inspection.vehicles?.license_plate || ''} />
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Status banner */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Échéance</div>
                <div className={`text-sm font-medium ${isLate ? 'text-rose-600' : ''}`}>
                  {format(new Date(inspection.due_at), 'PPP', { locale: fr })}
                </div>
              </div>
              <Badge variant={inspection.status === 'submitted' ? 'default' : 'secondary'}>
                {inspection.status === 'draft' && 'Brouillon'}
                {inspection.status === 'submitted' && 'En attente'}
                {inspection.status === 'validated' && 'Conforme'}
                {inspection.status === 'rejected' && 'Rejeté'}
                {inspection.status === 'expired' && 'En retard'}
              </Badge>
            </div>
            <div className="text-sm">
              {completedCount}/{ZONES.length} photos prises
            </div>
            {inspection.status === 'rejected' && inspection.rejection_reason && (
              <div className="rounded-md bg-rose-50 dark:bg-rose-950/30 p-3 text-sm text-rose-700 dark:text-rose-300">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium">Inspection refusée</div>
                    <div className="opacity-90">{inspection.rejection_reason}</div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Zones grid */}
        <div className="grid grid-cols-2 gap-3">
          {ZONES.map((z) => {
            const photo = photosByZone[z.key];
            const busy = uploadingZone === z.key;
            return (
              <button
                key={z.key}
                onClick={() => handlePickPhoto(z.key)}
                disabled={busy || inspection.status === 'submitted' || inspection.status === 'validated'}
                className={`relative rounded-xl border-2 p-4 text-left min-h-[140px] transition active:scale-[0.98] ${
                  photo ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-dashed border-muted-foreground/40 bg-card'
                } disabled:opacity-60`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{z.label}</div>
                  {photo ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : busy ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : (
                    <Camera className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{z.help}</div>
                <div className="text-xs mt-3 font-medium">
                  {photo ? 'Modifier la photo' : 'Toucher pour photographier'}
                </div>
              </button>
            );
          })}
        </div>

        {/* Notes */}
        {inspection.status !== 'submitted' && inspection.status !== 'validated' && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <label className="text-sm font-medium">Remarques (facultatif)</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Signaler un problème ou un détail à vérifier..."
                className="min-h-[80px]"
              />
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="space-y-2 pb-8">
          <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full h-12 text-base" size="lg">
            <Send className="h-5 w-5 mr-2" />
            {inspection.status === 'submitted' ? 'Envoyé — en attente de validation' : 'Envoyer pour validation'}
          </Button>
          <Button onClick={() => refetch()} variant="ghost" className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" /> Rafraîchir
          </Button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </DriverLayout>
  );
}