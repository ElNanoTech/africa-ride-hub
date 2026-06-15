# Layer 2C Financial Operations Center - Implementation Plan Notes

Date: 2026-06-15
Scope: KIRA Admin App V3 Layer 2C

## Approved Constraints

- Primary route: `/admin/financial-operations`.
- Legacy command-center alias: `/admin/finance`.
- Existing engines remain supported at `/admin/billing`, `/admin/payments`, and `/admin/billing/wallets`.
- Do not reference fake routes such as `/admin/facturation` or `/admin/wallets`.
- Layer 2C is a unifying operations layer over existing finance engines, not a finance backend rewrite.
- V1 roles are `super_admin` and `manager` only.
- Bulk actions are limited to Reminder and Export. Assign Agent is out of scope until a real assignment model exists.
- Realtime reuses `useFinancialRealtime`; only query invalidation keys are extended.
- Financial reads are enabled only after the shared role guard confirms `super_admin` or `manager`.
- KPI and queue source queries page through existing PostgREST data with `fetchAllRows` so metrics are not silently clipped by client response limits.
- Audit handoffs stay on approved existing routes, primarily `/admin/billing`.

## Metric Definitions

| Metric | Definition |
| --- | --- |
| Expected Today | Payments due today with `pending`, `partial`, `late`, or `overdue` status; amount = remaining due. |
| Collected Today | Real cash-in receipts received today. Wallet auto-apply receipts are excluded to avoid double-counting external cash. |
| Recovery Rate | `Collected Today / Expected Today`, expressed as a percentage. |
| Outstanding Balance | Sum of invoice remaining due. Never raw invoice total. |
| Drivers Overdue | Unique drivers with overdue payments using the shared `isPaymentOverdue` rule. |
| Wallet Balance Exposure | Positive available wallet balances outstanding. |
| Active Rentals | Rentals in the shared open-rental status set. |

## Safe Reconciliation Actions

Only these backend-supported actions are callable from Layer 2C:

- `reconcile_invoice_status`
- `apply_wallet_credit_to_open_invoices`
- `reverse_cancelled_invoice_payments`

All other anomaly rows render as View/Escalate only with a disabled reason.

## First-Viewport Requirement

The Daily Rental Command Center is visible immediately below the KPI row and repeated at the top of the Collections tab so daily rental stays central.

Its highest-risk driver list is constrained to rental-payment drivers only, even when loan or wallet items exist in the broader collections queue.
