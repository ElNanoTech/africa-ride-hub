import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { AlertTriangle, Bell, Car, CheckCircle2, ChevronRight, CreditCard, FileWarning, ShieldAlert, TrendingUp, type LucideIcon } from 'lucide-react';
import { formatDateShort, formatRelativeTime } from '@/lib/format';
import { toast } from 'sonner';
import { useDriverId } from '@/hooks/useDriverData';
import { useRealtimePostgresChanges } from '@/hooks/useRealtimePostgresChanges';
import { alertDeepLink } from '@/lib/driverOps';

interface DriverAlert {
  id: string;
  alert_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string | null;
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  source_table: string | null;
  source_id: string | null;
  due_date: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const TYPE_META: Record<string, { label: string; group: string; icon: LucideIcon }> = {
  invoice_overdue: { label: 'Facture', group: 'Finance', icon: CreditCard },
  payment_overdue: { label: 'Paiement', group: 'Finance', icon: CreditCard },
  rental_overdue: { label: 'Location', group: 'Finance', icon: CreditCard },
  low_score: { label: 'Score', group: 'Crédit', icon: TrendingUp },
  kyc_expiry: { label: 'KYC', group: 'Conformité', icon: FileWarning },
  kyc_pending_review: { label: 'KYC', group: 'Conformité', icon: FileWarning },
  kyc_rejected: { label: 'KYC', group: 'Conformité', icon: ShieldAlert },
  insurance_expiry: { label: 'Assurance', group: 'Véhicule', icon: ShieldAlert },
  registration_expiry: { label: 'Carte grise', group: 'Véhicule', icon: FileWarning },
  inspection_overdue: { label: 'Contrôle', group: 'Véhicule', icon: Car },
  vehicle_immobilized: { label: 'Véhicule', group: 'Véhicule', icon: Car },
  accident_unresolved: { label: 'Sinistre', group: 'Véhicule', icon: AlertTriangle },
  contravention_pending: { label: 'Contravention', group: 'Véhicule', icon: AlertTriangle },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'border-destructive/40 bg-destructive/10 text-destructive',
  high: 'border-orange-300 bg-orange-50 text-orange-800',
  medium: 'border-yellow-300 bg-yellow-50 text-yellow-800',
  low: 'border-border bg-muted/50 text-muted-foreground',
};

function isRecent(alert: DriverAlert) {
  return Date.now() - new Date(alert.created_at).getTime() < 7 * 24 * 60 * 60 * 1000;
}

function AlertRow({
  alert,
  onOpen,
  onAcknowledge,
}: {
  alert: DriverAlert;
  onOpen: (alert: DriverAlert) => void;
  onAcknowledge: (alert: DriverAlert) => void;
}) {
  const meta = TYPE_META[alert.alert_type] ?? { label: alert.alert_type, group: 'Alerte', icon: Bell };
  const Icon = meta.icon;
  const isUnread = alert.status === 'open';

  return (
    <Card className={SEVERITY_COLORS[alert.severity] ?? SEVERITY_COLORS.medium}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full bg-background/70">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="outline" className="text-xs">{meta.group}</Badge>
              <Badge variant="outline" className="text-xs">{meta.label}</Badge>
              {isUnread && <Badge variant="destructive" className="text-xs">Non lu</Badge>}
              {alert.severity === 'critical' && <Badge variant="destructive" className="text-xs">Critique</Badge>}
            </div>
            <h3 className="font-semibold text-sm">{alert.title}</h3>
            {alert.message && <p className="text-xs mt-1 opacity-80">{alert.message}</p>}
            <p className="text-[11px] mt-2 opacity-60">
              {formatRelativeTime(alert.created_at)}
              {alert.due_date ? ` · Échéance: ${formatDateShort(alert.due_date)}` : ''}
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" className="h-8 text-xs" onClick={() => onOpen(alert)}>
                Ouvrir
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
              {isUnread && (
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onAcknowledge(alert)}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Marquer lu
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertSection({
  title,
  alerts,
  empty,
  onOpen,
  onAcknowledge,
}: {
  title: string;
  alerts: DriverAlert[];
  empty: string;
  onOpen: (alert: DriverAlert) => void;
  onAcknowledge: (alert: DriverAlert) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        <Badge variant="outline">{alerts.length}</Badge>
      </div>
      {alerts.length === 0 ? (
        <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        alerts.map((alert) => (
          <AlertRow
            key={alert.id}
            alert={alert}
            onOpen={onOpen}
            onAcknowledge={onAcknowledge}
          />
        ))
      )}
    </section>
  );
}

export default function DriverAlertes() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: driverId } = useDriverId();

  useRealtimePostgresChanges<{ driver_id?: string }>(
    'alerts',
    '*',
    (payload) => (payload.new?.driver_id ?? payload.old?.driver_id) === driverId,
    () => qc.invalidateQueries({ queryKey: ['driver-alerts', driverId] }),
    !!driverId,
  );

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['driver-alerts', driverId],
    queryFn: async () => {
      if (!driverId) return [];
      const { data, error } = await supabase
        .from('alerts')
        .select('id, alert_type, severity, title, message, status, source_table, source_id, due_date, metadata, created_at')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as DriverAlert[];
    },
    enabled: !!driverId,
    refetchInterval: 60000,
  });

