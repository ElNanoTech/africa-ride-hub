
# Fleet Control — Full Rebuild per Spec

The current implementation has the bones (`vehicle_inspections`, `vehicle_inspection_photos`, `vehicle_immobilization_commands`, admin page, dialog) but is missing most of the spec: no driver submission UI, no item-level review, no settings, no reminders/cooldown, no honest immobilization state machine, no audit trail, no cron, hardcoded values, and the photo zone list doesn't match the spec (current has `tires`/`doc_carte_parking`, spec asks for `intérieur arrière`/`permis`).

Building this in 4 phases, each deployable.

## Phase 1 — Data model & settings (1 migration)

Extend existing tables instead of creating parallel ones.

**`vehicle_inspections`** — add columns:
- `cycle_days` int (default from settings)
- `last_validated_at` timestamptz
- `reviewed_by` uuid, `reviewed_at` timestamptz (rename of validated_*)
- `last_reminder_at` already exists
- `immobilization_state` text default `'none'` — none | requested | pending_stop | cut_sent | failed | cancelled | unblocked
- `immobilization_requested_by/at`, `immobilization_cancelled_at`, `immobilization_command_ref`
- `rental_id` uuid nullable

Update status CHECK to: `pending | submitted | approved | rejected | overdue | blocked | cancelled` (migrate `draft→pending`, `validated→approved`, `expired→overdue`).

**`vehicle_inspection_photos`** — add columns to make each photo a reviewable item:
- `customer_id`, `vehicle_id`, `driver_id`
- `item_type` text — `photo` | `document`
- `label` text
- `validation_status` text default `'pending'` — pending | submitted | approved | rejected
- `rejection_reason`, `reviewed_by`, `reviewed_at`, `submitted_at`

Update zone CHECK to spec's 11 zones:
- photos: `front`, `rear`, `left`, `right`, `interior_front`, `interior_rear`, `dash`
- docs: `doc_carte_grise`, `doc_assurance`, `doc_vignette`, `doc_permis`
- Keep `tires` and `doc_carte_parking` as legacy-accepted to avoid breaking the seeder, then drop in a follow-up.

**New `fleet_control_audit`** table — id, customer_id, fleet_control_id, vehicle_id, driver_id, actor_id, actor_type (`admin|driver|system`), action, metadata jsonb, created_at. RLS: customer-scoped read for admins; insert via SECURITY DEFINER helpers.

**`platform_settings`** rows for fleet_control config:
- `fleet_control.cycle_days` (14)
- `fleet_control.late_threshold_days` (3)
- `fleet_control.relance_threshold` (2)
- `fleet_control.auto_immobilisation_enabled` (false)
- `fleet_control.parking_check_interval_min` (15)
- `fleet_control.relance_cooldown_hours` (24)
- `fleet_control.require_all_photos` (true)
- `fleet_control.require_documents` (true)

Helper RPCs:
- `fleet_control_settings()` → jsonb
- `fleet_control_log(p_inspection uuid, p_action text, p_metadata jsonb)` SECURITY DEFINER
- `fleet_control_remind(p_inspection uuid)` — enforces cooldown, increments, logs, creates notification
- `fleet_control_approve(p_inspection uuid)` — only if all items approved/submitted; schedules next `due_at = now() + cycle_days * interval '1 day'`, resets counters, logs
- `fleet_control_reject(p_inspection uuid, p_reason text)`
- `fleet_control_item_review(p_item uuid, p_status text, p_reason text)`
- `fleet_control_immobilize_request/cancel/unblock`

RLS — extend existing policies:
- Drivers SELECT/UPDATE rows where `driver_id = current_driver_id()` and only their own items
- Customer admins keep current scoping
- Audit table: admins read tenant; inserts only via SECURITY DEFINER

## Phase 2 — Driver PWA submission

New routes/files:
- `src/pages/driver/FleetControl.tsx` — list + status card
- `src/pages/driver/FleetControlSubmit.tsx` — 11-tile grid (photo or document upload per tile, camera-first on mobile, retake before submit, progress `n/11`, submit disabled until required items complete per settings)
- `src/hooks/useDriverFleetControl.ts` — query active control + items, upload mutation (Supabase Storage SDK → `vehicle-inspections` bucket), submit mutation
- Add a Fleet Control card to `src/pages/driver/Home.tsx` with state-aware copy (pending/overdue/rejected/approved) per spec §8

Register routes in `App.tsx`. Add Driver nav entry. Show rejection reason banner when status=rejected.

## Phase 3 — Admin redesign

Rewrite `src/pages/admin/FleetControl.tsx`:
- New header + subtitle per spec
- 6 KPI tiles (Total / Conformes / À valider / En retard / Bloqués / Refusés)
- Tabs: Toutes / À valider / En retard / Conformes / Bloqués / Refusés
- Filters: search (plate/driver/model), status, category, overdue only, driver
- Card grid showing the 11-item thumbnail strip inline (empty grey / submitted thumb / green check / red X)
- Card actions: Approve full, Reject full, Send reminder (disabled during cooldown w/ tooltip), Request immobilization, Cancel immobilization, Unblock

Rebuild `FleetControlDetailDialog`:
- Per-item review with Approve / Reject + reason
- Honest immobilization state badges + buttons calling the RPCs (no fake success — show "Commande enregistrée — intégration Uffizio en attente" while `command_ref = PENDING_INTEGRATION`)
- Audit timeline section (read from `fleet_control_audit`)

New `src/pages/admin/Settings.tsx` section "Contrôle flotte" reading/writing the 8 settings via `platform_settings`.

## Phase 4 — Cron + audit + notifications

- `supabase/functions/recompute-fleet-controls` (daily) — sets `overdue`, closes controls for returned rentals, optional auto-immobilize when enabled and threshold crossed
- `supabase/functions/check-parking-immobilization` (every N minutes per settings) — when `immobilization_state='requested'` and last GPS point is parked, advance to `pending_stop` → record `cut_sent` with `command_ref='PENDING_INTEGRATION'` and set status=`blocked`
- Reuse existing `notifications` table for driver alerts (new types: control required / overdue / approved / rejected / blocked / unblocked / reminder)
- Hook all admin/driver mutations into `fleet_control_log` so audit captures everything

Wire schedules via `pg_cron` migration calling the functions on the documented intervals.

## Definition of Done (from spec §22)

All 12 acceptance tests pass; no hardcoded 14/30; immobilization state is persisted and honest; audit covers every action; RLS prevents cross-driver and cross-tenant access; settings drive behavior.

## Technical notes

- Customer scoping via existing `current_customer_id()` / `is_admin()` / `is_platform_owner()` helpers
- Use `supabaseDriver` for driver upload mutations, `supabaseAdmin` for admin actions, route-aware proxy for hooks
- Storage: existing `vehicle-inspections` bucket; signed URLs scoped per-tenant
- No new shared CSS — reuse design tokens
- Lazy-load both new driver pages via existing `lazyWithRetry`

## What I'll need from you to proceed

1. **OK to migrate existing `vehicle_inspections.status` values** (`draft→pending`, `validated→approved`, `expired→overdue`)? Module isn't live yet but want to confirm.
2. **OK to rename zone `tires` → `interior_rear` and `doc_carte_parking` → `doc_permis`** in the CHECK constraint (spec doesn't have tires/parking card)? Existing rows: 0, so safe.
3. **Scope confirmation:** build all 4 phases now in a single push, or stop after each phase for review?
