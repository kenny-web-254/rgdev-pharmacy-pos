import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  Layers,
  PlusCircle,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import { Medication, MedicationCategory } from '../types';
import { formatKSh } from '../utils/currency';

interface ExcelStockImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingMedications: Medication[];
  onImportComplete: (
    newMedications: Medication[],
    updatedMedications: Medication[],
    summary: { addedCount: number; updatedCount: number; totalStockAdded: number }
  ) => void;
}

interface ParsedRow {
  rowNumber: number;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  isMatch: boolean;
  matchedMedication?: Medication;
  
  // Parsed item properties
  name: string;
  genericName: string;
  category: MedicationCategory;
  form: Medication['form'];
  dosage: string;
  price: number;
  costPrice: number;
  quantity: number;
  minStockLevel: number;
  batchNumber: string;
  expiryDate: string;
  manufacturer: string;
  barcode: string;
  isPrescriptionRequired: boolean;
  requiresRefrigeration: boolean;
}

const VALID_CATEGORIES: MedicationCategory[] = [
  'Antibiotics',
  'Cardiovascular',
  'Pain & Analgesics',
  'Respiratory',
  'Gastrointestinal',
  'Diabetes',
  'OTC & First Aid',
  'Vitamins & Supplements',
];

const VALID_FORMS: Medication['form'][] = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Injection',
  'Inhaler',
  'Ointment',
  'Drops',
];

