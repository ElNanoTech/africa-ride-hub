## What's actually left

I verified live DB state. Out of the three migrations referenced in your runbook, only `fleet_control_create_manual` exists (because I added it last turn as a standalone migration). Everything else is still missing:

| Check | Live DB |
|---|---|
| `fleet_control_create_manual(uuid,uuid,text)` | ✅ present |
| `fleet_control_required_zones()` | ❌ missing |
| `fleet_control_submit / approve` (latest versions) | ❌ stale/missing |
| `driver_risk(uuid)` | ❌ missing |
| `drivers_risk_summary()` | ❌ missing |
| `notifications_notification_type_check` contains `admin_message` | ❌ no |

So no — the previous turn only partially closed item #2 of the runbook. The three migration files exist in the repo but were never executed against the live project, and `admin_message` is still rejected.

## Plan

### 1. Apply migration `20260612121500…` (Fleet Control RPCs)
Run the file as a single `supabase--migration` call. It's idempotent (`CREATE OR REPLACE` throughout). This installs `fleet_control_required_zones()` (11 zones), refreshes `fleet_control_submit / approve`, and re-affirms `fleet_control_create_manual`.

### 2. Apply migration `20260612130000…` (Risk + wallet)
Single `supabase--migration` call. Installs `driver_risk_from_factors`, `driver_risk(uuid)`, `drivers_risk_summary()`, refreshes `create_driver_wallet`. Note: the file uses bare `CREATE FUNCTION public.drivers_risk_summary()` — I'll prepend a `DROP FUNCTION IF EXISTS public.drivers_risk_summary();` guard so it's safely re-runnable.

### 3. Apply migration `20260612140000…` (admin_message constraint)
Single `supabase--migration` call. Drops and recreates `notifications_notification_type_check` with `admin_message` added.

### 4. Schema cache reload
Append `NOTIFY pgrst, 'reload schema';` to migration #3 so PostgREST sees the new RPCs immediately (avoids the PGRST202 404s the frontend hooks retry-guard against).

### 5. Redeploy edge functions
Call `supabase--deploy_edge_functions` with `["send-push-notification", "fleet-control-e2e"]`.

### 6. Verify
Run a single `supabase--read_query`:
- `to_regprocedure` for the 4 RPCs
- `array_length(public.fleet_control_required_zones(), 1)` → expect `11`
- `pg_get_constraintdef` for the notifications check → expect `admin_message` present

Report the verification table back to you. No frontend code changes — the hooks (`useDriverRisk`, `useDriversRiskSummary`, `FleetControlCreateDialog`, `SendDriverMessageDialog`) already target these RPCs and constraint.

## Risk

- Each migration call requires your approval (one yes per file = 3 approvals total).
- All three are idempotent in shape; the only adjustment is the `DROP FUNCTION IF EXISTS` guard on `drivers_risk_summary` to make migration #2 truly re-runnable.
- No data is rewritten; only function and constraint DDL.