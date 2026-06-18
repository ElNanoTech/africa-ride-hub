import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowRight,
  ArrowUpCircle,
  CalendarClock,
  CreditCard,
  FileText,
  PiggyBank,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { DriverLayout, PageHeader } from '@/components/DriverLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { KiraVoiceButton } from '@/components/driver/KiraVoiceButton';
import { useDriverId, useDriverLoans, useDriverPayments } from '@/hooks/useDriverData';
import { useDriverFullProfile } from '@/hooks/useDriverProfile';
import { useDriverCreditScores, useDriverCurrentScore } from '@/hooks/useDriverData';
import { useDriverInvoices } from '@/hooks/useBilling';
import { useFinancialRealtime } from '@/hooks/useFinancialRealtime';
import { useDriverCollectionsStatus } from '@/hooks/useCreditCollectionsData';
import { useDriverDefaultStatus } from '@/hooks/useCreditDefaultsData';
import { supabase } from '@/integrations/supabase/routeClient';
import { getInvoiceRemainingDue, getPaymentRemaining } from '@/lib/financeAmounts';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Invoice } from '@/types/billing';

type FinanceInvoice = Pick<
  Invoice,
  'id' | 'invoice_number' | 'total_ttc' | 'amount_paid' | 'remaining_due' | 'issued_at' | 'created_at'
> & {
  status: string;
};

type OpenFinanceInvoice = FinanceInvoice & { due: number };

type DriverPaymentSummary = {
  status: string | null;
};

type DriverLoanSummary = {
  status: string | null;
};

type WalletTransactionSummary = {
  id: string;
  type: string | null;
  direction: string | null;
  amount: number | null;
  created_at: string;
  note: string | null;
};

type NextPaymentSummary = {
  id: string;
  amount: number | null;
  amount_paid?: number | null;
  status: string | null;
  due_date: string | null;
};

function FriendlyError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardContent className="p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-sm">Connexion instable.</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Reessayez dans quelques instants.
          </p>
          <Button variant="outline" size="sm" className="mt-3 min-h-11" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" />
            Reessayer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FinanceSkeleton() {
  return (
    <DriverLayout>
      <PageHeader title="Finance" subtitle="Argent, factures et credits" />
      <div className="px-4 space-y-4">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
    </DriverLayout>
  );
}

function getTransactionLabel(txn?: WalletTransactionSummary | null) {
  if (!txn) return 'Aucune operation recente';
  const isCredit = (txn.direction ?? (Number(txn.amount ?? 0) >= 0 ? 'credit' : 'debit')) === 'credit';
  if (txn.note) return txn.note;
  if (txn.type === 'overpayment_credit') return 'Trop-percu converti en credit';
  if (txn.type === 'invoice_cancellation_refund' || txn.type === 'cancellation_refund' || txn.type === 'refund' || txn.type === 'refund_or_credit') return 'Facture annulee - montant recredite';
  if (txn.type === 'rental_invoice_applied' || txn.type === 'invoice_auto_apply') return 'Facture reglee automatiquement';
  if (txn.type === 'upfront_deposit' || txn.type === 'prepayment') return 'Recharge Wave confirmee';
  return isCredit ? 'Credit ajoute' : 'Debit portefeuille';
}

