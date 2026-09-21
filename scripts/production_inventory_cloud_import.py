from pathlib import Path
import re

path = Path('src/components/InventoryExcelImport.tsx')
s = path.read_text()

if "import { getSupabase } from '../services/supabase';" not in s:
    anchor = "import type { Medication, MedicationCategory } from '../types';"
    if anchor not in s:
        raise SystemExit('REQUIRED TRANSFORM FAILED: inventory cloud import import anchor')
    s = s.replace(anchor, anchor + "\nimport { getSupabase } from '../services/supabase';", 1)

# Keep the preview purely local, but make the final commit server-authoritative.
# The RPC receives the computed final stock as REPLACE so the exact previewed
# result is committed atomically and cannot be partially written.
pattern = re.compile(r"  const commit = \(\) => \{.*?\n  \};\n\n  return <div", re.S)
replacement = '''  const commit = async () => {
    if (!validRows.length) return;
    if (!getSupabase()) {
      setError('Supabase is not configured. Inventory import was not saved.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const rows = validRows.map(({ medication }) => ({
        id: medication.id,
        name: medication.name,
        genericName: medication.genericName,
        dosage: medication.dosage,
        form: medication.form,
        category: medication.category,
        isPrescriptionRequired: medication.isPrescriptionRequired,
        barcode: medication.barcode,
        price: medication.price,
        costPrice: medication.costPrice,
        quantity: medication.stock,
        stockAction: 'REPLACE',
        minStockLevel: medication.minStockLevel,
        batchNumber: medication.batchNumber,
        expiryDate: medication.expiryDate,
        manufacturer: medication.manufacturer,
        requiresRefrigeration: medication.requiresRefrigeration,
        packSize: medication.packSize ?? 1,
        stockUnit: medication.stockUnit ?? 'Unit',
        saleUnit: medication.saleUnit ?? medication.stockUnit ?? 'Unit',
        canSellIndividually: medication.canSellIndividually ?? false,
        unitPrice: medication.unitPrice ?? null,
        unitCost: medication.unitCost ?? null,
      }));

      const { data, error: rpcError } = await getSupabase()!.rpc('import_inventory', { p_rows: rows });
      if (rpcError) throw rpcError;
      if (!data?.ok) throw new Error('Supabase did not confirm the inventory import.');

      // Only update the local UI/cache after the server transaction succeeds.
      validRows.forEach(({ medication, action }) => {
        if (action === 'CREATE') onAddMedication(medication);
        else onUpdateMedication(medication);
      });

      setDone({ created: Number(data.created ?? 0), updated: Number(data.updated ?? 0), skipped: preview.length - validRows.length });
      setPreview([]);
    } catch (e) {
      setError(`Inventory import was not saved. No local success state was applied. ${e instanceof Error ? e.message : 'Unknown server error.'}`);
    } finally {
      setBusy(false);
    }
  };

  return <div'''

if not pattern.search(s):
    raise SystemExit('REQUIRED TRANSFORM FAILED: inventory cloud import commit anchor')
s = pattern.sub(replacement, s, count=1)

# Prevent stale browser/PWA bundles from silently serving the old importer.
if "Inventory import was not saved." not in s:
    raise SystemExit('REQUIRED TRANSFORM FAILED: inventory cloud import verification')

path.write_text(s)
