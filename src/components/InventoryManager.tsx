import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Barcode,
  Boxes,
  Calendar,
  Check,
  CheckCircle,
  Edit2,
  Filter,
  PackagePlus,
  Pill,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import { Medication, MedicationCategory, UserRole } from '../types';
import { formatKSh } from '../utils/currency';

interface InventoryManagerProps {
  medications: Medication[];
  onUpdateMedication: (updated: Medication) => void;
  onAddMedication: (newItem: Medication) => void;
  onDeleteMedication?: (id: string) => void;
  onAddToCart: (medication: Medication) => void;
  userRole: UserRole;
  onRequestRoleSwitch: () => void;
}

export const InventoryManager: React.FC<InventoryManagerProps> = ({
  medications,
  onUpdateMedication,
  onAddMedication,
  onDeleteMedication,
  onAddToCart,
  userRole,
  onRequestRoleSwitch,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'low' | 'rx' | 'otc' | 'expiring'>('all');

  // Modals
  const [editingMedication, setEditingMedication] = useState<Medication | null>(null);
  const [restockMedication, setRestockMedication] = useState<Medication | null>(null);
  const [medicationToDelete, setMedicationToDelete] = useState<Medication | null>(null);
  const [restockQty, setRestockQty] = useState<number>(50);
  const [restockBatch, setRestockBatch] = useState<string>('');
  const [restockExpiry, setRestockExpiry] = useState<string>('2028-06-30');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

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
    const now = new Date('2026-09-08').getTime();
    const days = (exp - now) / (1000 * 60 * 60 * 24);
    return days <= 180 && days > 0;
  };

  const isExpired = (dateStr: string) => {
    const exp = new Date(dateStr).getTime();
    const now = new Date('2026-09-08').getTime();
    return exp < now;
  };

  // Filtered medications
  const filtered = medications.filter((med) => {
    // Search filter
    const matchesSearch =
      med.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      med.genericName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      med.barcode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      med.batchNumber.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    // Category filter
    if (categoryFilter !== 'All' && med.category !== categoryFilter) return false;

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
              <span>Cashier View-Only</span>
              <button
                onClick={onRequestRoleSwitch}
                className="underline hover:text-teal-800 font-bold ml-1 text-teal-700"
              >
                Switch to Admin
              </button>
            </div>
          ) : (
            <button
              id="add-medication-btn"
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-xs transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Add Medication
            </button>
          )}
        </div>
      </div>

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
              onClick={() => setStockStatusFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                stockStatusFilter === 'all'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Items ({medications.length})
            </button>
            <button
              onClick={() => setStockStatusFilter('low')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                stockStatusFilter === 'low'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Low Stock ({lowStockItems.length})
            </button>
            <button
              onClick={() => setStockStatusFilter('rx')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                stockStatusFilter === 'rx'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Rx Only
            </button>
            <button
              onClick={() => setStockStatusFilter('otc')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                stockStatusFilter === 'otc'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              OTC Products
            </button>
            <button
              onClick={() => setStockStatusFilter('expiring')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                stockStatusFilter === 'expiring'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Expiring Soon
            </button>
          </div>
        </div>
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
