# SPEC (reviewed) — Chauffeurs / Driver Operating Record (Driver 360°)

> Senior-engineering review of the original "SPEC — Chauffeurs / Driver
> Operating Record Module" Google Doc against the codebase (June 12, 2026).
> Implementation is ~65% complete; this was the module in progress when the
> previous developer stopped. This document is authoritative: it locks the
> decisions below, marks DONE items, and defines the build punch list.
> Product bar: the admin opens one driver and sees everything — Uber Fleet
> Manager × Stripe customer page. No fake UI: every visible control works,
> is honestly disabled, or is hidden.

## Decisions (senior review — changes vs original spec)
- **D-1 Contraventions = `traffic_violations`.** The existing tab wired to
  `support_tickets` is wrong. Keep a separate "Tickets" (support) tab and
  add a real "Contraventions" tab on `traffic_violations` (table exists;
  `assign-violations` function already attributes them to rentals).
- **D-2 Risk is computed, not stored.** Risk level (Bon/Moyen/Élevé/
  Critique) + mandatory reasons come from a SECURITY DEFINER SQL function
  (profile: per-driver; list: batched) over score, overdue invoices, open
  sinistres, contraventions, KYC status, overdue fleet control. No new
  snapshot table in v1 (avoids staleness); revisit if list performance
  demands it.
- **D-3 Keep 12-tab layout, fix content.** We do not collapse to the spec's
  10 tabs; the shipped split (Paiements / Factures / Revenus separate) is
  fine. We fix the broken tabs instead: real "Vue d'ensemble", new "Fleet
  Control" tab, new "Contraventions" tab, "KiraPay" stays a top card AND
  gains export.
- **D-4 Edit stays a dialog** (`EditDriverDialog`), not a separate
  `/edit` route. Works well; no reason to rebuild.
- **D-5 Preserve shipped behaviors not in the original spec:** synthetic
  auth (`driver_<phone>@dam-flotte.local`), duplicate phone/email/MM
  detection, CSV import + credentials sheet, bulk KYC review, `driver_360`
  RPC, wallet deposit flow, 6-digit temporary access codes (hashed, 7-day
  expiry, shown once), activity timeline RPC, AssignVehicleDialog.

## DONE (verified)
- Routes: `/admin/drivers`, `/admin/drivers/new` (7-step wizard),
  `/admin/drivers/:id`.
- Wizard: all 7 steps, validation, duplicate phone detection, vehicle
  assignment + rental creation, PIN + mobile money, recap, success page
  with one-time PIN + WhatsApp message, audit row.
- Tables + RLS: `driver_notes` (visibility flags), `driver_audit`,
  `driver_access_codes` (bcrypt hash), `driver_documents` (signed URLs,
  approve/reject/expiry), `driver_wallets` + transactions.
- Status model: active/inactive/suspended/pending_kyc/blocked; suspension
  reason/by/at captured; suspended drivers excluded from assignment picker;
  KYC gate on activation.
- Tabs working with real data: Scores, Paiements, Locations, Prêts,
  Revenus, Factures, Sinistres, Tickets, Documents, Notes, Audit, Activité.
- Wallet card: balance, ledger, deposit recording.
- Realtime on list for KYC changes.

## TO BUILD (punch list)

### Backend / data
1. **CH-B1 — Risk function.** `driver_risk(driver_id)` → `{level, reasons[]}`
   and `drivers_risk_summary(customer_id)` for the list. Inputs per D-2.
   Reasons are French strings ("2 factures en retard", "KYC expiré"…).
   Unit-tested thresholds documented in the function.
2. **CH-B2 — Wizard KYC linkage.** `create-managed-driver` creates a
   `kyc_submissions` row when documents are provided (docs currently upload
   to storage orphaned).
3. **CH-B3 — Wallet auto-creation.** Verify trigger creates
   `driver_wallets` on driver insert; add trigger or edge-function step if
   missing.
4. **CH-B4 — Realtime invalidation on profile.** Subscribe profile page to
   wallet transactions, payments/invoices, score events, vehicle_inspections,
   driver_documents for the open driver; invalidate `driver_360` queries.

### List page (`/admin/drivers`)
5. **CH-L1 — KPI header.** Actifs, Suspendus, Inactifs, KYC vérifié, Sans
   véhicule, À risque (from CH-B1), Paiements en retard. (Yango lié only if
   data exists; otherwise omit — no dead KPI.)
6. **CH-L2 — Columns.** Add Véhicule (plate), Loyer (rent_per_day), Risque
   badge, Solde KiraPay. Keep existing columns.
7. **CH-L3 — Filters/search.** Add vehicle-assigned filter, risk filter,
   overdue-invoices filter; extend search to plate + permit + Yango ID.
   (Score-range and wallet-sign filters: defer — low value, clutter.)
8. **CH-L4 — Row quick links.** "Voir factures" (deep-link to profile
   Factures tab), "Voir KiraPay" (profile wallet anchor).

### Profile page (`/admin/drivers/:id`)
9. **CH-P1 — Vue d'ensemble (kill the placeholder).** Real overview:
   risk badge + reasons (CH-B1), score by dimension from
   `credit_score_breakdowns`/`driver_scores`, current vehicle/rental,
   KYC + payment status, recent alerts/activity (5), and rule-based
   recommendations (overdue → "relancer le chauffeur", control overdue,
   KYC expiring). "Données non disponibles" for absent data — never fake.
10. **CH-P2 — Fleet Control tab.** Driver's control history (status, due,
    progress, immobilization state) reusing FleetControl components;
    actions: view detail dialog, Relancer (existing RPC).
11. **CH-P3 — Contraventions tab.** `traffic_violations` for this driver:
    date, type, amount, status, vehicle, linked invoice/charge; actions:
    create charge/invoice (reuse `other_charges`/generate-invoice), mark
    paid, dispute note. Keep Tickets tab as-is.
12. **CH-P4 — Header upgrades.** Permit number + expiry, risk badge, wallet
    balance chip in header card.
13. **CH-P5 — Quick actions.** "Créer facture" (existing generate-invoice
    flow prefilled with driver), "Ajouter note" (opens Notes with focus),
    "Envoyer message" (insert into `notifications` for the driver —
    in-app + push via existing send-push-notification).
14. **CH-P6 — Locations tab depth.** Assignment history (all rentals),
    actions: mark returned (existing rental update path), unassign, link to
    vehicle page/GPS.
15. **CH-P7 — Wallet export.** CSV export of the ledger (reuse
    `src/lib/export.ts`).

## Acceptance (E2E, isolated tenant)
- Create driver via wizard with docs → `kyc_submissions` row exists, wallet
  exists, audit row exists; driver logs in with the PIN.
- Driver with 2 overdue invoices + 1 open sinistre shows Élevé/Critique
  with both reasons on list and profile.
- Vue d'ensemble renders real data for a seeded driver and honest empties
  for a bare one.
- Contravention → create charge → appears in Factures and on driver PWA.
- Quick actions: invoice created from profile; message lands in driver
  notifications.
- RLS: admin of tenant B sees none of tenant A's drivers/notes/documents.
- Every visible button works or is disabled with a reason (manual sweep).
