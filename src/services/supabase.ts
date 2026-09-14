import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ClinicalTest, Consultation, Patient, Prescription, User, UserRole } from '../types';

const envUrl = (import.meta.env.VITE_SUPABASE_URL || (typeof process !== 'undefined' ? process.env?.SUPABASE_URL : '') || '') as string;
const envAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || (typeof process !== 'undefined' ? process.env?.SUPABASE_ANON_KEY : '') || '') as string;
let runtimeUrl = envUrl;
let runtimeAnonKey = envAnonKey;
let supabaseInstance: SupabaseClient | null = null;

export const supabaseConfig = {
  getUrl(): string { return runtimeUrl; },
  getAnonKey(): string { return runtimeAnonKey; },
  isConfigured(): boolean { return Boolean(runtimeUrl && runtimeAnonKey && runtimeUrl.startsWith('https://')); },
  setCredentials(url: string, anonKey: string) { runtimeUrl = url.trim(); runtimeAnonKey = anonKey.trim(); supabaseInstance = null; },
  clearCredentials() { runtimeUrl = envUrl; runtimeAnonKey = envAnonKey; supabaseInstance = null; },
};

export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfig.isConfigured()) return null;
  if (!supabaseInstance) {
    supabaseInstance = createClient(runtimeUrl, runtimeAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return supabaseInstance;
}

export async function testSupabaseConnection(): Promise<{ ok: boolean; message: string }> {
  const client = getSupabase();
  if (!client) return { ok: false, message: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the deployment environment.' };
  try {
    const { error } = await client.from('pharmacy_users').select('id').limit(1);
    if (error) return { ok: false, message: `Supabase query error: ${error.message} (${error.code || 'UNKNOWN'})` };
    return { ok: true, message: 'Successfully connected to Supabase.' };
  } catch (err: unknown) {
    return { ok: false, message: `Connection failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export type RealtimeTable = 'medications' | 'prescriptions' | 'tests' | 'sale_transactions';
let activeChannel: ReturnType<SupabaseClient['channel']> | null = null;
export function subscribeToRealtimeChanges(tables: RealtimeTable[], onChange: (table: RealtimeTable) => void): () => void {
  const client = getSupabase();
  if (!client) return () => {};
  if (activeChannel) { client.removeChannel(activeChannel); activeChannel = null; }
  let channel = client.channel('pharmapos-realtime-sync');
  for (const table of tables) channel = channel.on('postgres_changes' as any, { event: '*', schema: 'public', table }, () => onChange(table));
  channel.subscribe(); activeChannel = channel;
  return () => { if (activeChannel) { client.removeChannel(activeChannel); activeChannel = null; } };
}

interface AuthResult { ok: boolean; user?: User; error?: string; }
function rowToUser(row: any): User {
  return { id: row.id, username: row.username, email: row.email || undefined, name: row.name, role: row.role as UserRole, status: row.status, createdAt: row.created_at, lastLogin: row.last_login || undefined, phone: row.phone || undefined, licenseNumber: row.license_number || undefined, avatarColor: row.avatar_color || 'bg-teal-700' };
}

export async function checkBootstrapAvailable(): Promise<boolean> { return false; }

export async function signInWithSupabase(identifier: string, password: string): Promise<AuthResult> {
  const client = getSupabase();
  if (!client) return { ok: false, error: 'Supabase is not configured. Please configure the deployment environment.' };
  const GENERIC_ERROR = 'Invalid credentials or user not authorized.';
  let email = identifier.trim();
  if (!email.includes('@')) {
    const { data } = await client.from('pharmacy_users').select('email').ilike('username', identifier.trim()).maybeSingle();
    if (!data?.email) return { ok: false, error: GENERIC_ERROR };
    email = data.email;
  }
  const { data: authData, error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError || !authData?.user) return { ok: false, error: GENERIC_ERROR };
  const { data: profile, error: profileError } = await client.from('pharmacy_users').select('*').eq('auth_user_id', authData.user.id).maybeSingle();
  if (profileError || !profile) { await client.auth.signOut(); return { ok: false, error: 'Account not fully set up. Please contact your administrator.' }; }
  if (profile.status !== 'active') { await client.auth.signOut(); return { ok: false, error: 'This account has been deactivated. Please contact an Administrator.' }; }
  const now = new Date().toISOString();
  void client.from('pharmacy_users').update({ last_login: now }).eq('auth_user_id', authData.user.id);
  return { ok: true, user: rowToUser({ ...profile, last_login: now }) };
}

export async function getAuthenticatedProfile(): Promise<User | null> {
  const client = getSupabase(); if (!client) return null;
  const { data: sessionData } = await client.auth.getSession();
  const authUser = sessionData.session?.user; if (!authUser) return null;
  const { data: profile } = await client.from('pharmacy_users').select('*').eq('auth_user_id', authUser.id).maybeSingle();
  if (!profile || profile.status !== 'active') { await client.auth.signOut(); return null; }
  return rowToUser(profile);
}

export function onSupabaseAuthStateChange(callback: (user: User | null) => void): () => void {
  const client = getSupabase(); if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange(async (_event, session) => {
    if (!session?.user) { callback(null); return; }
    setTimeout(async () => callback(await getAuthenticatedProfile()), 0);
  });
  return () => data.subscription.unsubscribe();
}

export async function signUpInitialAdmin(): Promise<AuthResult> { return { ok: false, error: 'Public account creation is disabled. An administrator must provision this account.' }; }
export async function signOutSupabase(): Promise<void> { const client = getSupabase(); if (client) await client.auth.signOut(); }

export interface AdminUserInput { name: string; username: string; email: string; phone?: string; role: UserRole; password: string; licenseNumber?: string; }
export interface AdminUserUpdate { name?: string; email?: string; phone?: string; role?: UserRole; licenseNumber?: string; }

async function invokeAdminUserFunction(body: Record<string, unknown>): Promise<{ ok: boolean; user?: User; error?: string }> {
  const client = getSupabase();
  if (!client) return { ok: false, error: 'Supabase is not configured.' };
  const { data, error } = await client.functions.invoke('admin-user-provisioning', { body });
  if (error) {
    let message = error.message || 'User-management request failed.';
    try { const parsed = JSON.parse(await error.context?.text?.()); if (parsed?.error) message = parsed.error; } catch { /* ignore */ }
    return { ok: false, error: message };
  }
  if (!data?.ok) return { ok: false, error: data?.error || 'User-management request failed.' };
  return { ok: true, user: data.user ? rowToUser(data.user) : undefined };
}

export async function createManagedUser(input: AdminUserInput) { return invokeAdminUserFunction({ action: 'create', ...input }); }
export async function updateManagedUser(userId: string, input: AdminUserUpdate) { return invokeAdminUserFunction({ action: 'update', userId, ...input }); }
export async function setManagedUserStatus(userId: string, status: 'active' | 'inactive') { return invokeAdminUserFunction({ action: 'set_status', userId, status }); }
export async function resetManagedUserPassword(userId: string, password: string) { return invokeAdminUserFunction({ action: 'reset_password', userId, password }); }
export async function deleteManagedUser(userId: string) { return invokeAdminUserFunction({ action: 'delete', userId }); }

function patientToRow(p: Patient) { return { id: p.id, full_name: p.fullName, dob: p.dob, gender: p.gender, phone: p.phone, email: p.email || null, address: p.address || null, allergies: p.allergies || [], insurance_provider: p.insuranceProvider || null, insurance_policy_number: p.insurancePolicyNumber || null }; }
export async function upsertPatientToSupabase(patient: Patient): Promise<boolean> { const client = getSupabase(); if (!client) return false; const { error } = await client.from('patients').upsert(patientToRow(patient)); return !error; }
export async function insertConsultationToSupabase(consultation: Consultation): Promise<boolean> { const client = getSupabase(); if (!client) return false; const { error } = await client.from('consultations').insert({ id: consultation.id, patient_id: consultation.patientId, patient_name: consultation.patientName, clinician_id: consultation.clinicianId, clinician_name: consultation.clinicianName, date: consultation.date, symptoms: consultation.symptoms, diagnosis: consultation.diagnosis, notes: consultation.notes || null, vitals: consultation.vitals || {} }); return !error; }
export async function upsertClinicalTestToSupabase(test: ClinicalTest): Promise<boolean> { const client = getSupabase(); if (!client) return false; const { error } = await client.from('clinical_tests').upsert({ id: test.id, consultation_id: test.consultationId || null, patient_id: test.patientId, patient_name: test.patientName || null, test_name: test.testName, category: test.category, status: test.status, results: test.results || null, reference_ranges: test.referenceRanges || null, notes: test.notes || null, requested_by: test.requestedBy, conducted_at: test.conductedAt || null }); return !error; }
export async function upsertPrescriptionToSupabase(rx: Prescription): Promise<boolean> { const client = getSupabase(); if (!client) return false; const { error } = await client.from('prescriptions').upsert({ id: rx.id, rx_number: rx.rxNumber, barcode: rx.barcode, patient_name: rx.patientName, patient_dob: rx.patientDOB, patient_phone: rx.patientPhone, doctor_name: rx.doctorName, doctor_license: rx.doctorLicense, doctor_clinic: rx.doctorClinic, medication_id: rx.medicationId || null, medication_name: rx.medicationName, dosage_instructions: rx.dosageInstructions || '', quantity_prescribed: rx.quantityPrescribed || 0, quantity_dispensed_so_far: rx.quantityDispensedSoFar || 0, refills_allowed: rx.refillsAllowed || 0, refills_remaining: rx.refillsRemaining || 0, date_issued: rx.dateIssued, expiry_date: rx.expiryDate, status: rx.status, insurance_provider: rx.insuranceProvider || null, insurance_co_pay_rate: rx.insuranceCoPayRate || 0 }); return !error; }
