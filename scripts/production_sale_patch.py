from pathlib import Path
import re

p = Path('src/services/storage.ts')
s = p.read_text()
pattern = r"  async pushTransactionToCloud\(t: SaleTransaction\): Promise<boolean> \{[\s\S]*?\n  \},\n\};"
replacement = '''  async pushTransactionToCloud(t: SaleTransaction): Promise<boolean> {
    const client = getSupabase();
    if (!client) return false;
    try {
      const { data, error } = await client.rpc('complete_sale', {
        p_transaction: transactionToRow(t),
      });
      if (error || !data?.ok) {
        console.error('Atomic sale synchronization failed', error?.message || data);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Atomic sale synchronization failed', e);
      return false;
    }
  },
};'''
new, count = re.subn(pattern, replacement, s, count=1)
if count != 1:
    raise SystemExit('Could not locate pushTransactionToCloud')
p.write_text(new)
print('Atomic sale RPC integration applied.')
