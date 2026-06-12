import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, AlertTriangle, ShieldCheck, Send, RefreshCw, Ban, Upload, Clock, Inbox, CheckCheck, History } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase as _supabase } from '@/integrations/supabase/routeClient';
import { useDriverAuth } from '@/hooks/useDriverAuth';
import { useRealtimePostgresChanges } from '@/hooks/useRealtimePostgresChanges';
import { compressImage } from '@/lib/imageCompression';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { FleetControlZoneTile } from '@/components/driver/FleetControlZoneTile';
import {
  ALL_ZONES,
  PHOTO_ZONES,
  DOCUMENT_ZONES,
  OPEN_FLEET_CONTROL_STATUSES,
  STATUS_LABEL,
  STATUS_CLASS,
  IMMO_LABEL,
  effectiveStatus,
  formatDueDateRelative,
  immobilizationBanner,
  requiredZones,
  signInspectionPhotoUrls,
  DEFAULT_FLEET_CONTROL_SETTINGS,
  type ZoneKey,
  type FleetControlStatus,
  type ItemValidation,
  type ImmobilizationState,
} from '@/lib/fleetControl';
import { useFleetControlSettings } from '@/hooks/useFleetControlSettings';

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

interface ThumbsResult {
  urls: Record<string, string>;
  failed: Record<string, true>;
}

const EMPTY_THUMBS: ThumbsResult = { urls: {}, failed: {} };

type SignedCacheEntry = { url: string; signedAt: number } | { failed: true; signedAt: number };
// Signed URLs live 1h; re-sign well before expiry.
const SIGNED_URL_REUSE_MS = 45 * 60_000;
// Ignore realtime echoes of our own uploads for this long.
const OWN_UPLOAD_ECHO_MS = 10_000;

