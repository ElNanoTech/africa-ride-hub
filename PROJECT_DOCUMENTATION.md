# DAM Flotte – Complete Project Documentation

> **For AI Coding Agents**: This document describes the full architecture, purpose, features, database schema, and technical stack of the DAM Flotte platform. Use this as your primary reference when testing, debugging, or extending the application.

---

## 1. PURPOSE & BUSINESS CONTEXT

**DAM Flotte** is a **fleet management and driver credit scoring platform** built for ride-hail fleet operators in **Côte d'Ivoire (Ivory Coast)**, West Africa. The primary city of operation is **Abidjan**.

### Business Model: Rent-to-Own
- Fleet operators rent vehicles to drivers (ride-hail drivers on Yango platform)
- Drivers pay **15,000–30,000 FCFA/week** for vehicle rental
- Over a **3-year (156-week) contract**, drivers progressively acquire ownership of their vehicle
- A proprietary **"DAM Score"** (credit score) determines driver eligibility for loans and better vehicles

### Key Stakeholders
1. **Drivers** – Ride-hail drivers who rent vehicles and aim to own them
2. **Admin/Fleet Operators** – Manage vehicles, rentals, payments, KYC, support
3. **Platform Owner** – Super-admin who manages multi-tenant customer accounts

### Multi-Tenant Architecture
The platform supports multiple fleet operator customers (tenants). Each customer has their own drivers, vehicles, and data, isolated via `customer_id` foreign keys on most tables.

---

## 2. TECHNOLOGY STACK

### Frontend
- **React 18** + **TypeScript** + **Vite 5**
- **Tailwind CSS 3** + **shadcn/ui** (Radix-based component library)
- **React Router v6** (client-side routing)
- **TanStack React Query v5** (data fetching, caching, mutations)
- **Framer Motion** (animations)
- **Recharts** (charts/analytics)
- **Leaflet + React-Leaflet** (maps for GPS tracking)
- **Zustand** (minimal state management)
- **Capacitor** (native mobile builds – Android/iOS)
- **PWA** (vite-plugin-pwa for offline-first)

### Backend (Supabase / Lovable Cloud)
- **PostgreSQL** database with Row-Level Security (RLS)
- **Supabase Auth** (email/password, PIN-based for drivers)
- **Supabase Edge Functions** (Deno-based serverless functions)
- **Supabase Storage** (file uploads: KYC docs, income proofs, accident photos)
- **Supabase Realtime** (live notifications)
- **pg_cron** (scheduled jobs for telemetry sync, payment reminders, score calculation)

### External Integrations
- **Uffizio/Trakzee** – GPS vehicle tracking platform (72 vehicles connected)
- **Wave** – Mobile money payment processing (Senegal/Ivory Coast)
- **Yango** – Ride-hail platform (driver income data sync)
- **Lovable AI** – AI-powered features (chatbot, KYC validation, income insights)

---

## 3. APPLICATION ARCHITECTURE

### Two Main Apps in One Codebase

#### Driver App (`/driver/*` routes)
Mobile-first PWA for drivers:
- `/driver/login` – Phone + PIN authentication
- `/driver` – Home dashboard (score, payments, quick actions)
- `/driver/vehicles` – Browse available vehicles
- `/driver/rental` – Request vehicle rentals
- `/driver/score` – View DAM Score breakdown
- `/driver/loans` – Apply for micro-loans
- `/driver/kyc` – Submit identity documents
- `/driver/income` – Report daily income
- `/driver/notifications` – Push notifications
- `/driver/support` – Support ticket system
- `/driver/ownership` – Rent-to-own progress tracker
- `/driver/accident` – Accident report submission
- `/driver/leaderboard` – Gamified driver ranking
- `/driver/settings` – App preferences

