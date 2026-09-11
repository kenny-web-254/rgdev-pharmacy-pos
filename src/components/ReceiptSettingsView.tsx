import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Database,
  FileText,
  Image as ImageIcon,
  Lock,
  Printer,
  RotateCcw,
  Save,
  Sliders,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { ReceiptSettings, UserRole } from '../types';
import { INITIAL_RECEIPT_SETTINGS } from '../data/mockData';
import { SupabaseDatabaseSettings } from './SupabaseDatabaseSettings';

const SAMPLE_LOGOS = [
  {
    name: 'Green Rx Cross',
    dataUrl:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><rect width="120" height="120" rx="24" fill="%230f766e"/><path d="M48 24h24v24h24v24H72v24H48V72H24V48h24z" fill="%23ffffff"/><circle cx="60" cy="60" r="8" fill="%230f766e"/></svg>',
  },
  {
    name: 'Mortar & Pestle',
    dataUrl:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><circle cx="60" cy="60" r="56" fill="%231e293b"/><path d="M78 30l-8 8-16-4 12 12-4 4-22-22-6 6 22 22-8 8c-14 3-24 16-24 32h72c0-16-10-29-24-32l8-8 6 6 6-6-8-8z" fill="%23ffffff"/><rect x="36" y="98" width="48" height="6" rx="3" fill="%2314b8a6"/></svg>',
  },
  {
    name: 'Caduceus Rx',
    dataUrl:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><rect width="120" height="120" rx="20" fill="%23047857"/><path d="M60 16c-3 0-5 2-5 5v80c0 3 2 5 5 5s5-2 5-5V21c0-3-2-5-5-5z" fill="%23ffffff"/><path d="M38 32c12 2 18 10 22 18 4-8 10-16 22-18-12 10-14 26-6 38-8-2-12-6-16-12-4 6-8 10-16 12 8-12 6-28-6-38z" fill="%23a7f3d0"/><circle cx="60" cy="18" r="7" fill="%23fbbf24"/></svg>',
  },
];

function processAndOptimizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 200;
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const format = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
        resolve(canvas.toDataURL(format, 0.92));
      };
      img.onerror = () => resolve(e.target?.result as string);
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

interface ReceiptSettingsViewProps {
  settings: ReceiptSettings;
  onSaveSettings: (settings: ReceiptSettings) => void;
  userRole: UserRole;
}

