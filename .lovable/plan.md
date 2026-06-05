
# Align Lovable app to the KIRA design

After reviewing both surfaces of the customer's reference app (admin at kira.damafrica.com and the KIRA Driver mobile app), the look-and-feel is clearly defined and very different from what we ship today. Functionality stays the same — this is a visual/structural refresh of the existing routes, not a rebuild.

## What the reference establishes

**Admin (desktop)**
- Dark navy sidebar (`#0B1020`-ish) with grouped nav: OPÉRATIONS / GESTION, a highlighted active item with subtle inner glow, a separate purple "KIRA Driver — APP" shortcut button, user chip + Paramètres + Déconnexion at the bottom.
- Light slate canvas with a global top bar: breadcrumb (Section → Page), centered global search, date, dark-mode toggle, notifications, user avatar.
- A signature gradient "hero card" at the top of every page: dark navy background, eyebrow label (e.g. "SUIVI EN TEMPS RÉEL"), big page title, subtitle, right-side status pills (Uffizio GPS, Yango Fleet, Wave API) and primary CTAs (Actualiser, Analyse IA, Nouveau …).
- KPI strip: 5–6 pastel tinted tiles (green/orange/blue/yellow/grey), small uppercase label + large number.
- Pill tab filters with counts (Tous 56 / Actif 56 / Suspendu 0 …) and a wide rounded search.
- Data tables with avatar circles, colored 4px left-border per row, status badges ("Vérifié", "Lié"), no horizontal scroll.
- Finance: KPI cards w/ tiny circular icons, big amount, helper text; tabbed sub-nav (KPI / Facturation / Paiements / KiraPay); chart + donut by fleet category.
- Vehicles: fleet-segment pill tabs with counts, consolidated stats card, vehicle photo grid with "Actif" status chip.

**Driver (mobile)**
- Full-bleed vibrant purple gradient hero (top ~55% of screen) with a soft white shield badge, "KIRA Driver" title and tagline.
- White rounded-top sheet at the bottom with the form: uppercase micro-label, input with CI flag chip prefix, big rounded purple "Suivant" CTA with chevron, helper text under.
- Same purple + white sheet pattern carries through PIN, home, etc. (assumed; behind unrecognized-number wall).

## Approach

Do this as a **token + shell refresh first**, then page-by-page reskin. Functionality, data, routes and copy stay intact.

### Phase 1 — Design tokens & shell (foundation)
1. `src/index.css` + `tailwind.config.ts`: rework HSL tokens to match KIRA:
   - New `--sidebar-background` deep navy, `--primary` electric blue `#2563EB`, `--driver-primary` vibrant purple `#7C3AED`, pastel surface tokens for KPI tiles (`--kpi-green/orange/blue/yellow/slate`), `--hero-gradient` (navy 135°), `--driver-hero-gradient` (purple 160°).
   - Radius bumped to `0.875rem`, softer `--shadow-card`, accent ring.
2. New shared components:
   - `HeroCard` (eyebrow, title, subtitle, status pills slot, actions slot).
   - `KpiTile` (variant by color token).
   - `PillTabs` with counts.
   - `StatusPill` (Connecté / Hors-ligne / Vérifié / Lié).
   - `PageHeader` with breadcrumb + global search.
3. `AdminLayout`: rebuild sidebar with grouped sections, active-state styling, "KIRA Driver" purple shortcut, bottom profile chip + Paramètres + Déconnexion; new top bar with breadcrumb + search + theme toggle + notifications + avatar.
4. Driver shell: shared `DriverHero` (purple gradient + brand badge) and bottom `SheetCard` wrapper used by Login, PIN, and other auth/onboarding screens.

### Phase 2 — Admin pages reskin
Wrap each existing page in `HeroCard` + KPI strip + the new pill tabs/table styling. No data/logic changes.
- Dashboard
- Drivers (Chauffeurs) — KPI tiles (Actifs / Suspendus / KYC Vérifié / Yango Lié / Sans véhicule), pill tabs, table with avatar + colored left-border + Vérifié/Lié badges.
- Vehicles (Véhicules) — fleet-segment pill tabs, consolidated stats card, vehicle card grid with "Actif" chip.
- Finance — sub-tab nav (KPI / Facturation / Paiements / KiraPay), KPI cards with circular icons, line chart + donut.
- Loans (Crédit & Prêts), Sinistres, Contraventions, Maintenance, Fleet Control, Paramètres — same hero + KPI pattern applied.

### Phase 3 — Driver app reskin
- `pages/driver/Login.tsx`: purple gradient hero with shield badge, white bottom sheet, uppercase label, flag-prefixed input, big purple CTA, helper line.
- PIN entry, Profile/KYC required, Onboarding, Home, Score, Wallet, Factures, Loans, Settings — apply the same purple-hero + white-card pattern; replace current green primary with `--driver-primary` purple on driver routes only (admin keeps blue).
- Preserve gamification (ScoreGauge, badges, leaderboard) but recolor to the new palette.

### Phase 4 — Polish
- Dark-mode pass on the new tokens.
- Mobile responsiveness on admin (sidebar collapses).
- QA: log in as admin + driver, walk every route, take screenshots, fix layout regressions.

## Out of scope
- No backend, DB, RLS, edge-function or business-logic changes.
- No new features (KiraPay sub-tab will be a placeholder if no data hook exists yet — confirm before adding).
- No copy changes beyond renaming "DAM Flotte" → "KIRA Fleet" in shell chrome if you want that (see Q1).

## Open questions

1. **Brand name**: should the visible app name change from "DAM Flotte" to "KIRA Fleet" everywhere (logo, login, footer), or keep DAM Flotte branding with KIRA's *visual* language only?
2. **Driver primary color**: keep current green for driver gamification (score tiers depend on it), or fully switch driver app to the purple palette as shown in the reference?
3. **Scope confirmation**: do you want me to start with **Phase 1 + the Drivers page + driver Login** as a first deliverable so you can validate the direction before I roll it across every page?

I'll wait for your answers (especially #3) before implementing — this is a large surface and I'd rather land the foundation + one flagship page first, then iterate.
