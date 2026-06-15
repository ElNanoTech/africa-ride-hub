import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { TierBadge } from '@/components/ScoreGauge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Legend } from 'recharts';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowLeft, Car, AlertTriangle, CheckCircle, Wallet, XCircle, FileText, ExternalLink, Download, FileSpreadsheet } from 'lucide-react';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { KYC, PAYMENT, LOAN, SCORE, ADMIN, UI } from '@/lib/i18n';
import { useUpdateKycStatus } from '@/hooks/useAdminData';
import { exportToCSV, exportDriverDetailToPDF } from '@/lib/export';
import { toast } from 'sonner';
import { EditDriverDialog } from '@/components/admin/EditDriverDialog';
import { AssignVehicleDialog } from '@/components/admin/AssignVehicleDialog';
import {
  DriverInvoicesPanel,
  DriverAccidentsPanel,
  DriverTicketsPanel,
  DriverActivityPanel,
} from '@/components/admin/driver360/panels';
import { DriverNotesPanel } from '@/components/admin/driver360/DriverNotesPanel';
import { DriverAuditPanel } from '@/components/admin/driver360/DriverAuditPanel';
import { DriverDocumentsPanel } from '@/components/admin/driver360/DriverDocumentsPanel';
import { DriverOverviewPanel } from '@/components/admin/driver360/DriverOverviewPanel';
import { DriverFleetControlPanel } from '@/components/admin/driver360/DriverFleetControlPanel';
import { DriverViolationsPanel } from '@/components/admin/driver360/DriverViolationsPanel';
import { DriverRentalsPanel } from '@/components/admin/driver360/DriverRentalsPanel';
import { DriverActionsMenu } from '@/components/admin/DriverActionsMenu';
import { SendDriverMessageDialog } from '@/components/admin/SendDriverMessageDialog';
import { CreateInvoiceDialog } from '@/components/admin/CreateInvoiceDialog';
import { DriverOperationsHub } from '@/components/admin/driver360/DriverOperationsHub';

import { DriverWalletCard } from '@/components/admin/DriverWalletCard';
import { StatusBadge } from '@/lib/statusBadges';
import { useRealtimePostgresChanges } from '@/hooks/useRealtimePostgresChanges';

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

// Layer 2B tabs. Legacy CH-* deep links are normalized into these groups so
// existing URLs from Attention Center, lists, and older QA scripts keep
// landing on useful content.
const TAB_VALUES = [
  'overview', 'finance', 'vehicle', 'fleet-control', 'risk', 'growth', 'documents', 'activity',
] as const;

const LEGACY_TAB_TO_LAYER2B: Record<string, typeof TAB_VALUES[number]> = {
  scores: 'risk',
  payments: 'finance',
  invoices: 'finance',
  income: 'finance',
  wallet: 'finance',
  rentals: 'vehicle',
  loans: 'growth',
  violations: 'risk',
  accidents: 'risk',
  tickets: 'activity',
  notes: 'activity',
  audit: 'activity',
};

function normalizeTabParam(tab: string | null): typeof TAB_VALUES[number] {
  if (tab && (TAB_VALUES as readonly string[]).includes(tab)) {
    return tab as typeof TAB_VALUES[number];
  }
  return tab ? LEGACY_TAB_TO_LAYER2B[tab] ?? 'overview' : 'overview';
}