export const ReceiptSettingsView: React.FC<ReceiptSettingsViewProps> = ({
  settings,
  onSaveSettings,
  userRole,
}) => {
  const [subTab, setSubTab] = useState<'receipt' | 'database'>('receipt');
  const [formData, setFormData] = useState<ReceiptSettings>({ ...settings });
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = userRole === 'admin';

  const handleChange = <K extends keyof ReceiptSettings>(
    key: K,
    value: ReceiptSettings[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleFileSelect = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Invalid file type. Please upload an image (PNG, JPG, WebP, SVG).');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setUploadError('File exceeds 3MB limit. Please choose a smaller image.');
      return;
    }
    setUploadError(null);
    try {
      const dataUrl = await processAndOptimizeImage(file);
      setFormData((prev) => ({
        ...prev,
        logoUrl: dataUrl,
        showLogo: true,
        logoHeight: prev.logoHeight || 48,
      }));
    } catch {
      setUploadError('Error processing image. Please try another image.');
    }
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
          {subTab === 'receipt' && !isAdmin && (
            <div className="flex items-center gap-2 bg-slate-100 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold">
              <Lock className="w-4 h-4 text-slate-500" />
              <span>Staff View-Only (Admin permissions required to modify)</span>
            </div>
          )}

          {subTab === 'receipt' && isAdmin && (
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

      {/* Sub-Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setSubTab('receipt')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            subTab === 'receipt'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Printer className="w-4 h-4" />
          <span>Receipt Customization</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('database')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            subTab === 'database'
              ? 'bg-teal-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Supabase Cloud Database & Schema</span>
        </button>
      </div>

      {subTab === 'database' ? (
        <SupabaseDatabaseSettings isAdmin={isAdmin} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: Form configuration */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <form onSubmit={handleSave} className="space-y-6">
            {/* Section: Pharmacy Logo Upload & Thermal Branding */}
            <div className="rounded-2xl border border-slate-200 p-5 bg-slate-50/50 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-teal-600/10 text-teal-700 flex items-center justify-center">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Pharmacy Logo Image</h3>
                    <p className="text-xs text-slate-500">
                      Upload your official pharmacy crest or dispensary logo for thermal receipts
                    </p>
                  </div>
                </div>

                {formData.logoUrl && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      disabled={!isAdmin}
                      checked={formData.showLogo ?? true}
                      onChange={(e) => handleChange('showLogo', e.target.checked)}
                      className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span>Print on Receipts</span>
                  </label>
                )}
              </div>

              {uploadError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Logo Preview & Controls if Logo Exists */}
              {formData.logoUrl ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Standard Color Preview Card */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4 text-center flex flex-col items-center justify-center space-y-2">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Original Color Image
                      </span>
                      <div className="h-20 w-full flex items-center justify-center p-2 rounded-lg bg-slate-50 border border-dashed border-slate-200">
                        <img
                          src={formData.logoUrl}
                          alt="Pharmacy Logo"
                          referrerPolicy="no-referrer"
                          className="max-h-16 max-w-full object-contain"
                        />
                      </div>
                    </div>

                    {/* Thermal Paper Simulation Preview Card */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4 text-center flex flex-col items-center justify-center space-y-2">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Thermal Paper Simulation
                      </span>
                      <div className="h-20 w-full flex items-center justify-center p-2 rounded-lg bg-neutral-100 border border-dashed border-slate-300">
                        <img
                          src={formData.logoUrl}
                          alt="Thermal Simulated Logo"
                          referrerPolicy="no-referrer"
                          className="max-h-16 max-w-full object-contain filter grayscale contrast-125"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Size & Adjustments */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700">Receipt Height:</span>
                      <div className="flex items-center gap-1">
                        {[
                          { label: 'Compact', h: 36 },
                          { label: 'Standard', h: 48 },
                          { label: 'Medium', h: 60 },
                          { label: 'Large', h: 72 },
                        ].map((size) => (
                          <button
                            key={size.h}
                            type="button"
                            disabled={!isAdmin}
                            onClick={() => handleChange('logoHeight', size.h)}
                            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition cursor-pointer ${
                              (formData.logoHeight || 48) === size.h
                                ? 'bg-teal-700 text-white shadow-xs'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            {size.label} ({size.h}px)
                          </button>
                        ))}
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer"
                        >
                          <UploadCloud className="w-3.5 h-3.5" />
                          Change Image
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleChange('logoUrl', '');
                            setUploadError(null);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Empty State Upload Dropzone */
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (isAdmin) setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (!isAdmin) return;
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleFileSelect(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => {
                    if (isAdmin) fileInputRef.current?.click();
                  }}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center transition cursor-pointer ${
                    isDragging
                      ? 'border-teal-500 bg-teal-50/50 scale-[1.01]'
                      : 'border-slate-300 hover:border-teal-500 hover:bg-slate-50/80 bg-white'
                  }`}
                >
                  <div className="w-12 h-12 mx-auto mb-2 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-800">
                    Click to upload or drag & drop pharmacy logo
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    PNG with transparency, SVG, or JPG (max 3MB). High contrast images print best on thermal paper.
                  </p>
                </div>
              )}

              {/* Sample Presets */}
              <div className="pt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">Sample Templates:</span>
                {SAMPLE_LOGOS.map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => {
                      setFormData((prev) => ({
                        ...prev,
                        logoUrl: sample.dataUrl,
                        showLogo: true,
                        logoHeight: prev.logoHeight || 48,
                      }));
                      setUploadError(null);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border border-slate-200 hover:border-teal-500 hover:bg-teal-50/50 text-slate-700 font-medium transition cursor-pointer"
                  >
                    <img
                      src={sample.dataUrl}
                      alt={sample.name}
                      referrerPolicy="no-referrer"
                      className="w-3.5 h-3.5 object-contain rounded-xs"
                    />
                    <span>{sample.name}</span>
                  </button>
                ))}
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                disabled={!isAdmin}
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />
            </div>

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
                    checked={formData.showLogo ?? true}
                    onChange={(e) => handleChange('showLogo', e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 block">Print Pharmacy Logo</span>
                    <span className="text-[11px] text-slate-500">Prints uploaded logo on thermal paper</span>
                  </div>
                </label>

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
                {(formData.showLogo ?? true) && formData.logoUrl && (
                  <div className="flex justify-center pb-1.5">
                    <img
                      src={formData.logoUrl}
                      alt={formData.pharmacyName}
                      referrerPolicy="no-referrer"
                      style={{ maxHeight: `${formData.logoHeight || 48}px` }}
                      className="max-w-[140px] object-contain filter grayscale contrast-125 transition-all"
                    />
                  </div>
                )}
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
      )}
    </div>
  );
};
