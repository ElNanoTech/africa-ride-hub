import { useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Download, Calendar as CalendarIcon, Eye, User, Shield, FileText, Settings, CreditCard, Car, Users } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { fr } from 'date-fns/locale';
import { useAuditLogs } from '@/hooks/useAdminData';

const actionLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'approved' | 'high' | 'destructive' }> = {
  admin_login: { label: 'Connexion', variant: 'default' },
  admin_logout: { label: 'Déconnexion', variant: 'secondary' },
  admin_user_created: { label: 'Admin créé', variant: 'approved' },
  admin_user_updated: { label: 'Admin modifié', variant: 'secondary' },
  admin_user_deleted: { label: 'Admin supprimé', variant: 'destructive' },
  admin_password_reset: { label: 'Réinit. mot de passe', variant: 'high' },
  admin_roles_changed: { label: 'Rôles modifiés', variant: 'secondary' },
  kyc_approved: { label: 'KYC approuvé', variant: 'approved' },
  kyc_rejected: { label: 'KYC rejeté', variant: 'destructive' },
  loan_approved: { label: 'Prêt approuvé', variant: 'approved' },
  loan_rejected: { label: 'Prêt rejeté', variant: 'destructive' },
  rental_approved: { label: 'Location approuvée', variant: 'approved' },
  rental_rejected: { label: 'Location rejetée', variant: 'destructive' },
  rental_return_confirmed: { label: 'Retour confirmé', variant: 'approved' },
  rental_terminated: { label: 'Location terminée (forcée)', variant: 'high' },
  rental_pickup_confirmed: { label: 'Prise en charge', variant: 'approved' },
  driver_suspended: { label: 'Chauffeur suspendu', variant: 'high' },
  driver_activated: { label: 'Chauffeur activé', variant: 'approved' },
  config_updated: { label: 'Config modifiée', variant: 'secondary' },
  payment_marked_paid: { label: 'Paiement confirmé', variant: 'approved' },
  vehicle_added: { label: 'Véhicule ajouté', variant: 'default' },
  vehicle_updated: { label: 'Véhicule modifié', variant: 'secondary' },
};

const targetTypeIcons: Record<string, typeof Users> = {
  driver: Users,
  kyc_submission: FileText,
  loan: CreditCard,
  rental: Car,
  payment: CreditCard,
  vehicle: Car,
  scoring_config: Settings,
  admin_user: Shield,
  session: User,
};

