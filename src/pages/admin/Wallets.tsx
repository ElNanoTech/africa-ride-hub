import { useMemo, useState } from 'react';
import { AdminLayout, AdminPageHeader } from '@/components/AdminLayout';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { Wallet, Search, ChevronRight } from 'lucide-react';
import { DriverWalletCard } from '@/components/admin/DriverWalletCard';
import { LoadingState } from '@/components/LoadingState';
import { useFinancialRealtime } from '@/hooks/useFinancialRealtime';

interface WalletRow {
  wallet_id: string;
  driver_id: string;
  customer_id: string | null;
  total_credits: number;
  total_debits: number;
  available_balance: number;
  last_transaction_at: string | null;
  transaction_count: number;
  driver_name: string;
  phone: string | null;
}

export default function AdminWallets() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<WalletRow | null>(null);
  useFinancialRealtime({ scope: 'admin' });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-wallets-list'],
    queryFn: async () => {
      const [walletsRes, driversRes] = await Promise.all([
        supabase
          .from('wallet_balance_view')
          .select('*')
          .order('last_transaction_at', { ascending: false, nullsFirst: false })
          .limit(500),
        supabase.from('drivers').select('id, full_name, phone_number').limit(2000),
      ]);
      if (walletsRes.error) throw walletsRes.error;
      if (driversRes.error) throw driversRes.error;
      const driverMap = new Map<string, { full_name: string; phone: string | null }>();
      for (const d of driversRes.data ?? []) {
        driverMap.set(d.id, { full_name: d.full_name, phone: d.phone_number });
      }
      return (walletsRes.data ?? []).map((w: any) => ({
        ...w,
        driver_name: driverMap.get(w.driver_id)?.full_name ?? '—',
        phone: driverMap.get(w.driver_id)?.phone ?? null,
      })) as WalletRow[];
    },
    staleTime: 30_000,
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(
      (r) =>
        r.driver_name.toLowerCase().includes(q) ||
        (r.phone ?? '').toLowerCase().includes(q) ||
        r.available_balance.toString().includes(q),
    );
  }, [data, query]);

  const totals = useMemo(() => {
    const t = rows.reduce(
      (acc, r) => {
        acc.balance += r.available_balance;
        acc.credits += r.total_credits;
        acc.debits += r.total_debits;
        return acc;
      },
      { balance: 0, credits: 0, debits: 0 },
    );
    return t;
  }, [rows]);

  return (
    <AdminLayout>
      <AdminBreadcrumb
        items={[
          { label: 'Facturation', href: '/admin/billing' },
          { label: 'Portefeuilles' },
        ]}
      />
      <AdminPageHeader
        title="Portefeuilles conducteurs"
        description="Crédits prépayés, trop-perçus et applications automatiques aux factures."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Solde total disponible</p>
            <p className="text-2xl font-bold">{formatCurrency(totals.balance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Crédits cumulés</p>
            <p className="text-2xl font-bold text-success">{formatCurrency(totals.credits)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Débits cumulés</p>
            <p className="text-2xl font-bold text-destructive">{formatCurrency(totals.debits)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative mb-3">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher (nom, téléphone, montant)"
              className="pl-8"
            />
          </div>

          {isLoading ? (
            <LoadingState />
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Aucun portefeuille pour le moment.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conducteur</TableHead>
                    <TableHead className="text-right">Solde</TableHead>
                    <TableHead className="text-right">Crédits</TableHead>
                    <TableHead className="text-right">Débits</TableHead>
                    <TableHead className="text-right">Opérations</TableHead>
                    <TableHead>Dernière</TableHead>
                    <TableHead aria-label="actions" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow
                      key={r.wallet_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelected(r)}
                    >
                      <TableCell>
                        <div className="font-medium">{r.driver_name}</div>
                        {r.phone && (
                          <div className="text-xs text-muted-foreground">{r.phone}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(r.available_balance)}
                      </TableCell>
                      <TableCell className="text-right text-success">
                        {formatCurrency(r.total_credits)}
                      </TableCell>
                      <TableCell className="text-right text-destructive">
                        {formatCurrency(r.total_debits)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{r.transaction_count}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.last_transaction_at ? formatDateShort(new Date(r.last_transaction_at)) : '—'}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected?.driver_name}</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="mt-4">
              <DriverWalletCard driverId={selected.driver_id} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}
