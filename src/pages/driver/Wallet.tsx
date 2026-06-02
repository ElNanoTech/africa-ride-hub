import { useEffect, useState } from 'react';
import { DriverLayout } from '@/components/DriverLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { useDriverId } from '@/hooks/useDriverData';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { Wallet, ArrowDownCircle, ArrowUpCircle, FileText, PlusCircle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { LoadingState } from '@/components/LoadingState';
import { TopUpSheet } from '@/components/driver/TopUpSheet';
import { toast } from 'sonner';
import { useFinancialRealtime } from '@/hooks/useFinancialRealtime';
import { formatCurrency as fmt } from '@/lib/format';

interface TxnLabel {
  title: string;
  source: string;
}

function describeTxn(t: {
  type: string;
  direction?: string | null;
  amount: number;
  note: string | null;
  method?: string | null;
}): TxnLabel {
  const isCredit = (t.direction ?? (t.amount > 0 ? 'credit' : 'debit')) === 'credit';
  const methodFr =
    t.method === 'wave'
      ? 'Wave'
      : t.method === 'orange_money'
      ? 'Orange Money'
      : t.method === 'mtn_money'
      ? 'MTN Money'
      : t.method === 'moov_money'
      ? 'Moov Money'
      : t.method === 'cash'
      ? 'Espèces'
      : null;

  switch (t.type) {
    case 'upfront_deposit':
    case 'prepayment':
      return {
        title: 'Recharge confirmée',
        source: methodFr ?? 'Recharge',
      };
    case 'overpayment_credit':
      return {
        title: 'Trop-perçu converti en crédit DAM',
        source: 'Surplus paiement',
      };
    case 'rental_invoice_applied':
    case 'invoice_auto_apply':
      return {
        title: 'Facture réglée automatiquement par crédit DAM',
        source: 'Application automatique',
      };
    case 'cancellation_refund':
    case 'refund':
    case 'refund_or_credit':
      return {
        title: isCredit
          ? 'Crédit restauré suite à annulation'
          : 'Remboursement',
        source: 'Annulation facture',
      };
    case 'manual_adjustment':
    case 'correction':
      return {
        title: isCredit ? 'Ajustement crédité' : 'Ajustement débité',
        source: 'Gestionnaire DAM',
      };
    default:
      return { title: t.note || t.type, source: methodFr ?? '' };
  }
}


