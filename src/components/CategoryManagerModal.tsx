import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, FolderPlus, Plus, Tag, Tags, Trash2, X } from 'lucide-react';
import { Medication, UserRole } from '../types';
import { storageService } from '../services/storage';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  medications: Medication[];
  onCategoriesChange: (updatedCategories: string[]) => void;
  userRole: UserRole;
}

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
  categories,
  medications,
  onCategoriesChange,
  userRole,
}) => {
  const [newCatName, setNewCatName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

  if (!isOpen) return null;

  const isAdmin = userRole === 'admin';

  // Compute medication counts per category
  const categoryCounts = new Map<string, number>();
  medications.forEach((m) => {
    if (m.category) {
      const cat = m.category.trim();
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    }
  });

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmed = newCatName.trim();
    if (!trimmed) {
      setError('Please enter a valid category name.');
      return;
    }

    if (categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setError(`Category "${trimmed}" already exists in the catalog.`);
      return;
    }

    const updated = storageService.addCategory(trimmed);
    onCategoriesChange(updated);

    const currentUser = storageService.getActiveUser();
    if (currentUser) {
      storageService.addAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CATEGORY_ADDED',
        details: `Created new medication category: "${trimmed}"`,
        category: 'INVENTORY',
      });
    }

    setNewCatName('');
    setSuccess(`Category "${trimmed}" successfully added.`);
    setTimeout(() => setSuccess(null), 3500);
  };

  const handleConfirmDelete = (catName: string) => {
    const updated = storageService.deleteCategory(catName);
    onCategoriesChange(updated);

    const currentUser = storageService.getActiveUser();
    if (currentUser) {
      storageService.addAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CATEGORY_DELETED',
        details: `Deleted medication category: "${catName}"`,
        category: 'INVENTORY',
      });
    }

    setCategoryToDelete(null);
    setSuccess(`Category "${catName}" deleted.`);
    setTimeout(() => setSuccess(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 no-print">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-100/80 text-teal-800">
              <Tags className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Manage Medication Categories</h3>
              <p className="text-xs text-slate-500">
                Organize pharmaceutical classes, formulary lines, and OTC departments
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/80 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Add Category Form (Admin only) */}
          {isAdmin ? (
            <div className="bg-teal-50/60 border border-teal-200/80 rounded-2xl p-4">
              <span className="text-xs font-bold text-teal-950 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                <FolderPlus className="w-3.5 h-3.5 text-teal-700" />
                Add New Drug Category
              </span>
              <form onSubmit={handleAddCategory} className="flex gap-2">
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="e.g. Ophthalmology, Dermatology, Antimalarials..."
                  className="flex-1 px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-medium"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Category</span>
                </button>
              </form>

              {error && (
                <div className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{success}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>Category creation and modifications require Administrator privileges.</span>
            </div>
          )}

          {/* Categories List */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Active Categories ({categories.length})
              </span>
              <span className="text-[11px] text-slate-500">
                {medications.length} total inventory items
              </span>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
              {categories.map((cat) => {
                const count = categoryCounts.get(cat) || 0;
                return (
                  <div
                    key={cat}
                    className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <Tag className="w-3.5 h-3.5 text-teal-600" />
                      <span className="font-bold text-slate-800">{cat}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          count > 0
                            ? 'bg-slate-100 text-slate-700'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {count} {count === 1 ? 'item' : 'items'}
                      </span>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setCategoryToDelete(cat)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title={`Delete category ${cat}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition"
          >
            Close
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {categoryToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2 bg-rose-100 rounded-xl">
                <AlertCircle className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900">Delete Category?</h4>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete category <strong>"{categoryToDelete}"</strong>?
              {categoryCounts.get(categoryToDelete) ? (
                <span className="block mt-1 text-rose-600 font-semibold">
                  Warning: {categoryCounts.get(categoryToDelete)} medication(s) currently belong to this category.
                </span>
              ) : null}
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCategoryToDelete(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDelete(categoryToDelete)}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition"
              >
                Delete Category
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
