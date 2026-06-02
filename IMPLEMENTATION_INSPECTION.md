# IMPLEMENTATION_INSPECTION.md

Audit performed before implementing **Part 1 — Realtime Sync Infrastructure**
from `ZzLOVABLE_PROMPT_COMBINED.pdf`. No production code was changed during the
inspection itself.

## 1. Schema — tables present in `public`

Verified via the live database:

| Spec table        | Status in this project                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `drivers`         | ✅ exists                                                                                |
| `vehicles`        | ✅ exists                                                                                |
| `rentals`         | ✅ exists                                                                                |
| `rental_charges`  | ❌ not present — daily charges are tracked through the existing `payments` table         |
| `rental_requests` | ❌ not present                                                                           |
| `loans`           | ✅ exists                                                                                |
| `loan_payments`   | ❌ not present — loan payments live in `payments` (typed via the `payment_type` column)  |
| `score_events`    | ❌ not present — equivalent table is **`driver_score_events`** (delta + reason + audit)  |
| `credit_scores`   | ✅ exists                                                                                |
| `notifications`   | ✅ exists                                                                                |
| `accidents`       | ✅ exists (full sinistres module)                                                        |
| `app_config`      | ❌ not present — config lives in `feature_flags` + customer settings                     |

> Decision logged: we will **not** create parallel `rental_charges` /
> `rental_payments` / `score_events` tables for Part 1 — Part 1 only needs
> realtime wiring. Any rebuild of the rental ledger is a Part 2 concern.

## 2. Trust score location

Two complementary stores already exist:

- `driver_scores.current_score` — denormalized "current" value (one row per
  driver, used by the home gauge).
- `credit_scores.score` + `credit_score_breakdowns` — full historical
  weekly snapshots with factor-by-factor breakdowns.
- `driver_score_events` — append-only audit (delta + reason).

We will **not** add a `drivers.trust_score` column. The score-related realtime
hook in Part 1 listens to `driver_score_events` so the driver UI can refresh
the gauge whenever a delta is applied.

## 3. Wave integration

- `supabase/functions/wave-checkout/index.ts` — mints a Wave checkout session
  for any payment row regardless of type. It does not have a `purpose` switch
  (loan vs rental); the `payment_type` is already stored on the `payments`
  row, so the function is purpose-agnostic by design.
- `supabase/functions/wave-webhook/index.ts` — handles incoming webhooks and
  marks payments paid; on-time score adjustments happen via the periodic
  `calculate-weekly-scores` job rather than synchronously inside the webhook.
- Resilience: a recently added offline-first `usePaymentQueue` queues intents
  to localStorage and auto-flushes when the network returns.

No changes to the Wave functions are needed for Part 1.

## 4. Notifications table & realtime

Schema (`public.notifications`):

| column              | type                       |
| ------------------- | -------------------------- |
| `id`                | uuid                       |
| `driver_id`         | uuid (nullable)            |
| `recipient_user_id` | uuid (nullable)            |
| `title`             | text                       |
| `message`           | text                       |
| `notification_type` | text                       |
| `is_read`           | boolean                    |
| `whatsapp_sent`     | boolean                    |
| `whatsapp_sent_at`  | timestamptz                |
| `created_at`        | timestamptz (default now)  |
| `customer_id`       | uuid                       |
| `channel`           | text                       |
| `template_id`       | text                       |
| `variables`         | jsonb                      |
| `send_status`       | text                       |

> The spec mentions `title_fr` / `body_fr`. This project keeps a single
> French string in `title` / `message` (UI is French-only). The new
> `NotificationListener` reads `title` / `message` accordingly.

Existing realtime usage:
- `useEnhancedNotifications` (in `src/hooks/`) already subscribes to
  `notifications` filtered by `driver_id`, plays the Web Audio "ding",
  invalidates queries, and surfaces toasts. **It is page-scoped**, only
  active where it's imported (notifications page, dashboard widgets).
- A truly global listener was missing — that gap is what Part 1 fills with
  the new `NotificationListener` mounted in `App.tsx`.

## 5. Driver bottom nav

`src/components/BottomNav.tsx` is the shared driver bottom nav. The "Prêts"
(loans) tab is one of the entries; the rental tab pattern is mirrored from it.
Part 1 does not touch the nav.

## 6. Currency formatter

`formatFcfa()` lives in `src/lib/format.ts` and is used everywhere
(`10 000 FCFA` style with NBSP thousands separators). Part 1 does not need it.

## 7. Auth / session for the driver

- `useDriverAuth()` (in `src/hooks/`) exposes `{ isAuthenticated, user, driverProfile }`.
- `useDriverId()` (in `src/hooks/useDriverData.ts`) returns the **driver row
  id** for the signed-in user — this is the value that matches
  `notifications.driver_id` and `driver_score_events.driver_id`.
- Both hooks are React-Query backed and safe to call from any component.
  The new `NotificationListener` uses them and stays inert when no driver is
  signed in.

## 8. Realtime publication coverage (`supabase_realtime`)

Verified via:

```sql
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

Already in the publication: `drivers`, `vehicles`, `rentals`, `loans`,
`payments`, `notifications`, `kyc_submissions`, `support_tickets`,
`support_ticket_messages`, `credit_scores`.

Added by Part 1: `driver_score_events` (the project's `score_events`
equivalent). `accidents` has its own realtime needs that are out of scope
here.

## 9. Existing realtime hook (`src/hooks/useRealtimeSubscription.ts`)

Signature: `useRealtimeSubscription({ tables: TableName[], showToasts })`.
It is consumed by multiple admin pages (drivers list, vehicles list, loans,
payments, etc.) to invalidate React Query caches and surface info toasts.
**It is intentionally not refactored.** The spec's lower-level signature
`(table, event, filter, callback, enabled)` is added as a separate hook
named `useRealtimePostgresChanges` so both patterns can coexist without
breaking any existing admin page.

## Summary of Part 1 deliverables

1. `src/hooks/useRealtimePostgresChanges.ts` — generic, ref-stable
   realtime hook matching the spec's signature.
2. `src/components/NotificationListener.tsx` — global driver-scoped toast
   listener (sound + vibrate + cache invalidation).
3. `src/components/RealtimeConnectionBanner.tsx` — pill that surfaces
   reconnecting / disconnected states above the bottom nav.
4. Both components are mounted once inside `App.tsx`.
5. Migration `enable_realtime_driver_score_events` adds the missing table
   to `supabase_realtime` and sets `REPLICA IDENTITY FULL` so updates carry
   the prior row.
