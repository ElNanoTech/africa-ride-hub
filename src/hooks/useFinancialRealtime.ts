import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/routeClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * useFinancialRealtime
 *
 * Subscribes to postgres_changes on every "money moves" table and invalidates
 * the relevant React Query keys so driver + admin financial screens update
 * within ~1s without manual refresh.
 *
 * Backend triggers already perform all the business logic (auto-apply wallet
 * credit, cancellation reversal, etc.) — this hook is purely the UI bridge.
 *
 * Invalidations are debounced ~150ms so a burst of related events from one
 * RPC call (wallet debit + invoice update + audit row) triggers one refetch
 * per key, not three.
 */
const TABLES = [
  'driver_wallets',
  'driver_wallet_transactions',
  'invoice',
  'payments',
  'payment_receipts',
  'invoice_audit',
  'invoice_payment_link',
] as const;

type Scope = 'driver' | 'admin';

interface Options {
  scope: Scope;
  /** Required for scope='driver'. Filters invalidations to that driver. */
  driverId?: string | null;
  /** Optional notifier called for every wallet_transactions INSERT we receive. */
  onWalletTxnInsert?: (row: Record<string, unknown>) => void;
  /** Optional notifier called for every invoice UPDATE we receive. */
  onInvoiceUpdate?: (row: Record<string, unknown>, old: Record<string, unknown>) => void;
  enabled?: boolean;
}

export function useFinancialRealtime({
  scope,
  driverId,
  onWalletTxnInsert,
  onInvoiceUpdate,
  enabled = true,
}: Options) {
  const qc = useQueryClient();
  const cbInsertRef = useRef(onWalletTxnInsert);
  const cbUpdateRef = useRef(onInvoiceUpdate);

  useEffect(() => {
    cbInsertRef.current = onWalletTxnInsert;
    cbUpdateRef.current = onInvoiceUpdate;
  }, [onWalletTxnInsert, onInvoiceUpdate]);

  useEffect(() => {
    if (!enabled) return;
    if (scope === 'driver' && !driverId) return;

    const channelName =
      scope === 'driver' ? `financial:driver:${driverId}` : 'financial:admin';

    // Debounced invalidator
    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const keys = Array.from(pending);
      pending.clear();
      keys.forEach((key) => {
        qc.invalidateQueries({ queryKey: [key] });
      });
    };
    const schedule = (keys: string[]) => {
      keys.forEach((k) => pending.add(k));
      if (timer == null) timer = setTimeout(flush, 150);
    };

    // Keys touched by money movement, grouped by audience.
    // Names align with existing useQuery({ queryKey: [...] }) calls in the codebase.
    const DRIVER_KEYS = [
      'driver-wallet-self',
      'driverPayments',
      'driver-invoices',
      'invoice',
      'driver-weekly-income',
      'invoice-linked-payment',
      'invoice-linked-payments-batch',
      'payment-receipts',
    ];
    const ADMIN_KEYS = [
      'admin-invoices',
      'admin-invoices-unresolved',
      'admin-wallets-list',
      'admin-payments',
      'admin-stats',
      'invoice',
      'invoice-linked-payment',
      'invoice-linked-payments-batch',
      'payment-receipts',
    ];
    const KEYS = scope === 'driver' ? DRIVER_KEYS : ADMIN_KEYS;

    const channel: RealtimeChannel = supabase.channel(channelName);

    const driverMatches = (row: Record<string, unknown> | null | undefined) => {
      if (!row) return true; // DELETE payloads may lack row
      if (scope !== 'driver') return true;
      return row.driver_id === driverId;
    };

    for (const table of TABLES) {
      (channel as unknown as { on: (...args: unknown[]) => RealtimeChannel }).on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown>; eventType: string; table: string }) => {
          // Driver-scoped filter for tables that carry driver_id directly.
          const row = (payload.new && Object.keys(payload.new).length > 0
            ? payload.new
            : payload.old) as Record<string, unknown>;

          const tablesWithDriverId = new Set([
            'driver_wallets',
            'driver_wallet_transactions',
            'invoice',
            'payments',
          ]);
          if (scope === 'driver' && tablesWithDriverId.has(table)) {
            if (!driverMatches(row)) return;
          }
          // For invoice_audit / payment_receipts / invoice_payment_link there
          // is no driver_id column. We just refresh the driver's queries —
          // RLS will scope the actual reads.

          schedule(KEYS);

          if (table === 'driver_wallet_transactions' && payload.eventType === 'INSERT') {
            try { cbInsertRef.current?.(payload.new); } catch (e) { console.error(e); }
          }
          if (table === 'invoice' && payload.eventType === 'UPDATE') {
            try { cbUpdateRef.current?.(payload.new, payload.old); } catch (e) { console.error(e); }
          }
        },
      );
    }

    channel.subscribe();

    return () => {
      if (timer != null) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [scope, driverId, enabled, qc]);
}
