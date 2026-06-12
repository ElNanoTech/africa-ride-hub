import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  TrendingUp, TrendingDown, Minus, Car, BellRing, ShieldCheck, CarFront,
  Lightbulb, MessageSquare, CheckCircle2, ExternalLink,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/routeClient';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { RiskBadge } from '@/components/admin/RiskBadge';
import { SendDriverMessageDialog } from '@/components/admin/SendDriverMessageDialog';
import { useDriverRisk } from '@/hooks/useDriverRisk';
import { useDriver360Summary, useDriverActivityTimeline } from '@/hooks/useAdminData';
import { useFleetControlSettings } from '@/hooks/useFleetControlSettings';
import {
  OPEN_FLEET_CONTROL_STATUSES,
  DEFAULT_FLEET_CONTROL_SETTINGS,
  effectiveStatus,
  type FleetControlStatus,
} from '@/lib/fleetControl';
import { isPaymentOverdue, todayDateString } from '@/lib/payments';

interface DriverOverviewPanelProps {
  driverId: string;
  /** Profile-page action: open the AssignVehicleDialog. Falls back to a profile link. */
  onAssignVehicle?: () => void;
  /** Profile-page action: jump to the KYC review card. Falls back to a profile link. */
  onVerifyKyc?: () => void;
}

const KYC_BADGE: Record<string, { label: string; variant: 'verified' | 'pending' | 'rejected' | 'outline' }> = {
  verified: { label: 'KYC vérifié', variant: 'verified' },
  pending: { label: 'KYC en attente', variant: 'pending' },
  rejected: { label: 'KYC rejeté', variant: 'rejected' },
  not_submitted: { label: 'KYC non soumis', variant: 'outline' },
};

// Known credit_score_breakdowns.factor keys → simple French labels.
const FACTOR_LABEL: Record<string, string> = {
  weekly_income_avg: 'Revenu hebdo moyen',
  payment_streak: 'Régularité de paiement',
  trip_consistency: 'Constance des courses',
  driving_behavior: 'Comportement de conduite',
};

