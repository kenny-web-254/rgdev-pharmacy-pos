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
        const detail = error?.message || (data ? JSON.stringify(data) : 'No response from complete_sale RPC');
        console.error('Atomic sale synchronization failed:', detail);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Atomic sale synchronization failed:', e instanceof Error ? e.message : String(e));
      return false;
    }
  },
};'''
new, count = re.subn(pattern, replacement, s, count=1)
if count == 1:
    p.write_text(new)
    print('Atomic sale RPC integration applied.')
elif "client.rpc('complete_sale'" in s:
    print('Atomic sale RPC integration already present; source left unchanged.')
else:
    raise SystemExit('Could not locate pushTransactionToCloud')

# Apply the second-stage transaction-flow hardening in the same build step.
transaction_flow = Path('scripts/production_sale_transaction_flow.py')
if not transaction_flow.exists():
    raise SystemExit('Missing production_sale_transaction_flow.py')
exec(compile(transaction_flow.read_text(), str(transaction_flow), 'exec'), {'__name__': '__main__'})
