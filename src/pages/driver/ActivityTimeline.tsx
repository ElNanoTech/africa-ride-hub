import { Link } from 'react-router-dom';
import { ArrowLeft, Clock3, RefreshCw } from 'lucide-react';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { TimelineCard } from '@/components/driver/DriverExperienceCards';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDriverId } from '@/hooks/useDriverData';
import { useDriverActivityTimeline } from '@/hooks/useDriverActivityTimeline';

export default function ActivityTimeline() {
  const { data: driverId } = useDriverId();
  const timeline = useDriverActivityTimeline(driverId, 40);

  return (
    <DriverLayout>
      <PageHeader
        title="Historique"
        subtitle="Vos paiements, contrôles et messages"
        action={
          <Button variant="outline" size="sm" onClick={() => timeline.refetch()} disabled={timeline.isFetching}>
            <RefreshCw className={timeline.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Actualiser
          </Button>
        }
      />

      <div className="px-4 pb-8">
        <Link to="/driver" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />
          Accueil
        </Link>

        {timeline.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : (
          <TimelineCard
            title="Activité récente"
            items={timeline.data ?? []}
          />
        )}

        <div className="mt-4 rounded-xl border bg-muted/35 p-4">
          <div className="flex items-start gap-3">
            <Clock3 className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-semibold">Pourquoi cet historique ?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Chaque ligne explique ce qui a changé sur votre compte. Si quelque chose semble incorrect,
                contactez votre gestionnaire depuis Besoin d'aide.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DriverLayout>
  );
}