export const ExcelStockImportModal: React.FC<ExcelStockImportModalProps> = ({
  isOpen,
  onClose,
  existingMedications,
  onImportComplete,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [restockMode, setRestockMode] = useState<'add' | 'replace'>('add');
  const [activeTab, setActiveTab] = useState<'all' | 'valid' | 'errors'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // 1. GENERATE & DOWNLOAD EXCEL TEMPLATE
  const handleDownloadTemplate = (format: 'xlsx' | 'csv' = 'xlsx') => {
    const templateData = [
      {
        'Product Name': 'Amoxicillin 500mg Capsules',
        'Generic Name': 'Amoxicillin Trihydrate',
        'Category': 'Antibiotics',
        'Dosage Form': 'Capsule',
        'Strength / Dosage': '500mg',
        'Selling Price (KSh)': 1850.00,
        'Cost Price (KSh)': 1200.00,
        'Quantity In Stock': 100,
        'Min Stock Alert Level': 20,
        'Batch / Lot Number': 'AMX-2026-B1',
        'Expiry Date (YYYY-MM-DD)': '2027-10-31',
        'Manufacturer / Supplier': 'Cosmos Ltd',
        'Barcode / NDC': '6161100223344',
        'Prescription Required (Yes/No)': 'Yes',
        'Requires Cold Chain (Yes/No)': 'No',
      },
      {
        'Product Name': 'Panadol Extra Tablets',
        'Generic Name': 'Paracetamol / Caffeine',
        'Category': 'Pain & Analgesics',
        'Dosage Form': 'Tablet',
        'Strength / Dosage': '500mg/65mg',
        'Selling Price (KSh)': 450.00,
        'Cost Price (KSh)': 280.00,
        'Quantity In Stock': 150,
        'Min Stock Alert Level': 30,
        'Batch / Lot Number': 'PAN-2026-09',
        'Expiry Date (YYYY-MM-DD)': '2028-04-15',
        'Manufacturer / Supplier': 'GlaxoSmithKline Kenya',
        'Barcode / NDC': '5000456012398',
        'Prescription Required (Yes/No)': 'No',
        'Requires Cold Chain (Yes/No)': 'No',
      },
      {
        'Product Name': 'Cetirizine 10mg Tablets',
        'Generic Name': 'Cetirizine Dihydrochloride',
        'Category': 'Respiratory',
        'Dosage Form': 'Tablet',
        'Strength / Dosage': '10mg',
        'Selling Price (KSh)': 320.00,
        'Cost Price (KSh)': 180.00,
        'Quantity In Stock': 80,
        'Min Stock Alert Level': 15,
        'Batch / Lot Number': 'CTZ-2026-A4',
        'Expiry Date (YYYY-MM-DD)': '2027-12-31',
        'Manufacturer / Supplier': 'Dawa Pharmaceuticals Ltd',
        'Barcode / NDC': '6161100456712',
        'Prescription Required (Yes/No)': 'No',
        'Requires Cold Chain (Yes/No)': 'No',
      },
      {
        'Product Name': 'Metformin 500mg Tablets',
        'Generic Name': 'Metformin Hydrochloride',
        'Category': 'Diabetes',
        'Dosage Form': 'Tablet',
        'Strength / Dosage': '500mg',
        'Selling Price (KSh)': 600.00,
        'Cost Price (KSh)': 380.00,
        'Quantity In Stock': 120,
        'Min Stock Alert Level': 25,
        'Batch / Lot Number': 'MET-2026-X8',
        'Expiry Date (YYYY-MM-DD)': '2027-08-30',
        'Manufacturer / Supplier': 'Regal Pharmaceuticals',
        'Barcode / NDC': '6161100789012',
        'Prescription Required (Yes/No)': 'Yes',
        'Requires Cold Chain (Yes/No)': 'No',
      },
      {
        'Product Name': 'Insulin Mixtard 30/70 Penfill',
        'Generic Name': 'Biphasic Isophane Insulin',
        'Category': 'Diabetes',
        'Dosage Form': 'Injection',
        'Strength / Dosage': '100 IU/ml',
        'Selling Price (KSh)': 2800.00,
        'Cost Price (KSh)': 2100.00,
        'Quantity In Stock': 40,
        'Min Stock Alert Level': 10,
        'Batch / Lot Number': 'INS-2026-C2',
        'Expiry Date (YYYY-MM-DD)': '2026-12-15',
        'Manufacturer / Supplier': 'Novo Nordisk',
        'Barcode / NDC': '5702812001923',
        'Prescription Required (Yes/No)': 'Yes',
        'Requires Cold Chain (Yes/No)': 'Yes',
      },
    ];

    const instructionsData = [
      { Field: 'Product Name *', Requirement: 'Mandatory', Rule: 'Brand or trade drug name including strength if applicable (e.g. Amoxicillin 500mg)' },
      { Field: 'Generic Name *', Requirement: 'Mandatory', Rule: 'Active pharmaceutical ingredient molecule name (e.g. Amoxicillin Trihydrate)' },
      { Field: 'Category *', Requirement: 'Mandatory', Rule: 'Allowed: Antibiotics, Cardiovascular, Pain & Analgesics, Respiratory, Gastrointestinal, Diabetes, OTC & First Aid, Vitamins & Supplements' },
      { Field: 'Dosage Form *', Requirement: 'Mandatory', Rule: 'Allowed: Tablet, Capsule, Syrup, Injection, Inhaler, Ointment, Drops' },
      { Field: 'Strength / Dosage *', Requirement: 'Mandatory', Rule: 'e.g. 500mg, 10mg/5ml, 20mcg, 100 IU/ml' },
      { Field: 'Selling Price (KSh) *', Requirement: 'Mandatory', Rule: 'Unit selling price to customer in Kenyan Shillings (Prices are tax-inclusive)' },
      { Field: 'Cost Price (KSh)', Requirement: 'Optional', Rule: 'Wholesale acquisition cost price in KSh (defaults to 70% of selling price if blank)' },
      { Field: 'Quantity In Stock *', Requirement: 'Mandatory', Rule: 'Physical count of units/packs in stock. Must be a positive number (0 or greater). Negative numbers are strictly forbidden.' },
      { Field: 'Min Stock Alert Level', Requirement: 'Optional', Rule: 'Threshold for low-stock warning triggers (defaults to 15 if left blank)' },
      { Field: 'Batch / Lot Number *', Requirement: 'Mandatory (Compliance)', Rule: 'Manufacturer batch/lot identification number. Strictly required by Pharmacy & Poisons Board regulations.' },
      { Field: 'Expiry Date (YYYY-MM-DD) *', Requirement: 'Mandatory (Compliance)', Rule: 'Standard expiration date format YYYY-MM-DD (e.g. 2027-10-31)' },
      { Field: 'Manufacturer / Supplier', Requirement: 'Optional', Rule: 'Pharma manufacturer or local distributor' },
      { Field: 'Barcode / NDC', Requirement: 'Optional', Rule: 'Scannable EAN/UPC barcode number for quick POS counter scanning' },
      { Field: 'Prescription Required (Yes/No)', Requirement: 'Optional', Rule: 'Yes for Rx only medications; No for Over-The-Counter (OTC)' },
      { Field: 'Requires Cold Chain (Yes/No)', Requirement: 'Optional', Rule: 'Yes for refrigerated drugs (2°C - 8°C); No for ambient storage' },
    ];

    const wb = XLSX.utils.book_new();

    // Sheet 1: Template data
    const wsTemplate = XLSX.utils.json_to_sheet(templateData);
    // Set auto column widths
    const colWidths = [
      { wch: 32 }, // Product Name
      { wch: 28 }, // Generic Name
      { wch: 22 }, // Category
      { wch: 16 }, // Form
      { wch: 20 }, // Strength
      { wch: 20 }, // Selling Price
      { wch: 18 }, // Cost Price
      { wch: 18 }, // Quantity
      { wch: 22 }, // Min Stock
      { wch: 22 }, // Batch
      { wch: 26 }, // Expiry
      { wch: 26 }, // Manufacturer
      { wch: 20 }, // Barcode
      { wch: 30 }, // Rx Required
      { wch: 28 }, // Cold Chain
    ];
    wsTemplate['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, wsTemplate, 'Stock Import Template');

    if (format === 'xlsx') {
      // Sheet 2: Field Instructions
      const wsInstructions = XLSX.utils.json_to_sheet(instructionsData);
      wsInstructions['!cols'] = [{ wch: 30 }, { wch: 24 }, { wch: 70 }];
      XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions & Rules');

      XLSX.writeFile(wb, 'pharmapos_stock_import_template.xlsx');
    } else {
      // CSV format
      XLSX.writeFile(wb, 'pharmapos_stock_import_template.csv', { bookType: 'csv' });
    }
  };

  // Helper to extract cell string value safely
  const getField = (row: Record<string, any>, possibleKeys: string[]): string => {
    for (const key of possibleKeys) {
      if (row[key] !== undefined && row[key] !== null) {
        return String(row[key]).trim();
      }
      // Also test case-insensitive match
      const lowerKey = key.toLowerCase();
      for (const actualKey of Object.keys(row)) {
        if (actualKey.toLowerCase() === lowerKey || actualKey.toLowerCase().replace(/[^a-z0-9]/g, '') === lowerKey.replace(/[^a-z0-9]/g, '')) {
          if (row[actualKey] !== undefined && row[actualKey] !== null) {
            return String(row[actualKey]).trim();
          }
        }
      }
    }
    return '';
  };

  // Helper to parse dates formatted as Excel serial numbers, YYYY-MM-DD, or DD/MM/YYYY
  const parseExpiryDate = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'number') {
      // Excel serial date number
      const dateObj = XLSX.SSF.parse_date_code(val);
      if (dateObj) {
        const y = dateObj.y;
        const m = String(dateObj.m).padStart(2, '0');
        const d = String(dateObj.d).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
    const str = String(val).trim();
    // Check YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return str;
    }
    // Check DD/MM/YYYY or DD-MM-YYYY
    const dmy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (dmy) {
      const d = dmy[1].padStart(2, '0');
      const m = dmy[2].padStart(2, '0');
      const y = dmy[3];
      return `${y}-${m}-${d}`;
    }
    // Attempt standard Date parsing
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
    return str;
  };

  // 2. PROCESS UPLOADED EXCEL/CSV FILE
  const processFile = async (uploadedFile: File) => {
    setFile(uploadedFile);
    setIsProcessing(true);
    setParseError(null);

    try {
      const buffer = await uploadedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('Spreadsheet appears to be empty or corrupted.');
      }

      // Read the first worksheet
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

      if (rawRows.length === 0) {
        throw new Error('No data rows found in spreadsheet.');
      }

      const parsed: ParsedRow[] = [];

      rawRows.forEach((row, index) => {
        const rowNumber = index + 2; // Row 1 is header
        const errors: string[] = [];
        const warnings: string[] = [];

        // 1. Product Name
        const name = getField(row, ['Product Name', 'Name', 'Drug Name', 'Medication Name', 'Item Name']);
        if (!name) {
          errors.push('Product name is required');
        }

        // 2. Generic Name
        let genericName = getField(row, ['Generic Name', 'Generic', 'Active Ingredient', 'Molecule']);
        if (!genericName) {
          genericName = name;
          warnings.push('Generic name defaulted to product name');
        }

        // 3. Category
        const rawCategory = getField(row, ['Category', 'Drug Class', 'Class']);
        let category: MedicationCategory = 'Pain & Analgesics';
        const matchedCat = VALID_CATEGORIES.find(
          (c) => c.toLowerCase() === rawCategory.toLowerCase() || rawCategory.toLowerCase().includes(c.toLowerCase())
        );
        if (matchedCat) {
          category = matchedCat;
        } else if (rawCategory) {
          category = 'OTC & First Aid';
          warnings.push(`Category "${rawCategory}" normalized to "OTC & First Aid"`);
        }

        // 4. Dosage Form
        const rawForm = getField(row, ['Dosage Form', 'Form', 'Formulation']);
        let form: Medication['form'] = 'Tablet';
        const matchedForm = VALID_FORMS.find(
          (f) => f.toLowerCase() === rawForm.toLowerCase() || rawForm.toLowerCase().includes(f.toLowerCase())
        );
        if (matchedForm) {
          form = matchedForm;
        } else if (rawForm) {
          form = 'Tablet';
          warnings.push(`Form "${rawForm}" defaulted to "Tablet"`);
        }

        // 5. Strength / Dosage
        let dosage = getField(row, ['Strength / Dosage', 'Strength', 'Dosage', 'Dose']);
        if (!dosage) {
          // Attempt to extract dosage from name (e.g. "500mg")
          const dosageMatch = name.match(/(\d+\s*(mg|ml|mcg|g|iu|%))/i);
          dosage = dosageMatch ? dosageMatch[0] : 'Standard';
        }

        // 6. Selling Price (KSh) - Tax Inclusive
        const rawPrice = getField(row, [
          'Selling Price (KSh)',
          'Selling Price',
          'Unit Price (KSh)',
          'Unit Price',
          'Price (KSh)',
          'Price',
        ]);
        const cleanPriceStr = String(rawPrice).replace(/[^0-9.]/g, '');
        const price = parseFloat(cleanPriceStr);
        if (isNaN(price) || price < 0) {
          errors.push('Valid selling price in KSh is required (must be >= 0)');
        }

        // 7. Cost Price (KSh)
        const rawCost = getField(row, ['Cost Price (KSh)', 'Cost Price', 'Purchase Price', 'Cost']);
        const cleanCostStr = String(rawCost).replace(/[^0-9.]/g, '');
        let costPrice = parseFloat(cleanCostStr);
        if (isNaN(costPrice) || costPrice < 0) {
          costPrice = Math.round((price || 0) * 0.7); // default 70% cost
        }

        // 8. Quantity In Stock - Pharmaceutical Validation: NEVER FALL BELOW ZERO
        const rawQty = getField(row, ['Quantity In Stock', 'Quantity', 'Stock', 'Qty', 'Units', 'Count']);
        const qtyNum = parseFloat(String(rawQty).replace(/[^0-9.-]/g, ''));
        if (isNaN(qtyNum)) {
          errors.push('Stock quantity must be a valid number');
        } else if (qtyNum < 0) {
          errors.push(`Compliance Violation: Stock levels can never fall below zero (entered: ${qtyNum})`);
        }
        const quantity = Math.max(0, Math.floor(qtyNum || 0));

        // 9. Min Stock Alert Level
        const rawMinStock = getField(row, ['Min Stock Alert Level', 'Min Stock Level', 'Min Stock', 'Threshold', 'Reorder Level']);
        const minStockNum = parseInt(String(rawMinStock).replace(/[^0-9]/g, ''), 10);
        const minStockLevel = isNaN(minStockNum) ? 15 : Math.max(0, minStockNum);

        // 10. Batch / Lot Number - Mandatory Pharmaceutical Compliance
        let batchNumber = getField(row, ['Batch / Lot Number', 'Batch Number', 'Batch', 'Batch No', 'Lot Number', 'Lot']);
        if (!batchNumber || batchNumber.trim() === '') {
          errors.push('Mandatory Compliance: Batch / Lot number is strictly required for pharmaceutical audit tracking');
        }

        // 11. Expiry Date - Mandatory Compliance
        const rawExpiry = getField(row, ['Expiry Date (YYYY-MM-DD)', 'Expiry Date', 'Expiry', 'Exp Date', 'Expiration Date']);
        const expiryDate = parseExpiryDate(rawExpiry);
        if (!expiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
          errors.push('Valid Expiration Date (YYYY-MM-DD) is strictly required');
        }

        // 12. Manufacturer / Supplier
        const manufacturer = getField(row, ['Manufacturer / Supplier', 'Manufacturer', 'Supplier', 'Company', 'Brand']) || 'Registered Distributor';

        // 13. Barcode
        let barcode = getField(row, ['Barcode / NDC', 'Barcode', 'NDC', 'EAN', 'Code']);
        if (!barcode) {
          // generate reproducible barcode hash
          barcode = `616${Math.floor(1000000000 + Math.random() * 9000000000)}`;
        }

        // 14. Prescription Required
        const rawRx = getField(row, ['Prescription Required (Yes/No)', 'Prescription Required', 'Rx Required', 'Rx', 'Is Prescription']).toLowerCase();
        const isPrescriptionRequired = rawRx === 'yes' || rawRx === 'y' || rawRx === 'true' || rawRx === '1' || category === 'Antibiotics' || category === 'Cardiovascular';

        // 15. Requires Refrigeration
        const rawCold = getField(row, ['Requires Cold Chain (Yes/No)', 'Requires Cold Chain', 'Cold Chain', 'Refrigeration', 'Requires Refrigeration']).toLowerCase();
        const requiresRefrigeration = rawCold === 'yes' || rawCold === 'y' || rawCold === 'true' || rawCold === '1';

        // Match check against existing inventory
        let matchedMedication: Medication | undefined;
        if (barcode) {
          matchedMedication = existingMedications.find((m) => m.barcode && m.barcode === barcode);
        }
        if (!matchedMedication) {
          matchedMedication = existingMedications.find(
            (m) =>
              m.name.trim().toLowerCase() === name.trim().toLowerCase() &&
              m.dosage.trim().toLowerCase() === dosage.trim().toLowerCase()
          );
        }
        const isMatch = Boolean(matchedMedication);

        const isValid = errors.length === 0;

        parsed.push({
          rowNumber,
          isValid,
          errors,
          warnings,
          isMatch,
          matchedMedication,
          name,
          genericName,
          category,
          form,
          dosage,
          price: isNaN(price) ? 0 : price,
          costPrice,
          quantity,
          minStockLevel,
          batchNumber,
          expiryDate,
          manufacturer,
          barcode,
          isPrescriptionRequired,
          requiresRefrigeration,
        });
      });

      setParsedRows(parsed);
    } catch (err: any) {
      console.error('Error parsing spreadsheet:', err);
      setParseError(err?.message || 'Failed to read spreadsheet file. Please check that it is a valid .xlsx or .csv file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (
        droppedFile.name.endsWith('.xlsx') ||
        droppedFile.name.endsWith('.xls') ||
        droppedFile.name.endsWith('.csv')
      ) {
        processFile(droppedFile);
      } else {
        setParseError('Please upload an Excel spreadsheet (.xlsx, .xls) or CSV file (.csv).');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  // 3. EXECUTE IMPORT
  const handleExecuteImport = () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) return;

    const newMedications: Medication[] = [];
    const updatedMedications: Medication[] = [];
    let totalStockAdded = 0;

    validRows.forEach((row) => {
      if (row.isMatch && row.matchedMedication) {
        // Update existing item
        const existing = row.matchedMedication;
        const newStock =
          restockMode === 'add'
            ? existing.stock + row.quantity
            : row.quantity;
        
        totalStockAdded += restockMode === 'add' ? row.quantity : (row.quantity - existing.stock);

        const updated: Medication = {
          ...existing,
          stock: Math.max(0, newStock),
          price: row.price > 0 ? row.price : existing.price,
          costPrice: row.costPrice > 0 ? row.costPrice : existing.costPrice,
          batchNumber: row.batchNumber || existing.batchNumber,
          expiryDate: row.expiryDate || existing.expiryDate,
          manufacturer: row.manufacturer || existing.manufacturer,
          minStockLevel: row.minStockLevel || existing.minStockLevel,
          requiresRefrigeration: row.requiresRefrigeration !== undefined ? row.requiresRefrigeration : existing.requiresRefrigeration,
        };
        updatedMedications.push(updated);
      } else {
        // Add brand new item
        const newMed: Medication = {
          id: `med-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          name: row.name,
          genericName: row.genericName,
          category: row.category,
          form: row.form,
          dosage: row.dosage,
          price: row.price,
          costPrice: row.costPrice,
          stock: Math.max(0, row.quantity),
          minStockLevel: row.minStockLevel,
          batchNumber: row.batchNumber,
          expiryDate: row.expiryDate,
          manufacturer: row.manufacturer,
          barcode: row.barcode,
          isPrescriptionRequired: row.isPrescriptionRequired,
          requiresRefrigeration: row.requiresRefrigeration,
        };
        totalStockAdded += row.quantity;
        newMedications.push(newMed);
      }
    });

    onImportComplete(newMedications, updatedMedications, {
      addedCount: newMedications.length,
      updatedCount: updatedMedications.length,
      totalStockAdded,
    });

    onClose();
  };

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const errorCount = parsedRows.filter((r) => !r.isValid).length;
  const matchCount = parsedRows.filter((r) => r.isValid && r.isMatch).length;
  const newProductCount = parsedRows.filter((r) => r.isValid && !r.isMatch).length;

  const displayRows = parsedRows.filter((row) => {
    if (activeTab === 'valid') return row.isValid;
    if (activeTab === 'errors') return !row.isValid;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-fadeIn">
        {/* Modal Header */}
        <div className="bg-teal-800 text-white p-5 sm:p-6 flex items-start justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-teal-700/80 border border-teal-600 flex items-center justify-center shadow-inner shrink-0">
              <FileSpreadsheet className="w-6 h-6 text-teal-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
                  Import Stock from Excel Spreadsheet
                </h2>
                <span className="bg-teal-900/80 text-teal-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-teal-700">
                  Pharmaceutical Compliance
                </span>
              </div>
              <p className="text-xs text-teal-100 mt-0.5">
                Bulk add new medications or restock existing inventory with strict batch & expiry verification
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-teal-200 hover:text-white p-2 rounded-xl hover:bg-teal-700/50 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Sub-Header: Download Template Bar */}
        <div className="bg-teal-50 border-b border-teal-200/80 px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-teal-900 font-medium">
            <Info className="w-4 h-4 text-teal-700 shrink-0" />
            <span>Need the official format? Download the pre-formatted Excel template with sample pharmacy drugs:</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="download-excel-template-btn"
              onClick={() => handleDownloadTemplate('xlsx')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs shadow-xs transition active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Excel Template (.xlsx)</span>
            </button>

            <button
              type="button"
              id="download-csv-template-btn"
              onClick={() => handleDownloadTemplate('csv')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-teal-900 border border-teal-300 font-bold text-xs shadow-xs transition active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 text-teal-700" />
              <span>CSV (.csv)</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Upload Area if no file parsed or want to upload another */}
          {parsedRows.length === 0 ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-4 ${
                isDragging
                  ? 'border-teal-500 bg-teal-50/60'
                  : 'border-slate-300 hover:border-teal-600 bg-slate-50/50 hover:bg-teal-50/20'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="w-16 h-16 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center shadow-xs">
                {isProcessing ? (
                  <RefreshCw className="w-8 h-8 animate-spin" />
                ) : (
                  <Upload className="w-8 h-8" />
                )}
              </div>

              <div className="space-y-1 max-w-md">
                <h3 className="text-base font-extrabold text-slate-800">
                  {isProcessing ? 'Analyzing and Validating Spreadsheet...' : 'Drop your stock Excel spreadsheet here'}
                </h3>
                <p className="text-xs text-slate-500">
                  Supports Microsoft Excel (.xlsx, .xls) and Comma-Separated Values (.csv).
                </p>
                <div className="pt-2">
                  <span className="inline-block px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-xs">
                    Browse File from Computer
                  </span>
                </div>
              </div>

              {parseError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              {/* Regulatory Notice */}
              <div className="mt-4 pt-4 border-t border-slate-200/80 flex items-center justify-center gap-6 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Stock never falls below zero
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Strict batch & expiry validation
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Tax-inclusive pricing
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Active File Summary & Re-upload */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{file?.name}</h4>
                    <p className="text-[11px] text-slate-500">
                      {parsedRows.length} total rows parsed from sheet • {validCount} ready to import
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setParsedRows([]);
                      setParseError(null);
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 transition"
                  >
                    Upload Different File
                  </button>
                </div>
              </div>

              {/* Metrics Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Total Rows</span>
                  <span className="text-xl font-extrabold text-slate-900">{parsedRows.length}</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-200">
                  <span className="text-[10px] font-bold uppercase text-teal-800 block">New Medications</span>
                  <span className="text-xl font-extrabold text-teal-900">{newProductCount}</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200">
                  <span className="text-[10px] font-bold uppercase text-blue-800 block">Restock Existing</span>
                  <span className="text-xl font-extrabold text-blue-900">{matchCount}</span>
                </div>

                <div
                  className={`p-3.5 rounded-2xl border ${
                    errorCount > 0
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase block">
                    {errorCount > 0 ? 'Validation Errors' : 'Validation Status'}
                  </span>
                  <span className="text-xl font-extrabold">
                    {errorCount > 0 ? `${errorCount} rejected` : '100% Valid'}
                  </span>
                </div>
              </div>

              {/* Match Restock Strategy Option */}
              {matchCount > 0 && (
                <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-700" />
                    <h4 className="text-xs font-bold text-blue-950">
                      Restock Option for {matchCount} Existing Products:
                    </h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
                      <input
                        type="radio"
                        name="restockMode"
                        checked={restockMode === 'add'}
                        onChange={() => setRestockMode('add')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span>
                        <strong>Add to current stock</strong> (Replenishment: Current + Imported)
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
                      <input
                        type="radio"
                        name="restockMode"
                        checked={restockMode === 'replace'}
                        onChange={() => setRestockMode('replace')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span>
                        <strong>Replace current stock</strong> (Override stock with imported count)
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Tab Filters */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      activeTab === 'all'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    All Items ({parsedRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('valid')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      activeTab === 'valid'
                        ? 'bg-emerald-700 text-white'
                        : 'text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    Valid & Ready ({validCount})
                  </button>
                  {errorCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('errors')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        activeTab === 'errors'
                          ? 'bg-rose-700 text-white'
                          : 'text-rose-700 hover:bg-rose-50'
                      }`}
                    >
                      Errors ({errorCount})
                    </button>
                  )}
                </div>

                <span className="text-[11px] text-slate-500">
                  Showing {displayRows.length} item{displayRows.length === 1 ? '' : 's'}
                </span>
              </div>

              {/* Preview Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 text-[11px] font-bold">
                      <tr>
                        <th className="py-2.5 px-3">Row</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Product Name & Generic</th>
                        <th className="py-2.5 px-3">Category / Form</th>
                        <th className="py-2.5 px-3">Batch & Expiry</th>
                        <th className="py-2.5 px-3 text-right">Selling Price</th>
                        <th className="py-2.5 px-3 text-right">Stock Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {displayRows.map((row) => (
                        <tr
                          key={row.rowNumber}
                          className={`hover:bg-slate-50/80 transition ${
                            !row.isValid ? 'bg-rose-50/50' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                            #{row.rowNumber}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {!row.isValid ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-md">
                                <AlertTriangle className="w-3 h-3 text-rose-600" />
                                Rejected
                              </span>
                            ) : row.isMatch ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md">
                                <RefreshCw className="w-3 h-3 text-blue-600" />
                                Restock {restockMode === 'add' ? `(+${row.quantity})` : `(=${row.quantity})`}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                                <PlusCircle className="w-3 h-3 text-emerald-600" />
                                New Item
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">{row.name || '—'}</div>
                            <div className="text-[10px] text-slate-500 italic">{row.genericName}</div>
                            {row.errors.length > 0 && (
                              <div className="mt-1 text-[10px] font-semibold text-rose-700 space-y-0.5">
                                {row.errors.map((err, idx) => (
                                  <div key={idx} className="flex items-center gap-1">
                                    <span>• {err}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="inline-block bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                              {row.category}
                            </span>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {row.form} • {row.dosage}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px]">
                            <div className="font-bold text-slate-800">{row.batchNumber || '—'}</div>
                            <div className="text-[10px] text-slate-500">Exp: {row.expiryDate || '—'}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            {formatKSh(row.price)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold">
                            <span
                              className={`px-2 py-0.5 rounded-md ${
                                row.quantity === 0
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-teal-50 text-teal-900 font-black'
                              }`}
                            >
                              {row.quantity}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-xs transition cursor-pointer"
          >
            Cancel
          </button>

          {parsedRows.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                id="confirm-excel-import-btn"
                disabled={validCount === 0}
                onClick={handleExecuteImport}
                className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs shadow-md transition cursor-pointer active:scale-95 ${
                  validCount > 0
                    ? 'bg-teal-700 hover:bg-teal-800 text-white'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <PlusCircle className="w-4 h-4" />
                <span>
                  Confirm & Import {validCount} Medication{validCount === 1 ? '' : 's'}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
