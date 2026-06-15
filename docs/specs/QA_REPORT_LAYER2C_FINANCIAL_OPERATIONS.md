# QA Report - KIRA Admin App V3 Layer 2C

Date: 2026-06-15
Scope: Admin Financial Operations Center
Seeded admin: `e2e-customer-admin@dam-test.local`
Seeded driver: `4c9bea2b-4a82-4d7f-bccb-b9baef1618fa`
Environment: local Vite app on `http://127.0.0.1:8081`, live Supabase backend

## Summary

Layer 2C adds a unifying Financial Operations Center over the existing finance engines. It does not rewrite billing, payments, wallets, Wave, or invoice settlement.

- Primary route: `/admin/financial-operations`
- Legacy alias: `/admin/finance`
- Existing engines preserved: `/admin/billing`, `/admin/payments`, `/admin/billing/wallets`
- Daily Rental Command Center is visible in the first viewport and repeated in Collections
- V1 roles are limited to `super_admin` and `manager`
- Bulk actions are Reminder and Export only
- Reconciliation actions are constrained to safe RPCs only
- Realtime reuses `useFinancialRealtime`

## Screenshots

| Evidence | File |
| --- | --- |
| Overview and first-viewport Daily Rental Command Center | `docs/specs/screenshots/layer2c/45-layer2c-overview-command-center.png` |
| Collections queue | `docs/specs/screenshots/layer2c/46-layer2c-collections.png` |
| Reminder action result | `docs/specs/screenshots/layer2c/47-layer2c-reminder-result.png` |
| Payment feed | `docs/specs/screenshots/layer2c/48-layer2c-payments-feed.png` |
| Payment detail sheet | `docs/specs/screenshots/layer2c/49-layer2c-payment-detail.png` |
| Wallet operations | `docs/specs/screenshots/layer2c/50-layer2c-wallet-operations.png` |
| Reconciliation queue | `docs/specs/screenshots/layer2c/51-layer2c-reconciliation.png` |
| Cash flow | `docs/specs/screenshots/layer2c/52-layer2c-cash-flow.png` |
| Financial health | `docs/specs/screenshots/layer2c/53-layer2c-financial-health.png` |
| Audit | `docs/specs/screenshots/layer2c/54-layer2c-audit.png` |
| Mobile viewport | `docs/specs/screenshots/layer2c/55-layer2c-mobile.png` |
| Machine-readable matrix | `docs/specs/screenshots/layer2c/layer2c-qa-matrix.json` |

## PASS/FAIL Matrix

| Check | Result |
| --- | --- |
| `/admin/financial-operations` primary route loads | PASS |
| `/admin/finance` alias loads Financial Operations | PASS |
| `/admin/payments` preserved | PASS |
| `/admin/billing` preserved | PASS |
| `/admin/billing/wallets` preserved | PASS |
| KPI row shows Collected Today, Expected Today, Recovery Rate, Outstanding Balance | PASS |
| Metric definitions are visible and match approved constraints | PASS |
| Daily Rental Command Center is first-viewport central | PASS |
| All 8 tabs load | PASS |
| Collections tab keeps Daily Rental central | PASS |
| Bulk actions limited to Send Reminder and Export | PASS |
| Reminder action submits with user-facing result | PASS |
| Export action downloads collections CSV | PASS |
| Payment detail shows invoice, remaining due, wallet applied, and timeline | PASS |
| Wallet operations shows total balance, timeline, anomalies, auto-applies | PASS |
| Reconciliation copy/actions constrained to safe repairs or disabled Escalate | PASS |
| Cash Flow, Financial Health, and Audit tabs load | PASS |
| Fake routes `/admin/facturation` and `/admin/wallets` absent | PASS |
| Assign Agent absent from V1 bulk actions | PASS |
| Mobile route loads and keeps Daily Rental visible | PASS |
| Console/network findings | PASS, 0 findings |

Automated matrix: PASS, 53/53 checks, 0 console/network findings.

## Verification Commands

```bash
npx eslint src/lib/financialOperations.ts src/lib/financialOperations.test.ts src/pages/admin/FinancialOperations.tsx src/App.tsx src/components/AdminLayout.tsx src/hooks/useFinancialRealtime.ts scripts/qa/14-layer2c-financial-operations.ts
bun run test -- src/lib/financialOperations.test.ts src/lib/financeAmounts.test.ts
npm run build
QA_APP_URL=http://127.0.0.1:8081 QA_SHOT_DIR=docs/specs/screenshots/layer2c bun run scripts/qa/14-layer2c-financial-operations.ts
```

Results:

- Focused lint: PASS.
- Metric helper tests: PASS, 8 tests.
- Production build: PASS with existing Vite warnings only.
- Layer 2C Playwright QA: PASS, 53/53 checks, 0 console/network findings.
- In-app browser visual sanity check: PASS; title, 8 tabs, approved routes, metric definitions, and first-viewport Daily Rental were visible.

## Bugs Found And Fixed

| Bug | Fix | Status |
| --- | --- | --- |
| Live `credit_scores` query used non-existent `calculated_at` column | Switched to existing `calculation_week` and `created_at` fields | Fixed |
| Role guard rendered denial after finance reads could start | Gated realtime and finance queries behind `super_admin`/`manager` access | Fixed |
| KPI source reads could be clipped by response limits | Reused existing `fetchAllRows` pagination for metric/queue source queries | Fixed |
| Daily Rental highest-risk list could include non-rental debt | Filtered highest-risk drivers to rental-payment drivers only | Fixed |
| Health copy mentioned unsupported failed status wording | Changed copy to late/overdue only | Fixed |
| Audit handoff linked outside the approved Layer 2C route set | Replaced with `/admin/billing` handoff | Fixed |

## Production Verification Summary

Local build asset for this implementation:

- `dist/assets/index-Cl-fvs6A.js`
- `dist/assets/FinancialOperations-C0cwbpMi.js`

Post-push production check:

- `https://damafricahub.com/admin/financial-operations` returns HTTP 200.
- `https://damafricahub.com/` still serves `/assets/index-DP5T0Bn1.js`.
- That public bundle does not yet include `FinancialOperations` or `Daily Rental Command Center`.

Conclusion: Git push is complete, but the Lovable production publish step has not swapped the public build yet. Publish from Lovable, then re-check that the root HTML points to the new bundle and that the published JavaScript includes the Layer 2C Financial Operations chunk.
