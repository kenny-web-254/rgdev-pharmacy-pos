from pathlib import Path
import re
import sys


ROOT = Path('.')
src = ROOT / 'src'

if not src.exists():
    raise SystemExit('PRODUCTION VERIFY FAILED: src directory is missing')

files = list(src.rglob('*.ts')) + list(src.rglob('*.tsx'))
text = '\n'.join(p.read_text(encoding='utf-8') for p in files)

forbidden = [
    (r"DEMO_USERS", 'demo user authority remains in production source'),
    (r"pharmacy123", 'demo/default password remains in production source'),
    (r"auth\.signUp", 'public client-side account creation remains enabled in source'),
    (r"SUPABASE_SERVICE_ROLE_KEY", 'service-role key name is exposed to frontend source'),
    (r"VITE_SUPABASE_SERVICE_ROLE", 'service-role Vite environment variable is exposed'),
]

for pattern, message in forbidden:
    if re.search(pattern, text, flags=re.I):
        raise SystemExit(f'PRODUCTION VERIFY FAILED: {message}')

# The production sale path must use the atomic server-side operation.
if "rpc('complete_sale'" not in text and 'rpc("complete_sale"' not in text:
    raise SystemExit('PRODUCTION VERIFY FAILED: atomic complete_sale RPC is not present')

# Realtime must include the shared operational tables used by the POS.
realtime_file = src / 'hooks' / 'useRealtimeSync.ts'
if not realtime_file.exists():
    raise SystemExit('PRODUCTION VERIFY FAILED: realtime hook is missing')
realtime = realtime_file.read_text(encoding='utf-8')
for table in ('medications', 'prescriptions', 'tests', 'sale_transactions', 'receipt_settings', 'pharmacy_users'):
    if f"'{table}'" not in realtime:
        raise SystemExit(f'PRODUCTION VERIFY FAILED: realtime subscription missing {table}')

# A direct sale insert would bypass the atomic stock transaction.
if re.search(r"from\(['\"]sale_transactions['\"]\)\.insert", text):
    raise SystemExit('PRODUCTION VERIFY FAILED: direct sale_transactions INSERT detected')

print(f'Production verification passed across {len(files)} frontend source files.')
