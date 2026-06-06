## Phase 12 — Scoring Overhaul (Gap C2 + C3)

Align our scoring model to the KIRA target spec, fix internal threshold inconsistencies, and recompute every existing driver score on the new scale.

### Target model

- **Scale:** 0–1000 (already correct in `scoringEngine.ts`; admin Seuils currently 300–900 — fix).
- **Base:** 500 floor, default 700 for new drivers; new drivers seeded at **650 / Niveau B / Provisional**.
- **Factors (6):** replace `Ancienneté` with three new factors.

| Factor          | Weight | Source                                              |
|-----------------|--------|-----------------------------------------------------|
| Paiement        | 25 %   | existing payment events                             |
| Conduite        | 25 %   | existing Uffizio behavior events                    |
| Revenu          | 10 %   | existing income declarations                        |
| Sinistralité    | 15 %   | existing accident determinations                    |
| Infractions     | 10 %   | `contraventions` table (Phase 5)                    |
| Crédit          | 15 %   | repayment history from `loans` + `loan_repayments`  |

- **Driver score page:** 5 dimensions = Paiement, Conduite, Revenu, Sinistralité, **Contrôles visuels** (from Phase 3 fleet-control submissions). Infractions and Crédit roll into the global score but the driver UI keeps 5 cards for simplicity.
- **Grade thresholds (single source of truth):** A ≥ 800, B ≥ 650, C ≥ 500, D ≥ 300, E < 300. Already in `getScoreLevel`; align admin Seuils tab to match exactly. Remove the duplicate threshold inputs from admin Seuils — make them read-only display of `getScoreLevel`.

### Database migration

1. New `scoring_config` rows (or update existing) so factor weights persist with the 6-factor schema. Add columns / defaults: `weight_infractions`, `weight_sinistralite`, `weight_credit`; drop `weight_anciennete` (or set to 0 and hide).
2. Migration patch: rewrite `recompute_driver_score(driver_id)` SQL function to sum the 6 factor contributions on the 0–1000 scale, base 500, default 700 for drivers with `status = 'provisional'`.
3. New `driver_factor_scores` view (materialised per driver) so admin `/admin/scoring` and driver `/driver/score` read the same per-dimension values.
4. Backfill: one-shot SQL that calls `recompute_driver_score()` for every active driver. Old 300–900 values are overwritten — explicit user choice ("rescale + recompute all").

### Code changes

- `src/lib/scoringEngine.ts` — add `FactorWeights`, `evaluateContraventions`, `evaluateCredit`, extend `evaluateDriver` to return per-factor breakdown.
- `src/lib/scoreLevel.ts` — already correct; export as canonical and add a `THRESHOLDS` constant other files import.
- `src/pages/admin/ScoringConfig.tsx` — Poids tab: 6 sliders summing to 100 %; Seuils tab: read-only thresholds bound to `THRESHOLDS`; remove Anciennete inputs; add Infractions / Sinistralité / Crédit weight controls.
- `src/pages/driver/Score.tsx` — show 5 dimension cards (Paiement, Conduite, Revenu, Sinistralité, Contrôles visuels) reading from `driver_factor_scores`.
- `src/pages/driver/Home.tsx` — replace any hard-coded grade label with `getScoreLevel(score).level` so 722 always shows B everywhere.
- `src/pages/admin/Drivers.tsx`, `DriverDetail.tsx`, `Dashboard.tsx` — same: route every tier badge through `getScoreLevel`.
- New seeding helper: driver insert sets `base_score = 700`, `score = 650`, `status = 'provisional'`.

### Verification

- Vitest: extend `scoringEngine.test.ts` and `scoreReconciliation.test.ts` to cover the 6-factor formula and new-driver default.
- After backfill: `SELECT level, count(*) FROM drivers GROUP BY level` sanity check.
- Manual: open test driver (+225 05 05 05 05 05) on /driver/score and verify 5 cards + grade matches Home.

### Out of scope (deferred to Phase 13)

- Full Paramètres suite (Entreprise / Apparence / Journal d'audit panel).
- Explicit "Recharger via Wave" CTA polish on driver Wallet.
- Removing legacy `weight_anciennete` column (kept nullable for one release).
