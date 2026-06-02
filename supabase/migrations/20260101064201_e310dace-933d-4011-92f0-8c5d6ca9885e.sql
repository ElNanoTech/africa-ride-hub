-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- APP ROLE ENUM
-- =============================================
CREATE TYPE public.app_role AS ENUM ('super_admin', 'manager', 'loan_officer', 'support_agent');

-- =============================================
-- DRIVERS TABLE
-- =============================================
CREATE TABLE public.drivers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    yango_driver_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    phone_number TEXT NOT NULL,
    profile_image_url TEXT,
    kyc_status TEXT NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'verified', 'rejected')),
    driver_status TEXT NOT NULL DEFAULT 'active' CHECK (driver_status IN ('active', 'suspended', 'inactive')),
    active_vehicle_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

-- =============================================
-- VEHICLES TABLE
-- =============================================
CREATE TABLE public.vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_name TEXT NOT NULL,
    license_plate TEXT UNIQUE NOT NULL,
    vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('car', 'bike')),
    rent_per_day INTEGER NOT NULL,
    rent_per_week INTEGER,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'rented', 'maintenance')),
    uffizio_device_id TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- Add foreign key to drivers
ALTER TABLE public.drivers ADD CONSTRAINT fk_driver_active_vehicle 
    FOREIGN KEY (active_vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;

-- =============================================
-- ADMIN USERS TABLE
-- =============================================
CREATE TABLE public.admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- =============================================
-- ADMIN ROLES TABLE (separate from profile for security)
-- =============================================
CREATE TABLE public.admin_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
    role app_role NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(admin_user_id, role)
);

ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

-- =============================================
-- KYC SUBMISSIONS TABLE
-- =============================================
CREATE TABLE public.kyc_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    id_proof_url TEXT NOT NULL,
    license_url TEXT,
    bank_name TEXT NOT NULL,
    bank_account_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RENTALS TABLE
-- =============================================
CREATE TABLE public.rentals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    rental_plan TEXT NOT NULL CHECK (rental_plan IN ('daily', 'weekly')),
    start_date DATE NOT NULL,
    end_date DATE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'active', 'completed', 'terminated')),
    approved_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
    approval_date TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.rentals ENABLE ROW LEVEL SECURITY;

-- =============================================
-- LOANS TABLE
-- =============================================
CREATE TABLE public.loans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    loan_type TEXT NOT NULL CHECK (loan_type IN ('car_loan', 'bike_loan', 'tv_loan')),
    amount_requested INTEGER NOT NULL,
    amount_approved INTEGER,
    interest_rate FLOAT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'disbursed', 'repaying', 'completed', 'defaulted')),
    rejection_reason TEXT,
    approved_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disbursed_at TIMESTAMPTZ
);

ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

-- =============================================
-- PAYMENTS TABLE
-- =============================================
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    rental_id UUID REFERENCES public.rentals(id) ON DELETE SET NULL,
    loan_id UUID REFERENCES public.loans(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('rental', 'loan_repayment')),
    due_date DATE NOT NULL,
    paid_date DATE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'waived')),
    wave_transaction_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- =============================================
-- CREDIT SCORES TABLE
-- =============================================
CREATE TABLE public.credit_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 1000),
    tier TEXT NOT NULL CHECK (tier IN ('A', 'B', 'C', 'D', 'E')),
    status TEXT NOT NULL DEFAULT 'provisional' CHECK (status IN ('provisional', 'active')),
    calculation_week DATE NOT NULL,
    driving_impact INTEGER,
    payment_impact INTEGER,
    income_impact INTEGER,
    driving_data_available BOOLEAN NOT NULL DEFAULT FALSE,
    payment_data_available BOOLEAN NOT NULL DEFAULT FALSE,
    income_data_available BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(driver_id, calculation_week)
);

ALTER TABLE public.credit_scores ENABLE ROW LEVEL SECURITY;

