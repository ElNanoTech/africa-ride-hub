import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { ScoreGauge, TierBadge } from '@/components/ScoreGauge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Legend } from 'recharts';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowLeft, Phone, Mail, Car, CreditCard, Calendar, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Clock, Wallet, XCircle, FileText, ExternalLink, Download, FileSpreadsheet, ChevronRight, Pencil, Trash2, Loader2, CarFront } from 'lucide-react';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { KYC, PAYMENT, RENTAL, LOAN, SCORE, ADMIN, UI } from '@/lib/i18n';
import { useUpdateKycStatus } from '@/hooks/useAdminData';
import { exportToCSV, exportDriverDetailToPDF } from '@/lib/export';
import { toast } from 'sonner';
import { AIDriverSummary } from '@/components/AIDriverSummary';
import { EditDriverDialog } from '@/components/admin/EditDriverDialog';
import { AssignVehicleDialog } from '@/components/admin/AssignVehicleDialog';
import { Driver360HeaderCard } from '@/components/admin/Driver360HeaderCard';
import {
  DriverInvoicesPanel,
  DriverAccidentsPanel,
  DriverTicketsPanel,
  DriverActivityPanel,
} from '@/components/admin/driver360/panels';
import { DriverNotesPanel } from '@/components/admin/driver360/DriverNotesPanel';
import { DriverAuditPanel } from '@/components/admin/driver360/DriverAuditPanel';
import { DriverDocumentsPanel } from '@/components/admin/driver360/DriverDocumentsPanel';
import { DriverActionsMenu } from '@/components/admin/DriverActionsMenu';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DriverWalletCard } from '@/components/admin/DriverWalletCard';
import { StatusBadge } from '@/lib/statusBadges';

const TIER_INFO = {
  A: { label: 'Excellent', color: 'hsl(142, 76%, 36%)' },
  B: { label: 'Bon', color: 'hsl(168, 76%, 42%)' },
  C: { label: 'Moyen', color: 'hsl(48, 96%, 53%)' },
  D: { label: 'Faible', color: 'hsl(25, 95%, 53%)' },
  E: { label: 'Très faible', color: 'hsl(0, 84%, 60%)' },
};

interface NextStepBannerProps {
  driver: { kyc_status: string; driver_status: string; full_name: string };
  kycSubmission: { status: string } | null | undefined;
  onApproveKyc: () => void;
  onRejectKyc: () => void;
  onActivate: () => void | Promise<void>;
  isProcessing: boolean;
}

