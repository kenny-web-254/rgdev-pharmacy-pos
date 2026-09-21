import React, { useState } from 'react';
import { Database, Printer, Save, Trash2 } from 'lucide-react';
import type { ReceiptSettings, UserRole } from '../types';
import { SupabaseDatabaseSettings } from './SupabaseDatabaseSettings';

interface ReceiptSettingsViewProps {
  settings: ReceiptSettings;
  onSaveSettings: (settings: ReceiptSettings) => void;
  userRole: UserRole;
  onResetSystemData?: () => void;
  medicationCount?: number;
  transactionCount?: number;
  prescriptionCount?: number;
  auditLogCount?: number;
}

export const ReceiptSettingsView: React.FC<ReceiptSettingsViewProps> = ({ settings, onSaveSettings, userRole, onResetSystemData }) => {
  const [form, setForm] = useState<ReceiptSettings>({ ...settings });
  const [tab, setTab] = useState<'receipt' | 'database'>('receipt');
  const admin = userRole === 'admin';
  const update = <K extends keyof ReceiptSettings>(key: K, value: ReceiptSettings[K]) => setForm((p) => ({ ...p, [key]: value }));
  const save = () => { if (admin) onSaveSettings(form); };

  return <div className="space-y-6">
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-lg font-bold text-slate-900">Admin Settings & Receipt Customization</h1><p className="text-xs text-slate-500">Configure pharmacy identity and receipt output.</p></div>
      {admin && <button type="button" onClick={save} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-700 text-white text-sm font-semibold"><Save className="w-4 h-4" /> Save Changes</button>}
    </div>
    <div className="flex gap-2 border-b border-slate-200 pb-2">
      <button type="button" onClick={() => setTab('receipt')} className={`px-4 py-2 rounded-xl text-xs font-bold ${tab === 'receipt' ? 'bg-teal-700 text-white' : 'hover:bg-slate-100'}`}><Printer className="w-4 h-4 inline mr-2" />Receipt Customization</button>
      <button type="button" onClick={() => setTab('database')} className={`px-4 py-2 rounded-xl text-xs font-bold ${tab === 'database' ? 'bg-teal-700 text-white' : 'hover:bg-slate-100'}`}><Database className="w-4 h-4 inline mr-2" />Supabase Database</button>
    </div>
    {tab === 'database' ? <SupabaseDatabaseSettings isAdmin={admin} /> : <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {([['pharmacyName','Pharmacy Name'],['tagline','Tagline'],['addressLine1','Address'],['addressLine2','Address Line 2'],['phone','Phone'],['email','Email'],['licenseNumber','License Number'],['headerMessage','Receipt Header'],['footerMessage','Receipt Footer'],['returnPolicy','Return Policy'],['emergencyPhone','Emergency Phone']] as const).map(([key,label]) => <label key={key} className="text-xs font-semibold text-slate-700">{label}<input disabled={!admin} value={String(form[key] ?? '')} onChange={(e) => update(key, e.target.value as never)} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm disabled:bg-slate-100" /></label>)}
        <label className="text-xs font-semibold text-slate-700">Paper Width<select disabled={!admin} value={form.paperWidth} onChange={(e) => update('paperWidth', e.target.value as '58mm' | '80mm')} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"><option value="80mm">80mm</option><option value="58mm">58mm</option></select></label>
      </div>
      {admin && onResetSystemData && <div className="pt-4 border-t border-rose-100"><button type="button" onClick={onResetSystemData} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold"><Trash2 className="w-4 h-4" />Reset System Data</button></div>}
    </div>}
  </div>;
};
