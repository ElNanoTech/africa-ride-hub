import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AIKycValidation } from '@/components/AIKycValidation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, XCircle, FileText, CreditCard, Smartphone, ExternalLink, Loader2, Eye } from 'lucide-react';
import { formatDateShort } from '@/lib/format';
import { useUpdateKycStatus, useKycSubmissions } from '@/hooks/useAdminData';
import { logAction } from '@/hooks/useAuditLog';

interface KycReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: {
    id: string;
    full_name: string;
    phone_number: string;
    latestKycSubmission?: {
      id: string;
      status: string;
      submitted_at: string;
      rejection_reason?: string;
    } | null;
  } | null;
}

export function KycReviewModal({ open, onOpenChange, driver }: KycReviewModalProps) {
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: kycSubmissions, isLoading } = useKycSubmissions();
  const updateKycStatus = useUpdateKycStatus();

  // Find the full KYC submission with document URLs
  const kycSubmission = kycSubmissions?.find(
    k => k.driver_id === driver?.id && k.id === driver?.latestKycSubmission?.id
  );

  const handleApprove = () => {
    if (!kycSubmission || !driver) return;
    
    updateKycStatus.mutate(
      {
        kycId: kycSubmission.id,
        driverId: driver.id,
        status: 'verified',
      },
      {
        onSuccess: () => {
          logAction({
            action: 'kyc_approved',
            targetType: 'driver',
            targetId: driver.id,
            details: { kycId: kycSubmission.id },
          });
          onOpenChange(false);
        },
      }
    );
  };

  const handleReject = () => {
    if (!kycSubmission || !driver || !rejectionReason.trim()) return;
    
    updateKycStatus.mutate(
      {
        kycId: kycSubmission.id,
        driverId: driver.id,
        status: 'rejected',
        rejectionReason: rejectionReason.trim(),
      },
      {
        onSuccess: () => {
          logAction({
            action: 'kyc_rejected',
            targetType: 'driver',
            targetId: driver.id,
            details: { kycId: kycSubmission.id, reason: rejectionReason.trim() },
          });
          setRejectionReason('');
          setShowRejectForm(false);
          onOpenChange(false);
        },
      }
    );
  };

  const resetModal = () => {
    setRejectionReason('');
    setShowRejectForm(false);
    setPreviewUrl(null);
  };

  if (!driver) return null;

  const isPending = kycSubmission?.status === 'pending';

  return (
    <>
      <Dialog open={open} onOpenChange={(value) => {
        if (!value) resetModal();
        onOpenChange(value);
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Révision KYC - {driver.full_name}
            </DialogTitle>
            <DialogDescription>
              Vérifiez les documents soumis et approuvez ou rejetez la demande KYC.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : kycSubmission ? (
            <div className="space-y-6">
              {/* AI Pre-validation - Premium */}
              <AIKycValidation
                driverId={driver.id}
                idProofUrl={kycSubmission.id_proof_url}
                licenseUrl={kycSubmission.license_url}
                status={kycSubmission.status}
              />

              {/* Status and submission info */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="text-sm text-muted-foreground">Soumis le</p>
                  <p className="font-medium">{formatDateShort(new Date(kycSubmission.submitted_at))}</p>
                </div>
                <Badge variant={
                  kycSubmission.status === 'approved' || kycSubmission.status === 'verified' ? 'verified' :
                  kycSubmission.status === 'rejected' ? 'rejected' : 'pending'
                } className="text-sm">
                  {kycSubmission.status === 'approved' || kycSubmission.status === 'verified' ? 'Approuvé' :
                   kycSubmission.status === 'rejected' ? 'Rejeté' : 'En attente'}
                </Badge>
              </div>

              {/* Mobile Money Information */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold">Compte mobile</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Opérateur</p>
                      <p className="font-medium">{kycSubmission.bank_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Numéro mobile</p>
                      <p className="font-medium font-mono">{kycSubmission.bank_account_number}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Documents */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  Documents soumis
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* ID Proof */}
                  <Card className="overflow-hidden">
                    <CardContent className="p-0">
                      <div className="p-3 bg-muted/30 border-b">
                        <p className="font-medium text-sm">Pièce d'identité</p>
                      </div>
                      <div className="p-4">
                        {kycSubmission.id_proof_url ? (
                          <div className="space-y-2">
                            <div className="relative aspect-[4/3] bg-muted rounded-lg overflow-hidden">
                              <img 
                                src={kycSubmission.id_proof_url} 
                                alt="Pièce d'identité"
                                className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => setPreviewUrl(kycSubmission.id_proof_url)}
                              />
                              <Button
                                variant="secondary"
                                size="sm"
                                className="absolute bottom-2 right-2 gap-1"
                                onClick={() => setPreviewUrl(kycSubmission.id_proof_url)}
                              >
                                <Eye className="h-3 w-3" />
                                Agrandir
                              </Button>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full gap-2"
                              onClick={() => window.open(kycSubmission.id_proof_url, '_blank')}
                            >
                              <ExternalLink className="h-4 w-4" />
                              Ouvrir dans un nouvel onglet
                            </Button>
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-sm">Non fourni</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* License */}
                  <Card className="overflow-hidden">
                    <CardContent className="p-0">
                      <div className="p-3 bg-muted/30 border-b">
                        <p className="font-medium text-sm">Permis de conduire</p>
                      </div>
                      <div className="p-4">
                        {kycSubmission.license_url ? (
                          <div className="space-y-2">
                            <div className="relative aspect-[4/3] bg-muted rounded-lg overflow-hidden">
                              <img 
                                src={kycSubmission.license_url} 
                                alt="Permis de conduire"
                                className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => setPreviewUrl(kycSubmission.license_url!)}
                              />
                              <Button
                                variant="secondary"
                                size="sm"
                                className="absolute bottom-2 right-2 gap-1"
                                onClick={() => setPreviewUrl(kycSubmission.license_url!)}
                              >
                                <Eye className="h-3 w-3" />
                                Agrandir
                              </Button>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full gap-2"
                              onClick={() => window.open(kycSubmission.license_url!, '_blank')}
                            >
                              <ExternalLink className="h-4 w-4" />
                              Ouvrir dans un nouvel onglet
                            </Button>
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-sm">Non fourni</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Rejection reason if already rejected */}
              {kycSubmission.status === 'rejected' && kycSubmission.rejection_reason && (
                <Card className="border-destructive/50 bg-destructive/5">
                  <CardContent className="p-4">
                    <p className="text-sm font-medium text-destructive mb-1">Raison du rejet</p>
                    <p className="text-sm">{kycSubmission.rejection_reason}</p>
                  </CardContent>
                </Card>
              )}

              {/* Rejection form */}
              {showRejectForm && isPending && (
                <div className="space-y-3 p-4 border rounded-lg bg-destructive/5 border-destructive/20">
                  <Label htmlFor="rejection-reason" className="text-destructive font-medium">
                    Raison du rejet *
                  </Label>
                  <Textarea
                    id="rejection-reason"
                    placeholder="Expliquez pourquoi cette soumission KYC est rejetée..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={3}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Aucune soumission KYC trouvée pour ce conducteur.
            </div>
          )}

          {isPending && kycSubmission && (
            <DialogFooter className="gap-2 sm:gap-0">
              {showRejectForm ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowRejectForm(false);
                      setRejectionReason('');
                    }}
                  >
                    Annuler
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleReject}
                    disabled={!rejectionReason.trim() || updateKycStatus.isPending}
                  >
                    {updateKycStatus.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4 mr-2" />
                    )}
                    Confirmer le rejet
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setShowRejectForm(true)}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Rejeter
                  </Button>
                  <Button
                    onClick={handleApprove}
                    disabled={updateKycStatus.isPending}
                  >
                    {updateKycStatus.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Approuver
                  </Button>
                </>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl max-h-[95vh] p-2">
          {previewUrl && (
            <img 
              src={previewUrl} 
              alt="Document preview"
              className="w-full h-full object-contain rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
