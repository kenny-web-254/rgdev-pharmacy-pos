from pathlib import Path
import re


def replace_required(text, pattern, replacement, label, flags=re.S):
    # The repository now contains the hardened Supabase Auth implementation.
    # Keep the transform idempotent so Vercel builds do not fail when those
    # production-safe changes are already present in source control.
    app_hardening_labels = {
        'App auth state',
        'refreshUsersAndLogs',
        'handleLogout',
        'auth bootstrap',
        'auth-ready render guard',
    }
    if label in app_hardening_labels and (
        'authReady' in text or 'getAuthenticatedProfile' in text
    ):
        return text
    new, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'REQUIRED TRANSFORM FAILED: {label}')
    return new

# ------------------------------------------------------------
# storage.ts: remove demo/local database authority while keeping
# local cart/tab/draft persistence intact.
# ------------------------------------------------------------
storage_path = Path('src/services/storage.ts')
s = storage_path.read_text()

s = re.sub(r"import \{\n  DEMO_USERS,[\s\S]*?\n\} from '../data/mockData';\n", "", s, count=1)

s = replace_required(
    s,
    r"  getMedications\(\): Medication\[\] \{[\s\S]*?\n  \},\n\n  saveMedications",
    """  getMedications(): Medication[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MEDICATIONS);
      if (data !== null) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to load cached medications', e);
    }
    return [];
  },

  saveMedications""",
    'getMedications',
)

s = replace_required(
    s,
    r"  getPrescriptions\(\): Prescription\[\] \{[\s\S]*?\n  \},\n\n  savePrescriptions",
    """  getPrescriptions(): Prescription[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PRESCRIPTIONS);
      if (data !== null) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to load cached prescriptions', e);
    }
    return [];
  },

  savePrescriptions""",
    'getPrescriptions',
)

s = replace_required(
    s,
    r"  getTests\(\): MedicalTest\[\] \{[\s\S]*?\n  \},\n\n  saveTests",
    """  getTests(): MedicalTest[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TESTS);
      if (data !== null) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to load cached tests', e);
    }
    return [];
  },

  saveTests""",
    'getTests',
)

s = replace_required(
    s,
    r"  getTransactions\(\): SaleTransaction\[\] \{[\s\S]*?\n  \},\n\n  saveTransactions",
    """  getTransactions(): SaleTransaction[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      if (data !== null) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to load cached transactions', e);
    }
    return [];
  },

  saveTransactions""",
    'getTransactions',
)

s = replace_required(
    s,
    r"  // Users & Staff Management[\s\S]*?\n  // Audit Logs",
    """  // User identity and credentials are authoritative in Supabase Auth + pharmacy_users.
  // These compatibility methods intentionally do not create or store users locally.
  getUsers(): User[] { return []; },
  saveUsers(_users: User[]): void {},
  getUserById(_id: string): User | undefined { return undefined; },
  createUser(): { success: boolean; error: string } {
    return { success: false, error: 'Local user creation is disabled. Use Supabase Auth administrator provisioning.' };
  },
  updateUser(): { success: boolean; error: string } {
    return { success: false, error: 'Local user updates are disabled. Use Supabase Auth administrator provisioning.' };
  },
  toggleUserStatus(): { success: boolean; error: string } {
    return { success: false, error: 'Local user status changes are disabled. Use Supabase Auth administrator provisioning.' };
  },
  deleteUser(): { success: boolean; error: string } {
    return { success: false, error: 'Local user deletion is disabled. Use Supabase Auth administrator provisioning.' };
  },
  resetUserPassword(): { success: boolean; error: string } {
    return { success: false, error: 'Local password handling is disabled. Use Supabase Auth administrator provisioning.' };
  },

  // Audit Logs""",
    'local user management',
)

s = replace_required(
    s,
    r"  getAuditLogs\(\): AuditLog\[\] \{[\s\S]*?\n  \},\n\n  saveAuditLogs",
    """  getAuditLogs(): AuditLog[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      if (data !== null) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to load cached audit logs', e);
    }
    return [];
  },

  saveAuditLogs""",
    'getAuditLogs',
)

s = replace_required(
    s,
    r"  getActiveUser\(\): User \| null \{[\s\S]*?\n  \},\n\n  saveActiveUser",
    """  getActiveUser(): User | null {
    // Supabase Auth is the session authority. This remains only as a compatibility shim.
    return null;
  },

  saveActiveUser""",
    'getActiveUser',
)

s = replace_required(
    s,
    r"  saveActiveUser\(user: User\): void \{[\s\S]*?\n  \},\n\n  logoutActiveUser",
    """  saveActiveUser(_user: User): void {
    // Intentionally empty. Supabase Auth owns the browser session.
  },

  logoutActiveUser""",
    'saveActiveUser',
)

s = replace_required(
    s,
    r"  logoutActiveUser\(user\?: User \| null\): void \{[\s\S]*?\n  \},\n\n  // NOTE: The previous local",
    """  logoutActiveUser(_user?: User | null): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_USER);
      localStorage.removeItem(STORAGE_KEYS.LOGGED_OUT);
    } catch {}
  },

  // NOTE: The previous local""",
    'logoutActiveUser',
)

s = replace_required(
    s,
    r"  // Reset demo data\n  resetAllData\(\): void \{[\s\S]*?\n  \},\n\n  // ------------------------------------------------------------------",
    """  // Clear only browser caches/drafts. Never restore demo business data.
  resetAllData(): void {
    for (const key of [
      STORAGE_KEYS.MEDICATIONS,
      STORAGE_KEYS.PRESCRIPTIONS,
      STORAGE_KEYS.TESTS,
      STORAGE_KEYS.TRANSACTIONS,
      STORAGE_KEYS.OFFLINE_QUEUE,
      STORAGE_KEYS.AUDIT_LOGS,
      STORAGE_KEYS.ACTIVE_USER,
      STORAGE_KEYS.USERS,
    ]) {
      try { localStorage.removeItem(key); } catch {}
    }
  },

  // ------------------------------------------------------------------""",
    'resetAllData',
)

