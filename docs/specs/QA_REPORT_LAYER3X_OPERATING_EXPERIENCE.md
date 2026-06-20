# QA Report - Layer 3X Operating Experience, Training & User Guidance

## Scope

Layer 3X adds the operating guidance layer: role homepages, smart navigation data, guided workflows, next-best-actions, learning center, knowledge search, playbooks, contextual help, empty/disabled-state guidance, adoption signals, tenant health scoring, audit, and realtime-ready tables.

## Implementation Artifacts

- Schema migration: `supabase/migrations/20260620164027_b309945c-b3a5-4217-a20e-fccc4b0b5385.sql`
- Search alignment migration: `supabase/migrations/20260620171000_layer3x_operating_search_alignment.sql`
- Admin page: `src/pages/admin/OperatingExperience.tsx`
- Data hook: `src/hooks/useOperatingExperienceData.ts`
- Helpers/tests: `src/lib/operatingExperience.ts`, `src/lib/operatingExperience.test.ts`
- QA script: `scripts/qa/27-layer3x-operating-experience.ts`
- Screenshots: `docs/specs/screenshots/layer3x/`

## Acceptance Matrix

| ID | Requirement | Status |
| --- | --- | --- |
| AT-3X-001 | Role-based homepages work | PASS |
| AT-3X-002 | Disabled actions explain reason | PASS |
| AT-3X-003 | Empty states guide user | PASS |
| AT-3X-004 | Training completion tracked | PASS |
| AT-3X-005 | Knowledge search works | PASS |
| AT-3X-006 | Next Best Action generated | PASS |
| AT-3X-007 | Driver education available | PASS |
| AT-3X-008 | Tenant health score calculated | PASS |

## Security Validation

- All Layer 3X tenant tables use RLS.
- Tenant-scoped objects are restricted to platform owners or `current_customer_id()`.
- Driver learning progress is restricted to `current_driver_id()`.
- Mutating RPCs use `SECURITY DEFINER SET search_path = public` and permission checks.
- Operating guidance audit events are immutable.
- Search is served from published/active guidance content through an RPC.

## Realtime Validation

Layer 3X marks realtime tables `REPLICA IDENTITY FULL` and idempotently adds them to `supabase_realtime` when the publication exists. QA script verifies an `operating_guidance_audit_events` insert is observed through realtime.

## Verification Commands

```bash
npm run build
npm run test
npx eslint src/pages/admin/OperatingExperience.tsx src/hooks/useOperatingExperienceData.ts src/lib/operatingExperience.ts src/lib/operatingExperience.test.ts src/App.tsx src/components/AdminLayout.tsx src/hooks/useRealtimeSubscription.ts src/hooks/useAuditLog.ts scripts/qa/27-layer3x-operating-experience.ts
git diff --check
```

## Local Verification Results

| Check | Result |
| --- | --- |
| Focused helper test: `npm run test -- operatingExperience` | PASS - 7 tests |
| Focused ESLint on touched 3X/route/realtime/audit files | PASS |
| Full test suite: `npm run test` | PASS - 27 files, 203 tests |
| Production build: `npm run build` | PASS |
| Whitespace check: `git diff --check` | PASS |
| Live migration marker `20260620120000` | PASS - applied by user |
| Layer 3X browser/RPC QA | PASS - 46 checks, 0 failed |

Build warnings observed were existing Vite chunk-size/dynamic-import warnings and stale Browserslist metadata; no Layer 3X build failure.

## Live Migration Notes

The target Supabase project records migration marker `20260620120000` (`layer3x_operating_experience`). Live verification confirmed 12 tables, 8 `security_invoker` views, and seeded guidance content: 10 roles, 13 modules, 8 articles, 7 playbooks, 7 workflows, 4 help screens, 6 guidance features, 9 health rows, and 10 next-best-actions.

The repo migration history already contains the generated/applied Layer 3X schema migration from `origin/main`. A follow-up search-alignment migration keeps the repo contract matched to the hosted retry behavior:

- `knowledge_articles.search_vector` uses `to_tsvector('simple'::regconfig, ...)`.
- `array_to_string(tags, ' ')` was removed from the generated expression because it is `STABLE` on the hosted Postgres build. Tags remain searchable through explicit tag filters in `v_operating_search_index` and `search_operating_knowledge`.

## Browser/RPC QA

Executed against the live-applied schema and local app server:

```bash
QA_APP_URL=http://127.0.0.1:8082 \
QA_SHOT_DIR=docs/specs/screenshots/layer3x \
npx vite-node scripts/qa/27-layer3x-operating-experience.ts
```

Result: PASS - 46 checks, 0 failed. The run verified all Layer 3X relations/views, seed counts, search RPC, learning progress RPC, guided workflow RPC, next-best-action refresh, tenant health recalculation, immutable audit RPC, realtime audit inserts, and browser rendering for role homepages, training, knowledge search, guided workflow, empty/disabled states, and tenant health.

Screenshots and summary:

- `docs/specs/screenshots/layer3x/role-homepage.png`
- `docs/specs/screenshots/layer3x/training-center.png`
- `docs/specs/screenshots/layer3x/knowledge-search.png`
- `docs/specs/screenshots/layer3x/guided-workflow.png`
- `docs/specs/screenshots/layer3x/empty-disabled-states.png`
- `docs/specs/screenshots/layer3x/tenant-health-dashboard.png`
- `docs/specs/screenshots/layer3x/layer3x-qa-summary.json`

Service-role cross-tenant QA was not run in this local shell because no `QA_SUPABASE_SERVICE_ROLE_KEY` was available. The script recorded that caveat and used the admin-visible E2E tenant for user-facing RPC checks. To verify the seeded `qa-layer3x-operations` tenant directly, rerun with `QA_SUPABASE_SERVICE_ROLE_KEY` set. Do not commit or expose the service-role key.

## Deployment Gate

Layer 3I was pending in the worktree when Layer 3X implementation began. Do not commit or push Layer 3X until Layer 3I is finalized or the user explicitly authorizes continuing from the pending state.
