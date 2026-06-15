# QA Report: Layer 2D Vehicle Operations Center

Date: 2026-06-15
Branch: `codex/kira-driver-v2-part1`

## Summary

Layer 2D Vehicle Operations Center was implemented and verified against the live QA tenant through the existing Playwright QA harness.

Result: PASS

- Checks: 60/60 PASS
- Console/network findings: 0
- Seeded vehicle: `QA-E2E-100`
- Primary route: `/admin/vehicle-operations`
- Vehicle 360 route: `/admin/vehicles/:id`
- Existing inventory route preserved: `/admin/vehicles`

## Screenshots

- `docs/specs/screenshots/layer2d/60-layer2d-vehicle-operations.png`
- `docs/specs/screenshots/layer2d/61-layer2d-vehicle-360-overview.png`
- `docs/specs/screenshots/layer2d/62-layer2d-vehicle-360-finance.png`
- `docs/specs/screenshots/layer2d/63-layer2d-vehicle-360-history.png`
- `docs/specs/screenshots/layer2d/64-layer2d-mobile.png`
- `docs/specs/screenshots/layer2d/layer2d-qa-matrix.json`

## Acceptance Matrix

| Spec Test | Result | Evidence |
| --- | --- | --- |
| Vehicle appears | PASS | Seeded plate `QA-E2E-100` visible in Vehicle Operations and Vehicle 360 |
| Assign driver | PASS | Assign/Reassign action opens the existing allocation dialog |
| Finance tab shows revenue | PASS | Finance tab verifies revenue, maintenance cost, fines, insurance, net contribution |
| Fleet Control tab links correctly | PASS | `/admin/fleet-control` link present and verified |
| Maintenance tab links correctly | PASS | `/admin/maintenance` link present and verified |
| GPS tab works | PASS | GPS tab shows location/device/status and links to `/admin/tracking` |
| Contraventions visible | PASS | Contraventions tab shows unpaid fines, attribution, amount |
| History timeline populated | PASS | History tab shows unified timeline section |
| Health state updates | PASS | Health state and health score render from derived operational signals |
| No dead buttons | PASS | QA verified route links and assignment dialog entry point |

## Verification Commands

```bash
npx eslint src/lib/vehicleOperations.ts src/lib/vehicleOperations.test.ts src/hooks/useVehicleOperationsData.ts src/hooks/useRealtimeSubscription.ts src/pages/admin/VehicleOperations.tsx src/pages/admin/VehicleDetail.tsx src/App.tsx src/components/AdminLayout.tsx scripts/qa/15-layer2d-vehicle-operations.ts
bun run test -- src/lib/vehicleOperations.test.ts src/lib/financialOperations.test.ts src/lib/financeAmounts.test.ts src/lib/routeScopes.test.ts
npm run build
QA_APP_URL=http://127.0.0.1:8081 QA_SHOT_DIR=docs/specs/screenshots/layer2d bun run scripts/qa/15-layer2d-vehicle-operations.ts
```

## Bugs Fixed During QA

- Hardened the Layer 2D QA script to reuse the authenticated desktop session for the mobile viewport check, avoiding a flaky second mobile login while preserving responsive verification.

## Known Limitations

- Vehicle Profitability Index is an operational indicator only, not accounting output.
- Retirement readiness is advisory only; no automation or retirement workflow is triggered.
- GPS data reuses the existing `vehicle_positions` integration. No duplicate GPS system was introduced.
- Driver removal routes operators to the existing Rentals module to handle return/removal safely.
- Maintenance and fleet control actions reuse their existing modules rather than creating duplicate workflows.
