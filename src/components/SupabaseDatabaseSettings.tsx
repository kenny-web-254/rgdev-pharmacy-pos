import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Download,
  ExternalLink,
  KeyRound,
  RefreshCw,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { supabaseConfig, testSupabaseConnection } from '../services/supabase';

interface SupabaseDatabaseSettingsProps {
  isAdmin: boolean;
}

export const SupabaseDatabaseSettings: React.FC<SupabaseDatabaseSettingsProps> = ({ isAdmin }) => {
  const [urlInput, setUrlInput] = useState(supabaseConfig.getUrl());
  const [anonKeyInput, setAnonKeyInput] = useState(supabaseConfig.getAnonKey());
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isConfigured = supabaseConfig.isConfigured();

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testSupabaseConnection();
      setTestResult(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({ ok: false, message: `Error: ${msg}` });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    supabaseConfig.setCredentials(urlInput, anonKeyInput);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
    handleTestConnection();
  };

  const handleCopySchema = async () => {
    try {
      const response = await fetch('/supabase/schema.sql');
      let sqlText = '';
      if (response.ok) {
        sqlText = await response.text();
      } else {
        sqlText = `-- Supabase Schema for Pharmacy POS\n-- Tables: pharmacy_users, medications, prescriptions, sale_transactions, audit_logs, receipt_settings`;
      }
      await navigator.clipboard.writeText(sqlText);
      setCopiedSchema(true);
      setTimeout(() => setCopiedSchema(false), 2500);
    } catch (e) {
      console.error('Failed to copy schema', e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cloud Status Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center text-white ${
                isConfigured ? 'bg-teal-600' : 'bg-amber-600'
              } shadow-xs`}
            >
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Supabase Cloud PostgreSQL Database</h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    isConfigured
                      ? 'bg-teal-100 text-teal-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {isConfigured ? 'Configured' : 'Credentials Needed'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time cloud database for persistent catalog, prescriptions, sales records, and users.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-2xs self-start sm:self-auto disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
            <span>{isTesting ? 'Testing Connection...' : 'Test Connection'}</span>
          </button>
        </div>

        {/* Connection status notification */}
        {testResult && (
          <div
            className={`p-4 rounded-xl text-xs font-medium flex items-start gap-2.5 border ${
              testResult.ok
                ? 'bg-teal-50 border-teal-200 text-teal-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            {testResult.ok ? (
              <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="font-bold">{testResult.ok ? 'Connection Verified' : 'Attention Required'}</div>
              <div className="text-[11px] mt-0.5">{testResult.message}</div>
            </div>
          </div>
        )}
      </div>

      {/* Supabase Credentials Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <KeyRound className="w-4 h-4 text-teal-700" />
          <h3 className="text-sm font-bold text-slate-800">Supabase Connection Credentials</h3>
        </div>

        <p className="text-xs text-slate-500">
          Obtain your Supabase credentials from your{' '}
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noreferrer"
            className="text-teal-700 hover:underline font-semibold inline-flex items-center gap-0.5"
          >
            Supabase Project Dashboard <ExternalLink className="w-3 h-3" />
          </a>{' '}
          under <strong>Project Settings &gt; API</strong>.
        </p>

        <form onSubmit={handleSaveCredentials} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              SUPABASE_URL
            </label>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://your-project-id.supabase.co"
              required
              disabled={!isAdmin}
              className="w-full px-3.5 py-2.5 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none disabled:bg-slate-100"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Unique endpoint for your Supabase PostgreSQL instance.
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              SUPABASE_ANON_KEY
            </label>
            <input
              type="text"
              value={anonKeyInput}
              onChange={(e) => setAnonKeyInput(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              required
              disabled={!isAdmin}
              className="w-full px-3.5 py-2.5 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-600 outline-none disabled:bg-slate-100"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">
              Public anon/client API key safe for client-side queries with Row Level Security (RLS).
            </span>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div className="text-xs font-bold text-slate-700 mb-0.5">SUPABASE_SERVICE_ROLE_KEY</div>
            <p className="text-[11px] text-slate-500">
              For administrative backend tasks and migrations. Never expose the service role key to the browser client; keep it securely in server environment variables.
            </p>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              >
                Save & Connect
              </button>
              {saveSuccess && (
                <span className="text-xs text-teal-700 font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Credentials saved!
                </span>
              )}
            </div>
          )}
        </form>
      </div>

      {/* SQL Setup & Migration Instructions */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-teal-700" />
            <h3 className="text-sm font-bold text-slate-800">Database Tables & SQL Setup Script</h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopySchema}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
            >
              {copiedSchema ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSchema ? 'Copied SQL!' : 'Copy SQL Script'}</span>
            </button>
            <a
              href="/supabase/schema.sql"
              download="schema.sql"
              className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .sql</span>
            </a>
          </div>
        </div>

        <div className="space-y-3 text-xs text-slate-600">
          <p className="font-semibold text-slate-800">How to execute the schema in Supabase:</p>
          <ol className="list-decimal list-inside space-y-1.5 text-[11px] leading-relaxed pl-1 text-slate-600">
            <li>
              Log in to your <strong>Supabase Dashboard</strong> and open your project.
            </li>
            <li>
              Navigate to the <strong>SQL Editor</strong> tab on the left sidebar.
            </li>
            <li>
              Click <strong>&quot;New query&quot;</strong>, then paste the complete schema script (or open <code>supabase/schema.sql</code>).
            </li>
            <li>
              Click <strong>&quot;Run&quot;</strong>. This creates all 6 core tables with indexes, types, and Row Level Security policies:
            </li>
          </ol>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-2">
            {[
              { name: 'pharmacy_users', desc: 'Staff accounts, roles, hashed credentials' },
              { name: 'medications', desc: 'Drug catalog, dosage, barcodes, live stock levels' },
              { name: 'prescriptions', desc: 'Rx scripts, doctor license, refills, co-pays' },
              { name: 'sale_transactions', desc: 'Receipts, tender breakdown, M-Pesa records' },
              { name: 'audit_logs', desc: 'Immutable compliance trail and actions' },
              { name: 'receipt_settings', desc: 'Pharmacy business identity and tax PIN' },
            ].map((tbl) => (
              <div key={tbl.name} className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="font-mono text-xs font-bold text-teal-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                  <span>{tbl.name}</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1 leading-snug">{tbl.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
