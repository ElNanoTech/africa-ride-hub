import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Camera, FileText, ImageOff, CheckCircle2, XCircle, BellRing, Zap, Ban, History, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase as _supabase } from '@/integrations/supabase/routeClient';
import { fleetCategoryLabel } from '@/lib/fleetCategories';
import {
  PHOTO_ZONES,
  DOCUMENT_ZONES,
  ALL_ZONES,
  STATUS_LABEL,
  STATUS_CLASS,
  IMMO_LABEL,
  effectiveStatus,
  type FleetControlStatus,
  type ImmobilizationState,
  type ZoneKey,
  type ItemValidation,
} from '@/lib/fleetControl';

const supabase = _supabase as any;

export interface FleetControlRow {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  status: FleetControlStatus;
  due_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  reminder_count: number;
  last_reminder_at: string | null;
  immobilization_state: ImmobilizationState;
  immobilization_command_ref: string | null;
  notes?: string | null;
  vehicles?: { license_plate: string | null; make: string | null; model: string | null; fleet_group: string | null } | null;
  drivers?: { first_name: string | null; last_name: string | null } | null;
}

interface ItemRow {
  id: string;
  zone: ZoneKey;
  storage_path: string;
  validation_status: ItemValidation;
  rejection_reason: string | null;
  reviewed_at: string | null;
  submitted_at: string | null;
  url: string | null;
}

interface AuditRow {
  id: string;
  action: string;
  actor_type: string;
  created_at: string;
  metadata: Record<string, any>;
}

interface Props {
  row: FleetControlRow | null;
  onClose: () => void;
  cooldownHours: number;
}

const ACTION_LABEL: Record<string, string> = {
  control_submitted: 'Soumis par le chauffeur',
  control_approved: 'Contrôle approuvé',
  control_rejected: 'Contrôle refusé',
  item_approved: 'Pièce approuvée',
  item_rejected: 'Pièce refusée',
  reminder_sent: 'Relance envoyée',
  immobilization_requested: 'Coupure demandée',
  immobilization_cancelled: 'Coupure annulée',
  unblocked: 'Véhicule débloqué',
  status_recomputed: 'Statut recalculé',
};