export default function DriverFinance() {
  const { data: driverId } = useDriverId();
  const { data: driver } = useDriverFullProfile();
  const { data: payments = [], isLoading: paymentsLoading } = useDriverPayments();
  const { data: loans = [], isLoading: loansLoading } = useDriverLoans();
  const { data: creditScores = [] } = useDriverCreditScores();
  const { data: currentScore } = useDriverCurrentScore();
  const { data: invoices = [], isLoading: invoicesLoading, refetch: refetchInvoices } = useDriverInvoices(driver?.id);
  const { data: collectionsStatuses = [] } = useDriverCollectionsStatus(!!driverId);
  const { data: defaultStatuses = [] } = useDriverDefaultStatus(!!driverId);

  const walletQuery = useQuery({
    queryKey: ['driver-finance-wallet', driverId],
    enabled: !!driverId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [walletRes, txnsRes] = await Promise.all([
        supabase.from('driver_wallets').select('*').eq('driver_id', driverId!).maybeSingle(),
        supabase
          .from('driver_wallet_transactions')
          .select('id, type, direction, amount, balance_after, created_at, note, invoice_id')
          .eq('driver_id', driverId!)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);
      if (walletRes.error) throw walletRes.error;
      if (txnsRes.error) throw txnsRes.error;
      return { wallet: walletRes.data, transactions: txnsRes.data ?? [] };
    },
  });

  useFinancialRealtime({ scope: 'driver', driverId: driverId ?? null });

  const walletBalance = Number(walletQuery.data?.wallet?.balance ?? 0);
  const transactions = (walletQuery.data?.transactions ?? []) as WalletTransactionSummary[];
  const latestTransaction = transactions[0] ?? null;

  const openInvoices = useMemo(() => {
    return (invoices as FinanceInvoice[])
      .filter((invoice) => ['issued', 'partial', 'overdue'].includes(invoice.status))
      .map((invoice): OpenFinanceInvoice => ({ ...invoice, due: getInvoiceRemainingDue(invoice) }))
      .filter((invoice) => invoice.due > 0)
      .sort((a, b) => new Date(a.issued_at || a.created_at).getTime() - new Date(b.issued_at || b.created_at).getTime());
  }, [invoices]);

  const totalDue = openInvoices.reduce((sum, invoice) => sum + invoice.due, 0);
  const reservedCredit = Math.min(walletBalance, totalDue);
  const availableBalance = Math.max(0, walletBalance - reservedCredit);
  const nextInvoice = openInvoices[0] ?? null;
  const collectionsStatus = collectionsStatuses[0] ?? null;
  const defaultStatus = defaultStatuses[0] ?? null;
  const overduePayments = (payments as DriverPaymentSummary[]).filter((payment) => payment.status === 'overdue');
  const activeLoans = (loans as DriverLoanSummary[]).filter((loan) => ['active', 'approved', 'pending'].includes(loan.status ?? ''));
  const nextPayment = (payments as NextPaymentSummary[])
    .filter((payment) => ['pending', 'partial', 'overdue', 'late'].includes(payment.status ?? '') && getPaymentRemaining(payment) > 0)
    .sort((a, b) => new Date(a.due_date || 0).getTime() - new Date(b.due_date || 0).getTime())[0] ?? null;
  const score = Number(currentScore ?? creditScores[0]?.score ?? 0);
  const ownershipTarget = 850;
  const scoreMissing = Math.max(0, ownershipTarget - score);
  const scoreProgress = Math.min(100, Math.round((score / ownershipTarget) * 100));
  const weeksHistory = creditScores.length;
  const weeksRequired = 26;
  const tenureMissing = Math.max(0, weeksRequired - weeksHistory);
  const ownershipEligible = score >= ownershipTarget && weeksHistory >= weeksRequired;

  const isLoading = walletQuery.isLoading || invoicesLoading || paymentsLoading || loansLoading;
  const hasError = walletQuery.isError;

  const voiceSummary = totalDue > 0
    ? `Votre solde KiraPay est de ${formatCurrency(walletBalance)} dont ${formatCurrency(availableBalance)} disponible. Il reste ${formatCurrency(totalDue)} a regler. Le prochain paiement est ${nextInvoice?.invoice_number ? `la facture ${nextInvoice.invoice_number}` : 'une facture ouverte'}.`
    : `Votre solde KiraPay est de ${formatCurrency(walletBalance)} dont ${formatCurrency(availableBalance)} disponible. Aucune facture en attente. Votre progression vers la propriete est de ${score} points sur ${ownershipTarget}.`;

  if (isLoading) return <FinanceSkeleton />;

  return (
    <DriverLayout>
      <PageHeader
        title="Finance"
        subtitle="Votre argent, simplement"
        action={<KiraVoiceButton text={voiceSummary} compact />}
      />

      <div className="px-4 pb-8 space-y-4">
        {hasError && <FriendlyError onRetry={() => walletQuery.refetch()} />}

        <section className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Mon argent</p>
          <Card className="border-0 bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 text-white shadow-lg">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-white/80">Solde KiraPay</p>
                <p className="mt-1 text-4xl font-bold">{formatCurrency(walletBalance)}</p>
                <p className="mt-1 text-sm text-white/80">
                  {reservedCredit > 0
                    ? `${formatCurrency(availableBalance)} disponible apres factures`
                    : 'Disponible maintenant'}
                </p>
                <p className="mt-3 text-xs text-white/75">
                  Derniere operation : {getTransactionLabel(latestTransaction)}
                </p>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-white/15 flex items-center justify-center">
                <Wallet className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-white/15 p-3">
                <p className="text-white/70">Factures ouvertes</p>
                <p className="mt-1 font-bold">{formatCurrency(totalDue)}</p>
              </div>
              <div className="rounded-xl bg-white/15 p-3">
                <p className="text-white/70">Credit reserve</p>
                <p className="mt-1 font-bold">{formatCurrency(reservedCredit)}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button asChild variant="secondary" className="min-h-12 bg-white text-emerald-700 hover:bg-white/90">
                <Link to="/driver/portefeuille">
                  Recharger
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="min-h-12 border-white/40 bg-white/10 text-white hover:bg-white/20">
                <Link to="/driver/portefeuille">
                  Historique
                  <FileText className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        </section>

        <Card className={cn(totalDue > 0 ? 'border-warning/50 bg-warning/5' : 'border-emerald-500/30 bg-emerald-500/5')}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className={cn(
                'h-11 w-11 rounded-xl flex items-center justify-center shrink-0',
                totalDue > 0 ? 'bg-warning/15 text-warning' : 'bg-emerald-500/15 text-emerald-600',
              )}>
                {totalDue > 0 ? <CreditCard className="h-5 w-5" /> : <PiggyBank className="h-5 w-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">
                  {totalDue > 0 ? 'Paiement a effectuer' : 'Aucun paiement en attente'}
                </p>
                <p className="text-2xl font-bold">{formatCurrency(totalDue)}</p>
                {nextInvoice ? (
                  <p className="text-sm text-muted-foreground">
                    {nextPayment?.due_date
                      ? `Echeance : ${formatDateShort(nextPayment.due_date)}.`
                      : `Facture : ${nextInvoice.invoice_number || 'Facture'}.`}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Aucune facture en attente. Rien a payer pour le moment.
                  </p>
                )}
              </div>
              {overduePayments.length > 0 && (
                <Badge variant="destructive" className="shrink-0">
                  Retard
                </Badge>
              )}
            </div>
            {nextInvoice && (
              <Button asChild className="mt-4 min-h-12 w-full">
                <Link to={`/driver/factures/${nextInvoice.id}`}>
                  Payer maintenant
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>

        {collectionsStatus && (
          <Card className={cn(collectionsStatus.status_tone === 'danger' ? 'border-destructive/50 bg-destructive/5' : 'border-warning/50 bg-warning/5')}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">Paiement crédit</p>
                    <Badge variant={collectionsStatus.status_tone === 'danger' ? 'destructive' : 'secondary'}>
                      {collectionsStatus.status_label}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{collectionsStatus.driver_message}</p>
                  <p className="mt-1 text-sm font-semibold">{formatCurrency(collectionsStatus.late_amount)} à régulariser</p>
                </div>
              </div>
              <Button asChild className="mt-4 min-h-12 w-full">
                <Link to={collectionsStatus.invoice_id ? `/driver/factures/${collectionsStatus.invoice_id}` : '/driver/credit'}>
                  {collectionsStatus.payment_action_label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {defaultStatus && (
          <Card className={cn(defaultStatus.status_tone === 'danger' ? 'border-destructive/50 bg-destructive/5' : 'border-warning/50 bg-warning/5')}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">Suivi crédit DAM</p>
                    <Badge variant={defaultStatus.status_tone === 'danger' ? 'destructive' : 'secondary'}>
                      {defaultStatus.status_label}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{defaultStatus.driver_message}</p>
                  <p className="mt-1 text-sm font-semibold">{formatCurrency(defaultStatus.amount_affected)} concerné</p>
                  {defaultStatus.deadline_at && (
                    <p className="mt-1 text-xs text-muted-foreground">Échéance : {formatDateShort(defaultStatus.deadline_at)}</p>
                  )}
                </div>
              </div>
              <Button asChild className="mt-4 min-h-12 w-full">
                <Link to="/driver/credit">
                  {defaultStatus.primary_action_label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4">
              <CalendarClock className="h-5 w-5 text-primary mb-2" />
              <p className="text-xs text-muted-foreground">Prochaine echeance</p>
              <p className="font-bold">
                {nextPayment ? formatCurrency(getPaymentRemaining(nextPayment)) : 'Aucune'}
              </p>
              {nextPayment?.due_date && (
                <p className="text-[11px] text-muted-foreground">{formatDateShort(nextPayment.due_date)}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <TrendingUp className="h-5 w-5 text-primary mb-2" />
              <p className="text-xs text-muted-foreground">Financement</p>
              <p className="font-bold">{activeLoans.length > 0 ? `${activeLoans.length} actif` : 'Aucun actif'}</p>
              <p className="text-[11px] text-muted-foreground">{ownershipEligible ? 'Eligible propriete' : `${scoreMissing} pts restants`}</p>
            </CardContent>
          </Card>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Factures ouvertes
            </h2>
            <Button variant="ghost" size="sm" onClick={() => refetchInvoices()} className="min-h-11">
              <RefreshCw className="h-4 w-4" />
              Actualiser
            </Button>
          </div>
          {openInvoices.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="font-semibold">Aucune facture en attente.</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Vos factures payees restent disponibles dans l'historique.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {openInvoices.slice(0, 3).map((invoice) => (
                <Link key={invoice.id} to={`/driver/factures/${invoice.id}`}>
                  <Card interactive>
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{invoice.invoice_number || 'Facture'}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateShort(invoice.issued_at || invoice.created_at)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold">{formatCurrency(invoice.due)}</p>
                        <Badge variant={invoice.status === 'overdue' ? 'destructive' : 'secondary'} className="text-[10px]">
                          {invoice.status === 'overdue' ? 'En retard' : invoice.status === 'partial' ? 'Partiel' : 'A payer'}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        <Card className="overflow-hidden border-primary/25 bg-gradient-to-br from-primary/5 via-card to-amber-500/10">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Devenir proprietaire</p>
                <h2 className="text-lg font-bold">Progression vers la propriete</h2>
              </div>
              <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Target className="h-5 w-5" />
              </div>
            </div>

            <div>
              <div className="flex items-end justify-between">
                <p className="text-3xl font-bold">{score} / {ownershipTarget}</p>
                <Badge variant={ownershipEligible ? 'verified' : 'secondary'}>
                  {ownershipEligible ? 'Eligible' : `${scoreMissing} pts restants`}
                </Badge>
              </div>
              <div className="mt-3 h-3 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${scoreProgress}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-background/70 border p-3">
                <p className="text-xs text-muted-foreground">Score</p>
                <p className="font-semibold">Requis : {ownershipTarget}</p>
                <p className="text-xs text-muted-foreground">Manque : {scoreMissing} pts</p>
              </div>
              <div className="rounded-lg bg-background/70 border p-3">
                <p className="text-xs text-muted-foreground">Anciennete</p>
                <p className="font-semibold">{weeksHistory} / {weeksRequired} semaines</p>
                <p className="text-xs text-muted-foreground">Manque : {tenureMissing} sem.</p>
              </div>
            </div>

            <div className="rounded-xl bg-background/70 border p-3 text-sm">
              <p className="font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                A faire pour avancer
              </p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                <li>Payer a temps.</li>
                <li>Completer les controles vehicule.</li>
                <li>Eviter les sinistres et amendes.</li>
              </ul>
            </div>

            <Button asChild variant="outline" className="min-h-11 w-full">
              <Link to="/driver/credit">
                Voir les offres et conditions
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Derniers mouvements
            </h2>
            <Link to="/driver/portefeuille" className="text-xs font-semibold text-primary">
              Voir tout
            </Link>
          </div>
          {transactions.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <Wallet className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="font-semibold">Aucune operation pour le moment.</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Les recharges et paiements apparaitront ici.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y">
                {(transactions as WalletTransactionSummary[]).map((txn) => {
                  const isCredit = (txn.direction ?? (Number(txn.amount ?? 0) > 0 ? 'credit' : 'debit')) === 'credit';
                  const Icon = isCredit ? ArrowDownCircle : ArrowUpCircle;
                  return (
                    <div key={txn.id} className="p-4 flex items-center gap-3">
                      <Icon className={cn('h-5 w-5 shrink-0', isCredit ? 'text-emerald-600' : 'text-destructive')} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{getTransactionLabel(txn)}</p>
                        <p className="text-xs text-muted-foreground">{formatDateShort(txn.created_at)}</p>
                      </div>
                      <p className={cn('font-bold shrink-0', isCredit ? 'text-emerald-600' : 'text-destructive')}>
                        {isCredit ? '+' : '-'}{formatCurrency(Math.abs(Number(txn.amount ?? 0)))}
                      </p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </section>

        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">Financement KIRA</p>
              <p className="text-sm text-muted-foreground">
                {activeLoans.length > 0
                  ? `${activeLoans.length} dossier en cours ou actif.`
                  : 'Aucune offre disponible actuellement.'}
              </p>
            </div>
            <Button asChild variant="outline" className="min-h-11 shrink-0">
              <Link to="/driver/credit">
                Voir
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </DriverLayout>
  );
}
