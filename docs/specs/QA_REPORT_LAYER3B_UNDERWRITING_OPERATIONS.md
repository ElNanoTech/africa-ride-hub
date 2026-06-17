# QA Report: Layer 3B Underwriting Operations

Date: 2026-06-16

## Scope

Implemented Layer 3B underwriting ownership across database, admin operations, driver-safe summaries, and QA automation.

Covered:
- Persisted underwriting decisions as the approval source of truth.
- Re-underwriting trigger events and downstream activation gates.
- Decision-time score, risk, exposure, policy, and extension snapshots.
- Product-specific underwriting extension point.
- Driver-safe decision DTO with human-facing labels and masked condition actions.

## Automated Verification

Passed:

```bash
npx eslint src/lib/creditUnderwritingEngine.ts src/lib/creditUnderwritingEngine.test.ts src/hooks/useCreditProductEngineData.ts src/hooks/useUnderwritingOperationsData.ts src/pages/admin/UnderwritingOperations.tsx src/pages/admin/CreditOperations.tsx src/pages/driver/Credit.tsx scripts/qa/00-seed.ts scripts/qa/19-layer3b-underwriting-operations.ts
```

Additional QA harness lint after the driver login wait fix:

```bash
npx eslint scripts/qa/lib.ts scripts/qa/19-layer3b-underwriting-operations.ts
```

```bash
bun run test -- src/lib/creditUnderwritingEngine.test.ts src/lib/creditProductEngine.test.ts src/lib/creditJourney.test.ts src/lib/growthOwnership.test.ts src/lib/payments.test.ts
```

Result: 5 files passed, 38 tests passed.

```bash
npm run build
```

Result: production build passed. Existing Vite warnings remain for browserslist/chunk size and mixed static/dynamic `sonner` imports.

## Live E2E Status

Dev server:

```bash
npm run dev -- --host 127.0.0.1 --port 8082 --strictPort
```

Seed:

```bash
bun run scripts/qa/00-seed.ts
```

Result: passed. Layer 3A catalog and Layer 3B policy/extension seeded against the live Supabase tenant.

Full real-world QA:

```bash
QA_APP_URL=http://127.0.0.1:8082 QA_SHOT_DIR="docs/specs/screenshots/layer3b" bun run scripts/qa/19-layer3b-underwriting-operations.ts
```

Result: passed. All Layer 3B checks passed, screenshots were written, and console/network findings were `0`.

## Real-World E2E Script Coverage

`scripts/qa/19-layer3b-underwriting-operations.ts` validates:
- Driver submits a real credit application.
- Admin evaluates and persists a Layer 3B decision.
- Decision idempotency.
- Score and exposure snapshots at decision time.
- Policy snapshot and product extension output.
- Re-underwriting trigger idempotency.
- Activation package remains blocked by pending conditions and blocking re-underwriting triggers.
- Driver-safe underwriting RPC masks policy, reviewer, matrix, risk internals, raw decision enums, and raw condition statuses.
- Admin and driver UI routes render the new underwriting views.

Screenshots:
- `docs/specs/screenshots/layer3b/100-layer3b-admin-underwriting-operations.png`
- `docs/specs/screenshots/layer3b/101-layer3b-decision-evidence.png`
- `docs/specs/screenshots/layer3b/102-layer3b-policy-sets.png`
- `docs/specs/screenshots/layer3b/103-layer3b-driver-decision-summary.png`

## Runtime Fixes

Two live DB follow-up patches were applied during QA:
- `create_activation_package` now uses the Layer 3B activation gates with explicit re-underwriting blockers.
- The activation package fallback `request_hash` uses built-in `md5(...)` instead of `digest(...)`, avoiding pgcrypto search-path/runtime dependency issues.

No residual Layer 3B QA blocker remains.