export default function AdminAudit() {
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [targetFilter, setTargetFilter] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<ReturnType<typeof useAuditLogs>['data'] extends (infer T)[] | undefined ? T : never>(null as never);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined
  });

  const { data: auditLogs, isLoading } = useAuditLogs();

  const getActionBadge = (action: string) => {
    const config = actionLabels[action] || { label: action, variant: 'default' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getTargetIcon = (targetType: string) => {
    const Icon = targetTypeIcons[targetType] || FileText;
    return <Icon className="h-4 w-4 text-muted-foreground" />;
  };

  const filteredLogs = (auditLogs || []).filter(log => {
    const q = searchQuery.toLowerCase();
    const details = (log.details as Record<string, unknown>) || {};
    const matchesSearch = !q ||
      log.admin_users?.full_name?.toLowerCase().includes(q) ||
      log.admin_users?.email?.toLowerCase().includes(q) ||
      (details.driver_name as string)?.toLowerCase().includes(q) ||
      (details.vehicle as string)?.toLowerCase().includes(q) ||
      (details.license_plate as string)?.toLowerCase().includes(q) ||
      (details.note as string)?.toLowerCase().includes(q);
    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    const matchesTarget = targetFilter === 'all' || log.entity_type === targetFilter;
    return matchesSearch && matchesAction && matchesTarget;
  });

  // Calculate stats
  const todayLogs = (auditLogs || []).filter(log => {
    const logDate = new Date(log.created_at);
    const today = new Date();
    return logDate.toDateString() === today.toDateString();
  });
  const approvalCount = todayLogs.filter(log => log.action.includes('approved')).length;
  const rejectionCount = todayLogs.filter(log => log.action.includes('rejected')).length;

  const handleExport = () => {
    console.log('Exporting audit logs...');
  };

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Journal d\'audit' }]} />
      
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Journal d'audit</h1>
            <p className="text-muted-foreground">Historique des actions administratives</p>
          </div>
          <Button variant="outline" onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Exporter
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Actions aujourd'hui</p>
                  <p className="text-2xl font-bold">{todayLogs.length}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Admins actifs</p>
                  <p className="text-2xl font-bold">
                    {new Set((auditLogs || []).map(l => l.admin_user_id)).size}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-tier-gold/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-tier-gold" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Approbations</p>
                  <p className="text-2xl font-bold text-tier-gold">{approvalCount}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-tier-gold/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-tier-gold" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Rejets</p>
                  <p className="text-2xl font-bold text-destructive">{rejectionCount}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-destructive" />
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
                  placeholder="Rechercher par admin, chauffeur, véhicule ou note..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les actions</SelectItem>
                  <SelectItem value="admin_login">Connexion</SelectItem>
                  <SelectItem value="admin_logout">Déconnexion</SelectItem>
                  <SelectItem value="admin_user_created">Admin créé</SelectItem>
                  <SelectItem value="admin_user_updated">Admin modifié</SelectItem>
                  <SelectItem value="admin_user_deleted">Admin supprimé</SelectItem>
                  <SelectItem value="admin_password_reset">Réinit. mot de passe</SelectItem>
                  <SelectItem value="kyc_approved">KYC approuvé</SelectItem>
                  <SelectItem value="kyc_rejected">KYC rejeté</SelectItem>
                  <SelectItem value="loan_approved">Prêt approuvé</SelectItem>
                  <SelectItem value="loan_rejected">Prêt rejeté</SelectItem>
                  <SelectItem value="rental_approved">Location approuvée</SelectItem>
                  <SelectItem value="rental_rejected">Location rejetée</SelectItem>
                  <SelectItem value="rental_return_confirmed">Retour confirmé</SelectItem>
                  <SelectItem value="rental_terminated">Location terminée (forcée)</SelectItem>
                  <SelectItem value="driver_suspended">Chauffeur suspendu</SelectItem>
                  <SelectItem value="config_updated">Config modifiée</SelectItem>
                </SelectContent>
              </Select>
              <Select value={targetFilter} onValueChange={setTargetFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  <SelectItem value="driver">Chauffeur</SelectItem>
                  <SelectItem value="kyc_submission">KYC</SelectItem>
                  <SelectItem value="loan">Prêt</SelectItem>
                  <SelectItem value="rental">Location</SelectItem>
                  <SelectItem value="payment">Paiement</SelectItem>
                  <SelectItem value="vehicle">Véhicule</SelectItem>
                  <SelectItem value="session">Session</SelectItem>
                  <SelectItem value="admin_user">Administrateur</SelectItem>
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    Période
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="range"
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                    locale={fr}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>

        {/* Audit Logs Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date/Heure</TableHead>
                <TableHead>Administrateur</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Cible</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="text-right">Détails</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-10 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-8" /></TableCell>
                  </TableRow>
                ))
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Aucun log trouvé
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      {formatDate(log.created_at)}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{log.admin_users?.full_name || 'N/A'}</p>
                        <p className="text-sm text-muted-foreground">{log.admin_users?.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>{getActionBadge(log.action)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getTargetIcon(log.entity_type || '')}
                        <span className="text-sm capitalize">{log.entity_type?.replace('_', ' ') || 'N/A'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {log.entity_id || 'N/A'}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {log.ip_address || 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => {
                          setSelectedLog(log);
                          setShowDetailDialog(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Detail Dialog */}
        <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Détails de l'action
                {selectedLog && getActionBadge(selectedLog.action)}
              </DialogTitle>
              <DialogDescription>
                {selectedLog && formatDate(selectedLog.created_at)}
              </DialogDescription>
            </DialogHeader>
            
            {selectedLog && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Administrateur</p>
                    <p className="font-medium">{selectedLog.admin_users?.full_name || 'N/A'}</p>
                    <p className="text-sm text-muted-foreground">{selectedLog.admin_users?.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Adresse IP</p>
                    <p className="font-mono">{selectedLog.ip_address || 'N/A'}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Type de cible</p>
                  <div className="flex items-center gap-2 mt-1">
                    {getTargetIcon(selectedLog.entity_type || '')}
                    <span className="capitalize">{selectedLog.entity_type?.replace('_', ' ') || 'N/A'}</span>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">ID de la cible</p>
                  <p className="font-mono text-sm">{selectedLog.entity_id || 'N/A'}</p>
                </div>

                {selectedLog.action === 'rental_return_confirmed' && selectedLog.details && (
                  <div className="rounded-lg border border-success/30 bg-success/5 p-3 space-y-2">
                    <p className="text-sm font-semibold text-success">Retour de location confirmé</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Conducteur</p>
                        <p className="font-medium">
                          {((selectedLog.details as Record<string, unknown>).driver_name as string) || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Véhicule</p>
                        <p className="font-medium">
                          {((selectedLog.details as Record<string, unknown>).vehicle as string) || '—'}
                          {((selectedLog.details as Record<string, unknown>).license_plate as string)
                            ? ` (${(selectedLog.details as Record<string, unknown>).license_plate as string})`
                            : ''}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Confirmé par</p>
                        <p className="font-medium">{selectedLog.admin_users?.full_name || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Date</p>
                        <p className="font-medium">{formatDate(selectedLog.created_at)}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Note</p>
                      <p className="text-sm italic">
                        {((selectedLog.details as Record<string, unknown>).note as string) || 'Aucune note'}
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-sm text-muted-foreground mb-2">Détails (JSON)</p>
                  <ScrollArea className="h-[200px] border rounded-lg p-3">
                    <pre className="text-sm">
                      {JSON.stringify(selectedLog.details, null, 2)}
                    </pre>
                  </ScrollArea>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
