from pathlib import Path
import re


def replace_required(text, pattern, replacement, label, flags=re.S):
    new, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'REQUIRED TRANSFORM FAILED: {label}')
    return new

p = Path('src/App.tsx')
a = p.read_text()

# production_hardening.py runs first and has already converted the auth import.
a = replace_required(
    a,
    r"import \{ supabaseConfig, signOutSupabase, getAuthenticatedProfile, onSupabaseAuthStateChange \} from './services/supabase';",
    "import { supabaseConfig, signOutSupabase, getAuthenticatedProfile, onSupabaseAuthStateChange, pullSaleTransactionsFromSupabase, pullReceiptSettingsFromSupabase } from './services/supabase';",
    'cloud sync imports',
    flags=0,
)

hydration_block = """  // Cloud hydration: Supabase is authoritative for operational data.
  // Browser storage may retain carts/drafts for continuity, but it never wins over the server.
  useEffect(() => {
    if (!currentUser || !supabaseConfig.isConfigured()) return;
    let cancelled = false;
    (async () => {
      const [cloudMeds, cloudRx, cloudTests, cloudSales, cloudReceiptSettings] = await Promise.all([
        storageService.pullMedicationsFromCloud(),
        storageService.pullPrescriptionsFromCloud(),
        storageService.pullTestsFromCloud(),
        pullSaleTransactionsFromSupabase(),
        pullReceiptSettingsFromSupabase(),
      ]);
      if (cancelled) return;
      if (cloudMeds) {
        setMedications(cloudMeds);
        storageService.saveMedications(cloudMeds);
      }
      if (cloudRx) {
        setPrescriptions(cloudRx);
        storageService.savePrescriptions(cloudRx);
      }
      if (cloudTests) {
        setTests(cloudTests);
        storageService.saveTests(cloudTests);
      }
      if (cloudSales) {
        setTransactions(cloudSales);
        storageService.saveTransactions(cloudSales);
      }
      if (cloudReceiptSettings) {
        setReceiptSettings(cloudReceiptSettings);
        storageService.saveReceiptSettings(cloudReceiptSettings);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

"""

# First replace the legacy hydration block, but do not consume the realtime block.
if 'Cloud hydration: Supabase is authoritative for operational data.' not in a:
    a = replace_required(
        a,
        r"  // Cloud hydration: when Supabase is configured,[\s\S]*?\n\s*// Default landing tab per role",
        hydration_block + "  // Default landing tab per role",
        'authoritative cloud hydration',
    )

realtime_block = """  // Realtime sync: a database event only invalidates this device's cache.
  // The callback always re-reads authoritative rows from Supabase before updating UI state.
  useRealtimeSync({
    enabled: !!currentUser,
    onMedicationsChanged: async () => {
      const cloudMeds = await storageService.pullMedicationsFromCloud();
      if (cloudMeds) {
        setMedications(cloudMeds);
        storageService.saveMedications(cloudMeds);
      }
    },
    onPrescriptionsChanged: async () => {
      const cloudRx = await storageService.pullPrescriptionsFromCloud();
      if (cloudRx) {
        setPrescriptions(cloudRx);
        storageService.savePrescriptions(cloudRx);
      }
    },
    onTestsChanged: async () => {
      const cloudTests = await storageService.pullTestsFromCloud();
      if (cloudTests) {
        setTests(cloudTests);
        storageService.saveTests(cloudTests);
      }
    },
    onSalesChanged: async () => {
      const cloudSales = await pullSaleTransactionsFromSupabase();
      if (cloudSales) {
        setTransactions(cloudSales);
        storageService.saveTransactions(cloudSales);
      }
    },
    onReceiptSettingsChanged: async () => {
      const settings = await pullReceiptSettingsFromSupabase();
      if (settings) {
        setReceiptSettings(settings);
        storageService.saveReceiptSettings(settings);
      }
    },
  });

"""

# If the earlier hydration transform swallowed the legacy realtime block, insert the authoritative block
# immediately before the default-landing effect. Otherwise replace the legacy block in place.
if 'onSalesChanged: async' not in a:
    if '// Realtime sync:' in a:
        a = replace_required(
            a,
            r"  // Realtime sync:[\s\S]*?\n\s*// Default landing tab per role",
            realtime_block + "  // Default landing tab per role",
            'authoritative realtime callbacks',
        )
    else:
        a = replace_required(
            a,
            r"  // Default landing tab per role",
            realtime_block + "  // Default landing tab per role",
            'authoritative realtime insertion',
        )

p.write_text(a)
print('Authoritative cloud sales/receipt hydration and realtime refresh applied.')
