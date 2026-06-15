# QA Report — Layer 2E Trust & Risk Center

Date: 2026-06-15

## Summary

Layer 2E adds the Trust & Risk Center at `/admin/trust-risk` as an operations layer over the existing score, KYC, fleet control, contraventions, sinistres, and Driver 360 systems.

Final QA result: **66/66 PASS**, **0 FAIL**, **0 console/network findings**.

## Seeded Coverage

Validated against the isolated E2E tenant from `/tmp/qa-creds.json`.

- Drivers: 9
- Seeded fines: 1 `traffic_violations` row
- Seeded accidents: 2 `accidents` rows
- Seeded KYC issues: 2 drivers requiring KYC attention
- Fleet control rows: 7 `vehicle_inspections` rows
- Credit score rows: 9 `credit_scores` rows
- Score events: 1 `driver_score_events` row
- Seeded vehicle: `QA-E2E-100`

The Layer 2E QA script now idempotently ensures a pending fine and accident fixture in the isolated E2E tenant before verification.

## Screenshots

- `docs/specs/screenshots/layer2e/65-layer2e-trust-risk-overview.png`
- `docs/specs/screenshots/layer2e/66-layer2e-risk-queue.png`
- `docs/specs/screenshots/layer2e/67-layer2e-risk-driver-handoff.png`
- `docs/specs/screenshots/layer2e/68-layer2e-module-handoffs.png`
- `docs/specs/screenshots/layer2e/69-layer2e-mobile.png`
- `docs/specs/screenshots/layer2e/layer2e-qa-matrix.json`

## Acceptance Matrix

All required acceptance areas passed:

- Driver score visible
- Risk reason visible
- Fine appears
- Sinistre appears
- KYC issue appears
- Fleet control issue appears
- Score event visible
- Trust timeline populated
- Simulation works
- No dead buttons
- Supporting routes load: `/admin/scoring`, `/admin/contraventions`, `/admin/incidents`, `/admin/fleet-control`, `/admin/drivers/:id?tab=risk`

## Bugs Fixed During QA

- Contraventions tab did not show the `Score Impact` column label when there were no open fine rows. Fixed with stable headers and empty states.
- QA fixture accident insert initially used invalid lowercase schema values. Fixed to use `COLLISION` and `MINOR`.
- Draft accident statuses are now excluded from open sinistre risk counts.

## Known Limitations

- The center is read-only/operational. It does not create a new score engine, compliance engine, AI underwriting, automatic suspension, or repossession workflow.
- Score simulation is local and read-only; it does not write score changes.
- Insurance/cost depth depends on the existing sinistres data available in source modules.
- Trust events are traceable from existing source rows; richer audit details depend on source module event completeness.

## Verification

Commands passed:

```bash
npx eslint src/lib/trustRisk.ts src/lib/trustRisk.test.ts src/hooks/useTrustRiskData.ts src/pages/admin/TrustRisk.tsx src/App.tsx src/components/AdminLayout.tsx src/hooks/useRealtimeSubscription.ts scripts/qa/16-layer2e-trust-risk.ts
bun run test -- src/lib/trustRisk.test.ts src/lib/driverRisk.test.ts src/lib/routeScopes.test.ts src/lib/vehicleOperations.test.ts
npm run build
QA_APP_URL=http://127.0.0.1:8081 QA_SHOT_DIR=docs/specs/screenshots/layer2e bun run scripts/qa/16-layer2e-trust-risk.ts
```
