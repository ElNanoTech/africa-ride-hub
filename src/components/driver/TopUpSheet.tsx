import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/routeClient';
import { formatCurrency } from '@/lib/format';

const QUICK_AMOUNTS = [5000, 10000, 20000, 50000];
const MIN_TOPUP = 500;
const FALLBACK_TOPUP_ERROR = 'Impossible de démarrer la recharge.';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

type TopupCheckoutResponse = {
  success?: boolean;
  checkout_url?: string;
  payment_id?: string;
  session_id?: string;
  error?: string;
  message?: string;
  code?: string;
};

function cleanMessage(message?: string | null) {
  const trimmed = message?.trim();
  return trimmed || null;
}

function coerceTopupResponse(value: unknown): TopupCheckoutResponse | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as TopupCheckoutResponse;
  return {
    success: typeof body.success === 'boolean' ? body.success : undefined,
    checkout_url: typeof body.checkout_url === 'string' ? body.checkout_url : undefined,
    payment_id: typeof body.payment_id === 'string' ? body.payment_id : undefined,
    session_id: typeof body.session_id === 'string' ? body.session_id : undefined,
    error: typeof body.error === 'string' ? body.error : undefined,
    message: typeof body.message === 'string' ? body.message : undefined,
    code: typeof body.code === 'string' ? body.code : undefined,
  };
}

function parseTopupResponseText(text: string): TopupCheckoutResponse | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return coerceTopupResponse(JSON.parse(trimmed));
  } catch {
    return { error: trimmed };
  }
}

async function createTopupCheckout(body: { amount: number; successUrl: string; errorUrl: string }) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Configuration Supabase manquante.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(sessionError.message || 'Session expirée. Veuillez vous reconnecter.');
  }

  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error('Session expirée. Veuillez vous reconnecter.');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/wallet-topup-checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = parseTopupResponseText(await response.text());
  if (!response.ok) {
    throw new Error(
      cleanMessage(payload?.error) ||
        cleanMessage(payload?.message) ||
        `Recharge refusée par le serveur (${response.status}).`
    );
  }

  if (!payload) {
    throw new Error('Réponse de recharge illisible.');
  }

  return payload;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Optional custom redirect path (without origin). Defaults to /driver/portefeuille */
  returnPath?: string;
}

export function TopUpSheet({ open, onOpenChange, returnPath = '/driver/portefeuille' }: Props) {
  const [amount, setAmount] = useState<number | ''>(5000);
  const [loading, setLoading] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const handlePay = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < MIN_TOPUP) {
      toast.error(`Montant minimum : ${formatCurrency(MIN_TOPUP)}`);
      return;
    }
    setLoading(true);
    setCheckoutUrl(null);
    try {
      const data = await createTopupCheckout({
        amount: value,
        successUrl: `${window.location.origin}${returnPath}${returnPath.includes('?') ? '&' : '?'}topup=success`,
        errorUrl: `${window.location.origin}${returnPath}${returnPath.includes('?') ? '&' : '?'}topup=error`,
      });
      console.log('[TopUpSheet] wallet-topup-checkout response:', JSON.stringify(data));
      if (!data?.success || !data?.checkout_url) {
        throw new Error(cleanMessage(data?.error) || 'Erreur Wave');
      }
      setCheckoutUrl(data.checkout_url);
      window.open(data.checkout_url, '_blank', 'noopener,noreferrer');
      setLoading(false);
    } catch (e: unknown) {
      const message = cleanMessage(e instanceof Error ? e.message : null) || FALLBACK_TOPUP_ERROR;
      console.error('Wallet top-up checkout error:', e);
      toast.error('Recharge impossible', { description: message });
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

          {checkoutUrl && (
            <Button
              type="button"
              variant="secondary"
              className="w-full h-12 bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => window.open(checkoutUrl, '_blank', 'noopener,noreferrer')}
            >
              Continuer vers Wave →
            </Button>
          )}

          <p className="text-[11px] text-center text-muted-foreground">
            Vous serez redirigé vers Wave pour finaliser le paiement en toute sécurité.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
