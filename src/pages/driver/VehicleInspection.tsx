import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Camera, CheckCircle2, AlertTriangle, ShieldCheck, Send, RefreshCw, FileText, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { supabase as _supabase } from '@/integrations/supabase/routeClient';
import { useDriverAuth } from '@/hooks/useDriverAuth';
import { compressImage } from '@/lib/imageCompression';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  PHOTO_ZONES,
  DOCUMENT_ZONES,
  ALL_ZONES,
  REQUIRED_ITEM_COUNT,
  STATUS_LABEL,
  STATUS_CLASS,
  IMMO_LABEL,
  effectiveStatus,
  type ZoneKey,
  type FleetControlStatus,
  type ItemValidation,
  type ImmobilizationState,
} from '@/lib/fleetControl';

// Supabase types lag the migration sync; cast for the new item-review columns.
const supabase = _supabase as any;

interface Photo {
  id: string;
  zone: ZoneKey;
  storage_path: string;
  validation_status: ItemValidation;
  rejection_reason: string | null;
}

interface Inspection {
  id: string;
  vehicle_id: string;
  driver_id: string;
  status: FleetControlStatus;
  due_at: string;
  submitted_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  immobilization_state: ImmobilizationState;
  immobilization_command_ref: string | null;
  immobilization_requested_at: string | null;
  immobilization_cancelled_at: string | null;
  vehicles?: { license_plate: string | null; make: string | null; model_name: string | null } | null;
}

interface AuditRow {
  id: string;
  action: string;
  actor_type: string;
  metadata: any;
  created_at: string;
}

