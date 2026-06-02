import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, FileText, Home, Plus, BellRing } from 'lucide-react';
import { DriverLayout } from '@/components/DriverLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CaseStatusBadge } from '@/components/sinistres/CaseStatusBadge';
import { useAccident } from '@/hooks/useSinistres';
import { LoadingState } from '@/components/LoadingState';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function SubmissionSuccess() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: accident, isLoading } = useAccident(id);

  if (isLoading || !accident) {
    return (
      <DriverLayout>
        <LoadingState />
      </DriverLayout>
    );
  }

  return (
    <DriverLayout>
      <div className="px-4 pt-6 pb-24 max-w-md mx-auto space-y-5">
        <div className="flex flex-col items-center text-center space-y-3 pt-4">
          <div className="h-20 w-20 rounded-full bg-success/10 flex items-center justify-center animate-in zoom-in duration-500">
            <CheckCircle2 className="h-10 w-10 text-success" />
          </div>
          <h1 className="text-2xl font-bold">Déclaration envoyée</h1>
          <p className="text-sm text-muted-foreground">
            Votre dossier a bien été transmis à notre équipe. Nous vous tiendrons informé(e) à chaque étape.
          </p>
        </div>

        <Card className="border-success/30">
          <CardContent className="p-5 space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Numéro de dossier</div>
            <div className="font-mono text-2xl font-bold text-center py-1">
              {accident.case_number ?? '—'}
            </div>
            <div className="flex items-center justify-center">
              <CaseStatusBadge status={accident.status} />
            </div>
            <div className="text-xs text-center text-muted-foreground pt-1 border-t">
              Soumis le {format(new Date(accident.submitted_at ?? accident.updated_at), 'dd MMMM yyyy à HH:mm', { locale: fr })}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex items-start gap-3 text-sm">
            <BellRing className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Les administrateurs ont été notifiés</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Vous recevrez une notification dès qu'une mise à jour est disponible.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <Button size="lg" className="w-full" onClick={() => navigate(`/driver/sinistres/cases/${accident.id}`)}>
            <FileText className="h-4 w-4 mr-2" />
            Voir mon dossier
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => navigate('/driver')}>
              <Home className="h-4 w-4 mr-2" />
              Accueil
            </Button>
            <Button variant="outline" onClick={() => navigate('/driver/sinistres')}>
              <Plus className="h-4 w-4 mr-2" />
              Nouveau
            </Button>
          </div>
        </div>
      </div>
    </DriverLayout>
  );
}
