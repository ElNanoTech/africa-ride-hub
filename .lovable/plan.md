# Gap Analysis: damafricahub.com vs kira.damafrica.com

## KIRA admin sidebar (reference, complete)

**OPÉRATIONS** — Tableau de bord · Chauffeurs · Véhicules · **Fleet Control**
**GESTION** — **Maintenance** · Finance · Crédit & Prêts · Sinistres · **Contraventions**
**INSIGHTS** — **KIRA ANALYTICS** · **Alertes**
**COMMUNICATION** — **Communication**
**SHORTCUT** — KIRA Driver app · Paramètres · Déconnexion

Bold = no equivalent (or much weaker equivalent) in our app today.

## What we already cover (good parity)

Dashboard, Chauffeurs (Drivers + Detail), Véhicules, Suivi GPS / Mapping GPS / Conduite (≈ Tracking), Crédit & Prêts (Loans), Sinistres + Detail + Analytics, Paramètres, Administrateurs (Users), Sync Plateformes, Scoring, Audit, Pricing, Feature Flags, Customer Management, Income Approvals, Manual Income Entry, Wallets, Billing, Payments.

## Missing or substantially weaker (priority targets)

### 1. Fleet Control (NEW) — HIGH IMPACT
Periodic visual vehicle inspection performed by the driver, validated by fleet manager, with automatic engine cut-off via the GPS device when overdue.
- KPI tiles: Total / Conformes / À valider / En retard / Bloqués
- 7-zone photo submission per vehicle (driver app side)
- Status workflow: brouillon → soumis → validé / rejeté
- "Couper si stationné" action — sends immobilization command via Uffizio when vehicle is parked
- Auto-rule: ≥3 days late OR ≥2 reminders → auto-immobilization (cron every 15 min)
- Filters: statut, catégorie, recherche plaque/chauffeur/modèle

### 2. Maintenance / Charges (NEW) — HIGH IMPACT
Workshop work-orders, insurances, sub-rentals, providers.
- Tabs: Tableau de bord · Ordres · Suivi Kanban · Autres charges · Prestataires
- KPIs: Total ordres / À valider / En cours / Coût total réel / Dispo flotte
- Charts: monthly orders+cost, breakdown by type, status, top vehicles by cost
- Entities needed: maintenance_orders, providers (prestataires), other_charges (assurances, sous-locations)

### 3. Contraventions (NEW) — HIGH IMPACT
Côte d'Ivoire traffic fines via the CGI portal (eservices.cgi.ci).
- "Synchroniser" pulls infractions from CGI portal
- "Attribuer aux chauffeurs" cross-matches GPS history to assign fault
- KPIs: En attente paiement / Liquidées / Véhicules impliqués / Total
- Filters: Toutes / En attente / Liquidé / En recours, by plate/driver/type
- Each item: type, plate, driver, GPS-live flag, date, amount XOF, PV number, status, PDF export
- Reports tab, Portail CGI deeplink

### 4. Communication (NEW) — MEDIUM-HIGH IMPACT
Manage content delivered inside the driver app.
- Tabs: Formation · Publicités · Marketing
- Formation: training modules (categories: Conduite, Finances, Relation, Entretien, KIRA App) with duration, level, optional video, notes, quiz questions, ordering, activate/deactivate
- Publicités: in-app ads / banners targeting (likely top of driver home)
- Marketing: campaigns / push broadcasts

### 5. Alertes (NEW page) — MEDIUM IMPACT
Centralized inbox separate from notifications, with badge count in nav.
- 2 sub-tabs: Alertes KIRA · GPS Télématique
- Filters: Non lues / Toutes, "Tout marquer lu", "Actualiser"
- Items show severity (Critique / Avertissement / Info), category (Permis expirant, CNI expirée, …), driver, message, date
- Auto-generators: expiring driver license, expiring CNI, expiring assurance, contrat expirant, etc.

### 6. KIRA ANALYTICS (consolidation) — MEDIUM IMPACT
Multi-tab cross-domain analytics replacing our single Analytics page.
- Tabs: Flotte · Maintenance · N'LOOTTO · Chauffeurs · Finance · Sinistres & Ctrl · Profils Chauffeurs
- Per-tab: KPI tiles, distribution charts, fleet state, cost summaries

### 7. Finance polish — LOW-MEDIUM IMPACT
Our Payments / Billing / Wallets exist; KIRA wraps them as one Finance page with 4 tabs (KPI · Facturation · Paiements · KiraPay) and adds:
- CA prévisionnel (forward revenue projection by plan: journalier/hebdo/mensuel)
- Taux de recouvrement with target (95%)
- Impayés & retards bucket
- "Loyers prévus vs collectés" 12-month chart
- Loyers par catégorie (CARGO / N'LOOTTO / VTC / WARREN)

### 8. Vehicle category extension — LOW IMPACT
KIRA categorizes vehicles as VTC, CARGO, N'LOOTTO, WARREN. Our `vehicle_type` constraint is car/bike/cargo/compact/sedan. Need to add new category dimension (probably `vehicle_category` separate from `vehicle_type`) without breaking existing data.

## Proposed phased build order

```text
Phase 3  →  Fleet Control          (visual inspection + auto-immobilization)
Phase 4  →  Maintenance            (orders, kanban, providers, other charges)
Phase 5  →  Contraventions         (CGI sync + driver attribution + payment)
Phase 6  →  Alertes                (centralized expiry/risk inbox + cron generators)
Phase 7  →  Communication          (driver training modules + ads + broadcasts)
Phase 8  →  KIRA Analytics rollup  (multi-tab analytics replacing /admin/analytics)
Phase 9  →  Finance polish         (projection, recouvrement, unified 4-tab page)
Phase 10 →  Vehicle categories     (VTC / CARGO / N'LOOTTO / WARREN dimension)
```

Each phase = DB migration + admin page(s) + edge function(s) where external integration is needed (Uffizio immobilization command for Fleet Control, CGI portal scraping for Contraventions, cron jobs for Alertes / Fleet Control enforcement) + driver-app counterparts where applicable (Fleet Control photo submission, Formation viewer, Contraventions visibility).

## What I need from you to start Phase 3

1. **Confirm scope & order** — go in the sequence above, or reprioritize?
2. **CGI portal** (Phase 5) — do you have API/portal credentials for `eservices.cgi.ci`, or should we start with a manual import (CSV / paste PV numbers)?
3. **Uffizio immobilization** (Phase 3) — does the live Uffizio account already expose the engine cut-off command for the connected GPS devices, or is that a manual radio call we just log for now?
4. **Driver login** — share a real driver phone+PIN (or let me seed one) so I can verify each phase end-to-end on both sides.

Reply "go phase 3" (with any tweaks) and I'll start implementing.