-- =============================================
-- CREDIT SCORE BREAKDOWNS TABLE
-- =============================================
CREATE TABLE public.credit_score_breakdowns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credit_score_id UUID NOT NULL REFERENCES public.credit_scores(id) ON DELETE CASCADE,
    factor TEXT NOT NULL CHECK (factor IN ('driving', 'payment', 'income')),
    raw_value FLOAT,
    normalized_value FLOAT,
    impact_points INTEGER NOT NULL,
    weight_applied FLOAT NOT NULL,
    data_available BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT
);

ALTER TABLE public.credit_score_breakdowns ENABLE ROW LEVEL SECURITY;

-- =============================================
-- TELEMETRY EVENTS TABLE (GPS Data from Uffizio)
-- =============================================
CREATE TABLE public.telemetry_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    event_date DATE NOT NULL,
    distance_km FLOAT NOT NULL DEFAULT 0,
    harsh_braking_count INTEGER NOT NULL DEFAULT 0,
    overspeeding_count INTEGER NOT NULL DEFAULT 0,
    idle_time_minutes INTEGER NOT NULL DEFAULT 0,
    average_speed_kmh FLOAT,
    fuel_level FLOAT,
    last_location_lat FLOAT,
    last_location_lng FLOAT,
    raw_data JSONB,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;

-- =============================================
-- INCOME RECORDS TABLE (From Yango/Wave)
-- =============================================
CREATE TABLE public.income_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    record_date DATE NOT NULL,
    gross_income INTEGER NOT NULL DEFAULT 0,
    net_income INTEGER NOT NULL DEFAULT 0,
    trip_count INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL CHECK (source IN ('yango', 'wave')),
    raw_data JSONB,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(driver_id, record_date, source)
);

ALTER TABLE public.income_records ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SCORING CONFIGURATION TABLE
-- =============================================
CREATE TABLE public.scoring_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_key TEXT UNIQUE NOT NULL,
    config_value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.scoring_config ENABLE ROW LEVEL SECURITY;

-- =============================================
-- NOTIFICATIONS TABLE
-- =============================================
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    notification_type TEXT NOT NULL CHECK (notification_type IN ('score_update', 'payment_reminder', 'loan_status', 'rental_status', 'safety_tip', 'announcement')),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    whatsapp_sent BOOLEAN NOT NULL DEFAULT FALSE,
    whatsapp_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SUPPORT TICKETS TABLE
-- =============================================
CREATE TABLE public.support_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    ticket_number TEXT UNIQUE,
    category TEXT NOT NULL CHECK (category IN ('payment', 'technical', 'loan', 'rental', 'other')),
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    assigned_to UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SUPPORT TICKET MESSAGES TABLE
-- =============================================
CREATE TABLE public.support_ticket_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('driver', 'admin')),
    sender_id UUID NOT NULL,
    message TEXT NOT NULL,
    attachment_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- =============================================
-- ADMIN AUDIT LOGS TABLE
-- =============================================
CREATE TABLE public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id UUID,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- BANKS TABLE (For KYC dropdown)
-- =============================================
CREATE TABLE public.banks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;

-- =============================================
-- AUTO-UPDATE TRIGGER FOR updated_at
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql' SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON public.drivers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON public.vehicles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_rentals_updated_at BEFORE UPDATE ON public.rentals
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON public.support_tickets
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON public.admin_users
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- AUTO-GENERATE TICKET NUMBER
-- =============================================
CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
    year_part TEXT;
    seq_num INTEGER;