export default function VehicleInspection() {
  const { driverProfile } = useDriverAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [uploadingZone, setUploadingZone] = useState<ZoneKey | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [notes, setNotes] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingZone, setPendingZone] = useState<ZoneKey | null>(null);
  const [pendingKind, setPendingKind] = useState<'camera' | 'gallery' | 'document' | null>(null);
  const pendingZoneRef = useRef<ZoneKey | null>(null);
  const pendingKindRef = useRef<'camera' | 'gallery' | 'document' | null>(null);
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, true>>({});
  // Per-photo signed-URL cache (keyed id+storage_path) so unchanged tiles
  // reuse their URL instead of re-signing on every photos change.
  const signedUrlCacheRef = useRef(new Map<string, SignedCacheEntry>());
  // storage_paths we just uploaded — used to skip realtime echoes of our own writes.
  const recentUploadsRef = useRef(new Map<string, number>());
  const [viewFail, setViewFail] = useState<{
    zone: ZoneKey;
    kind: 'camera' | 'doc';
    label: string;
    retrying: boolean;
  } | null>(null);

  const tryOpenSignedUrl = async (storagePath: string): Promise<string | null> => {
    try {
      const { data: sig, error } = await supabase.storage
        .from('vehicle-inspections')
        .createSignedUrl(storagePath, 3600);
      if (error || !sig?.signedUrl) return null;
      try {
        const head = await fetch(sig.signedUrl, { method: 'HEAD' });
        if (!head.ok) return null;
      } catch {
        // HEAD blocked by CORS in some setups — fall through and trust the URL.
      }
      return sig.signedUrl;
    } catch {
      return null;
    }
  };

  const driverId = driverProfile?.id;

  // Get-or-create the current open fleet control for this driver.
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['driver-inspection', driverId],
    enabled: !!driverId,
    queryFn: async () => {
      const { data: candidates, error } = await supabase
        .from('vehicle_inspections')
        .select(`
          id, vehicle_id, driver_id, status, due_at, submitted_at, reviewed_at, rejection_reason, notes,
          immobilization_state, immobilization_command_ref, immobilization_requested_at, immobilization_cancelled_at,
          vehicles:vehicles!vehicle_inspections_vehicle_id_fkey ( license_plate, make, model_name )
        `)
        .eq('driver_id', driverId)
        .in('status', [...OPEN_FLEET_CONTROL_STATUSES, 'approved'])
        .order('updated_at', { ascending: false })
        .limit(8);
      if (error) throw error;

      // Prefer what the driver must act on now. A relance creates/surfaces a
      // pending cycle, so pending/overdue must win over a recently approved row.
      const list = (candidates ?? []) as any[];
      const pickActive = list.find((r) =>
        ['pending', 'overdue', 'rejected', 'blocked'].includes(r.status),
      );
      const recentlyApproved = list.find(
        (r) =>
          r.status === 'approved' &&
          r.reviewed_at &&
          Date.now() - new Date(r.reviewed_at).getTime() < 24 * 60 * 60 * 1000,
      );
      let inspection: Inspection | null =
        (pickActive ?? recentlyApproved ?? list[0] ?? null) as any;

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
    // FC-D5: realtime is the primary refresh path (below); keep a slow poll
    // as a fallback for dropped websockets on flaky networks.
    refetchInterval: 5 * 60_000,
  });

  const inspection = data?.inspection ?? null;
  const photos = data?.photos ?? [];
  const audit = data?.audit ?? [];

  // FC-D5: live refresh of the driver's own items. Control-row changes are
  // handled by useDriverActiveInspection's single shared channel (mounted via
  // BottomNav on every driver page), which invalidates both the nav/home key
  // and this page's ['driver-inspection'] key — no duplicate channel here.
  const invalidateInspection = () => {
    queryClient.invalidateQueries({ queryKey: ['driver-inspection', driverId] });
    queryClient.invalidateQueries({ queryKey: ['driver-active-inspection', driverId] });
  };
  useRealtimePostgresChanges<{ inspection_id?: string; storage_path?: string }>(
    'vehicle_inspection_photos',
    '*',
    (p) => {
      if ((p.new?.inspection_id ?? p.old?.inspection_id) !== inspection?.id) return false;
      // Skip echoes of our own uploads — we already refetched after writing.
      const now = Date.now();
      for (const [path, at] of recentUploadsRef.current) {
        if (now - at > OWN_UPLOAD_ECHO_MS) recentUploadsRef.current.delete(path);
      }
      const path = p.new?.storage_path ?? p.old?.storage_path;
      return !(path && recentUploadsRef.current.has(path));
    },
    invalidateInspection,
    !!inspection?.id,
  );

  // FC-A3/D3: required zone set derived from the shared tenant settings —
  // totals stay correct when require_all_photos / require_documents change.
  const { data: fcSettings = DEFAULT_FLEET_CONTROL_SETTINGS } = useFleetControlSettings();
  const reqZones = useMemo(() => requiredZones(fcSettings), [fcSettings]);
  const reqZoneKeys = useMemo(() => new Set(reqZones.map((z) => z.key)), [reqZones]);
  const reqPhotoZones = useMemo(() => reqZones.filter((z) => z.kind === 'photo'), [reqZones]);
  const reqDocZones = useMemo(() => reqZones.filter((z) => z.kind === 'document'), [reqZones]);

  const photosByZone = useMemo(() => {
    const map: Record<string, Photo> = {};
    for (const p of photos) map[p.zone] = p;
    return map;
  }, [photos]);

  // Nothing invisible: render the union of required zones and zones that
  // already hold an uploaded item (e.g. uploaded before a setting flip, or a
  // rejected extra piece) — the driver must always see and be able to act on
  // every item the admin can see.
  const visiblePhotoZones = useMemo(
    () => PHOTO_ZONES.filter((z) => reqZoneKeys.has(z.key) || photosByZone[z.key]),
    [reqZoneKeys, photosByZone],
  );
  const visibleDocZones = useMemo(
    () => DOCUMENT_ZONES.filter((z) => reqZoneKeys.has(z.key) || photosByZone[z.key]),
    [reqZoneKeys, photosByZone],
  );

  // Resolve signed URLs for every uploaded item so we can show real thumbnails
  // (PDFs return a URL too; the tile falls back to a doc icon). One batched
  // createSignedUrls call; per-photo cache keyed id+storage_path so unchanged
  // tiles reuse their URL.
  const { data: thumbs = EMPTY_THUMBS, isFetching: thumbsLoading } = useQuery<ThumbsResult>({
    queryKey: ['driver-inspection-thumbs', inspection?.id, photos.map(p => p.id + p.storage_path).join('|')],
    enabled: !!inspection && photos.length > 0,
    queryFn: async () => {
      const cache = signedUrlCacheRef.current;
      const now = Date.now();
      const missing = photos.filter((p) => {
        const entry = cache.get(p.id + p.storage_path);
        return !entry || now - entry.signedAt > SIGNED_URL_REUSE_MS;
      });
      if (missing.length > 0) {
        const signed = await signInspectionPhotoUrls(supabase, missing);
        for (const p of missing) {
          const key = p.id + p.storage_path;
          if (signed.urls[p.id]) cache.set(key, { url: signed.urls[p.id], signedAt: now });
          else cache.set(key, { failed: true, signedAt: now });
        }
      }
      const urls: Record<string, string> = {};
      const failed: Record<string, true> = {};
      for (const p of photos) {
        const entry = cache.get(p.id + p.storage_path);
        if (entry && 'url' in entry) urls[p.id] = entry.url;
        else if (entry) failed[p.id] = true;
      }
      return { urls, failed };
    },
  });

  const isZoneDone = (key: ZoneKey) => {
    const photo = photosByZone[key];
    return !!photo && !thumbs.failed[photo.id] && !brokenThumbs[photo.id];
  };
  // Progress counts only the required zones (FC-A3/D3) — mirrors the server check.
  const completedCount = reqZones.filter((z) => isZoneDone(z.key)).length;
  const photosDone = reqPhotoZones.filter((z) => isZoneDone(z.key)).length;
  const docsDone = reqDocZones.filter((z) => isZoneDone(z.key)).length;
  // Rejected count / scroll-to-rejected operate on RENDERED tiles (required
  // ∪ uploaded) so a rejected extra piece is always reachable.
  const renderedZoneKeys = useMemo(
    () => new Set([...visiblePhotoZones, ...visibleDocZones].map((z) => z.key)),
    [visiblePhotoZones, visibleDocZones],
  );
  const rejectedCount = photos.filter(
    (p) => renderedZoneKeys.has(p.zone) && p.validation_status === 'rejected',
  ).length;
  const canSubmit =
    completedCount === reqZones.length &&
    inspection?.status !== 'submitted' &&
    inspection?.status !== 'approved';

  const handlePickPhoto = (zone: ZoneKey, kind: 'camera' | 'gallery' | 'document') => {
    if (!inspection) return;
    setPendingZone(zone);
    setPendingKind(kind);
    pendingZoneRef.current = zone;
    pendingKindRef.current = kind;
    const input = fileRef.current;
    if (!input) return;
    input.accept = kind === 'document' ? 'image/*,application/pdf' : 'image/*';
    if (kind === 'camera') input.setAttribute('capture', 'environment');
    else input.removeAttribute('capture');
    input.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const selectedZone = pendingZoneRef.current ?? pendingZone;
    const selectedKind = pendingKindRef.current ?? pendingKind;
    pendingZoneRef.current = null;
    pendingKindRef.current = null;
    if (!file || !selectedZone || !inspection) return;
    const zone = selectedZone;
    setPendingZone(null);
    const kind = selectedKind;
    setPendingKind(null);
    setUploadingZone(zone);
    setUploadProgress(0);
    try {
      // Compress images; pass PDFs/other docs through as-is.
      const isImage = file.type.startsWith('image/');
      let compressed: File;
      try {
        compressed = isImage ? await compressImage(file) : file;
      } catch (cErr) {
        console.error('compress failed', cErr);
        toast.error('Image illisible', { description: 'Le fichier sélectionné est corrompu ou non supporté.' });
        setUploadingZone(null);
        return;
      }
      const ext = (compressed.name.split('.').pop() || (isImage ? 'jpg' : 'bin')).toLowerCase();
      // Hard size cap: 10 MB for any single piece of evidence (post-compression for images).
      const MAX_BYTES = 10 * 1024 * 1024;
      if (compressed.size > MAX_BYTES) {
        const mb = (compressed.size / 1024 / 1024).toFixed(1);
        toast.error('Fichier trop volumineux', {
          description: `${mb} Mo dépasse la limite de 10 Mo. Réduisez la taille ou prenez une photo de moins bonne qualité.`,
        });
        setUploadingZone(null);
        return;
      }
      const path = `${inspection.id}/${zone}-${Date.now()}.${ext}`;

      // Use a signed upload URL + XHR so we can surface real progress to the driver.
      const { data: signed, error: signErr } = await supabase.storage
        .from('vehicle-inspections')
        .createSignedUploadUrl(path);
      if (signErr || !signed?.signedUrl) {
        throw signErr ?? new Error('signed-url-missing');
      }
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', signed.signedUrl, true);
        xhr.setRequestHeader('Content-Type', compressed.type || 'application/octet-stream');
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadProgress(100);
            resolve();
          } else {
            reject(new Error(`HTTP ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error('network'));
        xhr.onabort = () => reject(new Error('aborted'));
        xhr.send(compressed);
      });

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

      // Remember our own write so the realtime photos channel skips its echo.
      recentUploadsRef.current.set(path, Date.now());

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
      console.error('inspection upload failed', err);
      const msg = String(err?.message ?? err ?? '');
      let description = 'Veuillez réessayer.';
      if (/network|Failed to fetch|aborted/i.test(msg)) {
        description = 'Connexion interrompue. Vérifiez votre réseau et réessayez.';
      } else if (/HTTP 413|too large|exceed/i.test(msg)) {
        description = 'Fichier trop volumineux pour le serveur (max 10 Mo).';
      } else if (/HTTP 401|HTTP 403|forbidden|permission/i.test(msg)) {
        description = "Session expirée. Reconnectez-vous puis recommencez l'envoi.";
      } else if (/HTTP 5\d\d/i.test(msg)) {
        description = 'Serveur indisponible. Réessayez dans un instant.';
      } else if (msg) {
        description = msg;
      }
      toast.error("Échec de l'envoi de la pièce", { description });
    } finally {
      setUploadingZone(null);
      setUploadProgress(0);
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
              <div className="flex flex-col gap-2">
                <Button variant="outline" onClick={() => navigate('/driver/fleet-control/history')}>
                  <History className="h-4 w-4 mr-2" /> Voir l'historique
                </Button>
                <Button variant="ghost" onClick={() => navigate('/driver')}>Retour</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DriverLayout>
    );
  }

  const eff = effectiveStatus(inspection.status, inspection.due_at);
  const isLate = eff === 'overdue';
  const immoBanner = immobilizationBanner(inspection.immobilization_state, inspection.status);
  // The cycle is locked once approved. While `submitted`, only items that the
  // admin has explicitly rejected can be re-uploaded — approved/submitted
  // items stay read-only until the next cycle.
  const cycleLocked = inspection.status === 'approved';
  const reviewInProgress = inspection.status === 'submitted';

  const renderZoneTile = (z: { key: ZoneKey; label: string; help: string }, kind: 'camera' | 'doc') => {
    const photo = photosByZone[z.key];
    const busy = uploadingZone === z.key;
    const rejected = photo?.validation_status === 'rejected';
    const approved = photo?.validation_status === 'approved';
    const thumbUrl = photo ? thumbs.urls[photo.id] : undefined;
    const thumbFailed = !!photo && (!!thumbs.failed[photo.id] || !!brokenThumbs[photo.id]);
    // Tile is editable when: never approved, and (no review pending OR this item was rejected).
    const itemLocked = cycleLocked || approved || (reviewInProgress && !rejected && !thumbFailed);
    return (
      <FleetControlZoneTile
        key={z.key}
        zone={z}
        kind={kind}
        photo={photo ?? null}
        busy={busy}
        progress={busy ? uploadProgress : 0}
        thumbUrl={thumbUrl}
        thumbFailed={thumbFailed}
        thumbsLoading={thumbsLoading}
        itemLocked={itemLocked}
        onPick={(k) => handlePickPhoto(z.key, k)}
        onThumbError={() => photo && setBrokenThumbs((prev) => ({ ...prev, [photo.id]: true }))}
        onView={async () => {
          if (!photo) return;
          let url = thumbUrl;
          if (!url) {
            url = await tryOpenSignedUrl(photo.storage_path) || undefined;
          }
          if (!url) {
            // Mark thumb as broken so the tile reflects the missing file,
            // and open the fallback modal so the driver can retry or re-upload.
            setBrokenThumbs((prev) => ({ ...prev, [photo.id]: true }));
            setViewFail({ zone: z.key, kind, label: z.label, retrying: false });
            return;
          }
          window.open(url, '_blank');
        }}
      />
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
                <div className={`text-sm font-medium ${isLate ? 'text-rose-600' : ''}`}>
                  {formatDueDateRelative(inspection.due_at)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Échéance le {format(new Date(inspection.due_at), 'PPP', { locale: fr })}
                </div>
              </div>
              <Badge className={STATUS_CLASS[eff]}>{STATUS_LABEL[eff]}</Badge>
            </div>
            <div className="text-sm">
              <span className="font-medium">{completedCount}/{reqZones.length} pièces fournies</span>
              {reqPhotoZones.length > 0 && reqDocZones.length > 0 && (
                <span className="text-muted-foreground">
                  {' '}· Véhicule : {photosDone}/{reqPhotoZones.length} · Documents : {docsDone}/{reqDocZones.length}
                </span>
              )}
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
            {reviewInProgress && (
              <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 text-sm text-blue-800 dark:text-blue-200 flex items-start gap-2">
                <Clock className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Contrôle envoyé</div>
                  <div className="opacity-90">
                    Votre gestionnaire va vérifier vos photos. Vous serez notifié dès validation.
                  </div>
                </div>
              </div>
            )}
            {inspection.status === 'approved' && (
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm text-emerald-800 dark:text-emerald-200 flex items-start gap-2">
                <CheckCheck className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Contrôle validé</div>
                  <div className="opacity-90">Aucune action requise jusqu'au prochain cycle.</div>
                </div>
              </div>
            )}
            {/* FC-D6: honest immobilization copy (shared helper) — never claims a
                cut unless cut_sent, never claims that submitting lifts the restriction. */}
            {immoBanner && (
              <div className="rounded-md bg-rose-100 dark:bg-rose-950/40 p-3 text-sm text-rose-800 dark:text-rose-200 flex items-start gap-2">
                <Ban className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">{immoBanner.title}</div>
                  <div className="opacity-90">{immoBanner.description}</div>
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

        {/* FC-A3/D3: required zones ∪ zones with an uploaded item — nothing the
            admin can review is ever invisible to the driver. */}
        {visiblePhotoZones.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Photos du véhicule
            </div>
            <div className="grid grid-cols-2 gap-3">
              {visiblePhotoZones.map((z) => renderZoneTile(z, 'camera'))}
            </div>
          </div>
        )}

        {visibleDocZones.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Documents
            </div>
            <div className="grid grid-cols-2 gap-3">
              {visibleDocZones.map((z) => renderZoneTile(z, 'doc'))}
            </div>
          </div>
        )}

        {/* Review timeline */}
        <ReviewTimeline
          status={inspection.status}
          submittedAt={inspection.submitted_at}
          completedCount={completedCount}
        />

        {!cycleLocked && !reviewInProgress && (
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

        {/* Spacer so content isn't hidden behind the sticky bar + bottom nav */}
        <div className="h-44" />
        <div className="flex items-center justify-center gap-2">
          <Button onClick={() => refetch()} variant="ghost" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" /> Rafraîchir
          </Button>
          <Button onClick={() => navigate('/driver/fleet-control/history')} variant="ghost" size="sm">
            <History className="h-4 w-4 mr-2" /> Voir l'historique
          </Button>
        </div>
      </div>

      {/* Sticky bottom action bar */}
      <StickyActionBar
        status={inspection.status}
        completed={completedCount}
        required={reqZones.length}
        rejectedCount={rejectedCount}
        canSubmit={canSubmit}
        onSubmit={handleSubmit}
      />

        <input
          ref={fileRef}
          type="file"
          accept={pendingKind === 'document' ? 'image/*,application/pdf' : 'image/*'}
          {...(pendingKind === 'camera' ? { capture: 'environment' as any } : {})}
          className="hidden"
          onChange={handleFile}
        />

      <Dialog open={!!viewFail} onOpenChange={(o) => !o && setViewFail(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pièce introuvable</DialogTitle>
            <DialogDescription>
              Nous n'avons pas pu ouvrir « {viewFail?.label} ». Le fichier semble manquant ou inaccessible.
              Vous pouvez réessayer ou renvoyer la pièce maintenant.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={!!viewFail?.retrying}
              onClick={async () => {
                if (!viewFail) return;
                const photo = photosByZone[viewFail.zone];
                if (!photo) {
                  setViewFail(null);
                  return;
                }
                setViewFail({ ...viewFail, retrying: true });
                const url = await tryOpenSignedUrl(photo.storage_path);
                if (url) {
                  // Recovered — clear the broken flag, refresh the per-photo
                  // cache entry, and open the file.
                  setBrokenThumbs((prev) => {
                    const next = { ...prev };
                    delete next[photo.id];
                    return next;
                  });
                  signedUrlCacheRef.current.set(
                    photo.id + photo.storage_path,
                    { url, signedAt: Date.now() },
                  );
                  queryClient.invalidateQueries({ queryKey: ['driver-inspection-thumbs'] });
                  window.open(url, '_blank');
                  setViewFail(null);
                } else {
                  toast.error('La pièce est toujours indisponible.', {
                    description: 'Renvoyez le fichier pour la remplacer.',
                  });
                  setViewFail({ ...viewFail, retrying: false });
                }
              }}
            >
              {viewFail?.retrying ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Nouvelle tentative…</>
              ) : (
                <><RefreshCw className="h-4 w-4 mr-1" /> Réessayer</>
              )}
            </Button>
            <Button
              type="button"
              variant="default"
              className="w-full"
              onClick={() => {
                if (!viewFail) return;
                const { zone, kind } = viewFail;
                setViewFail(null);
                handlePickPhoto(zone, kind === 'doc' ? 'document' : 'camera');
              }}
            >
              <Upload className="h-4 w-4 mr-1" />
              {viewFail?.kind === 'doc' ? 'Renvoyer le document' : 'Reprendre la photo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

/**
 * Compact 3-step timeline that reflects where the cycle currently stands:
 * 1) Pièces envoyées (uploads in progress)
 * 2) En attente de validation (status=submitted)
 * 3) Validé / Refusé (status=approved|rejected)
 */
function ReviewTimeline({
  status,
  submittedAt,
  completedCount,
}: {
  status: FleetControlStatus;
  submittedAt: string | null;
  completedCount: number;
}) {
  const piecesDone = completedCount > 0;
  const sent = status === 'submitted' || status === 'approved' || status === 'rejected';
  const reviewed = status === 'approved' || status === 'rejected';
  const rejected = status === 'rejected';

  const steps = [
    { key: 'pieces',  label: 'Pièces envoyées',        icon: Inbox,       done: piecesDone, current: !sent && piecesDone },
    { key: 'review',  label: 'En attente de validation', icon: Clock,     done: sent,       current: sent && !reviewed },
    { key: 'done',    label: rejected ? 'Refusé' : 'Validé', icon: rejected ? AlertTriangle : CheckCheck, done: reviewed, current: reviewed },
  ];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Suivi du contrôle
        </div>
        <ol className="flex items-center justify-between gap-2">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const tone = s.done
              ? (s.key === 'done' && rejected ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white')
              : s.current
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground';
            return (
              <li key={s.key} className="flex-1 flex flex-col items-center text-center">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center ${tone}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className={`text-[11px] mt-1 ${s.done || s.current ? 'font-medium' : 'text-muted-foreground'}`}>
                  {s.label}
                </div>
                {i < steps.length - 1 && (
                  <div className="hidden" />
                )}
              </li>
            );
          })}
        </ol>
        {submittedAt && (
          <div className="text-[11px] text-muted-foreground mt-2 text-center">
            Envoyé le {format(new Date(submittedAt), 'PPpp', { locale: fr })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Sticky bottom action bar with state-aware labels per the spec:
 * - incomplete  → "Soumettre le contrôle" (disabled until 11/11)
 * - complete    → enabled submit button
 * - submitted   → "Envoyé pour validation" (disabled, neutral)
 * - rejected    → "Corriger les éléments refusés" (scrolls to first rejected tile)
 * - approved    → "Contrôle validé" (disabled, success)
 */
function StickyActionBar({
  status,
  completed,
  required,
  rejectedCount,
  canSubmit,
  onSubmit,
}: {
  status: FleetControlStatus;
  completed: number;
  required: number;
  rejectedCount: number;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  let label = 'Soumettre le contrôle';
  let disabled = !canSubmit;
  let variant: 'default' | 'destructive' | 'secondary' = 'default';
  let onClick: () => void = onSubmit;
  let icon = <Send className="h-5 w-5 mr-2" />;

  if (status === 'approved') {
    label = 'Contrôle validé';
    disabled = true;
    variant = 'secondary';
    icon = <CheckCheck className="h-5 w-5 mr-2" />;
  } else if (status === 'rejected' && rejectedCount > 0) {
    label = 'Corriger les éléments refusés';
    disabled = false;
    variant = 'destructive';
    icon = <AlertTriangle className="h-5 w-5 mr-2" />;
    onClick = () => {
      const el = document.querySelector('[data-rejected="true"]');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
  } else if (status === 'submitted') {
    label = 'Envoyé pour validation';
    disabled = true;
    variant = 'secondary';
    icon = <Clock className="h-5 w-5 mr-2" />;
  }

  return (
    <div
      className="fixed inset-x-0 z-[60] border-t border-border bg-background/98 backdrop-blur supports-[backdrop-filter]:bg-background/90 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)]"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 80px)' }}
    >
      <div className="max-w-2xl mx-auto px-3 py-3 space-y-2">
        {status !== 'approved' && status !== 'submitted' && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{completed}/{required} pièces</span>
            {rejectedCount > 0 && (
              <span className="text-rose-600 font-medium">{rejectedCount} à corriger</span>
            )}
          </div>
        )}
        <Button
          onClick={onClick}
          disabled={disabled}
          variant={variant}
          className="w-full h-12 text-base"
          size="lg"
        >
          {icon}
          {label}
        </Button>
      </div>
    </div>
  );
}