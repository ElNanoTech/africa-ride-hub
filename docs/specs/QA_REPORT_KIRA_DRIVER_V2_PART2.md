# QA Report - KIRA Driver App v2 Part 2 Finance

Date: 2026-06-14
Mode: Orchestrator implementation + focused QA + Chrome mobile browser evidence
Seeded driver: `4c9bea2b-4a82-4d7f-bccb-b9baef1618fa`
Local QA URL: `http://127.0.0.1:8080`
Production app URL used by Edge Functions: `https://damafricahub.com`

## Freeze Decision

Part 2 is frozen for the implemented Finance, Wallet, Invoice, Wave checkout, credit eligibility, ownership-progress, realtime invalidation, and voice-help surfaces.

QA gate status: PASS for local implementation, build, tests, deployed Wave checkout creation, and required security/payment guards. Remaining TODOs are live-data or external-payment evidence items that cannot be honestly marked complete without a real Wave payment or extra seed data.

## Seeded Driver Evidence

- Driver id: `4c9bea2b-4a82-4d7f-bccb-b9baef1618fa`
- Wallet live state observed on `/driver/portefeuille`: `0 FCFA` available, `0 FCFA` reserved, `10 000 FCFA` month credits, `10 000 FCFA` month debits, `10 000 FCFA` recharges.
- Open invoices observed:
  - `FAC-TEST-2026-000002`: `3 000 FCFA` remaining.
  - `FAC-TEST-2026-000003`: `6 500 FCFA` remaining.
  - `FAC-TEST-2026-000004`: `6 500 FCFA` remaining.
- Partial invoice proof from the Part 1/Part 2 blocker data: invoice `3a2e3341-07a3-41e6-b8d6-6537763ba6e6`, payment `29dd2ea2-60a8-4c70-9916-590a1bfc25ee`, amount `1 000`, paid `400`, expected remaining due `600`.
- Wallet history shows a `10 000 FCFA` recharge, then auto-apply debits of `6 500 FCFA` and `3 500 FCFA`, with running balance after each transaction.
- Credit score evidence: seeded driver shows score `500` with insufficient history, so credit offers are correctly hidden.

## PASS/FAIL Matrix

