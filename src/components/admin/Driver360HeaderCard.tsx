import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Banknote, TrendingUp, CheckCircle2, Gauge, Car, AlertTriangle, MessageSquare, ShieldCheck } from 'lucide-react';
import { useDriver360Summary } from '@/hooks/useAdminData';
import { formatCurrency } from '@/lib/format';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Driver360HeaderCardProps {
  driverId: string;
}

interface KpiProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

function Kpi({ icon, label, value, hint, tone = 'default' }: KpiProps) {
  const toneClass =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'danger'
          ? 'text-destructive'
          : 'text-primary';
  return (
    <Card className="border-border/60">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 ${toneClass}`}>{icon}</div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="text-base sm:text-lg font-semibold leading-tight truncate">{value}</div>
            {hint && <div className="text-xs text-muted-foreground mt-0.5 truncate">{hint}</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiSkeleton() {
  return (
    <Card className="border-border/60">
      <CardContent className="p-3 sm:p-4">
        <Skeleton className="h-4 w-20 mb-2" />
        <Skeleton className="h-6 w-24" />
      </CardContent>
    </Card>
  );
}

const KYC_LABEL: Record<string, { label: string; tone: KpiProps['tone'] }> = {
  verified: { label: 'Vérifié', tone: 'success' },
  pending: { label: 'En attente', tone: 'warning' },
  rejected: { label: 'Rejeté', tone: 'danger' },
  not_submitted: { label: 'Non soumis', tone: 'default' },
};

export function Driver360HeaderCard({ driverId }: Driver360HeaderCardProps) {
  const { data, isLoading, error } = useDriver360Summary(driverId);

  if (isLoading) {
    return (
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="mb-6 border-destructive/40">
        <CardContent className="p-4 text-sm text-destructive">
          Impossible de charger le résumé 360.
        </CardContent>
      </Card>
    );
  }

  const { totals, current_rental, accidents, tickets, kyc, credit_score } = data;
  const kycInfo = KYC_LABEL[kyc.status] ?? { label: kyc.status, tone: 'default' as const };

  return (
    <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
      {/* Row 1 */}
      <Kpi
        icon={<Banknote className="h-5 w-5" />}
        label="Total dû"
        value={formatCurrency(totals.total_owed_fcfa)}
        hint={`${totals.issued_count} facture(s) émise(s)`}
        tone={totals.total_owed_fcfa > 0 ? 'warning' : 'default'}
      />
      <Kpi
        icon={<CheckCircle2 className="h-5 w-5" />}
        label="Total payé"
        value={formatCurrency(totals.total_paid_fcfa)}
        hint={`${totals.paid_count} facture(s) payée(s)`}
        tone="success"
      />
      <Kpi
        icon={<TrendingUp className="h-5 w-5" />}
        label="Revenu généré"
        value={formatCurrency(totals.total_revenue_fcfa)}
        hint={`${totals.invoices_count} facture(s) au total`}
      />
      <Kpi
        icon={<Gauge className="h-5 w-5" />}
        label="Score actuel"
        value={credit_score?.current ?? '—'}
        hint={credit_score?.tier ? `Niveau ${credit_score.tier}` : 'Aucun score'}
      />

      {/* Row 2 */}
      <Kpi
        icon={<Car className="h-5 w-5" />}
        label="Location"
        value={current_rental ? 'En cours' : 'Aucune'}
        hint={
          current_rental
            ? `${current_rental.vehicle_plate ?? '—'} · ${formatCurrency(current_rental.daily_rate ?? 0)}/j`
            : 'Pas de location active'
        }
        tone={current_rental ? 'success' : 'default'}
      />
      <Kpi
        icon={<AlertTriangle className="h-5 w-5" />}
        label="Sinistres"
        value={
          <span>
            {accidents.open_count}
            <span className="text-muted-foreground text-sm font-normal"> / {accidents.total_count}</span>
          </span>
        }
        hint={
          accidents.last_at
            ? `Dernier ${formatDistanceToNow(new Date(accidents.last_at), { locale: fr, addSuffix: true })}`
            : 'Aucun sinistre'
        }
        tone={accidents.open_count > 0 ? 'danger' : 'default'}
      />
      <Kpi
        icon={<MessageSquare className="h-5 w-5" />}
        label="Tickets"
        value={
          <span>
            {tickets.open_count}
            <span className="text-muted-foreground text-sm font-normal"> / {tickets.total_count}</span>
          </span>
        }
        hint={
          tickets.last_at
            ? `MAJ ${formatDistanceToNow(new Date(tickets.last_at), { locale: fr, addSuffix: true })}`
            : 'Aucun ticket'
        }
        tone={tickets.open_count > 0 ? 'warning' : 'default'}
      />
      <Kpi
        icon={<ShieldCheck className="h-5 w-5" />}
        label="KYC"
        value={<Badge variant="outline">{kycInfo.label}</Badge>}
        hint={
          kyc.last_submitted_at
            ? `Soumis ${formatDistanceToNow(new Date(kyc.last_submitted_at), { locale: fr, addSuffix: true })}`
            : 'Jamais soumis'
        }
        tone={kycInfo.tone}
      />
    </div>
  );
}
