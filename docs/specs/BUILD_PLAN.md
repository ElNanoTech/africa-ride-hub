# Build Plan — Fleet Control completion + Chauffeurs (Driver 360°)

> Working agreement for this delivery. Branch:
> `claude/gracious-dirac-3vx6b0` (draft PR). Specs:
> `SPEC_FLEET_CONTROL.md`, `SPEC_FLEET_CONTROL_DRIVER.md`,
> `SPEC_CHAUFFEURS.md` in this folder. Item IDs (FC-A*, FC-D*, CH-*) are
> referenced in commits.

## Sequencing

**Phase 1 — Fleet Control finish line** (small, unblocks the Chauffeurs
Fleet Control tab):
FC-A1 manual creation · FC-A2 admin realtime · FC-A3 require_documents
matrix · FC-A4 honest interval setting · FC-D1 history/detail routes ·
FC-D2 deep links · FC-D3 progress breakdown · FC-D4 due-date copy ·
FC-D5 driver realtime · FC-D6 immobilization copy.

**Phase 2 — Chauffeurs backend**: CH-B1 risk function · CH-B2 wizard KYC
linkage · CH-B3 wallet auto-creation · CH-B4 profile realtime.

**Phase 3 — Chauffeurs UI**: CH-L1..L4 list · CH-P1..P7 profile.

**Phase 4 — Integration QA**: full real-world walkthrough on the isolated
E2E tenant; fix everything found; final acceptance report.

## Engineering rules
- Migrations are additive; never weaken RLS; every new RPC is SECURITY
  DEFINER with explicit role checks and an audit write where state changes.
- Money is integer XOF. UI copy is simple French. No fake UI: build it,
  disable it with a reason, or hide it.
- Do not break: auth, rentals, vehicles, wallet, facturation, Wave,
  sinistres, alerts, RLS/tenant scoping, CSV import, bulk KYC, driver_360
  RPC, access-code flow, dry-run immobilization default.
- `bun run test` + `tsc --noEmit` green before every commit; build green
  before every push.

## QA protocol (before the user ever tests)
1. Unit: vitest for risk thresholds, due-date copy helper, required-zone
   derivation.
2. E2E (live backend, isolated tenant from `e2e-bootstrap` /
   `fleet-control-e2e`): scripted driver+admin role-play — driver logs in,
   uploads 11 items, submits; admin approves/rejects per item; driver
   corrects; contravention → charge → invoice; wizard-created driver logs
   in with PIN. Extend `scripts/` as needed.
3. Browser pass (Playwright against `vite dev` + live backend, E2E tenant
   creds): real clicks for the driver submit flow and admin review flow;
   screenshot evidence.
4. Code review pass (separate reviewer agent) on the full diff per phase.
5. Acceptance report appended to the PR: PASS/FAIL per spec acceptance
   item, bugs found+fixed, honest remaining TODOs.

## Out of scope (tracked, not built now)
Real OTP/SMS backend, FCM HTTP v1 migration, Wave production keys, Yango
403, PWA/service-worker reinstatement, credit/infractions score factors
(needs product rules), live (non-dry-run) engine cut go-live.
