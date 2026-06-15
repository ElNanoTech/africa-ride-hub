import { useQuery } from '@tanstack/react-query';
import { Bell, ClipboardCheck, CreditCard, FileText, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import type { DriverTimelineItem, DriverCardTone } from '@/components/driver/DriverExperienceCards';
import { supabase } from '@/integrations/supabase/routeClient';
import { formatCurrency, formatRelativeTime } from '@/lib/format';
import { effectiveStatus, type FleetControlStatus } from '@/lib/fleetControl';

type QueryResponse<T> = { data: T[] | null; error: { message?: string } | null };

type NotificationRow = {
  id: string;
  title: string | null;
  message: string | null;
  notification_type: string | null;
  created_at: string;
};

type WalletTransactionRow = {
  id: string;
  type: string;
  direction: string | null;
  amount: number;
  balance_after: number;
  created_at: string;
  note: string | null;
  invoice_id: string | null;
  payment_id: string | null;
};

type PaymentRow = {
  id: string;
  status: string | null;
  amount: number | null;
  amount_paid: number | null;
  payment_type: string | null;
  due_date: string | null;
  paid_date: string | null;
  paid_at: string | null;
  created_at: string;
};

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  status: string;
  total_ttc: number;
  remaining_due: number | null;
  created_at: string;
  issued_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
};

type ScoreEventRow = {
  id: string;
  delta: number;
  reason: string;
  created_at: string;
};

