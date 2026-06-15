# KIRA Admin App V3 - Layer 2B Driver Operations Hub Map

Date: 2026-06-15
Scope: Admin Driver 360 / Driver Operating Record at `/admin/drivers/:id`

## Stable Routes

| Route | Behavior |
| --- | --- |
| `/admin/drivers/:id` | Primary Driver Operations Hub / Driver 360 operating record |
| `/admin/drivers/:id?tab=overview` | Overview tab |
| `/admin/drivers/:id?tab=finance` | Finance tab |
| `/admin/drivers/:id?tab=vehicle` | Vehicle tab |
| `/admin/drivers/:id?tab=fleet-control` | Fleet Control tab |
| `/admin/drivers/:id?tab=risk` | Risk tab |
| `/admin/drivers/:id?tab=growth` | Growth tab |
| `/admin/drivers/:id?tab=documents` | Documents tab |
| `/admin/drivers/:id?tab=activity` | Activity tab |

## Legacy Deep-Link Mapping

Existing links still land on useful grouped tabs:

| Legacy tab | Layer 2B tab |
| --- | --- |
| `scores`, `violations`, `accidents` | `risk` |
| `payments`, `invoices`, `income`, `wallet` | `finance` |
| `rentals` | `vehicle` |
| `loans` | `growth` |
| `tickets`, `notes`, `audit` | `activity` |

## Operating Record Structure

| Layer 2B area | Live data sources |
| --- | --- |
| Driver header | `drivers`, `drivers.active_vehicle_id`, `get_driver_360_summary`, `driver_wallets`, `driver_risk` |
| Health dashboard | `payments`, `invoice`, `kyc_submissions`, `driver_documents`, `vehicle_inspections`, `rentals`, `driver_risk`, credit journey rules |
| Lifecycle | Latest `credit_scores`, credit journey rules, ownership target |
| Ownership candidate | `credit_scores`, `payments`, `loans`, existing configured credit offers |
| Overview | `driver_risk`, `credit_scores`, `credit_score_breakdowns`, `payments`, `vehicle_inspections`, `get_driver_activity_timeline`, `get_driver_360_summary` |
| Finance | `driver_wallets`, `driver_wallet_transactions`, `payments`, `invoice`, `income_records` |
| Vehicle | `rentals`, `vehicles`, assignment/return RPC paths |
| Fleet Control | `vehicle_inspections`, `vehicle_inspection_photos`, Fleet Control RPCs and detail dialog |
| Risk | `driver_risk`, `credit_scores`, `traffic_violations`, `accidents` |
| Growth | `loans`, credit journey/ownership progress |
| Documents | `driver_documents`, `kyc_submissions`, private signed document URLs |
| Activity | `get_driver_activity_timeline`, `driver_notes`, `driver_audit`, `support_tickets` |

## Actions Preserved

- Edit driver.
- Assign vehicle.
- Send alert/message.
- Generate access code.
- Suspend/reactivate driver.
- Create invoice.
- Add note.
- Export scores CSV and PDF report.
- Wallet deposit/export.
- Fleet Control detail and relance.
- Contravention charge/invoice/paid/contest actions.
- Document upload/review/delete actions.

## Out Of Scope Preserved

- No schema changes.
- No credit engine rebuild.
- No payment/Wave behavior changes.
- No mechanic/shop module.
- No AI/black-box risk labels in Driver 360 first viewport.
