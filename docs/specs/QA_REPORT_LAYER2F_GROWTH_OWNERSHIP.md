# QA Report: Layer 2F Growth & Ownership Center

Date: 2026-06-15
Branch: `codex/kira-driver-v2-part1`

## Scope Verified

Layer 2F Part 2 extends the admin Growth & Ownership Center into six route-level workspaces:

- `/admin/growth` — Overview
- `/admin/growth/pipeline` — Driver Pipeline
- `/admin/growth/reviews` — Eligibility Reviews
- `/admin/growth/offers` — Product Offers
- `/admin/growth/ownership` — Ownership Pipeline
- `/admin/growth/analytics` — Growth Analytics

Compatibility remains at `/admin/growth-ownership`.

## Result

- QA checks: 104/104 PASS
- Console/network findings: 0
- Screenshots: `docs/specs/screenshots/layer2f/`
- QA matrix JSON: `docs/specs/screenshots/layer2f/layer2f-qa-matrix.json`

## Verification Commands

```bash
bunx eslint src/lib/growthOwnership.ts src/lib/growthOwnership.test.ts src/hooks/useGrowthOwnershipData.ts src/pages/admin/GrowthOwnership.tsx src/pages/admin/DriverDetail.tsx src/App.tsx scripts/qa/17-layer2f-growth-ownership.ts
bun run test -- src/lib/growthOwnership.test.ts src/lib/creditJourney.test.ts src/lib/payments.test.ts
npm run build
bun run scripts/qa/00-seed.ts
QA_APP_URL=http://127.0.0.1:8081 QA_SHOT_DIR=docs/specs/screenshots/layer2f bun run scripts/qa/17-layer2f-growth-ownership.ts
```

In-app browser sanity check also verified `/admin/growth/analytics` after QA admin login.

## Screenshots

- `75-layer2f-part2-overview.png`
- `76-layer2f-part2-driver-pipeline.png`
- `77-layer2f-part2-eligibility-reviews.png`
- `78-layer2f-part2-product-offers.png`
- `79-layer2f-part2-ownership-pipeline.png`
- `80-layer2f-part2-growth-analytics.png`
- `81-layer2f-part2-mobile.png`

Part 1 screenshots `70` through `74` remain in the same folder for regression history.

## Acceptance Matrix

- AT-2F-001 Eligible driver appears in pipeline: PASS via derived pipeline stages and route QA.
- AT-2F-002 Overdue invoice loses eligibility: PASS in unit tests via overdue blocker state.
- AT-2F-003 Blocked offer cannot be published: PASS; publish buttons disabled and reason visible.
- AT-2F-004 Application moves ownership pipeline: PASS in unit tests and ownership workspace QA.
- AT-2F-005 Analytics reflects source records: PASS in unit tests and analytics workspace QA.
- AT-2F-006 Manual override audited: PASS as a guardrail; override action is disabled until note, identity, timestamp, before/after state, and audit persistence exist.

## Guardrails Confirmed

- Active Offers and Offers Published remain `0`.
- Draft templates stay `DRAFT` and `NOT_VISIBLE`.
- No loans, contracts, wallet changes, invoice payments, repayment schedules, ownership transfer, underwriting, or driver-facing offers are created.
- No “guaranteed ownership”, “instant financing”, “AI underwriting”, or “you own this vehicle” copy is present.
- Existing handoffs are preserved: Loans, Contracts, Trust & Risk, Financial Operations, Wallets, Driver 360 growth tab, and `/driver/credit`.

## Required QA Notes

- Realtime verification: Growth data still subscribes to score, payment, wallet, invoice, KYC, vehicle inspection, violation, accident, loan, rental, contract, vehicle, and driver changes. QA verified route updates and no console/network findings; live write mutation testing is intentionally not performed because Part 2 does not create fake writes.
- Audit verification: Audit requirements are visible on note-required actions. Mutations are disabled until persisted audit events exist.
- Permission verification: Growth workspace remains role guarded for `super_admin`, `manager`, and `agent_pret`; Part 2 permission names are visible in the admin overview for future `growth.*` policy rollout.
- Deployment verification: `npm run build` passed. Production publish remains a Lovable user action.

## Known Limitations

- No backend migrations were added in this pass.
- Product offer publishing remains disabled until persisted product offers, immutable eligibility snapshots, and audit events exist.
- City, branch, revenue-by-cohort, average down payment, and ownership-duration analytics show source-pending states where current persisted sources are not available.
- Driver-facing offer publishing remains out of scope for Part 2.

## Bug Register

- Fixed during QA: pipeline quick action label changed from `Profile` to `View Profile`.
- No open bugs from the final QA run.

## Known Non-Blocking Build Warnings

- Browserslist data is stale.
- Existing `sonner` mixed static/dynamic import warning.
- Existing large chunk warnings.
