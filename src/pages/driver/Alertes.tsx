import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { AlertTriangle, Bell, FileWarning, ShieldAlert, Car, CreditCard, CheckCircle2 } from 'lucide-react';
import { formatRelativeTime } from '@/lib/format';
import { toast } from 'sonner';

const TYPE_META: Record<string, { label: string; icon: any }> = {
  kyc_expiry: { label: 'Pièce d\'identité', icon: FileWarning },
  insurance_expiry: { label: 'Assurance', icon: ShieldAlert },
  registration_expiry: { label: 'Carte grise', icon: FileWarning },
  rental_overdue: { label: 'Location en retard', icon: Car },
  payment_overdue: { label: 'Paiement en retard', icon: CreditCard },
  low_score: { label: 'Score bas', icon: AlertTriangle },
  accident_unresolved: { label: 'Sinistre ouvert', icon: AlertTriangle },
  contravention_pending: { label: 'Contravention', icon: AlertTriangle },
  inspection_overdue: { label: 'Inspection en retard', icon: Car },
  vehicle_immobilized: { label: 'Véhicule immobilisé', icon: Car },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
  high: 'bg-orange-500/10 text-orange-700 border-orange-300',
  medium: 'bg-yellow-500/10 text-yellow-700 border-yellow-300',
  low: 'bg-muted text-muted-foreground border-border',
};

export default function DriverAlertes() {
  const qc = useQueryClient();

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['driver-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .neq('status', 'resolved')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60000,
  });

  const acknowledge = async (id: string) => {
    const { error } = await supabase
      .from('alerts')
      .update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      toast.error('Impossible de marquer comme lu');
      return;
    }
    toast.success('Marqué comme lu');
    qc.invalidateQueries({ queryKey: ['driver-alerts'] });
  };

  return (
    <DriverLayout className="bg-background">
      <PageHeader title="Mes alertes" subtitle="Documents et événements à surveiller" />

      <div className="px-4 py-4 space-y-3">
        {isLoading && (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        )}

        {!isLoading && (!alerts || alerts.length === 0) && (
          <EmptyState
            icon={<CheckCircle2 className="h-12 w-12 text-success" />}
            title="Tout est en ordre !"
            description="Vous n'avez aucune alerte pour le moment."
          />
        )}

        {!isLoading && alerts && alerts.map((a: any) => {
          const meta = TYPE_META[a.alert_type] ?? { label: a.alert_type, icon: Bell };
          const Icon = meta.icon;
          return (
            <Card key={a.id} className={SEVERITY_COLORS[a.severity] ?? SEVERITY_COLORS.medium}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-full bg-background/60">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant="outline" className="text-xs">{meta.label}</Badge>
                      {a.severity === 'critical' && (
                        <Badge variant="destructive" className="text-xs">Critique</Badge>
                      )}
                    </div>
                    <h3 className="font-semibold text-sm">{a.title}</h3>
                    {a.message && (
                      <p className="text-xs mt-1 opacity-80">{a.message}</p>
                    )}
                    <p className="text-[11px] mt-2 opacity-60">
                      {formatRelativeTime(a.created_at)}
                      {a.due_date ? ` • Échéance: ${new Date(a.due_date).toLocaleDateString('fr-FR')}` : ''}
                    </p>
                    {a.status === 'open' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2 h-8 text-xs"
                        onClick={() => acknowledge(a.id)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        Marquer comme lu
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </DriverLayout>
  );
}