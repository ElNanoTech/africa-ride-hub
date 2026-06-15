# QA Report - KIRA Admin App V3 Layer 2B

Date: 2026-06-15
Scope: Admin Driver Operations Hub / Driver 360
Seeded admin: `e2e-customer-admin@dam-test.local`
Seeded driver: `4c9bea2b-4a82-4d7f-bccb-b9baef1618fa`
Environment: local Vite app on `http://127.0.0.1:8081`, live Supabase backend

## Summary

Layer 2B replaces the old first-viewport Driver Detail experience with a Driver Operating Record:

- Always-visible driver operating header.
- Health dashboard for Payments, KYC, Fleet Control, Vehicle, Credit, and Risk.
- Lifecycle and Ownership Candidate panels.
- Explained risk panel with reasons from the computed risk model.
- Eight grouped tabs: Overview, Finance, Vehicle, Fleet Control, Risk, Growth, Documents, Activity.
- Existing deep links such as `?tab=invoices`, `?tab=wallet`, `?tab=violations`, `?tab=notes`, and `?tab=loans` remain useful.

No schema changes, payment changes, Wave changes, mechanic/shop work, or credit-engine rebuild were introduced.

## Screenshots

| Evidence | File |
| --- | --- |
| Drivers list route smoke | `docs/specs/screenshots/layer2b/30-layer2b-drivers-list-search.png` |
| Driver 360 header and health dashboard | `docs/specs/screenshots/layer2b/31-layer2b-driver360-header-health.png` |
| Lifecycle and ownership panels | `docs/specs/screenshots/layer2b/32-layer2b-driver360-lifecycle.png` |
| Overview tab | `docs/specs/screenshots/layer2b/33-layer2b-tab-overview.png` |
| Finance tab | `docs/specs/screenshots/layer2b/34-layer2b-tab-finance.png` |
| Vehicle tab | `docs/specs/screenshots/layer2b/35-layer2b-tab-vehicle.png` |
| Fleet Control tab | `docs/specs/screenshots/layer2b/36-layer2b-tab-fleet-control.png` |
| Risk tab | `docs/specs/screenshots/layer2b/37-layer2b-tab-risk.png` |
| Growth tab | `docs/specs/screenshots/layer2b/38-layer2b-tab-growth.png` |
| Documents tab | `docs/specs/screenshots/layer2b/39-layer2b-tab-documents.png` |
| Activity tab | `docs/specs/screenshots/layer2b/40-layer2b-tab-activity.png` |
| Quick actions menu | `docs/specs/screenshots/layer2b/41-layer2b-quick-actions-menu.png` |
| Send alert/message result | `docs/specs/screenshots/layer2b/42-layer2b-message-result.png` |
| Create invoice dialog | `docs/specs/screenshots/layer2b/43-layer2b-create-invoice-result.png` |
| Mobile Driver 360 viewport | `docs/specs/screenshots/layer2b/44-layer2b-mobile-driver360.png` |
| Machine-readable matrix | `docs/specs/screenshots/layer2b/layer2b-qa-matrix.json` |

## PASS/FAIL Matrix

| Check | Result |
| --- | --- |
| `/admin/drivers` list route still loads | PASS |
| `/admin/drivers/:id` renders Driver 360 operating record | PASS |
| Health dashboard shows Payments, KYC, Fleet Control, Vehicle, Credit, Risk | PASS |
| Driver Lifecycle card visible | PASS |
| Ownership Candidate panel visible | PASS |
| Risk Explanation panel visible with non-black-box reasons | PASS |
| What Requires Action panel visible | PASS |
| Generate access action present | PASS |
| Suspend/reactivate action present | PASS |
| Overview tab loads | PASS |
| Finance tab loads wallet/payment/invoice content | PASS |
| Vehicle tab loads rental/assignment history | PASS |
| Fleet Control tab loads current/history content | PASS |
| Risk tab loads score/contraventions/sinistres content | PASS |
| Growth tab loads loan/application content | PASS |
| Documents tab loads document content | PASS |
| Activity tab loads unified timeline content | PASS |
| Send alert/message action submits and returns user-facing result | PASS |
| Create invoice action opens invoice dialog | PASS |
| Legacy `?tab=invoices` deep link maps to Finance | PASS |
| Legacy `?tab=wallet` deep link maps to Finance/wallet | PASS |
| Legacy `?tab=violations` deep link maps to Risk | PASS |
| Legacy `?tab=notes` deep link maps to Activity | PASS |
| Legacy `?tab=loans` deep link maps to Growth | PASS |
| Mobile Driver 360 route loads | PASS |
| Console/network findings | PASS, 0 findings |

## Verification Commands

```bash
npx eslint src/lib/rentals.ts src/lib/driverOperationsHub.ts src/lib/driverOperationsHub.test.ts src/components/admin/driver360/DriverOperationsHub.tsx src/components/admin/AssignVehicleDialog.tsx src/pages/admin/DriverDetail.tsx src/pages/admin/Drivers.tsx scripts/qa/13-layer2b-driver-360.ts
bun run test -- src/lib/driverOperationsHub.test.ts src/lib/creditJourney.test.ts
npm run build
QA_APP_URL=http://127.0.0.1:8081 QA_SHOT_DIR=docs/specs/screenshots/layer2b bun run scripts/qa/13-layer2b-driver-360.ts
```

Results:

- Focused lint: PASS.
- Helper tests: PASS, 8 tests.
- Production build: PASS with existing Vite warnings only.
- Layer 2B Playwright QA: PASS, 31/31 checks, 0 console/network findings.

## Bugs Found And Fixed

| Bug | Fix | Status |
| --- | --- | --- |
| Initial Driver 360 header used `StatusBadge kind="driver"`, but the central registry does not define a driver status kind | Replaced that single badge with a local driver-status badge in the operating hub | Fixed |
| Mobile full-page screenshot timed out because Driver 360 is long | Captured mobile viewport evidence while retaining full-page desktop tab screenshots | Fixed |
| Existing `AssignVehicleDialog` exported a shared constant from a component file, causing focused Fast Refresh lint warning | Moved `OPEN_RENTAL_STATUSES` to `src/lib/rentals.ts` | Fixed |
| Existing `Drivers.tsx` KYC review handler used `any` | Added an explicit KYC review driver type | Fixed |

## Deployment Status

Local implementation, build, and QA are complete. This report is intended to be committed with the Layer 2B work, then pushed to both `origin/codex/kira-driver-v2-part1` and `origin/main`.

Production publish may still depend on the Lovable account that owns project `017fc525-5a16-4ead-82a4-cd0a37c0f243`.
