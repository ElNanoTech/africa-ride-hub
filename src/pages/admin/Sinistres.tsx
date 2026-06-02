import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { CaseStatusBadge } from '@/components/sinistres/CaseStatusBadge';
import { useAdminAccidents, useAdminAccidentKPIs, AdminAccidentFilters } from '@/hooks/useSinistres';
import { SEVERITY_LABELS_FR, AccidentSeverity, AccidentStatus, STATUS_LABELS_FR } from '@/lib/sinistres';
import { ShieldAlert, AlertTriangle, FolderOpen, UserX, Calendar, Search, Filter, RefreshCw, MapPin, TrendingUp, FileDown } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { EmptyState } from '@/components/EmptyState';
import { useQueryClient } from '@tanstack/react-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { downloadScoringQAReport } from '@/lib/scoringQAReport';
import { toast } from 'sonner';

const STATUS_OPTIONS: AccidentStatus[] = [
  'SUBMITTED', 'UNDER_REVIEW', 'WAITING_DOCS', 'INVESTIGATING',
  'PENDING_DETERMINATION', 'RESOLVED_NOT_AT_FAULT', 'RESOLVED_AT_FAULT',
  'CLOSED', 'CANCELLED',
];

export default function AdminSinistres() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<AdminAccidentFilters>({ status: 'ALL', severity: 'ALL' });
  const [searchInput, setSearchInput] = useState('');
  const [qaStart, setQaStart] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [qaEnd, setQaEnd] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [qaLoading, setQaLoading] = useState(false);

  const { data: kpis } = useAdminAccidentKPIs();
  const { data: rows = [], isLoading } = useAdminAccidents(filters);

  const applySearch = () => setFilters((f) => ({ ...f, search: searchInput.trim() || undefined }));

  const handleDownloadQA = async () => {
    try {
      setQaLoading(true);
      const startISO = new Date(`${qaStart}T00:00:00`).toISOString();
      // end is exclusive, push to end-of-day next
      const endDate = new Date(`${qaEnd}T00:00:00`);
      endDate.setDate(endDate.getDate() + 1);
      await downloadScoringQAReport(startISO, endDate.toISOString());
      toast.success('Rapport QA Scoring généré');
    } catch (e: any) {
      toast.error('Échec du rapport QA', { description: e?.message ?? String(e) });
    } finally {
      setQaLoading(false);
    }
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-accidents'] });
    qc.invalidateQueries({ queryKey: ['admin-accident-kpis'] });
  };

  const severityClass = (s: AccidentSeverity) =>
    s === 'SEVERE' ? 'text-destructive' : s === 'MODERATE' ? 'text-warning' : 'text-muted-foreground';

  return (
    <AdminLayout>
      <AdminBreadcrumb items={[{ label: 'Sinistres' }]} />

      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-primary" /> Sinistres
            </h1>
            <p className="text-sm text-muted-foreground">Gestion des cas d'accidents — vue opérateur</p>
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" disabled={qaLoading}>
                  <FileDown className="h-4 w-4 mr-2" /> {qaLoading ? 'Génération…' : 'QA Scoring (PDF)'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-semibold">Rapport QA Scoring</h4>
                    <p className="text-xs text-muted-foreground">
                      Conducteurs impactés, événements, et santé des cron pour la période choisie.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Du</Label>
                      <Input type="date" value={qaStart} onChange={(e) => setQaStart(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Au</Label>
                      <Input type="date" value={qaEnd} onChange={(e) => setQaEnd(e.target.value)} />
                    </div>
                  </div>
                  <Button size="sm" className="w-full" disabled={qaLoading} onClick={handleDownloadQA}>
                    <FileDown className="h-4 w-4 mr-2" />
                    Télécharger le PDF
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/sinistres/analytics')}>
              <TrendingUp className="h-4 w-4 mr-2" /> Analytique
            </Button>
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="h-4 w-4 mr-2" /> Actualiser
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard icon={<FolderOpen className="h-4 w-4" />} label="Total" value={kpis?.total ?? '—'} />
          <KpiCard icon={<AlertTriangle className="h-4 w-4 text-warning" />} label="Ouverts" value={kpis?.open ?? '—'} accent="warning" />
          <KpiCard icon={<UserX className="h-4 w-4 text-primary" />} label="Non assignés" value={kpis?.unassigned ?? '—'} accent="info" />
          <KpiCard icon={<ShieldAlert className="h-4 w-4 text-destructive" />} label="Graves ouverts" value={kpis?.severe ?? '—'} accent="danger" />
          <KpiCard icon={<Calendar className="h-4 w-4" />} label="30 derniers jours" value={kpis?.last30 ?? '—'} />
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[220px]">
              <label className="text-xs text-muted-foreground">Recherche</label>
              <div className="flex gap-1">
                <Input
                  placeholder="N° cas ou description…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && applySearch()}
                />
                <Button variant="secondary" size="icon" onClick={applySearch}><Search className="h-4 w-4" /></Button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Statut</label>
              <Select value={filters.status ?? 'ALL'} onValueChange={(v) => setFilters((f) => ({ ...f, status: v as any }))}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tous</SelectItem>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS_FR[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Gravité</label>
              <Select value={filters.severity ?? 'ALL'} onValueChange={(v) => setFilters((f) => ({ ...f, severity: v as any }))}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Toutes</SelectItem>
                  <SelectItem value="MINOR">Mineur</SelectItem>
                  <SelectItem value="MODERATE">Modéré</SelectItem>
                  <SelectItem value="SEVERE">Grave</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Assignation</label>
              <Select
                value={filters.assignedAdminId ?? 'ALL'}
                onValueChange={(v) => setFilters((f) => ({ ...f, assignedAdminId: v as any }))}
              >
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tous</SelectItem>
                  <SelectItem value="UNASSIGNED">Non assignés</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Ville</label>
              <Input
                className="w-[140px]"
                placeholder="Abidjan…"
                value={filters.city ?? ''}
                onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value || undefined }))}
              />
            </div>
            {(filters.status !== 'ALL' || filters.severity !== 'ALL' || filters.search || filters.city || filters.assignedAdminId) && (
              <Button variant="ghost" size="sm" onClick={() => { setFilters({ status: 'ALL', severity: 'ALL' }); setSearchInput(''); }}>
                <Filter className="h-4 w-4 mr-1" /> Réinitialiser
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : rows.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon={<ShieldAlert className="h-6 w-6" />}
                  title="Aucun sinistre"
                  description="Aucun cas ne correspond à vos critères."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° Cas</TableHead>
                    <TableHead>Conducteur</TableHead>
                    <TableHead>Véhicule</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Lieu</TableHead>
                    <TableHead>Gravité</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Assigné</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => navigate(`/admin/sinistres/${r.id}`)}
                    >
                      <TableCell className="font-mono text-xs">{r.case_number ?? '—'}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{r.driver?.full_name ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.driver?.phone_number ?? ''}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.vehicle?.license_plate ?? '—'}
                        {r.vehicle?.model_name && <div className="text-muted-foreground">{r.vehicle.model_name}</div>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {format(new Date(r.accident_datetime), 'dd MMM yyyy HH:mm', { locale: fr })}
                      </TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          {r.city ?? r.location_address ?? '—'}
                        </div>
                      </TableCell>
                      <TableCell className={`text-xs font-medium ${severityClass(r.severity)}`}>
                        {SEVERITY_LABELS_FR[r.severity]}
                      </TableCell>
                      <TableCell><CaseStatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-xs">
                        {r.assigned_admin?.full_name || r.assigned_admin?.email || (
                          <span className="text-muted-foreground italic">Non assigné</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

function KpiCard({
  icon, label, value, accent,
}: { icon: React.ReactNode; label: string; value: number | string; accent?: 'warning' | 'danger' | 'info' }) {
  const accentCls = accent === 'danger' ? 'border-destructive/30' : accent === 'warning' ? 'border-warning/30' : accent === 'info' ? 'border-primary/30' : '';
  return (
    <Card className={accentCls}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