| Required evidence | Result | Evidence |
| --- | --- | --- |
| Wallet - top-up | PASS | `/driver/portefeuille` -> Recharger -> Wave CTA returned `success: true`; checkout URL opened on `pay.wave.com`. Screenshots: `03-wallet-wave-topup-sheet-mobile.png`, `09-wave-checkout-opened.png`, `10-wallet-live-running-balance.png`. |
| Wallet - overpayment | PASS / CODE + LEDGER | Wave webhook inserts receipts; existing payment/wallet trigger path credits surplus as `overpayment_credit`; UI labels overpayment as `Trop-percu converti en credit DAM`. No live overpayment seed screenshot was present. |
| Wallet - auto-apply | PASS | Seeded wallet shows automatic debits applied to invoices after recharge, with remaining open invoices. Screenshots: `02-wallet-alias-mobile.png`, `10-wallet-live-running-balance.png`. |
| Wallet - cancellation refund | PASS / FIXED + TODO LIVE SEED | Backend migration emits `invoice_cancellation_refund`; wallet and finance labels now recognize that type. Live seeded driver does not currently show a cancelled paid invoice refund screenshot. |
| Wallet - running balance | PASS | Wallet history displays `Solde apres` values after each credit/debit. Screenshot: `10-wallet-live-running-balance.png`. |
| Invoices - unpaid | PASS | `/driver/factures` and Finance show open unpaid invoices. Screenshots: `01-finance-command-center-mobile.png`, `04-invoice-tabs-mobile.png`. |
| Invoices - partial | PASS | Partial invoice shows `Reste a payer 600 FCFA`, paid `400 / 1 000`, and Wave CTA for remaining due. Screenshots: `04-invoice-tabs-mobile.png`, `05-invoice-detail-mobile.png`. |
| Invoices - paid | PASS | Paid/history tab and payment breakdown support paid invoices; wallet history shows invoices settled by automatic credit. Screenshots: `04-invoice-tabs-mobile.png`, `08-invoice-detail-timeline-mobile.png`. |
| Invoices - overdue | PASS / CODE | Payable status includes `overdue`; Finance badges overdue as `En retard`, and invoice detail allows Wave only for `issued`, `partial`, or `overdue`. No overdue seed screenshot was present. |
| Invoices - cancelled | PASS / CODE + TODO LIVE SEED | Cancelled invoices are non-payable, remaining due resolves to `0`, and detail shows cancellation reason/refund text. No cancelled invoice seed screenshot was present for this driver. |
| Wave - payment success | PASS checkout creation / TODO actual paid webhook | Deployed `wallet-topup-checkout` created a Wave session and opened Pay with Wave. Actual payment completion was not executed, so webhook-paid ledger success remains a live-payment TODO. |
| Wave - duplicate protection | PASS | `wave-checkout` returns `409` when payment is closed or already has `wave_transaction_id`; blocker assertion previously passed live. |
| Wave - remaining_due only | PASS | `wave-checkout` computes `amount - amount_paid` and rejects requests above remaining due with `400`; partial blocker assertion passed live. |
| Wave - ownership validation | PASS | `wave-checkout` resolves authenticated driver by `user_id OR auth_user_id`, rejects admin callers, and rejects payments not owned by that driver/customer. |
| Realtime - wallet update | PASS | `useFinancialRealtime` invalidates `driver-wallet-self` and related keys on wallet transaction changes; wallet return flow also refetches after top-up success. |
| Realtime - invoice update | PASS | `useFinancialRealtime` invalidates driver invoice/payment keys on invoice/payment/receipt changes; invoice detail toasts when invoice status changes to paid/partial. |
| Realtime - auto-apply update | PASS | Auto-apply wallet debit insert triggers wallet toast and query invalidation; screenshot shows auto-apply ledger state after recharge. |
| Credit eligibility - eligible | FAIL / TODO LIVE SEED | Positive eligible UI path exists, but seeded driver is intentionally not eligible. Need an eligible seeded driver or temporary score/history seed to screenshot unlocked offers. |
| Credit eligibility - not eligible | PASS | Seeded driver shows no fake offers because score/history conditions are not met. Screenshots: `06-credit-eligibility-mobile.png`, `07-credit-no-fake-offers-mobile.png`. |
| Credit eligibility - explanation | PASS | Credit screen explains required score/history and missing points/weeks. Screenshot: `06-credit-eligibility-mobile.png`. |
| Credit eligibility - ownership progress | PASS | Finance/credit surfaces show score target and ownership progress requirements. Screenshots: `01-finance-command-center-mobile.png`, `06-credit-eligibility-mobile.png`. |
| Voice help - speaker icon | PASS | Kira voice buttons are visible on Finance, Wallet, Invoice list/detail, Credit, and Ownership surfaces. Screenshots: `01`, `02`, `04`, `05`, `06`. |
| Voice help - playback | PASS / CODE | `KiraVoiceButton` uses browser `speechSynthesis`, toggles speaking state, and cancels playback on stop/unmount. Audio output itself is not machine-verifiable in this QA run. |
| Voice help - fallback behavior | PASS | If `speechSynthesis` is unavailable, the button disables, shows `VolumeX`, and exposes `Audio indisponible sur ce telephone`. |

## Wave Checkout Evidence

Final wallet top-up retry from Chrome console:

```json
{
  "success": true,
  "checkout_url": "https://pay.wave.com/c/cos-25dmxb6x023nj?a=5000&c=XOF&m=Yango%20-%20Dam%20Africa%20Recettes",
  "payment_id": "aa1f40b8-f447-4308-a0d8-390be71ea20a",
  "session_id": "cos-25dmxb6x023nj"
}
```