#### Admin Portal (`/admin/*` routes)
Desktop-first dashboard for fleet operators:
- `/admin/login` – Email/password authentication
- `/admin` – Dashboard with KPIs
- `/admin/drivers` – Driver management (DAM drivers + GPS drivers tabs)
- `/admin/drivers/:id` – Individual driver detail page
- `/admin/vehicles` – Vehicle fleet management (merged with GPS data)
- `/admin/rentals` – Rental request approval/management
- `/admin/loans` – Loan application review
- `/admin/payments` – Payment tracking and reconciliation
- `/admin/tracking` – Live GPS vehicle map (Leaflet + Uffizio)
- `/admin/driving-behavior` – Fleet driving behavior analytics
- `/admin/support` – Support ticket management
- `/admin/scoring` – DAM Score configuration
- `/admin/contracts` – Rent-to-own contract management
- `/admin/incidents` – Accident report review
- `/admin/analytics` – Business analytics dashboard
- `/admin/audit` – Admin action audit trail
- `/admin/users` – Admin user management
- `/admin/settings` – Platform settings
- `/admin/feature-flags` – Feature flag management
- `/admin/customers` – Multi-tenant customer management
- `/admin/income-entry` – Manual income data entry
- `/admin/income-approvals` – Driver income verification
- `/admin/platform-sync` – External platform sync status
- `/admin/pricing` – Rental pricing management
- `/admin/ai-usage` – AI feature usage analytics

#### Marketing Pages
- `/` – Landing page
- `/support` – Public support page
- `/privacy` – Privacy policy
- `/terms` – Terms of service
- `/install` – PWA installation guide

---

## 4. DATABASE SCHEMA

### Core Tables

| Table | Purpose |
|-------|---------|
| `customers` | Multi-tenant fleet operator accounts |
| `drivers` | Driver profiles (linked to auth via `auth_user_id`) |
| `vehicles` | Fleet vehicles (with optional `uffizio_device_id` for GPS) |
| `rentals` | Vehicle rental agreements |
| `payments` | All payment records (rental + loan) |
| `loans` | Micro-loan applications |
| `credit_scores` | Weekly DAM Score calculations |
| `credit_score_breakdowns` | Score factor breakdown (payment, income, driving) |
| `income_records` | Driver income data (Yango sync or manual) |
| `kyc_submissions` | KYC document submissions |
| `telemetry_events` | GPS driving telemetry (synced from Uffizio) |
| `notifications` | Driver notifications |
| `support_tickets` | Support tickets |
| `support_ticket_messages` | Ticket conversation messages |

### Rent-to-Own Tables
| Table | Purpose |
|-------|---------|
| `rent_to_own_contracts` | 3-year ownership contracts |
| `contract_payments` | Weekly ownership payments |
| `contract_milestones` | Ownership milestones (25%, 50%, Year 1, etc.) |

### Accident Management
| Table | Purpose |
|-------|---------|
| `accident_reports` | Accident declarations with location, severity |
| `accident_report_media` | Photos/evidence for accidents |
| `accident_report_notes` | Internal admin notes on accidents |

### GPS & Geofencing
| Table | Purpose |
|-------|---------|
| `geofence_zones` | GPS geofence zones (Abidjan areas) |
| `geofence_alerts` | Zone entry/exit alerts |

### Admin & Platform
| Table | Purpose |
|-------|---------|
| `admin_users` | Admin user accounts |
| `admin_roles` | Role-based access (super_admin, manager, loan_officer, support_agent) |
| `admin_audit_logs` | Action audit trail |
| `admin_preferences` | Admin notification preferences |
| `platform_settings` | Global platform configuration |
| `feature_flags` | Feature toggle management |
| `feature_flag_audit_log` | Feature flag change history |
| `scoring_config` | DAM Score weight configuration |
| `ai_usage_logs` | AI feature usage tracking |
| `ai_explanations` | AI-generated score explanations |

### Gamification
| Table | Purpose |
|-------|---------|
| `badge_definitions` | Achievement badge definitions |
| `driver_badges` | Earned badges per driver |
| `driver_favorites` | Driver vehicle favorites |

### Auth & Security
| Table | Purpose |
|-------|---------|
| `login_activity` | Login attempt tracking |
| `device_tokens` | Push notification device tokens |
| `push_subscriptions` | Web push subscriptions |
| `banks` | Bank reference data |

### Enum Types
- `app_role`: `super_admin`, `manager`, `loan_officer`, `support_agent`

---

## 5. EDGE FUNCTIONS (Backend Logic)

All edge functions are in `supabase/functions/`:

