# QA Report - Layer 3A Credit Product Engine

Date: 2026-06-15
Branch: `codex/kira-driver-v2-part1`

## Scope

Layer 3A implements the credit product engine foundation:

- Versioned credit product catalog across vehicles, motorcycles, phones, appliances, equipment, fleet expansion, and future product types.
- Persisted credit applications referencing `product_version_id`.
- Immutable application snapshots using authoritative `driver_scores.current_score`.
- Vendor-referenced financed assets and fulfillment records.
- Permissioned review, down-payment invoice, activation-package, and account-activation RPCs.
- One-time down-payment invoice integration with the existing Financial Engine.
- Exposure and policy foundations stored for Layer 3B, without 3A exposure enforcement.
- Driver credit UI and admin Credit Operations UI.

## Automated Checks

Passed:

- `bun run test -- src/lib/creditProductEngine.test.ts src/lib/growthOwnership.test.ts src/lib/creditJourney.test.ts src/lib/payments.test.ts`
- Focused ESLint for Layer 3A source, route, hook, QA, and billing touchpoints.
- `npm run build`
- In-app browser sanity:
  - `/admin/credit-operations` renders the Layer 3A shell, handoffs, and migration/data warning.
  - `/driver/credit` renders the Layer 3A driver card and does not expose raw `SUBMITTED`/`NOT_ELIGIBLE`, `IMEI`, or `VIN` labels.

Known project-wide failures unrelated to Layer 3A:

- `npm run lint` still fails on existing repo-wide lint debt outside the Layer 3A changes.
- `npx tsc -p tsconfig.app.json --noEmit` still fails on existing unrelated files such as `DriverOperationsHub.tsx`, `useDriverActivityTimeline.ts`, `financialOperations.ts`, `Communication.tsx`, and `Dashboard.tsx`.

## Layer 3A QA Matrix

Command:

```bash
QA_APP_URL=http://127.0.0.1:8082 QA_SHOT_DIR=docs/specs/screenshots/layer3a bun run scripts/qa/18-layer3a-credit-engine.ts
```

Result: blocked by remote database schema not yet migrated.

Evidence:

- `bun run scripts/qa/00-seed.ts` seeded the E2E tenant and driver, but skipped Layer 3A catalog seed because `public.vendors` was missing from the live Supabase schema cache.
- The Layer 3A QA matrix produced 34 passing checks and 9 failing checks.
- The 44 console/network findings are expected before applying the Layer 3A migration: 404s for new Layer 3A tables and 400s for new invoice columns.

Generated artifacts:

- `docs/specs/screenshots/layer3a/91-layer3a-admin-credit-operations.png`
- `docs/specs/screenshots/layer3a/92-layer3a-product-catalog.png`
- `docs/specs/screenshots/layer3a/93-layer3a-activation-packages.png`
- `docs/specs/screenshots/layer3a/94-layer3a-fulfillment.png`
- `docs/specs/screenshots/layer3a/95-layer3a-exposure.png`
- `docs/specs/screenshots/layer3a/96-layer3a-legacy-loans-handoff.png`
- `docs/specs/screenshots/layer3a/97-layer3a-financial-operations-handoff.png`
- `docs/specs/screenshots/layer3a/98-layer3a-driver-credit-products.png`
- `docs/specs/screenshots/layer3a/99-layer3a-journey-regression.png`
- `docs/specs/screenshots/layer3a/layer3a-qa-matrix.json`

## Blocker

The remote Supabase project has not yet applied:

```text
supabase/migrations/20260615090000_layer3a_credit_product_engine.sql
```

Until that migration is applied, persisted Layer 3A E2E checks cannot pass because the live backend does not expose the new tables, RPCs, RLS policies, or invoice columns.

## Re-run After Migration

After applying the migration to Supabase, run:

```bash
bun run scripts/qa/00-seed.ts
QA_APP_URL=http://127.0.0.1:8082 QA_SHOT_DIR=docs/specs/screenshots/layer3a bun run scripts/qa/18-layer3a-credit-engine.ts
```

Expected outcome after migration:

- Layer 3A catalog seed succeeds.
- Product/vendor checks pass.
- Driver credit and journey regression checks pass with an authenticated driver.
- Console/network findings for missing Layer 3A schema disappear.