export default function AdminDriverDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  // State for rejection modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAssignVehicleDialog, setShowAssignVehicleDialog] = useState(false);

  // CH-P5 quick actions
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [notesFocusToken, setNotesFocusToken] = useState(0);

  // CH-L4 — ?tab= deep link (tab=wallet scrolls the KiraPay card into view).
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<string>(normalizeTabParam(tabParam));
  const walletCardRef = useRef<HTMLDivElement>(null);
  const kycCardRef = useRef<HTMLDivElement>(null);

  const scrollToKycCard = () => {
    kycCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleAddNote = () => {
    setActiveTab('activity');
    setNotesFocusToken((t) => t + 1);
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

  // CH-L4 / Layer 2B — apply ?tab= once content is rendered. Legacy aliases
  // map into the new grouped tabs; tab=wallet also scrolls the wallet panel.
  useEffect(() => {
    if (!tabParam || driverLoading) return;
    setActiveTab(normalizeTabParam(tabParam));
    if (tabParam === 'wallet') {
      const t = setTimeout(() => {
        walletCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
      return () => clearTimeout(t);
    }
  }, [tabParam, driverLoading]);

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

  // Rentals are loaded by DriverRentalsPanel (CH-P6, full history).

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

  // CH-B4: live refresh of the open profile — invalidate the exact query
  // keys backing the page/panels when a row for THIS driver changes.
  // Trailing-debounced (~2s) so a burst of writes (e.g. deposit → wallet txn
  // + payment + invoice) triggers one refetch wave, not a storm (same
  // pattern as the admin Fleet Control list, FC-A2).
  const rtPendingKeys = useRef<Set<string>>(new Set());
  const rtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (rtTimer.current) clearTimeout(rtTimer.current);
  }, []);
  const queueInvalidate = (...keys: string[]) => {
    keys.forEach((k) => rtPendingKeys.current.add(k));
    if (rtTimer.current) clearTimeout(rtTimer.current);
    rtTimer.current = setTimeout(() => {
      rtTimer.current = null;
      // Prefix match on [key, id] so parameterized keys
      // (e.g. ['driver-activity-timeline', id, limit]) are covered too.
      rtPendingKeys.current.forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k, id] }),
      );
      rtPendingKeys.current.clear();
    }, 2_000);
  };
  const matchesDriver = (p: { new: { driver_id?: string }; old: { driver_id?: string } }) =>
    (p.new?.driver_id ?? p.old?.driver_id) === id;
  // Tables limited to what this page actually renders (wallet card, header
  // 360 summary, Paiements/Factures/Documents tabs, KYC card, Activité tab).
  useRealtimePostgresChanges<{ driver_id?: string }>('driver_wallet_transactions', '*', matchesDriver,
    () => queueInvalidate('driver-wallet', 'driver-360', 'driver-activity-timeline'), !!id);
  useRealtimePostgresChanges<{ driver_id?: string }>('payments', '*', matchesDriver,
    () => queueInvalidate('admin-driver-payments', 'driver-activity-timeline'), !!id);
  useRealtimePostgresChanges<{ driver_id?: string }>('invoice', '*', matchesDriver,
    () => queueInvalidate('driver-invoices', 'driver-360', 'driver-activity-timeline'), !!id);
  useRealtimePostgresChanges<{ driver_id?: string }>('driver_score_events', '*', matchesDriver,
    () => queueInvalidate('driver-activity-timeline'), !!id);
  useRealtimePostgresChanges<{ driver_id?: string }>('driver_documents', '*', matchesDriver,
    () => queueInvalidate('driver-documents'), !!id);
  useRealtimePostgresChanges<{ driver_id?: string }>('kyc_submissions', '*', matchesDriver,
    () => queueInvalidate('admin-driver-kyc', 'driver-360', 'admin-driver-detail'), !!id);
  useRealtimePostgresChanges<{ driver_id?: string }>('rentals', '*', matchesDriver,
    () => queueInvalidate('admin-driver-rentals-full', 'driver-360', 'admin-driver-detail', 'driver-ops-payments'), !!id);
  useRealtimePostgresChanges<{ driver_id?: string }>('vehicle_inspections', '*', matchesDriver,
    () => queueInvalidate('driver-fleet-controls', 'driver-360', 'driver-ops-inspections'), !!id);
  useRealtimePostgresChanges<{ driver_id?: string }>('traffic_violations', '*', matchesDriver,
    () => queueInvalidate('driver-violations', 'driver-risk', 'driver-activity-timeline'), !!id);
  useRealtimePostgresChanges<{ driver_id?: string }>('driver_notes', '*', matchesDriver,
    () => queueInvalidate('driver-notes', 'driver-activity-timeline'), !!id);
  useRealtimePostgresChanges<{ driver_id?: string }>('driver_audit', '*', matchesDriver,
    () => queueInvalidate('driver-audit', 'driver-activity-timeline'), !!id);

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

        <div className="mb-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/admin/drivers')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Retour aux conducteurs</span>
            <span className="sm:hidden">Retour</span>
          </Button>
        </div>

        <DriverOperationsHub
          driver={driver}
          onEdit={() => setShowEditDialog(true)}
          onAssignVehicle={() => setShowAssignVehicleDialog(true)}
          onSendMessage={() => setShowMessageDialog(true)}
          onGenerateInvoice={() => setShowInvoiceDialog(true)}
          actionMenu={(
            <DriverActionsMenu
              driverId={driver.id}
              driverName={driver.full_name}
              driverStatus={driver.driver_status}
              onChanged={() => { refetch(); }}
            />
          )}
        />
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

      {/* KYC Details Card - Show when pending or has submission */}
      {kycSubmission && (
        <Card ref={kycCardRef} className={`mb-6 scroll-mt-20 ${driver.kyc_status === 'pending' ? 'border-amber-500/50 bg-amber-500/5' : ''}`}>
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
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-medium text-sm text-muted-foreground">Compte mobile</h4>
                  {!kycSubmission.bank_account_number?.trim() && (
                    <Badge className="gap-1 border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15">
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      Mobile Money non renseigné
                    </Badge>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Opérateur:</span>
                    <span className="font-medium">{kycSubmission.bank_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Numéro mobile:</span>
                    {kycSubmission.bank_account_number?.trim() ? (
                      <span className="font-medium font-mono">{kycSubmission.bank_account_number}</span>
                    ) : (
                      <span className="font-medium text-muted-foreground">Non renseigné</span>
                    )}
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

      {/* Tabs for detailed info */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="finance">Finance</TabsTrigger>
            <TabsTrigger value="vehicle">Vehicle</TabsTrigger>
            <TabsTrigger value="fleet-control">Fleet Control</TabsTrigger>
            <TabsTrigger value="risk">Risk</TabsTrigger>
            <TabsTrigger value="growth">Growth</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleAddNote}>
              Ajouter note
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Exporter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportCSV}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Scores en CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPDF}>
                  <FileText className="h-4 w-4 mr-2" />
                  Rapport complet PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Vue d'ensemble Tab — CH-P1 */}
        <TabsContent value="overview">
          <DriverOverviewPanel
            driverId={driver.id}
            onAssignVehicle={() => setShowAssignVehicleDialog(true)}
            onVerifyKyc={scrollToKycCard}
          />
        </TabsContent>

        {/* Risk Tab: score, contraventions, and sinistres */}
        <TabsContent value="risk" className="space-y-4">
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

        {/* Finance Tab: wallet, invoices, payments, and income */}
        <TabsContent value="finance" className="space-y-4">
          <div ref={walletCardRef} className="scroll-mt-20">
            <DriverWalletCard driverId={driver.id} />
          </div>
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

        {/* Vehicle Tab — CH-P6: full history + admin return action */}
        <TabsContent value="vehicle">
          <DriverRentalsPanel driverId={driver.id} driverName={driver.full_name} />
        </TabsContent>

        {/* Growth Tab: applications and ownership path */}
        <TabsContent value="growth">
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

        {/* Finance Tab — income */}
        <TabsContent value="finance">
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

        {/* Finance Tab — invoices */}
        <TabsContent value="finance">
          <DriverInvoicesPanel driverId={driver.id} />
        </TabsContent>

        {/* Fleet Control Tab — CH-P2 */}
        <TabsContent value="fleet-control">
          <DriverFleetControlPanel driverId={driver.id} />
        </TabsContent>

        {/* Risk Tab — contraventions (distinct from support "Tickets", D-1) */}
        <TabsContent value="risk">
          <DriverViolationsPanel
            driverId={driver.id}
            driverName={driver.full_name}
            customerId={(driver as { customer_id?: string | null }).customer_id ?? null}
          />
        </TabsContent>

        {/* Risk Tab — sinistres */}
        <TabsContent value="risk">
          <DriverAccidentsPanel driverId={driver.id} />
        </TabsContent>

        {/* Activity Tab — support tickets */}
        <TabsContent value="activity">
          <DriverTicketsPanel driverId={driver.id} />
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <DriverDocumentsPanel driverId={driver.id} customerId={(driver as { customer_id?: string | null }).customer_id ?? null} />
        </TabsContent>

        {/* Activity Tab — notes */}
        <TabsContent value="activity">
          <DriverNotesPanel
            driverId={driver.id}
            customerId={(driver as { customer_id?: string | null }).customer_id ?? null}
            focusToken={notesFocusToken}
          />
        </TabsContent>

        {/* Activity Tab — audit */}
        <TabsContent value="activity">
          <DriverAuditPanel driverId={driver.id} />
        </TabsContent>

        {/* Activity Tab — unified timeline */}
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
            profile_image_url: driver.profile_image_url ?? null,
            driver_status: driver.driver_status ?? 'active',
            active_vehicle_id: driver.active_vehicle_id ?? null,
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
          onAssigned={() => {
            queryClient.invalidateQueries({ queryKey: ['admin-driver-detail', driver.id] });
            queryClient.invalidateQueries({ queryKey: ['driver-360', driver.id] });
            queryClient.invalidateQueries({ queryKey: ['admin-driver-rentals-full', driver.id] });
            queryClient.invalidateQueries({ queryKey: ['driver-fleet-controls', driver.id] });
            queryClient.invalidateQueries({ queryKey: ['driver-ops-inspections', driver.id] });
            queryClient.invalidateQueries({ queryKey: ['driver-ops-payments', driver.id] });
            queryClient.invalidateQueries({ queryKey: ['admin-drivers'] });
            refetch();
          }}
        />
      )}

      {/* CH-P5 — "Envoyer message" quick action */}
      {driver && (
        <SendDriverMessageDialog
          open={showMessageDialog}
          onOpenChange={setShowMessageDialog}
          driverId={driver.id}
          driverName={driver.full_name}
          customerId={(driver as { customer_id?: string | null }).customer_id ?? null}
        />
      )}

      {/* CH-P5 — "Créer facture" quick action (generate-invoice flow, prefilled driver) */}
      {driver && (
        <CreateInvoiceDialog
          open={showInvoiceDialog}
          onOpenChange={setShowInvoiceDialog}
          driverId={driver.id}
          driverName={driver.full_name}
          customerId={(driver as { customer_id?: string | null }).customer_id ?? null}
        />
      )}

    </AdminLayout>
  );
}
