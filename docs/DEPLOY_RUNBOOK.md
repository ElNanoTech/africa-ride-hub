# DEPLOY RUNBOOK — apply the merged Fleet Control + Chauffeurs backend to live

**For: Lovable dev (has Supabase access).**
**Why:** PR #1 merged to `main`, but the three database migrations and two edge
functions it added were **never applied to the live Supabase project**
(`fihrjavcdwpttvnlqqxc`). Proof: `driver_risk`, `drivers_risk_summary`,
`fleet_control_create_manual` return 404, and `admin_message` is rejected by the
`notifications_notification_type_check` constraint (a constraint, not a cache —
so the migration simply isn't applied). The frontend deployed; the DB/functions
did not. This runbook applies them. **Everything here is idempotent and safe to
re-run.**

All three migration files are already in the repo on `main` under
`supabase/migrations/`. Run their SQL **in order**; they only use
`CREATE OR REPLACE`, `DROP … IF EXISTS`, and guarded `DO` blocks.

---

## STEP 1 — Apply the 3 migrations (in this order)

Run the full SQL of each file (Supabase SQL Editor, or `supabase db push`):

1. `supabase/migrations/20260612121500_e8631a59-f88a-4873-b313-fc6f1c2c8a8c.sql`
   - Adds RPCs `fleet_control_required_zones()`, `fleet_control_create_manual(uuid,uuid,text)`
   - Hardens `fleet_control_submit(uuid)` / `fleet_control_approve(uuid)`
   - Adds `vehicle_inspections`, `vehicle_inspection_photos` to the
     `supabase_realtime` publication (+ REPLICA IDENTITY FULL)
2. `supabase/migrations/20260612130000_fe4b4686-3b71-4b1a-baed-81b0884ce22b.sql`
   - Adds RPCs `driver_risk_from_factors(...)`, `driver_risk(uuid)`,
     `drivers_risk_summary()`
   - Adds wallet auto-create trigger `trg_create_driver_wallet` on `drivers`
     (+ one-off backfill for existing driver rows)
   - REPLICA IDENTITY FULL + publication for `driver_documents`, `kyc_submissions`
3. `supabase/migrations/20260612140000_6b2c46f7-bcda-4d8f-a199-54a4257bf799.sql`
   - Recreates `notifications_notification_type_check` to allow `admin_message`

## STEP 2 — Reload the PostgREST schema cache

```sql
NOTIFY pgrst, 'reload schema';
```

## STEP 3 — Deploy the updated edge functions (both already on `main`)

```bash
supabase functions deploy send-push-notification --project-ref fihrjavcdwpttvnlqqxc
supabase functions deploy fleet-control-e2e      --project-ref fihrjavcdwpttvnlqqxc
```
- `send-push-notification` gained a `skipInApp` flag (prevents the
  "Envoyer message" feature from double-inserting an in-app notification).
- `fleet-control-e2e` updated to assert the settings-derived required-zone set.

> NOTE: the hardened **`wave-checkout`** function (driver-can-only-pay-own-invoice
> + partial `remaining_due` + no-duplicate) is on a **separate `codex/…` branch
> that is NOT yet in GitHub** — it is out of scope for this runbook. Push/merge
> that branch first, then `supabase functions deploy wave-checkout`.

## STEP 4 — Verify (expected results in comments)

```sql
-- (a) New functions exist → expect 5 rows
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE proname IN ('fleet_control_create_manual','fleet_control_required_zones',
                  'driver_risk','drivers_risk_summary','create_driver_wallet')
ORDER BY proname;

-- (b) admin_message now allowed → the returned CHECK definition must contain 'admin_message'
SELECT pg_get_constraintdef(oid)
FROM pg_constraint WHERE conname = 'notifications_notification_type_check';

-- (c) wallet auto-create trigger exists → expect 1 row
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_create_driver_wallet';

-- (d) realtime publication includes the new tables → expect 4 rows
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('vehicle_inspections','vehicle_inspection_photos',
                    'driver_documents','kyc_submissions')
ORDER BY tablename;

-- (e) zone function smoke test → expect 11 zones (7 photos + 4 docs) by default
SELECT public.fleet_control_required_zones();
```

## STEP 5 — Re-run the end-to-end acceptance suite (needs the service-role key)

```bash
curl -s -X POST "https://fihrjavcdwpttvnlqqxc.supabase.co/functions/v1/fleet-control-e2e" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" -H "Content-Type: application/json" \
  | jq '.tests[] | {step, name, pass}'
```
Expect all 16 tests `pass: true`. It operates only on its own `fc-e2e-*` test tenant.

## STEP 6 — Functional spot-check in the app

- Admin → `/admin/fleet-control` → **Nouveau contrôle** → pick a vehicle → control created (no "Fonction indisponible" toast).
- Admin → `/admin/drivers` → **Risque** column + "À risque" KPI show real values (not "—").
- Admin → a driver profile → **Envoyer message** → sends with no error; appears once in the driver's notifications.

---

*Safe to re-run end to end. After Step 1–2 the "pending-deploy" features in the
Phase-4 QA report go live; Steps 3–6 confirm functions + acceptance.*
