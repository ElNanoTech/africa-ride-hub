import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Banknote,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  User,
  Calendar,
  AlertTriangle,
  FileText,
  ChevronDown,
  Eye,
  Image,
  ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { format, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAdminAuth } from '@/hooks/useAdminAuth';

interface IncomeRecord {
  id: string;
  driver_id: string;
  record_date: string;
  gross_income: number;
  net_income: number;
  trip_count: number;
  source: string;
  status: string | null;
  raw_data: any;
  synced_at: string;
  proof_url: string | null;
  driver: {
    id: string;
    full_name: string;
    phone_number: string;
  } | null;
}

export default function IncomeApprovals() {
  const queryClient = useQueryClient();
  const { adminUser } = useAdminAuth();
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());
  const [reviewDialog, setReviewDialog] = useState<{ open: boolean; record: IncomeRecord | null; action: 'approve' | 'reject' }>({
    open: false,
    record: null,
    action: 'approve'
  });
  const [proofDialog, setProofDialog] = useState<{ open: boolean; url: string | null }>({
    open: false,
    url: null
  });
  const [rejectionReason, setRejectionReason] = useState('');

  // Fetch income records with driver info
  const { data: incomeRecords, isLoading } = useQuery({
    queryKey: ['income-approvals', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('income_records')
        .select(`
          *,
          driver:drivers(id, full_name, phone_number)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data as IncomeRecord[];
    },
  });

  // Get anomaly indicators
  const getAnomalies = (record: IncomeRecord): string[] => {
    const anomalies: string[] = [];
    
    if (record.gross_income > 50000) {
      anomalies.push('Montant élevé');
    }
    if (record.net_income > record.gross_income) {
      anomalies.push('Net > Brut');
    }
    if (record.trip_count && record.gross_income / record.trip_count > 5000) {
      anomalies.push('Revenu/course élevé');
    }
    const daysSinceCreated = differenceInDays(new Date(), new Date(record.synced_at));
    if (daysSinceCreated > 7) {
      anomalies.push('Déclaration tardive');
    }
    
    return anomalies;
  };

  // Get signed URL for proof image
  const getProofUrl = async (path: string): Promise<string | null> => {
    const { data, error } = await supabase.storage
      .from('income-proofs')
      .createSignedUrl(path, 3600); // 1 hour expiry
    
    if (error) {
      console.error('Error getting signed URL:', error);
      return null;
    }
    
    return data.signedUrl;
  };

  // Handle viewing proof
  const handleViewProof = async (proofPath: string) => {
    const url = await getProofUrl(proofPath);
    if (url) {
      setProofDialog({ open: true, url });
    } else {
      toast.error('Impossible de charger la preuve');
    }
  };

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (recordIds: string[]) => {
      const { error } = await supabase
        .from('income_records')
        .update({
          status: 'approved',
          reviewed_by: adminUser?.id,
          reviewed_at: new Date().toISOString(),
          trust_weight: 0.7, // Driver-declared gets 70% weight
        })
        .in('id', recordIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['income-approvals'] });
      toast.success('Revenus approuvés');
      setSelectedRecords(new Set());
      setReviewDialog({ open: false, record: null, action: 'approve' });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de l\'approbation');
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ recordIds, reason }: { recordIds: string[]; reason: string }) => {
      const { error } = await supabase
        .from('income_records')
        .update({
          status: 'rejected',
          reviewed_by: adminUser?.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .in('id', recordIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['income-approvals'] });
      toast.success('Revenus refusés');
      setSelectedRecords(new Set());
      setRejectionReason('');
      setReviewDialog({ open: false, record: null, action: 'approve' });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors du refus');
    },
  });

  const handleApprove = (recordIds: string[]) => {
    approveMutation.mutate(recordIds);
  };

  const handleReject = (recordIds: string[], reason: string) => {
    if (!reason.trim()) {
      toast.error('Veuillez indiquer une raison de refus');
      return;
    }
    rejectMutation.mutate({ recordIds, reason });
  };

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedRecords);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedRecords(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedRecords.size === filteredRecords.length) {
      setSelectedRecords(new Set());
    } else {
      setSelectedRecords(new Set(filteredRecords.map(r => r.id)));
    }
  };

  const filteredRecords = incomeRecords?.filter(r =>
    r.driver?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.driver?.phone_number?.includes(searchQuery)
  ) || [];

  const pendingCount = incomeRecords?.filter(r => r.status === 'pending').length || 0;

  return (
    <AdminLayout>
      <AdminPageHeader
        title="Approbation des revenus"
        description="Validez les déclarations de revenus des conducteurs"
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card className={pendingCount > 0 ? 'border-amber-500/50' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-xs text-muted-foreground">En attente</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {incomeRecords?.filter(r => r.status === 'approved' && r.source === 'driver_declared').length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Approuvés (déclarés)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {incomeRecords?.filter(r => r.status === 'rejected').length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Refusés</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Banknote className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {(incomeRecords?.filter(r => r.source === 'driver_declared' && r.status === 'approved')
                    .reduce((sum, r) => sum + (r.net_income || 0), 0) || 0).toLocaleString('fr-FR')}
                </p>
                <p className="text-xs text-muted-foreground">Total approuvé (FCFA)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un conducteur..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filtrer par statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="approved">Approuvés</SelectItem>
            <SelectItem value="rejected">Refusés</SelectItem>
            <SelectItem value="all">Tous</SelectItem>
          </SelectContent>
        </Select>

        {/* Bulk Actions */}
        {selectedRecords.size > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{selectedRecords.size} sélectionné(s)</Badge>
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-green-600 border-green-600 hover:bg-green-50"
              onClick={() => handleApprove(Array.from(selectedRecords))}
              disabled={approveMutation.isPending}
            >
              <CheckCircle2 className="h-4 w-4" />
              Approuver
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-red-600 border-red-600 hover:bg-red-50"
              onClick={() => setReviewDialog({ open: true, record: null, action: 'reject' })}
            >
              <XCircle className="h-4 w-4" />
              Refuser
            </Button>
          </div>
        )}
      </div>

      {/* Records Table */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Déclarations de revenus
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredRecords.length > 0 ? (
            <div className="space-y-2">
              {/* Header */}
              <div className="flex items-center gap-4 p-2 text-xs font-medium text-muted-foreground border-b">
                <Checkbox
                  checked={selectedRecords.size === filteredRecords.length && filteredRecords.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <div className="flex-1">Conducteur</div>
                <div className="w-16 text-center">Preuve</div>
                <div className="w-24 text-center">Date</div>
                <div className="w-24 text-right">Montant</div>
                <div className="w-20 text-center">Courses</div>
                <div className="w-24 text-center">Statut</div>
                <div className="w-20">Actions</div>
              </div>

              <AnimatePresence>
                {filteredRecords.map((record, index) => {
                  const anomalies = getAnomalies(record);
                  
                  return (
                    <motion.div
                      key={record.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className={`flex items-center gap-4 p-3 rounded-lg border ${
                        selectedRecords.has(record.id) ? 'bg-primary/5 border-primary/30' : 'bg-card hover:bg-muted/50'
                      } transition-colors`}
                    >
                      <Checkbox
                        checked={selectedRecords.has(record.id)}
                        onCheckedChange={() => toggleSelection(record.id)}
                        disabled={record.status !== 'pending'}
                      />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{record.driver?.full_name}</p>
                          {anomalies.length > 0 && (
                            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{record.driver?.phone_number}</span>
                          {anomalies.length > 0 && (
                            <span className="text-amber-600">{anomalies.join(', ')}</span>
                          )}
                        </div>
                      </div>
                      
                      {/* Proof indicator */}
                      <div className="w-16 text-center">
                        {record.proof_url ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleViewProof(record.proof_url!)}
                          >
                            <Image className="h-4 w-4 text-green-600" />
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </div>
                      
                      <div className="w-24 text-center text-sm">
                        {format(new Date(record.record_date), 'dd/MM/yy')}
                      </div>
                      
                      <div className="w-24 text-right">
                        <p className="font-medium">{record.net_income?.toLocaleString('fr-FR')} F</p>
                        <p className="text-xs text-muted-foreground">{record.gross_income?.toLocaleString('fr-FR')} brut</p>
                      </div>
                      
                      <div className="w-20 text-center text-sm">
                        {record.trip_count || '-'}
                      </div>
                      
                      <div className="w-24 text-center">
                        <Badge
                          variant="secondary"
                          className={`text-xs ${
                            record.status === 'approved' ? 'bg-green-100 text-green-700' :
                            record.status === 'rejected' ? 'bg-red-100 text-red-700' :
                            'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {record.status === 'approved' ? 'Approuvé' :
                           record.status === 'rejected' ? 'Refusé' : 'En attente'}
                        </Badge>
                      </div>
                      
                      <div className="w-20">
                        {record.status === 'pending' ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleApprove([record.id])}
                                className="text-green-600"
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Approuver
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setReviewDialog({ open: true, record, action: 'reject' })}
                                className="text-red-600"
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Refuser
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aucune déclaration à afficher</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rejection Dialog */}
      <Dialog open={reviewDialog.open && reviewDialog.action === 'reject'} onOpenChange={(open) => !open && setReviewDialog({ open: false, record: null, action: 'approve' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Refuser {reviewDialog.record ? 'la déclaration' : `${selectedRecords.size} déclaration(s)`}
            </DialogTitle>
            <DialogDescription>
              Indiquez la raison du refus (sera visible par le conducteur)
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Ex: Montant incohérent avec l'historique, preuve insuffisante..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog({ open: false, record: null, action: 'approve' })}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const ids = reviewDialog.record ? [reviewDialog.record.id] : Array.from(selectedRecords);
                handleReject(ids, rejectionReason);
              }}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? 'Traitement...' : 'Confirmer le refus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Proof Image Dialog */}
      <Dialog open={proofDialog.open} onOpenChange={(open) => setProofDialog({ open, url: open ? proofDialog.url : null })}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              Preuve justificative
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-4">
            {proofDialog.url && (
              proofDialog.url.includes('.pdf') ? (
                <div className="text-center space-y-4">
                  <FileText className="h-16 w-16 mx-auto text-muted-foreground" />
                  <p className="text-muted-foreground">Document PDF</p>
                  <Button asChild>
                    <a href={proofDialog.url} target="_blank" rel="noopener noreferrer" className="gap-2">
                      <ExternalLink className="h-4 w-4" />
                      Ouvrir le PDF
                    </a>
                  </Button>
                </div>
              ) : (
                <img 
                  src={proofDialog.url} 
                  alt="Preuve" 
                  className="max-w-full max-h-[60vh] object-contain rounded-lg"
                />
              )
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProofDialog({ open: false, url: null })}>
              Fermer
            </Button>
            {proofDialog.url && (
              <Button asChild>
                <a href={proofDialog.url} target="_blank" rel="noopener noreferrer" className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Ouvrir en grand
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
