# SPEC (reviewed) — Fleet Control / Contrôle Flotte — Admin + Backend

> **Status of this document.** Senior-engineering review of the original
> "SPEC — Fleet Control / Contrôle Flotte" Google Doc against the actual
> codebase (June 12, 2026). The original spec assumed the module was "not
> live yet" — that is no longer true: the June 11–12 migrations implemented
> ~95% of it. This document is the authoritative version going forward: it
> records the naming decisions actually shipped, marks every requirement
> DONE or TO BUILD, and defines the remaining punch list.

## Naming decisions (shipped — do not rename)

| Original spec name      | Actual implementation                  |
| ----------------------- | -------------------------------------- |
| `fleet_controls`        | `vehicle_inspections`                  |
| `fleet_control_items`   | `vehicle_inspection_photos` (`zone` = item_key, holds photos AND documents via `item_type`) |
| `fleet_control_audit`   | `fleet_control_audit` (as specced)     |
| immobilization commands | `vehicle_immobilization_commands`      |
| storage                 | `vehicle-inspections` bucket (private, signed URLs) |

Status enum (control): `pending / submitted / approved / rejected / overdue / blocked / cancelled` — as specced.
Immobilization state: `none / requested / pending_stop / cut_sent / failed / cancelled / unblocked` — as specced.
Item zones (11): `front, rear, left, right, interior_front, interior_rear, dash` + `doc_carte_grise, doc_assurance, doc_vignette, doc_permis` (`src/lib/fleetControl.ts`).

## Requirement status

### DONE (verified in code — keep working, covered by `fleet-control-e2e`)
- Auto-creation on rental activation, idempotent (one active control per
  vehicle/driver), trigger `fc_autocreate_from_rental`.
- Server-side RPCs (SECURITY DEFINER): `fleet_control_submit` (completeness
  check), `fleet_control_approve` (resets due_at = now + cycle_days,
  reminder_count = 0, cancels sibling cycles, notifies driver),
  `fleet_control_reject` (reason required, notifies), per-item review RPC,
  `fleet_control_remind` (cooldown from settings; on approved controls
  creates/reuses next cycle), `fleet_control_immobilize_request/_cancel`,
  `fleet_control_unblock`, `fleet_control_log` audit helper.
- Settings in `platform_settings` + admin UI (`FleetControlSettingsCard`,
  Réglages > Contrôle flotte): cycle_days 14, late_threshold_days 3,
  relance_threshold 2, auto_immobilisation_enabled false,
  relance_cooldown_hours 24, require_all_photos, require_documents,
  parking_check_interval_min, plus `uffizio_immobilization_dry_run`
  (default **true** — safety flag, never remove).
- Admin page `/admin/fleet-control`: 6 KPI cards, search/filters/tabs,
  control cards with 11-tile thumbnail strip, detail dialog with signed-URL
  lightbox, per-item approve/reject with required reason, full
  approve/reject, Relancer with cooldown-disabled button, immobilization
  request/cancel/unblock buttons gated by state, audit timeline.
- Cron: `recompute-fleet-controls` hourly (overdue marking, cancellation on
  returned rentals, auto-immobilization gated by setting),
  `check-parking-immobilization` every 15 min (honest parked check,
  dry-run-aware Uffizio SET_OUT).
- RLS: tenant-scoped admin policies, driver-own policies, storage policies.
- Audit on every action with actor/actor_type/metadata.

### TO BUILD (punch list — this is the remaining work)
1. **FC-A1 — Admin manual control creation.** RPC
   `fleet_control_create_manual(vehicle_id, driver_id?, reason?)` +
   "Nouveau contrôle" button on `/admin/fleet-control`. Must respect the
   one-active-control idempotency rule and audit the action.
2. **FC-A2 — Realtime on admin page.** Subscribe to `vehicle_inspections`
   (and `vehicle_inspection_photos`) changes to invalidate queries so a
   driver submission appears without manual refresh. Reuse
   `useRealtimeSubscription` pattern; add tables to `supabase_realtime`
   publication if missing.
3. **FC-A3 — `require_documents` enforced independently.** Completeness
   checks in `fleet_control_submit`/`fleet_control_approve` must compute the
   required zone set from `require_all_photos` (7 photo zones) and
   `require_documents` (4 doc zones) instead of always requiring 11.
   Driver UI progress totals must use the same derived set.
4. **FC-A4 — `parking_check_interval_min` honesty.** The cron is fixed at
   15 min. Either (a) make the function self-throttle by reading the setting
   and skipping runs, or (b) mark the setting read-only in the UI with
   helper text "Intervalle fixe: 15 min". Decision: **(b)** for now — no
   fake configurability (spec principle: no settings that do nothing).
5. **FC-A5 — Uffizio real engine-cut wiring.** `uffizio-immobilizer`
   function currently logs intent only; `check-parking-immobilization`
   already calls SET_OUT honestly behind dry-run. Consolidate: keep dry-run
   default ON; document the go-live toggle in PRE_LAUNCH_CHECKLIST.
   (No code change required to stay honest; go-live is an ops decision.)

## Acceptance
- Existing `fleet-control-e2e` edge function (16 tests) must stay green.
- New punch-list items get acceptance coverage added to that function or to
  `scripts/` E2E (manual creation, require_documents matrix, realtime).