export function FleetControlDetailDialog({ row, onClose, cooldownHours }: Props) {
  const open = !!row;
  const qc = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [fullRejectReason, setFullRejectReason] = useState('');
  const [showFullReject, setShowFullReject] = useState(false);

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ['fleet-control', 'items', row?.id],
    enabled: open && !!row?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_inspection_photos')
        .select('id, zone, storage_path, validation_status, rejection_reason, reviewed_at, submitted_at')
        .eq('inspection_id', row!.id);
      if (error) throw error;
      const rows = (data ?? []) as Omit<ItemRow, 'url'>[];
      const withUrls = await Promise.all(rows.map(async (it) => {
        const { data: sig } = await supabase.storage
          .from('vehicle-inspections')
          .createSignedUrl(it.storage_path, 3600);
        return { ...it, url: sig?.signedUrl ?? null } as ItemRow;
      }));
      const byZone: Record<string, ItemRow> = {};
      for (const it of withUrls) byZone[it.zone] = it;
      return byZone;
    },
  });

  const { data: audit } = useQuery({
    queryKey: ['fleet-control', 'audit', row?.id],
    enabled: open && !!row?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_control_audit')
        .select('id, action, actor_type, created_at, metadata')
        .eq('fleet_control_id', row!.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['fleet-control'] });
  };

  const approveItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('fleet_control_item_review', {
        p_item: id, p_status: 'approved', p_reason: null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Pièce approuvée'); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  });

  const rejectItem = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('fleet_control_item_review', {
        p_item: id, p_status: 'rejected', p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Pièce refusée');
      setRejectingId(null); setRejectionReason('');
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  });

  const approveControl = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('fleet_control_approve', { p_control: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Contrôle approuvé'); invalidate(); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  });

  const rejectControl = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('fleet_control_reject', { p_control: id, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Contrôle refusé'); setShowFullReject(false); setFullRejectReason(''); invalidate(); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  });

  const remind = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('fleet_control_remind', { p_control: id });
      if (error) throw error;
      return data as { sent: boolean; cooldown_until?: string };
    },
    onSuccess: (r) => {
      if (r?.sent) toast.success('Relance envoyée');
      else toast.info('Déjà relancé récemment', {
        description: r?.cooldown_until ? `Réessayez après ${format(new Date(r.cooldown_until), 'PPp', { locale: fr })}` : undefined,
      });
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  });

  const immobilize = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('fleet_control_immobilize_request', {
        p_control: id, p_reason: 'Demande manuelle',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Commande de coupure enregistrée', {
        description: "Intégration Uffizio en attente — la coupure réelle interviendra dès que le véhicule sera détecté stationné.",
      });
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  });

  const cancelImmo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('fleet_control_immobilize_cancel', { p_control: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Demande annulée'); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  });

  const unblock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('fleet_control_unblock', { p_control: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Véhicule débloqué'); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  });

  const filledCount = useMemo(
    () => ALL_ZONES.filter((z) => items?.[z.key]).length,
    [items],
  );

  if (!row) return null;

  const plate = row.vehicles?.license_plate ?? '—';
  const model = [row.vehicles?.make, row.vehicles?.model_name].filter(Boolean).join(' ') || 'Véhicule';
  const driverName = row.drivers ? [row.drivers.first_name, row.drivers.last_name].filter(Boolean).join(' ') : '⚠️ Non assigné';
  const eff = effectiveStatus(row.status, row.due_at);

  const cooldownActive = !!row.last_reminder_at &&
    new Date(row.last_reminder_at).getTime() + cooldownHours * 3_600_000 > Date.now();

  const canApproveFull = filledCount === ALL_ZONES.length &&
    Object.values(items ?? {}).every((it) => it.validation_status !== 'rejected');

  const immoState = row.immobilization_state;
  const showImmoRequest = immoState === 'none' || immoState === 'cancelled' || immoState === 'unblocked';
  const showImmoCancel  = immoState === 'requested' || immoState === 'pending_stop';
  const showUnblock     = immoState === 'cut_sent' || row.status === 'blocked';

  const busy = approveControl.isPending || rejectControl.isPending || remind.isPending || immobilize.isPending || cancelImmo.isPending || unblock.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-3 border-b">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-lg">{plate}</DialogTitle>
            {row.vehicles?.fleet_group && (
              <Badge variant="outline" className="text-[10px]">{fleetCategoryLabel(row.vehicles.fleet_group)}</Badge>
            )}
            <Badge className={STATUS_CLASS[eff] + ' text-[10px]'}>{STATUS_LABEL[eff]}</Badge>
            <Badge variant="secondary" className="text-[10px]">{filledCount}/{ALL_ZONES.length} pièces</Badge>
            {immoState !== 'none' && (
              <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 text-[10px]">
                <Ban className="h-3 w-3 mr-1" /> {IMMO_LABEL[immoState]}
              </Badge>
            )}
          </div>
          <DialogDescription className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-1">
            <span>{model}</span>
            <span>👤 {driverName}</span>
            <span>📅 Échéance {format(new Date(row.due_at), 'd MMM yyyy', { locale: fr })}</span>
            {row.submitted_at && <span>📤 Soumis {format(new Date(row.submitted_at), 'd MMM HH:mm', { locale: fr })}</span>}
            {row.reminder_count > 0 && <span>🔔 {row.reminder_count} relance(s)</span>}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            <ZoneSection
              title="Zones du véhicule" icon={<Camera className="h-4 w-4" />}
              zones={PHOTO_ZONES} items={items} loading={itemsLoading}
              onApprove={(id) => approveItem.mutate(id)}
              onReject={(id) => { setRejectingId(id); setRejectionReason(''); }}
              rejectingId={rejectingId}
              rejectionReason={rejectionReason}
              setRejectionReason={setRejectionReason}
              onConfirmReject={() => rejectingId && rejectItem.mutate({ id: rejectingId, reason: rejectionReason })}
              onCancelReject={() => { setRejectingId(null); setRejectionReason(''); }}
              itemBusy={approveItem.isPending || rejectItem.isPending}
            />

            <ZoneSection
              title="Documents" icon={<FileText className="h-4 w-4" />} doc
              zones={DOCUMENT_ZONES} items={items} loading={itemsLoading}
              onApprove={(id) => approveItem.mutate(id)}
              onReject={(id) => { setRejectingId(id); setRejectionReason(''); }}
              rejectingId={rejectingId}
              rejectionReason={rejectionReason}
              setRejectionReason={setRejectionReason}
              onConfirmReject={() => rejectingId && rejectItem.mutate({ id: rejectingId, reason: rejectionReason })}
              onCancelReject={() => { setRejectingId(null); setRejectionReason(''); }}
              itemBusy={approveItem.isPending || rejectItem.isPending}
            />

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

            {immoState !== 'none' && (
              <div className="rounded-md border bg-amber-50/60 dark:bg-amber-950/20 border-amber-200/50 p-3 text-xs space-y-1">
                <div className="font-semibold flex items-center gap-1.5"><Ban className="h-3.5 w-3.5" /> État immobilisation : {IMMO_LABEL[immoState]}</div>
                <div className="text-muted-foreground">
                  {immoState === 'requested' && 'En attente que le véhicule soit détecté stationné.'}
                  {immoState === 'pending_stop' && 'Véhicule stationné — coupure programmée.'}
                  {immoState === 'cut_sent' && (row.immobilization_command_ref === 'PENDING_INTEGRATION'
                    ? "Commande enregistrée — intégration Uffizio en attente."
                    : `Commande envoyée (réf : ${row.immobilization_command_ref}).`)}
                </div>
              </div>
            )}

            {/* Audit timeline */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <History className="h-4 w-4" /> Historique
              </h3>
              {!audit?.length ? (
                <p className="text-xs text-muted-foreground">Aucune action enregistrée pour le moment.</p>
              ) : (
                <ul className="space-y-2">
                  {audit.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 text-xs">
                      <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{ACTION_LABEL[a.action] ?? a.action}</div>
                        <div className="text-muted-foreground">
                          {format(new Date(a.created_at), 'd MMM yyyy HH:mm', { locale: fr })}
                          {' · '}{a.actor_type}
                          {a.metadata?.reason && ` · ${a.metadata.reason}`}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="p-4 border-t bg-muted/30 flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy || cooldownActive} onClick={() => remind.mutate(row.id)}>
              <BellRing className="h-4 w-4 mr-1" />
              {cooldownActive ? `Relance possible plus tard` : 'Relancer'}
            </Button>
            {showImmoRequest && (
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => immobilize.mutate(row.id)}>
                <Zap className="h-4 w-4 mr-1" /> Couper si stationné
              </Button>
            )}
            {showImmoCancel && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => cancelImmo.mutate(row.id)}>
                Annuler la coupure
              </Button>
            )}
            {showUnblock && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => unblock.mutate(row.id)}>
                Débloquer
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setShowFullReject((v) => !v)}>
              <XCircle className="h-4 w-4 mr-1" /> Refuser
            </Button>
            <Button size="sm" disabled={!canApproveFull || busy} onClick={() => approveControl.mutate(row.id)}>
              {approveControl.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Approuver
            </Button>
          </div>
        </DialogFooter>

        {showFullReject && (
          <div className="p-4 border-t bg-rose-50/60 dark:bg-rose-950/20 space-y-2">
            <label className="text-xs font-medium">Motif du refus (obligatoire)</label>
            <Textarea
              value={fullRejectReason}
              onChange={(e) => setFullRejectReason(e.target.value)}
              placeholder="Expliquez au chauffeur pourquoi le contrôle est refusé…"
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setShowFullReject(false); setFullRejectReason(''); }}>Annuler</Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!fullRejectReason.trim() || rejectControl.isPending}
                onClick={() => rejectControl.mutate({ id: row.id, reason: fullRejectReason.trim() })}
              >
                Confirmer le refus
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ZoneSection({
  title, icon, zones, items, loading, doc,
  onApprove, onReject,
  rejectingId, rejectionReason, setRejectionReason,
  onConfirmReject, onCancelReject, itemBusy,
}: {
  title: string;
  icon: React.ReactNode;
  zones: { key: ZoneKey; label: string }[];
  items?: Record<string, ItemRow>;
  loading: boolean;
  doc?: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  rejectingId: string | null;
  rejectionReason: string;
  setRejectionReason: (v: string) => void;
  onConfirmReject: () => void;
  onCancelReject: () => void;
  itemBusy: boolean;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
        {icon} {title}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {zones.map((z) => {
          const item = items?.[z.key];
          const isRejecting = rejectingId === item?.id;
          return (
            <div key={z.key} className="space-y-1.5">
              <div className="relative aspect-square w-full rounded-lg overflow-hidden border bg-muted/40 flex items-center justify-center">
                {loading ? (
                  <Skeleton className="h-full w-full" />
                ) : item?.url ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
                    <img src={item.url} alt={z.label} className="h-full w-full object-cover hover:scale-105 transition-transform" loading="lazy" />
                  </a>
                ) : (
                  <div className="flex flex-col items-center justify-center text-muted-foreground gap-1">
                    {doc ? <FileText className="h-6 w-6 opacity-40" /> : <ImageOff className="h-6 w-6 opacity-40" />}
                    <span className="text-[10px] uppercase tracking-wider">Manquant</span>
                  </div>
                )}
                {item && item.validation_status === 'approved' && (
                  <span className="absolute top-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </span>
                )}
                {item && item.validation_status === 'rejected' && (
                  <span className="absolute top-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white shadow">
                    <XCircle className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
              <p className="text-xs font-medium leading-tight text-center">{z.label}</p>
              {item && (
                isRejecting ? (
                  <div className="space-y-1">
                    <Textarea rows={2} value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Motif…" className="text-xs" />
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 text-[10px] flex-1" onClick={onCancelReject}>Annuler</Button>
                      <Button size="sm" variant="destructive" className="h-7 text-[10px] flex-1"
                        disabled={!rejectionReason.trim() || itemBusy} onClick={onConfirmReject}>OK</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 text-[10px] flex-1"
                      disabled={itemBusy || item.validation_status === 'rejected'}
                      onClick={() => onReject(item.id)}>Refuser</Button>
                    <Button size="sm" className="h-7 text-[10px] flex-1"
                      disabled={itemBusy || item.validation_status === 'approved'}
                      onClick={() => onApprove(item.id)}>Approuver</Button>
                  </div>
                )
              )}
              {item?.rejection_reason && !isRejecting && (
                <p className="text-[10px] text-rose-600 text-center">{item.rejection_reason}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}