Observed result: Chrome opened a `Pay with Wave` tab at the returned `pay.wave.com` URL. No payment was submitted.

## Screenshots

- `docs/specs/qa-artifacts/part2/01-finance-command-center-mobile.png`
- `docs/specs/qa-artifacts/part2/02-wallet-alias-mobile.png`
- `docs/specs/qa-artifacts/part2/03-wallet-wave-topup-sheet-mobile.png`
- `docs/specs/qa-artifacts/part2/04-invoice-tabs-mobile.png`
- `docs/specs/qa-artifacts/part2/05-invoice-detail-mobile.png`
- `docs/specs/qa-artifacts/part2/06-credit-eligibility-mobile.png`
- `docs/specs/qa-artifacts/part2/07-credit-no-fake-offers-mobile.png`
- `docs/specs/qa-artifacts/part2/08-invoice-detail-timeline-mobile.png`
- `docs/specs/qa-artifacts/part2/09-wave-checkout-opened.png`
- `docs/specs/qa-artifacts/part2/10-wallet-live-running-balance.png`

## Automated Checks

| Check | Result |
| --- | --- |
| `bunx tsc --noEmit` | PASS |
| Focused ESLint on Part 2 finance files | PASS |
| `bun run test` | PASS - 10 files / 109 tests |
| `bun run test src/lib/financeAmounts.test.ts` after refund-label fix | PASS - 1 file / 3 tests |
| `bun run build` | PASS - existing Vite chunk/dynamic import warnings only |
| `git diff --check` | PASS |

## Bugs Found

- Wallet top-up initially surfaced Supabase's generic `Edge Function returned a non-2xx status code`, hiding the Wave error body.
- `wallet-topup-checkout` originally resolved only one driver auth column, which could fail for seeded drivers stored on `auth_user_id`.
- Wave rejected relative or non-HTTPS redirect URLs when `Origin` was absent from `supabase.functions.invoke`.
- Restricting Wave payer mobile was too strict because the driver's Wave wallet can differ from their login/profile phone.
- The app had Finance as the visible bottom-nav item while the wallet lived at `/driver/portefeuille`, which made Portefeuille feel missing until the route was opened directly.
- Cancellation refund wallet rows use backend type `invoice_cancellation_refund`, but the driver wallet/finance labels did not recognize that type before this QA pass.

## Bugs Fixed

- `TopUpSheet` now direct-fetches `wallet-topup-checkout`, parses non-2xx JSON bodies, logs safe diagnostics, opens the returned Wave URL, and shows a manual `Continuer vers Wave` fallback.
- `wallet-topup-checkout` now resolves drivers by `user_id OR auth_user_id`, validates HTTPS redirect URLs, falls back to `PUBLIC_APP_URL=https://damafricahub.com`, removes payer-phone restriction, supports optional Wave signing, and returns safe Wave error diagnostics.
- `wave-checkout` enforces driver-only ownership, blocks admin callers, rejects closed/duplicate payments, and caps checkout amount to remaining due.
- Shared `financeAmounts` helpers now drive remaining due, paid amount, and payable status across invoice list/detail, including partial and cancelled/paid invoices.
- `Wallet.tsx` and `Finance.tsx` now label `invoice_cancellation_refund` as a cancellation recredit/refund instead of exposing the raw backend type.

## Remaining TODOs

- Complete one real Wave payment or approved Wave sandbox payment, then capture webhook-created receipt, wallet update, invoice update, and paid state.
- Seed or locate a paid cancelled invoice for the seeded driver, then capture the cancellation refund row and cancelled invoice detail.
- Seed or locate an eligible driver with enough score/history, then capture unlocked credit offers.
- Seed or locate an overdue invoice for the seeded driver, then capture the overdue badge/state.
- Deploy the frontend build from this branch to the production/custom domain when ready; local build is verified.

