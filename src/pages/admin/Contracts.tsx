import { useState } from 'react';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Car, Plus, Users, Banknote, TrendingUp, Calendar, CheckCircle, Clock, AlertCircle, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';
import { useAdminRentToOwnContracts, useCreateRentToOwnContract, useRecordContractPayment, RentToOwnContract } from '@/hooks/useRentToOwn';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { format, parseISO, addWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { FeatureFlag } from '@/components/FeatureFlag';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  active: { label: 'Actif', color: 'bg-primary/10 text-primary border-primary/20', icon: CheckCircle },
  pending: { label: 'En attente', color: 'bg-warning/10 text-warning border-warning/20', icon: Clock },
  completed: { label: 'Terminé', color: 'bg-secondary/10 text-secondary border-secondary/20', icon: CheckCircle },
  defaulted: { label: 'Défaut', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: AlertCircle },
  cancelled: { label: 'Annulé', color: 'bg-muted text-muted-foreground', icon: AlertCircle },
};

function KPICard({ title, value, icon: Icon, description, className }: { title: string; value: string | number; icon: typeof Car; description?: string; className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NewContractDialog() {
  const createContract = useCreateRentToOwnContract();
  const [form, setForm] = useState({
    driver_id: '',
    vehicle_id: '',
    total_price: '',
    weekly_payment: '',
    start_date: new Date().toISOString().split('T')[0],
    duration_weeks: '156',
  });

  // Fetch drivers and vehicles for selection
  const { data: drivers = [] } = useQuery({
    queryKey: ['admin-drivers-list'],
    queryFn: async () => {
      const { data } = await supabase.from('drivers').select('id, full_name, phone_number').eq('driver_status', 'active').order('full_name');
      return data || [];
    },
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['admin-vehicles-available'],
    queryFn: async () => {
      const { data } = await supabase.from('vehicles').select('id, model_name, license_plate').in('status', ['available', 'rented']).order('model_name');
      return data || [];
    },
  });

  const handleSubmit = () => {
    if (!form.driver_id || !form.vehicle_id || !form.total_price || !form.weekly_payment) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    const durationWeeks = parseInt(form.duration_weeks) || 156;
    const startDate = new Date(form.start_date);
    const endDate = addWeeks(startDate, durationWeeks);

    createContract.mutate({
      driver_id: form.driver_id,
      vehicle_id: form.vehicle_id,
      total_price: parseInt(form.total_price),
      weekly_payment: parseInt(form.weekly_payment),
      contract_duration_weeks: durationWeeks,
      start_date: form.start_date,
      expected_end_date: endDate.toISOString().split('T')[0],
    });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Nouveau Contrat
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Créer un contrat Rent-to-Own</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label>Conducteur</Label>
            <Select value={form.driver_id} onValueChange={(v) => setForm(f => ({ ...f, driver_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Sélectionner un conducteur" /></SelectTrigger>
              <SelectContent>
                {drivers.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.full_name} ({d.phone_number})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Véhicule</Label>
            <Select value={form.vehicle_id} onValueChange={(v) => setForm(f => ({ ...f, vehicle_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Sélectionner un véhicule" /></SelectTrigger>
              <SelectContent>
                {vehicles.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.model_name} - {v.license_plate}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Prix total (FCFA)</Label>
              <Input type="number" value={form.total_price} onChange={(e) => setForm(f => ({ ...f, total_price: e.target.value }))} placeholder="5000000" />
            </div>
            <div>
              <Label>Paiement/semaine (FCFA)</Label>
              <Input type="number" value={form.weekly_payment} onChange={(e) => setForm(f => ({ ...f, weekly_payment: e.target.value }))} placeholder="35000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date de début</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div>
              <Label>Durée (semaines)</Label>
              <Input type="number" value={form.duration_weeks} onChange={(e) => setForm(f => ({ ...f, duration_weeks: e.target.value }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Annuler</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={createContract.isPending}>
            {createContract.isPending ? 'Création...' : 'Créer le contrat'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContractRow({ contract }: { contract: RentToOwnContract }) {
  const recordPayment = useRecordContractPayment();
  const statusConfig = STATUS_CONFIG[contract.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;

  const handleQuickPayment = () => {
    recordPayment.mutate({
      contract_id: contract.id,
      amount: contract.weekly_payment,
      week_number: contract.weeks_completed + 1,
    });
  };

  return (
    <TableRow>
      <TableCell>
        <div>
          <p className="font-medium">{contract.driver?.full_name || '—'}</p>
          <p className="text-xs text-muted-foreground">{contract.driver?.phone_number}</p>
        </div>
      </TableCell>
      <TableCell>
        <div>
          <p className="font-medium">{contract.vehicle?.model_name || '—'}</p>
          <p className="text-xs text-muted-foreground">{contract.vehicle?.license_plate}</p>
        </div>
      </TableCell>
      <TableCell>
        <div className="w-32">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium">{Math.round(contract.ownership_percentage)}%</span>
            <span className="text-muted-foreground">{contract.weeks_completed}/{contract.contract_duration_weeks}</span>
          </div>
          <Progress value={contract.ownership_percentage} className="h-2" />
        </div>
      </TableCell>
      <TableCell className="font-medium">{formatCurrency(contract.total_paid)}</TableCell>
      <TableCell className="text-muted-foreground">{formatCurrency(contract.total_price - contract.total_paid)}</TableCell>
      <TableCell>
        <Badge variant="outline" className={cn('gap-1', statusConfig.color)}>
          <StatusIcon className="h-3 w-3" />
          {statusConfig.label}
        </Badge>
      </TableCell>
      <TableCell>
        {contract.status === 'active' && (
          <Button size="sm" variant="outline" onClick={handleQuickPayment} disabled={recordPayment.isPending} className="gap-1">
            <Banknote className="h-3 w-3" />
            +Paiement
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function AdminContracts() {
  const [statusFilter, setStatusFilter] = useState('all');
  const { data: contracts = [], isLoading } = useAdminRentToOwnContracts(statusFilter);

  const activeContracts = contracts.filter(c => c.status === 'active');
  const totalRevenue = contracts.reduce((s, c) => s + c.total_paid, 0);
  const totalRemaining = contracts.reduce((s, c) => s + (c.total_price - c.total_paid), 0);
  const avgCompletion = activeContracts.length > 0
    ? Math.round(activeContracts.reduce((s, c) => s + c.ownership_percentage, 0) / activeContracts.length)
    : 0;

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Tableau de bord', href: '/admin' }, { label: 'Contrats Rent-to-Own' }]} />
      <AdminPageHeader title="Contrats Rent-to-Own" description="Gérez les contrats de propriété progressive des véhicules" />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard title="Contrats actifs" value={activeContracts.length} icon={FileText} />
        <KPICard title="Revenus collectés" value={formatCurrency(totalRevenue)} icon={Banknote} />
        <KPICard title="Restant à collecter" value={formatCurrency(totalRemaining)} icon={TrendingUp} />
        <KPICard title="Progression moyenne" value={`${avgCompletion}%`} icon={Calendar} />
      </div>

      {/* Filters + New Contract */}
      <div className="flex items-center justify-between mb-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrer par statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="active">Actif</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="completed">Terminé</SelectItem>
            <SelectItem value="defaulted">Défaut</SelectItem>
          </SelectContent>
        </Select>
        <NewContractDialog />
      </div>

      {/* Contracts table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : contracts.length === 0 ? (
            <div className="py-16 text-center">
              <Car className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Aucun contrat Rent-to-Own</p>
              <p className="text-sm text-muted-foreground mt-1">Créez votre premier contrat pour commencer</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conducteur</TableHead>
                  <TableHead>Véhicule</TableHead>
                  <TableHead>Progression</TableHead>
                  <TableHead>Payé</TableHead>
                  <TableHead>Restant</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map(contract => (
                  <ContractRow key={contract.id} contract={contract} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
