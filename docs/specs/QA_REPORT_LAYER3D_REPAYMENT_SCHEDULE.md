# QA Report: Layer 3D - Repayment Schedule & Credit Account Terms Engine

Date: June 17, 2026
Result: PASS

## Scope

Layer 3D was verified against the live Supabase tenant and local Vite app at `http://127.0.0.1:8082`.

The run covered:

- Active-credit-account repayment schedule generation.
- Layer 3B approval and Layer 3C fully executed contract preconditions.
- Immutable schedule and scheduled obligation generation from product repayment terms.
- Financial Engine invoice and `payments`/`invoice_payment_link` linkage.
- Idempotent schedule and invoice RPC retries.
- Payment-state synchronization from invoice status to scheduled obligation status.
- Schedule amendment and supersession behavior.
- Reconciliation anomaly detection.
- Admin repayment operations UI.
- Driver-safe repayment status in the credit flow and invoice visibility in finance.
- Driver DTO masking for internal terms, source snapshots, policies, audit data, and raw enum details.
- Console, page error, failed request, and HTTP error collection.

## Commands

```sh
bun run scripts/qa/00-seed.ts
QA_APP_URL=http://127.0.0.1:8082 QA_SHOT_DIR="docs/specs/screenshots/layer3d" bun run scripts/qa/21-layer3d-repayment-schedule.ts
```

## Verification Matrix

All 48 checks passed. Full machine-readable matrix:

- `docs/specs/screenshots/layer3d/layer3d-qa-matrix.json`

Key checks:

- Schedule generation blocked before activation: PASS.
- Fresh Layer 3D driver isolated for the run: PASS.
- Layer 3B approval available: PASS (`APPROVED_WITH_CONDITIONS`).
- Contract fully executed before activation: PASS.
- Underwriting conditions fulfilled before activation: PASS.
- Down payment paid through Financial Engine invoice: PASS.
- Credit account activated: PASS.
- Active account generated an active schedule: PASS.
- Schedule pinned fully executed contract and product version: PASS.
- Four obligations generated for the configured vehicle product terms: PASS.
- Money remained integer minor units: PASS.
- Invoice generated through the Financial Engine: PASS.
- Duplicate invoice retry prevented: PASS.
- Invoice payable row linked to `loan_repayment`: PASS.
- Paid invoice synchronized obligation to `PAID`: PASS.
- Schedule amendment superseded old schedule: PASS.
- Reconciliation detected an injected schedule total mismatch: PASS.
- Driver-safe DTO masked internals: PASS.
- Admin browser flow passed: PASS.
- Driver credit and finance browser flow passed: PASS.
- Console/network findings: PASS, `0 finding(s)`.

## Screenshots

- `docs/specs/screenshots/layer3d/110-layer3d-admin-repayment-schedules.png`
- `docs/specs/screenshots/layer3d/111-layer3d-scheduled-obligations.png`
- `docs/specs/screenshots/layer3d/112-layer3d-invoice-linkage.png`
- `docs/specs/screenshots/layer3d/113-layer3d-reconciliation.png`
- `docs/specs/screenshots/layer3d/114-layer3d-driver-credit-schedule.png`
- `docs/specs/screenshots/layer3d/115-layer3d-driver-finance.png`

## Notes

- The local QA helper was hardened to wait for the driver login native phone/PIN form before falling back to the selection button.
- The live database includes the Layer 3D sync-status ambiguity hotfix; payment sync passed in E2E.
- No remaining SQL is required for this QA run.
