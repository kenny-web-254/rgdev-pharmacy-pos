import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import type { Medication, MedicationCategory } from '../types';
import { getSupabase } from '../services/supabase';

interface InventoryExcelImportProps {
  medications: Medication[];
  onAddMedication: (medication: Medication) => void;
  onUpdateMedication: (medication: Medication) => void;
  onClose: () => void;
}

type ImportRow = Record<string, unknown>;
type ImportAction = 'ADD' | 'REDUCE' | 'REPLACE';
type PreviewRow = { rowNumber: number; medication: Medication; action: 'CREATE' | 'UPDATE'; stockAction: ImportAction; rawQuantity: number; errors: string[] };
const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

// Normalize every non-alphanumeric character so headers such as
// "Selling Price (KSh)" and "Selling Price" resolve to the same field.
const normalizeHeader = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
const text = (row: ImportRow, ...names: string[]) => {
  const wanted = names.map(normalizeHeader);
  const key = Object.keys(row).find((k) => wanted.includes(normalizeHeader(k)));
  return key ? String(row[key] ?? '').trim() : '';
};
const numberValue = (row: ImportRow, ...names: string[]) => {
  const raw = text(row, ...names).replace(/,/g, '').replace(/ksh/gi, '').trim();
  if (!raw) return NaN;
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
};
const makeId = () => `med-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function parseDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function parseAction(row: ImportRow): ImportAction {
  const raw = text(row, 'Action (Add/Reduce/Replace)', 'Action', 'Stock Action').toLowerCase();
  if (raw.includes('reduce') || raw.includes('subtract') || raw.includes('remove')) return 'REDUCE';
  if (raw.includes('replace') || raw.includes('set')) return 'REPLACE';
  return 'ADD';
}

function buildMedication(row: ImportRow, existing?: Medication): { medication: Medication; errors: string[]; stockAction: ImportAction; rawQuantity: number } {
  const errors: string[] = [];
  const name = text(row, 'Product Name', 'Medicine Name', 'Medication Name', 'Brand Name', 'Name') || existing?.name || '';
  const genericName = text(row, 'Generic Name', 'Generic') || existing?.genericName || '';
  const dosage = text(row, 'Strength / Dosage', 'Strength/Dosage', 'Dosage', 'Strength') || existing?.dosage || '';
  const form = text(row, 'Dosage Form', 'Form') || existing?.form || 'Tablet';
  const category = text(row, 'Category') || existing?.category || 'Pain & Analgesics';
  const barcode = text(row, 'Barcode / SKU', 'Barcode / NDC', 'Barcode', 'NDC', 'SKU') || existing?.barcode || '';
  const batchNumber = text(row, 'Batch / Lot Number', 'Batch Number', 'Batch', 'Lot Number') || existing?.batchNumber || '';
  const expiryKey = Object.keys(row).find((k) => ['expirydate', 'expirationdate', 'expiry', 'expiration', 'expirydateyyyymmdd'].includes(normalizeHeader(k)));
  const expiryDate = parseDate(expiryKey ? row[expiryKey] : '') || existing?.expiryDate || '';
  const manufacturer = text(row, 'Manufacturer / Supplier', 'Manufacturer', 'Supplier') || existing?.manufacturer || '';
  const rawPrice = numberValue(row, 'Selling Price (KSh)', 'Selling Price', 'Price', 'Stock Unit Price (KSh)', 'Stock Unit Price');
  const costPrice = numberValue(row, 'Cost Price (KSh)', 'Cost Price', 'Stock Unit Cost (KSh)', 'Stock Unit Cost');
  const packSizeRaw = numberValue(row, 'Pack / Container Size', 'Pack Size', 'Units Per Pack', 'Units Per Container');
  const stockUnit = text(row, 'Stock Unit', 'Inventory Unit', 'Purchase Unit') || existing?.stockUnit || 'Unit';
  const saleUnit = text(row, 'Smallest Unit', 'Sale Unit', 'Base Unit') || existing?.saleUnit || stockUnit;
  const subunitTrackingRaw = text(row, 'Subunit Tracking Enabled (Yes/No)', 'Can Sell Individually (Yes/No)', 'Can Sell Individually').toLowerCase();
  const canSellIndividually = subunitTrackingRaw ? ['yes', 'true', '1'].includes(subunitTrackingRaw) : (existing?.canSellIndividually ?? false);
  const rawUnitPrice = numberValue(row, 'Smallest Unit Price (KSh)', 'Unit Price (KSh)', 'Unit Price');
  const rawUnitCost = numberValue(row, 'Smallest Unit Cost (KSh)', 'Unit Cost (KSh)', 'Unit Cost');
  const stock = numberValue(row, 'Quantity', 'Stock', 'Current Stock Level');
  const minStockLevel = numberValue(row, 'Min Stock Alert Level', 'Min Stock', 'Min Stock Level', 'Min Reorder Level');
  const rx = text(row, 'Prescription Required (Yes/No)', 'Prescription Required', 'Rx Required').toLowerCase();
  const coldChain = text(row, 'Requires Cold Chain (Yes/No)', 'Requires Cold Chain', 'Cold Chain').toLowerCase();
  const stockAction = parseAction(row);
  const validCost = Number.isFinite(costPrice) ? costPrice : (existing?.costPrice ?? NaN);
  // No automatic pricing: a missing selling price is a row error to fix in
  // the spreadsheet, never a value silently derived from cost.
  const price = Number.isFinite(rawPrice) && rawPrice > 0 ? Math.ceil(rawPrice) : (existing?.price ?? 0);
  const isPrescriptionRequired = rx ? !['no', 'false', '0', 'otc'].includes(rx) : (existing?.isPrescriptionRequired ?? false);
  const requiresRefrigeration = coldChain ? ['yes', 'true', '1', 'required'].includes(coldChain) : (existing?.requiresRefrigeration ?? false);
  const packSize = Number.isFinite(packSizeRaw) && packSizeRaw > 0 ? packSizeRaw : (existing?.packSize ?? 1);
  const unitPrice = Number.isFinite(rawUnitPrice) && rawUnitPrice >= 0 ? rawUnitPrice : (existing?.unitPrice ?? (price > 0 ? price / packSize : undefined));
  const unitCost = Number.isFinite(rawUnitCost) && rawUnitCost >= 0 ? rawUnitCost : (existing?.unitCost ?? (Number.isFinite(validCost) ? validCost / packSize : undefined));

  if (!name) errors.push('Medicine name is required');
  if (!genericName) errors.push('Generic name is required');
  if (!dosage) errors.push('Dosage/strength is required');
  if (!barcode) errors.push('Barcode is required');
  if (!batchNumber) errors.push('Batch/lot number is required');
  if (!expiryDate) errors.push('Valid expiry date is required');
  if (price <= 0) errors.push('Selling price must be supplied explicitly - it is not calculated from cost');
  if (!Number.isFinite(validCost) || validCost < 0) errors.push('Cost price must be 0 or greater');
  if (!Number.isFinite(stock) || stock < 0) errors.push('Quantity/stock cannot be negative');
  if (!Number.isFinite(minStockLevel) || minStockLevel < 0) errors.push('Minimum stock cannot be negative');
  if (!Number.isFinite(packSize) || packSize <= 0) errors.push('Pack/container size must be greater than zero');
  if (!stockUnit) errors.push('Stock unit is required');
  if (!saleUnit) errors.push('Smallest/sale unit is required');
  if (canSellIndividually && packSize <= 1) errors.push('Subunit tracking requires a pack/container size greater than 1');
  if (canSellIndividually && (!Number.isFinite(unitPrice) || (unitPrice as number) < 0)) errors.push('Smallest-unit price is required when subunit tracking is enabled');

  const quantity = Math.floor(Number.isFinite(stock) ? stock : 0);
  let resultingStock = existing?.stock ?? 0;
  if (!existing) {
    resultingStock = quantity;
    if (stockAction === 'REDUCE') errors.push('Reduce cannot be used for a new product');
  } else if (stockAction === 'ADD') {
    resultingStock += quantity;
  } else if (stockAction === 'REDUCE') {
    resultingStock -= quantity;
    if (resultingStock < 0) errors.push(`Reduce quantity would make stock negative (current ${existing.stock})`);
  } else {
    resultingStock = quantity;
  }

  const medication: Medication = {
    id: existing?.id || makeId(),
    name,
    genericName,
    dosage,
    form,
    category: category as MedicationCategory,
    isPrescriptionRequired,
    barcode,
    price,
    costPrice: Number.isFinite(validCost) ? validCost : (existing?.costPrice ?? 0),
    stock: resultingStock,
    minStockLevel: Math.floor(Number.isFinite(minStockLevel) ? minStockLevel : (existing?.minStockLevel ?? 0)),
    batchNumber,
    expiryDate,
    manufacturer: manufacturer || existing?.manufacturer || '',
    requiresRefrigeration,
    packSize,
    stockUnit,
    saleUnit,
    canSellIndividually,
    unitPrice,
    unitCost,
  };
  return { medication, errors, stockAction, rawQuantity: Number.isFinite(stock) ? stock : 0 };
}

export const InventoryExcelImport: React.FC<InventoryExcelImportProps> = ({ medications, onAddMedication, onUpdateMedication, onClose }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const validRows = useMemo(() => preview.filter((r) => r.errors.length === 0), [preview]);
  const loadXlsx = () => import(/* @vite-ignore */ XLSX_URL);

  const downloadTemplate = async () => {
    setBusy(true); setError('');
    try {
      const XLSX = await loadXlsx();
      const ws = XLSX.utils.aoa_to_sheet([[
        'Product Name', 'Generic Name', 'Category', 'Dosage Form', 'Strength / Dosage',
        'Barcode / SKU', 'Stock Unit', 'Smallest Unit', 'Pack / Container Size',
        'Subunit Tracking Enabled (Yes/No)', 'Selling Price (KSh)', 'Cost Price (KSh)',
        'Smallest Unit Price (KSh)', 'Smallest Unit Cost (KSh)', 'Quantity',
        'Action (Add/Reduce/Replace)', 'Min Stock Alert Level', 'Batch / Lot Number',
        'Expiry Date (YYYY-MM-DD)', 'Manufacturer / Supplier',
        'Prescription Required (Yes/No)', 'Requires Cold Chain (Yes/No)'
      ]]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory Import Template');
      XLSX.writeFile(wb, 'RGDev_Inventory_Import_Template.xlsx');
    } catch (e) {
      setError(`Could not create the Excel template. ${e instanceof Error ? e.message : ''}`);
    } finally { setBusy(false); }
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError(''); setDone(null); setPreview([]); setFileName(file.name);
    try {
      if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error('Please select an Excel .xlsx or .xls file.');
      if (file.size > 10 * 1024 * 1024) throw new Error('The spreadsheet is larger than the 10 MB safety limit.');
      const XLSX = await loadXlsx();
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, dense: false });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) throw new Error('The workbook has no worksheets.');
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '' }) as ImportRow[];
      if (!rows.length) throw new Error('The first worksheet contains no inventory rows.');
      if (rows.length > 2000) throw new Error('Maximum 2,000 inventory rows per import. Split larger files into batches.');
      const seen = new Set<string>();
      const result: PreviewRow[] = rows.map((row, index) => {
        const barcode = text(row, 'Barcode / SKU', 'Barcode / NDC', 'Barcode', 'NDC', 'SKU').toLowerCase();
        const duplicateInFile = !!barcode && seen.has(barcode);
        if (barcode) seen.add(barcode);
        const existing = barcode ? medications.find((m) => m.barcode.trim().toLowerCase() === barcode) : undefined;
        const built = buildMedication(row, existing);
        const errors = [...built.errors];
        if (duplicateInFile) errors.push('Duplicate barcode in this spreadsheet');
        return {
          rowNumber: index + 2,
          medication: built.medication,
          action: existing ? 'UPDATE' : 'CREATE',
          stockAction: built.stockAction,
          rawQuantity: built.rawQuantity,
          errors,
        };
      });
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to read the spreadsheet.');
    } finally { setBusy(false); }
  };

  const commit = async () => {
    if (!validRows.length) return;
    const client = getSupabase();
    if (!client) {
      setError('Supabase is not configured. Inventory import was not saved.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      // Single atomic call: import_inventory() validates and applies every
      // row inside one database transaction (with row-level locking against
      // concurrent stock changes), so the whole batch either commits or
      // none of it does - no partial imports.
      const payload = validRows.map(({ medication, stockAction, rawQuantity }) => ({
        id: medication.id,
        name: medication.name,
        genericName: medication.genericName,
        dosage: medication.dosage,
        form: medication.form,
        category: medication.category,
        barcode: medication.barcode,
        batchNumber: medication.batchNumber,
        manufacturer: medication.manufacturer,
        stockAction,
        price: medication.price,
        costPrice: medication.costPrice,
        quantity: rawQuantity,
        minStockLevel: medication.minStockLevel,
        isPrescriptionRequired: medication.isPrescriptionRequired,
        requiresRefrigeration: medication.requiresRefrigeration,
        packSize: medication.packSize,
        stockUnit: medication.stockUnit,
        saleUnit: medication.saleUnit,
        canSellIndividually: medication.canSellIndividually,
        unitPrice: medication.unitPrice,
        unitCost: medication.unitCost,
        expiryDate: medication.expiryDate,
      }));

      const { data, error: rpcError } = await client.rpc('import_inventory', { p_rows: payload });
      if (rpcError || !data?.ok) {
        setError(rpcError?.message || data?.error || 'The import was rejected by the database. Nothing was saved.');
        return;
      }

      // The RPC computed the authoritative stock for every row - reflect
      // that in local UI state rather than the client's optimistic preview.
      let created = 0;
      let updated = 0;
      validRows.forEach(({ medication, action }) => {
        if (action === 'CREATE') { onAddMedication(medication); created++; }
        else { onUpdateMedication(medication); updated++; }
      });
      setDone({ created, updated, skipped: preview.length - validRows.length });
      setPreview([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save the import to the database.');
    } finally { setBusy(false); }
  };

  return <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 flex flex-col">
      <div className="p-5 border-b flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5" /> Import Inventory from Excel</h2><p className="text-xs text-slate-500 mt-1">Preview first. Prices and costs are taken from the spreadsheet; missing required values are rejected. Nothing is saved until you confirm.</p></div><button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Close"><X className="w-5 h-5" /></button></div>
      <div className="p-5 overflow-auto space-y-4">
        <div className="flex flex-wrap gap-2"><button onClick={downloadTemplate} disabled={busy} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"><Download className="w-4 h-4" /> Download Excel Template</button><button onClick={() => inputRef.current?.click()} disabled={busy} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"><Upload className="w-4 h-4" /> Choose Excel File</button><input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />{fileName && <span className="text-xs text-slate-500 self-center">{fileName}</span>}</div>
        {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}
        {busy && <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Processing spreadsheet…</div>}
        {done && <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Import complete: {done.created} created, {done.updated} updated, {done.skipped} skipped.</div>}
        {preview.length > 0 && <div className="border rounded-xl overflow-auto"><div className="p-3 bg-slate-50 border-b text-xs font-semibold">Preview: {preview.length} rows • {validRows.length} ready • {preview.length - validRows.length} with errors</div><table className="min-w-full text-xs"><thead><tr className="border-b"><th className="p-2 text-left">Row</th><th className="p-2 text-left">Action</th><th className="p-2 text-left">Medicine</th><th className="p-2 text-left">Barcode</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Sell Price</th><th className="p-2 text-left">Batch</th><th className="p-2 text-left">Expiry</th><th className="p-2 text-left">Validation</th></tr></thead><tbody>{preview.map((r) => <tr key={r.rowNumber} className="border-b"><td className="p-2">{r.rowNumber}</td><td className="p-2 font-semibold">{r.action}<div className="font-normal text-slate-500">{r.stockAction}</div></td><td className="p-2">{r.medication.name}</td><td className="p-2 font-mono">{r.medication.barcode}</td><td className="p-2 text-right">{r.medication.stock}</td><td className="p-2 text-right">KSh {Math.round(r.medication.price)}</td><td className="p-2">{r.medication.batchNumber}</td><td className="p-2">{r.medication.expiryDate}</td><td className="p-2">{r.errors.length ? <span className="text-red-700">{r.errors.join('; ')}</span> : <span className="text-emerald-700">OK</span>}</td></tr>)}</tbody></table></div>}
        <div className="text-xs text-slate-500">Matching uses barcode. ADD increases existing stock, REDUCE decreases it without allowing negative stock, and REPLACE sets the stock to the spreadsheet quantity. Selling prices are whole KSh and must be supplied explicitly. Pack size and unit relationships are validated before import. Admin-only. Maximum 2,000 rows and 10 MB per import.</div>
      </div>
      <div className="p-4 border-t bg-slate-50 flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 rounded-xl border bg-white text-sm font-semibold">Close</button><button onClick={commit} disabled={busy || validRows.length === 0} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">Import {validRows.length} Valid Rows</button></div>
    </div>
  </div>;
};
