import React, { useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  BarChart3,
  Calendar,
  CheckCircle,
  CloudOff,
  DollarSign,
  Download,
  Eye,
  FileText,
  Filter,
  Layers,
  RefreshCw,
  Search,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react';
import { Medication, SaleTransaction, UserRole } from '../types';
import { formatKSh } from '../utils/currency';
import { SalesPerformanceOverview } from './SalesPerformanceOverview';

interface ReportsViewProps {
  transactions: SaleTransaction[];
  medications?: Medication[];
  offlineQueueCount: number;
  onSyncOfflineQueue: () => void;
  onViewReceipt: (transaction: SaleTransaction) => void;
  userRole: UserRole;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  transactions,
  medications = [],
  offlineQueueCount,
  onSyncOfflineQueue,
  onViewReceipt,
  userRole,
}) => {
  const [adminSubView, setAdminSubView] = useState<'performance' | 'ledger' | 'all'>('performance');
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('All');

  const isAdmin = userRole === 'admin';

  // Metrics
  const totalRevenue = transactions.reduce((acc, t) => acc + t.total, 0);
  const averageTransactionValue = transactions.length > 0 ? totalRevenue / transactions.length : 0;
  const totalPrescriptionsDispensed = transactions.reduce(
    (acc, t) => acc + t.items.filter((i) => i.isPrescription).length,
    0
  );
  const totalItemsSold = transactions.reduce(
    (acc, t) => acc + t.items.reduce((sum, item) => sum + item.quantity, 0),
    0
  );

  // Filtered transactions
  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch =
      tx.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.cashierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.patientName && tx.patientName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      tx.items.some((i) => i.name.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;
    if (paymentFilter !== 'All' && tx.paymentMethod !== paymentFilter) return false;
    return true;
  });

  const handleExportCSV = () => {
    if (transactions.length === 0) {
      alert('No sales data to export yet.');
      return;
    }

    const headers = ['Receipt #', 'Date', 'Cashier', 'Payment Method', 'Subtotal (KSh)', 'Discount (KSh)', 'Total (KSh)', 'Status'];
    const rows = transactions.map((t) => [
      t.receiptNumber,
      new Date(t.timestamp).toLocaleString(),
      t.cashierName,
      t.paymentMethod,
      t.subtotal.toFixed(2),
      (t.discount || 0).toFixed(2),
      t.total.toFixed(2),
      t.isOffline ? 'Offline Queued' : 'Synced',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pharmapos_sales_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isAdmin) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-4 max-w-lg mx-auto shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center mx-auto">
          <BarChart3 className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900">Administrator Clearance Required</h2>
        <p className="text-xs text-slate-500">
          Financial sales audit and daily reporting are restricted to Administrator and Supervising Pharmacist roles. Your account does not have authorization to view this module.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-teal-600" />
            Pharmacy Financial Reports & Audit Log
          </h1>
          <p className="text-xs text-slate-500">
            Shift revenue, prescription metrics, offline sync ledger, and printable audits
          </p>
        </div>

        <div className="flex items-center gap-2">
          {offlineQueueCount > 0 && (
            <button
              onClick={onSyncOfflineQueue}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-100 text-amber-900 hover:bg-amber-200 text-xs font-semibold transition"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Sync {offlineQueueCount} Offline Sale{offlineQueueCount > 1 ? 's' : ''}</span>
            </button>
          )}

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-xs transition active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Sub-view Navigation Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            id="tab-subview-performance"
            onClick={() => setAdminSubView('performance')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              adminSubView === 'performance'
                ? 'bg-white text-teal-900 shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="w-4 h-4 text-teal-600" />
            <span>Sales Performance Overview</span>
          </button>

          <button
            type="button"
            id="tab-subview-ledger"
            onClick={() => setAdminSubView('ledger')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              adminSubView === 'ledger'
                ? 'bg-white text-teal-900 shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4 text-slate-600" />
            <span>Transaction Ledger & Receipts</span>
          </button>

          <button
            type="button"
            id="tab-subview-all"
            onClick={() => setAdminSubView('all')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              adminSubView === 'all'
                ? 'bg-white text-teal-900 shadow-xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4 text-slate-600" />
            <span>Combined View</span>
          </button>
        </div>

        <div className="text-[11px] text-slate-500 px-2 font-medium hidden md:block">
          {transactions.length} total logged transactions
        </div>
      </div>

      {/* Visual Analytics: Daily Trends & Top Selling Medications */}
      {(adminSubView === 'performance' || adminSubView === 'all') && (
        <SalesPerformanceOverview
          transactions={transactions}
          medications={medications}
        />
      )}

      {/* Audit Ledger & KPI Cards */}
      {(adminSubView === 'ledger' || adminSubView === 'all') && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-semibold uppercase">Gross Revenue</span>
              <div className="text-2xl font-extrabold text-slate-900 mt-1 font-mono">
                {formatKSh(totalRevenue)}
              </div>
              <div className="text-[11px] text-teal-700 font-medium mt-1 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>{transactions.length} registered transaction{transactions.length === 1 ? '' : 's'}</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-semibold uppercase">Prescriptions Dispensed</span>
              <div className="text-2xl font-extrabold text-teal-800 mt-1">
                {totalPrescriptionsDispensed}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Pharmacist verified & logged
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-semibold uppercase">Total Units Sold</span>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">
                {totalItemsSold}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Deducted from active shelf inventory
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-semibold uppercase">Avg Transaction Value</span>
              <div className="text-2xl font-extrabold text-slate-900 mt-1 font-mono">
                {formatKSh(averageTransactionValue)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Prices are 100% tax-inclusive
              </div>
            </div>
          </div>

      {/* Transactions Ledger */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-3 p-5">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search receipt #, patient, item, or cashier..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto overflow-x-auto text-xs">
            {['All', 'Cash', 'M-Pesa', 'Partial (Cash + M-Pesa)', 'Credit/Debit Card', 'Insurance'].map((m) => (
              <button
                key={m}
                onClick={() => setPaymentFilter(m)}
                className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition ${
                  paymentFilter === m
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold text-[11px]">
                <th className="py-3 px-3">Receipt #</th>
                <th className="py-3 px-3">Date & Time</th>
                <th className="py-3 px-3">Customer / Patient</th>
                <th className="py-3 px-3">Items Dispensed</th>
                <th className="py-3 px-3">Payment</th>
                <th className="py-3 px-3 text-right">Total</th>
                <th className="py-3 px-3 text-center">Sync Status</th>
                <th className="py-3 px-3 text-center">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No transactions recorded yet in this register session.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-3 font-mono font-bold text-teal-800">
                      {tx.receiptNumber}
                    </td>
                    <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                      {new Date(tx.timestamp).toLocaleDateString()} {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-semibold text-slate-800">
                        {tx.patientName || 'Walk-in Customer'}
                      </span>
                      <div className="text-[10px] text-slate-400">Cashier: {tx.cashierName}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-medium text-slate-700">
                        {tx.items.length} item{tx.items.length === 1 ? '' : 's'}
                      </span>
                      <div className="text-[10px] text-slate-400 truncate max-w-[180px]">
                        {tx.items.map((i) => i.name).join(', ')}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-700">
                      {tx.paymentMethod}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-slate-900 text-sm font-mono">
                      {formatKSh(tx.total)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {tx.isOffline ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                          <CloudOff className="w-3 h-3" /> Offline Queued
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                          <CheckCircle className="w-3 h-3" /> Synced
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => onViewReceipt(tx)}
                        className="p-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 transition"
                        title="View / Print Receipt"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  );
};
