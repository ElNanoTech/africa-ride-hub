# QA Report: Layer 3C Contracting and E-Signature

Date: 2026-06-16

## Scope

Implemented Layer 3C contracting foundations across database, admin operations, driver-safe contract status, and QA automation.

Covered:
- Versioned contract templates and product-level contract requirements.
- Immutable contract package snapshots generated from the latest Layer 3B approved or conditionally approved decision.
- E-signature lifecycle events: sent, viewed, signed, declined, voided, reissued, and final execution.
- Permissioned admin actions for generate, send, countersign, void, reissue, and manual evidence upload.
- Driver-safe contract status and signing actions in the credit flow.
- Activation now treats `credit_agreements` as the signed-agreement source of truth and requires the latest valid fully executed agreement.
- QA harness for backend RPC flow, admin browser flow, driver browser flow, masking checks, and console/network findings.

## Automated Verification

Passed:

```bash
npx eslint src/lib/creditContractingEngine.ts src/lib/creditContractingEngine.test.ts src/hooks/useContractingOperationsData.ts src/hooks/useCreditProductEngineData.ts src/components/AdminLayout.tsx src/pages/admin/Contracts.tsx src/pages/driver/Credit.tsx scripts/qa/00-seed.ts scripts/qa/lib.ts scripts/qa/20-layer3c-contracting-esignature.ts
```

Additional QA harness lint after the bounded browser-shutdown fix:

```bash
npx eslint scripts/qa/20-layer3c-contracting-esignature.ts
```

```bash
bun run test -- src/lib/creditContractingEngine.test.ts src/lib/creditProductEngine.test.ts src/lib/creditJourney.test.ts src/lib/growthOwnership.test.ts src/lib/payments.test.ts
```

Result: 5 files passed, 36 tests passed.

```bash
npm run build
```

Result: production build passed. Existing Vite warnings remain for browserslist/chunk size and mixed static/dynamic `sonner` imports.

## Dev Server Smoke Check

Started:

```bash
npm run dev -- --host 127.0.0.1 --port 8082 --strictPort
```

Result: dev server started at `http://127.0.0.1:8082/`.

Browser smoke:
- Opened `http://127.0.0.1:8082/admin/contracts` in the in-app browser.
- App loaded and redirected to the admin login page as expected for an unauthenticated admin route.

## Live E2E Status

Passed against the live Supabase tenant after the Layer 3C migration was applied.

Seed:

```bash
bun run scripts/qa/00-seed.ts
```

Result: passed. Layer 3A catalog, Layer 3B policy/extension, and Layer 3C contract template seeded against the live Supabase tenant.

Full real-world QA:

```bash
QA_APP_URL=http://127.0.0.1:8082 QA_SHOT_DIR="docs/specs/screenshots/layer3c" bun run scripts/qa/20-layer3c-contracting-esignature.ts
```

Result: passed. All Layer 3C backend, admin browser, driver browser, masking, and console/network checks passed.

Key live artifacts:
- Application: `f7d7c53d-2339-4a01-85e3-682a8138aca6`
- Underwriting decision: `48b0a9c7-a1bc-4272-923b-477bbfc036b4`
- Contract package: `bfeb7300-7ab6-4842-8fd6-dede08ed7c55`
- Executed agreement bridge: `418ccf94-4d17-4fca-a368-1ce95be3ff18`
- Executed PDF hash: `c36291ee3f549627c65e0a54f83bd54e`

Console/network findings: `0`.

Generated artifacts:
- `docs/specs/screenshots/layer3c/100-layer3c-admin-contracting.png`
- `docs/specs/screenshots/layer3c/101-layer3c-signer-status.png`
- `docs/specs/screenshots/layer3c/102-layer3c-evidence.png`
- `docs/specs/screenshots/layer3c/103-layer3c-driver-contract-status.png`
- `docs/specs/screenshots/layer3c/layer3c-qa-matrix.json`

## E2E Script Coverage

`scripts/qa/20-layer3c-contracting-esignature.ts` validates:
- Real Layer 3A/3B credit application and underwriting decision setup.
- Idempotent contract generation from the latest eligible Layer 3B decision.
- Template/version pinning and money snapshot consistency.
- Activation blocked before signing by `signed_agreement_required`.
- Contract send, driver view, driver sign, admin sign, and manager sign sequencing.
- Full execution writes the `credit_agreements` bridge row and executed evidence hash.
- Activation no longer has the signed-agreement blocker after execution, while remaining blocked by legitimate downstream requirements such as unpaid down payment.
- Driver-safe contract DTO does not expose policy, reviewer, matrix, IP, user-agent, hash, or internal evidence fields.
- Admin and driver browser routes render without unexpected console or network findings.

## Manual SQL Required

None remaining for this run. The Layer 3C migration was applied successfully before E2E.

## Runtime Fixes

The first E2E attempt passed backend and admin assertions but hung while closing the admin Playwright browser before the driver leg. The QA script now bounds harness shutdown to five seconds so browser cleanup cannot block the remaining checks.
