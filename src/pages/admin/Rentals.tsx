import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/routeClient';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ListPageSkeleton } from '@/components/AdminSkeletons';
import { ADMIN, RENTAL, UI } from '@/lib/i18n';
import { formatDateShort, formatCurrency } from '@/lib/format';
import { CheckCircle, XCircle, Eye, MoreHorizontal, Car, User, Undo2, Pencil, FileText, KeyRound } from 'lucide-react';
import { AssignVehicleDialog } from '@/components/admin/AssignVehicleDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useRoleGuard } from '@/hooks/useRoleGuard';
import { useRentals, useUpdateRentalStatus, useApproveAndActivateRental, useConfirmRentalReturn, useUpdateRentalFee } from '@/hooks/useAdminData';
import { logAction } from '@/hooks/useAuditLog';
import { StatusLegend } from '@/components/StatusLegend';
import { StatusBadge } from '@/lib/statusBadges';

const ACTIVE_STATUSES = ['approved', 'active', 'paid', 'return_pending', 'overdue_return', 'payment_overdue', 'vehicle_disabled'];
const RETURNABLE_STATUSES = ['approved', 'active', 'paid', 'return_pending', 'overdue_return', 'payment_overdue', 'vehicle_disabled'];

export default function AdminRentals() {
  const [activeTab, setActiveTab] = useState('pending');
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedRental, setSelectedRental] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rateInput, setRateInput] = useState<string>('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [returnDialogRental, setReturnDialogRental] = useState<any | null>(null);
  const [returnNote, setReturnNote] = useState('');
  const [editFeeRental, setEditFeeRental] = useState<any | null>(null);
  const [editFeeValue, setEditFeeValue] = useState<string>('');
  const [editFeeReason, setEditFeeReason] = useState<string>('');

  const { data: rentals, isLoading } = useRentals();
  const updateRentalStatus = useUpdateRentalStatus();
  const approveAndActivate = useApproveAndActivateRental();
  const confirmReturn = useConfirmRentalReturn();
  const updateFee = useUpdateRentalFee();
  const { canApproveRental } = useRoleGuard();

  const handleOpenReturnDialog = (rental: any) => {
    setReturnNote('');
    setReturnDialogRental(rental);
  };

  const handleSubmitReturn = () => {
    if (!returnDialogRental) return;
    const note = returnNote.trim();
    const rental = returnDialogRental;
    confirmReturn.mutate(
      { rentalId: rental.id, direct: true, justification: note || 'Retour confirmé par admin' },
      {
        onSuccess: async () => {
          // Audit entry with the optional note + current admin context
          logAction({
            action: 'rental_return_confirmed',
            targetType: 'rental',
            targetId: rental.id,
            details: {
              driver_name: rental.drivers?.full_name,
              vehicle: rental.vehicles?.model_name,
              license_plate: rental.vehicles?.license_plate,
              note: note || null,
            },
          });

          // Post-action verification: rental must be 'completed' and the
          // vehicle must be back to 'available' (unless another rental holds it).
          try {
            const [{ data: r }, { data: v }] = await Promise.all([
              supabase.from('rentals').select('status').eq('id', rental.id).maybeSingle(),
              rental.vehicles?.id
                ? supabase.from('vehicles').select('status').eq('id', rental.vehicles.id).maybeSingle()
                : Promise.resolve({ data: null } as any),
            ]);
            const rentalOk = r?.status === 'completed';
            const vehicleOk = !v || v.status === 'available';
            if (rentalOk && vehicleOk) {
              toast.success('Vérification OK', {
                description: 'Location clôturée et véhicule disponible.',
              });
            } else {
              toast.warning('Vérification incomplète', {
                description: `Location: ${r?.status ?? '?'} • Véhicule: ${v?.status ?? '—'}`,
              });
            }
          } catch (e) {
            // Verification is best-effort; never block the success flow.
          }

          setReturnDialogRental(null);
        },
      }
    );
  };

  const handleEditFee = (rental: any) => {
    const current = rental.final_rate ?? rental.approved_rate ?? rental.vehicles?.rent_per_day ?? 0;
    setEditFeeRental(rental);
    setEditFeeValue(String(current));
    setEditFeeReason('');
  };

  const currentFeeValue = editFeeRental
    ? (editFeeRental.final_rate ?? editFeeRental.approved_rate ?? editFeeRental.vehicles?.rent_per_day ?? 0)
    : 0;
  const parsedNewFee = parseInt(editFeeValue, 10);
  const isFeeValid = Number.isFinite(parsedNewFee) && parsedNewFee > 0;
  const feeChanged = isFeeValid && parsedNewFee !== Number(currentFeeValue);
  const reasonValid = editFeeReason.trim().length >= 5;
  const canSubmitFee = isFeeValid && feeChanged && reasonValid && !updateFee.isPending;

  const handleSubmitEditFee = () => {
    if (!editFeeRental || !canSubmitFee) return;
    const oldRate = Number(currentFeeValue);
    updateFee.mutate(
      { rentalId: editFeeRental.id, newRate: parsedNewFee, reason: editFeeReason.trim() },
      {
        onSuccess: () => {
          logAction({
            action: 'rental_fee_updated',
            targetType: 'rental',
            targetId: editFeeRental.id,
            details: {
              driver_name: editFeeRental.drivers?.full_name,
              vehicle: editFeeRental.vehicles?.model_name,
              old_rate: oldRate,
              new_rate: parsedNewFee,
              reason: editFeeReason.trim(),
            },
          });
          toast.success(`Tarif mis à jour — ${formatCurrency(parsedNewFee)}/jour`);
          setEditFeeRental(null);
          setEditFeeValue('');
          setEditFeeReason('');
        },
      }
    );
  };

  // Prefill rate from vehicle's rent_per_day when opening modal
  useEffect(() => {
    if (selectedRental && selectedRental.status === 'pending') {
      const defaultRate =
        selectedRental.requested_rate ??
        selectedRental.vehicles?.rent_per_day ??
        '';
      setRateInput(defaultRate ? String(defaultRate) : '');
    } else {
      setRateInput('');
    }
    setRejectionReason('');
  }, [selectedRental]);

  const filteredRentals = (rentals || []).filter((rental) => {
    if (activeTab === 'pending') return rental.status === 'pending';
    if (activeTab === 'active') return ACTIVE_STATUSES.includes(rental.status);
    if (activeTab === 'completed') return ['completed', 'rejected', 'terminated'].includes(rental.status);
    return true;
  });

  const handleApprove = () => {
    if (!selectedRental) return;
    const rate = parseInt(rateInput, 10);
    if (!rate || rate <= 0) {
      toast.error('Tarif invalide', { description: 'Veuillez entrer un tarif valide en FCFA.' });
      return;
    }

    // If admin overrides the suggested/requested rate, a justification is required.
    const suggestedRate =
      selectedRental.requested_rate ??
      selectedRental.vehicles?.rent_per_day ??
      null;
    const rateChanged = suggestedRate != null && rate !== Number(suggestedRate);
    if (rateChanged && !rejectionReason.trim()) {
      toast.error('Justification requise', {
        description: 'Expliquez pourquoi vous modifiez le tarif avant d\'approuver.',
      });
      return;
    }

    approveAndActivate.mutate(
      { rentalId: selectedRental.id, rate },
      {
        onSuccess: () => {
          logAction({
            action: 'rental_approved',
            targetType: 'rental',
            targetId: selectedRental.id,
            details: {
              driver_name: selectedRental.drivers?.full_name,
              rate,
              ...(rateChanged
                ? { original_rate: suggestedRate, rate_change_reason: rejectionReason.trim() }
                : {}),
            },
          });
          setIsModalOpen(false);
          setSelectedRental(null);
        },
      }
    );
  };

  const handleReject = () => {
    if (!selectedRental) return;
    if (!rejectionReason.trim()) {
      toast.error('Veuillez fournir un motif de rejet');
      return;
    }

    updateRentalStatus.mutate(
      { rentalId: selectedRental.id, status: 'rejected', rejectionReason: rejectionReason.trim() },
      {
        onSuccess: () => {
          logAction({
            action: 'rental_rejected',
            targetType: 'rental',
            targetId: selectedRental.id,
            details: { driver_name: selectedRental.drivers?.full_name, reason: rejectionReason.trim() },
          });
          toast.error('Location rejetée');
          setIsModalOpen(false);
          setSelectedRental(null);
        },
      }
    );
  };

  const handleTerminate = () => {
    if (!selectedRental) return;
    updateRentalStatus.mutate(
      { rentalId: selectedRental.id, status: 'completed' },
      {
        onSuccess: () => {
          logAction({
            action: 'rental_terminated',
            targetType: 'rental',
            targetId: selectedRental.id,
            details: { driver_name: selectedRental.drivers?.full_name },
          });
          toast.success('Location terminée');
          setIsModalOpen(false);
          setSelectedRental(null);
        },
      }
    );
  };

  const pendingCount = (rentals || []).filter(r => r.status === 'pending').length;
  const activeCount = (rentals || []).filter(r => ACTIVE_STATUSES.includes(r.status)).length;
  const returnPendingCount = (rentals || []).filter(r => r.status === 'return_pending').length;
  const completedCount = (rentals || []).filter(r => ['completed', 'rejected', 'terminated'].includes(r.status)).length;

  // Realtime: notify the admin when a driver flips a rental to return_pending.
  // We track the set of ids we've already toasted to avoid duplicate toasts on
  // re-renders / refetches.
  const seenReturnIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!rentals) return;
    const firstRun = seenReturnIdsRef.current.size === 0 && rentals.length > 0;
    rentals.forEach((r: any) => {
      if (r.status !== 'return_pending') return;
      if (seenReturnIdsRef.current.has(r.id)) return;
      seenReturnIdsRef.current.add(r.id);
      // Don't blast toasts for rentals already in this state on first load.
      if (firstRun) return;
      toast.warning('Demande de retour reçue', {
        description: `${r.drivers?.full_name || 'Un conducteur'} demande à rendre ${r.vehicles?.model_name || 'le véhicule'}.`,
        action: {
          label: 'Voir',
          onClick: () => {
            setActiveTab('active');
            setSelectedRental(r);
            setIsModalOpen(true);
          },
        },
      });
    });
    // Clean up ids that are no longer in return_pending so they retoast if it
    // happens again later.
    const stillPending = new Set(
      rentals.filter((r: any) => r.status === 'return_pending').map((r: any) => r.id)
    );
    seenReturnIdsRef.current.forEach((id) => {
      if (!stillPending.has(id)) seenReturnIdsRef.current.delete(id);
    });
  }, [rentals]);

  if (isLoading) {
    return (
      <AdminLayout>
        <AdminBreadcrumb items={[{ label: 'Locations' }]} />
        <ListPageSkeleton columns={6} rows={6} />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Locations' }]} />

      <AdminPageHeader
        title={ADMIN.RENTALS.TITLE}
        description={rentals?.length === 1 ? '1 location au total' : `${rentals?.length || 0} locations au total`}
        action={
          <Button onClick={() => setShowAssignDialog(true)}>
            <KeyRound className="h-4 w-4 mr-2" />
            Allouer un véhicule
          </Button>
        }
      />

      <StatusLegend kind={["rental", "rental_invoice"]} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="pending" className="gap-2">
            {ADMIN.RENTALS.PENDING}
            {pendingCount > 0 && <Badge variant="destructive" className="h-5 w-5 p-0 justify-center">{pendingCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="active" className="gap-2">
            {ADMIN.RENTALS.ACTIVE}
            <Badge variant="default" className="h-5 min-w-5 px-1.5 justify-center">{activeCount}</Badge>
            {returnPendingCount > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5" title="Retours à confirmer">
                ↩ {returnPendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2">
            {ADMIN.RENTALS.COMPLETED}
            <Badge variant="secondary" className="h-5 min-w-5 px-1.5 justify-center">{completedCount}</Badge>
          </TabsTrigger>
        </TabsList>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conducteur</TableHead>
                  <TableHead>Véhicule</TableHead>
                  <TableHead>Tarif</TableHead>
                  <TableHead>Date début</TableHead>
                  {activeTab !== 'pending' && <TableHead>Date fin</TableHead>}
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">{UI.ACTIONS}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRentals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Aucune location trouvée
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRentals.map((rental) => {
                    const displayRate = rental.final_rate ?? rental.approved_rate ?? rental.requested_rate ?? rental.vehicles?.rent_per_day;
                    return (
                      <TableRow key={rental.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                              <User className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="font-medium">{rental.drivers?.full_name || 'N/A'}</p>
                              <p className="text-xs text-muted-foreground">{rental.drivers?.phone_number}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Car className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p>{rental.vehicles?.model_name || 'N/A'}</p>
                              <p className="text-xs text-muted-foreground">{rental.vehicles?.license_plate}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {displayRate ? (
                            <span className="font-medium">{formatCurrency(displayRate)}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>{formatDateShort(new Date(rental.start_date))}</TableCell>
                        {activeTab !== 'pending' && (
                          <TableCell>{rental.end_date ? formatDateShort(new Date(rental.end_date)) : 'En cours'}</TableCell>
                        )}
                        <TableCell>
                          <div className="flex flex-col gap-1 items-start">
                            <StatusBadge kind="rental" status={rental.status} />
                            {(() => {
                              const inv = Array.isArray(rental.invoice) ? rental.invoice[0] : rental.invoice;
                              if (!inv?.status) return null;
                              return (
                                <StatusBadge
                                  kind="rental_invoice"
                                  status={inv.status}
                                  prefix="Facture"
                                  className="w-fit"
                                >
                                  <FileText className="h-3 w-3" />
                                </StatusBadge>
                              );
                            })()}
                          </div>
                        </TableCell>
                        <TableCell>
                          <TooltipProvider delayDuration={200}>
                            <div className="flex items-center justify-end gap-1">
                              {rental.status === 'pending' && canApproveRental() && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedRental(rental);
                                    setIsModalOpen(true);
                                  }}
                                >
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Approuver
                                </Button>
                              )}

                              {/* Voir — always available */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                   <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Voir les détails"
                                    title="Voir les détails (Entrée / Espace)"
                                    onClick={() => {
                                      setSelectedRental(rental);
                                      setIsModalOpen(true);
                                    }}
                                    className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{UI.VIEW}</TooltipContent>
                              </Tooltip>

                              {/* Marquer comme retournée — primary critical action, surfaced inline */}
                              {RETURNABLE_STATUSES.includes(rental.status) && canApproveRental() && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      aria-label="Marquer comme retournée"
                                      title="Marquer comme retournée (Entrée / Espace)"
                                      onClick={() => handleOpenReturnDialog(rental)}
                                      className="border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
                                    >
                                      <Undo2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Marquer comme retournée</TooltipContent>
                                </Tooltip>
                              )}

                              {/* Modifier le tarif — inline */}
                              {rental.status !== 'completed' && rental.status !== 'rejected' && rental.status !== 'pending' && canApproveRental() && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label="Modifier le tarif"
                                      title="Modifier le tarif (Entrée / Espace)"
                                      onClick={() => handleEditFee(rental)}
                                      className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Modifier le tarif</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TooltipProvider>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Tabs>

      {/* Unified Rental Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedRental?.status === 'pending' ? 'Approuver la location' : 'Détails de la location'}
            </DialogTitle>
            <DialogDescription>
              {selectedRental?.status === 'pending'
                ? "Définissez le tarif et approuvez. La location sera active immédiatement."
                : 'Informations sur cette location'}
            </DialogDescription>
          </DialogHeader>
          {selectedRental && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Conducteur :</span>
                    <p className="font-medium">{selectedRental.drivers?.full_name || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Téléphone :</span>
                    <p className="font-medium">{selectedRental.drivers?.phone_number || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Véhicule :</span>
                    <p className="font-medium">{selectedRental.vehicles?.model_name || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Plaque :</span>
                    <p className="font-medium">{selectedRental.vehicles?.license_plate || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {selectedRental.status === 'pending' && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tarif journalier (FCFA)</label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="Ex : 15000"
                      value={rateInput}
                      onChange={(e) => setRateInput(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Tarif suggéré du véhicule : {selectedRental.vehicles?.rent_per_day ? formatCurrency(selectedRental.vehicles.rent_per_day) : '—'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Motif (requis pour rejeter ou pour modifier le tarif)
                    </label>
                    <Textarea
                      placeholder="Justifiez un changement de tarif, ou indiquez le motif du rejet"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>
                      {UI.CANCEL}
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={handleReject}
                      disabled={updateRentalStatus.isPending}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      {UI.REJECT}
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={handleApprove}
                      disabled={approveAndActivate.isPending}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approuver
                    </Button>
                  </div>
                </>
              )}

              {ACTIVE_STATUSES.includes(selectedRental.status) && (
                <div className="flex gap-3 pt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>
                    Fermer
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={handleTerminate}
                    disabled={updateRentalStatus.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Terminer
                  </Button>
                </div>
              )}

              {!['pending', ...ACTIVE_STATUSES].includes(selectedRental.status) && (
                <div className="flex gap-3 pt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setIsModalOpen(false)}>
                    Fermer
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit fee dialog — replaces window.prompt to prevent accidental data corruption */}
      <Dialog open={!!editFeeRental} onOpenChange={(open) => { if (!open) { setEditFeeRental(null); setEditFeeValue(''); setEditFeeReason(''); } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier le tarif</DialogTitle>
            <DialogDescription>
              Ajustez le tarif journalier de cette location. Une justification est requise et sera enregistrée dans le journal d'audit.
            </DialogDescription>
          </DialogHeader>
          {editFeeRental && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                <p><span className="text-muted-foreground">Conducteur :</span> <span className="font-medium">{editFeeRental.drivers?.full_name || 'N/A'}</span></p>
                <p><span className="text-muted-foreground">Véhicule :</span> <span className="font-medium">{editFeeRental.vehicles?.model_name || 'N/A'} — {editFeeRental.vehicles?.license_plate || 'N/A'}</span></p>
                <p><span className="text-muted-foreground">Tarif actuel :</span> <span className="font-medium">{formatCurrency(Number(currentFeeValue))}/jour</span></p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="edit-fee-amount">Nouveau tarif (FCFA / jour)</label>
                <Input
                  id="edit-fee-amount"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={editFeeValue}
                  onChange={(e) => setEditFeeValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canSubmitFee) handleSubmitEditFee(); }}
                />
                {!isFeeValid && editFeeValue !== '' && (
                  <p className="text-xs text-destructive">Le tarif doit être un nombre positif.</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="edit-fee-reason">Motif du changement (min. 5 caractères)</label>
                <Textarea
                  id="edit-fee-reason"
                  placeholder="Ex : ajustement contractuel, erreur de saisie initiale…"
                  value={editFeeReason}
                  onChange={(e) => setEditFeeReason(e.target.value)}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setEditFeeRental(null); setEditFeeValue(''); setEditFeeReason(''); }}>
                  {UI.CANCEL}
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSubmitEditFee}
                  disabled={!canSubmitFee}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  {updateFee.isPending ? 'Enregistrement…' : 'Enregistrer'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Mark-as-returned dialog (admin-driven) */}
      <Dialog open={!!returnDialogRental} onOpenChange={(open) => !open && setReturnDialogRental(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Marquer la location comme retournée</DialogTitle>
            <DialogDescription>
              Confirme que le véhicule a été rendu. La location sera clôturée et le véhicule libéré.
            </DialogDescription>
          </DialogHeader>
          {returnDialogRental && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                <p><span className="text-muted-foreground">Conducteur :</span> <span className="font-medium">{returnDialogRental.drivers?.full_name || 'N/A'}</span></p>
                <p><span className="text-muted-foreground">Véhicule :</span> <span className="font-medium">{returnDialogRental.vehicles?.model_name || 'N/A'} — {returnDialogRental.vehicles?.license_plate || 'N/A'}</span></p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Note (optionnelle)</label>
                <Textarea
                  placeholder="Ex : kilométrage, état du véhicule, observations…"
                  value={returnNote}
                  onChange={(e) => setReturnNote(e.target.value)}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setReturnDialogRental(null)}>
                  {UI.CANCEL}
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSubmitReturn}
                  disabled={confirmReturn.isPending}
                >
                  <Undo2 className="h-4 w-4 mr-2" />
                  Confirmer le retour
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AssignVehicleDialog
        open={showAssignDialog}
        onOpenChange={setShowAssignDialog}
      />
    </AdminLayout>
  );
}