function TrendIcon({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  if (delta > 0) return <span className="inline-flex items-center text-emerald-600 text-xs"><TrendingUp className="h-3 w-3 mr-0.5" />+{delta}</span>;
  if (delta < 0) return <span className="inline-flex items-center text-destructive text-xs"><TrendingDown className="h-3 w-3 mr-0.5" />{delta}</span>;
  return <span className="inline-flex items-center text-muted-foreground text-xs"><Minus className="h-3 w-3 mr-0.5" />0</span>;
}

const NO_DATA = <p className="text-sm text-muted-foreground">Données non disponibles.</p>;

/**
 * CH-P1 — Real "Vue d'ensemble": computed risk + reasons, score by
 * dimension, current rental, KYC/payment chips, last 5 events and
 * rule-based recommendations with working actions. Honest empty states
 * everywhere ("Données non disponibles.") — nothing is faked.
 */
export function DriverOverviewPanel({ driverId, onAssignVehicle, onVerifyKyc }: DriverOverviewPanelProps) {
  const qc = useQueryClient();
  const risk = useDriverRisk(driverId);
  const summary = useDriver360Summary(driverId);
  const activity = useDriverActivityTimeline(driverId, 5);
  const { data: fcSettings = DEFAULT_FLEET_CONTROL_SETTINGS } = useFleetControlSettings();
  const [showMessage, setShowMessage] = useState(false);

  // Latest 2 weekly snapshots + factor breakdowns (dimension table + trend).
  const scoresQuery = useQuery({
    queryKey: ['driver-overview-scores', driverId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('credit_scores')
        .select('*, breakdowns:credit_score_breakdowns(*)')
        .eq('driver_id', driverId)
        .order('calculation_week', { ascending: false })
        .limit(2);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Overdue payments — same semantics as /admin/payments (status overdue OR
  // unpaid pending/partial past due_date).
  const paymentsQuery = useQuery({
    queryKey: ['driver-overview-payments', driverId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('id, status, due_date, amount, amount_paid')
        .eq('driver_id', driverId)
        .in('status', ['pending', 'partial', 'overdue']);
      if (error) throw error;
      return data ?? [];
    },
  });
  const todayStr = todayDateString();
  const overduePayments = (paymentsQuery.data ?? []).filter((p) => isPaymentOverdue(p, todayStr));
  const overdueAmount = overduePayments.reduce(
    (sum, p) => sum + Math.max(0, p.amount - (p.amount_paid ?? 0)), 0,
  );

  // Open fleet control of this driver (for the "relancer le contrôle" rule).
  const controlQuery = useQuery({
    queryKey: ['driver-overview-fleet-control', driverId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_inspections')
        .select('id, status, due_at, last_reminder_at')
        .eq('driver_id', driverId)
        .in('status', OPEN_FLEET_CONTROL_STATUSES as unknown as string[])
        .order('due_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const openControl = controlQuery.data;
  const controlLate = !!openControl &&
    ['overdue', 'blocked'].includes(effectiveStatus(openControl.status as FleetControlStatus, openControl.due_at));
  const remindCooldownActive = !!openControl?.last_reminder_at &&
    new Date(openControl.last_reminder_at).getTime() + fcSettings.relance_cooldown_hours * 3_600_000 > Date.now();

  const remind = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc('fleet_control_remind', { p_control: openControl!.id });
      if (error) throw error;
      return data as { sent: boolean; cooldown_until?: string };
    },
    onSuccess: (r) => {
      if (r?.sent) toast.success('Relance envoyée');
      else toast.info('Déjà relancé récemment', {
        description: r?.cooldown_until
          ? `Réessayez après ${format(new Date(r.cooldown_until), 'PPp', { locale: fr })}`
          : undefined,
      });
      qc.invalidateQueries({ queryKey: ['driver-overview-fleet-control', driverId] });
      qc.invalidateQueries({ queryKey: ['driver-fleet-controls', driverId] });
    },
    onError: (e: Error) => toast.error('Erreur', { description: e.message }),
  });

  const driver = summary.data?.driver;
  const kyc = summary.data?.kyc;
  const rental = summary.data?.current_rental;
  const kycInfo = kyc ? (KYC_BADGE[kyc.status] ?? { label: kyc.status, variant: 'outline' as const }) : null;

  // Score dimensions from the latest weekly snapshot (+ trend vs previous).
  const dimensions = useMemo(() => {
    const [latest, previous] = scoresQuery.data ?? [];
    if (!latest) return [];
    const dim = (
      label: string,
      available: boolean,
      points: number | null,
      prevPoints: number | null,
    ) => ({
      label,
      available,
      points: points ?? 0,
      delta: available && prevPoints !== null ? (points ?? 0) - prevPoints : null,
    });
    return [
      dim('Conduite', latest.driving_data_available, latest.driving_impact,
        previous?.driving_data_available ? previous.driving_impact ?? 0 : null),
      dim('Paiement', latest.payment_data_available, latest.payment_impact,
        previous?.payment_data_available ? previous.payment_impact ?? 0 : null),
      dim('Revenu', latest.income_data_available, latest.income_impact,
        previous?.income_data_available ? previous.income_impact ?? 0 : null),
    ];
  }, [scoresQuery.data]);
  const latestScore = scoresQuery.data?.[0];
  const breakdowns = (latestScore?.breakdowns ?? []) as Array<{
    id: string; factor: string; impact_points: number; data_available: boolean;
  }>;

  // Rule-based recommendations — each one maps to a working action.
  type Recommendation = { key: string; text: string; action: React.ReactNode };
  const recommendations: Recommendation[] = [];
  const profileLink = (label: string) => (
    <Button asChild size="sm" variant="outline">
      <Link to={`/admin/drivers/${driverId}`}>
        {label} <ExternalLink className="h-3 w-3 ml-1" />
      </Link>
    </Button>
  );
  if (overduePayments.length > 0) {
    recommendations.push({
      key: 'overdue',
      text: `${overduePayments.length} paiement(s) en retard (${formatCurrency(overdueAmount)} dus).`,
      action: (
        <Button size="sm" variant="outline" onClick={() => setShowMessage(true)}>
          <MessageSquare className="h-3.5 w-3.5 mr-1" /> Relancer le chauffeur
        </Button>
      ),
    });
  }
  if (controlLate && openControl) {
    recommendations.push({
      key: 'control',
      text: 'Le contrôle véhicule périodique est en retard.',
      action: (
        <Button
          size="sm"
          variant="outline"
          disabled={remind.isPending || remindCooldownActive}
          title={remindCooldownActive ? 'Relance déjà envoyée récemment' : undefined}
          onClick={() => remind.mutate()}
        >
          <BellRing className="h-3.5 w-3.5 mr-1" />
          {remindCooldownActive ? 'Relance possible plus tard' : 'Relancer le contrôle véhicule'}
        </Button>
      ),
    });
  }
  if (kyc && kyc.status !== 'verified') {
    recommendations.push({
      key: 'kyc',
      text: kyc.status === 'rejected' ? 'Le KYC a été rejeté — une nouvelle vérification est requise.' : 'Le KYC du chauffeur n\'est pas vérifié.',
      action: onVerifyKyc ? (
        <Button size="sm" variant="outline" onClick={onVerifyKyc}>
          <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Vérifier le KYC
        </Button>
      ) : profileLink('Vérifier le KYC'),
    });
  }
  if (summary.data && !rental) {
    recommendations.push({
      key: 'vehicle',
      text: 'Aucun véhicule assigné — le chauffeur ne génère pas de revenu.',
      action: onAssignVehicle ? (
        <Button size="sm" variant="outline" onClick={onAssignVehicle}>
          <CarFront className="h-3.5 w-3.5 mr-1" /> Assigner un véhicule
        </Button>
      ) : profileLink('Assigner un véhicule'),
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Risk + status chips */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Niveau de risque</CardTitle>
            <CardDescription>Calculé en direct (factures, sinistres, contraventions, KYC, contrôle, score)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {risk.isLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : risk.data ? (
              <>
                <RiskBadge level={risk.data.level} className="text-sm px-2.5 py-0.5" />
                <ul className="list-disc list-inside space-y-0.5 text-sm text-muted-foreground">
                  {risk.data.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </>
            ) : NO_DATA}
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {summary.isLoading ? (
                <Skeleton className="h-5 w-40" />
              ) : summary.data ? (
                <>
                  {kycInfo && <Badge variant={kycInfo.variant as never}>{kycInfo.label}</Badge>}
                  {paymentsQuery.isSuccess && (
                    overduePayments.length > 0 ? (
                      <Badge variant="rejected" className="gap-1">
                        {overduePayments.length} paiement(s) en retard
                      </Badge>
                    ) : (
                      <Badge variant="verified" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Paiements à jour
                      </Badge>
                    )
                  )}
                  {summary.data.totals.total_owed_fcfa > 0 && (
                    <Badge variant="pending">Dû : {formatCurrency(summary.data.totals.total_owed_fcfa)}</Badge>
                  )}
                </>
              ) : NO_DATA}
            </div>
          </CardContent>
        </Card>

        {/* Score by dimension */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Score par dimension</CardTitle>
            <CardDescription>
              {latestScore
                ? `Semaine du ${formatDateShort(latestScore.calculation_week)} · score ${latestScore.score}`
                : 'Dernier calcul hebdomadaire'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {scoresQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : dimensions.length === 0 ? (
              NO_DATA
            ) : (
              <div className="space-y-2">
                {dimensions.map((d) => (
                  <div key={d.label} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                    <span className="font-medium">{d.label}</span>
                    <span className="flex items-center gap-3">
                      {d.available ? (
                        <>
                          <span>{d.points} pts</span>
                          <TrendIcon delta={d.delta} />
                        </>
                      ) : (
                        <span className="text-muted-foreground text-xs">Données non disponibles</span>
                      )}
                    </span>
                  </div>
                ))}
                {breakdowns.length > 0 && (
                  <div className="pt-1 space-y-1">
                    {breakdowns.map((b) => (
                      <div key={b.id} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{FACTOR_LABEL[b.factor] ?? b.factor}</span>
                        <span>{b.data_available ? `${b.impact_points} pts` : '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Current vehicle / rental */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Car className="h-4 w-4 text-primary" /> Véhicule & location en cours
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : rental ? (
              <div className="space-y-1.5 text-sm">
                <p className="font-medium">
                  {rental.vehicle_model ?? 'Véhicule'} {rental.vehicle_plate ? `· ${rental.vehicle_plate}` : ''}
                </p>
                <p className="text-muted-foreground">
                  Loyer : <span className="font-medium text-foreground">{formatCurrency(rental.daily_rate ?? 0)}/j</span>
                  {' · '}Statut : <span className="font-medium text-foreground">{rental.status}</span>
                </p>
                {rental.started_at && (
                  <p className="text-muted-foreground">Depuis le {formatDateShort(rental.started_at)}</p>
                )}
                {rental.return_due_at && (
                  <p className="text-muted-foreground">Retour prévu le {formatDateShort(rental.return_due_at)}</p>
                )}
              </div>
            ) : summary.data ? (
              <p className="text-sm text-muted-foreground">Aucune location active.</p>
            ) : NO_DATA}
          </CardContent>
        </Card>

        {/* Last 5 activity events */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Activité récente</CardTitle>
            <CardDescription>5 derniers événements</CardDescription>
          </CardHeader>
          <CardContent>
            {activity.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : activity.error ? (
              NO_DATA
            ) : !activity.data || activity.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune activité.</p>
            ) : (
              <div className="space-y-2">
                {activity.data.map((row, idx) => (
                  <div key={`${row.source}-${row.reference_id ?? idx}-${row.occurred_at}`} className="border-l-2 border-border pl-3 py-1">
                    <p className="text-sm truncate" title={row.summary}>{row.summary}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {format(parseISO(row.occurred_at), 'dd MMM yyyy HH:mm', { locale: fr })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" /> Recommandations
          </CardTitle>
          <CardDescription>Actions suggérées selon l'état du dossier</CardDescription>
        </CardHeader>
        <CardContent>
          {summary.isLoading || paymentsQuery.isLoading || controlQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : recommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Rien à signaler — dossier en règle.
            </p>
          ) : (
            <ul className="space-y-2">
              {recommendations.map((r) => (
                <li key={r.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border rounded-lg p-3">
                  <span className="text-sm">{r.text}</span>
                  <span className="shrink-0">{r.action}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {driver && (
        <SendDriverMessageDialog
          open={showMessage}
          onOpenChange={setShowMessage}
          driverId={driverId}
          driverName={driver.full_name}
          customerId={driver.customer_id}
          defaultTitle="Rappel de paiement"
          defaultMessage={
            overduePayments.length > 0
              ? `Bonjour ${driver.full_name}, vous avez ${overduePayments.length} paiement(s) en retard pour un total de ${formatCurrency(overdueAmount)}. Merci de régulariser votre situation rapidement.`
              : ''
          }
        />
      )}
    </div>
  );
}
