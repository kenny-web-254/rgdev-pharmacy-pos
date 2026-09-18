from pathlib import Path
import re


def replace_required(text, pattern, replacement, label, flags=re.S):
    new, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'REQUIRED TRANSFORM FAILED: {label}')
    return new

# The existing UI reset previously cleared only browser storage. That is unsafe
# for a shared cloud application because refresh would hydrate the old Supabase
# rows again. Make the reset operation server-authoritative.
storage_path = Path('src/services/storage.ts')
s = storage_path.read_text(encoding='utf-8')

if 'async resetBusinessDataFromCloud' not in s:
    marker = '  resetBusinessData(adminUser?: { id: string; name: string; role: string }): void {\n'
    if marker not in s:
        raise SystemExit('REQUIRED TRANSFORM FAILED: resetBusinessData anchor')
    method = '''  async resetBusinessDataFromCloud(): Promise<boolean> {
    const client = getSupabase();
    if (!client) return false;
    try {
      const { data, error } = await client.rpc('reset_business_data');
      if (error || !data?.ok) {
        console.error('Cloud business reset failed', error?.message || data);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Cloud business reset failed', e);
      return false;
    }
  },

'''
    s = s.replace(marker, method + marker, 1)

# A successful empty cloud inventory must be allowed to overwrite an old local cache.
# pull functions already return [] for a successful empty SELECT and null only on error.
storage_path.write_text(s, encoding='utf-8')

app_path = Path('src/App.tsx')
a = app_path.read_text(encoding='utf-8')

# Ensure the reset handler waits for the cloud transaction before clearing local UI state.
pattern = r"  // System Data Reset Handler \(Admin Only\)[\s\S]*?\n  const handleResetSystemData = \(\) => \{[\s\S]*?\n  \};"
match = re.search(pattern, a)
if not match:
    raise SystemExit('REQUIRED TRANSFORM FAILED: handleResetSystemData block')

old = match.group(0)
new = old.replace('const handleResetSystemData = () => {', 'const handleResetSystemData = async () => {', 1)
needle = "    storageService.resetBusinessData({"
if needle not in new:
    raise SystemExit('REQUIRED TRANSFORM FAILED: resetBusinessData call')
new = new.replace(
    needle,
    """    const cloudResetSucceeded = await storageService.resetBusinessDataFromCloud();
    if (!cloudResetSucceeded) {
      showToast('Reset failed: Supabase did not confirm the reset. No local data was cleared.', 'error');
      return;
    }

    storageService.resetBusinessData({""",
    1,
)

# Immediately reflect the authoritative empty server state in this browser.
reset_call_end = "    });"
idx = new.find(reset_call_end, new.find('storageService.resetBusinessData({'))
if idx == -1:
    raise SystemExit('REQUIRED TRANSFORM FAILED: reset call closing')
idx += len(reset_call_end)
new = new[:idx] + "\n    setMedications([]);\n    setPrescriptions([]);\n    setTests([]);\n    setTransactions([]);\n    setOfflineQueue([]);" + new[idx:]

a = a[:match.start()] + new + a[match.end():]

# Hydration must replace stale local inventory even when Supabase legitimately returns zero rows.
a = a.replace('if (cloudMeds && cloudMeds.length > 0) {', 'if (cloudMeds) {')

app_path.write_text(a, encoding='utf-8')
print('Cloud-authoritative inventory/business reset applied.')