type InspectionRow = {
  id: string;
  status: FleetControlStatus;
  due_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

async function safeRows<T>(request: PromiseLike<QueryResponse<T>>, label: string): Promise<T[]> {
  const { data, error } = await request;
  if (error) {
    console.warn(`[driver-activity] ${label} unavailable:`, error.message ?? error);
    return [];
  }
  return data ?? [];
}

function timeLabel(date: string): string {
  return formatRelativeTime(new Date(date));
}

function paymentTitle(payment: PaymentRow): { title: string; tone: DriverCardTone; date: string } {
  if (payment.status === 'paid' || payment.status === 'overpaid') {
    return {
      title: payment.status === 'overpaid' ? 'Paiement avec crédit restant' : 'Paiement reçu',
      tone: 'good',
      date: payment.paid_at ?? payment.paid_date ?? payment.created_at,
    };
  }
  if (payment.status === 'overdue' || payment.status === 'late') {
    return { title: 'Paiement en retard', tone: 'danger', date: payment.due_date ?? payment.created_at };
  }
  if (payment.status === 'partial') {
    return { title: 'Paiement partiel', tone: 'warning', date: payment.created_at };
  }
  return { title: 'Paiement à venir', tone: 'info', date: payment.due_date ?? payment.created_at };
}

function walletTitle(txn: WalletTransactionRow): { title: string; tone: DriverCardTone } {
  if (txn.type === 'invoice_cancellation_refund') return { title: 'Remboursement facture annulée', tone: 'good' };
  if (txn.type === 'wallet_auto_invoice_payment') return { title: 'Facture réglée par crédit', tone: 'good' };
  if (txn.type === 'overpayment_credit') return { title: 'Trop-perçu ajouté au portefeuille', tone: 'good' };
  if (txn.type === 'upfront_deposit' || txn.type === 'prepayment') return { title: 'Recharge portefeuille confirmée', tone: 'good' };
  return (txn.direction ?? (txn.amount >= 0 ? 'credit' : 'debit')) === 'credit'
    ? { title: 'Crédit portefeuille', tone: 'good' }
    : { title: 'Débit portefeuille', tone: 'neutral' };
}

function invoiceTitle(invoice: InvoiceRow): { title: string; tone: DriverCardTone; date: string } {
  if (invoice.status === 'paid') return { title: 'Facture payée', tone: 'good', date: invoice.paid_at ?? invoice.created_at };
  if (invoice.status === 'cancelled') return { title: 'Facture annulée', tone: 'neutral', date: invoice.cancelled_at ?? invoice.created_at };
  if (invoice.status === 'partial') return { title: 'Facture partiellement réglée', tone: 'warning', date: invoice.issued_at ?? invoice.created_at };
  if (invoice.status === 'overdue') return { title: 'Facture en retard', tone: 'danger', date: invoice.issued_at ?? invoice.created_at };
  return { title: 'Nouvelle facture', tone: 'info', date: invoice.issued_at ?? invoice.created_at };
}

function inspectionTitle(inspection: InspectionRow): { title: string; tone: DriverCardTone; date: string } {
  const status = effectiveStatus(inspection.status, inspection.due_at);
  if (status === 'approved') return { title: 'Contrôle véhicule validé', tone: 'good', date: inspection.reviewed_at ?? inspection.updated_at };
  if (status === 'rejected') return { title: 'Contrôle véhicule refusé', tone: 'danger', date: inspection.reviewed_at ?? inspection.updated_at };
  if (status === 'submitted') return { title: 'Contrôle véhicule envoyé', tone: 'info', date: inspection.submitted_at ?? inspection.updated_at };
  if (status === 'overdue' || status === 'blocked') return { title: 'Contrôle véhicule en retard', tone: 'danger', date: inspection.due_at };
  return { title: 'Contrôle véhicule demandé', tone: 'warning', date: inspection.created_at };
}

export function useDriverActivityTimeline(driverId: string | null | undefined, limit = 20) {
  return useQuery({
    queryKey: ['driver-activity-timeline', driverId, limit],
    enabled: !!driverId,
    staleTime: 60_000,
    queryFn: async (): Promise<DriverTimelineItem[]> => {
      if (!driverId) return [];

      const [
        notifications,
        walletTransactions,
        payments,
        invoices,
        scoreEvents,
        inspections,
      ] = await Promise.all([
        safeRows<NotificationRow>(
          supabase
            .from('notifications')
            .select('id,title,message,notification_type,created_at')
            .eq('driver_id', driverId)
            .order('created_at', { ascending: false })
            .limit(8) as unknown as PromiseLike<QueryResponse<NotificationRow>>,
          'notifications',
        ),
        safeRows<WalletTransactionRow>(
          supabase
            .from('driver_wallet_transactions')
            .select('id,type,direction,amount,balance_after,created_at,note,invoice_id,payment_id')
            .eq('driver_id', driverId)
            .order('created_at', { ascending: false })
            .limit(8) as unknown as PromiseLike<QueryResponse<WalletTransactionRow>>,
          'wallet',
        ),
        safeRows<PaymentRow>(
          supabase
            .from('payments')
            .select('id,status,amount,amount_paid,payment_type,due_date,paid_date,paid_at,created_at')
            .eq('driver_id', driverId)
            .order('created_at', { ascending: false })
            .limit(8) as unknown as PromiseLike<QueryResponse<PaymentRow>>,
          'payments',
        ),
        safeRows<InvoiceRow>(
          supabase
            .from('invoice')
            .select('id,invoice_number,status,total_ttc,remaining_due,created_at,issued_at,paid_at,cancelled_at,cancel_reason')
            .eq('driver_id', driverId)
            .order('created_at', { ascending: false })
            .limit(8) as unknown as PromiseLike<QueryResponse<InvoiceRow>>,
          'invoice',
        ),
        safeRows<ScoreEventRow>(
          supabase
            .from('driver_score_events')
            .select('id,delta,reason,created_at')
            .eq('driver_id', driverId)
            .order('created_at', { ascending: false })
            .limit(8) as unknown as PromiseLike<QueryResponse<ScoreEventRow>>,
          'score',
        ),
        safeRows<InspectionRow>(
          supabase
            .from('vehicle_inspections')
            .select('id,status,due_at,submitted_at,reviewed_at,rejection_reason,created_at,updated_at')
            .eq('driver_id', driverId)
            .order('updated_at', { ascending: false })
            .limit(8) as unknown as PromiseLike<QueryResponse<InspectionRow>>,
          'inspections',
        ),
      ]);

      const items: DriverTimelineItem[] = [
        ...notifications.map((notification) => ({
          id: `notification-${notification.id}`,
          title: notification.title || 'Message DAM',
          description: notification.message || undefined,
          timestamp: timeLabel(notification.created_at),
          tone: notification.notification_type?.includes('payment') ? 'warning' as const : 'info' as const,
          icon: Bell,
          to: '/driver/notifications',
          sortDate: notification.created_at,
        })),
        ...walletTransactions.map((txn) => {
          const meta = walletTitle(txn);
          return {
            id: `wallet-${txn.id}`,
            title: meta.title,
            description: txn.note || `Solde après : ${formatCurrency(txn.balance_after)}`,
            timestamp: timeLabel(txn.created_at),
            tone: meta.tone,
            icon: Wallet,
            to: '/driver/portefeuille',
            amount: `${txn.amount >= 0 ? '+' : '-'}${formatCurrency(Math.abs(txn.amount))}`,
            sortDate: txn.created_at,
          };
        }),
        ...payments.map((payment) => {
          const meta = paymentTitle(payment);
          const remaining = Math.max(0, Number(payment.amount ?? 0) - Number(payment.amount_paid ?? 0));
          return {
            id: `payment-${payment.id}`,
            title: meta.title,
            description: payment.payment_type ? `Type : ${payment.payment_type}` : undefined,
            timestamp: timeLabel(meta.date),
            tone: meta.tone,
            icon: CreditCard,
            to: '/driver/finance',
            amount: remaining > 0 ? formatCurrency(remaining) : undefined,
            sortDate: meta.date,
          };
        }),
        ...invoices.map((invoice) => {
          const meta = invoiceTitle(invoice);
          return {
            id: `invoice-${invoice.id}`,
            title: meta.title,
            description: invoice.invoice_number || invoice.cancel_reason || undefined,
            timestamp: timeLabel(meta.date),
            tone: meta.tone,
            icon: FileText,
            to: `/driver/factures/${invoice.id}`,
            amount: invoice.status === 'paid' ? formatCurrency(invoice.total_ttc) : undefined,
            sortDate: meta.date,
          };
        }),
        ...scoreEvents.map((event) => ({
          id: `score-${event.id}`,
          title: event.delta >= 0 ? `Score +${event.delta}` : `Score ${event.delta}`,
          description: event.reason,
          timestamp: timeLabel(event.created_at),
          tone: event.delta >= 0 ? 'good' as const : 'warning' as const,
          icon: event.delta >= 0 ? TrendingUp : TrendingDown,
          to: '/driver/score',
          sortDate: event.created_at,
        })),
        ...inspections.map((inspection) => {
          const meta = inspectionTitle(inspection);
          return {
            id: `inspection-${inspection.id}`,
            title: meta.title,
            description: inspection.rejection_reason || undefined,
            timestamp: timeLabel(meta.date),
            tone: meta.tone,
            icon: ClipboardCheck,
            to: '/driver/fleet-control',
            sortDate: meta.date,
          };
        }),
      ];

      return items
        .sort((a, b) => new Date((b as DriverTimelineItem & { sortDate: string }).sortDate).getTime() - new Date((a as DriverTimelineItem & { sortDate: string }).sortDate).getTime())
        .slice(0, limit)
        .map(({ sortDate: _sortDate, ...item }: DriverTimelineItem & { sortDate?: string }) => item);
    },
  });
}
