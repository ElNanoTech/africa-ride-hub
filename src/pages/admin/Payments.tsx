import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { ListPageSkeleton, StatGridSkeleton } from '@/components/AdminSkeletons';
import { Label } from '@/components/ui/label';
import { Search, Download, CheckCircle, Clock, AlertTriangle, Calendar as CalendarIcon, CreditCard, Banknote, TrendingUp, TrendingDown, Plus, Wallet, Receipt } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/format';
import { fr } from 'date-fns/locale';
import { usePayments, useCreatePayment } from '@/hooks/useAdminData';
import { usePaymentReceipts, useRecordPaymentReceipt } from '@/hooks/useBilling';
import { StatusBadge } from '@/lib/statusBadges';
import { toast } from 'sonner';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import type { AdminPayment } from '@/types/admin';
import { useFinancialRealtime } from '@/hooks/useFinancialRealtime';

export default function AdminPayments() {
  useFinancialRealtime({ scope: 'admin' });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedPayment, setSelectedPayment] = useState<AdminPayment | null>(null);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [receiptAmount, setReceiptAmount] = useState<string>('');
  const [receiptMethod, setReceiptMethod] = useState<'wave' | 'cash' | 'orange' | 'mtn' | 'moov' | 'other'>('wave');
  const [waveTransactionId, setWaveTransactionId] = useState('');
  const [receiptNote, setReceiptNote] = useState('');
  // Draft = what user is picking in the popover. Applied = what actually filters the list.
  const [draftRange, setDraftRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [periodOpen, setPeriodOpen] = useState(false);

  const { data: payments, isLoading } = usePayments();
  const recordReceipt = useRecordPaymentReceipt();
  const { data: receiptsHistory } = usePaymentReceipts(selectedPayment?.id ?? null);
  const createPayment = useCreatePayment();
  const { canManagePayments } = useRoleGuard();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newPayment, setNewPayment] = useState({
    driver_id: '',
    amount: '',
    due_date: new Date().toISOString().split('T')[0],
    payment_type: 'rental',
    rental_id: '',
  });

  // Fetch drivers and rentals for the create dialog
  const { data: drivers = [] } = useQuery({
    queryKey: ['admin-drivers-list-payments'],
    queryFn: async () => {
      const { data } = await supabase.from('drivers').select('id, full_name, phone_number').eq('driver_status', 'active').order('full_name');
      return data || [];
    },
  });

  const { data: activeRentals = [] } = useQuery({
    queryKey: ['admin-active-rentals-payments'],
    queryFn: async () => {
      const { data } = await supabase.from('rentals').select('id, driver_id, vehicles(model_name, license_plate)').eq('status', 'active');
      return (data || []) as Array<{
        id: string;
        driver_id: string;
        vehicles: { model_name: string | null; license_plate: string | null } | null;
      }>;
    },
  });

  const getStatusBadge = (status: string) => <StatusBadge kind="payment" status={status} />;

  const getTypeBadge = (type: string) => {
    if (type === 'rental') {
      return <Badge variant="outline" className="gap-1"><CreditCard className="h-3 w-3" />Location</Badge>;
    }
    return <Badge variant="outline" className="gap-1"><Banknote className="h-3 w-3" />Prêt</Badge>;
  };

  const filteredPayments = (payments || []).filter(payment => {
    const matchesSearch = payment.drivers?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         payment.drivers?.phone_number?.includes(searchQuery);
    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;
    const matchesType = typeFilter === 'all' || payment.payment_type === typeFilter;
    let matchesDate = true;
    if (dateRange.from || dateRange.to) {
      const due = new Date(payment.due_date);
      if (dateRange.from) {
        const from = new Date(dateRange.from);
        from.setHours(0, 0, 0, 0);
        if (due < from) matchesDate = false;
      }
      if (matchesDate && dateRange.to) {
        const to = new Date(dateRange.to);
        to.setHours(23, 59, 59, 999);
        if (due > to) matchesDate = false;
      }
    }
    return matchesSearch && matchesStatus && matchesType && matchesDate;
  });

  const formatPeriodLabel = () => {
    if (!dateRange.from && !dateRange.to) return 'Période';
    const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    if (dateRange.from && dateRange.to) return `${fmt(dateRange.from)} → ${fmt(dateRange.to)}`;
    if (dateRange.from) return `Depuis ${fmt(dateRange.from)}`;
    return `Jusqu'au ${fmt(dateRange.to!)}`;
  };

  const applyPeriod = () => {
    setDateRange({ from: draftRange.from, to: draftRange.to });
    setPeriodOpen(false);
  };

  const resetPeriod = () => {
    setDraftRange({ from: undefined, to: undefined });
    setDateRange({ from: undefined, to: undefined });
    setPeriodOpen(false);
  };

  // Calculate stats
  // Calculate stats — partial counts toward "collected" for the paid portion only
  const isUnpaid = (s: string) => !['paid', 'overpaid', 'waived'].includes(s);
  const outstandingOf = (p: AdminPayment) =>
    isUnpaid(p.status) ? Math.max(0, p.amount - (p.amount_paid ?? 0)) : 0;
  const totalDue = (payments || []).reduce((sum, p) => sum + outstandingOf(p), 0);
  const totalCollected = (payments || []).reduce(
    (sum, p) => sum + Math.min(p.amount, p.amount_paid ?? (p.status === 'paid' ? p.amount : 0)),
    0,
  );
  // "En retard" = explicit overdue status OR an unpaid (pending/partial)
  // payment whose due_date is in the past. Nothing in the app ever sets
  // status='overdue', so without the date fallback this bucket stays empty.
  const todayStr = new Date().toISOString().split('T')[0];
  const isOverdue = (p: AdminPayment) =>
    p.status === 'overdue' ||
    (['pending', 'partial'].includes(p.status) && p.due_date.slice(0, 10) < todayStr);
  const overdueAmount = (payments || []).filter(isOverdue).reduce((sum, p) => sum + outstandingOf(p), 0);
  const pendingCount = (payments || []).filter(p => p.status === 'pending' || p.status === 'partial').length;
  const overdueCount = (payments || []).filter(isOverdue).length;
  const collectionRate = totalDue + totalCollected > 0 ? ((totalCollected / (totalDue + totalCollected)) * 100).toFixed(1) : '0';

  const openReceiptDialog = (payment: AdminPayment) => {
    setSelectedPayment(payment);
    const outstanding = Math.max(0, payment.amount - (payment.amount_paid ?? 0));
    setReceiptAmount(String(outstanding > 0 ? outstanding : payment.amount));
    setReceiptMethod('wave');
    setWaveTransactionId('');
    setReceiptNote('');
    setShowReceiptDialog(true);
  };

  const handleRecordReceipt = () => {
    if (!selectedPayment) return;
    const amt = parseInt(receiptAmount, 10);
    if (!amt || amt <= 0) {
      toast.error('Montant invalide');
      return;
    }
    if (receiptMethod === 'wave' && amt < 100) {
      toast.error('Le montant minimum est de 100 FCFA (limite Wave).');
      return;
    }
    recordReceipt.mutate(
      {
        payment_id: selectedPayment.id,
        customer_id: selectedPayment.customer_id ?? null,
        amount: amt,
        method: receiptMethod,
        wave_transaction_id: waveTransactionId || null,
        note: receiptNote || null,
      },
      {
        onSuccess: () => {
          const newTotal = (selectedPayment.amount_paid ?? 0) + amt;
          const target = selectedPayment.amount;
          if (newTotal > target) {
            toast.success('Paiement enregistré', {
              description: `Trop-perçu de ${formatCurrency(newTotal - target)} crédité au portefeuille du chauffeur.`,
            });
          } else if (newTotal < target) {
            toast.success('Paiement partiel enregistré', {
              description: `Solde restant : ${formatCurrency(target - newTotal)}`,
            });
          } else {
            toast.success('Paiement intégral enregistré');
          }
          setShowReceiptDialog(false);
          setSelectedPayment(null);
        },
        onError: (e: Error) => {
          const raw = e?.message || 'Erreur inconnue';
          let friendly = raw;
          if (/Invalid invoice status transition/i.test(raw)) {
            friendly = "La facture liée a été annulée — impossible de la marquer payée. Le paiement reste enregistrable, réessayez ou contactez le support.";
          } else if (/frozen fields on paid\/cancelled invoice/i.test(raw)) {
            friendly = "Cette facture est figée (payée ou annulée) et ne peut plus être modifiée.";
          }
          toast.error('Erreur', { description: friendly });
        },
      }
    );
  };

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const pid = searchParams.get('payment_id');
    if (!pid || !payments) return;
    const target = payments.find((p) => p.id === pid);
    if (!target) return;
    openReceiptDialog(target);
    const next = new URLSearchParams(searchParams);
    next.delete('payment_id');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, searchParams]);

  // Show skeleton while loading
  if (isLoading) {
    return (
      <AdminLayout>
        <AdminBreadcrumb items={[{ label: 'Paiements' }]} />
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <Skeleton className="h-8 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
          <StatGridSkeleton count={4} className="grid-cols-2 lg:grid-cols-4" />
          <ListPageSkeleton columns={6} rows={8} />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Paiements' }]} />
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Paiements</h1>
            <p className="text-muted-foreground">Suivi et gestion des paiements</p>
          </div>
          <div className="flex gap-2">
            {canManagePayments() && (
              <Button className="gap-2" onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4" />
                Nouveau Paiement
              </Button>
            )}
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Exporter
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total dû (mois)</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalDue)}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Banknote className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Collecté</p>
                  <p className="text-2xl font-bold text-tier-gold">{formatCurrency(totalCollected)}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-tier-gold/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-tier-gold" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Taux de recouvrement</p>
                  <p className="text-2xl font-bold">{collectionRate}%</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">En retard</p>
                  <p className="text-2xl font-bold text-destructive">{formatCurrency(overdueAmount)}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <TrendingDown className="h-5 w-5 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par nom ou téléphone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="paid">Payé</SelectItem>
                  <SelectItem value="overdue">En retard</SelectItem>
                  <SelectItem value="late">Payé en retard</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  <SelectItem value="rental">Location</SelectItem>
                  <SelectItem value="loan">Prêt</SelectItem>
                </SelectContent>
              </Select>
              <Popover
                open={periodOpen}
                onOpenChange={(o) => {
                  setPeriodOpen(o);
                  if (o) setDraftRange({ from: dateRange.from, to: dateRange.to });
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant={dateRange.from || dateRange.to ? 'default' : 'outline'}
                    className="gap-2"
                  >
                    <CalendarIcon className="h-4 w-4" />
                    {formatPeriodLabel()}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="range"
                    selected={{ from: draftRange.from, to: draftRange.to }}
                    onSelect={(range) => setDraftRange({ from: range?.from, to: range?.to })}
                    locale={fr}
                    numberOfMonths={1}
                    className="p-3 pointer-events-auto"
                  />
                  <div className="flex items-center justify-between gap-2 border-t p-3">
                    <Button type="button" variant="ghost" size="sm" onClick={resetPeriod}>
                      Réinitialiser
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPeriodOpen(false)}
                      >
                        Annuler
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={applyPeriod}
                        disabled={!draftRange.from && !draftRange.to}
                      >
                        Appliquer
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>

        {/* Payments Table */}
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all">Tous ({payments?.length || 0})</TabsTrigger>
            <TabsTrigger value="pending">En attente ({pendingCount})</TabsTrigger>
            <TabsTrigger value="overdue">En retard ({overdueCount})</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Chauffeur</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Détails</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-10 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-40" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredPayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Aucun paiement trouvé
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPayments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{payment.drivers?.full_name || 'N/A'}</p>
                            <p className="text-sm text-muted-foreground">{payment.drivers?.phone_number}</p>
                          </div>
                        </TableCell>
                        <TableCell>{getTypeBadge(payment.payment_type)}</TableCell>
                        <TableCell>
                          <p className="text-sm">
                            {payment.payment_type === 'rental' 
                              ? `${payment.rentals?.vehicles?.model_name || 'N/A'} - ${payment.rentals?.vehicles?.license_plate || ''}`
                              : `${payment.loans?.loan_type || 'Prêt'} - ${formatCurrency(payment.loans?.amount_approved || 0)}`
                            }
                          </p>
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(payment.amount)}
                          {(() => {
                            const paid = payment.amount_paid ?? 0;
                            if (paid <= 0 || payment.status === 'paid') return null;
                            const pct = Math.min(100, Math.round((paid / payment.amount) * 100));
                            return (
                              <div className="mt-1 space-y-0.5">
                                <div className="h-1 w-full bg-muted rounded overflow-hidden">
                                  <div className="h-full bg-warning" style={{ width: `${pct}%` }} />
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                  Reçu : {formatCurrency(paid)} · Reste : {formatCurrency(Math.max(0, payment.amount - paid))}
                                </p>
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>{formatDate(payment.due_date)}</TableCell>
                        <TableCell>{getStatusBadge(payment.status)}</TableCell>
                        <TableCell className="text-right">
                          {!['paid', 'overpaid', 'waived'].includes(payment.status) && canManagePayments() && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openReceiptDialog(payment)}
                            >
                              <Receipt className="h-3.5 w-3.5 mr-1" />
                              {payment.status === 'partial' ? 'Compléter' : 'Encaisser'}
                            </Button>
                          )}
                          {(payment.status === 'paid' || payment.status === 'overpaid') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setSelectedPayment(payment); setShowReceiptDialog(true); setReceiptAmount(''); }}
                            >
                              <Receipt className="h-3.5 w-3.5 mr-1" />
                              Reçus
                            </Button>
                          )}
                          {payment.wave_transaction_id && (
                            <span className="text-xs text-muted-foreground ml-2">
                              {payment.wave_transaction_id}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="pending">
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Affichage des paiements en attente
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="overdue">
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Affichage des paiements en retard
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Record Receipt Dialog (handles full / partial / over-payment) */}
        <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <span>Enregistrer un paiement reçu</span>
                {selectedPayment && (
                  <StatusBadge kind="payment" status={selectedPayment.status} />
                )}
              </DialogTitle>
              <DialogDescription>
                Saisissez le montant exact reçu. Partiel, intégral ou trop-perçu sont gérés automatiquement et expliqués ci-dessous.
              </DialogDescription>
            </DialogHeader>
            {selectedPayment && (() => {
              const sp = selectedPayment;
              const paid = sp.amount_paid ?? 0;
              const outstanding = Math.max(0, sp.amount - paid);
              const amt = parseInt(receiptAmount, 10) || 0;
              const newTotal = paid + amt;
              const surplus = Math.max(0, newTotal - sp.amount);
              const remaining = Math.max(0, sp.amount - newTotal);
              return (
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-2 gap-3 text-sm bg-muted/40 rounded-md p-3">
                    <div>
                      <p className="text-muted-foreground text-xs">Chauffeur</p>
                      <p className="font-medium">{sp.drivers?.full_name}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Échéance</p>
                      <p className="font-medium">{formatDate(sp.due_date)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Montant dû</p>
                      <p className="font-medium">{formatCurrency(sp.amount)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Déjà reçu</p>
                      <p className="font-medium">{formatCurrency(paid)}</p>
                    </div>
                  </div>

                  <div>
                    <Label>Montant reçu (FCFA)</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={receiptAmount}
                        onChange={(e) => setReceiptAmount(e.target.value)}
                        placeholder={String(outstanding || sp.amount)}
                      />
                      {outstanding > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setReceiptAmount(String(outstanding))}
                          title="Solde restant"
                        >
                          Solde
                        </Button>
                      )}
                    </div>
                  </div>

                  {amt > 0 && (
                    <div
                      role="status"
                      aria-live="polite"
                      className={`text-sm rounded-md p-2 border ${surplus > 0 ? 'bg-success/10 border-success/30 text-success' : remaining > 0 ? 'bg-warning/10 border-warning/30 text-warning' : 'bg-primary/10 border-primary/30 text-primary'}`}
                    >
                      {surplus > 0 ? (
                        <span className="flex items-center gap-1"><Wallet className="h-4 w-4" aria-hidden="true" /> Trop-perçu de {formatCurrency(surplus)} — surplus crédité au portefeuille du chauffeur.</span>
                      ) : remaining > 0 ? (
                        <span>Paiement partiel — solde restant à encaisser : {formatCurrency(remaining)}.</span>
                      ) : (
                        <span className="flex items-center gap-1"><CheckCircle className="h-4 w-4" aria-hidden="true" /> Paiement intégral — facture entièrement réglée.</span>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Méthode</Label>
                      <Select value={receiptMethod} onValueChange={(v) => setReceiptMethod(v as typeof receiptMethod)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="wave">Wave</SelectItem>
                          <SelectItem value="orange">Orange Money</SelectItem>
                          <SelectItem value="mtn">MTN</SelectItem>
                          <SelectItem value="moov">Moov</SelectItem>
                          <SelectItem value="cash">Espèces</SelectItem>
                          <SelectItem value="other">Autre</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>ID transaction (optionnel)</Label>
                      <Input
                        placeholder="WV123…"
                        value={waveTransactionId}
                        onChange={(e) => setWaveTransactionId(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Note (optionnel)</Label>
                    <Input
                      placeholder="Référence interne, observation…"
                      value={receiptNote}
                      onChange={(e) => setReceiptNote(e.target.value)}
                    />
                  </div>

                  {(receiptsHistory?.length ?? 0) > 0 && (
                    <div className="border rounded-md divide-y text-xs">
                      <p className="px-2 py-1.5 font-medium bg-muted/50">Historique des reçus</p>
                      {receiptsHistory!.map((r) => (
                        <div key={r.id} className="flex justify-between px-2 py-1.5">
                          <span className="text-muted-foreground">{new Date(r.received_at).toLocaleDateString('fr-FR')} · {r.method}</span>
                          <span className="font-mono">{formatCurrency(r.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowReceiptDialog(false)}>
                Annuler
              </Button>
              <Button
                onClick={handleRecordReceipt}
                disabled={recordReceipt.isPending || !receiptAmount || parseInt(receiptAmount, 10) <= 0}
              >
                {recordReceipt.isPending ? 'Enregistrement…' : 'Enregistrer le paiement'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Payment Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Créer un paiement</DialogTitle>
              <DialogDescription>
                Ajouter un nouveau paiement pour un conducteur
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Conducteur</Label>
                <Select value={newPayment.driver_id} onValueChange={(v) => setNewPayment(f => ({ ...f, driver_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner un conducteur" /></SelectTrigger>
                  <SelectContent>
                    {drivers.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.full_name} ({d.phone_number})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={newPayment.payment_type} onValueChange={(v) => setNewPayment(f => ({ ...f, payment_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rental">Location</SelectItem>
                    <SelectItem value="loan">Prêt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newPayment.payment_type === 'rental' && newPayment.driver_id && (
                <div>
                  <Label>Location associée</Label>
                  <Select value={newPayment.rental_id} onValueChange={(v) => setNewPayment(f => ({ ...f, rental_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner une location" /></SelectTrigger>
                    <SelectContent>
                      {activeRentals.filter(r => r.driver_id === newPayment.driver_id).map(r => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.vehicles?.model_name} - {r.vehicles?.license_plate}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Montant (FCFA)</Label>
                  <Input type="number" value={newPayment.amount} onChange={(e) => setNewPayment(f => ({ ...f, amount: e.target.value }))} placeholder="15000" />
                </div>
                <div>
                  <Label>Date d'échéance</Label>
                  <Input type="date" value={newPayment.due_date} onChange={(e) => setNewPayment(f => ({ ...f, due_date: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Annuler
              </Button>
              <Button 
                onClick={() => {
                  if (!newPayment.driver_id || !newPayment.amount) {
                    toast.error('Veuillez remplir tous les champs obligatoires');
                    return;
                  }
                  createPayment.mutate({
                    driver_id: newPayment.driver_id,
                    amount: parseInt(newPayment.amount),
                    due_date: newPayment.due_date,
                    payment_type: newPayment.payment_type,
                    rental_id: newPayment.rental_id || undefined,
                  }, {
                    onSuccess: () => {
                      setShowCreateDialog(false);
                      setNewPayment({ driver_id: '', amount: '', due_date: new Date().toISOString().split('T')[0], payment_type: 'rental', rental_id: '' });
                    },
                  });
                }} 
                disabled={createPayment.isPending}
              >
                {createPayment.isPending ? 'Création...' : 'Créer le paiement'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
