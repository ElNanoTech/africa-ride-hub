# QA Report — Phase 4 Integration (Fleet Control + Chauffeurs)

- **Date:** 2026-06-12
- **Branch:** `claude/gracious-dirac-3vx6b0`
- **Environment:** vite dev server (127.0.0.1:8080) driven by Playwright
  (Chromium headless), against the **LIVE** Supabase backend
  (`fihrjavcdwpttvnlqqxc`). All data created/modified strictly inside the
  isolated **"E2E Test Fleet Co"** tenant provisioned by the `e2e-bootstrap`
  edge function (customer `a6c3f74e…`). No production-tenant data touched.
- **Important deployment context:** the live database/functions = `main`.
  This branch's three new migrations (`20260612121500`, `20260612130000`,
  `20260612140000`) and updated edge functions are **not deployed**. Features
  that call the new RPCs were therefore tested for **graceful degradation**,
  not for functionality (see "Pending deploy" section).
- **Method:** real role-play — driver app on a 390×844 mobile viewport
  (phone + PIN login), admin app on 1440×900 — through the reusable harness in
  `scripts/qa/` (committed). Console errors and failed network calls were
  collected on every page.

## Scenario executed (single continuous story)

1. `e2e-bootstrap` → E2E tenant + customer admin. Seeded one available
   vehicle (`QA-E2E-100`) and one managed driver
   (`create-managed-driver`, phone `+225 05 85 07 70 62`, PIN) — the
   shipped admin-provisioning path.
2. **Driver** logs in with phone + PIN, walks Home / fleet-control (honest
   "Aucun véhicule actif") / history (honest empty) / notifications / wallet /
   loans / factures / vehicles, requests a rental on `QA-E2E-100`.
3. **Admin** approves the rental on `/admin/rentals` → rental active →
   fleet-control auto-created by the deployed trigger.
4. **Driver** uploads 11 real JPEGs through the actual file inputs
   (camera/gallery/document buttons), progress `11/11 pièces fournies ·
   Véhicule : 7/7 · Documents : 4/4`, per-item persistence across reload,
   submits (`fleet_control_submit`, deployed 11-zone rule).
5. **Admin** opens the detail dialog (signed-URL thumbnails OK), approves one
   item, rejects one with reason "Photo trop floue — test QA", sends
   **Relancer**.
