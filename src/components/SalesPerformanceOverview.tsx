import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  FileCheck,
  Filter,
  Layers,
  PackageCheck,
  Pill,
  Smartphone,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Medication, SaleTransaction } from '../types';
import { formatCompactKSh, formatKSh } from '../utils/currency';

interface SalesPerformanceOverviewProps {
  transactions: SaleTransaction[];
  medications: Medication[];
}

type TimeRange = '7d' | '14d' | '30d' | 'all';
type TrendViewMode = 'revenue' | 'orders' | 'both';
type TopRankingMode = 'revenue' | 'volume';

export const SalesPerformanceOverview: React.FC<SalesPerformanceOverviewProps> = ({
  transactions,
  medications,
}) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('14d');
  const [trendView, setTrendView] = useState<TrendViewMode>('revenue');
  const [topRankMode, setTopRankMode] = useState<TopRankingMode>('revenue');
  const [topCount, setTopCount] = useState<5 | 10>(5);

  // Filter transactions according to selected time range
  const { filteredTransactions, dateRangeLabel } = useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return { filteredTransactions: [], dateRangeLabel: 'No data' };
    }

    // Sort transactions by timestamp ascending
    const sorted = [...transactions].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    if (timeRange === 'all') {
      const firstDate = new Date(sorted[0].timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      const lastDate = new Date(sorted[sorted.length - 1].timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return {
        filteredTransactions: sorted,
        dateRangeLabel: `${firstDate} – ${lastDate} (All Time)`,
      };
    }

    const daysMap: Record<TimeRange, number> = {
      '7d': 7,
      '14d': 14,
      '30d': 30,
      all: 9999,
    };

    const days = daysMap[timeRange];
    // Base cutoff on the most recent transaction date or current date
    const latestTxTime = new Date(sorted[sorted.length - 1].timestamp).getTime();
    const cutoffTime = latestTxTime - days * 24 * 60 * 60 * 1000;

    const filtered = sorted.filter((tx) => new Date(tx.timestamp).getTime() >= cutoffTime);

    const startLabel = new Date(cutoffTime).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const endLabel = new Date(latestTxTime).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return {
      filteredTransactions: filtered,
      dateRangeLabel: `${startLabel} – ${endLabel}`,
    };
  }, [transactions, timeRange]);

  // Aggregate daily revenue trends
  const dailyTrendsData = useMemo(() => {
    if (filteredTransactions.length === 0) return [];

    // Group transactions by date YYYY-MM-DD
    const map = new Map<
      string,
      {
        date: string;
        displayDate: string;
        rawDate: Date;
        revenue: number;
        orders: number;
        units: number;
        rxRevenue: number;
        otcRevenue: number;
      }
    >();

    filteredTransactions.forEach((tx) => {
      const d = new Date(tx.timestamp);
      const dateKey = d.toISOString().slice(0, 10);
      const displayDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      if (!map.has(dateKey)) {
        map.set(dateKey, {
          date: dateKey,
          displayDate,
          rawDate: d,
          revenue: 0,
          orders: 0,
          units: 0,
          rxRevenue: 0,
          otcRevenue: 0,
        });
      }

      const entry = map.get(dateKey)!;
      entry.revenue += tx.total;
      entry.orders += 1;

      tx.items.forEach((item) => {
        entry.units += item.quantity;
        if (item.isPrescription) {
          entry.rxRevenue += item.totalPrice;
        } else {
          entry.otcRevenue += item.totalPrice;
        }
      });
    });

    // Sort chronologically
    const result = Array.from(map.values()).sort(
      (a, b) => a.rawDate.getTime() - b.rawDate.getTime()
    );

    return result.map((item) => ({
      ...item,
      revenue: Math.round(item.revenue * 100) / 100,
      avgOrderValue: item.orders > 0 ? Math.round((item.revenue / item.orders) * 100) / 100 : 0,
    }));
  }, [filteredTransactions]);

  // Aggregate top-selling medications
  const { topMedications, totalProductsRevenue, totalUnitsSoldAll } = useMemo(() => {
    if (filteredTransactions.length === 0) {
      return { topMedications: [], totalProductsRevenue: 0, totalUnitsSoldAll: 0 };
    }

    const medMap = new Map<
      string,
      {
        id: string;
        name: string;
        genericName: string;
        dosage: string;
        category: string;
        isPrescription: boolean;
        unitsSold: number;
        totalRevenue: number;
        orderCount: number;
        currentStock: number;
        minStockLevel: number;
      }
    >();

    let totalRevenueSum = 0;
    let totalUnitsSum = 0;

    filteredTransactions.forEach((tx) => {
      tx.items.forEach((item) => {
        const key = item.medicationId || item.name;
        totalRevenueSum += item.totalPrice;
        totalUnitsSum += item.quantity;

        if (!medMap.has(key)) {
          // Lookup medication in master inventory for metadata & current stock
          const masterMed = medications.find(
            (m) => m.id === item.medicationId || m.name.toLowerCase() === item.name.toLowerCase()
          );

          medMap.set(key, {
            id: item.medicationId || key,
            name: item.name,
            genericName: item.genericName || masterMed?.genericName || '',
            dosage: item.dosage || masterMed?.dosage || '',
            category: masterMed?.category || 'General Pharma',
            isPrescription: item.isPrescription || masterMed?.isPrescriptionRequired || false,
            unitsSold: 0,
            totalRevenue: 0,
            orderCount: 0,
            currentStock: masterMed?.stock ?? 0,
            minStockLevel: masterMed?.minStockLevel ?? 10,
          });
        }

        const entry = medMap.get(key)!;
        entry.unitsSold += item.quantity;
        entry.totalRevenue += item.totalPrice;
        entry.orderCount += 1;
      });
    });

    const allRanked = Array.from(medMap.values())
      .map((item) => ({
        ...item,
        totalRevenue: Math.round(item.totalRevenue * 100) / 100,
        revenueShare: totalRevenueSum > 0 ? (item.totalRevenue / totalRevenueSum) * 100 : 0,
        // Shortened display name for compact chart axis
        chartLabel: item.name.length > 18 ? item.name.slice(0, 16) + '...' : item.name,
      }))
      .sort((a, b) => {
        if (topRankMode === 'revenue') {
          return b.totalRevenue - a.totalRevenue;
        }
        return b.unitsSold - a.unitsSold;
      });

    return {
      topMedications: allRanked.slice(0, topCount),
      totalProductsRevenue: totalRevenueSum,
      totalUnitsSoldAll: totalUnitsSum,
    };
  }, [filteredTransactions, medications, topRankMode, topCount]);

  // Overall KPI statistics for the period
  const stats = useMemo(() => {
    const totalRev = filteredTransactions.reduce((acc, t) => acc + t.total, 0);
    const orderCount = filteredTransactions.length;
    const aov = orderCount > 0 ? totalRev / orderCount : 0;

    let rxRev = 0;
    let otcRev = 0;
    const paymentBreakdown: Record<string, number> = {};

    filteredTransactions.forEach((tx) => {
      paymentBreakdown[tx.paymentMethod] = (paymentBreakdown[tx.paymentMethod] || 0) + tx.total;
      tx.items.forEach((it) => {
        if (it.isPrescription) rxRev += it.totalPrice;
        else otcRev += it.totalPrice;
      });
    });

    const daysCount = dailyTrendsData.length || 1;
    const dailyAverageRev = totalRev / daysCount;

    // Peak sales day
    let peakDay = { date: 'N/A', revenue: 0 };
    dailyTrendsData.forEach((d) => {
      if (d.revenue > peakDay.revenue) {
        peakDay = { date: d.displayDate, revenue: d.revenue };
      }
    });

    return {
      totalRevenue: totalRev,
      orderCount,
      aov,
      dailyAverageRev,
      rxRevenue: rxRev,
      otcRevenue: otcRev,
      rxPercent: totalRev > 0 ? (rxRev / totalRev) * 100 : 0,
      otcPercent: totalRev > 0 ? (otcRev / totalRev) * 100 : 0,
      peakDay,
      paymentBreakdown,
    };
  }, [filteredTransactions, dailyTrendsData]);

  // Top category distribution
  const topCategories = useMemo(() => {
    const catMap: Record<string, { category: string; revenue: number; units: number }> = {};
    filteredTransactions.forEach((tx) => {
      tx.items.forEach((item) => {
        const masterMed = medications.find((m) => m.id === item.medicationId);
        const cat = masterMed?.category || 'Other';
        if (!catMap[cat]) catMap[cat] = { category: cat, revenue: 0, units: 0 };
        catMap[cat].revenue += item.totalPrice;
        catMap[cat].units += item.quantity;
      });
    });
    return Object.values(catMap).sort((a, b) => b.revenue - a.revenue).slice(0, 4);
  }, [filteredTransactions, medications]);

  return (
    <div className="space-y-6" id="sales-performance-overview-section">
      {/* Top Controls Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Sales Performance & Product Velocity
                <span className="text-[11px] font-semibold bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full">
                  Admin Analytics
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Live turnover trends, transaction velocity, and dispensing analytics
              </p>
            </div>
          </div>
        </div>

        {/* Time Window Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl self-start md:self-auto text-xs">
          {(
            [
              { id: '7d', label: 'Last 7 Days' },
              { id: '14d', label: 'Last 14 Days' },
              { id: '30d', label: 'Last 30 Days' },
              { id: 'all', label: 'All Records' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              id={`filter-timerange-${item.id}`}
              type="button"
              onClick={() => setTimeRange(item.id)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition whitespace-nowrap ${
                timeRange === item.id
                  ? 'bg-white text-teal-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue in Window */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Period Revenue
              </span>
              <span className="text-[11px] font-medium text-slate-400">
                {stats.orderCount} sale{stats.orderCount === 1 ? '' : 's'}
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
              {formatKSh(stats.totalRevenue)}
            </div>
          </div>
          <div className="text-[11px] text-teal-700 font-medium mt-2 flex items-center gap-1 pt-2 border-t border-slate-100">
            <Clock className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            <span>Daily avg: <strong className="font-mono">{formatKSh(stats.dailyAverageRev)}</strong></span>
          </div>
        </div>

        {/* Average Order Value (AOV) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Avg. Basket Size
              </span>
              <span className="text-[11px] font-medium text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded-md">
                Per checkout
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
              {formatKSh(stats.aov)}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-2 flex items-center gap-1 pt-2 border-t border-slate-100">
            <PackageCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Total units sold: <strong className="text-slate-800">{totalUnitsSoldAll}</strong></span>
          </div>
        </div>

        {/* Prescription vs OTC Share */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Rx vs OTC Ratio
              </span>
              <FileCheck className="w-4 h-4 text-teal-600" />
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-extrabold text-teal-800">
                {stats.rxPercent.toFixed(0)}% <span className="text-xs font-semibold text-slate-400">Rx</span>
              </span>
              <span className="text-xs text-slate-300">|</span>
              <span className="text-lg font-bold text-amber-700">
                {stats.otcPercent.toFixed(0)}% <span className="text-xs font-semibold text-slate-400">OTC</span>
              </span>
            </div>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex mt-2">
            <div
              className="bg-teal-600 h-full transition-all duration-500"
              style={{ width: `${stats.rxPercent}%` }}
              title={`Rx: ${formatKSh(stats.rxRevenue)}`}
            />
            <div
              className="bg-amber-500 h-full transition-all duration-500"
              style={{ width: `${stats.otcPercent}%` }}
              title={`OTC: ${formatKSh(stats.otcRevenue)}`}
            />
          </div>
        </div>

        {/* Highest Earning Product */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Top Product
              </span>
              <Award className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-sm font-extrabold text-slate-900 mt-1 truncate" title={topMedications[0]?.name}>
              {topMedications[0]?.name || 'N/A'}
            </div>
            <div className="text-xs font-mono font-bold text-teal-700">
              {topMedications[0] ? formatKSh(topMedications[0].totalRevenue) : '—'}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-2 flex items-center justify-between pt-2 border-t border-slate-100">
            <span>Volume: <strong className="text-slate-800">{topMedications[0]?.unitsSold || 0} units</strong></span>
            <span className="text-[10px] font-semibold text-slate-400">
              {topMedications[0]?.revenueShare.toFixed(1)}% of sales
            </span>
          </div>
        </div>
      </div>

      {/* Main Responsive Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* CHART 1: Daily Revenue Trends (7 Cols) */}
        <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-teal-700" />
                Daily Revenue & Transaction Trends
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {dateRangeLabel} ({dailyTrendsData.length} active sales days)
              </p>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[11px] self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setTrendView('revenue')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                  trendView === 'revenue'
                    ? 'bg-white text-teal-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Revenue (KSh)
              </button>
              <button
                type="button"
                onClick={() => setTrendView('orders')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                  trendView === 'orders'
                    ? 'bg-white text-teal-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Orders
              </button>
              <button
                type="button"
                onClick={() => setTrendView('both')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                  trendView === 'both'
                    ? 'bg-white text-teal-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Dual View
              </button>
            </div>
          </div>

          {/* Chart Container */}
          <div className="pt-4 flex-1 min-h-[300px] w-full">
            {dailyTrendsData.length === 0 ? (
              <div className="h-[280px] flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <BarChart3 className="w-10 h-10 stroke-1 text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-600">No transactions recorded in this period</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Transactions completed in POS checkout will plot here automatically.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={290}>
                <AreaChart
                  data={dailyTrendsData}
                  margin={{ top: 12, right: 12, left: -10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="revenueTealGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d9488" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="ordersBlueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284c7" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#0284c7" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="displayDate"
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="revenueAxis"
                    orientation="left"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickFormatter={(val) => formatCompactKSh(val)}
                  />
                  {trendView === 'both' && (
                    <YAxis
                      yAxisId="ordersAxis"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#0284c7', fontSize: 11 }}
                      tickFormatter={(val) => `${val} tx`}
                    />
                  )}
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-lg border border-slate-800 text-xs space-y-1.5 min-w-[170px]">
                          <div className="font-bold text-slate-200 border-b border-slate-700/80 pb-1 flex items-center justify-between">
                            <span>{label}</span>
                            <span className="text-[10px] text-slate-400">{data.orders} orders</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 pt-0.5">
                            <span className="text-teal-400 font-medium flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-teal-400 inline-block" />
                              Gross Sales:
                            </span>
                            <span className="font-mono font-bold text-white">
                              {formatKSh(data.revenue)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3 text-[11px] text-slate-300">
                            <span>Avg. Order:</span>
                            <span className="font-mono">{formatKSh(data.avgOrderValue)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                            <span>Rx: {formatKSh(data.rxRevenue)}</span>
                            <span>OTC: {formatKSh(data.otcRevenue)}</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  {(trendView === 'revenue' || trendView === 'both') && (
                    <Area
                      yAxisId="revenueAxis"
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue (KSh)"
                      stroke="#0d9488"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#revenueTealGradient)"
                      activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2, fill: '#0f766e' }}
                    />
                  )}
                  {trendView === 'orders' && (
                    <Area
                      yAxisId="revenueAxis"
                      type="monotone"
                      dataKey="orders"
                      name="Orders Count"
                      stroke="#0284c7"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#ordersBlueGradient)"
                      activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2, fill: '#0369a1' }}
                    />
                  )}
                  {trendView === 'both' && (
                    <Area
                      yAxisId="ordersAxis"
                      type="monotone"
                      dataKey="orders"
                      name="Orders"
                      stroke="#0284c7"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      fillOpacity={0.2}
                      fill="url(#ordersBlueGradient)"
                      activeDot={{ r: 4, stroke: '#ffffff', strokeWidth: 2, fill: '#0284c7' }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Bottom Trend Meta */}
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block" />
              <span>Daily Peak: <strong className="text-slate-800">{stats.peakDay.date}</strong> ({formatKSh(stats.peakDay.revenue)})</span>
            </div>
            <div>
              Total Turnover: <strong className="text-slate-900 font-mono">{formatKSh(stats.totalRevenue)}</strong>
            </div>
          </div>
        </div>

        {/* CHART 2: Top-Selling Medications (5 Cols) */}
        <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-teal-700" />
                Top-Selling Medications
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Fastest-moving medications by revenue and volume
              </p>
            </div>

            {/* Mode & Count Toggle */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[11px]">
                <button
                  type="button"
                  onClick={() => setTopRankMode('revenue')}
                  className={`px-2 py-1 rounded-lg font-semibold transition ${
                    topRankMode === 'revenue'
                      ? 'bg-white text-teal-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Rank by gross sales amount (KSh)"
                >
                  Revenue
                </button>
                <button
                  type="button"
                  onClick={() => setTopRankMode('volume')}
                  className={`px-2 py-1 rounded-lg font-semibold transition ${
                    topRankMode === 'volume'
                      ? 'bg-white text-teal-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Rank by units dispensed"
                >
                  Units
                </button>
              </div>

              <button
                type="button"
                onClick={() => setTopCount((prev) => (prev === 5 ? 10 : 5))}
                className="text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-xl transition"
                title="Toggle top 5 or 10 medications"
              >
                Top {topCount}
              </button>
            </div>
          </div>

          {/* Bar Chart Container */}
          <div className="pt-4 flex-1 min-h-[300px] w-full">
            {topMedications.length === 0 ? (
              <div className="h-[280px] flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <Pill className="w-10 h-10 stroke-1 text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-600">No product sales in this period</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={290}>
                <BarChart
                  data={topMedications}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748b', fontSize: 10 }}
                    tickFormatter={(val) =>
                      topRankMode === 'revenue' ? formatCompactKSh(val) : `${val} pcs`
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="chartLabel"
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tick={{ fill: '#334155', fontSize: 11, fontWeight: 500 }}
                    width={96}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-lg border border-slate-800 text-xs space-y-1 min-w-[200px]">
                          <div className="font-bold text-white border-b border-slate-800 pb-1">
                            {data.name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {data.genericName || data.dosage} • {data.category}
                          </div>
                          <div className="flex items-center justify-between pt-1 font-mono">
                            <span className="text-teal-400">Total Revenue:</span>
                            <span className="font-bold text-white">{formatKSh(data.totalRevenue)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-300">
                            <span>Units Dispensed:</span>
                            <span className="font-bold text-amber-400">{data.unitsSold} units</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                            <span>Share of Sales: {data.revenueShare.toFixed(1)}%</span>
                            <span
                              className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold ${
                                data.isPrescription
                                  ? 'bg-rose-950 text-rose-300'
                                  : 'bg-emerald-950 text-emerald-300'
                              }`}
                            >
                              {data.isPrescription ? 'Rx Only' : 'OTC'}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey={topRankMode === 'revenue' ? 'totalRevenue' : 'unitsSold'}
                    radius={[0, 6, 6, 0]}
                  >
                    {topMedications.map((entry, index) => {
                      // Teal color gradient for top ranks
                      const colors = ['#0f766e', '#14b8a6', '#0d9488', '#2dd4bf', '#5eead4', '#99f6e4'];
                      return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Bottom Med Meta */}
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="text-[11px]">
              Active inventory check: {topMedications.filter((m) => m.currentStock <= m.minStockLevel).length > 0 ? (
                <strong className="text-amber-600">
                  {topMedications.filter((m) => m.currentStock <= m.minStockLevel).length} top item(s) low in stock
                </strong>
              ) : (
                <strong className="text-emerald-700">All top sellers adequately stocked</strong>
              )}
            </span>
            <span className="text-[11px] font-semibold text-teal-800">
              {topMedications.length} items charted
            </span>
          </div>
        </div>
      </div>

      {/* Product Sales Velocity & Tender Breakdown Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Top Product Leaderboard Table (8 Cols) */}
        <div className="lg:col-span-8 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-teal-700" />
                Medication Sales Leaderboard
              </h3>
              <p className="text-xs text-slate-500">
                Detailed units, revenue contribution, and live stock balance
              </p>
            </div>
            <span className="text-xs text-slate-400 font-medium">
              Ranked by {topRankMode === 'revenue' ? 'Gross Revenue' : 'Units Sold'}
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold text-[11px]">
                  <th className="py-2.5 px-3 text-center w-10">#</th>
                  <th className="py-2.5 px-3">Medication</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3 text-center">Type</th>
                  <th className="py-2.5 px-3 text-right">Units Sold</th>
                  <th className="py-2.5 px-3 text-right">Revenue (KSh)</th>
                  <th className="py-2.5 px-3 text-right">Contribution</th>
                  <th className="py-2.5 px-3 text-center">Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {topMedications.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-400">
                      No sales data available for this range.
                    </td>
                  </tr>
                ) : (
                  topMedications.map((item, idx) => {
                    const isLowStock = item.currentStock <= item.minStockLevel;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-2.5 px-3 text-center font-bold">
                          <span
                            className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] ${
                              idx === 0
                                ? 'bg-amber-100 text-amber-900 font-extrabold'
                                : idx === 1
                                ? 'bg-slate-200 text-slate-800'
                                : idx === 2
                                ? 'bg-amber-50 text-amber-800'
                                : 'text-slate-500'
                            }`}
                          >
                            {idx + 1}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{item.name}</div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[170px]">
                            {item.genericName || item.dosage}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-medium">
                            {item.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {item.isPrescription ? (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                              Rx
                            </span>
                          ) : (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              OTC
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          {item.unitsSold}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-teal-800">
                          {formatKSh(item.totalRevenue)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {item.revenueShare.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {isLowStock ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              <AlertCircle className="w-3 h-3" />
                              {item.currentStock} left
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-medium">
                              {item.currentStock} in stock
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tender & Category Split Summary (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Payment Method Distribution */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-teal-700" />
              Tender Method Velocity
            </h3>
            <p className="text-xs text-slate-500">
              Breakdown of customer payments across payment rails
            </p>

            <div className="space-y-2.5 pt-1">
              {(Object.entries(stats.paymentBreakdown) as [string, number][]).map(([method, amount]) => {
                const percent = stats.totalRevenue > 0 ? (amount / stats.totalRevenue) * 100 : 0;
                return (
                  <div key={method} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{method}</span>
                      <span className="font-mono font-bold text-slate-900">
                        {formatKSh(amount)} ({percent.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          method.includes('M-Pesa')
                            ? 'bg-emerald-600'
                            : method === 'Cash'
                            ? 'bg-teal-600'
                            : method === 'Insurance'
                            ? 'bg-sky-600'
                            : 'bg-indigo-600'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Therapeutic Categories */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-700" />
              Top Therapeutic Classes
            </h3>
            <div className="divide-y divide-slate-100 text-xs">
              {topCategories.map((cat, idx) => (
                <div key={cat.category} className="py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-400">#{idx + 1}</span>
                    <span className="font-semibold text-slate-800">{cat.category}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-slate-900">{formatKSh(cat.revenue)}</div>
                    <div className="text-[10px] text-slate-400">{cat.units} units dispensed</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
