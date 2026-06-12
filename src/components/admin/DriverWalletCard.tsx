import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Wallet, Plus, ArrowDownCircle, ArrowUpCircle, RotateCcw, FileText, Download } from 'lucide-react';
import { useDriverWallet, useRecordDriverDeposit } from '@/hooks/useAdminData';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { exportToCSV } from '@/lib/export';
import { supabase } from '@/integrations/supabase/routeClient';
import { toast } from 'sonner';

interface Props {
  driverId: string;
}

const TYPE_LABEL: Record<string, { label: string; icon: typeof ArrowDownCircle; color: string }> = {
  upfront_deposit: { label: 'Recharge / Dépôt', icon: ArrowDownCircle, color: 'text-success' },
  prepayment: { label: 'Recharge confirmée', icon: ArrowDownCircle, color: 'text-success' },
  overpayment_credit: { label: 'Trop-perçu converti en crédit DAM', icon: ArrowDownCircle, color: 'text-success' },
  rental_invoice_applied: { label: 'Facture réglée automatiquement par crédit DAM', icon: ArrowUpCircle, color: 'text-primary' },
  invoice_auto_apply: { label: 'Facture réglée automatiquement par crédit DAM', icon: ArrowUpCircle, color: 'text-primary' },
  cancellation_refund: { label: 'Crédit restauré suite à annulation', icon: ArrowDownCircle, color: 'text-success' },
  refund: { label: 'Remboursement', icon: ArrowDownCircle, color: 'text-success' },
  refund_or_credit: { label: 'Crédit / Remboursement', icon: ArrowDownCircle, color: 'text-success' },
  manual_adjustment: { label: 'Ajustement manuel', icon: RotateCcw, color: 'text-warning' },
  correction: { label: 'Correction', icon: RotateCcw, color: 'text-warning' },
};

export function DriverWalletCard({ driverId }: Props) {
  const { data, isLoading } = useDriverWallet(driverId);
  const recordDeposit = useRecordDriverDeposit();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('wave');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [exporting, setExporting] = useState(false);

  const balance = data?.wallet?.balance ?? 0;
  const txns = data?.transactions ?? [];

  // CH-P7 — full-ledger CSV export (the card itself shows only the last 50).
  const handleExport = async () => {
    setExporting(true);
    try {
      const { data: all, error } = await supabase
        .from('driver_wallet_transactions')
        .select('created_at, type, amount, balance_after, method, reference, note')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!all || all.length === 0) {
        toast.error('Aucune transaction à exporter');
        return;
      }
      exportToCSV(
        all.map((t) => ({
          date: formatDateShort(new Date(t.created_at)),
          type: TYPE_LABEL[t.type]?.label ?? t.type,
          montant: t.amount,
          solde_apres: t.balance_after,
          reference: [t.method, t.reference].filter(Boolean).join(' · '),
          note: t.note ?? '',
        })),
        `kirapay_${driverId.slice(0, 8)}_${new Date().toISOString().split('T')[0]}`,
        {
          date: 'Date',
          type: 'Type',
          montant: 'Montant (FCFA)',
          solde_apres: 'Solde après (FCFA)',
          reference: 'Référence',
          note: 'Note',
        },
      );
      toast.success('Export CSV téléchargé');
    } catch (e) {
      toast.error('Export impossible', { description: (e as Error).message });
    } finally {
      setExporting(false);
    }
  };

  const handleSubmit = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    await recordDeposit.mutateAsync({
      driverId,
      amount: value,
      method,
      reference: reference || undefined,
      note: note || undefined,
    });
    setOpen(false);
    setAmount(''); setReference(''); setNote(''); setMethod('wave');
  };

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-5 w-5 text-primary" />
            Solde disponible DAM
          </CardTitle>
          <CardDescription>Crédit utilisé automatiquement à l'approbation d'une location</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            disabled={exporting || txns.length === 0}
            title={txns.length === 0 ? 'Aucune transaction' : undefined}
          >
            <Download className="h-4 w-4 mr-1" />
            {exporting ? 'Export…' : 'Exporter CSV'}
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Enregistrer un dépôt
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <p className="text-3xl font-bold">{formatCurrency(balance)}</p>
          <p className="text-xs text-muted-foreground">Solde disponible</p>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : txns.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune transaction.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {txns.map((t) => {
              const info = TYPE_LABEL[t.type] ?? { label: t.type, icon: RotateCcw, color: 'text-muted-foreground' };
              const Icon = info.icon;
              const positive = t.amount > 0;
              return (
                <div key={t.id} className="flex items-start justify-between border-b pb-2 last:border-0 gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${info.color}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug">{info.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateShort(new Date(t.created_at))}
                        {t.method ? ` · ${t.method}` : ''}
                        {t.reference ? ` · ${t.reference}` : ''}
                      </p>
                      {t.note && <p className="text-xs text-muted-foreground italic truncate">{t.note}</p>}
                      {(t as { invoice_id?: string | null }).invoice_id && (
                        <Link
                          to={`/admin/billing?invoice_id=${(t as { invoice_id: string }).invoice_id}`}
                          className="inline-flex items-center gap-1 mt-1 text-xs font-medium text-primary hover:underline"
                        >
                          <FileText className="h-3 w-3" /> Voir la facture
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-semibold ${positive ? 'text-success' : 'text-destructive'}`}>
                      {positive ? '+' : ''}{formatCurrency(t.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">Solde après : {formatCurrency(t.balance_after)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enregistrer un dépôt upfront</DialogTitle>
            <DialogDescription>
              Le montant sera ajouté au solde du conducteur et utilisé automatiquement lors des prochaines locations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="dep-amount">Montant (FCFA)</Label>
              <Input id="dep-amount" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50000" />
            </div>
            <div>
              <Label htmlFor="dep-method">Méthode</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="dep-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wave">Wave</SelectItem>
                  <SelectItem value="orange_money">Orange Money</SelectItem>
                  <SelectItem value="mtn_money">MTN Money</SelectItem>
                  <SelectItem value="moov_money">Moov Money</SelectItem>
                  <SelectItem value="cash">Espèces</SelectItem>
                  <SelectItem value="other">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dep-ref">Référence (optionnel)</Label>
              <Input id="dep-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N° transaction" />
            </div>
            <div>
              <Label htmlFor="dep-note">Note (optionnel)</Label>
              <Textarea id="dep-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={handleSubmit} disabled={recordDeposit.isPending || !amount}>
              {recordDeposit.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
