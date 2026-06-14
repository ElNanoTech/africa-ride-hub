# QA Report - KIRA Driver App v2 Parts 5 and 6

Date: 2026-06-14
Mode: Orchestrator implementation + focused unit tests + scoped lint + Chrome mobile browser evidence
Local QA URL: `http://127.0.0.1:8080`

## QA Gate

Parts 5 and 6 are implemented for the app resilience layer: online/limited/offline network state, manual refresh fallback, persistent same-device Fleet Control upload recovery, online-required action guards, realtime failure diagnostics, and a formal UAT/release matrix.

Gate result: PASS for local implementation, build, touched-file lint, and authenticated Chrome page evidence. Release gate remains CONDITIONAL because the full Part 6 live UAT matrix still needs an eligible-credit seed, exact 375/390/430 physical or emulated viewport pass, and real external Wave success/cancel scenarios to be rerun end-to-end.

## Files Changed

- `src/lib/networkQuality.ts`
- `src/lib/networkQuality.test.ts`
- `src/lib/fleetControlUploadRecovery.ts`
- `src/lib/fleetControlUploadRecovery.test.ts`
- `src/hooks/useOfflineStatus.ts`
- `src/components/OfflineIndicator.tsx`
- `src/hooks/useFinancialRealtime.ts`
- `src/lib/diagnostics.ts`
- `src/pages/driver/VehicleInspection.tsx`
- `src/pages/driver/Credit.tsx`
- `docs/specs/QA_REPORT_KIRA_DRIVER_V2_PART5_6.md`
- `docs/specs/qa-artifacts/part5_6/*.png`

## Seeded Driver Evidence

Authenticated local Chrome driver session:

- Driver shown: `Chauffeur Test`
- Vehicle/control shown: `CI-TEST-002`
- Fleet Control: `0/11 pièces fournies`, due in 4 days, required photo/doc tiles visible
- Credit score: `490`, trust level `Débutant`, target ownership score `850`
- Wallet route: `/driver/portefeuille`, top-up CTA visible
- Chrome console on captured pages: PASS - no captured app errors

Prior live seed references reused from earlier reports:

- Seeded driver id: `4c9bea2b-4a82-4d7f-bccb-b9baef1618fa`
- Fleet Control isolated E2E seed driver: `f8da654f-d1c7-4739-94b2-38283f8e6dc1`

## PASS/FAIL Matrix

| Area | Result | Evidence |
| --- | --- | --- |
| Network states: online/poor/offline | PASS | `deriveNetworkQuality` tests cover offline, save-data, 2G, low downlink, high RTT, normal online. |
| Offline indicator | PASS | Global banner now shows `Hors ligne`, cached-data copy, and `Réessayer` manual refresh. Build + lint pass. |
| Limited connection indicator | PASS | Global banner now shows `Connexion limitée` for poor network quality with manual refresh. Unit tests cover detection. |
| Pull-to-refresh fallback | PASS | Existing `DriverLayout` pull-to-refresh remains in place; offline indicator can invalidate all queries manually. |
| Realtime fallback | PASS | Existing financial/fleet/alert realtime invalidation remains; financial channel now logs unhealthy states. |
| Wallet realtime | PASS / PRIOR + CODE | Existing `useFinancialRealtime` invalidates wallet keys; Part 2 screenshots and tests cover wallet updates. |
| Invoice realtime | PASS / PRIOR + CODE | Existing `useFinancialRealtime` invalidates invoice/payment keys; Part 2 covers invoice update behavior. |
| Fleet Control realtime | PASS / PRIOR + CODE | Part 3 E2E covered status transitions; current screen still uses realtime invalidation. |
| Vehicle assignment realtime | PASS / PRIOR + CODE | Existing driver data/realtime hooks remain from Parts 3/4. |
| Alerts realtime | PASS / PRIOR + CODE | Part 3 alert acknowledge and deep-link QA passed. |
| Fleet Control failed-upload recovery | PASS | Failed photo/doc uploads are saved to IndexedDB by inspection+zone, restored after reload, visible in retry card, deleted after successful retry. |
| Online-required Fleet Control submit | PASS | Submit action now blocks offline with `Connexion requise` and does not silently fail. |
| Online-required Credit application | PASS | Offer dialog remains readable offline; application CTA is disabled with explicit reason. |
| Wave online-required checkout | PASS / PRIOR | Payment queue/top-up behavior covered in Part 2; no change in this pass. |
| Security boundaries | PASS / PRIOR | Wave ownership/admin guards passed in Part 2; Fleet Control own-driver/RLS passed in Part 3. |
| Document security | PASS / PRIOR | Private storage + signed URLs from Part 3; current Fleet Control upload still uses signed upload/read URLs. |
| Observability | PASS | Added `driver_upload_failure` diagnostics for upload/recovery failures and `realtime_connection_unhealthy` for financial realtime channel failures. |
| Performance | PASS / LOCAL | Production build passes; route preloading continues to skip offline/slow links. Low-end Android device profiling remains TODO. |
| Accessibility basics | PASS / PARTIAL | Large CTAs and voice buttons visible on Home/Fleet Control/Credit/Wallet. Screen-reader audit not executed. |