  const sections = useMemo(() => {
    const unread = alerts.filter((alert) => alert.status === 'open');
    const recent = alerts.filter((alert) => alert.status !== 'open' && alert.status !== 'resolved' && isRecent(alert));
    const history = alerts.filter((alert) => alert.status === 'resolved' || alert.status === 'dismissed' || (!isRecent(alert) && alert.status !== 'open'));
    return { unread, recent, history };
  }, [alerts]);

  const acknowledge = async (alert: DriverAlert) => {
    if (alert.status !== 'open') return;
    const alertRpcClient = supabase as unknown as {
      rpc(
        fn: 'driver_acknowledge_alert',
        args: { p_alert: string; p_status: 'acknowledged' | 'dismissed' },
      ): Promise<{ error: { message?: string } | null }>;
    };
    const { error } = await alertRpcClient.rpc('driver_acknowledge_alert', {
      p_alert: alert.id,
      p_status: 'acknowledged',
    });
    if (error) {
      console.warn('Alert acknowledgement failed:', error);
      toast.error('Impossible de marquer comme lu');
      return;
    }
    qc.invalidateQueries({ queryKey: ['driver-alerts', driverId] });
  };

  const openAlert = async (alert: DriverAlert) => {
    if (alert.status === 'open') await acknowledge(alert);
    navigate(alertDeepLink(alert));
  };

  return (
    <DriverLayout className="bg-background">
      <PageHeader title="Alertes" subtitle="Finance, conformité, véhicule et crédit" />

      <div className="px-4 py-4 space-y-6">
        {isLoading && (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        )}

        {!isLoading && alerts.length === 0 && (
          <EmptyState
            icon={<CheckCircle2 className="h-12 w-12 text-success" />}
            title="Tout est en ordre"
            description="Vous n'avez aucune alerte pour le moment."
          />
        )}

        {!isLoading && alerts.length > 0 && (
          <>
            <AlertSection
              title="Non lus"
              alerts={sections.unread}
              empty="Aucune alerte non lue."
              onOpen={openAlert}
              onAcknowledge={acknowledge}
            />
            <AlertSection
              title="Récents"
              alerts={sections.recent}
              empty="Aucune alerte récente déjà consultée."
              onOpen={openAlert}
              onAcknowledge={acknowledge}
            />
            <AlertSection
              title="Historique"
              alerts={sections.history}
              empty="Aucun historique d'alerte."
              onOpen={openAlert}
              onAcknowledge={acknowledge}
            />
          </>
        )}
      </div>
    </DriverLayout>
  );
}