| Function | Purpose |
|----------|---------|
| `sync-uffizio` | **Core GPS integration** – Authenticates with Uffizio/Trakzee API, fetches live vehicle positions, driving behavior reports (overspeed, harsh braking, idle), trip history, and driver list. Supports actions: `getLiveData`, `syncTelemetry`, `getDrivingBehavior`, `getDriverList` |
| `calculate-weekly-scores` | Computes DAM Score weekly (payment 40%, income 35%, driving 25%) |
| `generate-score-explanation` | AI-generated score explanation for drivers |
| `generate-score-tips` | AI-generated improvement tips |
| `wave-checkout` | Initiates Wave mobile money payment |
| `wave-webhook` | Receives Wave payment confirmations |
| `check-wave-payments` | Polls Wave API for pending payments |
| `payment-reminders` | Sends payment due date reminders |
| `sync-yango-income` | Syncs driver income from Yango platform |
| `import-income` | Bulk income data import |
| `import-drivers` | Bulk driver import from CSV |
| `import-vehicles` | Bulk vehicle import |
| `ai-driver-chatbot` | AI chatbot for driver questions |
| `ai-admin-assistant` | AI assistant for admin queries |
| `ai-kyc-validation` | AI-powered KYC document validation |
| `ai-income-insights` | AI income pattern analysis |
| `create-admin-user` | Creates new admin users |
| `create-test-driver` | Creates test driver accounts |
| `setup-admin` | Initial platform setup |
| `notify-kyc-submission` | KYC submission notifications |
| `send-push-notification` | Push notification delivery |
| `weekly-rewards` | Weekly gamification rewards |

---

## 6. SCHEDULED JOBS (pg_cron)

| Job | Schedule | Function |
|-----|----------|----------|
| Payment reminders | Daily 8:00 AM | `payment-reminders` |
| Weekly score calculation | Monday 2:00 AM | `calculate-weekly-scores` |
| Weekly rewards | Sunday 8:00 AM | `weekly-rewards` |
| Wave payment check | Every 5 min | `check-wave-payments` |
| Uffizio telemetry sync | Every 30 min* | `sync-uffizio` (syncTelemetry) |

*Currently set to 30 min to avoid rate limit conflicts with another GPS app. Default is 15 min.

---

## 7. KEY FEATURES IN DETAIL

### DAM Score (Credit Scoring)
- Proprietary credit score (0-1000) calculated weekly
- Factors: Payment history (40%), Income stability (35%), Driving behavior (25%)
- Tiers: Excellent (800+), Good (650-799), Average (500-649), Low (<500)
- Score determines loan eligibility and vehicle access
- AI-generated explanations and improvement tips

### GPS Vehicle Tracking (Uffizio/Trakzee Integration)
- 72 vehicles connected via GPS
- Live position tracking with status indicators (Moving/Idle/Offline)
- Driving behavior monitoring: overspeed, harsh braking, idle time
- Trip history with start/end locations
- Geofence zones for Abidjan metropolitan area
- Data feeds into DAM Score calculation
- API authentication: username/password → access token
- Rate limit: 3-minute minimum between API calls
- Retry mechanism for token synchronization issues

### Payment System (Wave Integration)
- Wave mobile money checkout flow
- Webhook-based payment confirmation
- Automated payment schedule generation for rentals and loans
- Overdue payment tracking and reminders

