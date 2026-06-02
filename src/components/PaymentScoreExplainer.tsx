import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Info, CreditCard, TrendingUp, TrendingDown, CalendarClock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface PaymentRules {
  on_time_bonus: number;
  late_penalty: number;
  overdue_penalty: number;
  enabled: boolean;
}

const DEFAULT_RULES: PaymentRules = {
  on_time_bonus: 5,
  late_penalty: -10,
  overdue_penalty: -20,
  enabled: true,
};

type RuleKind = 'on_time' | 'late' | 'overdue' | 'other';

interface PaymentScoreRow {
  id: string;
  delta: number;
  reason: string;
  created_at: string;
  kind: RuleKind;
  delay_days: number | null;
  payment_type: string | null;
  due_date: string | null;
  paid_date: string | null;
  amount: number | null;
}

function classifyReason(reason: string): { kind: RuleKind; delayDays: number | null } {
  const lower = reason.toLowerCase();
  // "Paiement X en retard (N jours)"
  const lateMatch = reason.match(/\((\d+)\s*jours?\)/i);
  if (lower.includes('en retard')) {
    return { kind: 'late', delayDays: lateMatch ? Number(lateMatch[1]) : null };
  }
  if (lower.includes('en souffrance') || lower.includes('overdue')) {
    return { kind: 'overdue', delayDays: null };
  }
  if (lower.includes('à temps') || lower.includes('a temps') || lower.includes('on time')) {
    return { kind: 'on_time', delayDays: 0 };
  }
  return { kind: 'other', delayDays: null };
}

function ruleLabel(kind: RuleKind): string {
  switch (kind) {
    case 'on_time': return 'Paiement à temps';
    case 'late': return 'Paiement en retard';
    case 'overdue': return 'Paiement en souffrance';
    default: return 'Autre règle';
  }
}

function ruleDescription(kind: RuleKind, rules: PaymentRules): string {
  switch (kind) {
    case 'on_time':
      return `Règle: payer au plus tard à la date d'échéance → ${rules.on_time_bonus > 0 ? '+' : ''}${rules.on_time_bonus} pts`;
    case 'late':
      return `Règle: payé après la date d'échéance → ${rules.late_penalty} pts`;
    case 'overdue':
      return `Règle: paiement non réglé après l'échéance → ${rules.overdue_penalty} pts`;
    default:
      return 'Règle paiement personnalisée';
  }
}

/**
 * Detailed "Pourquoi mon score a changé" panel for payment-related events.
 * Lists each payment-rule trigger with the computed delay days and the exact
 * delta applied, helping drivers understand precisely why their score moved.
 */