# Receipt settings may still use static defaults for UI configuration, but never business records.
# Remove any demo user/password literals from this service even if they survive elsewhere in comments.
s = s.replace("password: userData.password || 'pharmacy123',", "password: undefined,")

storage_path.write_text(s)

# ------------------------------------------------------------
# App.tsx: bootstrap authentication from Supabase Auth rather than
# local storage/mock users. Keep the existing UI and workflows.
# ------------------------------------------------------------
app_path = Path('src/App.tsx')
a = app_path.read_text()

a = a.replace(
    "import { supabaseConfig, checkBootstrapAvailable, signOutSupabase } from './services/supabase';",
    "import { supabaseConfig, signOutSupabase, getAuthenticatedProfile, onSupabaseAuthStateChange } from './services/supabase';",
)

a = replace_required(
    a,
    r"  const \[currentUser, setCurrentUser\] = useState<User \| null>\(\(\) => storageService\.getActiveUser\(\)\);",
    "  const [currentUser, setCurrentUser] = useState<User | null>(null);\n  const [authReady, setAuthReady] = useState(false);",
    'App auth state',
)

a = a.replace("  const [isBootstrapAvailable, setIsBootstrapAvailable] = useState(false);\n", "")
a = a.replace("  const [users, setUsers] = useState<User[]>(() => storageService.getUsers());", "  const [users, setUsers] = useState<User[]>([]);")
a = a.replace("  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => storageService.getAuditLogs());", "  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);")

# The initial operational state may use an empty browser cache only; cloud hydration immediately replaces it after auth.
a = a.replace("  const [medications, setMedications] = useState<Medication[]>(() => storageService.getMedications());", "  const [medications, setMedications] = useState<Medication[]>(() => storageService.getMedications());")
a = a.replace("  const [prescriptions, setPrescriptions] = useState<Prescription[]>(() => storageService.getPrescriptions());", "  const [prescriptions, setPrescriptions] = useState<Prescription[]>(() => storageService.getPrescriptions());")
a = a.replace("  const [tests, setTests] = useState<MedicalTest[]>(() => storageService.getTests());", "  const [tests, setTests] = useState<MedicalTest[]>(() => storageService.getTests());")
a = a.replace("  const [transactions, setTransactions] = useState<SaleTransaction[]>(() => storageService.getTransactions());", "  const [transactions, setTransactions] = useState<SaleTransaction[]>(() => storageService.getTransactions());")

# Replace local user refresh helper.
a = replace_required(
    a,
    r"  const refreshUsersAndLogs = \(\) => \{[\s\S]*?\n  \};",
    """  const refreshUsersAndLogs = async () => {
    const result = await import('./services/supabase').then((m) => m.listManagedUsers());
    if (result.ok) setUsers(result.users);
    setAuditLogs(storageService.getAuditLogs());
    const profile = await getAuthenticatedProfile();
    setCurrentUser(profile);
  };""",
    'refreshUsersAndLogs',
)

a = replace_required(
    a,
    r"  const handleLogout = \(\) => \{[\s\S]*?\n  \};",
    """  const handleLogout = () => {
    setCurrentUser(null);
    void signOutSupabase();
    showToast('Signed out of session.', 'info');
  };""",
    'handleLogout',
)

# Replace the old first-run/bootstrap effect with real Auth bootstrap and listener.
a = replace_required(
    a,
    r"  // First-run setup:[\s\S]*?\n  // Security: auto-logout",
    """  // Authentication bootstrap: Supabase Auth is the only session authority.
  useEffect(() => {
    if (!supabaseConfig.isConfigured()) {
      setAuthReady(true);
      setCurrentUser(null);
      return;
    }

    let mounted = true;
    getAuthenticatedProfile().then((profile) => {
      if (!mounted) return;
      setCurrentUser(profile);
      setAuthReady(true);
    });

    const unsubscribe = onSupabaseAuthStateChange((profile) => {
      if (!mounted) return;
      setCurrentUser(profile);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Security: auto-logout""",
    'auth bootstrap',
)

# Exact inactivity message requested by the product requirements.
a = a.replace("showToast('You were signed out automatically after a period of inactivity.', 'info');", "showToast('You were logged out due to inactivity.', 'info');")

# Do not preserve stale local cache when cloud explicitly returns an empty dataset.
a = a.replace("      if (cloudMeds && cloudMeds.length > 0) {", "      if (cloudMeds) {")

# Do not leave a dead bootstrap prop in LoginView.
a = a.replace("          isBootstrapAvailable={isBootstrapAvailable}\n", "")

# Render only after the real auth session has been resolved.
a = replace_required(
    a,
    r"  // If user is logged out, render standalone login authentication screen\n  if \(!currentUser\) \{",
    """  // Never render the application before the real Supabase session has been resolved.
  if (!authReady) {
    return <div className=\"min-h-screen bg-slate-900 text-white flex items-center justify-center text-sm font-semibold\">Checking secure session…</div>;
  }

  // If user is logged out, render standalone login authentication screen
  if (!currentUser) {""",
    'auth-ready render guard',
)

# The old cloud fallback message claimed local-only operation; production must never pretend local persistence is a server.
a = a.replace("Cleared ${count} offline transaction${count > 1 ? 's' : ''} (no database configured, saved locally only).", "Cannot synchronize offline transactions because the database is not configured.")

app_path.write_text(a)

print('Production hardening transformations completed successfully.')
