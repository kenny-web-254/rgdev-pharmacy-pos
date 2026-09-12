-- ==========================================================
-- PHARMACY POS DATABASE SCHEMA FOR SUPABASE
-- Run this in your Supabase Project -> SQL Editor -> New Query
-- ==========================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. USERS TABLE
CREATE TABLE IF NOT EXISTS public.pharmacy_users (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'clinician', 'cashier')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    email TEXT,
    phone TEXT,
    license_number TEXT,
    avatar_color TEXT DEFAULT 'bg-teal-700',
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. MEDICATIONS CATALOG & INVENTORY TABLE
CREATE TABLE IF NOT EXISTS public.medications (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    generic_name TEXT NOT NULL,
    dosage TEXT NOT NULL,
    form TEXT NOT NULL,
    category TEXT NOT NULL,
    is_prescription_required BOOLEAN DEFAULT FALSE,
    barcode TEXT UNIQUE NOT NULL,
    price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    stock INTEGER NOT NULL DEFAULT 0,
    min_stock_level INTEGER NOT NULL DEFAULT 10,
    batch_number TEXT NOT NULL,
    expiry_date DATE NOT NULL,
    manufacturer TEXT NOT NULL,
    requires_refrigeration BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for instant barcode & name lookups in POS
CREATE INDEX IF NOT EXISTS idx_medications_barcode ON public.medications(barcode);
CREATE INDEX IF NOT EXISTS idx_medications_name ON public.medications(name);
CREATE INDEX IF NOT EXISTS idx_medications_category ON public.medications(category);
CREATE INDEX IF NOT EXISTS idx_medications_stock ON public.medications(stock);

-- 4. PRESCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.prescriptions (
    id TEXT PRIMARY KEY,
    rx_number TEXT UNIQUE NOT NULL,
    barcode TEXT UNIQUE NOT NULL,
    patient_name TEXT NOT NULL,
    patient_dob DATE NOT NULL,
    patient_phone TEXT NOT NULL,
    doctor_name TEXT NOT NULL,
    doctor_license TEXT NOT NULL,
    doctor_clinic TEXT NOT NULL,
    medication_id TEXT REFERENCES public.medications(id) ON DELETE SET NULL,
    medication_name TEXT NOT NULL,
    dosage_instructions TEXT NOT NULL,
    quantity_prescribed INTEGER NOT NULL,
    quantity_dispensed_so_far INTEGER DEFAULT 0,
    refills_allowed INTEGER DEFAULT 0,
    refills_remaining INTEGER DEFAULT 0,
    date_issued DATE NOT NULL,
    expiry_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Active', 'Dispensed', 'Partially Dispensed', 'Expired')),
    insurance_provider TEXT,
    insurance_co_pay_rate NUMERIC(5, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_rx_number ON public.prescriptions(rx_number);
CREATE INDEX IF NOT EXISTS idx_prescriptions_barcode ON public.prescriptions(barcode);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON public.prescriptions(patient_name);

-- 4B. CLINICAL TESTS TABLE (ordered & recorded by clinicians)
CREATE TABLE IF NOT EXISTS public.tests (
    id TEXT PRIMARY KEY,
    test_number TEXT UNIQUE NOT NULL,
    patient_name TEXT NOT NULL,
    patient_dob DATE,
    patient_phone TEXT,
    clinician_name TEXT NOT NULL,
    clinician_license TEXT,
    test_type TEXT NOT NULL,
    notes TEXT,
    date_ordered DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Ordered' CHECK (status IN ('Ordered', 'In Progress', 'Completed', 'Cancelled')),
    result_summary TEXT,
    result_date DATE,
    linked_prescription_id TEXT REFERENCES public.prescriptions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tests_test_number ON public.tests(test_number);
CREATE INDEX IF NOT EXISTS idx_tests_patient ON public.tests(patient_name);
CREATE INDEX IF NOT EXISTS idx_tests_status ON public.tests(status);

-- 5. SALE TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.sale_transactions (
    id TEXT PRIMARY KEY,
    receipt_number TEXT UNIQUE NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cashier_name TEXT NOT NULL,
    cashier_role TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tax NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_method TEXT NOT NULL,
    amount_tendered NUMERIC(12, 2),
    change_due NUMERIC(12, 2),
    cash_amount NUMERIC(12, 2),
    mpesa_amount NUMERIC(12, 2),
    mpesa_reference TEXT,
    mpesa_phone TEXT,
    patient_name TEXT,
    card_auth_code TEXT,
    insurance_provider TEXT,
    insurance_policy_number TEXT,
    insurance_auth_code TEXT,
    is_offline BOOLEAN DEFAULT FALSE,
    synced BOOLEAN DEFAULT TRUE,
    sync_timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_transactions_receipt ON public.sale_transactions(receipt_number);
CREATE INDEX IF NOT EXISTS idx_sale_transactions_timestamp ON public.sale_transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_sale_transactions_payment ON public.sale_transactions(payment_method);

-- 6. SYSTEM AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id TEXT PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('AUTH', 'USERS', 'INVENTORY', 'SALES', 'SETTINGS', 'SYSTEM')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON public.audit_logs(category);

-- 7. PHARMACY & RECEIPT SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.receipt_settings (
    id TEXT PRIMARY KEY DEFAULT 'default_settings',
    pharmacy_name TEXT NOT NULL,
    tagline TEXT,
    address_line1 TEXT,
    address_line2 TEXT,
    phone TEXT,
    email TEXT,
    license_number TEXT,
    tax_id TEXT,
    tax_rate NUMERIC(5, 4) DEFAULT 0.16,
    paper_width TEXT DEFAULT '80mm',
    header_message TEXT,
    footer_message TEXT,
    return_policy TEXT,
    emergency_phone TEXT,
    show_generic_name BOOLEAN DEFAULT TRUE,
    show_batch_and_expiry BOOLEAN DEFAULT TRUE,
    show_prescription_details BOOLEAN DEFAULT TRUE,
    show_pharmacist_name BOOLEAN DEFAULT TRUE,
    show_barcode BOOLEAN DEFAULT TRUE,
    show_tax_breakdown BOOLEAN DEFAULT TRUE,
    currency_symbol TEXT DEFAULT 'KSh',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.pharmacy_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_settings ENABLE ROW LEVEL SECURITY;

-- Allow anon public access with anon key for POS client operations
CREATE POLICY "Allow anon read medications" ON public.medications FOR SELECT USING (true);
CREATE POLICY "Allow anon update medications" ON public.medications FOR ALL USING (true);

CREATE POLICY "Allow anon read prescriptions" ON public.prescriptions FOR SELECT USING (true);
CREATE POLICY "Allow anon modify prescriptions" ON public.prescriptions FOR ALL USING (true);

CREATE POLICY "Allow anon read tests" ON public.tests FOR SELECT USING (true);
CREATE POLICY "Allow anon modify tests" ON public.tests FOR ALL USING (true);

CREATE POLICY "Allow anon read sales" ON public.sale_transactions FOR SELECT USING (true);
CREATE POLICY "Allow anon insert sales" ON public.sale_transactions FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anon read users" ON public.pharmacy_users FOR SELECT USING (true);
CREATE POLICY "Allow anon modify users" ON public.pharmacy_users FOR ALL USING (true);

CREATE POLICY "Allow anon read audit logs" ON public.audit_logs FOR SELECT USING (true);
CREATE POLICY "Allow anon insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anon read settings" ON public.receipt_settings FOR SELECT USING (true);
CREATE POLICY "Allow anon update settings" ON public.receipt_settings FOR ALL USING (true);

-- 8B. REALTIME: publish medications, prescriptions & tests so connected
-- clients (admin / clinician / cashier, on any device) get live updates.
-- Safe to re-run; skips tables already in the publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'medications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.medications;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'prescriptions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.prescriptions;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tests;
  END IF;
END $$;

-- 9. INITIAL SEED DATA (DEFAULT SETTINGS)
INSERT INTO public.receipt_settings (
    id,
    pharmacy_name,
    tagline,
    address_line1,
    address_line2,
    phone,
    email,
    license_number,
    tax_id,
    tax_rate,
    currency_symbol
) VALUES (
    'default_settings',
    'Apothecary & Health Pharmacy',
    'Care You Can Trust, Everyday',
    'Kimathi Street, City Centre',
    'P.O. Box 48291-00100, Nairobi',
    '+254 700 123 456',
    'dispensary@apothecary.co.ke',
    'PPB-RET-2024-8819',
    'P051234567Z',
    0.16,
    'KSh'
) ON CONFLICT (id) DO NOTHING;
