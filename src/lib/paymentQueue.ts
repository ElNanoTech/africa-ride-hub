/**
 * Offline-first payment queue.
 *
 * Why: Drivers in Côte d'Ivoire frequently lose connectivity (3G/Edge drops,
 * tunnels, basements). When they tap "Payer avec Wave" while offline, we don't
 * want them to see a generic error and give up. Instead, we queue the intent
 * locally, then auto-process it the moment the network returns.
 *
 * Wave checkout requires a redirect to a hosted URL, so we cannot truly
 * complete a payment offline. What we can do:
 *   1. Queue the intent (paymentId + amount + URLs) in localStorage.
 *   2. When `navigator.onLine` flips back to true, call `wave-checkout`
 *      to mint a fresh checkout session URL.
 *   3. Surface a toast/banner: "Votre paiement est prêt. Appuyez pour
 *      finaliser." — the driver taps once and gets redirected to Wave.
 *
 * The queue is keyed by paymentId so duplicates are deduped automatically.
 */

const STORAGE_KEY = 'dam-payment-queue-v1';

export interface QueuedPayment {
  paymentId: string;
  amount: number;
  successUrl: string;
  errorUrl: string;
  /** ISO timestamp when the driver originally tapped Pay. */
  queuedAt: string;
  /** How many times we've tried to mint a Wave checkout session. */
  attempts: number;
  /** Last error message, if any (for debugging / UI). */
  lastError?: string;
}

function readQueue(): QueuedPayment[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedPayment[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    // Notify in-tab listeners (the storage event only fires cross-tab).
    window.dispatchEvent(new CustomEvent('payment-queue-changed'));
  } catch (err) {
    console.error('[paymentQueue] Failed to persist queue:', err);
  }
}

export function getQueue(): QueuedPayment[] {
  return readQueue();
}

export function getQueuedPayment(paymentId: string): QueuedPayment | undefined {
  return readQueue().find((p) => p.paymentId === paymentId);
}

export function isQueued(paymentId: string): boolean {
  return readQueue().some((p) => p.paymentId === paymentId);
}

export function enqueuePayment(
  intent: Omit<QueuedPayment, 'queuedAt' | 'attempts' | 'lastError'>,
): QueuedPayment {
  const queue = readQueue();
  const existing = queue.find((p) => p.paymentId === intent.paymentId);
  if (existing) {
    // Refresh the success/error URLs in case they changed (different origin),
    // but keep the original queuedAt so the user sees how long it's been waiting.
    existing.amount = intent.amount;
    existing.successUrl = intent.successUrl;
    existing.errorUrl = intent.errorUrl;
    writeQueue(queue);
    return existing;
  }
  const entry: QueuedPayment = {
    ...intent,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  queue.push(entry);
  writeQueue(queue);
  return entry;
}

export function removeFromQueue(paymentId: string): void {
  const queue = readQueue().filter((p) => p.paymentId !== paymentId);
  writeQueue(queue);
}

export function markAttempt(paymentId: string, error?: string): void {
  const queue = readQueue();
  const entry = queue.find((p) => p.paymentId === paymentId);
  if (!entry) return;
  entry.attempts += 1;
  entry.lastError = error;
  writeQueue(queue);
}

export function clearQueue(): void {
  writeQueue([]);
}

export const PAYMENT_QUEUE_EVENT = 'payment-queue-changed';
