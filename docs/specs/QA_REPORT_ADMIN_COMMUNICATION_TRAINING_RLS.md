# QA Report - Admin Communication Training RLS Regression

Date: 2026-06-14
Scope: `/admin/communication` > Formations > Nouveau module
Seeded admin: `e2e-customer-admin@dam-test.local`

## Issue

Creating a training module showed:

`new row violates row-level security policy for table "training_modules"`

## Root Cause

`src/pages/admin/Communication.tsx` imported the legacy shared Supabase client:

`@/integrations/supabase/client`

That client does not use the isolated admin auth storage. On admin routes, writes could run without the admin JWT, so Supabase evaluated the request as unauthorized and RLS rejected the insert.

## Fix

- Switched Communication to `supabaseAdmin`.
- Replaced loose `any` types with generated Supabase table/function types.
- Fixed the Formation tracking driver query from stale columns `status`/`phone` to `driver_status`/`phone_number`.
- Added regression QA script: `scripts/qa/12-admin-training-module.ts`.

## Evidence

| Evidence | File |
| --- | --- |
| Before/entry state | `docs/specs/screenshots/regressions/30-admin-communication-formations-empty.png` |
| Module created successfully | `docs/specs/screenshots/regressions/31-admin-training-module-created.png` |
| Machine-readable matrix | `docs/specs/screenshots/regressions/admin-training-module-qa-matrix.json` |

## PASS/FAIL Matrix

| Check | Result |
| --- | --- |
| Admin can create training module through mobile-sized UI | PASS |
| Temporary module appears in the list | PASS |
| Temporary module cleanup succeeds | PASS |
| Console/network findings | PASS, 0 findings |

## Commands

```bash
npx eslint src/pages/admin/Communication.tsx scripts/qa/12-admin-training-module.ts
QA_SHOT_DIR=docs/specs/screenshots/regressions bun run scripts/qa/12-admin-training-module.ts
npm run build
```

Results:

- Focused lint: PASS
- Regression QA: PASS
- Production build: PASS

## Deployment Note

This is a frontend code fix. It requires the Lovable production publish step after the pushed commit is available on `main`.
