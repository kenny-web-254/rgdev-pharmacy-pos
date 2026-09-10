/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { POSTerminal } from './components/POSTerminal';
import { PrescriptionsManager } from './components/PrescriptionsManager';
import { InventoryManager } from './components/InventoryManager';
import { ReceiptSettingsView } from './components/ReceiptSettingsView';
import { ReportsView } from './components/ReportsView';
import { UserManagementView } from './components/UserManagementView';
import { UserProfileView } from './components/UserProfileView';
import { AuditLogsView } from './components/AuditLogsView';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { ReceiptModal } from './components/ReceiptModal';
import { LoginView } from './components/LoginView';
import { storageService } from './services/storage';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  AppNavTab,
  AuditLog,
  CartItem,
  Medication,
  Prescription,
  ReceiptSettings,
  SaleTransaction,
  User,
} from './types';
import { playScanSuccessBeep } from './utils/audio';
import { formatKSh } from './utils/currency';
import { CheckCircle2, Info, Lock, ShieldAlert } from 'lucide-react';

export default function App() {
  // Navigation & Role State
  const [activeTab, setActiveTab] = useState<AppNavTab>('pos');
  const [currentUser, setCurrentUser] = useState<User | null>(() => storageService.getActiveUser());
  const [users, setUsers] = useState<User[]>(() => storageService.getUsers());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => storageService.getAuditLogs());

  // Core Pharmacy Data
  const [medications, setMedications] = useState<Medication[]>(() => storageService.getMedications());
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(() => storageService.getPrescriptions());
  const [transactions, setTransactions] = useState<SaleTransaction[]>(() => storageService.getTransactions());
  const [offlineQueue, setOfflineQueue] = useState<SaleTransaction[]>(() => storageService.getOfflineQueue());
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>(() => storageService.getReceiptSettings());

  // POS State with localStorage persistence and live medication data reconciliation
  const [cart, setCart] = useState<CartItem[]>(() => {
    const saved = storageService.getCart();
    const currentMeds = storageService.getMedications();
    return saved
      .filter((item) => currentMeds.some((m) => m.id === item.medication.id))
      .map((item) => {
        const liveMed = currentMeds.find((m) => m.id === item.medication.id)!;
        const validQuantity = Math.min(item.quantity, Math.max(1, liveMed.stock));
        return {
          ...item,
          medication: liveMed,
          quantity: validQuantity,
        };
      });
  });

  // Save cart to localStorage automatically on any cart change
  useEffect(() => {
    storageService.saveCart(cart);
  }, [cart]);

  // Modals
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [receiptModalTx, setReceiptModalTx] = useState<SaleTransaction | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'warning' } | null>(null);

  // Network Connectivity Hook
  const { isOnline, isSimulatedOffline, toggleSimulatedOffline } = useOnlineStatus();

  const showToast = (text: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  const refreshUsersAndLogs = () => {
    setUsers(storageService.getUsers());
    setAuditLogs(storageService.getAuditLogs());
    setCurrentUser(storageService.getActiveUser());
  };

  // Enforce access control on tab state: non-admin cannot be on admin-only tabs
  useEffect(() => {
    if (currentUser && currentUser.role !== 'admin') {
      const adminOnlyTabs: AppNavTab[] = ['users', 'reports', 'settings', 'audit'];
      if (adminOnlyTabs.includes(activeTab)) {
        setActiveTab('pos');
        showToast('Access restricted: That module requires Administrator privileges.', 'warning');
      }
    }
  }, [currentUser?.role, activeTab]);

  // Sync Offline Queue when returning online or manually triggered
  const handleSyncOfflineQueue = () => {
    if (offlineQueue.length === 0) {
      showToast('No offline transactions waiting to sync.', 'info');
      return;
    }

    const count = offlineQueue.length;
    const syncedTransactions = transactions.map((tx) => {
      if (tx.isOffline) {
        return {
          ...tx,
          isOffline: false,
          synced: true,
          syncTimestamp: new Date().toISOString(),
        };
      }
      return tx;
    });

    setTransactions(syncedTransactions);
    storageService.saveTransactions(syncedTransactions);

    setOfflineQueue([]);
    storageService.clearOfflineQueue();

    showToast(`Successfully synced ${count} offline transaction${count > 1 ? 's' : ''} with server!`, 'success');
  };

  // Automatic sync when connection is restored
  useEffect(() => {
    if (isOnline && offlineQueue.length > 0) {
      handleSyncOfflineQueue();
    }
  }, [isOnline]);

  // Inventory Management Handlers with Authorization Enforcement
  const handleUpdateMedication = (updated: Medication) => {
    if (!currentUser || currentUser.role !== 'admin') {
      showToast('Unauthorized: Only administrators can modify stock or pricing.', 'warning');
      return;
    }
    const updatedList = medications.map((m) => (m.id === updated.id ? updated : m));
    setMedications(updatedList);
    storageService.saveMedications(updatedList);

    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'INVENTORY_UPDATED',
      details: `Updated item ${updated.name} (Stock: ${updated.stock}, Price: ${formatKSh(updated.price)})`,
      category: 'INVENTORY',
    });
    setAuditLogs(storageService.getAuditLogs());

    showToast(`Updated medication details for ${updated.name}.`, 'success');
  };

  const handleAddMedication = (newItem: Medication) => {
    if (!currentUser || currentUser.role !== 'admin') {
      showToast('Unauthorized: Only administrators can add products.', 'warning');
      return;
    }
    const updatedList = [newItem, ...medications];
    setMedications(updatedList);
    storageService.saveMedications(updatedList);

    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'PRODUCT_ADDED',
      details: `Added new product ${newItem.name} (${newItem.dosage}, Price: ${formatKSh(newItem.price)})`,
      category: 'INVENTORY',
    });
    setAuditLogs(storageService.getAuditLogs());

    showToast(`Added ${newItem.name} to pharmacy inventory.`, 'success');
  };

  const handleDeleteMedication = (id: string) => {
    if (!currentUser || currentUser.role !== 'admin') {
      showToast('Unauthorized: Only administrators can delete products.', 'warning');
      return;
    }
    const item = medications.find((m) => m.id === id);
    const updatedList = medications.filter((m) => m.id !== id);
    setMedications(updatedList);
    storageService.saveMedications(updatedList);
    setCart((prevCart) => prevCart.filter((i) => i.medication.id !== id));

    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'PRODUCT_DELETED',
      details: `Deleted product ${item?.name || id} from catalog`,
      category: 'INVENTORY',
    });
    setAuditLogs(storageService.getAuditLogs());

    showToast(`Removed ${item?.name || 'item'} from inventory.`, 'info');
  };

  const handleAdjustStock = (
    medicationId: string,
    newStock: number,
    reason: string,
    newBatchNumber?: string,
    newExpiryDate?: string
  ) => {
    if (!currentUser || currentUser.role !== 'admin') {
      showToast('Unauthorized: Only administrators can adjust stock levels.', 'warning');
      return;
    }
    const med = medications.find((m) => m.id === medicationId);
    if (!med) return;
    const prevStock = med.stock;
    const diff = newStock - prevStock;
    const updated: Medication = {
      ...med,
      stock: Math.max(0, newStock),
      batchNumber: newBatchNumber || med.batchNumber,
      expiryDate: newExpiryDate || med.expiryDate,
    };
    const updatedList = medications.map((m) => (m.id === medicationId ? updated : m));
    setMedications(updatedList);
    storageService.saveMedications(updatedList);

    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'STOCK_ADJUSTMENT',
      details: `Product: "${med.name}" | Previous: ${prevStock} | New: ${newStock} | Adjustment: ${diff >= 0 ? '+' : ''}${diff} | Reason: ${reason}`,
      category: 'INVENTORY',
    });
    setAuditLogs(storageService.getAuditLogs());
    showToast(`Stock adjusted for ${med.name}: ${prevStock} -> ${newStock} (${diff >= 0 ? '+' : ''}${diff})`, 'success');
  };

  // Prescription Management Handlers
  const handleAddNewPrescription = (newRx: Prescription) => {
    const updated = [newRx, ...prescriptions];
    setPrescriptions(updated);
    storageService.savePrescriptions(updated);
    showToast(`Prescription ${newRx.rxNumber} for ${newRx.patientName} registered.`, 'success');
  };

  const handleDispensePrescriptionToCart = (rx: Prescription) => {
    const med = medications.find((m) => m.id === rx.medicationId);
    if (!med) {
      alert('Associated medication not found in pharmacy inventory.');
      return;
    }

    if (med.stock < rx.quantityPrescribed) {
      alert(`Insufficient stock! ${rx.quantityPrescribed} prescribed, but only ${med.stock} on shelf.`);
      return;
    }

    // Co-pay discount
    const itemDiscount = rx.insuranceCoPayRate !== undefined ? (1 - rx.insuranceCoPayRate) * 100 : 0;

    const existingIndex = cart.findIndex((item) => item.medication.id === med.id && item.prescriptionId === rx.id);

    if (existingIndex > -1) {
      showToast(`Prescription ${rx.rxNumber} already in active cart.`, 'info');
    } else {
      const newItem: CartItem = {
        medication: med,
        quantity: rx.quantityPrescribed,
        prescriptionId: rx.id,
        rxNumber: rx.rxNumber,
        patientName: rx.patientName,
        discountPercent: itemDiscount,
      };
      setCart([...cart, newItem]);
      playScanSuccessBeep();
      showToast(`Prescription ${rx.rxNumber} dispensed to cart (${itemDiscount.toFixed(0)}% insurance co-pay discount applied).`, 'success');
    }

    // Switch to POS checkout tab so cashier can tender immediately
    setActiveTab('pos');
  };

  // Barcode Detection Handler
  const handleBarcodeScanned = (code: string) => {
    setIsScannerOpen(false);
    playScanSuccessBeep();

    // 1. Check Prescriptions
    const matchedRx = prescriptions.find(
      (r) => r.rxNumber.toLowerCase() === code.toLowerCase() || r.barcode.toLowerCase() === code.toLowerCase()
    );

    if (matchedRx) {
      handleDispensePrescriptionToCart(matchedRx);
      return;
    }

    // 2. Check Medications by Barcode or ID
    const matchedMed = medications.find(
      (m) => m.barcode.toLowerCase() === code.toLowerCase() || m.id.toLowerCase() === code.toLowerCase()
    );

    if (matchedMed) {
      if (matchedMed.stock <= 0) {
        alert(`Medication ${matchedMed.name} (${matchedMed.barcode}) is currently out of stock.`);
        return;
      }

      // Add to cart
      const existingIdx = cart.findIndex((i) => i.medication.id === matchedMed.id);
      if (existingIdx > -1) {
        const updated = [...cart];
        updated[existingIdx].quantity += 1;
        setCart(updated);
      } else {
        setCart([...cart, { medication: matchedMed, quantity: 1 }]);
      }

      showToast(`Scanned & added: ${matchedMed.name} (${matchedMed.dosage})`, 'success');
      if (activeTab !== 'pos') {
        setActiveTab('pos');
      }
      return;
    }

    showToast(`Barcode "${code}" was not recognized in prescriptions or drug catalog.`, 'warning');
  };

  // Sale Finalization
  const handleCompleteSale = (transaction: SaleTransaction) => {
    // 1. Deduct stock from inventory
    const updatedMeds = medications.map((med) => {
      const soldItem = transaction.items.find((item) => item.medicationId === med.id);
      if (soldItem) {
        return {
          ...med,
          stock: Math.max(0, med.stock - soldItem.quantity),
        };
      }
      return med;
    });
    setMedications(updatedMeds);
    storageService.saveMedications(updatedMeds);

    // 2. Update prescription refill status if applicable
    const updatedRxs = prescriptions.map((rx) => {
      const soldRx = transaction.items.find((item) => item.rxNumber === rx.rxNumber);
      if (soldRx) {
        const newRemaining = Math.max(0, rx.refillsRemaining - 1);
        return {
          ...rx,
          refillsRemaining: newRemaining,
          quantityDispensedSoFar: rx.quantityDispensedSoFar + soldRx.quantity,
          status: newRemaining === 0 ? ('Dispensed' as const) : rx.status,
        };
      }
      return rx;
    });
    setPrescriptions(updatedRxs);
    storageService.savePrescriptions(updatedRxs);

    // 3. Persist transaction
    const newTxList = [transaction, ...transactions];
    setTransactions(newTxList);
    storageService.saveTransactions(newTxList);

    // 4. Log Audit Trail
    if (currentUser) {
      storageService.addAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'SALE_COMPLETED',
        details: `Sale ${transaction.receiptNumber} recorded (${transaction.items.length} items, Total: ${formatKSh(
          transaction.total
        )}, Method: ${transaction.paymentMethod})`,
        category: 'SALES',
      });
      setAuditLogs(storageService.getAuditLogs());
    }

    // 5. Handle Offline Queueing if offline
    if (transaction.isOffline) {
      storageService.addToOfflineQueue(transaction);
      setOfflineQueue(storageService.getOfflineQueue());
      showToast(`Sale recorded in offline queue (${transaction.receiptNumber}). It will auto-sync when online.`, 'info');
    } else {
      showToast(`Sale completed successfully! Receipt ${transaction.receiptNumber}`, 'success');
    }

    // 6. Open thermal receipt modal
    setReceiptModalTx(transaction);
  };

  // Authentication & Session
  const handleLogin = (user: User) => {
    setCurrentUser(user);
    if (user.role !== 'admin') {
      const adminOnly: AppNavTab[] = ['users', 'reports', 'settings', 'audit'];
      if (adminOnly.includes(activeTab)) {
        setActiveTab('pos');
      }
    }
    showToast(`Signed into session as ${user.name}`, 'success');
  };

  const handleLogout = () => {
    storageService.logoutActiveUser(currentUser);
    setCurrentUser(null);
    showToast('Signed out of session.', 'info');
  };

  // Low stock calculation
  const lowStockCount = medications.filter((m) => m.stock <= m.minStockLevel).length;

  // Daily Sales Calculation
  const today = new Date().toDateString();
  const todayTransactions = transactions.filter((t) => new Date(t.timestamp).toDateString() === today);
  const todayRevenue = todayTransactions.reduce((sum, t) => sum + t.total, 0);
  const todayRevenueFormatted = formatKSh(todayRevenue);

  // If user is logged out, render standalone login authentication screen
  if (!currentUser) {
    return (
      <>
        {toastMessage && (
          <div className="fixed top-6 right-4 z-50 animate-fade-in no-print max-w-sm">
            <div
              className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold border ${
                toastMessage.type === 'success'
                  ? 'bg-teal-900 text-white border-teal-700'
                  : toastMessage.type === 'warning'
                  ? 'bg-amber-900 text-white border-amber-700'
                  : 'bg-slate-900 text-white border-slate-700'
              }`}
            >
              {toastMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
              ) : (
                <Info className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span>{toastMessage.text}</span>
            </div>
          </div>
        )}
        <LoginView
          onLogin={handleLogin}
          pharmacyName={receiptSettings.pharmacyName}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row font-sans text-slate-800">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 md:top-6 right-4 z-50 animate-fade-in no-print max-w-sm">
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold border ${
              toastMessage.type === 'success'
                ? 'bg-teal-900 text-white border-teal-700'
                : toastMessage.type === 'warning'
                ? 'bg-amber-900 text-white border-amber-700'
                : 'bg-slate-900 text-white border-slate-700'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Main Left-aligned Navigation Sidebar & Mobile Drawer */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          const adminOnlyTabs: AppNavTab[] = ['users', 'reports', 'settings', 'audit'];
          if (adminOnlyTabs.includes(tab) && currentUser.role !== 'admin') {
            showToast('Administrator clearance required to access this module.', 'warning');
            return;
          }
          setActiveTab(tab);
        }}
        currentUser={currentUser}
        onLogout={handleLogout}
        lowStockCount={lowStockCount}
        isOnline={isOnline}
        isSimulatedOffline={isSimulatedOffline}
        onToggleSimulatedOffline={toggleSimulatedOffline}
        offlineQueueCount={offlineQueue.length}
        onSyncOfflineQueue={handleSyncOfflineQueue}
        pharmacyName={receiptSettings.pharmacyName}
        todaySalesCount={todayTransactions.length}
        todayRevenueFormatted={todayRevenueFormatted}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 pb-24 md:pb-8">
          {activeTab === 'pos' && (
            <POSTerminal
              medications={medications}
              prescriptions={prescriptions}
              cart={cart}
              onUpdateCart={setCart}
              onCompleteSale={handleCompleteSale}
              onOpenScanner={() => setIsScannerOpen(true)}
              receiptSettings={receiptSettings}
              isOnline={isOnline}
              currentUser={currentUser}
            />
          )}

          {activeTab === 'prescriptions' && (
            <PrescriptionsManager
              prescriptions={prescriptions}
              medications={medications}
              onDispensePrescription={handleDispensePrescriptionToCart}
              onAddNewPrescription={handleAddNewPrescription}
              onOpenBarcodeScanner={() => setIsScannerOpen(true)}
              userRole={currentUser.role}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryManager
              medications={medications}
              onUpdateMedication={handleUpdateMedication}
              onAddMedication={handleAddMedication}
              onDeleteMedication={handleDeleteMedication}
              onAdjustStock={handleAdjustStock}
              onAddToCart={(med) => {
                const existingIdx = cart.findIndex((i) => i.medication.id === med.id);
                if (existingIdx > -1) {
                  const updated = [...cart];
                  updated[existingIdx].quantity += 1;
                  setCart(updated);
                } else {
                  setCart([...cart, { medication: med, quantity: 1 }]);
                }
                showToast(`Added ${med.name} to POS cart.`, 'success');
                setActiveTab('pos');
              }}
              userRole={currentUser.role}
            />
          )}

          {/* ADMIN-ONLY MODULE: Staff & Role Management */}
          {activeTab === 'users' && currentUser.role === 'admin' && (
            <UserManagementView
              currentUser={currentUser}
              users={users}
              onRefreshUsers={refreshUsersAndLogs}
              onShowToast={showToast}
            />
          )}

          {/* ADMIN-ONLY MODULE: Receipt Settings */}
          {activeTab === 'settings' && currentUser.role === 'admin' && (
            <ReceiptSettingsView
              settings={receiptSettings}
              onSaveSettings={(newSettings) => {
                setReceiptSettings(newSettings);
                storageService.saveReceiptSettings(newSettings);
                storageService.addAuditLog({
                  userId: currentUser.id,
                  userName: currentUser.name,
                  userRole: currentUser.role,
                  action: 'SETTINGS_MODIFIED',
                  details: `Updated receipt customization & tax PIN (${newSettings.pharmacyName})`,
                  category: 'SETTINGS',
                });
                setAuditLogs(storageService.getAuditLogs());
                showToast('Receipt customization settings updated & saved!', 'success');
              }}
              userRole={currentUser.role}
            />
          )}

          {/* ADMIN-ONLY MODULE: Sales & Financial Auditing */}
          {activeTab === 'reports' && currentUser.role === 'admin' && (
            <ReportsView
              transactions={transactions}
              medications={medications}
              offlineQueueCount={offlineQueue.length}
              onSyncOfflineQueue={handleSyncOfflineQueue}
              onViewReceipt={(tx) => setReceiptModalTx(tx)}
              userRole={currentUser.role}
            />
          )}

          {/* ADMIN-ONLY MODULE: System Audit Logs Trail */}
          {activeTab === 'audit' && currentUser.role === 'admin' && (
            <AuditLogsView logs={auditLogs} currentUser={currentUser} />
          )}

          {/* PERSONAL MODULE: My Profile (Staff and Admin) */}
          {activeTab === 'profile' && (
            <UserProfileView
              currentUser={currentUser}
              onUpdateCurrentUser={(updated) => {
                setCurrentUser(updated);
                refreshUsersAndLogs();
              }}
              onShowToast={showToast}
              onLogout={handleLogout}
            />
          )}
        </main>
      </div>

      {/* Barcode Scanner Camera Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleBarcodeScanned}
        title="Pharmacy Barcode Reader (Rx Script & Medication NDC)"
      />

      {/* Printed Thermal Receipt Modal */}
      {receiptModalTx && (
        <ReceiptModal
          transaction={receiptModalTx}
          settings={receiptSettings}
          onClose={() => setReceiptModalTx(null)}
        />
      )}
    </div>
  );
}
