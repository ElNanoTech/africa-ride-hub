import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Banknote,
  Plus,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Send,
  TrendingUp,
  FileText,
  Camera,
  Info,
  Upload,
  Image,
  X,
  Loader2,
  Wallet,
  Receipt,
  PlusCircle,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { TopUpSheet } from '@/components/driver/TopUpSheet';
import { useDriverInvoices, useInvoiceLinkedPaymentsBatch } from '@/hooks/useBilling';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { DriverLayout } from '@/components/DriverLayout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { format, subDays, startOfWeek, endOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useDriverId } from '@/hooks/useDriverData';

interface IncomeFormData {
  record_date: string;
  gross_income: number;
  net_income: number;
  trip_count: number;
  proof_type: string;
  notes: string;
  proof_file: File | null;
}

const defaultFormData: IncomeFormData = {
  record_date: format(subDays(new Date(), 1), 'yyyy-MM-dd'),
  gross_income: 0,
  net_income: 0,
  trip_count: 0,
  proof_type: 'screenshot',
  notes: '',
  proof_file: null,
};

const statusConfig = {
  pending: { label: 'En attente', color: 'bg-amber-500', icon: Clock },
  approved: { label: 'Approuvé', color: 'bg-green-500', icon: CheckCircle2 },
  rejected: { label: 'Refusé', color: 'bg-red-500', icon: XCircle },
};

