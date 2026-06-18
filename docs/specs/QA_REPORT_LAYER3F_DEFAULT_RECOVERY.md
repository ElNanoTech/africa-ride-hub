# QA Report - Layer 3F Default, Recovery & Ownership Protection

Date: 2026-06-18

## Scope

Layer 3F adds the Default, Recovery & Ownership Protection Engine on top of Layer 3E collections. The delivered scope covers:

- Default review governance and audit trail.
- Evidence checklist and evidence locking after decision.
- Recovery plan creation without repayment schedule mutation.
- Asset protection review without repossession, legal action, title transfer, debt sale, or accounting write-off execution.
- Formal default decision, driver notice, final declaration, and reversal.
- Admin Default Recovery UI at `/admin/default-recovery`, `/admin/default-reviews`, and `/admin/defaults`.
- Collections bridge from `/admin/credit-collections`.
- Driver-safe status cards in `/driver/finance` and `/driver/credit`.
- Driver 360, Attention Center, Trust & Risk, Growth/Ownership, and realtime integrations.

## New QA Script

Script:

```bash
QA_APP_URL=http://127.0.0.1:8082 QA_SHOT_DIR=docs/specs/screenshots/layer3f bun run scripts/qa/23-layer3f-default-recovery.ts
```

Coverage:

- Exercises the 3F RPC chain when a seeded Layer 3E collections case exists.
- Opens/assigns a default review.
- Attaches checklist evidence.
- Creates a recovery plan.
- Opens asset protection review.
- Records formal default decision.
- Sends French-first formal notice.
- Declares formal default.
- Verifies admin Default Recovery tabs and bridge links.
- Verifies driver Finance/Credit safe status copy when the seeded driver owns the review.
- Reverses the formal default as cleanup.
- Captures screenshots under `docs/specs/screenshots/layer3f/`.

## Local Verification

Passed:

```bash
npm run build
npx eslint src/App.tsx src/components/AdminLayout.tsx src/components/admin/driver360/DriverOperationsHub.tsx src/hooks/useAttentionCenter.ts src/hooks/useCreditCollectionsData.ts src/hooks/useCreditDefaultsData.ts src/hooks/useGrowthOwnershipData.ts src/hooks/useRealtimeSubscription.ts src/hooks/useTrustRiskData.ts src/lib/trustRisk.ts src/pages/admin/CreditCollections.tsx src/pages/admin/CreditDefaultRecovery.tsx src/pages/admin/DriverDetail.tsx src/pages/driver/Credit.tsx src/pages/driver/Finance.tsx scripts/qa/lib.ts scripts/qa/23-layer3f-default-recovery.ts
npm run test
QA_APP_URL=http://127.0.0.1:8082 QA_SHOT_DIR=docs/specs/screenshots/layer3f bun run scripts/qa/23-layer3f-default-recovery.ts
```

Result:

- Build completed successfully.
- Focused ESLint completed successfully.
- Vitest completed successfully: 188 tests passed.
- Browser QA completed successfully: 21 checks passed, 0 failed, 0 unexpected console/network findings.
- Only existing Vite/Browserslist/chunk warnings were emitted during build.

## Live Migration

Applied to Supabase project `fihrjavcdwpttvnlqqxc`:

- `supabase/migrations/20260617090000_layer3f_default_recovery_protection.sql`
- `supabase/migrations/20260618011000_layer3f_evidence_lock_guard_hotfix.sql`

The hotfix keeps evidence immutable after a decision while allowing idempotent `locked_at` refreshes during formal declaration cleanup.

Post-apply validation:

- `credit_default_reviews`, `credit_default_notices`, and `v_credit_default_review_queue` exist.
- `get_driver_default_status()` is readable through the driver-safe RPC path.
- `supabase_migrations.schema_migrations` marks both Layer 3F migrations as applied.
- Final QA cleanup reversed the test formal default; the default review queue was empty after the pass.

## Browser QA Artifacts

- `docs/specs/screenshots/layer3f/admin-default-recovery-queue.png`
- `docs/specs/screenshots/layer3f/admin-default-recovery-decision.png`
- `docs/specs/screenshots/layer3f/driver-finance-default-status.png`
- `docs/specs/screenshots/layer3f/driver-credit-default-status.png`
- `docs/specs/screenshots/layer3f/layer3f-qa-summary.json`

## Notes

The migration preserves Layer 3E history and does not duplicate Layer 3E migrations. Layer 3F write-off and asset protection paths are recommendations/reviews only; no accounting write-off, repossession, legal action, title transfer, or debt sale is executed.
