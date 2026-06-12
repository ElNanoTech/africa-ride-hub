# SPEC (reviewed) — Driver Fleet Control / Contrôle Visuel Chauffeur

> Senior-engineering review of the original "SPEC — Driver Fleet Control"
> Google Doc against the codebase (June 12, 2026). The driver experience is
> substantially implemented in `src/pages/driver/VehicleInspection.tsx`
> (route `/driver/fleet-control`), backed by `vehicle_inspections` /
> `vehicle_inspection_photos` and the `fleet_control_*` RPCs. This document
> marks what is DONE and defines the remaining punch list. Design bar:
> Apple-quality, thumb-friendly, simple French — drivers are not tech-savvy.

## DONE (verified in code)
- Route `/driver/fleet-control` + bottom-nav entry with priority badge
  (danger/warning by effective status).
- Home card with state machine (pending/submitted/rejected/overdue/blocked,
  hidden when no control) in `Home.tsx` `FleetControlCard`.
- 11 item tiles with full state rendering (empty / uploaded+Modifier /
  submitted / Validé locked / Refusé + reason + Reprendre), camera capture
  (`capture=environment`) + gallery, client compression (1280px ≈ spec's
  1600px — acceptable), 10MB cap, signed-URL XHR upload with progress bar,
  per-item draft persistence, retry with French error messages.
- Sticky submit bar; `fleet_control_submit` RPC validates completeness
  server-side; only-rejected-items retake flow; approved items locked;
  re-upload on rejected control resets to pending.
- Status banners for all 7 statuses; honest immobilization panel with
  dry-run badge ("Mode test Uffizio"), command ref, audit timeline.
- RLS: driver sees/updates only own controls in allowed statuses.
- Driver remarks textarea (beyond spec — keep).

## TO BUILD (punch list)
1. **FC-D1 — History.** Route `/driver/fleet-control/history` listing past
   controls (date, vehicle, status, rejection reason, reviewed date) with a
   detail view `/driver/fleet-control/:id` (read-only for closed controls;
   the active control keeps the existing screen). Entry point: "Voir
   l'historique" link on the main screen + home card state A.
2. **FC-D2 — Notification deep links.** `getNotificationDeeplink()` in
   `src/pages/driver/Notifications.tsx` must route all `fleet_control_*`
   notification types to `/driver/fleet-control` (or `/:id`). Backend RPCs
   must set a consistent `notification_type` (audit current values and map
   all of them).
3. **FC-D3 — Progress breakdown.** Progress card shows `X/11` plus
   `Véhicule: n/7 · Documents: n/4`, derived from the same required-zone
   set as the server (see FC-A3 in SPEC_FLEET_CONTROL.md — totals change
   when `require_documents`/`require_all_photos` settings change).
4. **FC-D4 — Relative due-date copy.** "Échéance dans X jours" / "À
   soumettre aujourd'hui" / "En retard de X jours" on the main screen
   header and home card (logic partially exists on Home card — unify in a
   helper in `src/lib/fleetControl.ts`).
5. **FC-D5 — Realtime.** Subscribe to the driver's `vehicle_inspections` +
   `vehicle_inspection_photos` rows (replace/augment the 60s poll) so
   admin approval/rejection appears immediately. Reuse
   `useRealtimePostgresChanges`; add tables to publication if needed.
6. **FC-D6 — Immobilization copy nuance.** Distinguish requested/
   pending_stop ("Restriction demandée — en attente de vérification du
   stationnement") from cut_sent ("Véhicule immobilisé — contactez votre
   gestionnaire") in the banner, not just the panel.

## Acceptance (added to E2E)
- Driver completes 11/11 → submit → admin approves → driver sees Validé in
  realtime (no manual refresh).
- Admin rejects one item with reason → driver sees reason, can retake only
  that item, resubmits → admin sees updated item.
- History shows the closed cycle after approval.
- Notification rows for required/reminder/approved/rejected deep-link to
  the control screen.
- RLS: driver B cannot read driver A's control or photos by URL/id.
