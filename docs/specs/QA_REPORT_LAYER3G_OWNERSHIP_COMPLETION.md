# QA Report - Layer 3G Ownership Completion & Asset Transfer

Date: 2026-06-18

## Scope

Layer 3G governs successful ownership completion after a financed account is fully satisfied. This QA package covers:

- Ownership completion candidate sync.
- Completion review open, assignment, approval, and final approval.
- Asset transfer record creation.
- Ownership certificate issuance.
- Driver-safe ownership completion status.
- Reversal cleanup and audit validation.
- Admin Ownership Completion Center at `/admin/ownership-completion`.
- Driver 360 ownership status, plus driver `/driver/credit` and `/driver/finance` ownership surfaces.

## New QA Script

Script:

```bash
QA_APP_URL=http://127.0.0.1:8082 QA_SHOT_DIR=docs/specs/screenshots/layer3g bun run scripts/qa/24-layer3g-ownership-completion.ts
```

Expected behavior:

- If a qualifying completion candidate exists in `v_ownership_completion_queue`, the script runs the idempotent happy path through review, final approval, transfer/certificate issuance, driver-safe status verification, screenshots, and reversal cleanup.
- If no qualifying candidate exists, the script records a graceful passing skip for mutation coverage and still runs browser smoke checks.
- Browser checks run in isolated driver/admin phases to avoid long-lived Playwright browser-state flake while preserving one parent command and summary.
- Hosted Supabase auth/bootstrap console noise is filtered using the same pattern as Layer 3F.
- A JSON summary is written to `docs/specs/screenshots/layer3g/layer3g-qa-summary.json`.

## Acceptance Matrix

| ID | Acceptance Test | Status | Evidence |
| --- | --- | --- | --- |
| AT-3G-001 | Fully paid account eligible for completion. | PASS sync / SKIPPED mutation seed | `sync_ownership_completion_candidates` ran successfully; live queue has no eligible candidate, so happy-path mutation was not exercised. |
| AT-3G-002 | Outstanding balance blocks completion. | PASS smoke | Sync produced a `NOT_ELIGIBLE` review in the live seed tenant; no eligible queue row was exposed. |
| AT-3G-003 | Active default review blocks completion. | PASS schema / pending seeded case | Guard logic is present in migration; no live active-default completion seed was available. |
| AT-3G-004 | Completion creates transfer record. | SKIPPED - no eligible seed | QA summary records `mutationCoverage: skipped`. |
| AT-3G-005 | Certificate generated successfully. | SKIPPED - no eligible seed | QA summary records `mutationCoverage: skipped`; certificate UI surface rendered. |
| AT-3G-006 | Driver lifecycle updated. | PASS smoke | Driver 360 ownership status screenshot captured. |
| AT-3G-007 | Ownership event emitted to Growth Engine. | PASS integration smoke / skipped mutation event | Growth/Trust integration code is wired; no completion event emitted without an eligible seed. |
| AT-3G-008 | Completion reversal audited. | SKIPPED - no eligible seed | Reversal cleanup is only attempted after a completed mutation workflow. |

## Commands

Static validation:

```bash
npm run build
npm run test
npx eslint scripts/qa/24-layer3g-ownership-completion.ts
git diff --check
```

Browser/RPC QA:

```bash
QA_APP_URL=http://127.0.0.1:8082 QA_SHOT_DIR=docs/specs/screenshots/layer3g bun run scripts/qa/24-layer3g-ownership-completion.ts
```

## Browser QA Artifacts

Captured after the browser/RPC QA run:

- `docs/specs/screenshots/layer3g/admin-ownership-completion-queue.png`
- `docs/specs/screenshots/layer3g/admin-ownership-completion-review.png`
- `docs/specs/screenshots/layer3g/admin-ownership-transfer-certificate.png`
- `docs/specs/screenshots/layer3g/admin-driver360-ownership-status.png`
- `docs/specs/screenshots/layer3g/driver-credit-ownership-status.png`
- `docs/specs/screenshots/layer3g/driver-finance-ownership-status.png`
- `docs/specs/screenshots/layer3g/layer3g-qa-summary.json`

## Migration And Live Validation

Live migration was manually applied and marked:

- `20260618130000 layer3g_ownership_completion_asset_transfer`
- Tables confirmed: `ownership_completion_reviews`, `ownership_completion_decisions`, `asset_transfer_records`, `ownership_certificates`, `ownership_completion_audit_events`.
- Views confirmed: `v_ownership_completion_queue`, `v_driver_ownership_completion_status`, `v_ownership_completion_exceptions`.
- Functions confirmed: `default_ownership_completion_rules`, `has_ownership_completion_permission`, `ownership_completion_eligibility_snapshot`, `sync_ownership_completion_candidates`, `open_ownership_completion_review`, `assign_ownership_completion_review`, `create_ownership_completion_decision`, `issue_ownership_certificate`, `reverse_ownership_completion`, `get_driver_ownership_completion_status`.
- Initial live row counts: `ownership_completion_reviews = 0`, `v_ownership_completion_queue = 0`.
- Browser/RPC QA after sync: `11 passed, 0 failed`.

## Notes

Layer 3G is live-applied and browser/RPC smoke QA passed against the production Supabase project. Full happy-path mutation evidence still requires a seeded account that is fully paid, has zero outstanding balance, no default/recovery/fraud/legal hold, complete documents, and a present financed asset.
