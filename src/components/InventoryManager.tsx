import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Barcode,
  Boxes,
  Building2,
  Calendar,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Download,
  Edit2,
  Filter,
  PackagePlus,
  Pill,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShoppingCart,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { ExpiryFilterPreset, InventoryFilters, Medication, MedicationCategory, UserRole } from '../types';
import { formatKSh } from '../utils/currency';
import { storageService } from '../services/storage';

interface InventoryManagerProps {
  medications: Medication[];
  onUpdateMedication: (updated: Medication) => void;
  onAddMedication: (newItem: Medication) => void;
  onDeleteMedication?: (id: string) => void;
  onAdjustStock?: (
    medicationId: string,
    newStock: number,
    reason: string,
    newBatchNumber?: string,
    newExpiryDate?: string
  ) => void;
  onAddToCart: (medication: Medication) => void;
  userRole: UserRole;
}

export const InventoryManager: React.FC<InventoryManagerProps> = ({
  medications,
  onUpdateMedication,
  onAddMedication,
  onDeleteMedication,
  onAddToCart,
  userRole,
}) => {
  // Session-persistent filters
  const [savedFilters] = useState<InventoryFilters>(() => storageService.getInventoryFilters());

  const [searchTerm, setSearchTerm] = useState(savedFilters.searchTerm || '');
  const [categoryFilter, setCategoryFilter] = useState<string>(savedFilters.category || 'All');
  const [supplierFilter, setSupplierFilter] = useState<string>(savedFilters.supplier || 'All');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'low' | 'rx' | 'otc' | 'expiring'>(
    savedFilters.stockStatus || 'all'
  );
  const [expiryPreset, setExpiryPreset] = useState<ExpiryFilterPreset>(savedFilters.expiryPreset || 'all');
  const [expiryStartDate, setExpiryStartDate] = useState<string>(savedFilters.expiryStartDate || '');
  const [expiryEndDate, setExpiryEndDate] = useState<string>(savedFilters.expiryEndDate || '');

  // Auto-expand advanced filters panel if any advanced filter is currently active from session
  const hasInitialAdvanced =
    (savedFilters.category && savedFilters.category !== 'All') ||
    (savedFilters.supplier && savedFilters.supplier !== 'All') ||
    (savedFilters.expiryPreset && savedFilters.expiryPreset !== 'all') ||
    Boolean(savedFilters.expiryStartDate) ||
    Boolean(savedFilters.expiryEndDate);

  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(hasInitialAdvanced);

  // Sync filters to sessionStorage on every change
  useEffect(() => {
    storageService.saveInventoryFilters({
      searchTerm,
      category: categoryFilter,
      supplier: supplierFilter,
      stockStatus: stockStatusFilter,
      expiryPreset,
      expiryStartDate,
      expiryEndDate,
    });
  }, [searchTerm, categoryFilter, supplierFilter, stockStatusFilter, expiryPreset, expiryStartDate, expiryEndDate]);

  // Derived available categories with item counts
  const availableCategories = useMemo(() => {
    const counts = new Map<string, number>();
    medications.forEach((m) => {
      if (m.category) counts.set(m.category, (counts.get(m.category) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [medications]);

  // Derived available suppliers/manufacturers with item counts
  const availableSuppliers = useMemo(() => {
    const counts = new Map<string, number>();
    medications.forEach((m) => {
      const sup = m.manufacturer ? m.manufacturer.trim() : 'Unspecified';
      counts.set(sup, (counts.get(sup) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [medications]);

  // Active advanced filters counter
  const activeAdvancedCount = [
    categoryFilter !== 'All',
    supplierFilter !== 'All',
    expiryPreset !== 'all' || Boolean(expiryStartDate) || Boolean(expiryEndDate),
  ].filter(Boolean).length;

  const totalActiveFilterCount = [
    categoryFilter !== 'All',
    supplierFilter !== 'All',
    stockStatusFilter !== 'all',
    expiryPreset !== 'all' || Boolean(expiryStartDate) || Boolean(expiryEndDate),
    Boolean(searchTerm.trim()),
  ].filter(Boolean).length;

  const handleResetAllFilters = () => {
    setSearchTerm('');
    setCategoryFilter('All');
    setSupplierFilter('All');
    setStockStatusFilter('all');
    setExpiryPreset('all');
    setExpiryStartDate('');
    setExpiryEndDate('');
    storageService.clearInventoryFilters();
  };

  // Modals
  const [editingMedication, setEditingMedication] = useState<Medication | null>(null);
  const [restockMedication, setRestockMedication] = useState<Medication | null>(null);
  const [medicationToDelete, setMedicationToDelete] = useState<Medication | null>(null);
  const [restockQty, setRestockQty] = useState<number>(50);
  const [restockBatch, setRestockBatch] = useState<string>('');
  const [restockExpiry, setRestockExpiry] = useState<string>('2028-06-30');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);

  // New item form
  const [newMedForm, setNewMedForm] = useState<Partial<Medication>>({
    name: '',
    genericName: '',
    dosage: '',
    form: 'Tablet',
    category: 'Antibiotics',
    isPrescriptionRequired: true,
    barcode: '',
    price: 150.0,
    costPrice: 60.0,
    stock: 50,
    minStockLevel: 20,
    batchNumber: 'BATCH-' + Math.floor(1000 + Math.random() * 9000),
    expiryDate: '2027-12-31',
    manufacturer: '',
  });

  const isAdmin = userRole === 'admin';

  // Low stock calculation
  const lowStockItems = medications.filter((m) => m.stock <= m.minStockLevel);
  const outOfStockItems = medications.filter((m) => m.stock === 0);

  // Expiring soon (< 180 days from current date)
  const isExpiringSoon = (dateStr: string) => {
    const exp = new Date(dateStr).getTime();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const days = (exp - todayStart) / (1000 * 60 * 60 * 24);
    return days <= 180 && days > 0;
  };

  const isExpired = (dateStr: string) => {
    const exp = new Date(dateStr).getTime();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return exp < todayStart;
  };

  // Advanced Expiry date evaluation
  const isExpiringPresetMatch = (
    dateStr: string,
    preset: ExpiryFilterPreset,
    startDate: string,
    endDate: string
  ) => {
    if (preset === 'all' && !startDate && !endDate) return true;

    const expTime = new Date(dateStr).getTime();
    if (isNaN(expTime)) return true;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    if (preset === 'expired') {
      if (expTime >= todayStart) return false;
    } else if (preset === 'expiring_30') {
      const limit = todayStart + 30 * 24 * 60 * 60 * 1000;
      if (expTime < todayStart || expTime > limit) return false;
    } else if (preset === 'expiring_90') {
      const limit = todayStart + 90 * 24 * 60 * 60 * 1000;
      if (expTime < todayStart || expTime > limit) return false;
    } else if (preset === 'expiring_180') {
      const limit = todayStart + 180 * 24 * 60 * 60 * 1000;
      if (expTime < todayStart || expTime > limit) return false;
    } else if (preset === 'expiring_365') {
      const limit = todayStart + 365 * 24 * 60 * 60 * 1000;
      if (expTime < todayStart || expTime > limit) return false;
    }

    if (startDate) {
      const startTime = new Date(startDate).getTime();
      if (expTime < startTime) return false;
    }
    if (endDate) {
      const endTime = new Date(endDate).getTime();
      const endOfDay = endTime + 24 * 60 * 60 * 1000 - 1;
      if (expTime > endOfDay) return false;
    }

    return true;
  };

  // Filtered medications
  const filtered = medications.filter((med) => {
    // Search filter
    const matchesSearch =
      med.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      med.genericName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      med.barcode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      med.batchNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (med.manufacturer && med.manufacturer.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    // Category filter
    if (categoryFilter !== 'All' && med.category !== categoryFilter) return false;

    // Supplier / Manufacturer filter
    if (supplierFilter !== 'All' && med.manufacturer !== supplierFilter) return false;

    // Expiry date range & preset filter
    if (!isExpiringPresetMatch(med.expiryDate, expiryPreset, expiryStartDate, expiryEndDate)) return false;

    // Stock status filter
    if (stockStatusFilter === 'low') return med.stock <= med.minStockLevel;
    if (stockStatusFilter === 'rx') return med.isPrescriptionRequired;
    if (stockStatusFilter === 'otc') return !med.isPrescriptionRequired;
    if (stockStatusFilter === 'expiring') return isExpiringSoon(med.expiryDate) || isExpired(med.expiryDate);

    return true;
  });

  const handleRestockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockMedication || !isAdmin) return;
    const updated: Medication = {
      ...restockMedication,
      stock: restockMedication.stock + Number(restockQty),
      batchNumber: restockBatch || restockMedication.batchNumber,
      expiryDate: restockExpiry || restockMedication.expiryDate,
    };
    onUpdateMedication(updated);
    setRestockMedication(null);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMedication || !isAdmin) return;
    onUpdateMedication(editingMedication);
    setEditingMedication(null);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const fullMed: Medication = {
      id: 'med-' + Date.now(),
      name: newMedForm.name || 'New Medication',
      genericName: newMedForm.genericName || '',
      dosage: newMedForm.dosage || '10mg',
      form: newMedForm.form || 'Tablet',
      category: (newMedForm.category as MedicationCategory) || 'Pain & Analgesics',
      isPrescriptionRequired: Boolean(newMedForm.isPrescriptionRequired),
      barcode: newMedForm.barcode || '000' + Math.floor(10000000 + Math.random() * 90000000),
      price: Number(newMedForm.price) || 10,
      costPrice: Number(newMedForm.costPrice) || 3,
      stock: Number(newMedForm.stock) || 30,
      minStockLevel: Number(newMedForm.minStockLevel) || 15,
      batchNumber: newMedForm.batchNumber || 'BATCH-NEW',
      expiryDate: newMedForm.expiryDate || '2028-12-31',
      manufacturer: newMedForm.manufacturer || 'Standard Labs',
    };
    onAddMedication(fullMed);
    setIsAddModalOpen(false);
  };

  // CSV Export for external auditing, compliance, and backups
  const handleExportCSV = (exportAll = false) => {
    if (!isAdmin) {
      alert('Unauthorized: Only administrators can export inventory data.');
      return;
    }

    const exportItems = exportAll || filtered.length === 0 ? medications : filtered;
    if (exportItems.length === 0) {
      alert('No medications available to export.');
      return;
    }

    const headers = [
      'Product ID',
      'Brand Name',
      'Generic Name',
      'Category',
      'Dosage',
      'Form',
      'Prescription Required',
      'Barcode / NDC',
      'Batch / Lot Number',
      'Expiration Date',
      'Expiry Status',
      'Days to Expiration',
      'Current Stock Level',
      'Min Reorder Level',
      'Stock Status',
      'Unit Cost (KSh)',
      'Unit Selling Price (KSh)',
      'Total Cost Valuation (KSh)',
      'Total Retail Valuation (KSh)',
      'Manufacturer',
      'Storage Condition',
    ];

    const escapeCsv = (val: string | number | boolean | undefined | null): string => {
      if (val === undefined || val === null) return '""';
      const str = String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const now = new Date().getTime();

    const rows = exportItems.map((med) => {
      const expTime = new Date(med.expiryDate).getTime();
      const daysToExpiry = Math.round((expTime - now) / (1000 * 60 * 60 * 24));

      let expiryStatus = 'Valid';
      if (expTime < now) {
        expiryStatus = 'EXPIRED';
      } else if (daysToExpiry <= 90) {
        expiryStatus = 'CRITICAL (<90 days)';
      } else if (daysToExpiry <= 180) {
        expiryStatus = 'EXPIRING SOON (<180 days)';
      }

      let stockStatus = 'In Stock';
      if (med.stock === 0) {
        stockStatus = 'OUT OF STOCK';
      } else if (med.stock <= med.minStockLevel) {
        stockStatus = 'LOW STOCK';
      }

      const totalCost = (med.stock * (med.costPrice || 0)).toFixed(2);
      const totalRetail = (med.stock * med.price).toFixed(2);

      return [
        escapeCsv(med.id),
        escapeCsv(med.name),
        escapeCsv(med.genericName),
        escapeCsv(med.category),
        escapeCsv(med.dosage),
        escapeCsv(med.form),
        escapeCsv(med.isPrescriptionRequired ? 'Yes (Rx)' : 'No (OTC)'),
        escapeCsv(med.barcode),
        escapeCsv(med.batchNumber),
        escapeCsv(med.expiryDate),
        escapeCsv(expiryStatus),
        escapeCsv(daysToExpiry),
        escapeCsv(med.stock),
        escapeCsv(med.minStockLevel),
        escapeCsv(stockStatus),
        escapeCsv((med.costPrice || 0).toFixed(2)),
        escapeCsv(med.price.toFixed(2)),
        escapeCsv(totalCost),
        escapeCsv(totalRetail),
        escapeCsv(med.manufacturer || 'Standard Labs'),
        escapeCsv(med.requiresRefrigeration ? 'Cold Chain (2°C - 8°C)' : 'Controlled Room Temp'),
      ].join(',');
    });

    // UTF-8 BOM to ensure compatibility with Microsoft Excel & Google Sheets
    const csvContent = '\uFEFF' + [headers.map((h) => escapeCsv(h)).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    const filterSuffix = exportItems.length !== medications.length ? '_filtered' : '_full';
    const fileName = `pharmapos_inventory_audit_${dateStr}${filterSuffix}.csv`;

    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Audit trail logging
    try {
      const activeUser = storageService.getActiveUser();
      storageService.addAuditLog({
        userId: activeUser.id,
        userName: activeUser.name,
        userRole: activeUser.role,
        action: 'INVENTORY_EXPORT_CSV',
        details: `Exported ${exportItems.length} product records to CSV for external audit/backup (${fileName})`,
        category: 'INVENTORY',
      });
    } catch (e) {
      console.error('Audit logging failed', e);
    }

    setExportSuccessMessage(
      `Successfully exported ${exportItems.length} product records to ${fileName} for external auditing.`
    );
    setTimeout(() => {
      setExportSuccessMessage(null);
    }, 6000);
  };

  return (
    <div className="space-y-6">
      {/* Low Stock Alert Banner */}
      {lowStockItems.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <AlertTriangle className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-amber-950">
                  Low Stock Inventory Alert ({lowStockItems.length} items below minimum reorder level)
                </h2>
                <span className="text-[10px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
                  Action Needed
                </span>
              </div>
              <p className="text-xs text-amber-800 mt-0.5">
                {lowStockItems.map((m) => `${m.name} (${m.stock} left)`).slice(0, 3).join(' • ')}
                {lowStockItems.length > 3 && ` and ${lowStockItems.length - 3} more`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setStockStatusFilter('low')}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition"
            >
              View Low Stock ({lowStockItems.length})
            </button>
          </div>
        </div>
      )}

      {/* Header controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Boxes className="w-5 h-5 text-teal-600" />
            Pharmacy Inventory Tracking
          </h1>
          <p className="text-xs text-slate-500">
            Real-time stock monitoring, batch & expiration tracking, and reorder levels
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {!isAdmin ? (
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600">
              <ShieldAlert className="w-4 h-4 text-slate-500" />
              <span>Staff View-Only (Admin authorization required to edit products)</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                id="export-inventory-csv-btn"
                onClick={() => handleExportCSV(false)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer"
                title="Download CSV product list, stock levels, and expiry data for external auditing or backup"
              >
                <Download className="w-4 h-4 text-teal-700" />
                <span>Export to CSV</span>
                {filtered.length !== medications.length && (
                  <span className="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded-md font-mono font-bold">
                    {filtered.length}
                  </span>
                )}
              </button>

              <button
                id="add-medication-btn"
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Medication
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Export Success Notification Banner */}
      {exportSuccessMessage && (
        <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs font-semibold flex items-center justify-between shadow-xs transition animate-fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-4 h-4 text-teal-700 shrink-0" />
            <span>{exportSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportSuccessMessage(null)}
            className="text-teal-700 hover:text-teal-900 p-1 rounded-md hover:bg-teal-100/50"
            title="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filters and search bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by brand name, generic drug, NDC barcode, or batch #..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick status tabs */}
            <button
              id="inventory-filter-all"
              onClick={() => setStockStatusFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                stockStatusFilter === 'all'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Items ({medications.length})
            </button>
            <button
              id="inventory-filter-low"
              onClick={() => setStockStatusFilter('low')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                stockStatusFilter === 'low'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Low Stock ({lowStockItems.length})
            </button>
            <button
              id="inventory-filter-rx"
              onClick={() => setStockStatusFilter('rx')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                stockStatusFilter === 'rx'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Rx Only
            </button>
            <button
              id="inventory-filter-otc"
              onClick={() => setStockStatusFilter('otc')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                stockStatusFilter === 'otc'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              OTC Products
            </button>
            <button
              id="inventory-filter-expiring"
              onClick={() => setStockStatusFilter('expiring')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                stockStatusFilter === 'expiring'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Expiring Soon
            </button>

            {/* Advanced Filters Toggle Button */}
            <button
              type="button"
              id="inventory-toggle-advanced-filters-btn"
              onClick={() => setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition border cursor-pointer ${
                isAdvancedFiltersOpen || activeAdvancedCount > 0
                  ? 'bg-teal-50 border-teal-300 text-teal-800 shadow-2xs'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
              title="Toggle Category, Supplier, and Expiry Range filters"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-teal-700" />
              <span>Advanced Filters</span>
              {activeAdvancedCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-teal-700 text-white text-[10px] flex items-center justify-center font-bold">
                  {activeAdvancedCount}
                </span>
              )}
              {isAdvancedFiltersOpen ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Advanced Filters Panel */}
        {isAdvancedFiltersOpen && (
          <div
            className="pt-3.5 border-t border-slate-100 space-y-3.5 animate-fade-in"
            id="inventory-advanced-filters-panel"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {/* Category Filter */}
              <div className="space-y-1">
                <label
                  htmlFor="inventory-category-select"
                  className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                >
                  <Tag className="w-3.5 h-3.5 text-teal-600" />
                  <span>Category</span>
                  {categoryFilter !== 'All' && (
                    <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded">Filtered</span>
                  )}
                </label>
                <select
                  id="inventory-category-select"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition"
                >
                  <option value="All">All Categories ({medications.length} items)</option>
                  {availableCategories.map((cat) => (
                    <option key={cat.name} value={cat.name}>
                      {cat.name} ({cat.count})
                    </option>
                  ))}
                </select>
              </div>

              {/* Supplier / Manufacturer Filter */}
              <div className="space-y-1">
                <label
                  htmlFor="inventory-supplier-select"
                  className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"
                >
                  <Building2 className="w-3.5 h-3.5 text-teal-600" />
                  <span>Supplier / Manufacturer</span>
                  {supplierFilter !== 'All' && (
                    <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded">Filtered</span>
                  )}
                </label>
                <select
                  id="inventory-supplier-select"
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition"
                >
                  <option value="All">All Suppliers / Manufacturers ({availableSuppliers.length})</option>
                  {availableSuppliers.map((sup) => (
                    <option key={sup.name} value={sup.name}>
                      {sup.name} ({sup.count})
                    </option>
                  ))}
                </select>
              </div>

              {/* Expiry Date Range / Presets */}
              <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                <label
                  htmlFor="inventory-expiry-preset-select"
                  className="text-xs font-semibold text-slate-700 flex items-center justify-between"
                >
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-teal-600" />
                    <span>Expiry Date Range</span>
                  </span>
                  {(expiryStartDate || expiryEndDate || expiryPreset !== 'all') && (
                    <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded">Filtered</span>
                  )}
                </label>
                <select
                  id="inventory-expiry-preset-select"
                  value={expiryPreset}
                  onChange={(e) => {
                    const val = e.target.value as ExpiryFilterPreset;
                    setExpiryPreset(val);
                    if (val !== 'custom') {
                      setExpiryStartDate('');
                      setExpiryEndDate('');
                    }
                  }}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition"
                >
                  <option value="all">All Expiry Dates</option>
                  <option value="expired">Expired Stock (Quarantine)</option>
                  <option value="expiring_30">Expiring in 30 Days (Urgent)</option>
                  <option value="expiring_90">Expiring in 90 Days (Quarterly)</option>
                  <option value="expiring_180">Expiring in 6 Months (180 Days)</option>
                  <option value="expiring_365">Expiring in 1 Year (365 Days)</option>
                  <option value="custom">Custom Date Range (From / To)...</option>
                </select>
              </div>
            </div>

            {/* Custom Expiry Date Pickers (visible if Custom or if custom dates populated) */}
            {(expiryPreset === 'custom' || expiryStartDate || expiryEndDate) && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 shrink-0">
                  <Calendar className="w-3.5 h-3.5 text-teal-600" />
                  Custom Expiry Window:
                </span>
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-slate-500">From:</span>
                    <input
                      type="date"
                      id="inventory-expiry-from-date"
                      value={expiryStartDate}
                      onChange={(e) => {
                        setExpiryStartDate(e.target.value);
                        setExpiryPreset('custom');
                      }}
                      className="text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-slate-800 font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-slate-500">To:</span>
                    <input
                      type="date"
                      id="inventory-expiry-to-date"
                      value={expiryEndDate}
                      onChange={(e) => {
                        setExpiryEndDate(e.target.value);
                        setExpiryPreset('custom');
                      }}
                      className="text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 text-slate-800 font-mono"
                    />
                  </div>
                  {(expiryStartDate || expiryEndDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setExpiryStartDate('');
                        setExpiryEndDate('');
                        setExpiryPreset('all');
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-800 underline px-1 cursor-pointer"
                    >
                      Clear dates
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Session Persistence indicator and Active Chips */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500 mr-1">Active Filters:</span>
                {totalActiveFilterCount === 0 ? (
                  <span className="text-[11px] text-slate-400 italic">None (showing all {medications.length} products)</span>
                ) : (
                  <>
                    {categoryFilter !== 'All' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-800 text-[11px] font-medium">
                        Category: {categoryFilter}
                        <button
                          type="button"
                          onClick={() => setCategoryFilter('All')}
                          className="hover:text-teal-950 ml-0.5 cursor-pointer"
                          title="Remove category filter"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}

                    {supplierFilter !== 'All' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-medium">
                        Supplier: {supplierFilter}
                        <button
                          type="button"
                          onClick={() => setSupplierFilter('All')}
                          className="hover:text-blue-950 ml-0.5 cursor-pointer"
                          title="Remove supplier filter"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}

                    {stockStatusFilter !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-purple-800 text-[11px] font-medium">
                        Status: {stockStatusFilter.toUpperCase()}
                        <button
                          type="button"
                          onClick={() => setStockStatusFilter('all')}
                          className="hover:text-purple-950 ml-0.5 cursor-pointer"
                          title="Reset status filter"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}

                    {expiryPreset !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-medium">
                        Expiry:{' '}
                        {expiryPreset === 'expired'
                          ? 'Expired'
                          : expiryPreset === 'expiring_30'
                          ? '≤ 30 Days'
                          : expiryPreset === 'expiring_90'
                          ? '≤ 90 Days'
                          : expiryPreset === 'expiring_180'
                          ? '≤ 180 Days'
                          : expiryPreset === 'expiring_365'
                          ? '≤ 1 Year'
                          : 'Custom Range'}
                        <button
                          type="button"
                          onClick={() => {
                            setExpiryPreset('all');
                            setExpiryStartDate('');
                            setExpiryEndDate('');
                          }}
                          className="hover:text-rose-950 ml-0.5 cursor-pointer"
                          title="Reset expiry filter"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}

                    {(expiryStartDate || expiryEndDate) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium">
                        Dates: {expiryStartDate || 'any'} → {expiryEndDate || 'any'}
                        <button
                          type="button"
                          onClick={() => {
                            setExpiryStartDate('');
                            setExpiryEndDate('');
                            setExpiryPreset('all');
                          }}
                          className="hover:text-amber-950 ml-0.5 cursor-pointer"
                          title="Clear custom dates"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}

                    {searchTerm && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-medium">
                        &quot;{searchTerm}&quot;
                        <button
                          type="button"
                          onClick={() => setSearchTerm('')}
                          className="hover:text-slate-900 ml-0.5 cursor-pointer"
                          title="Clear search"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-teal-700 bg-teal-50/80 px-2 py-0.5 rounded-md border border-teal-200/60 font-medium">
                  ✓ Persistent across session
                </span>
                {totalActiveFilterCount > 0 && (
                  <button
                    type="button"
                    id="inventory-clear-all-filters-btn"
                    onClick={handleResetAllFilters}
                    className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:underline px-2 py-0.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset All Filters</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Medication & Generic</th>
                <th className="py-3.5 px-3">Classification</th>
                <th className="py-3.5 px-3">NDC / Barcode</th>
                <th className="py-3.5 px-3 text-center">Current Stock</th>
                <th className="py-3.5 px-3">Batch & Expiry</th>
                <th className="py-3.5 px-3 text-right">Price</th>
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Boxes className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">No medications found matching your filter.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((med) => {
                  const isLow = med.stock <= med.minStockLevel;
                  const isOut = med.stock === 0;
                  const expiring = isExpiringSoon(med.expiryDate);

                  return (
                    <tr
                      key={med.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isLow ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      {/* Name & Generic */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 text-sm">{med.name}</div>
                        <div className="text-slate-500 italic text-[11px]">{med.genericName}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {med.dosage} • {med.form} • {med.manufacturer}
                        </div>
                      </td>

                      {/* Classification */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            med.isPrescriptionRequired
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {med.isPrescriptionRequired ? 'Rx Prescription' : 'OTC Over-The-Counter'}
                        </span>
                        <div className="text-[10px] text-slate-500 mt-1">{med.category}</div>
                      </td>

                      {/* Barcode / NDC */}
                      <td className="py-3.5 px-3 font-mono text-[11px] text-slate-600">
                        <div className="flex items-center gap-1">
                          <Barcode className="w-3.5 h-3.5 text-slate-400" />
                          <span>{med.barcode}</span>
                        </div>
                      </td>

                      {/* Stock Level */}
                      <td className="py-3.5 px-3 text-center">
                        <div
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-bold text-xs ${
                            isOut
                              ? 'bg-red-100 text-red-800'
                              : isLow
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {isLow && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                          <span>{med.stock} units</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Min Alert: {med.minStockLevel}
                        </div>
                      </td>

                      {/* Batch & Expiry */}
                      <td className="py-3.5 px-3">
                        <div className="font-mono text-[11px] text-slate-700">{med.batchNumber}</div>
                        <div
                          className={`text-[11px] flex items-center gap-1 mt-0.5 ${
                            expiring ? 'text-rose-600 font-bold' : 'text-slate-500'
                          }`}
                        >
                          <Calendar className="w-3 h-3" />
                          <span>{med.expiryDate}</span>
                          {expiring && (
                            <span className="text-[9px] bg-rose-100 text-rose-800 px-1 rounded font-bold">
                              Exp Soon
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Price */}
                      <td className="py-3.5 px-3 text-right">
                        <div className="font-bold text-slate-900 text-sm">
                          {formatKSh(med.price)}
                        </div>
                        {isAdmin && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            Cost: {formatKSh(med.costPrice)}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Add to POS Cart */}
                          <button
                            onClick={() => onAddToCart(med)}
                            disabled={med.stock <= 0}
                            className="p-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 disabled:opacity-40 transition"
                            title="Add item to POS cart"
                          >
                            <ShoppingCart className="w-4 h-4" />
                          </button>

                          {/* Admin Edit, Restock & Delete */}
                          {isAdmin && (
                            <>
                              <button
                                onClick={() => {
                                  setRestockMedication(med);
                                  setRestockQty(50);
                                  setRestockBatch(med.batchNumber);
                                  setRestockExpiry(med.expiryDate);
                                }}
                                className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 transition"
                                title="Quick Restock Batch"
                              >
                                <PackagePlus className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => setEditingMedication(med)}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                                title="Edit Product details"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>

                              {onDeleteMedication && (
                                <button
                                  onClick={() => setMedicationToDelete(med)}
                                  className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition"
                                  title="Delete item from inventory"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table summary footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            Showing <span className="font-bold text-slate-800">{filtered.length}</span> of{' '}
            <span className="font-bold text-slate-800">{medications.length}</span> medications in inventory
          </div>
          {isAdmin && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleExportCSV(false)}
                className="text-teal-700 hover:text-teal-800 font-semibold flex items-center gap-1.5 transition hover:underline"
                title="Download CSV of current product list"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export to CSV ({filtered.length} products)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Restock Modal (Admin Only) */}
      {restockMedication && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 no-print">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <PackagePlus className="w-5 h-5 text-amber-600" />
                Restock Medication Batch
              </h3>
              <button
                onClick={() => setRestockMedication(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
              <div className="font-bold text-slate-900 text-sm">{restockMedication.name}</div>
              <div className="text-slate-500">{restockMedication.genericName} • {restockMedication.dosage}</div>
              <div className="mt-1 flex gap-2">
                <span className="font-semibold text-slate-700">Current Stock: {restockMedication.stock}</span>
                <span className="text-slate-400">•</span>
                <span className="text-amber-700 font-semibold">Min Alert: {restockMedication.minStockLevel}</span>
              </div>
            </div>

            <form onSubmit={handleRestockSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quantity to Add to Stock:
                </label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={restockQty}
                  onChange={(e) => setRestockQty(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New / Updated Batch Number:
                </label>
                <input
                  type="text"
                  value={restockBatch}
                  onChange={(e) => setRestockBatch(e.target.value)}
                  placeholder="e.g. BATCH-2026-X9"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Batch Expiration Date:
                </label>
                <input
                  type="date"
                  value={restockExpiry}
                  onChange={(e) => setRestockExpiry(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRestockMedication(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition"
                >
                  Confirm Restock (+{restockQty})
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Medication Modal */}
      {editingMedication && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 no-print">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-teal-600" />
                Edit Medication: {editingMedication.name}
              </h3>
              <button
                onClick={() => setEditingMedication(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Medication Commercial Name
                  </label>
                  <input
                    type="text"
                    value={editingMedication.name}
                    onChange={(e) => setEditingMedication({ ...editingMedication, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Generic Active Ingredient
                  </label>
                  <input
                    type="text"
                    value={editingMedication.genericName}
                    onChange={(e) => setEditingMedication({ ...editingMedication, genericName: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dosage & Strength
                  </label>
                  <input
                    type="text"
                    value={editingMedication.dosage}
                    onChange={(e) => setEditingMedication({ ...editingMedication, dosage: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Retail Selling Price (KSh)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingMedication.price}
                    onChange={(e) => setEditingMedication({ ...editingMedication, price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Acquisition Cost (KSh)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingMedication.costPrice}
                    onChange={(e) => setEditingMedication({ ...editingMedication, costPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Current Stock Units
                  </label>
                  <input
                    type="number"
                    value={editingMedication.stock}
                    onChange={(e) => setEditingMedication({ ...editingMedication, stock: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Min Alert Stock Level
                  </label>
                  <input
                    type="number"
                    value={editingMedication.minStockLevel}
                    onChange={(e) => setEditingMedication({ ...editingMedication, minStockLevel: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    NDC Barcode Number
                  </label>
                  <input
                    type="text"
                    value={editingMedication.barcode}
                    onChange={(e) => setEditingMedication({ ...editingMedication, barcode: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingMedication(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-xs transition"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Medication Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 no-print">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-teal-600" />
                Register New Pharmacy Medication
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Medication Trade Name
                  </label>
                  <input
                    type="text"
                    value={newMedForm.name}
                    onChange={(e) => setNewMedForm({ ...newMedForm, name: e.target.value })}
                    placeholder="e.g. Ciprofloxacin 500mg"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Generic Active Ingredient
                  </label>
                  <input
                    type="text"
                    value={newMedForm.genericName}
                    onChange={(e) => setNewMedForm({ ...newMedForm, genericName: e.target.value })}
                    placeholder="e.g. Ciprofloxacin HCl"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dosage & Strength
                  </label>
                  <input
                    type="text"
                    value={newMedForm.dosage}
                    onChange={(e) => setNewMedForm({ ...newMedForm, dosage: e.target.value })}
                    placeholder="e.g. 500mg"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dosage Form
                  </label>
                  <select
                    value={newMedForm.form}
                    onChange={(e) => setNewMedForm({ ...newMedForm, form: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 bg-white"
                  >
                    <option value="Tablet">Tablet</option>
                    <option value="Capsule">Capsule</option>
                    <option value="Syrup">Syrup</option>
                    <option value="Inhaler">Inhaler</option>
                    <option value="Injection">Injection</option>
                    <option value="Ointment">Ointment</option>
                    <option value="Drops">Drops</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Drug Category
                  </label>
                  <select
                    value={newMedForm.category}
                    onChange={(e) => setNewMedForm({ ...newMedForm, category: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 bg-white"
                  >
                    <option value="Antibiotics">Antibiotics</option>
                    <option value="Cardiovascular">Cardiovascular</option>
                    <option value="Pain & Analgesics">Pain & Analgesics</option>
                    <option value="Respiratory">Respiratory</option>
                    <option value="Gastrointestinal">Gastrointestinal</option>
                    <option value="Diabetes">Diabetes</option>
                    <option value="OTC & First Aid">OTC & First Aid</option>
                    <option value="Vitamins & Supplements">Vitamins & Supplements</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Selling Price (KSh)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newMedForm.price}
                    onChange={(e) => setNewMedForm({ ...newMedForm, price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Initial Stock
                  </label>
                  <input
                    type="number"
                    value={newMedForm.stock}
                    onChange={(e) => setNewMedForm({ ...newMedForm, stock: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Min Stock Threshold
                  </label>
                  <input
                    type="number"
                    value={newMedForm.minStockLevel}
                    onChange={(e) => setNewMedForm({ ...newMedForm, minStockLevel: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Prescription Required?
                  </label>
                  <select
                    value={newMedForm.isPrescriptionRequired ? 'true' : 'false'}
                    onChange={(e) => setNewMedForm({ ...newMedForm, isPrescriptionRequired: e.target.value === 'true' })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 bg-white font-semibold"
                  >
                    <option value="true">Yes - Rx Required</option>
                    <option value="false">No - OTC (Over The Counter)</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    NDC Barcode Number
                  </label>
                  <input
                    type="text"
                    value={newMedForm.barcode}
                    onChange={(e) => setNewMedForm({ ...newMedForm, barcode: e.target.value })}
                    placeholder="e.g. 00093-2264-01"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-xs transition"
                >
                  Save & Add to Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Delete Item Confirmation Modal */}
      {medicationToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 no-print">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Remove Medication</h3>
                <p className="text-xs text-slate-500">Delete from active pharmacy inventory catalog</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
              <div>
                Item: <strong className="text-slate-900">{medicationToDelete.name}</strong>
              </div>
              <div>
                NDC/Barcode: <span className="font-mono">{medicationToDelete.barcode}</span>
              </div>
              <div>
                Current Stock on Hand: <strong className="text-amber-700">{medicationToDelete.stock} units</strong>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to permanently remove this pharmaceutical item? This action is reserved for administrators and will remove it from POS searches.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setMedicationToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteMedication && medicationToDelete) {
                    onDeleteMedication(medicationToDelete.id);
                  }
                  setMedicationToDelete(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition"
              >
                Confirm Deletion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
