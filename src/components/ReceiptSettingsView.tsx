import React, { useState } from 'react';
import {
  Check,
  FileText,
  Lock,
  Printer,
  RotateCcw,
  Save,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { ReceiptSettings, UserRole } from '../types';
import { INITIAL_RECEIPT_SETTINGS } from '../data/mockData';

interface ReceiptSettingsViewProps {
  settings: ReceiptSettings;
  onSaveSettings: (settings: ReceiptSettings) => void;
  userRole: UserRole;
  onRequestRoleSwitch: () => void;
}

export const ReceiptSettingsView: React.FC<ReceiptSettingsViewProps> = ({
  settings,
  onSaveSettings,
  userRole,
  onRequestRoleSwitch,
}) => {
  const [formData, setFormData] = useState<ReceiptSettings>({ ...settings });
  const [savedSuccess, setSavedSuccess] = useState(false);

  const isAdmin = userRole === 'admin';

  const handleChange = <K extends keyof ReceiptSettings>(
    key: K,
    value: ReceiptSettings[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    onSaveSettings(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleReset = () => {
    if (!isAdmin) return;
    setFormData({ ...INITIAL_RECEIPT_SETTINGS });
  };

  const handleTestPrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Receipt Customization & Thermal Printer Settings</h1>
            <p className="text-xs text-slate-500">
              Customize pharmacy identity, legal disclaimers, layout, and paper width for thermal receipts
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isAdmin && (
            <div className="flex items-center gap-2 bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-xl text-xs font-semibold">
              <Lock className="w-4 h-4 text-amber-600" />
              <span>Cashier View-Only</span>
              <button
                onClick={onRequestRoleSwitch}
                className="underline hover:text-amber-950 font-bold ml-1"
              >
                Switch to Admin
              </button>
            </div>
          )}

          {isAdmin && (
            <>
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Reset Defaults</span>
              </button>
              <button
                type="button"
                id="save-receipt-settings-btn"
                onClick={handleSave}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-xs transition active:scale-95"
              >
                {savedSuccess ? <Check className="w-4 h-4 text-white" /> : <Save className="w-4 h-4" />}
                <span>{savedSuccess ? 'Settings Saved!' : 'Save Changes'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: Form configuration */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <form onSubmit={handleSave} className="space-y-6">
            {/* Section 1: Store & Pharmacy Identity */}
            <div>
              <h2 className="text-sm font-bold text-slate-900 mb-3 pb-2 border-b border-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" />
                Pharmacy Branding & Details
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Pharmacy Legal / DBA Name
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={formData.pharmacyName}
                    onChange={(e) => handleChange('pharmacyName', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 font-medium"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tagline / Subtitle
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={formData.tagline}
                    onChange={(e) => handleChange('tagline', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Address Line 1
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={formData.addressLine1}
                    onChange={(e) => handleChange('addressLine1', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    City, State, ZIP
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={formData.addressLine2}
                    onChange={(e) => handleChange('addressLine2', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={formData.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    disabled={!isAdmin}
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Pharmacy License / DEA Number
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={formData.licenseNumber}
                    onChange={(e) => handleChange('licenseNumber', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tax ID / EIN
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={formData.taxId}
                    onChange={(e) => handleChange('taxId', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Printer & Paper Setup */}
            <div>
              <h2 className="text-sm font-bold text-slate-900 mb-3 pb-2 border-b border-slate-100 flex items-center gap-2">
                <Printer className="w-4 h-4 text-teal-600" />
                Thermal Paper & Tax Format
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Thermal Paper Width
                  </label>
                  <select
                    disabled={!isAdmin}
                    value={formData.paperWidth}
                    onChange={(e) => handleChange('paperWidth', e.target.value as '80mm' | '58mm')}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 bg-white"
                  >
                    <option value="80mm">80mm (Standard POS Receipt)</option>
                    <option value="58mm">58mm (Compact Mobile Thermal)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Sales Tax Rate (% decimal, e.g. 0.06 = 6%)
                  </label>
                  <input
                    type="number"
                    step="0.005"
                    min="0"
                    max="0.30"
                    disabled={!isAdmin}
                    value={formData.taxRate}
                    onChange={(e) => handleChange('taxRate', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Custom Messages & Disclaimers */}
            <div>
              <h2 className="text-sm font-bold text-slate-900 mb-3 pb-2 border-b border-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-600" />
                Custom Messages & Disclaimers
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Header Greeting Message
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={formData.headerMessage}
                    onChange={(e) => handleChange('headerMessage', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Footer Medication Safety Message
                  </label>
                  <textarea
                    rows={2}
                    disabled={!isAdmin}
                    value={formData.footerMessage}
                    onChange={(e) => handleChange('footerMessage', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Prescription Return Policy Notice
                  </label>
                  <textarea
                    rows={2}
                    disabled={!isAdmin}
                    value={formData.returnPolicy}
                    onChange={(e) => handleChange('returnPolicy', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Emergency Helpline / Poison Control
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={formData.emergencyPhone}
                    onChange={(e) => handleChange('emergencyPhone', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: Display Options Toggles */}
            <div>
              <h2 className="text-sm font-bold text-slate-900 mb-3 pb-2 border-b border-slate-100">
                Itemized Receipt Element Toggles
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={formData.showGenericName}
                    onChange={(e) => handleChange('showGenericName', e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 block">Show Generic Name</span>
                    <span className="text-[11px] text-slate-500">Prints chemical/generic drug name</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={formData.showPrescriptionDetails}
                    onChange={(e) => handleChange('showPrescriptionDetails', e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 block">Show Rx Number</span>
                    <span className="text-[11px] text-slate-500">Prints Rx reference for insurance</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={formData.showPharmacistName}
                    onChange={(e) => handleChange('showPharmacistName', e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 block">Show Dispenser Name</span>
                    <span className="text-[11px] text-slate-500">Prints cashier/pharmacist on duty</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={formData.showBarcode}
                    onChange={(e) => handleChange('showBarcode', e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 block">Print Bottom Barcode</span>
                    <span className="text-[11px] text-slate-500">Includes scannable transaction barcode</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={formData.showTaxBreakdown}
                    onChange={(e) => handleChange('showTaxBreakdown', e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 block">Tax Breakdown</span>
                    <span className="text-[11px] text-slate-500">Shows subtotal and tax percentage</span>
                  </div>
                </label>
              </div>
            </div>

            {isAdmin && (
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="flex items-center gap-2 px-6 py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm rounded-xl shadow-sm transition active:scale-95"
                >
                  <Save className="w-4 h-4" />
                  Save Receipt Customization
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Right column: Live Interactive Thermal Receipt Preview */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-full bg-slate-900 text-white px-4 py-2.5 rounded-t-2xl flex items-center justify-between">
            <span className="text-xs font-bold flex items-center gap-2">
              <Printer className="w-4 h-4 text-teal-400" />
              Live Thermal Output Preview ({formData.paperWidth})
            </span>
            <button
              onClick={handleTestPrint}
              className="text-[11px] bg-teal-700 hover:bg-teal-600 text-white font-semibold px-2.5 py-1 rounded-lg transition"
            >
              Test Print
            </button>
          </div>

          <div className="w-full bg-slate-200 p-6 rounded-b-2xl border border-slate-300 flex justify-center overflow-x-auto shadow-inner">
            <div
              className={`bg-white text-black p-5 shadow-xl border border-slate-300 font-mono-receipt text-[11px] leading-snug transition-all ${
                formData.paperWidth === '58mm' ? 'w-[250px]' : 'w-[310px]'
              }`}
            >
              {/* Header */}
              <div className="text-center pb-2.5 border-b border-dashed border-slate-400 space-y-0.5">
                <h3 className="font-bold text-sm tracking-wider uppercase m-0">
                  {formData.pharmacyName || 'PHARMACY NAME'}
                </h3>
                <p className="text-[10px] text-slate-600">{formData.tagline}</p>
                <p className="text-[10px] text-slate-600">{formData.addressLine1}</p>
                <p className="text-[10px] text-slate-600">{formData.addressLine2}</p>
                <p className="text-[10px] text-slate-600">Tel: {formData.phone}</p>
                <p className="text-[9px] text-slate-500">{formData.licenseNumber}</p>
                {formData.taxId && <p className="text-[9px] text-slate-500">{formData.taxId}</p>}
                {formData.headerMessage && (
                  <p className="text-[9px] font-semibold text-slate-700 pt-1">
                    "{formData.headerMessage}"
                  </p>
                )}
              </div>

              {/* Sample Meta */}
              <div className="py-2 border-b border-dashed border-slate-400 text-[10px] space-y-0.5">
                <div className="flex justify-between">
                  <span>RECEIPT:</span>
                  <span className="font-bold">#RX-2026-9041</span>
                </div>
                <div className="flex justify-between">
                  <span>DATE:</span>
                  <span>{new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {formData.showPharmacistName && (
                  <div className="flex justify-between">
                    <span>DISPENSER:</span>
                    <span>Dr. Sarah Jenkins, PharmD</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>PAYMENT:</span>
                  <span className="font-bold">Credit/Debit Card</span>
                </div>
                <div className="flex justify-between">
                  <span>PATIENT:</span>
                  <span>Eleanor Vance</span>
                </div>
              </div>

              {/* Sample Items */}
              <div className="py-2 border-b border-dashed border-slate-400 space-y-2">
                <div className="space-y-0.5">
                  <div className="flex justify-between font-bold">
                    <span>Amoxicillin 500mg</span>
                    <span>$18.50</span>
                  </div>
                  {formData.showGenericName && (
                    <div className="text-[9px] text-slate-500 italic">Gen: Amoxicillin Trihydrate</div>
                  )}
                  <div className="flex justify-between text-[10px] text-slate-600">
                    <span>1 x $18.50</span>
                    {formData.showPrescriptionDetails && (
                      <span className="bg-slate-100 font-bold px-1 rounded text-[9px]">Rx: RX-80219</span>
                    )}
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="flex justify-between font-bold">
                    <span>Ibuprofen 400mg Forte</span>
                    <span>$8.75</span>
                  </div>
                  {formData.showGenericName && (
                    <div className="text-[9px] text-slate-500 italic">Gen: Ibuprofen</div>
                  )}
                  <div className="flex justify-between text-[10px] text-slate-600">
                    <span>1 x $8.75</span>
                    <span className="text-[9px] text-slate-500">OTC Item</span>
                  </div>
                </div>
              </div>

              {/* Sample Totals */}
              <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>SUBTOTAL:</span>
                  <span>$27.25</span>
                </div>
                {formData.showTaxBreakdown && (
                  <div className="flex justify-between text-slate-600">
                    <span>TAX ({Math.round(formData.taxRate * 100)}%):</span>
                    <span>${(27.25 * formData.taxRate).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm pt-1 border-t border-slate-300">
                  <span>TOTAL:</span>
                  <span>${(27.25 * (1 + formData.taxRate)).toFixed(2)}</span>
                </div>
              </div>

              {/* Sample Footer */}
              <div className="pt-2.5 text-center space-y-1 text-[9px] text-slate-600">
                <p className="font-semibold">{formData.footerMessage}</p>
                {formData.returnPolicy && <p className="text-[8px] text-slate-500 leading-tight">{formData.returnPolicy}</p>}
                <p className="font-bold text-slate-800">{formData.emergencyPhone}</p>

                {formData.showBarcode && (
                  <div className="pt-2 flex flex-col items-center">
                    <div className="h-8 w-36 bg-slate-100 border border-slate-300 flex items-center justify-center font-mono tracking-widest text-[9px] font-bold">
                      |||||||||||||||||||||||
                    </div>
                    <span className="text-[8px] font-mono text-slate-500 mt-0.5">*RX-2026-9041*</span>
                  </div>
                )}

                <p className="text-[8px] text-slate-400 pt-1">*** END OF RECEIPT ***</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
