
# Chauffeurs / Driver Operating Record — Rebuild Plan

The spec asks for a 360° Driver Operating Record: list + wizard + profile with 10 tabs + audit + notes + access codes + realtime + RLS. Existing module is ~4000 lines but built piecemeal; I'll keep what works, replace what doesn't, and add the missing pieces. Nothing outside the Chauffeurs scope will be touched (auth, rentals, vehicles, wallet, facturation, Wave, fleet control, sinistres, contraventions, alerts, driver PWA, RLS helpers all stay intact).

## Phase 1 — Data model & RLS (1 migration)

New tables (all tenant-scoped, RLS + GRANTs in same migration):
- `driver_notes` — admin notes timeline (id, customer_id, driver_id, author_id, note, visibility, created_at)
- `driver_audit` — unified per-driver event log (id, customer_id, driver_id, actor_id, actor_type, action, metadata jsonb, created_at)
- `driver_access_codes` — PIN/code issuance (id, customer_id, driver_id, code_hash, status, expires_at, created_by, created_at, used_at, revoked_at). Raw code returned ONCE from the RPC, never stored.
- `driver_documents` — supplementary KYC/permis documents not already covered by `kyc_submissions` (id, customer_id, driver_id, document_type, file_path, status, expiry_date, rejection_reason, uploaded_at, reviewed_by, reviewed_at)

Helpers:
- `driver_log(p_driver, p_action, p_metadata)` SECURITY DEFINER
- `driver_generate_access_code(p_driver)` → returns 6-digit code once, stores bcrypt-ish hash
- `driver_revoke_access(p_driver)`, `driver_suspend(p_driver, p_reason)`, `driver_reactivate(p_driver)`
- `driver_360(p_driver)` — single read RPC that aggregates header KPIs (wallet balance, score, risk, open invoices, overdue count, current vehicle/rental, fleet control status, sinistres count) for fast profile load

Storage bucket `driver-documents` (private), path = `{customer_id}/{driver_id}/...`, policies tenant-scoped, signed URLs only.

## Phase 2 — Driver list page (`/admin/drivers`)

Rewrite to spec §2:
- Header: title + `{count} chauffeurs · {customer_name}` + CTAs (Nouveau, Sync/Lier Yango when relevant)
- KPI strip: Actifs / Suspendus / Inactifs / KYC vérifié / Yango lié / Sans véhicule / À risque / Paiements en retard (derived in one query)
- Filters: search (name/phone/permit/plate/RFID/Yango), status, KYC, vehicle, risk, score range, wallet sign, overdue
- Table: Chauffeur · Contact · Véhicule · KYC · Yango · Loyer · Score · Risque · KiraPay · Actions
- Row actions: Voir / Modifier / Assigner véhicule / Générer PIN / Suspendre-Réactiver / Voir KiraPay / Voir factures
- Loading, error, empty, no-permission states
- All queries customer-scoped via existing `current_customer_id()` / `is_platform_owner()`

## Phase 3 — Create driver wizard (`/admin/drivers/new`)

7-step wizard (replaces current single-dialog component):
1. Infos personnelles
2. Contact (phone normalize + duplicate detection)
3. Permis & KYC (uploads to `kyc_submissions` + `driver_documents`)
4. Véhicule / Affectation (optional, prevents double-assignment of active vehicle)
5. Loyer / Prélèvement (integer XOF; creates rental row tied to existing facturation engine)
6. Accès KIRA Driver (generate PIN via RPC, copy-once)
7. Récapitulatif → atomic submit (driver + KYC + rental + wallet + access + audit rows)

Each step validates client-side + server-side. Success page links to new profile.

## Phase 4 — Driver profile (`/admin/drivers/:id`) with 10 tabs

Rebuild header card per spec §4 (identity, KYC badge, vehicle, rental, tenure, KIRA access, risk, score circle, KiraPay balance, quick actions). Powered by `driver_360` RPC.

Tabs, each wired to **real data** or honest empty state (no fake UI, no dead buttons):
1. **Vue d'ensemble** — score dimensions + risk explanation + recommendations
2. **KiraPay** — existing wallet + transactions, immutable ledger only, admin-credit RPC
3. **Factures & Paiements** — driver-scoped invoices/payments summary
4. **Locations / Véhicule** — assignment history + active rental + actions
5. **Fleet Control** — reuses existing module data filtered by driver
6. **Sinistres** — accidents tied to driver
7. **Contraventions** — tickets tied to driver
8. **Crédit & Prêts** — reuses `loans`, honest placeholder when empty
9. **Documents KYC** — `kyc_submissions` + `driver_documents`, signed URLs, approve/reject/request update
10. **Activité / Audit** — unified timeline from `driver_audit` + cross-table events

Quick actions wired to RPCs: Modifier / Générer PIN / Assigner véhicule / Suspendre / Créer facture / Ajouter note / Envoyer alerte.

Realtime: subscribe to `drivers`, `wallets`, `invoices`, `payments`, `vehicle_inspections`, `accidents`, `kyc_submissions`, `driver_scores` filtered by driver — invalidate React Query keys.

## Phase 5 — QA pass & report

Execute the spec §22-25 acceptance tests against the test tenant. For each: run, capture DB state, mark PASS/FAIL, fix failures, re-run. Final deliverable to you:

- Created driver id / phone / generated PIN
- Assigned vehicle plate
- Login-as-driver result
- PASS/FAIL table for all 38 acceptance tests
- DB verification (rows in `driver_audit`, `driver_access_codes`, `driver_notes`, `driver_documents`, wallet/rental created)
- Edge cases §26 verified
- Known remaining TODOs (if any)

**I will NOT mark the module complete until you reply with PASS/FAIL confirmation.**

## Out of scope (untouched per build posture)

auth, rentals engine, vehicles CRUD, wallet/KiraPay internals, facturation engine, Wave, fleet control internals, sinistres flow, contraventions flow, alerts, driver PWA shell, RLS helpers. The Chauffeurs module reads from and triggers these — it doesn't reimplement them.

## Technical notes

- Single migration per phase; all new public tables get explicit GRANTs in the same migration
- `driver_audit` writes only via SECURITY DEFINER helpers (no client INSERT)
- `driver_access_codes.code_hash` uses `crypt(code, gen_salt('bf'))`; raw code returned ONCE from RPC
- Profile data fetched via single `driver_360` RPC + per-tab queries (lazy)
- Wizard, profile, and tabs lazy-loaded via `lazyWithRetry`
- Toasts via existing `sonner`; design tokens only
- Also: while in this area I'll fix the two outstanding tenant-isolation findings on `accident-photos` and `police-reports` storage policies

## Open questions before I start

1. **Existing `DriverDetail.tsx` (1413 lines)** — replace wholesale, or keep as fallback under a feature flag while the new profile rolls out?
2. **Wizard route** — full page at `/admin/drivers/new` (per spec) or keep as modal? Spec says full route; I'll do full route unless you object.
3. **Phase delivery** — ship all 5 phases in one push (long turn) or stop after each phase for your review? Recommend stopping after Phase 1 (migration) and Phase 4 (UI complete) for your check.