export default function DriverWallet() {
  const { data: driverId } = useDriverId();
  const queryClient = useQueryClient();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const { data, isLoading } = useQuery({
    queryKey: ['driver-wallet-self', driverId],
    enabled: !!driverId,
    // Always refetch when the driver lands on the wallet — never serve a stale
    // balance/history snapshot from cache.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [walletRes, txnsRes] = await Promise.all([
        supabase.from('driver_wallets').select('*').eq('driver_id', driverId!).maybeSingle(),
        supabase.from('driver_wallet_transactions')
          .select('id, type, direction, amount, balance_after, created_at, note, invoice_id, payment_id')
          .eq('driver_id', driverId!)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      if (walletRes.error) throw walletRes.error;
      if (txnsRes.error) throw txnsRes.error;
      return { wallet: walletRes.data, transactions: txnsRes.data ?? [] };
    },
  });

  // Handle return from Wave checkout
  useEffect(() => {
    const status = searchParams.get('topup');
    if (!status) return;
    if (status === 'success') {
      toast.success('Paiement reçu. Mise à jour du solde…');
      const refetch = () => queryClient.invalidateQueries({ queryKey: ['driver-wallet-self'] });
      refetch();
      const t1 = setTimeout(refetch, 3000);
      const t2 = setTimeout(refetch, 8000);
      const t3 = setTimeout(refetch, 20000);
      searchParams.delete('topup');
      setSearchParams(searchParams, { replace: true });
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
    if (status === 'error') {
      toast.error('La recharge a été annulée ou a échoué.');
      searchParams.delete('topup');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, queryClient]);

  // Realtime: any wallet / invoice / receipt change for this driver invalidates
  // the wallet query immediately. Also surface a toast for auto-applied debits.
  useFinancialRealtime({
    scope: 'driver',
    driverId: driverId ?? null,
    onWalletTxnInsert: (row) => {
      const r = row as { type?: string; direction?: string; amount?: number; metadata?: Record<string, unknown> };
      if (r.direction === 'debit' && r.type === 'rental_invoice_applied') {
        const invNum = (r.metadata?.invoice_number as string) || '';
        toast.success(
          invNum
            ? `Crédit appliqué automatiquement à la facture ${invNum} (${fmt(r.amount ?? 0)}).`
            : `Crédit appliqué automatiquement (${fmt(r.amount ?? 0)}).`,
        );
      } else if (r.direction === 'credit' && (r.amount ?? 0) > 0) {
        toast.success(`Crédit reçu: +${fmt(r.amount ?? 0)}.`);
      }
    },
  });

  const balance = data?.wallet?.balance ?? 0;
  const txns = data?.transactions ?? [];

  return (
    <DriverLayout>
      <div className="space-y-4 pb-24">
        {/* Hero balance card */}
        <Card className="border-0 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-sm opacity-90">
              <Wallet className="h-4 w-4" />
              Mon portefeuille DAM
            </div>
            <p className="mt-2 text-4xl font-bold">{formatCurrency(balance)}</p>
            <p className="mt-1 text-sm opacity-80">Crédit disponible</p>

            <Button
              onClick={() => setTopUpOpen(true)}
              size="lg"
              variant="secondary"
              className="mt-4 w-full h-12 bg-white text-primary hover:bg-white/90 font-semibold"
            >
              <PlusCircle className="h-5 w-5 mr-2" />
              Recharger mon portefeuille
            </Button>

            {balance === 0 && (
              <p className="mt-2 text-xs opacity-90 text-center">
                Aucun crédit. Appuyez sur Recharger pour prépayer.
              </p>
            )}
          </CardContent>
        </Card>

        <TopUpSheet open={topUpOpen} onOpenChange={setTopUpOpen} />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historique financier</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <LoadingState />
            ) : txns.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Aucune opération pour le moment.
              </p>
            ) : (
              <ul className="divide-y">
                {txns.map((t: any) => {
                  const isCredit = (t.direction ?? (t.amount > 0 ? 'credit' : 'debit')) === 'credit';
                  const Icon = isCredit ? ArrowDownCircle : ArrowUpCircle;
                  const { title, source } = describeTxn(t);
                  return (
                    <li key={t.id} className="py-3 flex items-start gap-3">
                      <Icon className={isCredit ? 'h-5 w-5 text-success mt-0.5' : 'h-5 w-5 text-destructive mt-0.5'} />
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm font-semibold leading-snug">{title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateShort(new Date(t.created_at))}
                          {source ? ` · ${source}` : ''}
                        </p>
                        {t.note && !['Crédit portefeuille DAM appliqué automatiquement'].includes(t.note) && (
                          <p className="text-xs text-muted-foreground italic">{t.note}</p>
                        )}
                        {t.invoice_id && (
                          <Link
                            to={`/driver/factures/${t.invoice_id}`}
                            className="inline-flex items-center gap-1 mt-1 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/15 rounded-full px-2 py-0.5 transition-colors"
                          >
                            <FileText className="h-3 w-3" /> Voir la facture
                          </Link>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={isCredit ? 'text-sm font-bold text-success' : 'text-sm font-bold text-destructive'}>
                          {isCredit ? '+' : '−'}{formatCurrency(Math.abs(t.amount))}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Solde après : <span className="font-mono">{formatCurrency(t.balance_after ?? 0)}</span>
                        </p>
                        <Badge variant="secondary" className="mt-1 text-[9px] px-1.5 py-0">
                          Confirmé
                        </Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>


        <p className="text-xs text-muted-foreground px-2">
          Ce crédit est appliqué automatiquement à vos prochaines factures.
        </p>

        {/* Subtle badge to surface late status if any txn references a debit related to overdue */}
        <div className="px-2">
          <Badge variant="secondary" className="text-[10px]">Mis à jour en temps réel</Badge>
        </div>
      </div>
    </DriverLayout>
  );
}
