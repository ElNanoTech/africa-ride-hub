import { useNavigate } from 'react-router-dom';
import { Plus, FileText, Phone, FilePlus2, Trash2, Car, ShieldCheck, Lock } from 'lucide-react';
import { DriverLayout } from '@/components/DriverLayout';
import { DriverBreadcrumb } from '@/components/DriverBreadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  useDriverAccidents,
  useDriverAccidentDraft,
  useCreateAccidentDraft,
  useCancelAccident,
  useDriverActiveRental,
} from '@/hooks/useSinistres';
import { useDriverAuth } from '@/hooks/useDriverAuth';
import { CaseStatusBadge } from '@/components/sinistres/CaseStatusBadge';
import { LoadingState } from '@/components/LoadingState';
import { EmptyState } from '@/components/EmptyState';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';

export default function SinistresHome() {
  const navigate = useNavigate();
  const { driverProfile } = useDriverAuth();
  const { data: accidents = [], isLoading } = useDriverAccidents();
  const { data: draft } = useDriverAccidentDraft();
  const { data: activeRental, isLoading: rentalLoading } = useDriverActiveRental();
  const createDraft = useCreateAccidentDraft();
  const cancelDraft = useCancelAccident();

  const kycVerified = driverProfile?.kycStatus === 'verified';
  const canDeclare = !!activeRental && kycVerified;

  const startReport = async () => {
    if (!canDeclare) return;
    if (draft) {
      navigate(`/driver/sinistres/report/${draft.id}/safety`);
      return;
    }
    try {
      const id = await createDraft.mutateAsync(undefined);
      navigate(`/driver/sinistres/report/${id}/safety`);
    } catch (e: any) {
      toast.error('Création impossible', { description: e.message });
    }
  };

  const deleteDraft = async () => {
    if (!draft) return;
    try {
      await cancelDraft.mutateAsync(draft.id);
      toast.success('Brouillon supprimé');
    } catch (e: any) {
      toast.error('Suppression impossible', { description: e.message });
    }
  };

  const submitted = accidents.filter((a) => a.status !== 'DRAFT' && a.status !== 'CANCELLED');

  return (
    <DriverLayout>
      <DriverBreadcrumb items={[{ label: 'Sinistres' }]} />
      <div className="px-4 pt-2 pb-24 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Sinistres</h1>
          <p className="text-sm text-muted-foreground mt-1">Déclarez un accident en moins de 3 minutes.</p>
        </div>

        {/* Eligibility gate */}
        {!rentalLoading && !canDeclare && (
          <Card className="border-warning/40 bg-warning/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h2 className="font-semibold text-sm">Déclaration indisponible</h2>
                  {!kycVerified ? (
                    <p className="text-xs text-muted-foreground">
                      Votre identité doit être vérifiée avant de pouvoir déclarer un accident.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Vous devez avoir un véhicule actuellement en location. Un sinistre est toujours rattaché au véhicule loué au moment des faits.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {!kycVerified ? (
                  <Button variant="outline" size="sm" onClick={() => navigate('/driver/kyc')}>
                    <ShieldCheck className="h-4 w-4 mr-2" /> Vérifier mon identité
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => navigate('/driver/rental')}>
                    <Car className="h-4 w-4 mr-2" /> Voir mes locations
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active rental confirmation (only when eligible) */}
        {canDeclare && activeRental?.vehicle && (
          <Card className="border-success/30 bg-success/5">
            <CardContent className="p-3 flex items-center gap-3 text-sm">
              <Car className="h-5 w-5 text-success shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">
                  {activeRental.vehicle.model_name ?? 'Véhicule loué'}
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {activeRental.vehicle.license_plate ?? '—'}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Button
          size="lg"
          className="w-full h-14 text-base font-semibold"
          onClick={startReport}
          disabled={createDraft.isPending || !canDeclare}
        >
          <Plus className="h-5 w-5 mr-2" />
          {draft ? 'Reprendre le brouillon' : 'Déclarer un accident'}
        </Button>

        {draft ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full" disabled={cancelDraft.isPending}>
                <Trash2 className="h-4 w-4 mr-2" />
                Supprimer le brouillon
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer ce brouillon ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette déclaration non soumise sera retirée de votre liste et vous devrez recommencer si besoin.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={deleteDraft}>Supprimer</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="h-12" onClick={() => window.location.href = 'tel:170'}>
            <Phone className="h-4 w-4 mr-2" /> Urgences
          </Button>
          <Button variant="outline" className="h-12" onClick={() => navigate('/driver/support')}>
            <FilePlus2 className="h-4 w-4 mr-2" /> Aide
          </Button>
        </div>

        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Mes dossiers</h2>
          {isLoading ? (
            <LoadingState />
          ) : submitted.length === 0 ? (
            <EmptyState icon={<FileText className="h-6 w-6 text-muted-foreground" />} title="Aucun dossier" description="Vos déclarations apparaîtront ici." />
          ) : (
            <div className="space-y-2">
              {submitted.map((a) => (
                <Card
                  key={a.id}
                  className="cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => navigate(`/driver/sinistres/cases/${a.id}`)}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm">{a.case_number || 'Sans numéro'}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(a.accident_datetime), 'dd MMM yyyy', { locale: fr })}
                      </div>
                    </div>
                    <CaseStatusBadge status={a.status} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </DriverLayout>
  );
}