export function PaymentScoreExplainer({ driverId }: { driverId: string | undefined }) {
  const { data: rules = DEFAULT_RULES } = useQuery({
    queryKey: ['payment-score-rules'],
    queryFn: async (): Promise<PaymentRules> => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('setting_value')
        .eq('setting_key', 'payment_score_rules')
        .maybeSingle();
      if (error || !data?.setting_value) return DEFAULT_RULES;
      const v = data.setting_value as any;
      return {
        on_time_bonus: Number(v.on_time_bonus ?? DEFAULT_RULES.on_time_bonus),
        late_penalty: Number(v.late_penalty ?? DEFAULT_RULES.late_penalty),
        overdue_penalty: Number(v.overdue_penalty ?? DEFAULT_RULES.overdue_penalty),
        enabled: v.enabled !== false,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['payment-score-events', driverId],
    enabled: !!driverId,
    queryFn: async (): Promise<PaymentScoreRow[]> => {
      const { data, error } = await supabase
        .from('driver_score_events')
        .select('id, delta, reason, created_at, accident_id')
        .eq('driver_id', driverId!)
        .is('accident_id', null)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;

      const paymentRows = (data || []).filter((row: any) => {
        const lower = String(row.reason || '').toLowerCase();
        return lower.startsWith('paiement') || lower.includes('payment');
      });

      // Best-effort enrichment: match each event to the closest payment for delay/amount metadata.
      const { data: payments } = await supabase
        .from('payments')
        .select('id, due_date, paid_date, paid_at, amount, payment_type, status, created_at')
        .eq('driver_id', driverId!)
        .order('created_at', { ascending: false })
        .limit(50);

      return paymentRows.map((row: any) => {
        const { kind, delayDays } = classifyReason(row.reason);
        // Find a payment whose paid_at / created_at is closest to the event timestamp.
        const eventTs = Date.parse(row.created_at);
        let match: any = null;
        let bestDiff = Infinity;
        for (const p of payments || []) {
          const refTs = Date.parse(p.paid_at || p.created_at);
          const diff = Math.abs(refTs - eventTs);
          if (diff < bestDiff && diff < 5 * 60 * 1000) {
            bestDiff = diff;
            match = p;
          }
        }
        let computedDelay = delayDays;
        if (computedDelay === null && match?.due_date && match?.paid_date) {
          const d = Math.round(
            (Date.parse(match.paid_date) - Date.parse(match.due_date)) / 86_400_000,
          );
          computedDelay = d > 0 ? d : 0;
        }
        return {
          id: row.id,
          delta: row.delta,
          reason: row.reason,
          created_at: row.created_at,
          kind,
          delay_days: computedDelay,
          payment_type: match?.payment_type ?? null,
          due_date: match?.due_date ?? null,
          paid_date: match?.paid_date ?? null,
          amount: match?.amount ?? null,
        };
      });
    },
  });

  if (!rules.enabled) return null;

  if (isLoading) {
    return (
      <div className="px-4 mb-6">
        <Skeleton className="h-4 w-56 mb-3" />
        <Card>
          <CardContent className="p-4 space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 mb-6">
      <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
        Pourquoi mon score a changé
      </h2>

      {/* Rules legend */}
      <Card className="mb-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            Règles appliquées aux paiements
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 grid grid-cols-3 gap-2">
          <RuleChip
            icon={CheckCircle2}
            tone="success"
            label="À temps"
            value={`${rules.on_time_bonus > 0 ? '+' : ''}${rules.on_time_bonus} pts`}
          />
          <RuleChip
            icon={CalendarClock}
            tone="warning"
            label="En retard"
            value={`${rules.late_penalty} pts`}
          />
          <RuleChip
            icon={AlertTriangle}
            tone="destructive"
            label="En souffrance"
            value={`${rules.overdue_penalty} pts`}
          />
        </CardContent>
      </Card>

      {/* Detailed event list */}
      {events.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <CreditCard className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Aucun ajustement lié à vos paiements pour le moment.
              Continuez à payer à temps pour gagner des points.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-3 space-y-2">
            {events.map((e) => {
              const isNegative = e.delta < 0;
              const Icon =
                e.kind === 'on_time' ? CheckCircle2
                : e.kind === 'overdue' ? AlertTriangle
                : e.kind === 'late' ? CalendarClock
                : isNegative ? TrendingDown : TrendingUp;
              return (
                <div
                  key={e.id}
                  className={cn(
                    'rounded-lg border p-3',
                    isNegative
                      ? 'border-destructive/30 bg-destructive/5'
                      : 'border-success/30 bg-success/5',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div
                        className={cn(
                          'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                          isNegative ? 'bg-destructive/15' : 'bg-success/15',
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-4 w-4',
                            isNegative ? 'text-destructive' : 'text-success',
                          )}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{ruleLabel(e.kind)}</span>
                          {e.payment_type && (
                            <Badge variant="outline" className="text-[10px] uppercase">
                              {e.payment_type === 'rental' ? 'Location'
                                : e.payment_type === 'loan' ? 'Prêt'
                                : e.payment_type}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {ruleDescription(e.kind, rules)}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'text-base font-bold tabular-nums flex-shrink-0',
                        isNegative ? 'text-destructive' : 'text-success',
                      )}
                    >
                      {e.delta > 0 ? '+' : ''}
                      {e.delta} pts
                    </span>
                  </div>

                  {/* Detail row */}
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs pl-12">
                    <DetailItem
                      label="Date de l'événement"
                      value={format(new Date(e.created_at), 'dd MMM yyyy, HH:mm', { locale: fr })}
                    />
                    {e.delay_days !== null && (
                      <DetailItem
                        label="Jours de retard"
                        value={e.delay_days === 0 ? 'Aucun' : `${e.delay_days} jour${e.delay_days > 1 ? 's' : ''}`}
                        emphasis={e.delay_days > 0}
                      />
                    )}
                    {e.due_date && (
                      <DetailItem
                        label="Échéance"
                        value={format(new Date(e.due_date), 'dd MMM yyyy', { locale: fr })}
                      />
                    )}
                    {e.paid_date && (
                      <DetailItem
                        label="Payé le"
                        value={format(new Date(e.paid_date), 'dd MMM yyyy', { locale: fr })}
                      />
                    )}
                    {e.amount !== null && (
                      <DetailItem
                        label="Montant"
                        value={`${e.amount.toLocaleString('fr-FR')} F`}
                      />
                    )}
                    <DetailItem
                      label="Delta appliqué"
                      value={`${e.delta > 0 ? '+' : ''}${e.delta} pts`}
                      emphasis
                    />
                  </dl>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RuleChip({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof Info;
  tone: 'success' | 'warning' | 'destructive';
  label: string;
  value: string;
}) {
  const toneClass =
    tone === 'success' ? 'border-success/30 bg-success/5 text-success'
    : tone === 'warning' ? 'border-warning/30 bg-warning/5 text-warning'
    : 'border-destructive/30 bg-destructive/5 text-destructive';
  return (
    <div className={cn('rounded-lg border p-2 flex flex-col items-center text-center', toneClass)}>
      <Icon className="h-4 w-4 mb-1" />
      <span className="text-[10px] uppercase tracking-wide font-medium opacity-80">{label}</span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}

function DetailItem({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'text-xs',
          emphasis ? 'font-semibold text-foreground' : 'text-muted-foreground',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