### KYC (Know Your Customer)
- Document upload (ID proof, driver's license)
- Bank account verification
- AI-assisted document validation
- Admin review workflow
- KYC gate blocks access to rentals/loans until verified

### Multi-Tenant Support
- `customers` table for tenant isolation
- `customer_id` foreign key on most data tables
- Custom branding per customer (logo, colors)
- Feature flags per customer
- Platform owner can manage all tenants

### Gamification
- Driver leaderboard with rankings
- Achievement badges (payment streaks, score milestones)
- Daily tips and streak tracking
- Confetti celebrations for achievements

---

## 8. AUTHENTICATION ARCHITECTURE

### Driver Authentication
- Phone number + PIN (6-digit)
- Biometric login option (WebAuthn)
- Trusted device management
- Login activity tracking
- Rate limiting on failed attempts

### Admin Authentication
- Email + password (Supabase Auth)
- Role-based access control (RBAC)
- Roles: super_admin, manager, loan_officer, support_agent
- Platform owner flag for multi-tenant management
- Session-based with Supabase JWT

---

## 9. ENVIRONMENT & SECRETS

### Required Secrets (stored in Supabase vault)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `UFFIZIO_USERNAME`, `UFFIZIO_PASSWORD`, `UFFIZIO_SERVER_URL` – GPS platform credentials
- `YANGO_API_KEY`, `YANGO_PARK_ID` – Ride-hail platform credentials
- `WAVE_API_KEY` – Mobile money payment API
- `LOVABLE_API_KEY` – AI features

### Frontend Environment Variables
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

---

## 10. DESIGN SYSTEM

- **Language**: French (Côte d'Ivoire market)
- **Currency**: FCFA (West African CFA Franc)
- **Theme**: Light/dark mode support via next-themes
- **Colors**: HSL-based semantic tokens in index.css
- **Components**: shadcn/ui with custom variants
- **Mobile-first**: PWA with offline support, optimized for low-bandwidth
- **Maps**: Leaflet centered on Abidjan (5.36°N, 4.01°W)

---

## 11. FILE STRUCTURE OVERVIEW

```
src/
├── App.tsx                    # Route definitions
├── main.tsx                   # Entry point
├── index.css                  # Design tokens & global styles
├── components/
│   ├── ui/                    # shadcn/ui base components
│   ├── AdminLayout.tsx        # Admin shell (sidebar, header)
│   ├── DriverLayout.tsx       # Driver shell (bottom nav)
│   ├── GPSDriversList.tsx     # GPS driver data component
│   ├── FleetGPSOverview.tsx   # Fleet GPS KPIs
│   ├── VehicleTrackingMap.tsx  # Leaflet map component
│   ├── ScoreGauge.tsx         # DAM Score visualization
│   ├── KycGate.tsx            # KYC verification gate
│   ├── AIChatbot.tsx          # AI chatbot widget
│   └── ...                    # ~60+ components
├── pages/
│   ├── admin/                 # Admin portal pages (~25 pages)
│   ├── driver/                # Driver app pages (~15 pages)
│   └── Landing.tsx            # Marketing landing page
├── hooks/
│   ├── useUffizioLiveData.ts  # Live GPS data hook
│   ├── useDrivingBehavior.ts  # Driving behavior data hook
│   ├── useDriverAuth.ts       # Driver authentication
│   ├── useAdminAuth.ts        # Admin authentication
│   ├── useAdminData.ts        # Admin dashboard data
│   ├── useDriverData.ts       # Driver dashboard data
│   └── ...                    # ~30+ custom hooks
├── lib/
│   ├── format.ts              # FCFA formatting, dates
│   ├── i18n.ts                # French translations
│   ├── export.ts              # PDF/CSV export utilities
│   └── ...
├── integrations/
│   └── supabase/
│       ├── client.ts          # Supabase client (auto-generated)
│       └── types.ts           # Database types (auto-generated)
└── assets/                    # Images, screenshots

supabase/
├── config.toml                # Supabase configuration
├── functions/                 # Edge functions (~20 functions)
│   ├── sync-uffizio/          # GPS integration (817 lines)
│   ├── calculate-weekly-scores/
│   ├── wave-checkout/
│   └── ...
└── migrations/                # Database migrations
```

---

## 12. TESTING NOTES

### Test Routes
- `/test-guide` – Interactive test scenario guide
- `/test-loans` – Loan feature testing page

### Key Test Scenarios
1. **Driver Login**: Phone + PIN → Dashboard
2. **KYC Flow**: Upload docs → Admin review → Approval/Rejection
3. **Rental Flow**: Browse vehicles → Request rental → Admin approval → Payment generation
4. **Loan Flow**: Apply → Score check → Admin review → Disbursement → Payment schedule
5. **GPS Tracking**: Live map with 72 vehicles → Status indicators → Driving behavior
6. **Payment**: Wave checkout → Webhook confirmation → Status update
7. **Score Calculation**: Weekly cron → Factor breakdown → AI explanation

### Important Considerations
- All data is **production data** (no test/simulated data)
- GPS system is shared with another application – currently rate-limited to 30-min intervals
- Wave payments require real FCFA transactions
- Geofence zones are real Abidjan locations
- Language is French throughout the application

---

## 13. DEPLOYMENT

- **Frontend**: Deployed via Lovable publish (https://dam-africa-connect.lovable.app)
- **Backend**: Edge functions deploy automatically on code push
- **Database**: Managed via Supabase migrations
- **Mobile**: Capacitor for Android/iOS builds

---

## 14. KNOWN CONFIGURATIONS & LIMITS

- Supabase default query limit: 1000 rows
- Uffizio API rate limit: ~20 requests/minute (shared across apps)
- React Query cache: 5 min stale, 30 min GC
- GPS refresh: 30 min (temporarily, normally 3 min client / 15 min cron)
- PWA: Offline-first with background sync
- File uploads: Max sizes vary by bucket (KYC, income proofs, accident photos)

---

*Last updated: March 2026*
*Generated for cross-agent knowledge transfer*
