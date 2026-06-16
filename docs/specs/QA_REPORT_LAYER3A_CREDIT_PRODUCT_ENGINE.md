# QA Report - Layer 3A Credit Product Engine

Date: 2026-06-16
Branch: `codex/kira-driver-v2-part1`
Supabase project: `fihrjavcdwpttvnlqqxc`
Published app: `https://africa-ride-hub.lovable.app` -> `https://damafricahub.com`

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

## Live Backend Verification

Passed against Lovable Cloud Supabase `fihrjavcdwpttvnlqqxc`:

- Platform-owner auth: `info@naffaglobal.com`.
- 15 Layer 3A tables reachable with RLS:
  - `vendors`, `credit_products`, `product_versions`, `financed_assets`, `credit_applications`, `credit_snapshots`, `credit_asset_assignments`, `credit_decisions`, `credit_agreements`, `fulfillment_records`, `activation_packages`, `credit_accounts`, `credit_exposure_profiles`, `credit_policy_sets`, `credit_audit_events`.
- Launch catalog present:
  - 3 vendors
  - 5 credit products
  - 5 product versions
  - 3 financed assets
  - 1 draft policy set

Persisted workflow passed:

- Created a managed QA driver through `create-managed-driver`.
- Activated the driver and seeded `driver_scores.current_score = 780`.
- Driver authenticated through the real native phone/PIN auth derivation.
- `submit_credit_application` created application `809b4713-bcd4-4ae8-b00a-851a1df62ee1`.
- Application persisted with product version `32000000-0000-0000-0000-000000000001`.
- Platform owner `review_credit_application` approved the application.
- `create_credit_down_payment_invoice` created one issued `DOWN_PAYMENT` invoice for `400000 XOF`.
- `create_activation_package` returned `BLOCKED` with real readiness blockers:
  - `signed_agreement_required`
  - `down_payment_not_settled`
  - `asset_assignment_required`
  - `possession_confirmation_required`
- `activate_credit_account` was blocked with `activation package is not ready`.
- No credit account was created.
- Audit events were recorded for application submission, decision, invoice, and activation package evaluation.

## Published App QA Matrix

Command:

```bash
VITE_SUPABASE_URL=https://fihrjavcdwpttvnlqqxc.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=<fihr-publishable-key> \
QA_APP_URL=https://africa-ride-hub.lovable.app \
QA_SHOT_DIR=docs/specs/screenshots/layer3a \
bun run scripts/qa/18-layer3a-credit-engine.ts
```

Result: PASS.

- 43/43 checks passed.
- 0 unexpected console/network findings.
- Hosted-auth/bootstrap `TypeError: Failed to fetch` console messages were ignored by the Layer 3A harness only after a focused trace confirmed the underlying Supabase requests returned 200 and the messages were unrelated to Layer 3A endpoints.

Coverage:

- `/admin/credit-operations`
- Product catalog tab
- Activation package tab
- Fulfillment tab
- Exposure tab
- `/admin/loans` handoff
- `/admin/financial-operations` handoff
- `/driver/credit`
- `/journey` regression
- Driver-facing guardrails for raw enums, IMEI/VIN labels, guaranteed ownership copy, and instant financing copy.

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

## Local Checks

Passed:

- Focused ESLint for `scripts/qa/18-layer3a-credit-engine.ts`.
- `bun run test -- src/lib/creditProductEngine.test.ts src/lib/growthOwnership.test.ts src/lib/creditJourney.test.ts src/lib/payments.test.ts`
- `npm run build`
- `git diff --check`.

Previously completed in the Layer 3A implementation commit:

- Focused ESLint for Layer 3A source, route, hook, QA, and billing touchpoints.

Known project-wide failures unrelated to Layer 3A:

- `npm run lint` still fails on existing repo-wide lint debt outside the Layer 3A changes.
- `npx tsc -p tsconfig.app.json --noEmit` still fails on existing unrelated files such as `DriverOperationsHub.tsx`, `useDriverActivityTimeline.ts`, `financialOperations.ts`, `Communication.tsx`, and `Dashboard.tsx`.
