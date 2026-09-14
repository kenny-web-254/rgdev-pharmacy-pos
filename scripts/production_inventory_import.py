from pathlib import Path
import re

path = Path('src/components/InventoryManager.tsx')
s = path.read_text()

if "InventoryExcelImport" not in s:
    marker = "import { storageService } from '../services/storage';"
    if marker not in s:
        raise SystemExit('REQUIRED TRANSFORM FAILED: inventory import import anchor')
    s = s.replace(marker, marker + "\nimport { InventoryExcelImport } from './InventoryExcelImport';", 1)

if 'isExcelImportOpen' not in s:
    marker = "  const [isAddModalOpen, setIsAddModalOpen] = useState(false);"
    if marker not in s:
        raise SystemExit('REQUIRED TRANSFORM FAILED: inventory import state anchor')
    s = s.replace(marker, marker + "\n  const [isExcelImportOpen, setIsExcelImportOpen] = useState(false);", 1)

if 'Import Excel' not in s:
    marker = "      {/* Header controls */}"
    if marker not in s:
        raise SystemExit('REQUIRED TRANSFORM FAILED: inventory import header anchor')
    replacement = """      {isExcelImportOpen && isAdmin && (\n        <InventoryExcelImport\n          medications={medications}\n          onAddMedication={onAddMedication}\n          onUpdateMedication={onUpdateMedication}\n          onClose={() => setIsExcelImportOpen(false)}\n        />\n      )}\n\n      {/* Header controls */}\n      {isAdmin && (\n        <div className=\"flex justify-end\">\n          <button\n            type=\"button\"\n            onClick={() => setIsExcelImportOpen(true)}\n            className=\"inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm font-semibold hover:bg-emerald-100 transition\"\n          >\n            Import Excel Inventory\n          </button>\n        </div>\n      )}"""
    s = s.replace(marker, replacement, 1)

path.write_text(s)
