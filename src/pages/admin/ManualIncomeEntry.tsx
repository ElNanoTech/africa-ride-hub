import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Banknote, 
  Plus, 
  Search, 
  Calendar,
  User,
  Car,
  TrendingUp,
  FileText,
  AlertCircle,
  CheckCircle2,
  RefreshCw
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
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Json } from '@/integrations/supabase/types';
import { BulkIncomeImport } from '@/components/BulkIncomeImport';
import { useAdminAuth } from '@/hooks/useAdminAuth';

interface IncomeFormData {
  driver_id: string;
  record_date: string;
  gross_income: number;
  net_income: number;
  trip_count: number;
  source: string;
  notes: string;
}

const defaultFormData: IncomeFormData = {
  driver_id: '',
  record_date: format(new Date(), 'yyyy-MM-dd'),
  gross_income: 0,
  net_income: 0,
  trip_count: 0,
  source: 'manual',
  notes: '',
};

export default function ManualIncomeEntry() {
  const queryClient = useQueryClient();
  const { adminUser } = useAdminAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState<IncomeFormData>(defaultFormData);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Trigger score recalculation
  const handleRecalculateScores = async () => {
    setIsRecalculating(true);
    try {
      const { data, error } = await supabase.functions.invoke('calculate-weekly-scores');
      if (error) throw error;
      toast.success(`Scores recalculés: ${data.processed} conducteurs traités`);
      queryClient.invalidateQueries({ queryKey: ['income-records'] });
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors du recalcul');
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleImportComplete = () => {
    queryClient.invalidateQueries({ queryKey: ['income-records'] });
  };

  // Fetch drivers
  const { data: drivers, isLoading: driversLoading } = useQuery({
    queryKey: ['drivers-for-income'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, full_name, phone_number, yango_driver_id, driver_status')
        .eq('driver_status', 'active')
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch recent income records
  const { data: incomeRecords, isLoading: recordsLoading } = useQuery({
    queryKey: ['income-records', selectedDriverId],
    queryFn: async () => {
      let query = supabase
        .from('income_records')
        .select(`
          *,
          driver:drivers(id, full_name, phone_number)
        `)
        .order('record_date', { ascending: false })
        .limit(50);

      if (selectedDriverId && selectedDriverId !== 'all') {
        query = query.eq('driver_id', selectedDriverId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Create income record mutation
  const createIncome = useMutation({
    mutationFn: async (data: IncomeFormData) => {
      const rawData: Json = { notes: data.notes, entered_by: 'admin' };
      const { data: result, error } = await supabase
        .from('income_records')
        .insert({
          driver_id: data.driver_id,
          record_date: data.record_date,
          gross_income: data.gross_income,
          net_income: data.net_income,
          trip_count: data.trip_count,
          source: data.source,
          raw_data: rawData,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['income-records'] });
      toast.success('Revenu ajouté avec succès');
      setIsCreateDialogOpen(false);
      setFormData(defaultFormData);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erreur lors de l\'ajout');
    },
  });

  const handleSubmit = () => {
    if (!formData.driver_id) {
      toast.error('Veuillez sélectionner un conducteur');
      return;
    }
    if (formData.gross_income <= 0) {
      toast.error('Le revenu brut doit être positif');
      return;
    }

    // Validate date
    const recordDate = new Date(formData.record_date);
    if (isNaN(recordDate.getTime())) {
      toast.error('Date invalide', { description: 'Veuillez saisir une date valide.' });
      return;
    }
    const year = recordDate.getFullYear();
    const today = new Date();
    if (year < 2020 || year > today.getFullYear()) {
      toast.error('Date invalide', { description: 'L\'année doit être entre 2020 et aujourd\'hui.' });
      return;
    }
    if (recordDate > today) {
      toast.error('Date invalide', { description: 'Vous ne pouvez pas saisir un revenu pour une date future.' });
      return;
    }
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    if (recordDate < ninetyDaysAgo) {
      toast.error('Date trop ancienne', { description: 'Limite de 90 jours dans le passé.' });
      return;
    }

    // Net income cannot exceed gross
    if (formData.net_income > formData.gross_income) {
      toast.error('Revenu net invalide', { description: 'Le revenu net ne peut pas dépasser le revenu brut.' });
      return;
    }

    // Trip count required
    if (formData.trip_count <= 0) {
      toast.error('Nombre de courses requis', { description: 'Indiquez au moins 1 course.' });
      return;
    }

    createIncome.mutate(formData);
  };

  // Calculate net income automatically
  const handleGrossIncomeChange = (value: number) => {
    // Default: net = 80% of gross (20% commission)
    const netIncome = Math.round(value * 0.8);
    setFormData(prev => ({
      ...prev,
      gross_income: value,
      net_income: netIncome,
    }));
  };

  // Check if driver is Yango-independent
  const isYangoIndependent = (yangoId: string) => {
    return yangoId.startsWith('NATIVE_') || 
           yangoId.startsWith('OTP_') || 
           yangoId.startsWith('TEST_') ||
           yangoId.startsWith('PHONE_');
  };

  const filteredDrivers = drivers?.filter(d =>
    d.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.phone_number.includes(searchQuery)
  );

  return (
    <AdminLayout>
      <AdminPageHeader
        title="Saisie manuelle des revenus"
        description="Ajoutez les revenus des conducteurs manuellement (fallback pour Yango-independence)"
        action={
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={handleRecalculateScores}
              disabled={isRecalculating}
            >
              <RefreshCw className={`h-4 w-4 ${isRecalculating ? 'animate-spin' : ''}`} />
              Recalculer les scores
            </Button>
            <BulkIncomeImport 
              onImportComplete={handleImportComplete}
              adminUserId={adminUser?.id}
            />
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Ajouter un revenu
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Saisie manuelle de revenu</DialogTitle>
                <DialogDescription>
                  Ajoutez les revenus d'un conducteur pour une période donnée
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Driver Selection */}
                <div className="space-y-2">
                  <Label>Conducteur</Label>
                  <Select
                    value={formData.driver_id}
                    onValueChange={(value) => setFormData({ ...formData, driver_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un conducteur" />
                    </SelectTrigger>
                    <SelectContent>
                      {drivers?.map((driver) => (
                        <SelectItem key={driver.id} value={driver.id}>
                          <div className="flex items-center gap-2">
                            <span>{driver.full_name}</span>
                            {isYangoIndependent(driver.yango_driver_id) && (
                              <Badge variant="outline" className="text-xs">Native</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date */}
                <div className="space-y-2">
                  <Label>Date</Label>
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

                {/* Source */}
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Select
                    value={formData.source}
                    onValueChange={(value) => setFormData({ ...formData, source: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Saisie manuelle</SelectItem>
                      <SelectItem value="receipt">Reçu/Ticket</SelectItem>
                      <SelectItem value="driver_report">Déclaration conducteur</SelectItem>
                      <SelectItem value="bank_statement">Relevé bancaire</SelectItem>
                      <SelectItem value="other">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label>Notes (optionnel)</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Observations, justifications..."
                    rows={3}
                  />
                </div>

                {/* Info Alert */}
                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border">
                  <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Ces données seront utilisées pour le calcul du DAM Score hebdomadaire.
                    Assurez-vous de l'exactitude des montants.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={handleSubmit} disabled={createIncome.isPending}>
                  {createIncome.isPending ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        }
      />

      {/* Filter by Driver */}
      <div className="mb-6 flex flex-wrap gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un conducteur..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={selectedDriverId}
          onValueChange={setSelectedDriverId}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Filtrer par conducteur" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les conducteurs</SelectItem>
            {drivers?.map((driver) => (
              <SelectItem key={driver.id} value={driver.id}>
                {driver.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {drivers?.filter(d => isYangoIndependent(d.yango_driver_id)).length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Conducteurs natifs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Banknote className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {incomeRecords?.filter(r => r.source === 'manual').length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Saisies manuelles</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <TrendingUp className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {incomeRecords?.reduce((sum, r) => sum + (r.net_income || 0), 0).toLocaleString('fr-FR')}
                </p>
                <p className="text-xs text-muted-foreground">Total revenus nets (FCFA)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Car className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {incomeRecords?.reduce((sum, r) => sum + (r.trip_count || 0), 0).toLocaleString('fr-FR')}
                </p>
                <p className="text-xs text-muted-foreground">Total courses</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Income Records Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Historique des revenus
          </CardTitle>
          <CardDescription>
            Derniers 50 enregistrements de revenus
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recordsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : incomeRecords && incomeRecords.length > 0 ? (
            <div className="space-y-2">
              {incomeRecords.map((record, index) => (
                <motion.div
                  key={record.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-full bg-primary/10">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {(record.driver as any)?.full_name || 'Conducteur inconnu'}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(record.record_date), 'dd MMM yyyy', { locale: fr })}
                        <Badge variant="outline" className="text-xs">
                          {record.source === 'manual' ? 'Manuel' : 
                           record.source === 'yango' ? 'Yango' : 
                           record.source === 'receipt' ? 'Reçu' :
                           record.source}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Brut</p>
                      <p className="font-medium">{record.gross_income?.toLocaleString('fr-FR')} F</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Net</p>
                      <p className="font-medium text-green-600">{record.net_income?.toLocaleString('fr-FR')} F</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Courses</p>
                      <p className="font-medium">{record.trip_count}</p>
                    </div>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aucun enregistrement de revenu</p>
              <p className="text-sm">Cliquez sur "Ajouter un revenu" pour commencer</p>
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
