# QA Report - KIRA Admin App V3 Layer 2A

Date: 2026-06-14
Scope: Admin web portal Attention Center
Seeded admin: `e2e-customer-admin@dam-test.local`
Environment: local Vite app on `http://127.0.0.1:8080`, live Supabase backend

## Summary

Layer 2A is implemented as an operational Attention Center using existing routes and live data only.

- Primary route: `/admin/attention`
- Stable aliases: `/admin`, `/admin/dashboard`
- Existing daily rental, finance, wallet, Fleet Control, driver, and vehicle routes remain accessible.
- No schema changes, no payment changes, no mechanic/shop scope, no AI Coach, no credit engine rebuild.

## Screenshots

| Evidence | File |
| --- | --- |
| Main Attention Center | `docs/specs/screenshots/layer2a/20-layer2a-attention-center.png` |
| Overdue filter | `docs/specs/screenshots/layer2a/21-layer2a-filter-overdue.png` |
| Alertes CTA route | `docs/specs/screenshots/layer2a/22-layer2a-alertes-cta.png` |
| First live queue CTA | `docs/specs/screenshots/layer2a/23-layer2a-first-action-cta.png` |
| Core routes smoke | `docs/specs/screenshots/layer2a/24-layer2a-core-routes.png` |
| Machine-readable matrix | `docs/specs/screenshots/layer2a/layer2a-qa-matrix.json` |

## PASS/FAIL Matrix

| Check | Result | Evidence |
| --- | --- | --- |
| `/admin/attention` primary route loads | PASS | Playwright QA |
| `/admin` alias loads Attention Center | PASS | Playwright QA |
| `/admin/dashboard` alias loads Attention Center | PASS | Playwright QA |
| Hero title: Centre d'attention | PASS | Screenshot 20 |
| Subtitle: Ce qui necessite votre action aujourd'hui | PASS | Screenshot 20 |
| Queue title: A traiter maintenant | PASS | Screenshot 20 |
| KPI: A encaisser aujourd'hui | PASS | Screenshot 20 |
| KPI: En retard | PASS | Screenshot 20 |
| KPI: Controles a valider | PASS | Screenshot 20 |
| KPI: Vehicules indisponibles | PASS | Screenshot 20 |
| KPI: Chauffeurs a risque | PASS | Screenshot 20 |
| KPI: Demandes en attente | PASS | Screenshot 20 |
| Overdue filter route/state | PASS | Screenshot 21 |
| Actualiser button works | PASS | Toast observed by Playwright |
| Exporter le rapport button state | PASS | Enabled with current live queue |
| Voir toutes les alertes CTA | PASS | Navigated to `/admin/alertes` |
| First live action CTA | PASS | Opened `/admin/payments?payment=e04f977f-c516-4858-935b-9d4db1abe52f` |
| Daily rental route preserved | PASS | `/admin/rentals` loaded |
| Payments route preserved | PASS | `/admin/payments` loaded |
| Finance route preserved | PASS | `/admin/finance` loaded |
| Wallet admin route preserved | PASS | `/admin/billing/wallets` loaded |
| Fleet Control route preserved | PASS | `/admin/fleet-control` loaded |
| Drivers route preserved | PASS | `/admin/drivers` loaded |
| Vehicles route preserved | PASS | `/admin/vehicles` loaded |
| Console/network findings | PASS | 0 findings |

## Bugs Found And Fixed

| Bug | Fix | Status |
| --- | --- | --- |
| React hook dependency warning in `Dashboard.tsx` for the action queue memo | Memoized the action list before filtering | Fixed |
| Risk RPC rows could crash the page if `level` or `reasons` were null | Added null-safe handling for risk level and reasons | Fixed |
| Hero action buttons rendered as blank white buttons on the dark hero | Added explicit dark-on-white button styling | Fixed |
| QA label checks were brittle against uppercase KPI rendering | Normalized QA text comparisons | Fixed |

## Verification Commands

```bash
npx eslint src/pages/admin/Dashboard.tsx src/hooks/useAttentionCenter.ts src/hooks/useAuditLog.ts src/components/AdminLayout.tsx src/App.tsx scripts/qa/11-layer2a-attention-center.ts
QA_SHOT_DIR=docs/specs/screenshots/layer2a bun run scripts/qa/11-layer2a-attention-center.ts
npm run build
```

Results:

- Focused lint: PASS
- Layer 2A QA script: PASS, 26/26 checks, 0 console/network findings
- Production build: PASS
- Browser visual check: PASS, header controls visible and live queue rendered

## Production Publish Status

Code commit `826680a` was pushed to:

- `origin/codex/kira-driver-v2-part1`
- `origin/main`

Production host check:

- `https://damafricahub.com/admin/attention` returns HTTP 200
- `https://damafricahub.com/` still served the previous JS asset after polling: `/assets/index-C-XEzhFn.js`
- Local Layer 2A build asset is `/assets/index-xdmhlwvF.js`

Conclusion: Git push is complete, but the Lovable production publish step has not swapped the public build yet. The local Lovable connector account cannot access project `017fc525-5a16-4ead-82a4-cd0a37c0f243`, so final publish must be run from the Lovable account that owns the project.

## Remaining TODOs

- Publish from Lovable after reviewing the pushed `main` branch, then verify the production asset changes from `/assets/index-C-XEzhFn.js`.
- Future Layer 2 specs may deepen each module workflow after the Attention Center hands off to existing pages.
- Existing Vite build warnings remain unrelated to Layer 2A: stale Browserslist data, mixed static/dynamic `sonner` imports, and large chunks.
- AI Coach, mechanic/shop flows, payment engine changes, and credit engine rebuild remain intentionally out of scope.
