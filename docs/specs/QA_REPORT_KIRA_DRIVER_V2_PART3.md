# QA Report - KIRA Driver App v2 Part 3

Date: 2026-06-14
Mode: Orchestrator implementation + focused QA + Chrome mobile browser evidence + isolated Fleet Control E2E
Local QA URL: `http://127.0.0.1:8080`

## QA Gate

Part 3 is implemented locally for Vehicle, Fleet Control, Alerts, Profile, Documents/KYC, Support, Settings, route aliases, realtime invalidation, and maintenance reporting.

Production/live DB gate: PASS after migration retest. The Part 3 migration was applied on 2026-06-14 and verified for `driver_vehicle_reports`, storage policies, realtime publication, and `driver_acknowledge_alert`.

Storage note: the `maintenance-report-photos` bucket is private and accepts uploads. Lovable Cloud does not expose the service role key needed for `storage.updateBucket`, and raw `storage.buckets` SQL is blocked in the live project, so the driver upload UI now enforces the same constraints client-side: JPG/PNG/WebP only, 10MB per photo, 4 photos maximum.

## Seeded Driver Evidence

Local Chrome driver session:

- Driver shown in UI: `Chauffeur Test`
- Visible vehicle: `Hyundai Accent`, plate `CI-TEST-002`
- Vehicle status shown: `Contrôle requis`
- Active control shown: due `19/06/2026`, `0/11` required items supplied
- Maintenance report QA ticket created: `TKT-2026-00002`
- Post-migration photo report QA ticket created: `TKT-2026-00003`
- Alert examples visible: accident unresolved, low score, score alert

Isolated Fleet Control E2E seed:

- Driver id: `f8da654f-d1c7-4739-94b2-38283f8e6dc1`
- Driver name: `Mamadou Test E2E`
- Vehicle id: `386428b9-f4af-4df2-96dd-e8163b9b25ac`
- Plate: `FC-E2E-001`
- Active control id: `057cc384-c804-4e72-96f6-6466edbb2013`
- E2E artifact: `docs/specs/qa-artifacts/part3/fleet-control-e2e-report.json`

## PASS/FAIL Matrix

| Requirement | Result | Evidence |
| --- | --- | --- |
| Vehicle page loads at `/driver/vehicle` | PASS | Screenshots `01`, `08`; vehicle `CI-TEST-002` visible. |
| Vehicle status card | PASS | `Contrôle requis` shown from active inspection state. Screenshot `01`. |
| Rental summary card | PASS | Current balance, next due date, and `Voir les paiements` shown. Screenshot `08`. |
| Vehicle documents | PASS | Carte grise, Assurance, Vignette, Permis chauffeur with statuses. Screenshot `08`. |
| Vehicle history | PASS | Assignment and active control history shown. Screenshot `08`. |
| Report a problem UI | PASS | Category, urgency, description, photos, submit action visible. Screenshot `09`. |
| Maintenance report submitted | PASS | Submitted QA report without photo before migration and with one photo after migration; support tickets `TKT-2026-00002` and `TKT-2026-00003` visible. Screenshots `12`, `13`, `16`, `17`. |
| Maintenance report status | PASS | After migration, Vehicle history shows `Pneu · Signalé · À l'instant`, proving the `driver_vehicle_reports` insert/read path. Screenshot `16`. |
| Fleet Control dashboard | PASS | Driver sees required active control, due date, progress, photo/doc items. Screenshot `02`. |
| Fleet Control submit/reject/resubmit/approve | PASS | E2E steps 2-5 passed with item rejection reason `Photo trop floue`, full rejection reason, resubmit, approval, and due reset. |
| Rejected item reason visible | PASS | E2E step 3: driver sees `Photo trop floue`. |
| Approved experience | PASS | E2E step 5: control approved, next due reset, notification created. |
| Overdue experience | PASS | E2E step 7: recompute changed past-due pending control to overdue. |
| Blocked vehicle state | PASS / HARNESS CAVEAT | E2E step 10 produced `status=blocked`, `immobilization_state=cut_sent`; harness expected an older placeholder command ref and marked that one assertion false. |
| Alerts screen sections/types | PASS | Non lus, grouped alert cards, severity badges, action buttons. Screenshot `03`. |
| Alert deep links | PASS | `alertDeepLink` unit tests cover invoice, fleet control, and vehicle routes. |
| Alert acknowledge | PASS | After migration, `Marquer lu` changed unread count from `3` to `2` and moved the accident alert to `RÉCENTS`; no failed toast. Screenshot `14`. |
| Profile header | PASS | Name, avatar initials, score, driver status, member date. Screenshot `04`. |
| Health dashboard | PASS | KYC, payments, control, vehicle cards. Screenshots `04`, `11`. |
| KYC document statuses | PASS | ID, Permis, Justificatif, Selfie statuses shown. Screenshot `05`. |
| Driver documents | PASS | Profile documents section and empty state visible. Screenshot `11`. |
| Document expiry warnings | PASS / CODE | Profile and Home derive rejected/expired/expiring-soon warnings; current seed has no warning rows to screenshot. |
| Activity timeline | PASS | Profile recent activity visible. Screenshot `11`. |
| Support experience | PASS | Help actions and tickets visible; report ticket appears. Screenshots `06`, `13`. |
| Settings minimal options | PASS | Language, notifications, voice assistance, logout. Screenshot `07`. |
| Realtime updates | PASS / CODE + E2E | Alerts, vehicle reports, fleet control, financial dashboard use realtime invalidation; Fleet Control E2E verifies status transitions. |
| Security: own driver data | PASS | Fleet Control E2E step 14: driver sees only own controls and cannot approve. Migration adds own-driver RLS for reports/photos. |
| Offline/retry | PARTIAL | Existing query retry/fallback patterns remain; full upload recovery queue was not implemented in Part 3. |

