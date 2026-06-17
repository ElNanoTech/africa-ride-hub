# QA Report — Layer 3E Delinquency, Collections & Credit Risk Operations

## Scope

Layer 3E implements delinquency and collections operations on top of Layer 3D repayment obligations and Financial Engine invoices.

It does not create contracts, repayment schedules, legal actions, repossession workflows, title transfer, or payment settlement. Financial Engine invoices, payments, Wave, wallets, and ledger state remain the payment source of truth.

## Implemented Surfaces

- Database migration: `supabase/migrations/20260617023000_layer3e_credit_collections.sql`
- Admin console: `/admin/credit-collections`
- Driver-safe credit status: `/driver/credit`
- Driver finance signal: `/driver/finance`
- Driver 360 integration: collections signal/action line
- Attention Center integration: open collections cases appear as growth/risk actions
- Financial Operations integration: credit collections snapshot and queue link
- Trust & Risk integration: score events from collections are labeled as readable operational events
- QA script: `scripts/qa/22-layer3e-delinquency-collections.ts`
- Screenshots directory: `docs/specs/screenshots/layer3e`

## Migration Notes

- Primary migration: `supabase/migrations/20260617031328_37a268b5-cd64-4d37-8046-9af431732987.sql`
- Hotfix migration: `supabase/migrations/20260617034848_ed23c7d6-3cc7-4dfe-a417-bcb86fb55588.sql`
- The hotfix qualifies `credit_promises_to_pay.case_id` and `credit_promises_to_pay.promise_status` inside `sync_credit_collections` to avoid ambiguity with the RPC's `RETURNS TABLE` output columns during paid-invoice resolution.

## DB/RPC Guardrails

- Versioned `collections_rules_json` on `product_versions`
- Open-case uniqueness per tenant, credit account, and obligation
- Idempotency keys on cases, actions, promises, reminders, and escalations
- Immutable action/audit records
- SECURITY DEFINER RPCs for all write paths
- RLS tenant read policies and platform-owner bypass
- Driver-safe RPC `get_driver_collections_status()`
- Reconciliation view `v_credit_collections_reconciliation_anomalies`
- Realtime publication for collections tables

## QA Matrix

The script verifies:

- Fresh QA driver/account/schedule/invoice path from Layers 3A-3D
- Financial Engine invoice is aged past due
- `sync_credit_collections` creates one open case only
- Contact logging is idempotent
- In-app reminder is logged and notification-backed
- Partial invoice payment moves the case to partial recovery
- Promise-to-pay creation is idempotent
- Broken promise escalates risk
- Priority review opens through guarded RPC
- Paid invoice resolves the case through Financial Engine sync
- Reconciliation detects overdue obligation without a collections case
- Driver DTO masks raw enum/internal/audit/idempotency/legal/repo language
- Admin queue, workbench, reconciliation, Driver 360, Financial Ops, driver credit, and driver finance routes render
- Console/network findings are collected and fail the run unless known hosted-auth bootstrap noise

## E2E Result

Status: PASS

Run date: 2026-06-16 America/New_York

Summary:

- 37 QA checks passed
- 0 unexpected console/network findings
- 1 known hosted-auth bootstrap console finding ignored
- Fresh isolated QA driver: `14b4cda8-e5ef-45c2-992d-ca3fbbda056e`
- Collections case created by sync: `f599c109-4218-420e-9b56-740cadd611d7`
- Paid invoice resolution reason: `paid_invoice_synced`
- Reconciliation anomalies detected: 2
- QA matrix artifact: `docs/specs/screenshots/layer3e/layer3e-qa-matrix.json`

Screenshots captured:

- `docs/specs/screenshots/layer3e/120-layer3e-admin-collections-queue.png`
- `docs/specs/screenshots/layer3e/121-layer3e-case-workbench.png`
- `docs/specs/screenshots/layer3e/122-layer3e-reconciliation.png`
- `docs/specs/screenshots/layer3e/123-layer3e-driver360-collections.png`
- `docs/specs/screenshots/layer3e/124-layer3e-financial-ops-bridge.png`
- `docs/specs/screenshots/layer3e/125-layer3e-driver-credit-collections.png`
- `docs/specs/screenshots/layer3e/126-layer3e-driver-finance-collections.png`

## Run Command

```sh
QA_APP_URL=http://127.0.0.1:8082 \
QA_SHOT_DIR=docs/specs/screenshots/layer3e \
bun run scripts/qa/22-layer3e-delinquency-collections.ts
```

## Local Validation Note

`npx supabase db lint --local --level warning` could not run because Docker/local Supabase was not running:

```text
failed to connect to postgres: dial tcp 127.0.0.1:54322: connect: connection refused
Cannot connect to the Docker daemon
```

Live migration validation was completed through the Layer 3E QA script after applying the primary migration and hotfix migration.
