import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink } from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { formatCurrency } from '@/lib/format';
import {
  useDriverInvoices,
  useDriverAccidents,
  useDriverTickets,
  useDriverActivityTimeline,
} from '@/hooks/useAdminData';

const INVOICE_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  issued: 'default',
  paid: 'secondary',
  cancelled: 'destructive',
  draft: 'outline',
};

export function DriverInvoicesPanel({ driverId }: { driverId: string }) {
  const { data, isLoading, error } = useDriverInvoices(driverId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Factures</CardTitle>
        <CardDescription>Toutes les factures du conducteur</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">Erreur de chargement</div>
        ) : !data || data.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Aucune facture</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Total TTC</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">{inv.invoice_number ?? inv.id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <Badge variant={INVOICE_STATUS_VARIANT[inv.status] ?? 'outline'}>{inv.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {format(parseISO(inv.issued_at ?? inv.created_at), 'dd MMM yyyy', { locale: fr })}
                  </TableCell>
                  <TableCell className="font-medium">{formatCurrency(inv.total_ttc)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(inv.tags ?? []).map((t) => (
                        <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="sm">
                      <RouterLink to={`/admin/billing?invoice=${inv.id}`}>
                        Ouvrir <ExternalLink className="h-3 w-3 ml-1" />
                      </RouterLink>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

const ACCIDENT_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'outline',
  SUBMITTED: 'default',
  WAITING_DOCS: 'outline',
  UNDER_REVIEW: 'default',
  CLOSED: 'secondary',
  RESOLVED: 'secondary',
};

const SEVERITY_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  MINOR: 'outline',
  MODERATE: 'default',
  MAJOR: 'destructive',
  CRITICAL: 'destructive',
  UNKNOWN: 'outline',
};

export function DriverAccidentsPanel({ driverId }: { driverId: string }) {
  const { data, isLoading, error } = useDriverAccidents(driverId);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = (data ?? []).filter((a) => statusFilter === 'all' || a.status === statusFilter);
  const uniqueStatuses = Array.from(new Set((data ?? []).map((a) => a.status)));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle>Sinistres</CardTitle>
            <CardDescription>Accidents déclarés par le conducteur</CardDescription>
          </div>
          {uniqueStatuses.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              <Button size="sm" variant={statusFilter === 'all' ? 'default' : 'outline'} onClick={() => setStatusFilter('all')}>
                Tous
              </Button>
              {uniqueStatuses.map((s) => (
                <Button key={s} size="sm" variant={statusFilter === s ? 'default' : 'outline'} onClick={() => setStatusFilter(s)}>
                  {s}
                </Button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">Erreur de chargement</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Aucun sinistre</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>N° dossier</TableHead>
                <TableHead>Gravité</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Véhicule</TableHead>
                <TableHead>Description</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs">
                    {format(parseISO(a.accident_datetime), 'dd MMM yyyy HH:mm', { locale: fr })}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{a.case_number ?? a.id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <Badge variant={SEVERITY_VARIANT[a.severity] ?? 'outline'}>{a.severity}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ACCIDENT_STATUS_VARIANT[a.status] ?? 'outline'}>{a.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {a.vehicles ? `${a.vehicles.model_name} · ${a.vehicles.license_plate}` : '—'}
                  </TableCell>
                  <TableCell className="text-xs max-w-[240px] truncate" title={a.description ?? undefined}>
                    {a.description ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="sm">
                      <RouterLink to={`/admin/accidents/${a.id}`}>
                        <ExternalLink className="h-3 w-3" />
                      </RouterLink>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

const TICKET_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  open: 'default',
  in_progress: 'default',
  resolved: 'secondary',
  closed: 'outline',
};

export function DriverTicketsPanel({ driverId }: { driverId: string }) {
  const { data, isLoading, error } = useDriverTickets(driverId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tickets de support</CardTitle>
        <CardDescription>Toutes les demandes du conducteur</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">Erreur de chargement</div>
        ) : !data || data.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Aucun ticket</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Sujet</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Dernière MAJ</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.ticket_number ?? t.id.slice(0, 8)}</TableCell>
                  <TableCell className="font-medium max-w-[260px] truncate" title={t.subject}>{t.subject}</TableCell>
                  <TableCell className="text-xs">{t.category}</TableCell>
                  <TableCell>
                    <Badge variant={TICKET_STATUS_VARIANT[t.status] ?? 'outline'}>{t.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDistanceToNow(parseISO(t.updated_at), { locale: fr, addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="sm">
                      <RouterLink to={`/admin/support?ticket=${t.id}`}>
                        <ExternalLink className="h-3 w-3" />
                      </RouterLink>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

const SOURCE_LABEL: Record<string, { label: string; tone: string }> = {
  invoice: { label: 'Facture', tone: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  payment: { label: 'Paiement', tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  accident: { label: 'Sinistre', tone: 'bg-red-500/10 text-red-700 dark:text-red-300' },
  admin_audit: { label: 'Admin', tone: 'bg-purple-500/10 text-purple-700 dark:text-purple-300' },
  score: { label: 'Score', tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
};

export function DriverActivityPanel({ driverId }: { driverId: string }) {
  const { data, isLoading, error } = useDriverActivityTimeline(driverId, 150);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activité</CardTitle>
        <CardDescription>Chronologie unifiée des événements du conducteur</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">Erreur de chargement</div>
        ) : !data || data.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Aucune activité</div>
        ) : (
          <div className="space-y-2">
            {data.map((row, idx) => {
              const meta = SOURCE_LABEL[row.source] ?? { label: row.source, tone: 'bg-muted text-muted-foreground' };
              return (
                <div key={`${row.source}-${row.reference_id ?? idx}-${row.occurred_at}`} className="flex items-start gap-3 border-l-2 border-border pl-3 py-2 hover:bg-muted/30 rounded-sm">
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-medium flex-shrink-0 ${meta.tone}`}>
                    {meta.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate" title={row.summary}>{row.summary}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {format(parseISO(row.occurred_at), 'dd MMM yyyy HH:mm', { locale: fr })}
                      {' · '}
                      {formatDistanceToNow(parseISO(row.occurred_at), { locale: fr, addSuffix: true })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
