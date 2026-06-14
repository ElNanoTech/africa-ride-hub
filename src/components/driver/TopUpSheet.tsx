import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/routeClient';
import { formatCurrency } from '@/lib/format';

const QUICK_AMOUNTS = [2000, 5000, 10000, 20000];
const MIN_TOPUP = 500;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Optional custom redirect path (without origin). Defaults to /driver/portefeuille */
  returnPath?: string;
}

export function TopUpSheet({ open, onOpenChange, returnPath = '/driver/portefeuille' }: Props) {
  const [amount, setAmount] = useState<number | ''>(5000);
  const [loading, setLoading] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  const handlePay = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < MIN_TOPUP) {
      toast.error(`Montant minimum : ${formatCurrency(MIN_TOPUP)}`);
      return;
    }
    setLoading(true);
    setFallbackUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke('wallet-topup-checkout', {
        body: {
          amount: value,
          successUrl: `${window.location.origin}${returnPath}${returnPath.includes('?') ? '&' : '?'}topup=success`,
          errorUrl: `${window.location.origin}${returnPath}${returnPath.includes('?') ? '&' : '?'}topup=error`,
        },
      });
      console.log('[TopUpSheet] wallet-topup-checkout response:', { data, error });
      if (error) throw new Error(data?.error || error.message);
      if (!data?.success || !data?.checkout_url) {
        throw new Error(data?.error || 'Erreur Wave');
      }
      const url: string = data.checkout_url;
      console.log('[TopUpSheet] Redirecting to Wave:', url);
      // Strategy 1: open in a new tab (works even when the page is in a
      // sandboxed iframe or a service worker swallows top-level navigations).
      const popup = window.open(url, '_blank', 'noopener,noreferrer');
      // Strategy 2: also try top-level navigation as a fallback.
      try {
        if (window.top && window.top !== window.self) {
          (window.top as Window).location.href = url;
        } else {
          window.location.assign(url);
        }
      } catch {
        window.location.href = url;
      }
      // Strategy 3: if after 1.5s we're still on the same page (popup blocked,
      // navigation refused), surface a manual link the driver can tap.
      setTimeout(() => {
        if (!popup || popup.closed) {
          setFallbackUrl(url);
          setLoading(false);
          toast.message('Appuyez sur « Continuer vers Wave » pour finaliser.');
        }
      }, 1500);
    } catch (e: any) {
      console.error('[TopUpSheet] checkout failed:', e);
      toast.error(e?.message || 'Impossible de démarrer la recharge.');
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Recharger via Wave
          </SheetTitle>
          <SheetDescription>
            Le montant est ajouté à votre crédit DAM et appliqué automatiquement à vos prochaines factures.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {QUICK_AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(a)}
                className={
                  'min-h-[56px] rounded-xl border text-base font-semibold transition-colors ' +
                  (amount === a
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card hover:bg-muted')
                }
              >
                {formatCurrency(a)}
              </button>
            ))}
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Autre montant (FCFA)</label>
            <Input
              type="number"
              inputMode="numeric"
              min={MIN_TOPUP}
              step={500}
              value={amount}
              onChange={(e) => {
                const v = e.target.value;
                setAmount(v === '' ? '' : Math.max(0, Math.floor(Number(v))));
              }}
              className="mt-1 h-12 text-lg"
              placeholder="5000"
            />
            <p className="mt-1 text-xs text-muted-foreground">Minimum {formatCurrency(MIN_TOPUP)}.</p>
          </div>

          <Button
            onClick={handlePay}
            disabled={loading || Number(amount) < MIN_TOPUP}
            className="w-full h-14 text-base"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Redirection…
              </>
            ) : (
              <>Payer {formatCurrency(Number(amount) || 0)} avec Wave</>
            )}
          </Button>

          {fallbackUrl && (
            <a
              href={fallbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center h-14 leading-[3.5rem] rounded-md bg-primary text-primary-foreground font-semibold"
            >
              Continuer vers Wave →
            </a>
          )}

          <p className="text-[11px] text-center text-muted-foreground">
            Vous serez redirigé vers Wave pour finaliser le paiement en toute sécurité.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
