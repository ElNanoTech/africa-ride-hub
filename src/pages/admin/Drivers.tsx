import { useState, useRef, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNavigate } from 'react-router-dom';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ListPageSkeleton } from '@/components/AdminSkeletons';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TierBadge } from '@/components/ScoreGauge';
import { ADMIN, KYC, UI } from '@/lib/i18n';
import { Search, Eye, CheckCircle, XCircle, MoreHorizontal, Download, FileSpreadsheet, FileText, Upload, AlertCircle, Loader2, FileCheck, X, UserPlus } from 'lucide-react';
import { AdminCreateDriverDialog } from '@/components/AdminCreateDriverDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { formatDateShort } from '@/lib/format';
import { useDrivers, useUpdateDriverStatus, useBulkUpdateKycStatus } from '@/hooks/useAdminData';
import { logAction } from '@/hooks/useAuditLog';
import { exportToCSV, exportDriversListToPDF } from '@/lib/export';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/routeClient';
import { useAdminUser } from '@/hooks/useAdminUser';
import { useQueryClient } from '@tanstack/react-query';
import { KycReviewModal } from '@/components/KycReviewModal';
import { KycAnalytics } from '@/components/KycAnalytics';
import { GPSDriversList } from '@/components/GPSDriversList';
import { Users as UsersIcon, Satellite } from 'lucide-react';

interface ImportRow {
  yango_driver_id: string;
  full_name: string;
  phone_number: string;
  email?: string;
  pin?: string;
}

interface ImportCredential {
  full_name: string;
  phone_number: string;
  pin: string;
  pin_generated: boolean;
}

interface ImportResult {
  success: boolean;
  imported: number;
  errors: Array<{ row: number; error: string }>;
  credentials?: ImportCredential[];
}

const getKycBadgeVariant = (status: string) => {
  switch (status) {
    case 'verified': return 'verified';
    case 'pending': return 'pending';
    case 'rejected': return 'rejected';
    case 'not_submitted': return 'outline';
    default: return 'default';
  }
};

const getKycLabel = (status: string) => {
  switch (status) {
    case 'verified': return KYC.STATUS_VERIFIED;
    case 'pending': return KYC.STATUS_PENDING;
    case 'rejected': return KYC.STATUS_REJECTED;
    case 'not_submitted': return 'Non soumis';
    default: return status;
  }
};

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'active': return 'active';
    case 'suspended': return 'rejected';
    case 'inactive': return 'pending';
    default: return 'default';
  }
};

