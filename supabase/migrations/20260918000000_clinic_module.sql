-- Clinic module: patients, consultations, clinical_tests, and a real
-- patient_id link on prescriptions.
--
-- Idempotent: safe to run even if some of this already exists (e.g. if
-- supabase/schema.sql's copy of these tables was already applied by hand
-- via the SQL editor) - every DDL statement below is guarded with
-- IF NOT EXISTS / OR REPLACE / conditional DO blocks.
--
-- Role model: only ADMIN and CLINICIAN may read or write clinical data.
-- CASHIER must not see diagnoses, consultation notes, or test results -
-- this is enforced here via RLS (private.current_pharmacy_role()), not
-- just by hiding UI, per the existing pharmacy_users RLS pattern
-- established in 20260914_auth_hardening.sql.
BEGIN;

CREATE TABLE IF NOT EXISTS public.patients (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    dob DATE NOT NULL,
    gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    allergies TEXT[] DEFAULT '{}',
    insurance_provider TEXT,
    insurance_policy_number TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_patients_full_name ON public.patients(full_name);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON public.patients(phone);

CREATE TABLE IF NOT EXISTS public.consultations (
    id TEXT PRIMARY KEY,
    patient_id TEXT REFERENCES public.patients(id) ON DELETE SET NULL,
    patient_name TEXT NOT NULL,
    clinician_id TEXT,
    clinician_name TEXT NOT NULL,
    date TIMESTAMPTZ NOT NULL,
    symptoms TEXT NOT NULL,
    diagnosis TEXT NOT NULL,
    notes TEXT,
    vitals JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consultations_patient ON public.consultations(patient_id);
CREATE INDEX IF NOT EXISTS idx_consultations_date ON public.consultations(date);

CREATE TABLE IF NOT EXISTS public.clinical_tests (
    id TEXT PRIMARY KEY,
    consultation_id TEXT REFERENCES public.consultations(id) ON DELETE SET NULL,
    patient_id TEXT REFERENCES public.patients(id) ON DELETE SET NULL,
    patient_name TEXT,
    test_name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Hematology', 'Biochemistry', 'Microbiology', 'Rapid Diagnostic', 'Urinalysis', 'Other')),
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Cancelled')),
    results TEXT,
    reference_ranges TEXT,
    notes TEXT,
    requested_by TEXT NOT NULL,
    conducted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clinical_tests_patient ON public.clinical_tests(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_tests_consultation ON public.clinical_tests(consultation_id);

-- Tie prescriptions to a real patient record instead of only carrying a
-- free-text name/DOB/phone snapshot. Nullable: a walk-in prescription
-- brought in from another clinic may have no patient record here yet.
ALTER TABLE public.prescriptions ADD COLUMN IF NOT EXISTS patient_id TEXT REFERENCES public.patients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id ON public.prescriptions(patient_id);

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read patients" ON public.patients;
DROP POLICY IF EXISTS "Authenticated modify patients" ON public.patients;
DROP POLICY IF EXISTS "Authenticated read consultations" ON public.consultations;
DROP POLICY IF EXISTS "Authenticated insert consultations" ON public.consultations;
DROP POLICY IF EXISTS "Authenticated read clinical_tests" ON public.clinical_tests;
DROP POLICY IF EXISTS "Authenticated modify clinical_tests" ON public.clinical_tests;
DROP POLICY IF EXISTS clinical_patients_select ON public.patients;
DROP POLICY IF EXISTS clinical_patients_modify ON public.patients;
DROP POLICY IF EXISTS clinical_consultations_select ON public.consultations;
DROP POLICY IF EXISTS clinical_consultations_insert ON public.consultations;
DROP POLICY IF EXISTS clinical_tests_select ON public.clinical_tests;
DROP POLICY IF EXISTS clinical_tests_modify ON public.clinical_tests;

-- Any broader "Authenticated ... USING (true)" policy from an earlier,
-- hand-applied copy of this schema would have let a CASHIER read/write
-- clinical notes; replaced here with admin-or-clinician-only checks.
CREATE POLICY clinical_patients_select ON public.patients FOR SELECT TO authenticated
  USING ((SELECT private.current_pharmacy_role()) IN ('admin', 'clinician'));
CREATE POLICY clinical_patients_modify ON public.patients FOR ALL TO authenticated
  USING ((SELECT private.current_pharmacy_role()) IN ('admin', 'clinician'))
  WITH CHECK ((SELECT private.current_pharmacy_role()) IN ('admin', 'clinician'));

CREATE POLICY clinical_consultations_select ON public.consultations FOR SELECT TO authenticated
  USING ((SELECT private.current_pharmacy_role()) IN ('admin', 'clinician'));
CREATE POLICY clinical_consultations_insert ON public.consultations FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.current_pharmacy_role()) IN ('admin', 'clinician'));

CREATE POLICY clinical_tests_select ON public.clinical_tests FOR SELECT TO authenticated
  USING ((SELECT private.current_pharmacy_role()) IN ('admin', 'clinician'));
CREATE POLICY clinical_tests_modify ON public.clinical_tests FOR ALL TO authenticated
  USING ((SELECT private.current_pharmacy_role()) IN ('admin', 'clinician'))
  WITH CHECK ((SELECT private.current_pharmacy_role()) IN ('admin', 'clinician'));

-- Realtime: so a prescription issued during a consultation appears at the
-- pharmacy counter, and a second clinician's device, without a manual
-- refresh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'patients'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.patients;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'consultations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.consultations;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'clinical_tests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clinical_tests;
  END IF;
END $$;

COMMIT;
