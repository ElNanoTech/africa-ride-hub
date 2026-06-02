import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { AdminLayout } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CaseStatusBadge } from '@/components/sinistres/CaseStatusBadge';
import { SeverityBadge } from '@/components/sinistres/SeverityBadge';
import { AccidentMap } from '@/components/sinistres/AccidentMap';
import { InvestigationForm } from '@/components/sinistres/InvestigationForm';
import { CloseCaseModal } from '@/components/sinistres/CloseCaseModal';
import { RequestInfoModal } from '@/components/sinistres/RequestInfoModal';
import { LoadingState } from '@/components/LoadingState';
import { AdminFileUploader } from '@/components/sinistres/AdminFileUploader';
import { AdminCaseDetailsEditor } from '@/components/sinistres/AdminCaseDetailsEditor';
import {
  useAdminAccident, useAccidentFiles, useAccidentParties, useAccidentTimeline,
  useTransitionAccidentStatus, useAssignAccident, useAddAdminNote, useAdminUsersList,
  useAccidentDetermination, useResolveAccident, useUpdateAccident, allowedTransitions,
} from '@/hooks/useSinistres';
import { useScoringConfig } from '@/hooks/useAdminData';
import { DEFAULT_ACCIDENT_PENALTIES, normalizeAccidentPenaltyConfig } from '@/lib/accidentScoring';
import {
  ShieldAlert, MapPin, Image as ImageIcon, Users, MessageSquare, Activity, Gavel, Clock,
  Phone, Car, FileText, AlertTriangle, ChevronLeft, Lock, Eye, Search,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { STATUS_LABELS_FR, SEVERITY_LABELS_FR, AccidentStatus, AccidentSeverity } from '@/lib/sinistres';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function AdminSinistreDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: accident, isLoading } = useAdminAccident(id);
  const { data: files = [] } = useAccidentFiles(id);
  const { data: parties = [] } = useAccidentParties(id);
  const { data: timeline } = useAccidentTimeline(id);
  const { data: determination } = useAccidentDetermination(id);
  const { data: admins = [] } = useAdminUsersList();
  const qc = useQueryClient();

  const transition = useTransitionAccidentStatus();
  const assign = useAssignAccident();
  const addNote = useAddAdminNote();

  // Realtime: invalidate on changes to this accident or its child rows
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`accident-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accidents', filter: `id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ['admin-accident', id] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accident_notes', filter: `accident_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ['accident-timeline', id] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accident_status_history', filter: `accident_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ['accident-timeline', id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, qc]);

  const [noteBody, setNoteBody] = useState('');
  const [noteVisibility, setNoteVisibility] = useState<'INTERNAL' | 'DRIVER'>('INTERNAL');
  const [transitionReason, setTransitionReason] = useState('');
  const [pendingStatus, setPendingStatus] = useState<AccidentStatus | null>(null);

  if (isLoading || !accident) {
    return (
      <AdminLayout>
        <AdminBreadcrumb items={[{ label: 'Sinistres', href: '/admin/sinistres' }, { label: 'Cas' }]} />
        <LoadingState />
      </AdminLayout>
    );
  }

  const isClosed = accident.status === 'CLOSED' || accident.status === 'CANCELLED';
  const transitions = allowedTransitions(accident.status);

  const handleTransition = async () => {
    if (!pendingStatus) return;
    await transition.mutateAsync({ id: accident.id, status: pendingStatus, reason: transitionReason || undefined });
    setPendingStatus(null);
    setTransitionReason('');
  };

  const handleAssign = (adminId: string) => {
    assign.mutate({ id: accident.id, adminId: adminId === 'UNASSIGN' ? null : adminId });
  };

  const handleAddNote = async () => {
    if (!noteBody.trim()) return;
    await addNote.mutateAsync({ accidentId: accident.id, body: noteBody.trim(), visibility: noteVisibility });
    setNoteBody('');
  };

  const internalNotes = (timeline?.notes ?? []).filter((n: any) => n.visibility === 'INTERNAL');
  const driverNotes = (timeline?.notes ?? []).filter((n: any) => n.visibility === 'DRIVER');

  return (
    <AdminLayout>
      <AdminBreadcrumb
        items={[
          { label: 'Sinistres', href: '/admin/sinistres' },
          { label: accident.case_number ?? 'Cas' },
        ]}
      />

      <div className="space-y-4">
        {/* Header */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="ghost" size="icon" onClick={() => navigate('/admin/sinistres')}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <ShieldAlert className="h-5 w-5 text-primary" />
                  <h1 className="text-xl font-bold font-mono">{accident.case_number ?? '—'}</h1>
                  <CaseStatusBadge status={accident.status} />
                  {isClosed && <Lock className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-3 flex-wrap pl-12">
                  <SeverityBadge severity={accident.severity} />
                  <span>{format(new Date(accident.accident_datetime), 'dd MMM yyyy à HH:mm', { locale: fr })}</span>
                  {accident.injury_involved && <span className="text-destructive font-medium">• Blessés</span>}
                  {accident.police_involved && <span className="text-primary font-medium">• Police</span>}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Assignment */}
                <Select
                  value={accident.assigned_admin_id ?? 'UNASSIGN'}
                  onValueChange={handleAssign}
                  disabled={isClosed}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Non assigné" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNASSIGN">Non assigné</SelectItem>
                    {admins.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.full_name || a.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Status transitions */}
                {transitions.length > 0 && (
                  <Dialog open={!!pendingStatus} onOpenChange={(o) => !o && setPendingStatus(null)}>
                    <Select onValueChange={(v) => setPendingStatus(v as AccidentStatus)}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Changer le statut…" />
                      </SelectTrigger>
                      <SelectContent>
                        {transitions.map((s) => (
                          <SelectItem key={s} value={s}>→ {STATUS_LABELS_FR[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Confirmer la transition</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        <p className="text-sm">
                          <span className="text-muted-foreground">De </span>
                          <span className="font-medium">{STATUS_LABELS_FR[accident.status]}</span>
                          <span className="text-muted-foreground"> vers </span>
                          <span className="font-medium">{pendingStatus && STATUS_LABELS_FR[pendingStatus]}</span>
                        </p>
                        <div className="space-y-1">
                          <Label>Note interne (optionnelle)</Label>
                          <Textarea
                            value={transitionReason}
                            onChange={(e) => setTransitionReason(e.target.value)}
                            placeholder="Raison ou contexte…"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="ghost" onClick={() => setPendingStatus(null)}>Annuler</Button>
                        <Button onClick={handleTransition} disabled={transition.isPending}>Confirmer</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}

                {/* Action: Request more info from driver */}
                {!isClosed && (accident.status === 'UNDER_REVIEW' || accident.status === 'WAITING_DOCS') && (
                  <RequestInfoModal accidentId={accident.id} currentStatus={accident.status} />
                )}

                {accident.status === 'PENDING_DETERMINATION' && (
                  <DeterminationDialog accidentId={accident.id} existing={determination} severity={accident.severity} />
                )}

                {/* Final closure */}
                {(accident.status === 'RESOLVED_AT_FAULT' || accident.status === 'RESOLVED_NOT_AT_FAULT') && (
                  <CloseCaseModal accidentId={accident.id} resolvedStatus={accident.status} />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left — driver/vehicle/location */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardContent className="p-4 space-y-2 text-sm">
                <div className="flex items-center gap-2 font-semibold mb-1">
                  <Users className="h-4 w-4" /> Conducteur
                </div>
                <div className="font-medium">{accident.driver?.full_name ?? '—'}</div>
                {accident.driver?.phone_number && (
                  <a href={`tel:${accident.driver.phone_number}`} className="text-xs text-primary flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {accident.driver.phone_number}
                  </a>
                )}
                <Button
                  variant="link" size="sm" className="px-0 h-auto text-xs"
                  onClick={() => navigate(`/admin/drivers/${accident.driver_id}`)}
                >
                  Voir le profil →
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-2 text-sm">
                <div className="flex items-center gap-2 font-semibold mb-1">
                  <Car className="h-4 w-4" /> Véhicule
                </div>
                <div className="font-mono">{accident.vehicle?.license_plate ?? '—'}</div>
                <div className="text-xs text-muted-foreground">{accident.vehicle?.model_name ?? ''}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-2 text-sm">
                <div className="flex items-center gap-2 font-semibold mb-1">
                  <MapPin className="h-4 w-4" /> Lieu
                </div>
                <AccidentMap lat={accident.location_lat} lng={accident.location_lng} height={160} />
                <div className="text-xs text-muted-foreground">
                  {accident.location_address || 'Adresse non renseignée'}
                  {accident.city && ` — ${accident.city}`}
                </div>
              </CardContent>
            </Card>

            {determination && (
              <Card className="border-primary/40">
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex items-center gap-2 font-semibold mb-1">
                    <Gavel className="h-4 w-4 text-primary" /> Détermination
                  </div>
                  <div>
                    Responsabilité:{' '}
                    <span className={`font-medium ${determination.at_fault ? 'text-destructive' : 'text-success'}`}>
                      {determination.at_fault ? 'Responsable' : 'Non responsable'}
                    </span>
                  </div>
                  {determination.score_impact && (
                    <div className="text-xs">Impact score: <span className="font-medium">{determination.score_delta > 0 ? '+' : ''}{determination.score_delta}</span></div>
                  )}
                  {determination.financial_impact_estimate && (
                    <div className="text-xs">Impact financier: {determination.financial_impact_estimate.toLocaleString()} FCFA</div>
                  )}
                  {determination.fault_basis && (
                    <p className="text-xs text-muted-foreground italic">"{determination.fault_basis}"</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right — Tabs */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="overview">
              <TabsList className="grid grid-cols-7 w-full">
                <TabsTrigger value="overview"><FileText className="h-3 w-3 mr-1" />Aperçu</TabsTrigger>
                <TabsTrigger value="details"><FileText className="h-3 w-3 mr-1" />Détails</TabsTrigger>
                <TabsTrigger value="evidence"><ImageIcon className="h-3 w-3 mr-1" />Preuves ({files.length})</TabsTrigger>
                <TabsTrigger value="parties"><Users className="h-3 w-3 mr-1" />Parties ({parties.length})</TabsTrigger>
                <TabsTrigger value="investigation"><Search className="h-3 w-3 mr-1" />Enquête</TabsTrigger>
                <TabsTrigger value="notes"><MessageSquare className="h-3 w-3 mr-1" />Notes</TabsTrigger>
                <TabsTrigger value="activity"><Activity className="h-3 w-3 mr-1" />Activité</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="mt-3">
                <AdminCaseDetailsEditor accident={accident} disabled={isClosed} />
              </TabsContent>

              <TabsContent value="overview" className="space-y-3 mt-3">
                <Card>
                  <CardContent className="p-4 space-y-3 text-sm">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">DESCRIPTION</div>
                      <p className="whitespace-pre-wrap">{accident.description || <span className="italic text-muted-foreground">Aucune description.</span>}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <Field label="Soumis le" value={accident.submitted_at ? format(new Date(accident.submitted_at), 'dd MMM yyyy HH:mm', { locale: fr }) : '—'} />
                      <Field label="Région" value={accident.region ?? '—'} />
                      <Field label="Autre véhicule" value={accident.other_party_involved ? 'Oui' : 'Non'} />
                      <Field label="Police impliquée" value={accident.police_involved ? 'Oui' : 'Non'} />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="evidence" className="mt-3">
                <Card>
                  <CardContent className="p-4 space-y-3">
                    {!isClosed && (
                      <AdminFileUploader
                        accidentId={accident.id}
                        customerId={accident.customer_id}
                        disabled={isClosed}
                      />
                    )}
                    {files.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">Aucune preuve.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {files.map((f) => (
                          <a key={f.id} href={f.file_url} target="_blank" rel="noreferrer" className="block group">
                            {f.file_type === 'PHOTO' ? (
                              <img src={f.file_url} alt="" className="aspect-square object-cover rounded border group-hover:border-primary" />
                            ) : (
                              <div className="aspect-square bg-muted rounded border flex flex-col items-center justify-center text-xs p-2 group-hover:border-primary">
                                <FileText className="h-6 w-6 mb-1" />
                                <span className="truncate w-full text-center">{f.original_filename ?? f.file_type}</span>
                              </div>
                            )}
                            {f.checklist_tag && (
                              <div className="text-[10px] text-muted-foreground mt-1 truncate">{f.checklist_tag}</div>
                            )}
                          </a>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="parties" className="mt-3">
                <Card>
                  <CardContent className="p-4 space-y-2">
                    {parties.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">Aucune partie.</p>
                    ) : (
                      parties.map((p) => (
                        <div key={p.id} className="border rounded p-3 text-sm space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{p.name || p.party_type}</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-muted">{p.party_type}</span>
                          </div>
                          {p.phone && <div className="text-xs">📞 {p.phone}</div>}
                          {p.plate && <div className="text-xs font-mono">{p.plate} — {p.vehicle_info ?? ''}</div>}
                          {p.insurer && <div className="text-xs">Assurance: {p.insurer} ({p.insurance_policy ?? '—'})</div>}
                          {p.report_number && <div className="text-xs">Rapport: {p.report_number}</div>}
                          {p.notes && <div className="text-xs text-muted-foreground italic">"{p.notes}"</div>}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="investigation" className="mt-3">
                <InvestigationForm
                  accidentId={accident.id}
                  customerId={accident.customer_id}
                  disabled={isClosed}
                />
              </TabsContent>

              <TabsContent value="notes" className="mt-3 space-y-3">
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="space-y-2">
                      <Label>Nouvelle note</Label>
                      <Textarea
                        value={noteBody}
                        onChange={(e) => setNoteBody(e.target.value)}
                        placeholder="Ajoutez une note interne ou un message au conducteur…"
                        rows={3}
                      />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={noteVisibility === 'DRIVER'}
                            onCheckedChange={(c) => setNoteVisibility(c ? 'DRIVER' : 'INTERNAL')}
                          />
                          <Label className="text-xs flex items-center gap-1">
                            {noteVisibility === 'DRIVER'
                              ? <><Eye className="h-3 w-3" /> Visible par le conducteur</>
                              : <><Lock className="h-3 w-3" /> Note interne uniquement</>}
                          </Label>
                        </div>
                        <Button size="sm" onClick={handleAddNote} disabled={!noteBody.trim() || addNote.isPending}>
                          Publier
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <NoteSection title="Notes internes" items={internalNotes} icon={<Lock className="h-3 w-3" />} />
                <NoteSection title="Échanges avec le conducteur" items={driverNotes} icon={<Eye className="h-3 w-3" />} />
              </TabsContent>

              <TabsContent value="activity" className="mt-3">
                <Card>
                  <CardContent className="p-4 space-y-3">
                    {(timeline?.history ?? []).length === 0 && (timeline?.activity ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">Aucune activité.</p>
                    ) : (
                      <ol className="border-l border-border ml-2 space-y-3">
                        {(timeline?.history ?? []).map((h: any) => (
                          <li key={h.id} className="ml-4 relative">
                            <span className="absolute -left-[22px] top-1 h-3 w-3 rounded-full bg-primary" />
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(h.created_at), 'dd MMM HH:mm', { locale: fr })}
                            </div>
                            <div className="text-sm">
                              Statut: <span className="text-muted-foreground">{h.old_status ?? 'init'}</span> →{' '}
                              <span className="font-medium">{STATUS_LABELS_FR[h.new_status as AccidentStatus] ?? h.new_status}</span>
                            </div>
                          </li>
                        ))}
                        {(timeline?.activity ?? []).map((a: any) => (
                          <li key={a.id} className="ml-4 relative">
                            <span className="absolute -left-[22px] top-1 h-3 w-3 rounded-full bg-muted" />
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(a.created_at), 'dd MMM HH:mm', { locale: fr })}
                            </div>
                            <div className="text-sm">{a.action_type}</div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-muted-foreground uppercase">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function NoteSection({ title, items, icon }: { title: string; items: any[]; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">{icon}{title}</div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Aucune note.</p>
        ) : (
          items.map((n: any) => (
            <div key={n.id} className="border rounded p-2 text-sm">
              <div className="text-xs text-muted-foreground mb-1">
                {format(new Date(n.created_at), 'dd MMM HH:mm', { locale: fr })}
              </div>
              <p className="whitespace-pre-wrap">{n.body}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ===== Determination Dialog (with strict score validation) =====
const SELECTABLE_SEVERITIES: Exclude<AccidentSeverity, 'UNKNOWN'>[] = ['MINOR', 'MODERATE', 'SEVERE'];

function DeterminationDialog({ accidentId, existing, severity }: { accidentId: string; existing?: any; severity?: AccidentSeverity }) {
  const { data: scoringConfig } = useScoringConfig();
  const penalties = normalizeAccidentPenaltyConfig(
    (scoringConfig as Record<string, unknown> | undefined)?.accident_penalties,
  );
  // Mapped to severity strings used in this dialog
  const SEVERITY_DEFAULTS: Record<string, number> = {
    MINOR: penalties.MINOR,
    MODERATE: penalties.MODERATE,
    SEVERE: penalties.SEVERE,
  };

  const [open, setOpen] = useState(false);
  const [atFault, setAtFault] = useState<boolean>(existing?.at_fault ?? false);
  const [scoreImpact, setScoreImpact] = useState<boolean>(existing?.score_impact ?? true);
  // Severity is now editable from the determination dialog. Default to whatever
  // is on the accident — but if it's UNKNOWN, force the admin to pick.
  const initialSeverity: AccidentSeverity = severity && severity !== 'UNKNOWN' ? severity : 'UNKNOWN';
  const [decidedSeverity, setDecidedSeverity] = useState<AccidentSeverity>(initialSeverity);
  const [scoreDelta, setScoreDelta] = useState<number>(
    existing?.score_delta ?? SEVERITY_DEFAULTS[initialSeverity] ?? DEFAULT_ACCIDENT_PENALTIES.MODERATE,
  );
  const [faultBasis, setFaultBasis] = useState<string>(existing?.fault_basis ?? '');
  const [summary, setSummary] = useState<string>(existing?.final_summary ?? '');
  const [financial, setFinancial] = useState<string>(existing?.financial_impact_estimate?.toString() ?? '');
  const [insuranceAction, setInsuranceAction] = useState<boolean>(existing?.insurance_action_required ?? false);
  const resolve = useResolveAccident();
  const update = useUpdateAccident();

  // Spec rule: NOT_AT_FAULT → score_delta MUST be 0 and score_impact false
  useEffect(() => {
    if (!atFault) {
      setScoreImpact(false);
      setScoreDelta(0);
    } else if (atFault && scoreDelta === 0) {
      setScoreImpact(true);
      setScoreDelta(SEVERITY_DEFAULTS[decidedSeverity] ?? DEFAULT_ACCIDENT_PENALTIES.MODERATE);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atFault]);

  // When the admin picks a severity, suggest the matching default delta
  // (only if at-fault and impact is on, and only when the field hasn't been
  // hand-tuned to a non-default value).
  useEffect(() => {
    if (atFault && scoreImpact && SEVERITY_DEFAULTS[decidedSeverity] !== undefined) {
      setScoreDelta(SEVERITY_DEFAULTS[decidedSeverity]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decidedSeverity, scoringConfig]);

  const submit = async () => {
    if (decidedSeverity === 'UNKNOWN') {
      toast.error('Veuillez choisir la gravité avant de statuer.');
      return;
    }
    if (!faultBasis.trim()) {
      toast.error('Veuillez indiquer la base de la décision.');
      return;
    }
    if (atFault && !summary.trim()) {
      toast.error('Le résumé final est requis pour une décision de responsabilité.');
      return;
    }
    if (atFault && scoreImpact && scoreDelta >= 0) {
      toast.error('Un impact négatif est requis pour une décision "responsable".');
      return;
    }

    // Persist severity onto the accident first so badges, KPIs and history stay coherent.
    if (decidedSeverity !== severity) {
      try {
        await update.mutateAsync({ id: accidentId, patch: { severity: decidedSeverity } });
      } catch (e: any) {
        toast.error('Impossible de sauvegarder la gravité', { description: e.message });
        return;
      }
    }

    await resolve.mutateAsync({
      accident_id: accidentId,
      at_fault: atFault,
      fault_basis: faultBasis,
      final_summary: summary,
      score_impact: atFault ? scoreImpact : false,
      score_delta: atFault && scoreImpact ? Number(scoreDelta) : 0,
      financial_impact_estimate: financial ? Number(financial) : null,
      insurance_action_required: insuranceAction,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default"><Gavel className="h-4 w-4 mr-2" />Statuer</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Détermination de responsabilité</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Severity selector — required */}
          <div className="space-y-1.5">
            <Label>Gravité de l'accident *</Label>
            <div className="grid grid-cols-3 gap-2">
              {SELECTABLE_SEVERITIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDecidedSeverity(s)}
                  className={cn(
                    'h-12 rounded-md border-2 text-sm font-medium transition-colors',
                    decidedSeverity === s
                      ? s === 'SEVERE'
                        ? 'border-destructive bg-destructive/10 text-destructive'
                        : s === 'MODERATE'
                        ? 'border-warning bg-warning/10 text-warning'
                        : 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/40',
                  )}
                >
                  {SEVERITY_LABELS_FR[s]}
                </button>
              ))}
            </div>
            {decidedSeverity === 'UNKNOWN' && (
              <p className="text-[11px] text-warning">Sélectionnez la gravité avant de statuer.</p>
            )}
          </div>

          <div className="flex items-center justify-between p-3 border rounded">
            <div>
              <Label>Responsabilité du conducteur</Label>
              <p className="text-xs text-muted-foreground">Activez si le conducteur est jugé responsable.</p>
            </div>
            <Switch checked={atFault} onCheckedChange={setAtFault} />
          </div>

          <div className="space-y-1">
            <Label>Base de la décision *</Label>
            <Textarea value={faultBasis} onChange={(e) => setFaultBasis(e.target.value)} placeholder="Rapport de police, témoignages, vidéo…" />
          </div>

          <div className="space-y-1">
            <Label>Résumé final {atFault && '*'}</Label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Résumé de la décision communiqué au conducteur." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Switch checked={scoreImpact} onCheckedChange={setScoreImpact} disabled={!atFault} />
                <Label className="text-xs">Impact sur le DAM Score</Label>
              </div>
              {atFault && scoreImpact ? (
                <Input
                  type="number"
                  value={scoreDelta}
                  onChange={(e) => setScoreDelta(Number(e.target.value))}
                  placeholder={`Ex. ${SEVERITY_DEFAULTS[decidedSeverity] ?? -75}`}
                />
              ) : (
                <p className="text-[11px] text-muted-foreground italic">
                  {atFault ? 'Aucun impact sélectionné' : 'Score inchangé (non responsable)'}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Impact financier (FCFA)</Label>
              <Input type="number" value={financial} onChange={(e) => setFinancial(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={insuranceAction} onCheckedChange={setInsuranceAction} />
            <Label className="text-xs">Action d'assurance requise</Label>
          </div>

          <div className="flex items-start gap-2 p-2 rounded bg-warning/10 text-xs">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <span>
              Le statut passera à <strong>{atFault ? STATUS_LABELS_FR.RESOLVED_AT_FAULT : STATUS_LABELS_FR.RESOLVED_NOT_AT_FAULT}</strong>
              {atFault && scoreImpact ? ` et le score sera ajusté de ${scoreDelta}` : ''}.
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={submit} disabled={resolve.isPending || update.isPending}>Enregistrer la décision</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