function NextStepBanner({ driver, kycSubmission, onApproveKyc, onRejectKyc, onActivate, isProcessing }: NextStepBannerProps) {
  const kycPending = driver.kyc_status === 'pending';
  const kycVerified = driver.kyc_status === 'verified';
  const isActive = driver.driver_status === 'active';

  if (kycPending) {
    return (
      <Card className="mb-6 border-2 border-warning bg-warning/5">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="h-5 w-5 text-warning" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Approuver le KYC pour activer le conducteur</h3>
                <p className="text-sm text-muted-foreground">
                  {kycSubmission
                    ? "Vérifiez les documents soumis. L'approbation activera automatiquement le conducteur."
                    : "Aucun document soumis. L'approbation manuelle activera automatiquement le conducteur."}
                </p>
              </div>
            </div>
            <div className="flex gap-2 sm:flex-shrink-0">
              <Button onClick={onApproveKyc} disabled={isProcessing} size="lg">
                <CheckCircle className="h-4 w-4 mr-2" />
                Approuver KYC
              </Button>
              <Button onClick={onRejectKyc} disabled={isProcessing} variant="outline" size="lg">
                <XCircle className="h-4 w-4 mr-2" />
                Rejeter
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (kycVerified && !isActive) {
    // Edge case: legacy drivers whose KYC was verified before auto-activation
    // existed, or admins who manually toggled status off. Offer one-click fix.
    return (
      <Card className="mb-6 border-2 border-primary bg-primary/5">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Réactiver le conducteur</h3>
                <p className="text-sm text-muted-foreground">
                  KYC approuvé ✓ {driver.full_name} est actuellement inactif. Réactivez-le pour qu'il puisse louer un véhicule.
                </p>
              </div>
            </div>
            <Button onClick={onActivate} disabled={isProcessing} size="lg" className="sm:flex-shrink-0">
              <CheckCircle className="h-4 w-4 mr-2" />
              Activer
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (kycVerified && isActive) {
    return (
      <Card className="mb-6 border bg-primary/5 border-primary/30">
        <CardContent className="p-4 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
          <p className="text-sm">
            <strong>{driver.full_name}</strong> est entièrement configuré et actif.
          </p>
        </CardContent>
      </Card>
    );
  }

  return null;
}

export default function AdminDriverDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // State for rejection modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAssignVehicleDialog, setShowAssignVehicleDialog] = useState(false);
  const [showDeletePhotoDialog, setShowDeletePhotoDialog] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState(false);

  const handleDeletePhoto = async () => {
    if (!id) return;
    setDeletingPhoto(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-update-driver', {
        body: { driverId: id, profileImageUrl: null },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Photo supprimée');
      queryClient.invalidateQueries({ queryKey: ['admin-driver-detail', id] });
      setShowDeletePhotoDialog(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur lors de la suppression';
      toast.error(msg);
    } finally {
      setDeletingPhoto(false);
    }
  };
  
  // KYC mutation
  const updateKycStatus = useUpdateKycStatus();

  // Fetch driver details
  const { data: driver, isLoading: driverLoading, error: driverError, refetch } = useQuery({
    queryKey: ['admin-driver-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select(`
          *,
          vehicles:active_vehicle_id (
            id,
            model_name,
            license_plate,
            vehicle_type
          )
        `)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Driver not found');
      return data;
    },
    enabled: !!id,
  });

  // Fetch KYC submission
  const { data: kycSubmission, refetch: refetchKyc } = useQuery({
    queryKey: ['admin-driver-kyc', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kyc_submissions')
        .select('*')
        .eq('driver_id', id)
        .order('submitted_at', { ascending: false })
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
  const { data: scores } = useQuery({
    queryKey: ['admin-driver-scores', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('credit_scores')
        .select('*')
        .eq('driver_id', id)
        .order('calculation_week', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch rentals
  const { data: rentals } = useQuery({
    queryKey: ['admin-driver-rentals', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rentals')
        .select(`
          *,
          vehicles (
            model_name,
            license_plate
          )
        `)
        .eq('driver_id', id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch payments
  const { data: payments } = useQuery({
    queryKey: ['admin-driver-payments', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('driver_id', id)
        .order('due_date', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch loans
  const { data: loans } = useQuery({
    queryKey: ['admin-driver-loans', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loans')
        .select('*')
        .eq('driver_id', id)
        .order('applied_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch income records
  const { data: incomeRecords } = useQuery({
    queryKey: ['admin-driver-income', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('income_records')
        .select('*')
        .eq('driver_id', id)
        .order('record_date', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Process score data for charts
  const scoreChartData = scores?.map(s => ({
    week: format(parseISO(s.calculation_week), 'dd MMM', { locale: fr }),
    score: s.score,
    tier: s.tier,
    driving: s.driving_impact || 0,
    payment: s.payment_impact || 0,
    income: s.income_impact || 0,
  })) || [];

  // Calculate summary stats
  const latestScore = scores?.[scores.length - 1];
  const previousScore = scores?.[scores.length - 2];
  const scoreChange = latestScore && previousScore ? latestScore.score - previousScore.score : 0;

  const paymentStats = payments?.reduce((acc, p) => {
    if (p.status === 'paid') acc.paid++;
    else if (p.status === 'overdue') acc.overdue++;
    else acc.pending++;
    acc.total++;
    return acc;
  }, { paid: 0, overdue: 0, pending: 0, total: 0 }) || { paid: 0, overdue: 0, pending: 0, total: 0 };

  const totalIncome = incomeRecords?.reduce((sum, r) => sum + r.net_income, 0) || 0;
  const avgIncome = incomeRecords?.length ? Math.round(totalIncome / incomeRecords.length) : 0;

  // KYC handlers
  const handleApproveKyc = async () => {
    if (!id) return;
    
    if (kycSubmission) {
      updateKycStatus.mutate(
        { kycId: kycSubmission.id, driverId: id, status: 'verified' },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-driver-detail', id] });
            queryClient.invalidateQueries({ queryKey: ['admin-driver-kyc', id] });
            refetch();
            refetchKyc();
          }
        }
      );
    } else {
      try {
        const { error } = await supabase
          .from('drivers')
          .update({ kyc_status: 'verified' })
          .eq('id', id);
        if (error) throw error;
        toast.success('KYC approuvé — conducteur activé');
        queryClient.invalidateQueries({ queryKey: ['admin-driver-detail', id] });
        refetch();
      } catch {
        toast.error('Erreur lors de la mise à jour du KYC');
      }
    }
  };

  const handleRejectKyc = () => {
    if (!id || !rejectionReason.trim()) return;
    
    if (kycSubmission) {
      updateKycStatus.mutate(
        { 
          kycId: kycSubmission.id, 
          driverId: id, 
          status: 'rejected',
          rejectionReason: rejectionReason.trim()
        },
        {
          onSuccess: () => {
            setShowRejectModal(false);
            setRejectionReason('');
            queryClient.invalidateQueries({ queryKey: ['admin-driver-detail', id] });
            queryClient.invalidateQueries({ queryKey: ['admin-driver-kyc', id] });
            refetch();
            refetchKyc();
          }
        }
      );
    } else {
      supabase
        .from('drivers')
        .update({ kyc_status: 'rejected' })
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            toast.error('Erreur lors du rejet du KYC');
          } else {
            toast.success('KYC rejeté');
            setShowRejectModal(false);
            setRejectionReason('');
            queryClient.invalidateQueries({ queryKey: ['admin-driver-detail', id] });
            refetch();
          }
        });
    }
  };

  // Export handlers
  const handleExportCSV = () => {
    if (!scores?.length) {
      toast.error('Aucune donnée de score à exporter');
      return;
    }

    const csvData = scores.map(score => ({
      semaine: score.calculation_week,
      score: score.score,
      niveau: score.tier,
      conduite: score.driving_impact || 0,
      paiement: score.payment_impact || 0,
      revenu: score.income_impact || 0,
      statut: score.status,
    }));

    const headers = {
      semaine: 'Semaine',
      score: 'Score',
      niveau: 'Niveau',
      conduite: 'Impact Conduite',
      paiement: 'Impact Paiement',
      revenu: 'Impact Revenu',
      statut: 'Statut',
    };

    const filename = `scores-${driver?.full_name?.replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}`;
    exportToCSV(csvData, filename, headers);
    toast.success('Fichier CSV exporté');
  };

  const handleExportPDF = () => {
    if (!driver) return;

    const filename = `rapport-${driver.full_name.replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}`;
    
    exportDriverDetailToPDF({
      driverName: driver.full_name,
      generatedAt: new Date(),
      driverInfo: {
        phone: driver.phone_number,
        email: driver.email || undefined,
        yangoId: driver.yango_driver_id,
        status: driver.driver_status === 'active' ? 'Actif' : driver.driver_status === 'suspended' ? 'Suspendu' : 'Inactif',
        kycStatus: driver.kyc_status === 'verified' ? 'Vérifié' : driver.kyc_status === 'pending' ? 'En attente' : 'Rejeté',
        createdAt: formatDateShort(new Date(driver.created_at)),
      },
      currentScore: latestScore ? {
        score: latestScore.score,
        tier: latestScore.tier,
      } : undefined,
      scoreHistory: scores?.slice().reverse().map(s => ({
        week: format(parseISO(s.calculation_week), 'dd MMM yyyy', { locale: fr }),
        score: s.score,
        tier: s.tier,
        driving: s.driving_impact || 0,
        payment: s.payment_impact || 0,
        income: s.income_impact || 0,
      })),
      payments: payments?.slice(0, 20).map(p => ({
        type: p.payment_type === 'rental' ? 'Location' : 'Prêt',
        amount: p.amount,
        dueDate: formatDateShort(new Date(p.due_date)),
        status: p.status === 'paid' ? 'Payé' : p.status === 'overdue' ? 'En retard' : 'En attente',
      })),
    }, filename);

    toast.success('Rapport PDF exporté');
  };

  if (driverLoading) {
    return (
      <AdminLayout>
        <LoadingState message="Chargement des détails du conducteur..." />
      </AdminLayout>
    );
  }

  if (driverError || !driver) {
    return (
      <AdminLayout>
        <ErrorState 
          title="Conducteur non trouvé"
          message="Impossible de charger les détails de ce conducteur"
          onRetry={refetch}
        />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      {/* Header with Breadcrumb */}
      <div className="mb-6">
        {/* Breadcrumb Navigation */}
        <AdminBreadcrumb 
          items={[
            { label: 'Conducteurs', href: '/admin/drivers' },
            { label: driver.full_name }
          ]} 
        />

        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/admin/drivers')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Retour aux conducteurs</span>
            <span className="sm:hidden">Retour</span>
          </Button>
          
          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowAssignVehicleDialog(true)}
              disabled={driver.driver_status !== 'active'}
              title={driver.driver_status !== 'active' ? 'Le conducteur doit être actif' : undefined}
            >
              <CarFront className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Allouer un véhicule</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowEditDialog(true)}>
              <Pencil className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Modifier</span>
            </Button>
            <DriverActionsMenu
              driverId={driver.id}
              driverName={driver.full_name}
              driverStatus={driver.driver_status}
              onChanged={() => { refetch(); }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Exporter</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportCSV}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Exporter les scores en CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPDF}>
                  <FileText className="h-4 w-4 mr-2" />
                  Rapport complet en PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Avatar className="h-16 w-16 border-2 border-border shadow-sm">
              <AvatarImage src={(driver as any).profile_image_url ?? undefined} alt={driver.full_name} />
              <AvatarFallback className="text-lg font-semibold bg-muted">
                {driver.full_name
                  .split(' ')
                  .map((s) => s[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {(driver as any).profile_image_url && (
              <Button
                type="button"
                size="icon"
                variant="destructive"
                className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full shadow-md"
                onClick={() => setShowDeletePhotoDialog(true)}
                aria-label="Supprimer la photo"
                title="Supprimer la photo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <AdminPageHeader 
              title={driver.full_name}
              description={`ID Yango: ${driver.yango_driver_id}`}
            />
          </div>
        </div>
      </div>

      {/* Next-step CTA banner — guides admin through KYC approval and activation */}
      <NextStepBanner
        driver={driver}
        kycSubmission={kycSubmission}
        onApproveKyc={handleApproveKyc}
        onRejectKyc={() => setShowRejectModal(true)}
        onActivate={async () => {
          if (!id) return;
          const { error } = await supabase
            .from('drivers')
            .update({ driver_status: 'active' })
            .eq('id', id);
          if (error) {
            toast.error('Activation impossible');
          } else {
            toast.success('Conducteur activé ✓');
            queryClient.invalidateQueries({ queryKey: ['admin-driver-detail', id] });
            queryClient.invalidateQueries({ queryKey: ['admin-drivers'] });
            refetch();
          }
        }}
        isProcessing={updateKycStatus.isPending}
      />

      {/* Driver Info Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        {/* Current Score */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Score Actuel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="text-3xl font-bold">{latestScore?.score || '-'}</div>
              {latestScore && <TierBadge tier={latestScore.tier} size="md" />}
            </div>
            {scoreChange !== 0 && (
              <div className="flex items-center mt-2 text-sm">
                {scoreChange > 0 ? (
                  <>
                    <TrendingUp className="h-4 w-4 mr-1 text-emerald-500" />
                    <span className="text-emerald-500">+{scoreChange} pts</span>
                  </>
                ) : (
                  <>
                    <TrendingDown className="h-4 w-4 mr-1 text-destructive" />
                    <span className="text-destructive">{scoreChange} pts</span>
                  </>
                )}
                <span className="text-muted-foreground ml-1">vs semaine précédente</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* KYC Status */}
        <Card className={driver.kyc_status === 'pending' ? 'border-amber-500/50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Statut KYC</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge 
              variant={driver.kyc_status === 'verified' ? 'verified' : 
                       driver.kyc_status === 'rejected' ? 'rejected' : 
                       driver.kyc_status === 'not_submitted' ? 'outline' : 'pending'}
              className="text-sm"
            >
              {driver.kyc_status === 'verified' ? KYC.STATUS_VERIFIED : 
               driver.kyc_status === 'pending' ? KYC.STATUS_PENDING : 
               driver.kyc_status === 'not_submitted' ? 'Non soumis' : KYC.STATUS_REJECTED}
            </Badge>
            <div className="mt-2 text-sm text-muted-foreground">
              Statut: <span className="font-medium text-foreground">
                {driver.driver_status === 'active' ? 'Actif' : 
                 driver.driver_status === 'suspended' ? 'Suspendu' : 'Inactif'}
              </span>
            </div>
            {!kycSubmission && driver.kyc_status === 'pending' && (
              <p className="text-xs text-muted-foreground mt-2">Aucun document soumis — approbation manuelle</p>
            )}
            {/* Show KYC action buttons when driver status is pending (with or without submission) */}
            {(kycSubmission?.status === 'pending' || (!kycSubmission && driver.kyc_status === 'pending')) && (
              <div className="flex gap-2 mt-3">
                <Button 
                  size="sm" 
                  onClick={handleApproveKyc}
                  disabled={updateKycStatus.isPending}
                  className="flex-1 min-h-[44px]"
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Approuver
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive"
                  onClick={() => setShowRejectModal(true)}
                  disabled={updateKycStatus.isPending}
                  className="flex-1 min-h-[44px]"
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  Rejeter
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paiements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-emerald-600">{paymentStats.paid}</div>
              <span className="text-muted-foreground">/</span>
              <div className="text-lg text-muted-foreground">{paymentStats.total}</div>
              <span className="text-sm text-muted-foreground">payés</span>
            </div>
            {paymentStats.overdue > 0 && (
              <div className="flex items-center mt-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 mr-1" />
                {paymentStats.overdue} en retard
              </div>
            )}
          </CardContent>
        </Card>

        {/* Income */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revenu Moyen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(avgIncome)}</div>
            <div className="text-sm text-muted-foreground mt-1">
              par jour (30 derniers jours)
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Driver Summary - Premium */}
      <AIDriverSummary driverId={id!} driverName={driver.full_name} />

      {/* Contact Info */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{driver.phone_number}</span>
            </div>
            {driver.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{driver.email}</span>
              </div>
            )}
            {driver.vehicles && (
              <div className="flex items-center gap-2">
                <Car className="h-4 w-4 text-muted-foreground" />
                <span>{driver.vehicles.model_name} ({driver.vehicles.license_plate})</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Inscrit le {formatDateShort(new Date(driver.created_at))}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KYC Details Card - Show when pending or has submission */}
      {kycSubmission && (
        <Card className={`mb-6 ${driver.kyc_status === 'pending' ? 'border-amber-500/50 bg-amber-500/5' : ''}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Détails de la soumission KYC
              {driver.kyc_status === 'pending' && (
                <Badge variant="pending" className="ml-2">En attente de vérification</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Soumis le {format(parseISO(kycSubmission.submitted_at), 'dd MMMM yyyy à HH:mm', { locale: fr })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              {/* Mobile Money Info */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground">Compte mobile</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Opérateur:</span>
                    <span className="font-medium">{kycSubmission.bank_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Numéro mobile:</span>
                    <span className="font-medium font-mono">{kycSubmission.bank_account_number}</span>
                  </div>
                </div>
              </div>

              {/* Documents */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground">Documents</h4>
                <div className="flex flex-wrap gap-3">
                  {kycSubmission.id_proof_url && (
                    <a 
                      href={kycSubmission.id_proof_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
                    >
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-sm">Pièce d'identité</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </a>
                  )}
                  {kycSubmission.license_url && (
                    <a 
                      href={kycSubmission.license_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
                    >
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-sm">Permis de conduire</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Rejection reason if rejected */}
            {kycSubmission.status === 'rejected' && kycSubmission.rejection_reason && (
              <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 text-destructive mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-destructive">Motif du rejet</p>
                    <p className="text-sm text-muted-foreground mt-1">{kycSubmission.rejection_reason}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons for pending KYC */}
            {driver.kyc_status === 'pending' && (
              <div className="flex gap-3 mt-6 pt-4 border-t">
                <Button 
                  onClick={handleApproveKyc}
                  disabled={updateKycStatus.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {updateKycStatus.isPending ? 'Traitement...' : ADMIN.DRIVERS.APPROVE_KYC}
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => setShowRejectModal(true)}
                  disabled={updateKycStatus.isPending}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  {ADMIN.DRIVERS.REJECT_KYC}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Driver 360 summary */}
      {driver?.id && <Driver360HeaderCard driverId={driver.id} />}

      {/* Driver wallet (upfront balance) */}
      {driver?.id && <DriverWalletCard driverId={driver.id} />}

      {/* Tabs for detailed info */}
      <Tabs defaultValue="scores" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="scores">Historique des Scores</TabsTrigger>
          <TabsTrigger value="payments">Paiements</TabsTrigger>
          <TabsTrigger value="rentals">Locations</TabsTrigger>
          <TabsTrigger value="loans">Prêts</TabsTrigger>
          <TabsTrigger value="income">Revenus</TabsTrigger>
          <TabsTrigger value="invoices">Factures</TabsTrigger>
          <TabsTrigger value="accidents">Sinistres</TabsTrigger>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="activity">Activité</TabsTrigger>
        </TabsList>

        {/* Scores Tab */}
        <TabsContent value="scores" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Évolution du Score</CardTitle>
                <CardDescription>Score de crédit au fil du temps</CardDescription>
              </CardHeader>
              <CardContent>
                {scoreChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={scoreChartData}>
                      <defs>
                        <linearGradient id="colorDriverScore" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 1000]} tick={{ fontSize: 12 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="score"
                        stroke="hsl(var(--primary))"
                        fillOpacity={1}
                        fill="url(#colorDriverScore)"
                        strokeWidth={2}
                        name="Score"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    Aucun historique de score disponible
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Impact des Facteurs</CardTitle>
                <CardDescription>Contribution de chaque facteur</CardDescription>
              </CardHeader>
              <CardContent>
                {scoreChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={scoreChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                        formatter={(value: number) => [`${value} pts`, '']}
                      />
                      <Legend />
                      <Bar dataKey="driving" fill="hsl(200, 95%, 53%)" name="Conduite" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="payment" fill="hsl(142, 76%, 36%)" name="Paiement" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="income" fill="hsl(280, 85%, 60%)" name="Revenu" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    Aucune donnée disponible
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Score History Table */}
          <Card>
            <CardHeader>
              <CardTitle>Historique Détaillé</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Semaine</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Niveau</TableHead>
                    <TableHead>Conduite</TableHead>
                    <TableHead>Paiement</TableHead>
                    <TableHead>Revenu</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scores?.slice().reverse().map((score) => (
                    <TableRow key={score.id}>
                      <TableCell>{format(parseISO(score.calculation_week), 'dd MMM yyyy', { locale: fr })}</TableCell>
                      <TableCell className="font-bold">{score.score}</TableCell>
                      <TableCell><TierBadge tier={score.tier} size="sm" /></TableCell>
                      <TableCell>
                        {score.driving_data_available ? `${score.driving_impact || 0} pts` : '-'}
                      </TableCell>
                      <TableCell>
                        {score.payment_data_available ? `${score.payment_impact || 0} pts` : '-'}
                      </TableCell>
                      <TableCell>
                        {score.income_data_available ? `${score.income_impact || 0} pts` : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={score.status === 'active' ? 'verified' : 'pending'}>
                          {score.status === 'active' ? SCORE.ACTIVE : SCORE.PROVISIONAL}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )) || (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Aucun score enregistré
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>Historique des Paiements</CardTitle>
              <CardDescription>{payments?.length || 0} paiements enregistrés</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead>Payé le</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments?.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {payment.payment_type === 'rental' ? (
                            <Car className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Wallet className="h-4 w-4 text-muted-foreground" />
                          )}
                          {payment.payment_type === 'rental' ? PAYMENT.RENTAL_PAYMENT : PAYMENT.LOAN_PAYMENT}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{formatCurrency(payment.amount)}</TableCell>
                      <TableCell>{formatDateShort(new Date(payment.due_date))}</TableCell>
                      <TableCell>
                        {payment.paid_date ? formatDateShort(new Date(payment.paid_date)) : '-'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge kind="payment" status={payment.status} />
                      </TableCell>
                    </TableRow>
                  )) || (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        {PAYMENT.NO_PAYMENTS}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rentals Tab */}
        <TabsContent value="rentals">
          <Card>
            <CardHeader>
              <CardTitle>Historique des Locations</CardTitle>
              <CardDescription>{rentals?.length || 0} locations</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Véhicule</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Début</TableHead>
                    <TableHead>Fin</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rentals?.map((rental) => (
                    <TableRow key={rental.id}>
                      <TableCell>
                        <div className="font-medium">{rental.vehicles?.model_name}</div>
                        <div className="text-sm text-muted-foreground">{rental.vehicles?.license_plate}</div>
                      </TableCell>
                      <TableCell>Journalier</TableCell>
                      <TableCell>{formatDateShort(new Date(rental.start_date))}</TableCell>
                      <TableCell>
                        {rental.end_date ? formatDateShort(new Date(rental.end_date)) : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            rental.status === 'active' ? 'verified' : 
                            rental.status === 'pending' ? 'pending' : 
                            rental.status === 'rejected' ? 'rejected' : 'default'
                          }
                        >
                          {rental.status === 'active' ? RENTAL.ACTIVE :
                           rental.status === 'pending' ? RENTAL.PENDING :
                           rental.status === 'approved' ? RENTAL.APPROVED :
                           rental.status === 'rejected' ? RENTAL.REJECTED :
                           rental.status === 'completed' ? RENTAL.COMPLETED : rental.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )) || (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Aucune location
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Loans Tab */}
        <TabsContent value="loans">
          <Card>
            <CardHeader>
              <CardTitle>Historique des Prêts</CardTitle>
              <CardDescription>{loans?.length || 0} demandes de prêt</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Montant Demandé</TableHead>
                    <TableHead>Montant Approuvé</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loans?.map((loan) => (
                    <TableRow key={loan.id}>
                      <TableCell className="font-medium">
                        {loan.loan_type === 'car' ? LOAN.CAR_LOAN :
                         loan.loan_type === 'bike' ? LOAN.BIKE_LOAN : LOAN.TV_LOAN}
                      </TableCell>
                      <TableCell>{formatCurrency(loan.amount_requested)}</TableCell>
                      <TableCell>
                        {loan.amount_approved ? formatCurrency(loan.amount_approved) : '-'}
                      </TableCell>
                      <TableCell>{formatDateShort(new Date(loan.applied_at))}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            loan.status === 'approved' || loan.status === 'disbursed' ? 'verified' : 
                            loan.status === 'pending' ? 'pending' : 
                            loan.status === 'rejected' ? 'rejected' : 'default'
                          }
                        >
                          {loan.status === 'pending' ? LOAN.PENDING :
                           loan.status === 'approved' ? LOAN.APPROVED :
                           loan.status === 'rejected' ? LOAN.REJECTED :
                           loan.status === 'disbursed' ? LOAN.DISBURSED :
                           loan.status === 'repaying' ? LOAN.REPAYING :
                           loan.status === 'completed' ? LOAN.COMPLETED : loan.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )) || (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        {LOAN.NO_LOANS}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Income Tab */}
        <TabsContent value="income">
          <Card>
            <CardHeader>
              <CardTitle>Historique des Revenus</CardTitle>
              <CardDescription>Revenus journaliers via Yango</CardDescription>
            </CardHeader>
            <CardContent>
              {incomeRecords && incomeRecords.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={300} className="mb-6">
                    <BarChart data={incomeRecords.slice().reverse()}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="record_date" 
                        tick={{ fontSize: 12 }}
                        tickFormatter={(date) => format(parseISO(date), 'dd/MM', { locale: fr })}
                      />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                        formatter={(value: number) => [formatCurrency(value), '']}
                        labelFormatter={(date) => format(parseISO(date as string), 'dd MMM yyyy', { locale: fr })}
                      />
                      <Bar dataKey="net_income" fill="hsl(var(--primary))" name="Revenu Net" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Courses</TableHead>
                        <TableHead>Revenu Brut</TableHead>
                        <TableHead>Revenu Net</TableHead>
                        <TableHead>Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {incomeRecords.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>{formatDateShort(new Date(record.record_date))}</TableCell>
                          <TableCell>{record.trip_count}</TableCell>
                          <TableCell>{formatCurrency(record.gross_income)}</TableCell>
                          <TableCell className="font-medium">{formatCurrency(record.net_income)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{record.source}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  Aucune donnée de revenu disponible
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Factures Tab */}
        <TabsContent value="invoices">
          <DriverInvoicesPanel driverId={driver.id} />
        </TabsContent>

        {/* Sinistres Tab */}
        <TabsContent value="accidents">
          <DriverAccidentsPanel driverId={driver.id} />
        </TabsContent>

        {/* Tickets Tab */}
        <TabsContent value="tickets">
          <DriverTicketsPanel driverId={driver.id} />
        </TabsContent>

        {/* Activité Tab */}
        <TabsContent value="activity">
          <DriverActivityPanel driverId={driver.id} />
        </TabsContent>
      </Tabs>

      {/* KYC Rejection Modal */}
      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter la demande KYC</DialogTitle>
            <DialogDescription>
              Veuillez indiquer le motif du rejet. Le conducteur sera informé de cette décision.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {kycSubmission && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Opérateur:</span>
                  <span className="font-medium">{kycSubmission.bank_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Numéro mobile:</span>
                  <span className="font-medium">{kycSubmission.bank_account_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Soumis le:</span>
                  <span className="font-medium">{formatDateShort(new Date(kycSubmission.submitted_at))}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex gap-2">
                  {kycSubmission.id_proof_url && (
                    <a 
                      href={kycSubmission.id_proof_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      <FileText className="h-4 w-4" />
                      Pièce d'identité
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {kycSubmission.license_url && (
                    <a 
                      href={kycSubmission.license_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      <FileText className="h-4 w-4" />
                      Permis
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="rejection-reason">Motif du rejet *</Label>
              <Textarea
                id="rejection-reason"
                placeholder="Ex: Document illisible, informations incorrectes..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowRejectModal(false);
                setRejectionReason('');
              }}
            >
              {UI.CANCEL}
            </Button>
            <Button 
              variant="destructive"
              onClick={handleRejectKyc}
              disabled={!rejectionReason.trim() || updateKycStatus.isPending}
            >
              {updateKycStatus.isPending ? 'Traitement...' : 'Rejeter le KYC'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit driver / reset PIN dialog */}
      {driver && (
        <EditDriverDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          driver={{
            id: driver.id,
            full_name: driver.full_name,
            phone_number: driver.phone_number,
            email: driver.email ?? null,
            profile_image_url: (driver as any).profile_image_url ?? null,
            driver_status: (driver as any).driver_status ?? 'active',
            active_vehicle_id: (driver as any).active_vehicle_id ?? null,
          }}
          kycSubmission={kycSubmission}
        />
      )}

      {driver && (
        <AssignVehicleDialog
          open={showAssignVehicleDialog}
          onOpenChange={setShowAssignVehicleDialog}
          driverId={driver.id}
          driverName={driver.full_name}
        />
      )}

      <AlertDialog open={showDeletePhotoDialog} onOpenChange={setShowDeletePhotoDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la photo du conducteur ?</AlertDialogTitle>
            <AlertDialogDescription>
              La photo de profil de {driver.full_name} sera retirée définitivement. Cette action est immédiate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingPhoto}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeletePhoto();
              }}
              disabled={deletingPhoto}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingPhoto && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}