export default function VehicleInspection() {
  const { driverProfile } = useDriverAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [uploadingZone, setUploadingZone] = useState<ZoneKey | null>(null);
  const [notes, setNotes] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingZone, setPendingZone] = useState<ZoneKey | null>(null);

  const driverId = driverProfile?.id;

  // Get-or-create the current open fleet control for this driver.
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['driver-inspection', driverId],
    enabled: !!driverId,
    queryFn: async () => {
      const { data: existing, error } = await supabase
        .from('vehicle_inspections')
        .select(`
          id, vehicle_id, driver_id, status, due_at, submitted_at, rejection_reason, notes,
          immobilization_state, immobilization_command_ref, immobilization_requested_at, immobilization_cancelled_at,
          vehicles:vehicles!vehicle_inspections_vehicle_id_fkey ( license_plate, make, model_name )
        `)
        .eq('driver_id', driverId)
        .in('status', ['pending', 'submitted', 'rejected', 'overdue', 'blocked'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      let inspection: Inspection | null = existing as any;

      if (!inspection) {
        const { data: rental } = await supabase
          .from('rentals')
          .select('vehicle_id')
          .eq('driver_id', driverId)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        if (!rental?.vehicle_id) return { inspection: null, photos: [] as Photo[] };

        const { data: created, error: cErr } = await supabase
          .from('vehicle_inspections')
          .insert({
            vehicle_id: rental.vehicle_id,
            driver_id: driverId,
            customer_id: driverProfile?.customer_id ?? null,
            status: 'pending',
          })
          .select(`
            id, vehicle_id, driver_id, status, due_at, submitted_at, rejection_reason, notes,
            immobilization_state, immobilization_command_ref, immobilization_requested_at, immobilization_cancelled_at,
            vehicles:vehicles!vehicle_inspections_vehicle_id_fkey ( license_plate, make, model_name )
          `)
          .single();
        if (cErr) throw cErr;
        inspection = created as any;
      }

      const { data: photos } = await supabase
        .from('vehicle_inspection_photos')
        .select('id, zone, storage_path, validation_status, rejection_reason')
        .eq('inspection_id', inspection!.id);

      // Pull the recent immobilization audit trail so the driver can see exactly
      // what happened (requested → pending_stop → cut_sent/failed, with timestamps).
      const { data: audit } = await supabase
        .from('fleet_control_audit')
        .select('id, action, actor_type, metadata, created_at')
        .eq('fleet_control_id', inspection!.id)
        .order('created_at', { ascending: false })
        .limit(10);

      return { inspection, photos: (photos || []) as Photo[], audit: (audit || []) as AuditRow[] };
    },
  });

  const inspection = data?.inspection ?? null;
  const photos = data?.photos ?? [];
  const audit = data?.audit ?? [];

  const photosByZone = useMemo(() => {
    const map: Record<string, Photo> = {};
    for (const p of photos) map[p.zone] = p;
    return map;
  }, [photos]);

  const completedCount = ALL_ZONES.filter(z => photosByZone[z.key]).length;
  const canSubmit =
    completedCount === REQUIRED_ITEM_COUNT &&
    inspection?.status !== 'submitted' &&
    inspection?.status !== 'approved';

  const handlePickPhoto = (zone: ZoneKey) => {
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

      const zoneDef = ALL_ZONES.find(z => z.key === zone)!;
      const existing = photosByZone[zone];
      if (existing) {
        await supabase.storage.from('vehicle-inspections').remove([existing.storage_path]).catch(() => {});
        await supabase
          .from('vehicle_inspection_photos')
          .update({
            storage_path: path,
            validation_status: 'pending', // reset review on re-upload
            rejection_reason: null,
            submitted_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('vehicle_inspection_photos')
          .insert({
            inspection_id: inspection.id,
            zone,
            storage_path: path,
            customer_id: driverProfile?.customer_id ?? null,
            vehicle_id: inspection.vehicle_id,
            driver_id: driverId,
            item_type: zoneDef.kind === 'document' ? 'document' : 'photo',
            label: zoneDef.label,
            validation_status: 'pending',
            submitted_at: new Date().toISOString(),
          });
      }

      // Reset previous rejection so the driver can resubmit cleanly.
      if (inspection.status === 'rejected') {
        await supabase
          .from('vehicle_inspections')
          .update({ status: 'pending', rejection_reason: null })
          .eq('id', inspection.id);
      }

      toast.success('Pièce enregistrée');
      queryClient.invalidateQueries({ queryKey: ['driver-inspection', driverId] });
    } catch (err: any) {
      console.error(err);
      toast.error("Échec de l'envoi de la pièce");
    } finally {
      setUploadingZone(null);
    }
  };

  const handleSubmit = async () => {
    if (!inspection || !canSubmit) return;
    try {
      if (notes && notes !== (inspection.notes ?? '')) {
        await supabase.from('vehicle_inspections').update({ notes }).eq('id', inspection.id);
      }
      // SECURITY DEFINER RPC: rechecks completeness, flips items pending→submitted, logs audit.
      const { error } = await supabase.rpc('fleet_control_submit', { p_control: inspection.id });
      if (error) throw error;
      toast.success('Contrôle envoyé pour validation');
      queryClient.invalidateQueries({ queryKey: ['driver-inspection', driverId] });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Échec de l'envoi");
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

  const eff = effectiveStatus(inspection.status, inspection.due_at);
  const isLate = eff === 'overdue';
  const locked = inspection.status === 'submitted' || inspection.status === 'approved';

  const renderZoneTile = (z: { key: ZoneKey; label: string; help: string }, kind: 'camera' | 'doc') => {
    const photo = photosByZone[z.key];
    const busy = uploadingZone === z.key;
    const Icon = kind === 'doc' ? FileText : Camera;
    const rejected = photo?.validation_status === 'rejected';
    const approved = photo?.validation_status === 'approved';
    return (
      <button
        key={z.key}
        onClick={() => handlePickPhoto(z.key)}
        disabled={busy || locked}
        className={`relative rounded-xl border-2 p-4 text-left min-h-[140px] transition active:scale-[0.98] ${
          rejected
            ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/30'
            : approved
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
              : photo
                ? 'border-blue-400 bg-blue-50/60 dark:bg-blue-950/20'
                : 'border-dashed border-muted-foreground/40 bg-card'
        } disabled:opacity-60`}
      >
        <div className="flex items-center justify-between">
          <div className="font-medium">{z.label}</div>
          {approved ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : rejected ? (
            <AlertTriangle className="h-5 w-5 text-rose-600" />
          ) : photo ? (
            <CheckCircle2 className="h-5 w-5 text-blue-500" />
          ) : busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <Icon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1">{z.help}</div>
        <div className="text-xs mt-3 font-medium">
          {rejected && photo?.rejection_reason
            ? `Refusé : ${photo.rejection_reason}`
            : photo
              ? (kind === 'doc' ? 'Remplacer le document' : 'Modifier la photo')
              : (kind === 'doc' ? 'Toucher pour scanner' : 'Toucher pour photographier')}
        </div>
      </button>
    );
  };

  return (
    <DriverLayout>
      <PageHeader title="Contrôle du véhicule" subtitle={inspection.vehicles?.license_plate || ''} />
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Échéance</div>
                <div className={`text-sm font-medium ${isLate ? 'text-rose-600' : ''}`}>
                  {format(new Date(inspection.due_at), 'PPP', { locale: fr })}
                </div>
              </div>
              <Badge className={STATUS_CLASS[eff]}>{STATUS_LABEL[eff]}</Badge>
            </div>
            <div className="text-sm">
              {completedCount}/{REQUIRED_ITEM_COUNT} pièces fournies
            </div>
            {inspection.status === 'rejected' && inspection.rejection_reason && (
              <div className="rounded-md bg-rose-50 dark:bg-rose-950/30 p-3 text-sm text-rose-700 dark:text-rose-300">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium">Contrôle refusé</div>
                    <div className="opacity-90">{inspection.rejection_reason}</div>
                  </div>
                </div>
              </div>
            )}
            {inspection.status === 'blocked' && (
              <div className="rounded-md bg-rose-100 dark:bg-rose-950/40 p-3 text-sm text-rose-800 dark:text-rose-200 flex items-start gap-2">
                <Ban className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Véhicule bloqué</div>
                  <div className="opacity-90">Contactez le gestionnaire pour débloquer le véhicule.</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {inspection.immobilization_state && inspection.immobilization_state !== 'none' && (
          <ImmobilizationPanel
            state={inspection.immobilization_state}
            commandRef={inspection.immobilization_command_ref}
            requestedAt={inspection.immobilization_requested_at}
            cancelledAt={inspection.immobilization_cancelled_at}
            audit={audit}
          />
        )}

        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Photos du véhicule
          </div>
          <div className="grid grid-cols-2 gap-3">
            {PHOTO_ZONES.map((z) => renderZoneTile(z, 'camera'))}
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Documents
          </div>
          <div className="grid grid-cols-2 gap-3">
            {DOCUMENT_ZONES.map((z) => renderZoneTile(z, 'doc'))}
          </div>
        </div>

        {!locked && (
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

/**
 * Status panel showing the live immobilization state for the driver:
 * state badge, command reference (incl. DRY_RUN tag), and a compact audit
 * timeline of every transition from `requested` → `pending_stop` →
 * `cut_sent` / `failed` with timestamps.
 */
function ImmobilizationPanel({
  state,
  commandRef,
  requestedAt,
  cancelledAt,
  audit,
}: {
  state: ImmobilizationState;
  commandRef: string | null;
  requestedAt: string | null;
  cancelledAt: string | null;
  audit: AuditRow[];
}) {
  const isDryRun = !!commandRef && commandRef.startsWith('DRY_RUN');
  const failed = state === 'failed';
  const cut    = state === 'cut_sent';
  const tone =
    failed ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 text-amber-900 dark:text-amber-200' :
    cut    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 text-rose-900 dark:text-rose-200' :
             'bg-blue-50 dark:bg-blue-950/30 border-blue-300 text-blue-900 dark:text-blue-200';

  // Keep only the moves relevant to the immobilization lifecycle.
  const relevant = audit.filter((a) =>
    ['immobilize_requested', 'immobilize_cancelled', 'status_recomputed', 'unblocked']
      .includes(a.action) &&
    (a.action !== 'status_recomputed' || a.metadata?.immobilization),
  );

  return (
    <Card className={`border-2 ${tone}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <Ban className="h-4 w-4" />
            Immobilisation
          </div>
          <Badge variant="outline" className="bg-background/60">
            {IMMO_LABEL[state] ?? state}
          </Badge>
        </div>

        {isDryRun && (
          <div className="text-xs rounded-md bg-background/60 px-2 py-1 inline-block">
            Mode test Uffizio — aucune coupure réelle transmise
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          {requestedAt && (
            <div>
              <div className="opacity-70">Demandée</div>
              <div className="font-medium">
                {format(new Date(requestedAt), 'PPpp', { locale: fr })}
              </div>
            </div>
          )}
          {cancelledAt && (
            <div>
              <div className="opacity-70">Annulée</div>
              <div className="font-medium">
                {format(new Date(cancelledAt), 'PPpp', { locale: fr })}
              </div>
            </div>
          )}
          {commandRef && (
            <div className="col-span-2">
              <div className="opacity-70">Référence commande</div>
              <div className="font-mono text-[11px] break-all">{commandRef}</div>
            </div>
          )}
        </div>

        {relevant.length > 0 && (
          <div className="pt-2 border-t border-current/20">
            <div className="text-xs font-semibold uppercase tracking-wide mb-2 opacity-80">
              Historique
            </div>
            <ol className="space-y-1.5">
              {relevant.map((a) => {
                const m = a.metadata || {};
                const label =
                  a.action === 'immobilize_requested' ? 'Coupure demandée' :
                  a.action === 'immobilize_cancelled' ? 'Coupure annulée' :
                  a.action === 'unblocked'            ? 'Déblocage' :
                  m.immobilization === 'pending_stop' ? "En attente d'arrêt"
                    : m.immobilization === 'cut_sent' ? (m.dry_run ? 'Commande simulée (test)' : 'Commande envoyée')
                    : m.immobilization === 'failed'   ? `Échec${m.error ? ' — ' + m.error : ''}`
                    : a.action;
                return (
                  <li key={a.id} className="flex items-start justify-between gap-3 text-xs">
                    <div className="flex-1">
                      <div className="font-medium">{label}</div>
                      {m.uffizio_status && (
                        <div className="opacity-70">Uffizio : {m.uffizio_status}</div>
                      )}
                    </div>
                    <div className="shrink-0 opacity-70 tabular-nums">
                      {format(new Date(a.created_at), 'dd/MM HH:mm', { locale: fr })}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}