BEGIN
    year_part := TO_CHAR(NOW(), 'YYYY');
    SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 10) AS INTEGER)), 0) + 1
    INTO seq_num
    FROM public.support_tickets
    WHERE ticket_number LIKE 'TKT-' || year_part || '-%';
    NEW.ticket_number := 'TKT-' || year_part || '-' || LPAD(seq_num::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql' SECURITY DEFINER SET search_path = public;

CREATE TRIGGER generate_ticket_number_trigger BEFORE INSERT ON public.support_tickets
    FOR EACH ROW WHEN (NEW.ticket_number IS NULL)
    EXECUTE FUNCTION public.generate_ticket_number();

-- =============================================
-- SECURITY DEFINER FUNCTION FOR ROLE CHECKING
-- =============================================
CREATE OR REPLACE FUNCTION public.has_admin_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_roles ar
    JOIN public.admin_users au ON ar.admin_user_id = au.id
    WHERE au.user_id = _user_id
      AND ar.role = _role
      AND au.is_active = TRUE
  )
$$;

-- Function to check if user is any admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = _user_id
      AND au.is_active = TRUE
  )
$$;

-- Function to get driver_id for current user
CREATE OR REPLACE FUNCTION public.get_driver_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.drivers WHERE user_id = _user_id LIMIT 1
$$;

-- =============================================
-- RLS POLICIES
-- =============================================

-- Drivers policies
CREATE POLICY "Drivers can view own profile" ON public.drivers
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Drivers can update own profile" ON public.drivers
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Admins can view all drivers" ON public.drivers
    FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update drivers" ON public.drivers
    FOR UPDATE USING (public.is_admin(auth.uid()));

CREATE POLICY "Allow driver creation" ON public.drivers
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Vehicles policies (public read for catalog)
CREATE POLICY "Anyone can view available vehicles" ON public.vehicles
    FOR SELECT USING (TRUE);

CREATE POLICY "Admins can manage vehicles" ON public.vehicles
    FOR ALL USING (public.is_admin(auth.uid()));

-- Admin users policies
CREATE POLICY "Admins can view admin users" ON public.admin_users
    FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can view own admin profile" ON public.admin_users
    FOR SELECT USING (user_id = auth.uid());

-- Admin roles policies
CREATE POLICY "Admins can view roles" ON public.admin_roles
    FOR SELECT USING (public.is_admin(auth.uid()));

-- KYC submissions policies
CREATE POLICY "Drivers can view own KYC" ON public.kyc_submissions
    FOR SELECT USING (driver_id = public.get_driver_id(auth.uid()));

CREATE POLICY "Drivers can create KYC" ON public.kyc_submissions
    FOR INSERT WITH CHECK (driver_id = public.get_driver_id(auth.uid()));

CREATE POLICY "Admins can view all KYC" ON public.kyc_submissions
    FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update KYC" ON public.kyc_submissions
    FOR UPDATE USING (public.is_admin(auth.uid()));

-- Rentals policies
CREATE POLICY "Drivers can view own rentals" ON public.rentals
    FOR SELECT USING (driver_id = public.get_driver_id(auth.uid()));

CREATE POLICY "Drivers can create rentals" ON public.rentals
    FOR INSERT WITH CHECK (driver_id = public.get_driver_id(auth.uid()));

CREATE POLICY "Admins can manage rentals" ON public.rentals
    FOR ALL USING (public.is_admin(auth.uid()));

-- Loans policies
CREATE POLICY "Drivers can view own loans" ON public.loans
    FOR SELECT USING (driver_id = public.get_driver_id(auth.uid()));

CREATE POLICY "Drivers can create loans" ON public.loans
    FOR INSERT WITH CHECK (driver_id = public.get_driver_id(auth.uid()));

CREATE POLICY "Admins can manage loans" ON public.loans
    FOR ALL USING (public.is_admin(auth.uid()));

-- Payments policies
CREATE POLICY "Drivers can view own payments" ON public.payments
    FOR SELECT USING (driver_id = public.get_driver_id(auth.uid()));

CREATE POLICY "Admins can manage payments" ON public.payments
    FOR ALL USING (public.is_admin(auth.uid()));

-- Credit scores policies
CREATE POLICY "Drivers can view own scores" ON public.credit_scores
    FOR SELECT USING (driver_id = public.get_driver_id(auth.uid()));

