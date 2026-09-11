import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Download,
  Filter,
  History,
  Search,
  Shield,
  Tag,
  User as UserIcon,
} from 'lucide-react';
import { AuditLog, User } from '../types';

interface AuditLogsViewProps {
  logs: AuditLog[];
  currentUser: User;
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ logs, currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const categories = ['ALL', 'AUTH', 'USERS', 'INVENTORY', 'SALES', 'SETTINGS'];

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.userName.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (categoryFilter !== 'ALL' && log.category !== categoryFilter) return false;
    return true;
  });

  const handleExportCSV = () => {
    const headers = ['Timestamp', 'Action', 'Category', 'User Name', 'User Role', 'Details'];
    const rows = filteredLogs.map((log) => [
      new Date(log.timestamp).toLocaleString(),
      log.action,
      log.category,
      `"${log.userName.replace(/"/g, '""')}"`,
      log.userRole,
      `"${log.details.replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `RG_Pharma_POS_AuditLogs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'AUTH':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'USERS':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'INVENTORY':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'SALES':
        return 'bg-teal-100 text-teal-800 border-teal-200';
      case 'SETTINGS':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 uppercase tracking-wider">
              Admin Compliance
            </span>
            <span className="text-xs text-slate-500">• {logs.length} Recorded Activity Logs</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">System Audit & Activity Trail</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-xl">
            Immutable chronological record of logins, role updates, pricing modifications, inventory adjustments, and sales.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 px-4 py-2.5 rounded-2xl text-xs font-bold transition min-h-[44px]"
        >
          <Download className="w-4 h-4" />
          <span>Export Audit Log (CSV)</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search audit trail by action, details, or user..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-600 focus:border-teal-600 outline-none transition"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition ${
                categoryFilter === cat
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Responsive View: Cards on Mobile (<md) vs Table on Desktop (md+) */}
      
      {/* Mobile Cards (<md) */}
      <div className="block md:hidden space-y-3">
        {filteredLogs.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400">
            No audit records matching your criteria.
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border uppercase ${getCategoryColor(
                    log.category
                  )}`}
                >
                  {log.category}
                </span>
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} •{' '}
                  {new Date(log.timestamp).toLocaleDateString()}
                </span>
              </div>

              <div>
                <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                  {log.action}
                </span>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{log.details}</p>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-1.5 font-medium">
                  <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span>{log.userName}</span>
                </div>
                <span className="font-bold text-[10px] text-slate-400 uppercase">{log.userRole}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table (md+) */}
      <div className="hidden md:block bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-5">Timestamp</th>
                <th className="py-3.5 px-4">Action</th>
                <th className="py-3.5 px-4">Category</th>
                <th className="py-3.5 px-4">Actor / User</th>
                <th className="py-3.5 px-5">Event Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    No audit records matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-5 text-xs text-slate-500 whitespace-nowrap">
                      <div>{new Date(log.timestamp).toLocaleDateString()}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${getCategoryColor(
                          log.category
                        )}`}
                      >
                        {log.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-bold text-xs text-slate-800">{log.userName}</div>
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">{log.userRole}</div>
                    </td>
                    <td className="py-3.5 px-5 text-xs text-slate-600 leading-relaxed max-w-md">
                      {log.details}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