6. **Driver** sees the rejection reason on exactly one tile, exactly one
   "Reprendre la photo" button, other items locked ("Envoyé — en attente de
   validation"), retakes only that item; the reminder notification deep-links
   to `/driver/fleet-control`.
7. **Admin** approves all 11 items, then the control → "Contrôle approuvé",
   KPI `Conformes = 1`.
8. **Driver** history lists the closed cycle (`Conforme · 12 juin 2026 ·
   Vérifié le 12 juin 2026`) and its read-only detail (`Validé par le
   gestionnaire` per item).
9. **Admin** Chauffeurs: list KPIs/columns/filters, profile (15 tabs),
   quick actions, KYC review/approve. **Driver** sees the rental invoice
   (`FAC-E2ETST-2026-000010`, 15 000 FCFA, Wave payment CTA) in his app.

## Acceptance matrix

### SPEC_FLEET_CONTROL (admin + backend)

| Item | Result | Evidence / notes |
|---|---|---|
| Existing flows (auto-create on rental activation, submit/approve/reject/remind RPCs, KPIs, detail dialog, signed-URL lightbox, audit timeline) | **PASS** | Steps 3–8; shots 40–46, 60–61 |
| FC-A1 manual creation — UI ("Nouveau contrôle" button + dialog, vehicle picker, active-driver preview) | **PASS (UI)** | shots 41–42 |
| FC-A1 manual creation — RPC `fleet_control_create_manual` | **PENDING-DEPLOY** | RPC 404 on live. Found: raw English PostgREST toast → **fixed** (French toast, commit `779d04f`); shot 111 |
| FC-A2 admin realtime | **PENDING-DEPLOY / ENV-LIMITED** | Realtime publication additions not deployed; additionally the sandbox proxy breaks browser WebSocket upgrades (handshake verified OK outside the browser). UI shows an honest "Reconnexion en cours…" banner and keeps polling — no crash |
| FC-A3 require_documents matrix | **PASS (default 7+4)** | Progress totals derive from settings client-side (`requiredZones`, unit-tested); live submit enforced 11/11. Non-default matrices need the new SQL → post-deploy re-run of `fleet-control-e2e` |
| FC-A4 honest interval setting | **NOT RE-TESTED** (settings page out of this pass; read-only decision is code-reviewed) |
| FC-A5 dry-run engine cut | **NOT EXERCISED** (would queue immobilization commands; out of scope for this pass, covered by `fleet-control-e2e` post-deploy) |

### SPEC_FLEET_CONTROL_DRIVER

| Item | Result | Evidence / notes |
|---|---|---|
| Driver completes 11/11 → submit → admin approves → driver sees Validé | **PASS** (via reload; realtime = pending-deploy/env-limited, 60s poll still works) | shots 31–35, 71 |
| Admin rejects one item with reason → driver sees reason, can retake only that item, resubmits → admin sees updated item | **PASS** | shots 45, 50–51; corrected item came back reviewable and was approved in step 7 |
| History shows the closed cycle after approval (FC-D1) + read-only detail | **PASS** | shots 72–73 |
| Notification deep-links to the control screen (FC-D2) | **PASS** (reminder notification → `/driver/fleet-control`) | shots 52–53 |
| Progress breakdown `X/11 · Véhicule n/7 · Documents n/4` (FC-D3) | **PASS** | shot 33 |
| Relative due-date copy (FC-D4) | **PASS** ("Échéance dans 14 jours" + absolute date) | shot 31 |
| Driver realtime (FC-D5) | **PENDING-DEPLOY / ENV-LIMITED** (see FC-A2) |
| Immobilization copy (FC-D6) | **NOT EXERCISED** in browser (no immobilization triggered on the E2E control); helper unit-tested |
| RLS: driver B cannot read driver A's control | **PASS (scripted)** — `e2e-rls-tests.ts` 27/27 green; `fleet-control-e2e` test 14 covers it post-deploy |

### SPEC_CHAUFFEURS

| Item | Result | Evidence / notes |
|---|---|---|
| Managed driver creation → driver logs in with PIN | **PASS** (`create-managed-driver` + native phone/PIN login) | seed log; shots dbg-login-* |
| Wizard with docs → kyc_submissions + wallet + audit (CH-B2/B3) | **PARTIAL / PENDING-DEPLOY** — driver created without docs; a prior wizard-created driver ("Test QaWizard") had a pending KYC submission which we reviewed and approved ("KYC approuvé — conducteur activé", shot 99c). Wallet row existed (wallet card renders, balance 0). CH-B2 doc-linkage needs the updated function deploy |
| Risk Élevé/Critique with reasons on list + profile (CH-B1) | **PENDING-DEPLOY** — `driver_risk`/`drivers_risk_summary` 404 on live. Verified graceful degradation: profile header RiskBadge "—", overview card "Données non disponibles", list column "—". Found: list KPI tiles showed a fake `0` → **fixed** (honest "—", disabled, commit `779d04f`); shot 110 |
| List page: KPI header, columns (Véhicule/Loyer/Risque/Solde KiraPay), search by plate, filters (CH-L1–L3) | **PASS** — KPIs count real data; columns show `QA-E2E-100 / 15 000 FCFA / — / 0 FCFA`; plate search finds the driver | shots 80–81 |
| Profile: 15 tabs render without crash (CH-P1–P3, D-3) | **PASS** — all 15 tabs walked; overview shows real risk-factor chips (KYC vérifié, Paiements, Dû), score by dimension with "Données non disponibles" empties, vehicle/rental card, activity, recommendations ("Vérifier le KYC", "Assigner un véhicule" on the bare driver) | shots 82, 83-tab-* |
| Fleet Control tab (CH-P2) | **PASS** — control history with status + Détails | shot 83-tab-fleet-control |
| Contraventions tab + `/admin/contraventions` (no phantom-embed crash) | **PASS** — honest "Aucune contravention" empty states, no crash | shots 83-tab-violations, 85 |
| Contravention → charge → invoice → driver PWA | **NOT EXERCISED** (no contravention data in the tenant; creating one via UI requires the violations import flow — deferred to post-deploy E2E) |
| `?tab=` deep links | **PASS** (`?tab=invoices` → Factures active) | shot 84 |
| Quick action "Ajouter note" (focus, add, delete) | **PASS** — note added, visible, deleted. Note: panel supports add + delete only; no edit affordance (matches shipped design, flagging for product) | shots 90, 91b |
| Quick action "Créer facture" | **PASS (honest refusal)** — dialog auto-attaches to the active rental; deployed `generate-invoice` refused with clean French toast "Une facture existe déjà pour cette location…" because the daily-rental billing had already issued `FAC-E2ETST-2026-000010`. The invoice pipeline itself is verified: that invoice shows in the Factures tab AND in the driver app with Wave payment CTA | shots 95c, 96c, 100–101 |
| Quick action "Envoyer message" | **PENDING-DEPLOY** — live DB rejects `admin_message` (check constraint). Found: raw SQL constraint text in toast → **fixed** (French pending-update copy, commit `779d04f`); no crash | shot 112 |
| Wallet card + CSV export (CH-P7) | **PASS (honest)** — card renders, balance 0, "Exporter CSV" disabled while the ledger is empty (no fake export) |
| Locations tab depth (CH-P6) | **PASS** — rental history with plate, status, actions present | shot 97 |
| KYC review (banner + approve) | **PASS** — "Approuver KYC" → "KYC approuvé — conducteur activé", status flips Vérifié/Actif | shots 99, 99c |
| RLS tenant isolation | **PASS (scripted)** — `e2e-rls-tests.ts` 27/27 |

### Regression scripts (live backend, E2E tenant only)

| Script | Result |
|---|---|
| `scripts/e2e-rls-tests.ts` | **27/27 PASS** |
| `scripts/e2e-workflows.ts` (KYC, loans, rentals, support, accidents, payments) | **21/21 PASS** |
| `fleet-control-e2e` edge function | **NOT RE-RUN** — the deployed copy is the `main` version; the branch version must be re-run **after deploy** |
| Other scripts (`uat-*`, `e2e-wave-billing`, `smoke-test-billing*`, `backfill-*`) | **SKIPPED** — not verified safe for this pass (billing crons/backfills can have side effects beyond a single tenant) |

### Gate

| Check | Result |
|---|---|
| `bun run test` | **106/106 green** |
| `tsc --noEmit` | **clean** |
| `bun run build` | **green** (chunk-size warning pre-existing) |

## Bugs found → fixed (commit `779d04f`)

1. **FleetControlCreateDialog** — clicking "Créer le contrôle" against a
   backend without `fleet_control_create_manual` showed the raw English
   PostgREST error ("Could not find the function public.fleet_control_create_manual…").
   Now a French toast via the new `src/lib/rpcErrors.ts` helper.
2. **/admin/drivers KPI tiles** — when `drivers_risk_summary` fails, the
   "À risque" and "Paiements en retard" tiles showed a fake **0** and stayed
   clickable (filtering on an empty set). Now an honest "—", disabled, and the
   risk filter + overdue toggle are disabled with a French reason.
3. **SendDriverMessageDialog** — failure leaked the raw
   `notifications_notification_type_check` constraint text. Now a French
   "pending server update" description. (The failure itself is
   pending-deploy, not a frontend bug.)
4. **useDriverRisk / useDriversRiskSummary** — retried missing-RPC 404s three
   times per mount. Now `retry` skips `PGRST202`, halving console/network
   noise and reaching the honest fallback faster.

## Bugs found → deferred (with reasons)

1. **Notes have no edit affordance** (add + delete only). The spec wording
   said "notes add/edit"; shipped design is add/delete. Product decision
   needed — not a crash, deferred.
2. **One-invoice-per-rental blocks the "Créer facture" quick action** for any
   driver whose active rental is already invoiced (the common case once daily
   billing runs). Honest French refusal today; consider letting the dialog
   issue a rental-independent invoice. Product/back-office decision — deferred.
3. **Transient** `Error fetching driver profile: Failed to fetch` console
   error observed once on `/driver/vehicles` during navigation (request raced
   a page change). Not reproducible; no user-visible impact. Watch item.

## Console / network hygiene

Every collected error was triaged. Remaining (expected) classes:
- `404 /rest/v1/rpc/driver_risk|drivers_risk_summary|fleet_control_create_manual`
  and `400 /rest/v1/notifications` — pending-deploy, now degrade with honest UI.
- WebSocket `realtime/v1/websocket … 400` — sandbox proxy blocks browser
  WS upgrades (handshake verified OK from a non-browser client with the same
  key). The app shows "Reconnexion en cours…" and falls back to polling.
No unhandled rejections, no blank screens, no crashes on any visited page.

## Verifiable only after deploy

1. `driver_risk` / `drivers_risk_summary` — real risk levels + reasons on
   list and profile, risk filter, "À risque" KPI.
2. `fleet_control_create_manual` — manual control creation end-to-end
   (idempotency rule, audit row, driver notification).
3. `fleet_control_required_zones` non-default matrices (require_documents /
   require_all_photos flips) on submit/approve.
4. `admin_message` notification type — "Envoyer message" delivery in-app +
   push, driver inbox rendering.
5. Realtime publication additions (`vehicle_inspections`,
   `vehicle_inspection_photos`) — live admin/driver refresh without reload
   (also re-verify outside this sandbox: browser WS is environment-blocked here).
6. Re-run the updated `fleet-control-e2e` edge function (16 tests) and the
   wizard-with-documents KYC linkage (CH-B2).

## Screenshot index (session-local, not committed)

`/tmp/qa-shots/` — 80 captures. Highlights: `01–10` driver walkthrough +
rental request · `20–23` admin rental approval · `30–35` driver 11-item
upload + submit · `40–46` admin review (KPIs, manual-create, detail,
item approve/reject, relance) · `50–53` driver correction + notification
deep-link · `60–61` full approval · `70–73` driver history ·
`80–85` drivers list / 15 profile tabs / contraventions · `90–99c` quick
actions + KYC approve · `100–102` driver invoice + active rental ·
`110–112` post-fix verification (honest tiles + French toasts).

---

# Addendum — KIRA Driver App v2 Part 1 blocker QA

- **Date:** 2026-06-14
- **Branch:** `codex/kira-driver-v2-part1`
- **Environment:** local Vite app at `127.0.0.1:8080`, Playwright mobile
  viewport, live Supabase project `fihrjavcdwpttvnlqqxc`, isolated seeded E2E
  tenant/driver data.
- **Seeded driver:** `4c9bea2b-4a82-4d7f-bccb-b9baef1618fa`
- **Seeded vehicle:** `QA-E2E-100`
- **Current Fleet Control cycle:** `a6815764-3dd1-4378-bf8e-91c557543a45`
- **Partial invoice/payment used for finance QA:** invoice
  `d68bddf4-4628-4e75-8322-1fdf580c9e1f`, total `1 000 FCFA`,
  `amount_paid = 400`, `remaining_due = 600`, payment
  `cbc36fa5-c730-4ee1-abe7-3b9b6666f120`.
- **Wave remote retest payments after final redeploy:** own partial payment
  `29dd2ea2-60a8-4c70-9916-590a1bfc25ee` (`amount = 1 000`,
  `amount_paid = 400`, expected `remaining_due = 600`) and other-driver
  payment `23a478d8-6ed3-4565-8ff3-5ae3ee6063be`.

## Blocker matrix

| Blocker | Result | Evidence / notes |
|---|---|---|
| A. Deploy updated `wave-checkout` Edge Function | **PASS** | User redeployed the hardened function, then local live retest confirmed the fixed behavior against `https://fihrjavcdwpttvnlqqxc.supabase.co/functions/v1/wave-checkout`. |
| A. Re-test driver can only pay own payment | **PASS** | Signed in as seeded driver, called `wave-checkout` for another driver's payment `23a478d8-6ed3-4565-8ff3-5ae3ee6063be`; returned `403` with `Payment belongs to another driver`. |
| A. Re-test admin callers are blocked | **PASS** | Signed in as E2E customer admin, called `wave-checkout` for seeded driver's partial payment `29dd2ea2-60a8-4c70-9916-590a1bfc25ee`; returned `403` with `Admin users cannot create driver Wave checkout sessions`. |
| A. Re-test partial invoice checkout uses `remaining_due` only | **PASS** | Payment `29dd2ea2-60a8-4c70-9916-590a1bfc25ee` had `amount = 1 000`, `amount_paid = 400`, expected remaining due `600`. Calling checkout with `amount = 1 000` returned `400` with `remaining_due = 600`; calling checkout with `amount = 600` returned `200` and created session `cos-25djkqy802bz4`. Driver UI evidence for the partial invoice remains in `/tmp/kira-driver-v2-qa/browser-finance-partial-invoice-390.png` and `/tmp/kira-driver-v2-qa/browser-invoice-detail-partial-fixed-390.png`. |
| A. Re-test no duplicate checkout/payment is created | **PASS** | Repeated checkout on payment `29dd2ea2-60a8-4c70-9916-590a1bfc25ee` returned `409`; database check confirmed `wave_transaction_id` remained `cos-25djkqy802bz4`, so no replacement checkout was stored. |
| B. Active Fleet Control seeded for driver | **PASS** | User seeded one pending inspection; QA ran against current control `a6815764-3dd1-4378-bf8e-91c557543a45`. |
| B. Driver sees required control | **PASS** | `/tmp/qa-shots/30-driver-home-active.png`, `/tmp/qa-shots/31-driver-fc-start.png`; QA script confirmed home mentions the required control. |
| B. Driver uploads photos/docs | **PASS** | `/tmp/qa-shots/32-driver-fc-photos-done.png`, `/tmp/qa-shots/33-driver-fc-all-uploaded.png`; progress reached `11/11`, with `7/7` vehicle photos and `4/4` documents. Reload persistence confirmed in `/tmp/qa-shots/34-driver-fc-after-reload.png`. |
| B. Driver submits | **PASS** | `/tmp/qa-shots/35-driver-fc-submitted.png`; submit button was enabled and the submitted banner rendered. |
| B. Admin rejects one item | **PASS** | Admin-auth RPCs reviewed the correct current cycle: first item approved, second item rejected with reason `Photo trop floue — test QA`, and the control was marked rejected. |
| B. Driver sees rejection reason | **PASS** | `/tmp/qa-shots/50-driver-fc-after-review.png`; QA confirmed the rejection reason and approved-item state were visible. |
| B. Driver resubmits | **PASS** | `/tmp/qa-shots/51-driver-fc-retaken.png`, `/tmp/qa-shots/54-driver-fc-ready-resubmit.png`, `/tmp/qa-shots/55-driver-fc-resubmitted.png`; QA confirmed the rejection reason cleared after retake, progress stayed `11/11`, and resubmit showed the submitted banner. |
| B. Admin approves | **PASS** | Admin-auth RPCs approved all non-approved items and called `fleet_control_approve`; database check confirmed control status `approved` and all item statuses `approved`. |
| B. Driver sees approved state | **PASS** | `/tmp/qa-shots/57-driver-fc-approved-clean.png`; rerun after the driver-profile fetch patch showed approved state with no console/network findings. |
| C. Screenshots retained and PASS/FAIL added | **PASS** | This addendum preserves the screenshot paths and marks each requested blocker step. |

## Verification commands

| Check | Result |
|---|---|
| `~/.bun/bin/bun x tsc -p tsconfig.app.json --noEmit` | **PASS** |
| `~/.bun/bin/bun run test` | **PASS** — 106 tests |
| `~/.bun/bin/bun run build` | **PASS** — only pre-existing Browserslist / chunk-size style warnings |
| Focused ESLint on new/closely touched Part 1 files (`BottomNav`, `Finance`, `KiraVoiceButton`, `useDriverAuth`, `wave-checkout`) | **PASS** |
| `git diff --check` | **PASS** |

## Remaining deployment gates

1. No Part 1 deployment gates remain from blockers A/B/C.
2. `fleet_control_create_manual` is no longer a blocker for this Fleet Control
   pass; the seeded active-control cycle passed end-to-end.
3. SPEC_KIRA_DRIVER_APP_v2 Parts 2-6 are still not present in the provided
   local spec file; Part 2 can start once the next spec section is provided.
