from pathlib import Path

path = Path('src/components/InventoryManager.tsx')
s = path.read_text()

if 'InventoryExcelImport' not in s:
    raise SystemExit('REQUIRED TRANSFORM FAILED: InventoryExcelImport was not installed by production_inventory_import.py')

# Make the import action impossible to miss for an ADMIN. Place it directly beside Add Medication.
if 'id="import-inventory-excel-btn"' not in s:
    marker = '              <button\n                id="add-medication-btn"'
    if marker not in s:
        raise SystemExit('REQUIRED TRANSFORM FAILED: Add Medication button anchor')
    button = '''              <button\n                id="import-inventory-excel-btn"\n                type="button"\n                onClick={() => setIsExcelImportOpen(true)}\n                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer"\n              >\n                <FileSpreadsheet className="w-4 h-4" />\n                Import Stock Spreadsheet\n              </button>\n'''
    s = s.replace(marker, button + marker, 1)

# Ensure the icon import is present because the button is in this source file.
if '  FileSpreadsheet,' not in s:
    s = s.replace('  Filter,\n', '  Filter,\n  FileSpreadsheet,\n', 1)

path.write_text(s)
print('Inventory spreadsheet import UI verified and made prominent.')