export default function IncomeReport() {
  const queryClient = useQueryClient();
  const { data: driverId, isLoading: driverIdLoading } = useDriverId();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<IncomeFormData>(defaultFormData);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Auto-refresh wallet balance + unpaid invoices after returning from Wave checkout
  useEffect(() => {
    const status = searchParams.get('topup');
    if (!status) return;
    if (status === 'success') {
      toast.success('Paiement reçu. Mise à jour du solde…');
      const refetch = () => {
        // Re-arm the auto-apply effect so the new wallet credit gets pushed onto open invoices
        autoApplyRanRef.current = false;
        queryClient.invalidateQueries({ queryKey: ['driver-wallet-balance'] });
        queryClient.invalidateQueries({ queryKey: ['driver-wallet-self'] });
        queryClient.invalidateQueries({ queryKey: ['driver-invoices'] });
      };
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

  // Wallet balance
  const { data: walletBalance, isLoading: walletLoading } = useQuery({
    queryKey: ['driver-wallet-balance', driverId],
    enabled: !!driverId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_wallets')
        .select('balance')
        .eq('driver_id', driverId!)
        .maybeSingle();
      if (error) throw error;
      return data?.balance ?? 0;
    },
  });

  // Unpaid invoices (via shared driver invoices hook)
  const { data: driverInvoices } = useDriverInvoices(driverId ?? undefined);
  const unpaidInvoices = (driverInvoices ?? []).filter(
    (i: any) =>
      i.invoice_kind === 'invoice' &&
      (i.status === 'issued' || i.status === 'partial') &&
      !i.paid_at,
  );
  const unpaidCount = unpaidInvoices.length;
  const unpaidIds = unpaidInvoices.map((i: any) => i.id);
  const { data: linkedByInvoice } = useInvoiceLinkedPaymentsBatch(unpaidIds);

  // ----- Auto-apply wallet credit to open invoices -----
  // Runs whenever driver lands on financial center and has credit + unpaid invoices.
  const [autoApplyResult, setAutoApplyResult] = useState<{
    applied_count: number;
    total_applied: number;
    new_wallet_balance: number;
  } | null>(null);
  const autoApplyRanRef = useRef(false);
  useEffect(() => {
    if (!driverId) return;
    if (autoApplyRanRef.current) return;
    if ((walletBalance ?? 0) <= 0) return;
    if (unpaidCount === 0) return;
    autoApplyRanRef.current = true;
    (async () => {
      const { data, error } = await supabase.rpc(
        'apply_wallet_credit_to_open_invoices',
        { p_driver_id: driverId },
      );
      if (error) {
        console.warn('auto-apply wallet failed', error);
        return;
      }
      const r = data as any;
      if (r?.applied_count > 0) {
        setAutoApplyResult({
          applied_count: r.applied_count,
          total_applied: r.total_applied,
          new_wallet_balance: r.new_wallet_balance,
        });
        toast.success('Crédit DAM appliqué automatiquement', {
          description: `${r.total_applied.toLocaleString('fr-FR')} F appliqués sur ${r.applied_count} facture${r.applied_count > 1 ? 's' : ''}.`,
        });
        queryClient.invalidateQueries({ queryKey: ['driver-wallet-balance'] });
        queryClient.invalidateQueries({ queryKey: ['driver-wallet-self'] });
        queryClient.invalidateQueries({ queryKey: ['driver-invoices'] });
        queryClient.invalidateQueries({ queryKey: ['invoice-linked-payments'] });
      }
    })();
  }, [driverId, walletBalance, unpaidCount, queryClient]);

  // Per-row pay handler (1-step Wave checkout)
  const [payingId, setPayingId] = useState<string | null>(null);
  const handlePayInvoice = async (invoiceId: string) => {
    const link = linkedByInvoice?.[invoiceId];
    if (!link) {
      toast.error('Paiement indisponible', { description: 'Ouvrez la facture pour finaliser.' });
      return;
    }
    const remaining = Math.max(0, Number(link.amount ?? 0) - Number(link.amount_paid ?? 0));
    if (remaining <= 0) {
      toast.info('Cette facture est déjà payée.');
      queryClient.invalidateQueries({ queryKey: ['driver-invoices'] });
      return;
    }
    setPayingId(invoiceId);
    try {
      const successUrl = `${window.location.origin}/driver/income?topup=success`;
      const errorUrl = `${window.location.origin}/driver/income?topup=error`;
      const response = await supabase.functions.invoke('wave-checkout', {
        body: { paymentId: link.payment_id, amount: remaining, successUrl, errorUrl },
      });
      if (response.error) throw new Error(response.error.message);
      const url = (response.data as any)?.checkout_url;
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('Lien de paiement indisponible');
      }
    } catch (e: any) {
      toast.error('Erreur de paiement', { description: e?.message || 'Réessayez plus tard.' });
    } finally {
      setPayingId(null);
    }
  };

  // Fetch driver's income submissions
  const { data: incomeRecords, isLoading: recordsLoading } = useQuery({
    queryKey: ['driver-income-submissions', driverId],
    queryFn: async () => {
      if (!driverId) return [];
      const { data, error } = await supabase
        .from('income_records')
        .select('*')
        .eq('driver_id', driverId)
        .order('record_date', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    enabled: !!driverId,
  });

  // Calculate weekly summary
  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const thisWeekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  
  const weeklyIncome = incomeRecords?.filter(r => {
    const date = new Date(r.record_date);
    return date >= thisWeekStart && date <= thisWeekEnd && r.status === 'approved';
  }).reduce((sum, r) => sum + (r.net_income || 0), 0) || 0;

  const pendingCount = incomeRecords?.filter(r => r.status === 'pending').length || 0;

  // Upload proof image
  const uploadProofImage = async (file: File): Promise<string | null> => {
    if (!driverId) return null;
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${driverId}/${Date.now()}.${fileExt}`;
    
    const { error } = await supabase.storage
      .from('income-proofs')
      .upload(fileName, file);
    
    if (error) {
      console.error('Upload error:', error);
      throw new Error('Échec du téléchargement de la preuve');
    }
    
    return fileName;
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Fichier trop volumineux', { description: 'Maximum 5 Mo autorisé' });
      return;
    }
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Type de fichier non supporté', { description: 'Utilisez JPG, PNG, WebP ou PDF' });
      return;
    }
    
    setFormData(prev => ({ ...prev, proof_file: file }));
    
    // Create preview for images
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  // Clear file selection
  const clearFile = () => {
    setFormData(prev => ({ ...prev, proof_file: null }));
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Submit income mutation
  const submitIncome = useMutation({
    mutationFn: async (data: IncomeFormData) => {
      if (!driverId) throw new Error('Driver ID not found');
      
      setIsUploading(true);
      let proofUrl: string | null = null;
      
      // Upload proof if provided
      if (data.proof_file) {
        proofUrl = await uploadProofImage(data.proof_file);
      }
      
      const { data: result, error } = await supabase
        .from('income_records')
        .insert({
          driver_id: driverId,
          record_date: data.record_date,
          gross_income: data.gross_income,
          net_income: data.net_income,
          trip_count: data.trip_count,
          source: 'driver_declared',
          status: 'pending',
          trust_weight: 0.7,
          proof_url: proofUrl,
          raw_data: {
            proof_type: data.proof_type,
            notes: data.notes,
            submitted_at: new Date().toISOString(),
            has_proof_image: !!proofUrl,
          },
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-income-submissions'] });
      toast.success('Revenu déclaré avec succès', {
        description: 'Votre déclaration sera examinée par un administrateur.'
      });
      setIsDialogOpen(false);
      setFormData(defaultFormData);
      clearFile();
      setIsUploading(false);
    },
    onError: (error: any) => {
      setIsUploading(false);
      const msg = error?.message || '';
      if (msg.includes('unique') || msg.includes('duplicate')) {
        toast.error('Déclaration déjà existante', {
          description: 'Vous avez déjà déclaré un revenu pour cette date. Choisissez une autre date.',
        });
      } else {
        toast.error(msg || 'Erreur lors de la déclaration');
      }
    },
  });

  const handleSubmit = () => {
    if (formData.gross_income <= 0) {
      toast.error('Le revenu brut doit être positif');
      return;
    }

    // Validate date is a real, reasonable date
    const recordDate = new Date(formData.record_date);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    if (isNaN(recordDate.getTime())) {
      toast.error('Date invalide', { description: 'Veuillez saisir une date valide.' });
      return;
    }

    const year = recordDate.getFullYear();
    if (year < 2020 || year > today.getFullYear()) {
      toast.error('Date invalide', { description: 'L\'année doit être entre 2020 et aujourd\'hui.' });
      return;
    }

    // Block future dates
    if (recordDate > today) {
      toast.error('Date invalide', {
        description: 'Vous ne pouvez pas déclarer un revenu pour une date future.',
      });
      return;
    }

    // Block dates older than 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    if (recordDate < ninetyDaysAgo) {
      toast.error('Date trop ancienne', {
        description: 'Vous ne pouvez déclarer que les 90 derniers jours.',
      });
      return;
    }

    // Net income cannot exceed gross income
    if (formData.net_income > formData.gross_income) {
      toast.error('Revenu net invalide', {
        description: 'Le revenu net ne peut pas dépasser le revenu brut.',
      });
      return;
    }

    // Trip count required if revenue declared
    if (formData.trip_count <= 0) {
      toast.error('Nombre de courses requis', {
        description: 'Indiquez au moins 1 course.',
      });
      return;
    }
    
    // Check for anomalies
    if (formData.gross_income > 50000) {
      const confirmed = window.confirm(
        `Vous déclarez ${formData.gross_income.toLocaleString()} FCFA. Ce montant est élevé. Confirmez-vous?`
      );
      if (!confirmed) return;
    }
    
    submitIncome.mutate(formData);
  };

  const handleGrossIncomeChange = (value: number) => {
    const netIncome = Math.round(value * 0.8);
    setFormData(prev => ({
      ...prev,
      gross_income: value,
      net_income: netIncome,
    }));
  };

  if (driverIdLoading) {
    return (
      <DriverLayout>
        <div className="p-4 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DriverLayout>
    );
  }

  return (
    <DriverLayout>
      <div className="p-4 pb-24 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold">Mes Revenus</h1>
          <p className="text-sm text-muted-foreground">
            Votre centre financier : solde, factures et recharge Wave
          </p>
        </div>
        {false && (
        <div className="flex items-center justify-between">
          <div />
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Déclarer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Banknote className="h-5 w-5" />
                  Déclarer un revenu
                </DialogTitle>
                <DialogDescription>
                  Vos déclarations seront vérifiées par un administrateur
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4 overflow-y-auto flex-1">
                {/* Date */}
                <div className="space-y-2">
                  <Label>Date de la journée</Label>
                  <Input
                    type="date"
                    value={formData.record_date}
                    min={format(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')}
                    max={format(new Date(), 'yyyy-MM-dd')}
                    onChange={(e) => setFormData({ ...formData, record_date: e.target.value })}
                  />
                </div>

                {/* Income Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Revenu brut (FCFA)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="999999"
                      value={formData.gross_income || ''}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (val <= 999999) handleGrossIncomeChange(val);
                      }}
                      placeholder="25000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Revenu net (FCFA)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="999999"
                      value={formData.net_income || ''}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (val <= 999999) setFormData({ ...formData, net_income: val });
                      }}
                      placeholder="20000"
                    />
                  </div>
                </div>

                {/* Trip Count */}
                <div className="space-y-2">
                  <Label>Nombre de courses</Label>
                    <Input
                      type="number"
                      min="0"
                      max="999"
                      value={formData.trip_count || ''}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (val <= 999) setFormData({ ...formData, trip_count: val });
                      }}
                      placeholder="15"
                    />
                </div>

                {/* Proof Type */}
                <div className="space-y-2">
                  <Label>Type de justificatif</Label>
                  <Select
                    value={formData.proof_type}
                    onValueChange={(value) => setFormData({ ...formData, proof_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="screenshot">Capture d'écran app</SelectItem>
                      <SelectItem value="receipt">Reçu papier</SelectItem>
                      <SelectItem value="mobile_money_statement">Relevé mobile money</SelectItem>
                      <SelectItem value="other">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Proof Upload */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    Photo justificative (recommandé)
                  </Label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  
                  {!formData.proof_file ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-24 border-dashed flex flex-col gap-2"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Ajouter une capture d'écran ou photo
                      </span>
                    </Button>
                  ) : (
                    <div className="relative border rounded-lg p-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6"
                        onClick={clearFile}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      
                      {previewUrl ? (
                        <div className="flex items-center gap-3">
                          <img 
                            src={previewUrl} 
                            alt="Preview" 
                            className="h-16 w-16 object-cover rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{formData.proof_file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(formData.proof_file.size / 1024).toFixed(0)} Ko
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="h-16 w-16 rounded bg-muted flex items-center justify-center">
                            <FileText className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{formData.proof_file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(formData.proof_file.size / 1024).toFixed(0)} Ko
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    JPG, PNG, WebP ou PDF • Max 5 Mo
                  </p>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label>Notes (optionnel)</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Détails supplémentaires..."
                    rows={2}
                  />
                </div>

                {/* Info */}
                <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <Info className="h-4 w-4 mt-0.5 text-primary" />
                  <div className="text-sm">
                    <p className="font-medium text-primary">Pourquoi déclarer?</p>
                    <p className="text-muted-foreground text-xs mt-1">
                      Vos déclarations aident à calculer votre DAM Score même sans données automatiques.
                      Les déclarations avec preuves sont traitées plus rapidement.
                    </p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={submitIncome.isPending}>
                  Annuler
                </Button>
                <Button onClick={handleSubmit} disabled={submitIncome.isPending || isUploading} className="gap-2">
                  {submitIncome.isPending || isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {submitIncome.isPending || isUploading ? 'Envoi...' : 'Soumettre'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        )}

        {/* Centre Financier — all-in-one money hub */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              Centre financier
            </CardTitle>
            <CardDescription>
              Solde, factures et recharge Wave — tout au même endroit
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Mon crédit DAM</p>
                <p className="text-2xl font-bold tabular-nums">
                  {walletLoading ? '…' : `${(walletBalance || 0).toLocaleString('fr-FR')} F`}
                </p>
              </div>
              {unpaidCount > 0 && (
                <a href="#payment-center" aria-label="Aller au centre de paiement">
                  <Badge variant="destructive" className="text-[11px] cursor-pointer hover:bg-destructive/90 active:scale-95 transition-transform">
                    {unpaidCount} facture{unpaidCount > 1 ? 's' : ''} à payer →
                  </Badge>
                </a>
              )}
            </div>

            <Button
              onClick={() => setTopUpOpen(true)}
              size="lg"
              className="w-full h-12 font-semibold"
            >
              <PlusCircle className="h-5 w-5 mr-2" />
              Recharger via Wave
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <Link
                to="/driver/portefeuille"
                className="rounded-xl border border-border bg-card p-3 active:scale-[0.98] transition-transform flex items-center gap-2 min-h-[56px]"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Wallet className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">Portefeuille</p>
                  <p className="text-[11px] text-muted-foreground">Historique</p>
                </div>
              </Link>
              <Link
                to="/driver/factures"
                className="rounded-xl border border-border bg-card p-3 active:scale-[0.98] transition-transform flex items-center gap-2 min-h-[56px]"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Receipt className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">Factures</p>
                  <p className="text-[11px] text-muted-foreground">& relevés</p>
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>

        <TopUpSheet open={topUpOpen} onOpenChange={setTopUpOpen} returnPath="/driver/income" />

        {autoApplyResult && autoApplyResult.applied_count > 0 && (
          <Card className="border-green-500/30 bg-green-500/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">
                    Votre crédit DAM a été appliqué automatiquement
                  </p>
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    <p>
                      Crédit utilisé :{' '}
                      <span className="font-semibold text-foreground tabular-nums">
                        {autoApplyResult.total_applied.toLocaleString('fr-FR')} F
                      </span>
                    </p>
                    <p>
                      Solde restant :{' '}
                      <span className="font-semibold text-foreground tabular-nums">
                        {autoApplyResult.new_wallet_balance.toLocaleString('fr-FR')} F
                      </span>
                    </p>
                    <p>
                      Factures réglées :{' '}
                      <span className="font-semibold text-foreground">
                        {autoApplyResult.applied_count}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Centre de paiement — pay any unpaid invoice in 1 tap */}
        <Card id="payment-center" className={unpaidCount > 0 ? "border-destructive/30" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              Centre de paiement
              {unpaidCount > 0 && (
                <Badge variant="destructive" className="ml-auto text-[11px]">
                  {unpaidCount} à payer
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {unpaidCount > 0
                ? 'Payez vos factures en 1 clic via Wave'
                : 'Aucune facture impayée — vous êtes à jour ✅'}
            </CardDescription>
          </CardHeader>
          {unpaidCount > 0 && (
            <CardContent className="space-y-2">
              {unpaidInvoices.map((inv: any) => {
                const link = linkedByInvoice?.[inv.id];
                const remaining = link
                  ? Math.max(0, Number(link.amount ?? 0) - Number(link.amount_paid ?? 0))
                  : Number(inv.total_ttc ?? 0);
                const isPaying = payingId === inv.id;
                return (
                  <div
                    key={inv.id}
                    className="rounded-xl border border-border bg-card p-3 flex items-center gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">
                        {inv.invoice_number || 'Facture'}
                      </p>
                      {inv.status === 'partial' && (
                        <p className="text-[11px] text-green-700 font-medium">
                          Partiellement payée avec votre crédit DAM
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        {formatDateShort(inv.issued_at || inv.created_at)} •{' '}
                        <span className="font-semibold text-destructive">
                          Reste {formatCurrency(remaining)}
                        </span>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handlePayInvoice(inv.id)}
                      disabled={isPaying || !link || remaining <= 0}
                      className="bg-[#1DC3E4] hover:bg-[#1DC3E4]/90 text-white shrink-0 min-h-[44px]"
                    >
                      {isPaying ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Banknote className="h-4 w-4 mr-1" />
                          {inv.status === 'partial' ? 'Payer le reste' : 'Payer'}
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
              <p className="text-[11px] text-muted-foreground text-center pt-1">
                Paiement sécurisé via Wave — vous serez redirigé puis revenu ici.
              </p>
            </CardContent>
          )}
        </Card>



        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <TrendingUp className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-lg font-bold">{weeklyIncome.toLocaleString('fr-FR')} F</p>
                  <p className="text-xs text-muted-foreground">Cette semaine</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Clock className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-lg font-bold">{pendingCount}</p>
                  <p className="text-xs text-muted-foreground">En attente</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payment advice */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium text-sm">Payez vos factures à temps</p>
                <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                  <li>• Rechargez votre portefeuille à l'avance pour ne jamais être en retard</li>
                  <li>• Les paiements à l'heure améliorent votre DAM Score et débloquent des prêts</li>
                  <li>• Un retard de paiement réduit votre score et peut suspendre votre location</li>
                  <li>• Activez les notifications pour être alerté à chaque nouvelle facture</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </DriverLayout>
  );
}
