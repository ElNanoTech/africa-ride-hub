# Live Financial Center — Event-Driven + Realtime UI

## Current state (verified)

Backend is already near-real-time. These DB triggers exist and run inside the same transaction as the event:

- `trg_invoice_auto_apply` on `invoice` INSERT / UPDATE of `status, total_ttc, amount_paid` → calls `apply_wallet_credit_to_open_invoices(driver_id)`. **A newly issued invoice already consumes existing wallet credit immediately, oldest-first.**
- `trg_wallet_txn_auto_apply` on wallet credit insert → auto-applies to open invoices.
- `trg_receipt_auto_apply` on `payment_receipts` insert → auto-applies (catches Wave overpayments).
- `trg_invoice_cancellation_refund` on `invoice.status → cancelled` → reverses to wallet.
- Safety net cron `sweep_wallet_auto_apply` runs every 15 minutes.

What's missing is on the **UI side**: only `payments` is in `supabase_realtime`. The driver wallet/invoice pages and admin billing pages currently rely on focus refetch + post-checkout polling, which is why the user perceives delay.

## Goal

When money moves anywhere in the system, every relevant screen (driver wallet, driver invoices, driver home financial widget, admin billing, admin wallets, admin reconciliation) updates within ~1 second without a manual refresh. Cron and polling remain only as a safety net.

## Plan

### 1. Backend: enable realtime on financial tables (migration)

Add the missing tables to `supabase_realtime` and set `REPLICA IDENTITY FULL` so update payloads carry old rows:

```text
driver_wallets
driver_wallet_transactions
invoice
payment_receipts
invoice_audit
invoice_payment_link
```

`payments` is already published — leave it.

Also confirm/add (idempotent) the auto-apply trigger on `payments` INSERT in case admin inserts a payment shell after the invoice exists, so existing wallet credit is consumed against it immediately. Triggers stay `SECURITY DEFINER`.

No business logic changes — the auto-apply RPC, cancellation reversal RPC, and the 15-min sweep are already correct and idempotent.

### 2. Shared hook for realtime financial invalidation

New file `src/hooks/useFinancialRealtime.ts`:

- Subscribes to postgres_changes on the 6 financial tables, filtered by `driver_id` when the caller is a driver (or unfiltered for admin).
- On any event, invalidates the relevant React Query keys: `driver-wallet-self`, `driverPayments`, `driverInvoices`, `invoice-detail`, `admin-billing-*`, `admin-wallets-*`, `admin-reconciliation-*`.
- Uses one channel per scope (driver vs admin) to keep socket count low.
- Cleans up subscriptions on unmount; reconnects automatically via the existing `RealtimeConnectionBanner`.

### 3. Wire the hook into the screens

Driver:
- `src/pages/driver/Wallet.tsx` — replace the post-checkout 0/3/8/20s polling with the realtime hook (keep a single safety refetch on `?topup=success` return for the case where the webhook lags Wave's redirect).
- `src/pages/driver/Factures.tsx` and `src/pages/driver/FactureDetail.tsx` — subscribe so paid/partial status flips live.
- `src/pages/driver/Home.tsx` financial summary widget — subscribe to wallet + invoice changes.

Admin:
- `src/pages/admin/Billing.tsx` (Invoices + À résoudre tabs)
- `src/pages/admin/Wallets.tsx`
- `src/pages/admin/Payments.tsx`
- `src/pages/admin/BillingAudit.tsx`

Each screen just calls `useFinancialRealtime({ scope: 'driver' | 'admin', driverId? })`; query keys are already stable.

### 4. Driver UX surface (small additions only)

- On the wallet page, when a realtime debit of type `rental_invoice_applied` arrives, show a one-shot toast: *"Crédit appliqué automatiquement à la facture {numéro}."*
- On `FactureDetail`, when status flips to `paid` or `partial` via realtime, show: *"Cette facture a été payée par votre crédit DAM."* / *"Crédit DAM appliqué : {montant}. Reste à payer : {reste}."* The "Payer avec Wave" button only shows `remaining_due` (already the case — verify).

### 5. Keep cron as safety net

No change. `sweep_wallet_auto_apply` every 15 min and `billing-daily-rental-cron` hourly stay as-is.

## Idempotency (already in place — verified, will retest)

- `driver_wallet_transactions.amount > 0` CHECK constraint.
- `apply_wallet_credit_to_open_invoices` row-locks wallet + invoice.
- `uniq_invoice_cancellation_refund_per_source` partial unique index on reversal rows.
- `wallet_auto_apply` audit rows are insert-only; the RPC only fires when balance > 0.
- Realtime invalidation is read-only on the client; no write amplification.

## Acceptance tests

1. **Surplus visible immediately** — admin inserts a Wave receipt of 10 000 on a 4 000 invoice → driver's `/driver/portefeuille` shows the 6 000 credit within ~1s without refresh.
2. **New invoice consumed immediately** — wallet has 5 000, admin issues a 3 000 invoice → invoice appears as `paid`, wallet drops to 2 000, both visible live on driver wallet + factures pages.
3. **Partial coverage** — wallet 2 000, new invoice 5 000 → invoice shows `partial`, "Reste à payer 3 000 FCFA" via Wave, wallet hits 0.
4. **Cancellation reversal live** — admin cancels a paid invoice → driver wallet credit appears within ~1s.
5. **Idempotency** — re-run `apply_wallet_credit_to_open_invoices` and `reverse_cancelled_invoice_payments` → 0 new rows, 0 balance change.
6. **Cron still works** — simulate a missed trigger by inserting a wallet credit with the trigger temporarily disabled, then re-enable; the 15-min sweep picks it up.

## Technical notes

- `ALTER PUBLICATION supabase_realtime ADD TABLE ...` and `ALTER TABLE ... REPLICA IDENTITY FULL` run in a single migration.
- Realtime channels are named `financial:driver:{driverId}` and `financial:admin` to avoid cross-talk.
- React Query `invalidateQueries` is debounced (~150ms) inside the hook so a burst of related events (wallet debit + invoice update + audit insert from one auto-apply call) triggers one refetch per key, not three.
- No edits to `src/integrations/supabase/client.ts` or `types.ts`.
