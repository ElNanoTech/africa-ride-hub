# KIRA Admin App V3 — Layer 2A Attention Center Map

Date: 2026-06-14
Scope: Admin web portal only

## Stable Routes

| Route | Behavior | Platform module |
| --- | --- | --- |
| `/admin/attention` | Primary Attention Center route | Centre d'attention |
| `/admin` | Stable existing dashboard entry, now renders Attention Center | Centre d'attention |
| `/admin/dashboard` | Alias route for dashboard deep links | Centre d'attention |

## Queue Sources

The action queue uses existing live application data only. No synthetic rows are created.

| Category | Source | Queue signals | CTA route |
| --- | --- | --- | --- |
| Finance | `payments` | Due today, overdue, remaining amount | `/admin/payments?payment=:id` |
| Finance | `invoice` | Issued, unpaid, partial, overdue remaining due | `/admin/billing?invoice=:id` |
| Fleet Control | `vehicle_inspections` | Submitted controls, overdue controls, rejected/blocked state | `/admin/fleet-control?control=:id` |
| Drivers | `kyc_submissions` | Pending/rejected KYC | `/admin/drivers/:driverId?tab=documents` |
| Drivers | `drivers` | Expired permit, suspended/inactive driver, active driver without vehicle | `/admin/drivers/:driverId` |
| Vehicles | `vehicles` | Unavailable, maintenance, blocked, inactive, GPS inactive | `/admin/vehicles?vehicle=:id` or `/admin/vehicles/gps-mapping?vehicle=:id` |
| Vehicles | `maintenance_orders` | Orders to validate or in progress | `/admin/maintenance?order=:id` |
| Risk | `accidents` | Open/unresolved accident cases | `/admin/sinistres/:id` |
| Risk | `traffic_violations` | Pending payment or contested violations | `/admin/contraventions?violation=:id` |
| Risk | `drivers_risk_summary` RPC | High/critical driver risk summary | `/admin/drivers/:driverId` |
| Growth | `loans` | Pending or approved loans needing follow-up | `/admin/loans?loan=:id` |
| Daily rental | `rentals` | Due today, overdue, pending, missing vehicle | `/admin/rentals?rental=:id` |

## KPI Filters

| KPI | Filter key | What it filters |
| --- | --- | --- |
| A encaisser aujourd'hui | `today_cash` | Payments/rentals due today |
| En retard | `overdue` | Overdue payments, invoices, rentals, controls |
| Controles a valider | `fleet_control` | Fleet Control queue rows |
| Vehicules indisponibles | `vehicles` | Vehicle, GPS, and maintenance rows |
| Chauffeurs a risque | `drivers_risk` | Risk, accident, violation, and driver-risk rows |
| Demandes en attente | `pending_requests` | KYC, loans, pending rentals, assignment work |

## Permission Behavior

Actions are not invented or rerouted when the current admin lacks a permission. The row remains visible, but the CTA is disabled with a role-specific reason:

| Permission | Required role/capability |
| --- | --- |
| Finance | `canManagePayments()` |
| Fleet | `canManageFleet()` |
| Drivers | `canManageFleet()` |
| Risk | `isManagerOrHigher()` |
| Growth | `canManageLoans()` |
| Support | `canManageSupport()` |

## Audit Events

Attention Center interactions write admin audit entries with `details.source = "attention_center"`:

| Event | Target |
| --- | --- |
| `attention_center_opened_item` | Target item entity |
| `attention_center_refreshed` | `attention_center` |
| `attention_center_exported_report` | `attention_center` |

## Out Of Scope Preserved

- No schema changes
- No payment function changes
- No Wave checkout changes
- No driver app navigation changes
- No mechanic/shop module
- No AI Coach
- No credit engine rebuild
