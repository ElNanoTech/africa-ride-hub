import { useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft, MapPin, MessageCircle, Send, Clock, FileText, Users, Image as ImageIcon } from 'lucide-react';
import { DriverLayout } from '@/components/DriverLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { LoadingState } from '@/components/LoadingState';
import { CaseStatusBadge } from '@/components/sinistres/CaseStatusBadge';
import { AccidentMap } from '@/components/sinistres/AccidentMap';
import { UploadMissingDocs } from '@/components/sinistres/UploadMissingDocs';
import {
  useAccident,
  useAccidentFiles,
  useAccidentParties,
  useAccidentTimeline,
  useAddDriverComment,
} from '@/hooks/useSinistres';
import { STATUS_LABELS_FR, SEVERITY_LABELS_FR } from '@/lib/sinistres';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: accident, isLoading } = useAccident(id);
  const { data: files = [] } = useAccidentFiles(id);
  const { data: parties = [] } = useAccidentParties(id);
  const { data: timeline } = useAccidentTimeline(id);
  const addComment = useAddDriverComment();
  const [comment, setComment] = useState('');

  if (isLoading || !accident) {
    return (
      <DriverLayout>
        <LoadingState />
      </DriverLayout>
    );
  }

  const driverNotes = (timeline?.notes ?? []).filter((n: any) => n.visibility === 'DRIVER' || n.visibility === 'ALL');

  const submitComment = async () => {
    if (!comment.trim() || !id) return;
    await addComment.mutateAsync({ accidentId: id, body: comment.trim() });
    setComment('');
  };

  return (
    <DriverLayout>
      <div className="px-4 pt-2 pb-24 space-y-4 max-w-md mx-auto">
        <button
          className="flex items-center gap-1 text-sm text-muted-foreground"
          onClick={() => navigate('/driver/sinistres')}
        >
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>

        {/* Header */}
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Dossier</div>
              <h1 className="text-xl font-bold truncate">{accident.case_number || 'Brouillon'}</h1>
            </div>
            <CaseStatusBadge status={accident.status} />
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Déclaré le {format(new Date(accident.created_at), 'dd MMM yyyy', { locale: fr })}
          </div>
        </div>

        {/* Waiting-docs CTA — driver responds to admin's request */}
        {id && <UploadMissingDocs accidentId={id} />}

        {/* Summary */}
        <Card>
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="flex items-center gap-2 font-semibold">
              <FileText className="h-4 w-4" /> Détails
            </div>
            <div className="text-muted-foreground text-xs">
              {format(new Date(accident.accident_datetime), 'dd MMMM yyyy à HH:mm', { locale: fr })}
            </div>
            <div>
              Gravité: <span className="font-medium">{SEVERITY_LABELS_FR[accident.severity]}</span>
            </div>
            <div className="flex flex-wrap gap-1 text-xs">
              {accident.other_party_involved && <span className="px-2 py-0.5 rounded bg-muted">Autre véhicule</span>}
              {accident.injury_involved && (
                <span className="px-2 py-0.5 rounded bg-destructive/10 text-destructive">Blessés</span>
              )}
              {accident.police_involved && <span className="px-2 py-0.5 rounded bg-primary/10 text-primary">Police</span>}
            </div>
            {accident.description && <p className="text-muted-foreground italic mt-1">"{accident.description}"</p>}
          </CardContent>
        </Card>

        {/* Map */}
        {accident.location_lat != null && (
          <Card>
            <CardContent className="p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <MapPin className="h-4 w-4" /> Lieu
              </div>
              <AccidentMap lat={accident.location_lat} lng={accident.location_lng} height={160} />
              <div className="text-xs text-muted-foreground">
                {accident.location_address || ''} {accident.city ? `— ${accident.city}` : ''}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Files */}
        {files.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <ImageIcon className="h-4 w-4" /> Preuves ({files.length})
              </div>
              <div className="grid grid-cols-4 gap-1">
                {files.map((f) =>
                  f.file_type === 'PHOTO' ? (
                    <a key={f.id} href={f.file_url} target="_blank" rel="noreferrer">
                      <img src={f.file_url} alt="" className="aspect-square object-cover rounded" />
                    </a>
                  ) : (
                    <a
                      key={f.id}
                      href={f.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="aspect-square bg-muted rounded flex items-center justify-center text-[10px] p-1 text-center"
                    >
                      {f.file_type}
                    </a>
                  ),
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Parties */}
        {parties.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <Users className="h-4 w-4" /> Parties ({parties.length})
              </div>
              {parties.map((p) => (
                <div key={p.id} className="text-xs text-muted-foreground border-t border-border pt-1 first:border-0 first:pt-0">
                  <span className="font-medium text-foreground">{p.name || p.party_type}</span>
                  {p.phone && ` — ${p.phone}`}
                  {p.plate && ` — ${p.plate}`}
                  {p.insurer && ` — ${p.insurer}`}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Timeline */}
        <Card>
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="flex items-center gap-2 font-semibold">
              <Clock className="h-4 w-4" /> Historique
            </div>
            {(timeline?.history ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun événement</p>
            ) : (
              <ol className="space-y-2 mt-1">
                {(timeline?.history ?? []).map((h: any) => (
                  <li key={h.id} className="text-xs">
                    <div className="font-medium">
                      {h.old_status ? `${STATUS_LABELS_FR[h.old_status as keyof typeof STATUS_LABELS_FR] ?? h.old_status} → ` : ''}
                      {STATUS_LABELS_FR[h.new_status as keyof typeof STATUS_LABELS_FR] ?? h.new_status}
                    </div>
                    <div className="text-muted-foreground">
                      {format(new Date(h.created_at), 'dd MMM yyyy HH:mm', { locale: fr })}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Comments */}
        <Card>
          <CardContent className="p-4 space-y-3 text-sm">
            <div className="flex items-center gap-2 font-semibold">
              <MessageCircle className="h-4 w-4" /> Commentaires
            </div>
            {driverNotes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun message pour l'instant</p>
            ) : (
              <div className="space-y-2">
                {driverNotes.map((n: any) => (
                  <div key={n.id} className="bg-muted/50 rounded-lg p-2 text-xs">
                    <p>{n.body}</p>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {format(new Date(n.created_at), 'dd MMM HH:mm', { locale: fr })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Textarea
                placeholder="Ajouter un message à l'équipe…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                className="text-sm"
              />
              <Button size="icon" onClick={submitComment} disabled={!comment.trim() || addComment.isPending}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DriverLayout>
  );
}