## Screenshots

- `docs/specs/qa-artifacts/part3/01-vehicle-home-mobile.png`
- `docs/specs/qa-artifacts/part3/02-fleet-control-mobile.png`
- `docs/specs/qa-artifacts/part3/03-alerts-mobile.png`
- `docs/specs/qa-artifacts/part3/04-profile-health-mobile.png`
- `docs/specs/qa-artifacts/part3/05-kyc-documents-mobile.png`
- `docs/specs/qa-artifacts/part3/06-support-help-mobile.png`
- `docs/specs/qa-artifacts/part3/07-settings-mobile.png`
- `docs/specs/qa-artifacts/part3/08-vehicle-summary-docs-history-mobile.png`
- `docs/specs/qa-artifacts/part3/09-vehicle-report-problem-modal-mobile.png`
- `docs/specs/qa-artifacts/part3/10-home-command-center-mobile.png`
- `docs/specs/qa-artifacts/part3/11-profile-documents-activity-mobile.png`
- `docs/specs/qa-artifacts/part3/12-maintenance-report-submit-result-mobile.png`
- `docs/specs/qa-artifacts/part3/13-maintenance-report-support-ticket-mobile.png`
- `docs/specs/qa-artifacts/part3/14-alert-ack-after-migration-mobile.png`
- `docs/specs/qa-artifacts/part3/16-vehicle-report-photo-after-wait-mobile.png`
- `docs/specs/qa-artifacts/part3/17-support-ticket-after-migration-mobile.png`

## Automated Checks

| Check | Result |
| --- | --- |
| `bun run test src/lib/driverOps.test.ts` | PASS - 11 tests |
| `bun run build` | PASS - existing Vite warnings only |
| `git diff --check` | PASS |
| Chrome console errors on Home after QA | PASS - none |
| Alert acknowledge blocker retest | PASS - unread `3 -> 2`, no failed toast |
| Vehicle report photo blocker retest | PASS - report visible in history and support ticket `TKT-2026-00003` created |
| Fleet Control E2E harness | 16/17 PASS; 1 harness expectation mismatch, actual blocked state correct |
| Focused ESLint on `Alertes` + `driverOps` | PASS |
| Broader focused ESLint on touched driver pages | FAIL - remaining `no-explicit-any` debt in existing driver pages and one existing hook warning |

## Bugs Found

- Home did not yet surface document warning rows from `driver_documents`, even though Profile did.
- Alert acknowledgement needed a driver-scoped RPC instead of a direct client update.
- Vehicle maintenance reports needed a durable driver-owned table and photo bucket, but also needed a support-ticket fallback until DB migration is live.
- Support ticket message creation resolved driver only by one auth column in one path.
- The Fleet Control E2E harness has an outdated command-ref expectation for dry-run immobilization.

## Bugs Fixed

- Added Home document-warning banner for rejected, expired, and expiring-soon documents.
- Added `driverOps` helpers and tests for vehicle ops status, document status, alert deep links, and due-date labels.
- Added `/driver/vehicle`, `/driver/profile/kyc`, and `/driver/alerts` route aliases with nav/swipe support.
- Rebuilt Driver Alerts with grouped actionable cards, deep links, secure acknowledgement RPC call, and realtime invalidation.
- Expanded Vehicle screen into an operating dashboard with active vehicle, status, rental summary, documents, history, and report-problem flow.
- Added Part 3 migration for `driver_vehicle_reports`, maintenance photo storage, report RLS, realtime publication, and `driver_acknowledge_alert`.
- Added KYC document status panel, Profile health dashboard/documents/activity, Support shortcuts, and minimal Settings preferences.
- Fixed support message driver lookup to support both `user_id` and `auth_user_id`.

## Remaining TODOs

- Optional production hardening: set the `maintenance-report-photos` bucket file-size limit to `10 MB` and MIME allowlist to `image/jpeg`, `image/png`, `image/webp` using a service-role `storage.updateBucket` call when the service role key is available.
- Refresh Supabase generated types after the migration, then remove temporary casts around the new table/RPC.
- Update the deployed `fleet-control-e2e` harness expectation to accept the current `DRY_RUN:setOutput:*` command reference.
- Seed one rejected/expired/expiring driver document to screenshot the Home/Profile warning state.
- Decide whether to tackle the broader driver-page `no-explicit-any` lint debt before freezing Part 3.
