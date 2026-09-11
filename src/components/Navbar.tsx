import React, { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CheckCircle2,
  FileCheck,
  History,
  KeyRound,
  LogOut,
  Menu,
  Pill,
  RefreshCw,
  Settings,
  Shield,
  ShieldCheck,
  Sliders,
  TrendingUp,
  User as UserIcon,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { AppNavTab, User } from '../types';

interface NavbarProps {
  activeTab: AppNavTab;
  onSelectTab: (tab: AppNavTab) => void;
  currentUser: User;
  onLogout: () => void;
  lowStockCount: number;
  isOnline: boolean;
  isSimulatedOffline: boolean;
  onToggleSimulatedOffline: () => void;
  offlineQueueCount: number;
  onSyncOfflineQueue: () => void;
  pharmacyName: string;
  todaySalesCount?: number;
  todayRevenueFormatted?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  currentUser,
  onLogout,
  lowStockCount,
  isOnline,
  isSimulatedOffline,
  onToggleSimulatedOffline,
  offlineQueueCount,
  onSyncOfflineQueue,
  pharmacyName,
  todaySalesCount = 0,
  todayRevenueFormatted,
}) => {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const isAdmin = currentUser?.role === 'admin';
  const normalizedRole = currentUser?.role === 'cashier' ? 'staff' : (currentUser?.role || 'staff');

  const handleNavClick = (tab: AppNavTab) => {
    onSelectTab(tab);
    setMobileDrawerOpen(false);
  };

  // Define nav items with strict authorization flags
  const allNavItems: {
    id: AppNavTab;
    label: string;
    sublabel: string;
    icon: React.ReactNode;
    badge?: React.ReactNode;
    adminOnly?: boolean;
    bottomNav?: boolean;
  }[] = [
    {
      id: 'pos',
      label: 'POS Checkout',
      sublabel: 'Cash, M-Pesa & Split',
      icon: <Pill className="w-5 h-5 shrink-0" />,
      bottomNav: true,
    },
    {
      id: 'prescriptions',
      label: 'Prescriptions (Rx)',
      sublabel: 'Intake & verification',
      icon: <FileCheck className="w-5 h-5 shrink-0" />,
      bottomNav: true,
    },
    {
      id: 'inventory',
      label: 'Inventory',
      sublabel: isAdmin ? 'Stock levels & alerts' : 'Search & view products',
      icon: <Boxes className="w-5 h-5 shrink-0" />,
      bottomNav: true,
      badge:
        lowStockCount > 0 ? (
          <span className="bg-amber-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ml-auto">
            <AlertTriangle className="w-2.5 h-2.5" />
            {lowStockCount}
          </span>
        ) : undefined,
    },
    // ADMIN ONLY MODULES
    {
      id: 'users',
      label: 'Staff Management',
      sublabel: 'Roles & credentials',
      icon: <Users className="w-5 h-5 shrink-0" />,
      adminOnly: true,
    },
    {
      id: 'reports',
      label: 'Sales & Auditing',
      sublabel: 'Revenue & transaction log',
      icon: <BarChart3 className="w-5 h-5 shrink-0" />,
      adminOnly: true,
    },
    {
      id: 'audit',
      label: 'Activity Audit Trail',
      sublabel: 'Chronological logs',
      icon: <History className="w-5 h-5 shrink-0" />,
      adminOnly: true,
    },
    {
      id: 'settings',
      label: 'Receipt Settings',
      sublabel: 'Tax PIN & thermal layout',
      icon: <Sliders className="w-5 h-5 shrink-0" />,
      adminOnly: true,
    },
    // PERSONAL MODULE (ALL ROLES)
    {
      id: 'profile',
      label: 'My Profile',
      sublabel: 'Personal info & password',
      icon: <UserIcon className="w-5 h-5 shrink-0" />,
      bottomNav: true,
    },
  ];

  // Strictly filter out adminOnly items for non-admin users
  const visibleNavItems = allNavItems.filter((item) => (item.adminOnly ? isAdmin : true));
  const bottomNavItems = visibleNavItems.filter((item) => item.bottomNav);

  return (
    <>
      {/* MOBILE TOP HEADER (< md) */}
      <header className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-xs no-print">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-teal-800 text-white flex items-center justify-center font-bold shadow-xs">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-teal-300">
              <path d="M19 10.5h-5.5V5a1.5 1.5 0 00-3 0v5.5H5a1.5 1.5 0 000 3h5.5V19a1.5 1.5 0 003 0v-5.5H19a1.5 1.5 0 000-3z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-extrabold text-slate-900 leading-tight truncate max-w-[160px] sm:max-w-xs">
              {pharmacyName || 'RG Pharma-POS'}
            </div>
            <div className="text-[10px] text-teal-700 font-semibold flex items-center gap-1">
              <span>POS PWA</span>
              <span>•</span>
              <span className="uppercase font-bold">{normalizedRole}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Connectivity indicator */}
          <button
            onClick={onToggleSimulatedOffline}
            className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1 transition ${
              isOnline
                ? 'bg-teal-50 text-teal-700 border border-teal-200'
                : 'bg-amber-100 text-amber-800 border border-amber-300'
            }`}
            title="Toggle online/offline simulation"
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          </button>

          {/* User profile avatar button (navigates to own profile) */}
          <button
            onClick={() => onSelectTab('profile')}
            className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-xs transition active:scale-95 ${
              currentUser.avatarColor || (isAdmin ? 'bg-teal-700' : 'bg-emerald-600')
            }`}
            title={`Logged in as ${currentUser.name} (${normalizedRole.toUpperCase()}) - View Profile`}
          >
            {currentUser.name.charAt(0)}
          </button>

          {/* Hamburger Menu button */}
          <button
            id="btn-mobile-menu-toggle"
            onClick={() => setMobileDrawerOpen(true)}
            className="p-2 text-slate-700 hover:bg-slate-100 rounded-xl transition min-w-[40px] min-h-[40px] flex items-center justify-center"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* MOBILE DRAWER MODAL (< md) */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex justify-end no-print">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
          />

          {/* Slide-out Drawer Panel */}
          <div className="relative w-full max-w-xs bg-white h-full shadow-2xl flex flex-col z-10 animate-fade-in">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-800 text-white flex items-center justify-center font-bold">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-teal-300">
                    <path d="M19 10.5h-5.5V5a1.5 1.5 0 00-3 0v5.5H5a1.5 1.5 0 000 3h5.5V19a1.5 1.5 0 003 0v-5.5H19a1.5 1.5 0 000-3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">{pharmacyName}</h3>
                  <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wider">
                    {normalizedRole} Clearance
                  </span>
                </div>
              </div>
              <button
                onClick={() => setMobileDrawerOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current User Card */}
            <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between gap-2">
              <button
                onClick={() => {
                  setMobileDrawerOpen(false);
                  onSelectTab('profile');
                }}
                className="flex items-center gap-2.5 text-left min-w-0 flex-1 hover:opacity-80 transition cursor-pointer"
                title="View account profile"
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-xs shrink-0 ${
                    currentUser.avatarColor || (isAdmin ? 'bg-teal-700' : 'bg-emerald-600')
                  }`}
                >
                  {currentUser.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900 truncate">{currentUser.name}</div>
                  <div className="text-[10px] text-slate-500 font-mono truncate">
                    @{currentUser.username} • <span className="uppercase text-teal-700 font-bold">{normalizedRole}</span>
                  </div>
                </div>
              </button>
              <button
                onClick={() => {
                  setMobileDrawerOpen(false);
                  onLogout();
                }}
                className="px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg transition flex items-center gap-1 shrink-0 cursor-pointer"
                title="Sign out of account"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>

            {/* Navigation Links */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 py-1.5">
                Pharmacy Modules
              </div>
              {visibleNavItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full text-left p-3 rounded-2xl flex items-center gap-3 transition min-h-[48px] ${
                      isActive
                        ? 'bg-teal-700 text-white shadow-md shadow-teal-900/10'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className={`${isActive ? 'text-teal-200' : 'text-slate-500'}`}>{item.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{item.label}</div>
                      <div className={`text-[11px] truncate ${isActive ? 'text-teal-100' : 'text-slate-400'}`}>
                        {item.sublabel}
                      </div>
                    </div>
                    {item.badge}
                  </button>
                );
              })}
            </div>

            {/* Bottom Drawer Actions */}
            <div className="p-3 border-t border-slate-100 space-y-2 bg-slate-50">
              <div className="flex items-center justify-between text-xs px-2 text-slate-500">
                <span>Connectivity</span>
                <span className={`font-semibold ${isOnline ? 'text-teal-700' : 'text-amber-700'}`}>
                  {isOnline ? 'Online' : 'Simulated Offline'}
                </span>
              </div>
              <button
                onClick={() => {
                  setMobileDrawerOpen(false);
                  onToggleSimulatedOffline();
                }}
                className="w-full py-2.5 px-3 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center justify-center gap-2 transition"
              >
                {isOnline ? <WifiOff className="w-3.5 h-3.5 text-amber-600" /> : <Wifi className="w-3.5 h-3.5 text-teal-600" />}
                <span>{isOnline ? 'Simulate Offline Mode' : 'Return Online'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM NAVIGATION BAR (< md) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1 flex justify-around items-center shadow-lg no-print">
        {bottomNavItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition min-h-[48px] relative ${
                isActive ? 'text-teal-700 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="relative">
                {item.icon}
                {item.id === 'inventory' && lowStockCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full" />
                )}
              </div>
              <span className="text-[10px] tracking-tight mt-0.5 whitespace-nowrap">{item.label.split(' ')[0]}</span>
              {isActive && <span className="w-4 h-0.5 bg-teal-700 rounded-full mt-0.5" />}
            </button>
          );
        })}

        {/* More/Menu button on bottom bar */}
        <button
          onClick={() => setMobileDrawerOpen(true)}
          className="flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-slate-500 hover:text-slate-800 transition min-h-[48px]"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] tracking-tight mt-0.5">More</span>
        </button>
      </nav>

      {/* DESKTOP & TABLET PERSISTENT SIDEBAR (md+) */}
      <aside className="hidden md:flex flex-col w-64 lg:w-72 bg-white border-r border-slate-200 h-screen sticky top-0 shrink-0 z-20 select-none shadow-xs no-print">
        {/* Header / Brand */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-800 text-white flex items-center justify-center font-bold shadow-md shadow-teal-900/10">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-teal-300">
                <path d="M19 10.5h-5.5V5a1.5 1.5 0 00-3 0v5.5H5a1.5 1.5 0 000 3h5.5V19a1.5 1.5 0 003 0v-5.5H19a1.5 1.5 0 000-3z" />
              </svg>
            </div>
            <div>
              <div className="text-base font-black text-slate-900 leading-tight truncate max-w-[140px] lg:max-w-[170px]">
                {pharmacyName || 'RG Pharma-POS'}
              </div>
              <div className="text-[11px] text-teal-700 font-semibold tracking-wide flex items-center gap-1">
                <span>Kenyan Shillings</span>
                <span>•</span>
                <span className="uppercase font-bold">{normalizedRole}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Daily Sales Summary Widget (Desktop) */}
        {isAdmin && todayRevenueFormatted && (
          <div className="mx-4 mt-4 p-3 bg-gradient-to-br from-teal-900 to-slate-900 text-white rounded-2xl shadow-xs space-y-1">
            <div className="flex items-center justify-between text-[11px] font-semibold text-teal-200">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-teal-400" />
                <span>Today's Sales</span>
              </span>
              <span className="bg-teal-700/60 px-1.5 py-0.5 rounded text-[10px] font-mono">
                {todaySalesCount} txns
              </span>
            </div>
            <div className="text-lg font-black tracking-tight text-white">{todayRevenueFormatted}</div>
          </div>
        )}

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-1 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
            Main Navigation
          </div>

          {visibleNavItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-tab-${item.id}`}
                onClick={() => onSelectTab(item.id)}
                className={`w-full text-left px-3.5 py-3 rounded-2xl flex items-center gap-3 transition min-h-[46px] group ${
                  isActive
                    ? 'bg-teal-700 text-white shadow-md shadow-teal-900/10'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <div className={`${isActive ? 'text-teal-200' : 'text-slate-400 group-hover:text-teal-700'} transition`}>
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xs truncate">{item.label}</div>
                  <div className={`text-[10px] truncate ${isActive ? 'text-teal-100' : 'text-slate-400'}`}>
                    {item.sublabel}
                  </div>
                </div>
                {item.badge}
              </button>
            );
          })}
        </div>

        {/* Offline Queue Sync Indicator */}
        {offlineQueueCount > 0 && (
          <div className="mx-3 mb-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center gap-1.5 font-bold text-[11px]">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-700" />
              <span>{offlineQueueCount} queued sales</span>
            </div>
            <button
              onClick={onSyncOfflineQueue}
              className="px-2 py-0.5 bg-amber-700 hover:bg-amber-800 text-white rounded font-bold text-[10px]"
            >
              Sync
            </button>
          </div>
        )}

        {/* Footer: User Profile & Connectivity Switcher */}
        <div className="p-3 border-t border-slate-100 bg-slate-50 space-y-2">
          {/* Active User Pill & Logout */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSelectTab('profile')}
              className="flex-1 p-2 bg-white border border-slate-200 hover:border-teal-400 rounded-2xl flex items-center gap-2.5 cursor-pointer transition shadow-2xs text-left group min-w-0"
              title="View my account profile and credentials"
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-xs shrink-0 ${
                  currentUser.avatarColor || (isAdmin ? 'bg-teal-700' : 'bg-emerald-600')
                }`}
              >
                {currentUser.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-900 truncate group-hover:text-teal-700 transition">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-slate-500 font-mono truncate flex items-center gap-1">
                  <span className="uppercase font-bold text-teal-700">{normalizedRole}</span>
                  <span>•</span>
                  <span>@{currentUser.username}</span>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="p-2.5 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-700 border border-slate-200 hover:border-rose-300 rounded-2xl transition shadow-2xs flex items-center justify-center shrink-0 cursor-pointer"
              title="Sign out of your account"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Connectivity Status Button */}
          <button
            onClick={onToggleSimulatedOffline}
            className={`w-full py-1.5 px-3 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition ${
              isOnline
                ? 'bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200'
                : 'bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-teal-600" />
                <span>Online (Click to Simulate Offline)</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                <span>Simulated Offline (Click to Reconnect)</span>
              </>
            )}
          </button>

          {/* PWA Install Button */}
          <div className="pt-1">
            <PWAInstallButton />
          </div>
        </div>
      </aside>
    </>
  );
};
