# Baseline — Cross-cutting Fleet Category Fix

Goal: everywhere the UI groups vehicles by `vehicle_type` (Voitures / Motos), switch to the KIRA categorical taxonomy stored in `vehicles.fleet_group` (VTC / WARREN / CARGO / N'LOOTTO). Then stop and confirm the commit is clean before starting item 1 (Fleet Control admin).

## Source of truth

- DB column: `vehicles.fleet_group` with CHECK `('VTC','WARREN','CARGO','NLOOTTO')`. Already exists, already indexed.
- Helper: `src/lib/fleetCategories.ts` already exports `FLEET_CATEGORIES`, `fleetCategoryLabel`, `isValidFleetCategory`. Reuse — do not duplicate.
- `vehicle_type` ('car' | 'bike' | …) is kept untouched and continues to drive the visual icon choice (Car vs Bike). It is no longer a user-facing filter.
- The KIRA spec mentions `vehicles.type_service`; that column does not exist. Mapping decision (per user): use `fleet_group`, no schema rename.

## Scope of this commit

UI filter + label changes only. No DB migration. No business logic changes. No new screens.

### Files to edit

1. `src/components/VehicleCard.tsx`
   - `VehicleFilter` prop type: `'all' | FleetCategory` instead of `'all' | 'car' | 'bike'`.
   - Tabs built from `FLEET_CATEGORIES` (Tous + VTC + WARREN + CARGO + N'LOOTTO). Keep `value="all"` convention.
   - Card body still shows the Car/Bike icon based on `vehicle_type`; the small text label under the plate switches from "Voiture/Moto" to `fleetCategoryLabel(vehicle.fleet_group)` with a fallback dash.

2. `src/pages/driver/Vehicles.tsx`
   - Add `fleet_group` to the local `Vehicle` type and to the `.select(...)` projection.
   - `TypeFilter` → `'all' | FleetCategory`; filter line becomes `v.fleet_group === typeFilter`.
   - Replace the hardcoded Voitures / Motos tabs (lines 455–472) with a map over `FLEET_CATEGORIES`. Active-state classes unchanged.

3. `src/pages/admin/Vehicles.tsx`
   - Replace the `typeFilter` state and its Voitures/Motos UI with a `fleetGroupFilter` driven by `FLEET_CATEGORIES`. Filter line at ~443 becomes `vehicle.fleet_group === fleetGroupFilter`.
   - Create/Edit dialog: leave the `vehicle_type` Select alone (still needed for icon + CHECK constraint), and ensure the existing `fleet_group` Select uses `FLEET_CATEGORIES` (it already does — verify only).
   - CSV import help text and exported headers stay as-is (mention both columns).

4. `src/pages/admin/FleetControl.tsx`
   - `categoryFilter` currently keys off `vehicles.vehicle_type` (lines 108, 122, 361). Repoint to `vehicles.fleet_group`. Options come from `FLEET_CATEGORIES`. Badge label uses `fleetCategoryLabel`.
   - Add `fleet_group` to the nested vehicles select projection (line 79).

### Out of scope for baseline

- Touching `Kira.tsx`, `Finance.tsx`, `GpsMapping.tsx`, `DriverDetail.tsx`, `useAdminData.ts`, `useRentToOwn.ts` — these already either prefer `fleet_group` (Kira/Finance) or use `vehicle_type` for non-category purposes (icons, loan types, telemetry display). No KIRA-relevant label leak there.
- Any change to `vehicle_type` values, CHECK constraint, or RLS.
- All 11 build items — strictly baseline, then stop.

## Verification

1. Re-read each edited file; confirm only filter/label sites changed and no business logic.
2. Vite typecheck via the harness; no `Voitures`/`Motos` strings remain in the four edited files (`rg "Voitures|Motos" src/pages/admin/Vehicles.tsx src/pages/driver/Vehicles.tsx src/components/VehicleCard.tsx src/pages/admin/FleetControl.tsx`).
3. Preview `/admin/vehicles`, `/admin/fleet-control`, `/driver/vehicles` — confirm tabs read Tous · VTC · WARREN · CARGO · N'LOOTTO and that filtering narrows the list.
4. Stop. Report commit status and wait for go-ahead before starting item 1.
