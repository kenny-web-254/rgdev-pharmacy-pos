from pathlib import Path
import re

p = Path('src/App.tsx')
a = p.read_text(encoding='utf-8')

old_import = "import { supabaseConfig, signOutSupabase, getAuthenticatedProfile, onSupabaseAuthStateChange, pullSaleTransactionsFromSupabase, pullReceiptSettingsFromSupabase } from './services/supabase';"
new_import = "import { supabaseConfig, signOutSupabase, getAuthenticatedProfile, onSupabaseAuthStateChange, pullSaleTransactionsFromSupabase, pullReceiptSettingsFromSupabase, listManagedUsers } from './services/supabase';"
if old_import in a and 'listManagedUsers' not in old_import:
    a = a.replace(old_import, new_import, 1)

if 'onUsersChanged:' not in a:
    marker = "    onReceiptSettingsChanged: async () => {\n      const settings = await pullReceiptSettingsFromSupabase();\n      if (settings) {\n        setReceiptSettings(settings);\n        storageService.saveReceiptSettings(settings);\n      }\n    },\n  });"
    replacement = "    onReceiptSettingsChanged: async () => {\n      const settings = await pullReceiptSettingsFromSupabase();\n      if (settings) {\n        setReceiptSettings(settings);\n        storageService.saveReceiptSettings(settings);\n      }\n    },\n    onUsersChanged: async () => {\n      const result = await listManagedUsers();\n      if (result.ok) setUsers(result.users);\n    },\n  });"
    if marker not in a:
        raise SystemExit('REQUIRED TRANSFORM FAILED: admin realtime callback insertion point')
    a = a.replace(marker, replacement, 1)

p.write_text(a, encoding='utf-8')
print('Admin user realtime refresh applied.')