export default function AdminDrivers() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { customerId } = useAdminUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [search, setSearch] = useState('');
  const [kycFilter, setKycFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  
  // Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importData, setImportData] = useState<ImportRow[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  
  // KYC Review Modal state
  const [kycReviewDriver, setKycReviewDriver] = useState<typeof drivers extends (infer T)[] ? T : never | null>(null);
  const [showKycReviewModal, setShowKycReviewModal] = useState(false);
  const [showCreateDriver, setShowCreateDriver] = useState(false);

  const { data: drivers, isLoading } = useDrivers();
  const updateStatus = useUpdateDriverStatus();
  const bulkUpdateKyc = useBulkUpdateKycStatus();

  // Real-time subscription for KYC submissions
  useEffect(() => {
    const channel = supabase
      .channel('kyc-submissions-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kyc_submissions',
        },
        (payload) => {
          // Refresh drivers data when KYC submissions change
          queryClient.invalidateQueries({ queryKey: ['admin-drivers'] });
          queryClient.invalidateQueries({ queryKey: ['admin-kyc'] });
          queryClient.invalidateQueries({ queryKey: ['pending-kyc-count'] });
          
          if (payload.eventType === 'INSERT') {
            toast.info('📄 Nouvelle soumission KYC reçue!', {
              description: 'Un conducteur vient de soumettre ses documents.',
              action: {
                label: 'Voir',
                onClick: () => setKycFilter('submitted'),
              },
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
  
  const handleOpenKycReview = (driver: any) => {
    setKycReviewDriver(driver);
    setShowKycReviewModal(true);
  };

  const handleViewDriver = (driverId: string) => {
    navigate(`/admin/drivers/${driverId}`);
  };

  const filteredDrivers = (drivers || []).filter((driver) => {
    const matchesSearch = driver.full_name.toLowerCase().includes(search.toLowerCase()) ||
                         driver.phone_number.includes(search);
    let matchesKyc = true;
    if (kycFilter === 'all') {
      matchesKyc = true;
    } else if (kycFilter === 'submitted') {
      // Show drivers with pending KYC submissions (actually submitted, waiting for review)
      matchesKyc = driver.latestKycSubmission?.status === 'pending';
    } else {
      matchesKyc = driver.kyc_status === kycFilter;
    }
    const matchesStatus = statusFilter === 'all' || driver.driver_status === statusFilter;
    return matchesSearch && matchesKyc && matchesStatus;
  });

  // Get drivers with pending KYC submissions (actually submitted) from filtered list
  const pendingKycDrivers = filteredDrivers.filter(d => 
    d.latestKycSubmission?.status === 'pending'
  );
  const selectedPendingKycDrivers = selectedDrivers.filter(id => 
    pendingKycDrivers.some(d => d.id === id)
  );

  // Calculate filter counts (based on all drivers, not filtered)
  const filterCounts = {
    kyc: {
      all: drivers?.length || 0,
      submitted: drivers?.filter(d => d.latestKycSubmission?.status === 'pending').length || 0,
      verified: drivers?.filter(d => d.kyc_status === 'verified').length || 0,
      pending: drivers?.filter(d => d.kyc_status === 'pending').length || 0,
      rejected: drivers?.filter(d => d.kyc_status === 'rejected').length || 0,
    },
    status: {
      all: drivers?.length || 0,
      active: drivers?.filter(d => d.driver_status === 'active').length || 0,
      suspended: drivers?.filter(d => d.driver_status === 'suspended').length || 0,
      inactive: drivers?.filter(d => d.driver_status === 'inactive').length || 0,
    }
  };

  const handleStatusUpdate = (driverId: string, status: string) => {
    updateStatus.mutate({ driverId, status });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedDrivers(pendingKycDrivers.map(d => d.id));
    } else {
      setSelectedDrivers([]);
    }
  };

  const handleSelectDriver = (driverId: string, checked: boolean) => {
    if (checked) {
      setSelectedDrivers(prev => [...prev, driverId]);
    } else {
      setSelectedDrivers(prev => prev.filter(id => id !== driverId));
    }
  };

  const handleBulkApprove = () => {
    if (selectedPendingKycDrivers.length === 0) return;
    
    bulkUpdateKyc.mutate(
      { driverIds: selectedPendingKycDrivers, status: 'verified' },
      {
        onSuccess: () => {
          selectedPendingKycDrivers.forEach(driverId => {
            logAction({
              action: 'kyc_approved',
              targetType: 'driver',
              targetId: driverId,
              details: { bulk: true },
            });
          });
          setSelectedDrivers([]);
        },
      }
    );
  };

  const handleBulkReject = () => {
    if (selectedPendingKycDrivers.length === 0) return;
    setShowRejectModal(true);
  };

  const confirmBulkReject = () => {
    if (!rejectionReason.trim()) return;
    
    bulkUpdateKyc.mutate(
      { 
        driverIds: selectedPendingKycDrivers, 
        status: 'rejected',
        rejectionReason: rejectionReason.trim(),
      },
      {
        onSuccess: () => {
          selectedPendingKycDrivers.forEach(driverId => {
            logAction({
              action: 'kyc_rejected',
              targetType: 'driver',
              targetId: driverId,
              details: { bulk: true, reason: rejectionReason.trim() },
            });
          });
          setSelectedDrivers([]);
          setShowRejectModal(false);
          setRejectionReason('');
        },
      }
    );
  };

  const getFiltersDescription = () => {
    const filters: string[] = [];
    if (kycFilter !== 'all') filters.push(`KYC: ${getKycLabel(kycFilter)}`);
    if (statusFilter !== 'all') filters.push(`Statut: ${statusFilter}`);
    if (search) filters.push(`Recherche: "${search}"`);
    return filters.length > 0 ? filters.join(', ') : 'Aucun filtre';
  };

  const handleExportCSV = () => {
    if (filteredDrivers.length === 0) {
      toast.error('Aucune donnée à exporter');
      return;
    }

    const csvData = filteredDrivers.map(driver => ({
      nom: driver.full_name,
      telephone: driver.phone_number,
      kyc: getKycLabel(driver.kyc_status),
      score: driver.score || '-',
      niveau: driver.tier || 'E',
      statut: driver.driver_status === 'active' ? 'Actif' : driver.driver_status === 'suspended' ? 'Suspendu' : 'Inactif',
      inscrit_le: formatDateShort(new Date(driver.created_at)),
    }));

    const headers = {
      nom: 'Nom',
      telephone: 'Téléphone',
      kyc: 'Statut KYC',
      score: 'Score',
      niveau: 'Niveau',
      statut: 'Statut',
      inscrit_le: 'Inscrit le',
    };

    exportToCSV(csvData, `conducteurs_${new Date().toISOString().split('T')[0]}`, headers);
    toast.success('Export CSV téléchargé');
  };

  const handleExportPDF = () => {
    if (filteredDrivers.length === 0) {
      toast.error('Aucune donnée à exporter');
      return;
    }

    const pdfData = filteredDrivers.map(driver => ({
      name: driver.full_name,
      phone: driver.phone_number,
      kycStatus: getKycLabel(driver.kyc_status),
      score: driver.score || '-',
      tier: driver.tier || 'E',
      status: driver.driver_status === 'active' ? 'Actif' : driver.driver_status === 'suspended' ? 'Suspendu' : 'Inactif',
      createdAt: formatDateShort(new Date(driver.created_at)),
    }));

    exportDriversListToPDF(
      {
        title: 'Liste des Conducteurs',
        generatedAt: new Date(),
        filters: getFiltersDescription(),
        drivers: pdfData,
      },
      `conducteurs_${new Date().toISOString().split('T')[0]}`
    );
    toast.success('Export PDF téléchargé');
  };

  // CSV Import functions
  const parseCSV = (text: string): { rows: ImportRow[]; errors: string[] } => {
    const lines = text.split('\n').filter(line => line.trim());
    const errors: string[] = [];
    const rows: ImportRow[] = [];

    if (lines.length < 2) {
      errors.push('Le fichier doit contenir au moins une ligne d\'en-tête et une ligne de données');
      return { rows, errors };
    }

    // Parse header
    const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
    const yangoIdx = header.findIndex(h => h.includes('yango') || h.includes('id_yango') || h === 'yango_driver_id');
    const nameIdx = header.findIndex(h => h.includes('nom') || h === 'full_name' || h === 'name');
    const phoneIdx = header.findIndex(h => h.includes('phone') || h.includes('tel') || h === 'phone_number');
    const emailIdx = header.findIndex(h => h.includes('email') || h === 'e-mail');
    const pinIdx = header.findIndex(h => h === 'pin' || h === 'code_pin' || h === 'codepin');

    if (yangoIdx === -1) errors.push('Colonne "yango_driver_id" ou "id_yango" non trouvée');
    if (nameIdx === -1) errors.push('Colonne "full_name" ou "nom" non trouvée');
    if (phoneIdx === -1) errors.push('Colonne "phone_number" ou "telephone" non trouvée');

    if (errors.length > 0) return { rows, errors };

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      if (values.length < Math.max(yangoIdx, nameIdx, phoneIdx) + 1) {
        errors.push(`Ligne ${i + 1}: Données manquantes`);
        continue;
      }

      const rawPin = pinIdx !== -1 ? values[pinIdx]?.trim() : '';
      if (rawPin && !/^\d{4}$/.test(rawPin)) {
        errors.push(`Ligne ${i + 1}: PIN invalide (4 chiffres requis ou laisser vide)`);
        continue;
      }

      const row: ImportRow = {
        yango_driver_id: values[yangoIdx],
        full_name: values[nameIdx],
        phone_number: values[phoneIdx],
        email: emailIdx !== -1 ? values[emailIdx] : undefined,
        pin: rawPin || undefined,
      };

      if (!row.yango_driver_id || !row.full_name || !row.phone_number) {
        errors.push(`Ligne ${i + 1}: Champs requis manquants`);
        continue;
      }

      rows.push(row);
    }

    return { rows, errors };
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Veuillez sélectionner un fichier CSV');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { rows, errors } = parseCSV(text);
      setImportData(rows);
      setImportErrors(errors);
      setImportResult(null);
      setShowImportModal(true);
    };
    reader.readAsText(file);

    // Reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImport = async () => {
    if (importData.length === 0) return;

    setIsImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('import-drivers', {
        body: { drivers: importData, customerId: customerId ?? undefined },
      });

      if (error) throw error;

      setImportResult(data as ImportResult);
      
      if (data.imported > 0) {
        queryClient.invalidateQueries({ queryKey: ['admin-drivers'] });
        toast.success(`${data.imported} conducteur(s) importé(s)`);
        
        logAction({
          action: 'drivers_imported',
          targetType: 'driver',
          details: { count: data.imported },
        });
      }

      if (data.errors?.length > 0) {
        toast.warning(`${data.errors.length} erreur(s) lors de l'import`);
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Erreur lors de l\'import');
    } finally {
      setIsImporting(false);
    }
  };

  const downloadTemplate = () => {
    // pin column is OPTIONAL — leave empty to auto-generate a secure 4-digit PIN
    const template =
      '# pin est optionnel: laisser vide pour générer automatiquement un PIN à 4 chiffres\n' +
      'yango_driver_id,full_name,phone_number,email,pin\n' +
      'YANGO001,Jean Dupont,+2250701020304,jean@example.com,1947\n' +
      'YANGO002,Marie Diallo,+2250705060708,,';
    const blob = new Blob(['\uFEFF' + template], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template_conducteurs.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Modèle téléchargé');
  };

  const downloadCredentialsSheet = (credentials: ImportCredential[]) => {
    if (!credentials || credentials.length === 0) return;
    const escape = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
    const rows = [
      'nom,telephone,pin,pin_genere',
      ...credentials.map(c =>
        [escape(c.full_name), escape(c.phone_number), escape(c.pin), c.pin_generated ? 'oui' : 'non'].join(','),
      ),
    ];
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `identifiants_conducteurs_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Feuille d\'identifiants téléchargée');
  };

  const allPendingSelected = pendingKycDrivers.length > 0 &&
    pendingKycDrivers.every(d => selectedDrivers.includes(d.id));
  const somePendingSelected = pendingKycDrivers.some(d => selectedDrivers.includes(d.id));

  // Show skeleton while initial data loads
  if (isLoading) {
    return (
      <AdminLayout>
        <AdminBreadcrumb items={[{ label: 'Conducteurs' }]} />
        <ListPageSkeleton columns={7} rows={8} />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Conducteurs' }]} />
      
      <input
        type="file"
        ref={fileInputRef}
        accept=".csv"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      <AdminPageHeader 
        title={ADMIN.DRIVERS.TITLE}
        description={`${drivers?.length || 0} conducteurs enregistrés`}
        action={
          <div className="flex gap-2">
            <Button size="sm" className="gap-2" onClick={() => navigate('/admin/drivers/new')}>
              <UserPlus className="h-4 w-4" />
              Nouveau conducteur
            </Button>
            <Button size="sm" variant="ghost" className="gap-2 hidden sm:inline-flex" onClick={() => setShowCreateDriver(true)} title="Création rapide (ancien formulaire)">
              Rapide
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Importer
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="h-4 w-4" />
                  Exporter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover z-50">
                <DropdownMenuLabel>Format d'export</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportCSV} className="cursor-pointer">
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Exporter en CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPDF} className="cursor-pointer">
                  <FileText className="h-4 w-4 mr-2" />
                  Exporter en PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <Tabs defaultValue="drivers" className="mb-6">
        <TabsList>
          <TabsTrigger value="drivers" className="gap-2">
            <UsersIcon className="h-4 w-4" />
            Conducteurs DAM
          </TabsTrigger>
          <TabsTrigger value="gps" className="gap-2">
            <Satellite className="h-4 w-4" />
            Conducteurs GPS
          </TabsTrigger>
        </TabsList>

        <TabsContent value="drivers" className="mt-6">
      {/* KYC Analytics */}
      <KycAnalytics onFilterPending={() => setKycFilter('pending')} />

      {/* Bulk Actions Bar */}
      {selectedPendingKycDrivers.length > 0 && (
        <Card className="mb-4 border-primary/50 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {selectedPendingKycDrivers.length} conducteur(s) avec KYC en attente sélectionné(s)
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleBulkApprove}
                  disabled={bulkUpdateKyc.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approuver tout
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkReject}
                  disabled={bulkUpdateKyc.isPending}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Rejeter tout
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedDrivers([])}
                >
                  Annuler
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={ADMIN.DRIVERS.SEARCH_PLACEHOLDER}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={kycFilter} onValueChange={setKycFilter}>
              <SelectTrigger className={`w-full sm:w-44 ${kycFilter !== 'all' ? 'border-primary ring-1 ring-primary/20' : ''}`}>
                <SelectValue placeholder="KYC Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous KYC ({filterCounts.kyc.all})</SelectItem>
                <SelectItem value="submitted">📄 À réviser ({filterCounts.kyc.submitted})</SelectItem>
                <SelectItem value="verified">{KYC.STATUS_VERIFIED} ({filterCounts.kyc.verified})</SelectItem>
                <SelectItem value="pending">{KYC.STATUS_PENDING} ({filterCounts.kyc.pending})</SelectItem>
                <SelectItem value="rejected">{KYC.STATUS_REJECTED} ({filterCounts.kyc.rejected})</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className={`w-full sm:w-44 ${statusFilter !== 'all' ? 'border-primary ring-1 ring-primary/20' : ''}`}>
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts ({filterCounts.status.all})</SelectItem>
                <SelectItem value="active">Actif ({filterCounts.status.active})</SelectItem>
                <SelectItem value="suspended">Suspendu ({filterCounts.status.suspended})</SelectItem>
                <SelectItem value="inactive">Inactif ({filterCounts.status.inactive})</SelectItem>
              </SelectContent>
            </Select>
            {(search || kycFilter !== 'all' || statusFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setKycFilter('all');
                  setStatusFilter('all');
                }}
                className="gap-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
                Effacer filtres
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={allPendingSelected}
                    onCheckedChange={handleSelectAll}
                    aria-label="Sélectionner tous les KYC en attente"
                    className={somePendingSelected && !allPendingSelected ? 'opacity-50' : ''}
                  />
                </TableHead>
                <TableHead>Conducteur</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead>KYC</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Niveau</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Inscrit le</TableHead>
                <TableHead className="w-12">{UI.ACTIONS}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-8" /></TableCell>
                  </TableRow>
                ))
              ) : filteredDrivers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Aucun conducteur trouvé
                  </TableCell>
                </TableRow>
              ) : (
                filteredDrivers.map((driver) => (
                  <TableRow 
                    key={driver.id} 
                    className={`cursor-pointer hover:bg-muted/50 ${selectedDrivers.includes(driver.id) ? 'bg-primary/5' : ''}`}
                    onClick={(e) => {
                      // Don't navigate if clicking on checkbox or actions
                      const target = e.target as HTMLElement;
                      if (target.closest('button') || target.closest('[role="checkbox"]')) return;
                      handleViewDriver(driver.id);
                    }}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {driver.latestKycSubmission?.status === 'pending' ? (
                        <Checkbox
                          checked={selectedDrivers.includes(driver.id)}
                          onCheckedChange={(checked) => handleSelectDriver(driver.id, !!checked)}
                          aria-label={`Sélectionner ${driver.full_name} pour action KYC groupée`}
                        />
                      ) : (
                        <span className="sr-only">Pas de KYC en attente</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{driver.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{driver.phone_number}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={getKycBadgeVariant(driver.kyc_status) as never}>
                          {getKycLabel(driver.kyc_status)}
                        </Badge>
                        {driver.latestKycSubmission && (
                          <span className="text-xs text-muted-foreground">
                            Soumis le {formatDateShort(new Date(driver.latestKycSubmission.submitted_at))}
                          </span>
                        )}
                        {!driver.latestKycSubmission && driver.kyc_status === 'pending' && (
                          <span className="text-xs text-muted-foreground italic">
                            Non soumis
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold">{driver.score || '-'}</TableCell>
                    <TableCell>
                      <TierBadge tier={driver.tier || 'E'} size="sm" showLabel={false} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(driver.driver_status) as never}>
                        {driver.driver_status === 'active' ? 'Actif' : driver.driver_status === 'suspended' ? 'Suspendu' : 'Inactif'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateShort(new Date(driver.created_at))}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewDriver(driver.id)}>
                            <Eye className="h-4 w-4 mr-2" />
                            {UI.VIEW}
                          </DropdownMenuItem>
                          {driver.latestKycSubmission?.status === 'pending' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-xs text-muted-foreground">KYC Actions</DropdownMenuLabel>
                              <DropdownMenuItem 
                                className="text-primary"
                                onClick={() => handleOpenKycReview(driver)}
                              >
                                <FileCheck className="h-4 w-4 mr-2" />
                                Réviser KYC
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          {driver.driver_status === 'active' ? (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleStatusUpdate(driver.id, 'suspended')}
                            >
                              {ADMIN.DRIVERS.SUSPEND}
                            </DropdownMenuItem>
                          ) : driver.kyc_status !== 'verified' ? (
                            // B7 — Block activation when KYC not verified
                            <DropdownMenuItem
                              className="text-muted-foreground"
                              disabled
                              onSelect={(e) => e.preventDefault()}
                              title="KYC requis avant activation."
                            >
                              {ADMIN.DRIVERS.ACTIVATE} (KYC requis)
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem 
                              className="text-primary"
                              onClick={() => handleStatusUpdate(driver.id, 'active')}
                            >
                              {ADMIN.DRIVERS.ACTIVATE}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="gps" className="mt-6">
          <GPSDriversList />
        </TabsContent>
      </Tabs>

      {/* Bulk Rejection Modal */}
      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeter les KYC sélectionnés</DialogTitle>
            <DialogDescription>
              Vous allez rejeter {selectedPendingKycDrivers.length} soumission(s) KYC. 
              Veuillez indiquer la raison du rejet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rejection-reason">Raison du rejet</Label>
              <Textarea
                id="rejection-reason"
                placeholder="Ex: Documents illisibles, informations incomplètes..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectModal(false)}>
              Annuler
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmBulkReject}
              disabled={!rejectionReason.trim() || bulkUpdateKyc.isPending}
            >
              {bulkUpdateKyc.isPending ? 'Rejet en cours...' : 'Confirmer le rejet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Modal */}
      <Dialog open={showImportModal} onOpenChange={(open) => {
        setShowImportModal(open);
        if (!open) {
          setImportData([]);
          setImportErrors([]);
          setImportResult(null);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importer des conducteurs</DialogTitle>
            <DialogDescription>
              Importez des conducteurs depuis un fichier CSV. Colonnes: yango_driver_id, full_name,
              phone_number, email (optionnel), pin (optionnel — généré automatiquement si vide).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Template download */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="text-sm">
                <p className="font-medium">Télécharger le modèle CSV</p>
                <p className="text-muted-foreground">Utilisez ce modèle pour formater vos données</p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Modèle
              </Button>
            </div>

            {/* Parsing errors */}
            {importErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium mb-1">Erreurs de format:</p>
                  <ul className="list-disc list-inside text-sm">
                    {importErrors.slice(0, 5).map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                    {importErrors.length > 5 && (
                      <li>...et {importErrors.length - 5} autre(s) erreur(s)</li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Import result */}
            {importResult && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium mb-1">
                    {importResult.imported} conducteur(s) importé(s) avec succès
                  </p>
                  {importResult.credentials && importResult.credentials.length > 0 && (
                    <div className="mt-3 p-3 rounded-md border bg-muted/50">
                      <p className="text-sm font-medium mb-1">📋 Identifiants prêts à partager</p>
                      <p className="text-xs text-muted-foreground mb-2">
                        Téléchargez la feuille avec téléphone + PIN pour chaque conducteur,
                        puis envoyez-leur via WhatsApp ou SMS.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadCredentialsSheet(importResult.credentials!)}
                        className="gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Télécharger les identifiants ({importResult.credentials.length})
                      </Button>
                    </div>
                  )}
                  {importResult.errors.length > 0 && (
                    <>
                      <p className="text-sm text-muted-foreground mt-3 mb-1">
                        {importResult.errors.length} erreur(s):
                      </p>
                      <ul className="list-disc list-inside text-sm">
                        {importResult.errors.slice(0, 5).map((error, i) => (
                          <li key={i}>Ligne {error.row}: {error.error}</li>
                        ))}
                        {importResult.errors.length > 5 && (
                          <li>...et {importResult.errors.length - 5} autre(s)</li>
                        )}
                      </ul>
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Preview table */}
            {importData.length > 0 && !importResult && (
              <div className="space-y-2">
                <Label>Aperçu des données ({importData.length} conducteur(s))</Label>
                <ScrollArea className="h-48 rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID Yango</TableHead>
                        <TableHead>Nom</TableHead>
                        <TableHead>Téléphone</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>PIN</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importData.slice(0, 10).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{row.yango_driver_id}</TableCell>
                          <TableCell>{row.full_name}</TableCell>
                          <TableCell>{row.phone_number}</TableCell>
                          <TableCell className="text-muted-foreground">{row.email || '-'}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.pin || <span className="text-muted-foreground italic">auto</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                      {importData.length > 10 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            ...et {importData.length - 10} autre(s) conducteur(s)
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportModal(false)}>
              {importResult ? 'Fermer' : 'Annuler'}
            </Button>
            {!importResult && (
              <Button 
                onClick={handleImport}
                disabled={importData.length === 0 || isImporting}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Import en cours...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Importer {importData.length} conducteur(s)
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KYC Review Modal */}
      <KycReviewModal 
        open={showKycReviewModal}
        onOpenChange={setShowKycReviewModal}
        driver={kycReviewDriver}
      />

      {/* Create Driver Modal */}
      <AdminCreateDriverDialog
        open={showCreateDriver}
        onOpenChange={setShowCreateDriver}
        onViewProfile={(driverId) => {
          setShowCreateDriver(false);
          navigate(`/admin/drivers/${driverId}`);
        }}
      />
    </AdminLayout>
  );
}