CREATE POLICY "Admins can manage scores" ON public.credit_scores
    FOR ALL USING (public.is_admin(auth.uid()));

-- Credit score breakdowns policies
CREATE POLICY "Drivers can view own breakdowns" ON public.credit_score_breakdowns
    FOR SELECT USING (
        credit_score_id IN (
            SELECT id FROM public.credit_scores WHERE driver_id = public.get_driver_id(auth.uid())
        )
    );

CREATE POLICY "Admins can manage breakdowns" ON public.credit_score_breakdowns
    FOR ALL USING (public.is_admin(auth.uid()));

-- Telemetry policies
CREATE POLICY "Drivers can view own telemetry" ON public.telemetry_events
    FOR SELECT USING (driver_id = public.get_driver_id(auth.uid()));

CREATE POLICY "Admins can manage telemetry" ON public.telemetry_events
    FOR ALL USING (public.is_admin(auth.uid()));

-- Income records policies
CREATE POLICY "Drivers can view own income" ON public.income_records
    FOR SELECT USING (driver_id = public.get_driver_id(auth.uid()));

CREATE POLICY "Admins can manage income" ON public.income_records
    FOR ALL USING (public.is_admin(auth.uid()));

-- Scoring config policies (public read, admin write)
CREATE POLICY "Anyone can view scoring config" ON public.scoring_config
    FOR SELECT USING (TRUE);

CREATE POLICY "Admins can update scoring config" ON public.scoring_config
    FOR ALL USING (public.is_admin(auth.uid()));

-- Notifications policies
CREATE POLICY "Drivers can view own notifications" ON public.notifications
    FOR SELECT USING (driver_id = public.get_driver_id(auth.uid()));

CREATE POLICY "Drivers can update own notifications" ON public.notifications
    FOR UPDATE USING (driver_id = public.get_driver_id(auth.uid()));

CREATE POLICY "Admins can manage notifications" ON public.notifications
    FOR ALL USING (public.is_admin(auth.uid()));

-- Support tickets policies
CREATE POLICY "Drivers can view own tickets" ON public.support_tickets
    FOR SELECT USING (driver_id = public.get_driver_id(auth.uid()));

CREATE POLICY "Drivers can create tickets" ON public.support_tickets
    FOR INSERT WITH CHECK (driver_id = public.get_driver_id(auth.uid()));

CREATE POLICY "Drivers can update own tickets" ON public.support_tickets
    FOR UPDATE USING (driver_id = public.get_driver_id(auth.uid()));

CREATE POLICY "Admins can manage tickets" ON public.support_tickets
    FOR ALL USING (public.is_admin(auth.uid()));

-- Support ticket messages policies
CREATE POLICY "Drivers can view ticket messages" ON public.support_ticket_messages
    FOR SELECT USING (
        ticket_id IN (
            SELECT id FROM public.support_tickets WHERE driver_id = public.get_driver_id(auth.uid())
        )
    );

CREATE POLICY "Drivers can create messages on own tickets" ON public.support_ticket_messages
    FOR INSERT WITH CHECK (
        ticket_id IN (
            SELECT id FROM public.support_tickets WHERE driver_id = public.get_driver_id(auth.uid())
        )
    );

CREATE POLICY "Admins can manage ticket messages" ON public.support_ticket_messages
    FOR ALL USING (public.is_admin(auth.uid()));

-- Audit logs policies (admin read only)
CREATE POLICY "Admins can view audit logs" ON public.admin_audit_logs
    FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can create audit logs" ON public.admin_audit_logs
    FOR INSERT WITH CHECK (public.is_admin(auth.uid()));

-- Banks policies (public read)
CREATE POLICY "Anyone can view banks" ON public.banks
    FOR SELECT USING (TRUE);

CREATE POLICY "Admins can manage banks" ON public.banks
    FOR ALL USING (public.is_admin(auth.uid()));