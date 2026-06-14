# KIRA Platform V3 Layer 1A Route-to-Module Map

Date: 2026-06-14

Scope: information architecture only. No schema changes, payment changes, Wave changes, mechanic/shop scope, AI Coach, or credit engine rebuild.

## Admin Platform Map

| Platform module | Existing routes | Notes |
| --- | --- | --- |
| Attention Center | `/admin`, `/admin/alertes`, `/admin/support` | Dashboard is framed as the operational attention surface using existing KPIs, queues, and quick actions. |
| Driver Operations | `/admin/drivers`, `/admin/drivers/new`, `/admin/drivers/:id`, `/admin/communication` | Driver 360, KYC badge, support messaging, and driver communication stay on current pages. |
| Vehicle Operations | `/admin/vehicles`, `/admin/vehicles/gps-mapping`, `/admin/gps-mapping`, `/admin/tracking`, `/admin/rentals`, `/admin/fleet-control`, `/admin/maintenance` | Daily rental, vehicle assignment, GPS, Fleet Control, and operating maintenance remain first-class. |
| Financial Operations | `/admin/payments`, `/admin/finance`, `/admin/billing`, `/admin/billing/settings`, `/admin/billing/unresolved`, `/admin/billing/audit`, `/admin/billing/wallets`, `/admin/income-entry`, `/admin/income-approvals`, `/admin/pricing`, `/admin/contracts` | Existing finance, invoice, wallet, pricing, contract, and income routes stay stable. |
| Trust & Risk | `/admin/scoring`, `/admin/driving-behavior`, `/admin/contraventions`, `/admin/sinistres`, `/admin/sinistres/analytics`, `/admin/sinistres/:id`, `/admin/audit` | Score, behavior, contraventions, accident cases, and audit are grouped as risk/trust surfaces. |
| Growth & Ownership | `/admin/loans`, `/admin/kira`, `/admin/analytics`, `/admin/ai-usage` | Existing loan and KIRA analytics surfaces map to the future growth/ownership pillar without changing the credit engine. |
| System | `/admin/users`, `/admin/settings`, `/admin/feature-flags`, `/admin/customers`, `/admin/platform-sync` | Admin users, settings, tenants/customers, flags, and platform integrations. |

## Driver App Map

| Driver tab/module | Existing routes | Notes |
| --- | --- | --- |
| Today | `/driver`, `/driver-dashboard`, `/driver/historique`, `/driver/notifications`, `/driver/notifications/settings`, `/driver/support` | Current five-tab structure is preserved. Today/home remains the driver command center. |
| Money | `/driver/finance`, `/driver/portefeuille`, `/driver/wallet`, `/driver/factures`, `/driver/factures/:id`, `/driver/income`, `/driver/loans` | Wallet, invoices, payments, and income stay inside the current Finance tab. |
| Vehicle | `/driver/vehicles`, `/driver/vehicle`, `/vehicles`, `/driver/rental`, `/rentals`, `/driver/sinistres`, `/driver/sinistres/report/:id/type`, `/driver/sinistres/report/:id/safety`, `/driver/sinistres/report/:id/evidence`, `/driver/sinistres/report/:id/location`, `/driver/sinistres/cases/:id`, `/driver/sinistres/success/:id` | Vehicle, rental, and accident reporting remain reachable through existing deep links. |
| Trust | `/driver/score`, `/score`, `/driver/kyc`, `/driver/profile/kyc`, `/driver/fleet-control`, `/driver/inspection`, `/driver/fleet-control/history`, `/driver/fleet-control/:id`, `/driver/formation`, `/driver/alertes`, `/driver/alerts`, `/driver/contraventions` | Score, KYC, Fleet Control, alerts, training, and contraventions stay stable. |
| Ownership | `/driver/credit`, `/driver/ownership`, `/driver/loans`, `/loans`, `/driver/leaderboard` | Ownership stays a growth path layered on top of daily rental. No credit engine rebuild in Layer 1A. |
| Profile & Settings | `/driver/profile`, `/profile`, `/driver/settings`, `/driver/onboarding`, `/driver-onboarding`, `/driver/profile-required` | Account, onboarding, and profile-required flows remain unchanged. |

## Stable Route Guarantees

- No existing admin route was removed or renamed.
- No existing driver route was removed or renamed.
- No new alias or redirect was required for Layer 1A.
- The driver bottom navigation remains five tabs: Accueil, Finance, Vehicule, Controle, Profil.
- Daily rental, finance, wallet, Wave, Fleet Control, sinistre, and KYC deep links remain routed through the existing pages.

## Out of Scope

- Database schema changes.
- Payment, invoice, Wave, wallet, or ledger behavior changes.
- Mechanic/shop workflows, garage marketplace, parts, labor, vendor portal, or shop payments.
- AI Coach or chatbot behavior.
- Credit decisioning or ownership eligibility engine rebuild.
