from pathlib import Path

# The production hardening transform intentionally removes the legacy mockData
# import. Receipt settings are configuration, not demo business data, so they
# must come from the real production defaults module instead.
storage_path = Path('src/services/storage.ts')
s = storage_path.read_text(encoding='utf-8')

receipt_import = "import { INITIAL_RECEIPT_SETTINGS } from '../data/defaultReceiptSettings';"
if receipt_import not in s:
    marker = "import { getSupabase } from './supabase';"
    if marker not in s:
        raise SystemExit('REQUIRED TRANSFORM FAILED: storage Supabase import marker not found')
    s = s.replace(marker, f"{receipt_import}\n{marker}", 1)

# Never allow the old bootstrap variable/import to survive the production
# authentication transform. Public self-registration is disabled.
s = s.replace("import { supabaseConfig, checkBootstrapAvailable, signOutSupabase } from './services/supabase';", "import { supabaseConfig, signOutSupabase, getAuthenticatedProfile, onSupabaseAuthStateChange } from './services/supabase';")
s = s.replace("          isBootstrapAvailable={isBootstrapAvailable}\n", "")

storage_path.write_text(s, encoding='utf-8')

# Fail fast if production source still references the removed demo module.
for path in Path('src').rglob('*.ts'):
    text = path.read_text(encoding='utf-8')
    if "../data/mockData" in text or "./data/mockData" in text:
        raise SystemExit(f'PRODUCTION SAFETY FAILED: legacy mockData import remains in {path}')
for path in Path('src').rglob('*.tsx'):
    text = path.read_text(encoding='utf-8')
    if "../data/mockData" in text or "./data/mockData" in text:
        raise SystemExit(f'PRODUCTION SAFETY FAILED: legacy mockData import remains in {path}')

print('Production runtime safety checks completed successfully.')
