# QA Report: Layer 2F Growth & Ownership Center

Date: 2026-06-15
Branch: `codex/kira-driver-v2-part1`

## Scope Verified

Layer 2F Part 3 adds the driver-facing Growth & Ownership journey while preserving the Part 2 admin workspaces:

- `/journey` - Mon Parcours / My Journey home
- `/journey/eligibility` - explainable eligibility and blockers
- `/journey/opportunities` - opportunity center with locked readiness only
- `/journey/opportunities/vehicle-ownership-program` - locked opportunity detail
- `/journey/simulator` - illustrative ownership simulator
- `/journey/application` - application tracker, documents, down payment readiness
- `/journey/milestones` - ownership milestones and achievements

Part 2 admin regression coverage remains:

- `/admin/growth`
- `/admin/growth/pipeline`
- `/admin/growth/reviews`
- `/admin/growth/offers`
- `/admin/growth/ownership`
- `/admin/growth/analytics`
- `/admin/growth-ownership`

## Result

- QA checks: 171/171 PASS
- Console/network findings: 0
- Screenshots: `docs/specs/screenshots/layer2f/`
- QA matrix JSON: `docs/specs/screenshots/layer2f/layer2f-qa-matrix.json`

## Verification Commands

```bash
bunx eslint src/lib/growthOwnership.ts src/lib/growthOwnership.test.ts src/hooks/useDriverJourneyData.ts src/hooks/useDriverRealtimeSubscription.ts src/pages/driver/Journey.tsx src/components/BottomNav.tsx src/components/DriverLayout.tsx src/lib/routeScopes.ts src/lib/preloadRoutes.ts src/App.tsx scripts/qa/17-layer2f-growth-ownership.ts
bun run test -- src/lib/growthOwnership.test.ts src/lib/creditJourney.test.ts src/lib/payments.test.ts
npm run build
bun run scripts/qa/00-seed.ts
QA_APP_URL=http://127.0.0.1:8082 QA_SHOT_DIR=docs/specs/screenshots/layer2f bun run scripts/qa/17-layer2f-growth-ownership.ts
```

In-app browser sanity also verified `http://127.0.0.1:8082/journey` redirected cleanly to driver login, rendered content, and showed no Vite overlay or console errors.

## Screenshots

Part 2 regression screenshots:

- `75-layer2f-part2-overview.png`
- `76-layer2f-part2-driver-pipeline.png`
- `77-layer2f-part2-eligibility-reviews.png`
- `78-layer2f-part2-product-offers.png`
- `79-layer2f-part2-ownership-pipeline.png`
- `80-layer2f-part2-growth-analytics.png`
- `81-layer2f-part2-mobile.png`

Part 3 screenshots:

- `82-layer2f-part3-journey-home.png`
- `83-layer2f-part3-roadmap.png`
- `84-layer2f-part3-eligibility-screen.png`
- `85-layer2f-part3-opportunity-center.png`
- `86-layer2f-part3-locked-opportunity.png`
- `87-layer2f-part3-opportunity-detail.png`
- `88-layer2f-part3-simulator.png`
- `89-layer2f-part3-application-tracker.png`
- `90-layer2f-part3-milestones-achievements.png`

## Acceptance Matrix

- AT-2F-DR-001 Driver sees current stage: PASS on `/journey`.
- AT-2F-DR-002 Driver sees blockers: PASS on `/journey/eligibility`.
- AT-2F-DR-003 Locked opportunity explains why: PASS on `/journey/opportunities` and detail route.
- AT-2F-DR-004 Eligibility changes update automatically: PASS/CODE via driver-filtered realtime subscriptions for driver, score, payment, invoice, wallet, KYC, vehicle, loan, rental, contract, inspection, violation, and accident changes.
- AT-2F-DR-005 Application tracker updates: PASS on `/journey/application`.
- AT-2F-DR-006 Rejected document displays reason: PASS/CODE PATH; no fake rejected document was seeded. The UI reserves `rejectionReason` rendering and does not manufacture rejection data.
- AT-2F-DR-007 Simulator includes disclaimer: PASS on `/journey/simulator`.
- AT-2F-DR-008 No fake opportunities: PASS. Journey shows readiness/locked state only unless a future persisted active offer exists.

## Guardrails Confirmed

- Active Offers and Offers Published remain `0`.
- Draft templates stay `DRAFT` and `NOT_VISIBLE`.
- Journey does not create loans, contracts, wallet changes, invoice payments, repayment schedules, ownership transfer, underwriting, or offer publication.
- `Start Application` and `Activate Ownership Path` do not create side effects; application entry remains disabled/hidden without real persisted workflow and audit events.
- No “Guaranteed ownership”, “Instant financing”, “AI underwriting”, or “You own this vehicle” copy is present.
- Existing handoffs remain intact: Loans, Contracts, Trust & Risk, Financial Operations, Wallets, Driver 360 growth tab, and `/driver/credit`.

## Required QA Notes

- Realtime verification: Driver Journey uses driver-filtered realtime subscriptions and invalidates current-driver query keys. Live mutation testing was not performed because Part 3 intentionally does not create fake state changes.
- Permission verification: Journey data is built from the authenticated driver id only. Admin-wide Growth data is not queried by the driver route.
- Regression tests: Growth helper tests now cover driver journey derivation, locked opportunity explanations, next-action limits, and application tracker state.
- Deployment verification: `npm run build` passed. Production publish remains a Lovable user action.

## Seed Notes

- Live QA uses one fresh managed driver from `scripts/qa/00-seed.ts`.
- Broader seed-driver states from the spec are covered by unit/helper fixtures instead of persisted fake records.
- No fake applications, fake offers, fake document rejections, or fake ownership activations were inserted into Supabase for screenshots.

## Known Non-Blocking Build Warnings

- Browserslist data is stale.
- Existing `sonner` mixed static/dynamic import warning.
- Existing large chunk warnings.