## Part 6 UAT Matrix

| UAT | Result | Evidence |
| --- | --- | --- |
| UAT 1 - New Driver sees home, vehicle, balance, next payment | PASS / LOCAL | Home screenshot; existing Part 2/3 finance + vehicle evidence. |
| UAT 2 - Payment flow with partial wallet + Wave remainder | PASS / PRIOR | Part 2 QA covers remaining-due-only, duplicate protection, ownership validation. Real external Wave success should be rerun for release. |
| UAT 3 - Wallet top-up updates balance/timeline | PASS / PRIOR | Part 2 QA covers top-up and running balance. |
| UAT 4 - Fleet Control upload 11 items, submit, admin approve | PASS / PRIOR | Part 3 isolated E2E passed upload/submit/approve. |
| UAT 5 - Admin rejection, driver reason, retake, resubmit | PASS / PRIOR | Part 3 isolated E2E passed item rejection reason + resubmit. |
| UAT 6 - Vehicle assignment updates home/vehicle | PASS / PRIOR | Part 3 vehicle page + active control evidence. |
| UAT 7 - Alert created, bell updates, opens correct page | PASS / PRIOR | Part 3 alert acknowledge/deep-link coverage. |
| UAT 8 - Eligible driver sees offer | FAIL / TODO SEED | Current seeded driver score `490` is intentionally not eligible. Need eligible seed to screenshot offer card and submit dialog. |
| UAT 9 - Not eligible driver sees reasons/gaps | PASS | Current Credit screenshot shows non-eligible score/trust state; Part 4 covers gap explanation. |
| UAT 10 - KYC uploaded, admin approves, driver sees verified | PASS / PRIOR | Part 3 KYC/Profile evidence; full live KYC approve rerun not performed in this pass. |

## Screenshots

- `docs/specs/qa-artifacts/part5_6/driver-home.png`
- `docs/specs/qa-artifacts/part5_6/fleet-control.png`
- `docs/specs/qa-artifacts/part5_6/credit.png`
- `docs/specs/qa-artifacts/part5_6/portefeuille.png`

## Automated Checks

| Check | Result |
| --- | --- |
| `bun run test -- src/lib/networkQuality.test.ts src/lib/fleetControlUploadRecovery.test.ts` | PASS - 5 tests |
| `./node_modules/.bin/eslint src/lib/networkQuality.ts src/lib/networkQuality.test.ts src/lib/fleetControlUploadRecovery.ts src/lib/fleetControlUploadRecovery.test.ts src/hooks/useOfflineStatus.ts src/components/OfflineIndicator.tsx src/hooks/useFinancialRealtime.ts src/pages/driver/VehicleInspection.tsx src/pages/driver/Credit.tsx` | PASS |
| `bun run build` | PASS - existing Vite warnings only |
| Chrome screenshots: Home, Fleet Control, Credit, Portefeuille | PASS |
| Chrome console errors on captured pages | PASS - none captured |

## Bugs Found

- Network state was binary only; it could not distinguish poor/limited connection from healthy online.
- Offline banner had no manual retry action.
- Fleet Control failed uploads were lost after an upload failure; drivers could be forced to recapture.
- Fleet Control submit and Credit application could fail online-required actions without enough explicit disabled-state copy.
- Financial realtime channel failures were not logged with a stable diagnostics category.

## Bugs Fixed

- Added testable `networkQuality` helper and upgraded `useOfflineStatus` to expose `online`, `poor`, and `offline`.
- Updated `OfflineIndicator` to show `Hors ligne`, `Connexion limitée`, reconnect state, and manual refresh controls.
- Added persistent same-device Fleet Control upload recovery using IndexedDB.
- Added Fleet Control retry panel for failed uploads and cleanup after successful retry.
- Added explicit offline guard/copy for Fleet Control submit.
- Added explicit offline guard/copy for Credit application submit.
- Added realtime and upload failure diagnostic categories.
- Removed outdated `any` casts in `VehicleInspection.tsx` now that Supabase generated types include Fleet Control tables/RPCs.

## Remaining TODOs

- Seed or switch to an eligible driver and complete UAT 8: visible offer card, `Voir l'offre`, `Je suis intéressé`, loan insert, duplicate guard.
- Run exact viewport pass at `375`, `390`, and `430` widths, ideally on Chrome mobile emulation and at least one low-end Android/WebView.
- Rerun full live Wave success/cancel paths with a real or sandbox payment callback before production release sign-off.
- Consider adding a small recovery-management UI to discard stale failed Fleet Control uploads if the driver no longer wants to retry them.
- Repo-wide `bun run lint` is still expected to hit unrelated pre-existing debt outside this focused Part 5/6 surface.
