/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { POSTerminal } from './components/POSTerminal';
import { ClinicalWorkflowView } from './components/ClinicalWorkflowView';
import { PrescriptionsManager } from './components/PrescriptionsManager';
import { TestsManager } from './components/TestsManager';
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
import { useSessionTimeout } from './hooks/useSessionTimeout';
import { useRealtimeSync } from './hooks/useRealtimeSync';
import { getAuthenticatedProfile, onSupabaseAuthStateChange, pullClinicalTestsFromSupabase, pullConsultationsFromSupabase, pullPatientsFromSupabase, pullVisitsFromSupabase, supabaseConfig, checkBootstrapAvailable, signOutSupabase } from './services/supabase';
import {
  AppNavTab,
  AuditLog,
  CartItem,
  MedicalTest,
  Medication,
  POSTab,
  Prescription,
  ReceiptSettings,
  SaleTransaction,
  User,
  UserRole,
  Patient,
  Visit,
  Consultation,
  ClinicalTest,
} from './types';
import { playScanSuccessBeep } from './utils/audio';
import { formatKSh } from './utils/currency';
import { CheckCircle2, Info, Lock, ShieldAlert } from 'lucide-react';

// Session security: auto-logout after this many minutes of inactivity, with
// a warning toast shown shortly before the session actually ends.
const SESSION_TIMEOUT_MINUTES = 30;
const SESSION_WARNING_SECONDS = 60;

// Role-based tab access: admin can access everything. Clinicians handle
// tests & prescriptions but don't run the till or manage inventory/admin
// modules. Cashiers run the till & dispense but don't order clinical tests.
function isTabAllowedForRole(tab: AppNavTab, role: UserRole): boolean {
  if (role === 'admin') return true;
  const adminOnlyTabs: AppNavTab[] = ['users', 'reports', 'settings', 'audit'];
  if (adminOnlyTabs.includes(tab)) return false;
  if (tab === 'pos') return role === 'cashier';
  if (tab === 'tests') return role === 'clinician' || role === 'admin';
  if (tab === 'clinical') return role === 'clinician' || role === 'admin';
  return true; // prescriptions, inventory (view), profile — visible to all roles
}

export default function App() {
  // Navigation & Role State
  const [activeTab, setActiveTab] = useState<AppNavTab>('pos');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isBootstrapAvailable, setIsBootstrapAvailable] = useState(false);
  const [users, setUsers] = useState<User[]>(() => storageService.getUsers());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => storageService.getAuditLogs());

  // Core Pharmacy Data
  const [medications, setMedications] = useState<Medication[]>(() => storageService.getMedications());
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(() => storageService.getPrescriptions());
  const [tests, setTests] = useState<MedicalTest[]>(() => storageService.getTests());
  const [transactions, setTransactions] = useState<SaleTransaction[]>(() => storageService.getTransactions());
  const [offlineQueue, setOfflineQueue] = useState<SaleTransaction[]>(() => storageService.getOfflineQueue());
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>(() => storageService.getReceiptSettings());

  // Clinical records are authoritative Supabase data. They are intentionally
  // kept in React memory rather than persisted to localStorage so PHI does not
  // become a second client-side database.
  const [patients, setPatients] = useState<Patient[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [clinicalTests, setClinicalTests] = useState<ClinicalTest[]>([]);

  // POS Multi-Customer Order Tabs with localStorage persistence & inventory reconciliation
  const [posTabs, setPosTabs] = useState<POSTab[]>(() => {
    const savedTabs = storageService.getPOSTabs();
    const currentMeds = storageService.getMedications();
    return savedTabs.map((tab) => ({
      ...tab,
      cart: tab.cart
        .filter((item) => currentMeds.some((m) => m.id === item.medication.id))
        .map((item) => {
          const liveMed = currentMeds.find((m) => m.id === item.medication.id)!;
          const validQuantity = Math.min(item.quantity, Math.max(1, liveMed.stock));
          return {
            ...item,
            medication: liveMed,
            quantity: validQuantity,
          };
        }),
    }));
  });

  const [activePOSTabId, setActivePOSTabId] = useState<string>(() => {
    return storageService.getActivePOSTabId() || 'tab-1';
  });

  // Derived active tab
  const activePOSTab = posTabs.find((t) => t.id === activePOSTabId) || posTabs[0] || {
    id: 'tab-1',
    name: 'Tab 1',
    cart: [],
    patientName: '',
    isParked: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Sync tabs and backward-compatible single cart to storage
  useEffect(() => {
    storageService.savePOSTabs(posTabs);
    storageService.saveActivePOSTabId(activePOSTab.id);
    storageService.saveCart(activePOSTab.cart);
    storageService.saveCartPatientName(activePOSTab.patientName || '');
  }, [posTabs, activePOSTab]);

  const handleSelectPOSTab = (tabId: string) => {
    setActivePOSTabId(tabId);
  };

  const handleAddPOSTab = (customName?: string) => {
    const newTabNumber = posTabs.length + 1;
    const newTab: POSTab = {
      id: `tab-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: customName || `Tab ${newTabNumber}`,
      cart: [],
      patientName: '',
      isParked: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setPosTabs((prev) => [...prev, newTab]);
    setActivePOSTabId(newTab.id);
    showToast(`Opened new order tab "${newTab.name}".`, 'info');
  };

  const handleClosePOSTab = (tabId: string) => {
    const target = posTabs.find((t) => t.id === tabId);
    if (!target) return;

    if (target.cart.length > 0) {
      const confirmClose = window.confirm(
        `Tab "${target.name}" contains ${target.cart.length} item(s). Close and discard this tab's cart?`
      );
      if (!confirmClose) return;
    }

    if (posTabs.length <= 1) {
      const freshTab: POSTab = {
        id: `tab-${Date.now()}`,
        name: 'Tab 1',
        cart: [],
        patientName: '',
        isParked: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setPosTabs([freshTab]);
      setActivePOSTabId(freshTab.id);
      showToast('Tab cleared and reset to Tab 1.', 'info');
      return;
    }

    const remaining = posTabs.filter((t) => t.id !== tabId);
    setPosTabs(remaining);

    if (activePOSTabId === tabId) {
      const currentIdx = posTabs.findIndex((t) => t.id === tabId);
      const nextIdx = Math.max(0, currentIdx - 1);
      setActivePOSTabId(remaining[nextIdx]?.id || remaining[0].id);
    }
    showToast(`Closed tab "${target.name}".`, 'info');
  };

  const handleRenamePOSTab = (tabId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setPosTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, name: trimmed, updatedAt: Date.now() } : t))
    );
  };

  const handleToggleParkPOSTab = (tabId: string) => {
    setPosTabs((prev) =>
      prev.map((t) => {
        if (t.id === tabId) {
          const willPark = !t.isParked;
          showToast(
            willPark ? `Tab "${t.name}" put on hold / parked.` : `Tab "${t.name}" resumed.`,
            'info'
          );
          return { ...t, isParked: willPark, updatedAt: Date.now() };
        }
        return t;
      })
    );
  };

  const handleUpdateActiveCart = (newCart: CartItem[]) => {
    setPosTabs((prev) =>
      prev.map((t) => (t.id === activePOSTab.id ? { ...t, cart: newCart, updatedAt: Date.now() } : t))
    );
  };

  const handleUpdateActivePatientName = (patientName: string) => {
    setPosTabs((prev) =>
      prev.map((t) => {
        if (t.id === activePOSTab.id) {
          const isGeneric = /^Tab \d+$/i.test(t.name);
          const newName = isGeneric && patientName.trim() ? `${t.name}: ${patientName.trim()}` : t.name;
          return { ...t, patientName, name: newName, updatedAt: Date.now() };
        }
        return t;
      })
    );
  };

  // Modals
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [receiptModalTx, setReceiptModalTx] = useState<SaleTransaction | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'warning' | 'error' } | null>(null);

  // Network Connectivity Hook
  const { isOnline, isSimulatedOffline, toggleSimulatedOffline } = useOnlineStatus();

  const showToast = (text: string, type: 'success' | 'info' | 'warning' | 'error' = 'success') => {
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

  const handleLogout = () => {
    storageService.logoutActiveUser(currentUser);
    setCurrentUser(null);
    void signOutSupabase();
    showToast('Signed out of session.', 'info');
  };

  // Restore the real Supabase Auth session on every browser/device.
  // localStorage is never treated as an authentication authority.
  useEffect(() => {
    if (!supabaseConfig.isConfigured()) {
      setCurrentUser(null);
      return;
    }
    let cancelled = false;
    void getAuthenticatedProfile().then((user) => {
      if (!cancelled) setCurrentUser(user);
    });
    const unsubscribe = onSupabaseAuthStateChange((user) => {
      if (!cancelled) setCurrentUser(user);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // First-run setup: while logged out, check whether any administrator
  // account exists yet so LoginView can offer the bootstrap "create
  // administrator" form instead of a sign-in form nobody could pass.
  useEffect(() => {
    if (currentUser || !supabaseConfig.isConfigured()) {
      setIsBootstrapAvailable(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const available = await checkBootstrapAvailable();
      if (!cancelled) setIsBootstrapAvailable(available);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  // Security: auto-logout after a period of inactivity. Runs only while a
  // user is signed in, and resets on any mouse/keyboard/touch/scroll activity.
  useSessionTimeout({
    enabled: !!currentUser,
    timeoutMs: SESSION_TIMEOUT_MINUTES * 60 * 1000,
    warningMs: SESSION_WARNING_SECONDS * 1000,
    onWarning: () => showToast(`Session will expire in ${SESSION_WARNING_SECONDS}s due to inactivity...`, 'warning'),
    onTimeout: () => {
      if (currentUser) {
        storageService.logoutActiveUser(currentUser);
        setCurrentUser(null);
        void signOutSupabase();
        showToast('You were signed out automatically after a period of inactivity.', 'info');
      }
    },
  });

  // Hydrate the clinic workspace from the shared Supabase source of truth.
  const refreshClinicalData = async () => {
    if (!supabaseConfig.isConfigured()) return;
    const [cloudPatients, cloudVisits, cloudConsultations, cloudClinicalTests] = await Promise.all([
      pullPatientsFromSupabase(),
      pullVisitsFromSupabase(),
      pullConsultationsFromSupabase(),
      pullClinicalTestsFromSupabase(),
    ]);
    if (cloudPatients) setPatients(cloudPatients);
    if (cloudVisits) setVisits(cloudVisits);
    if (cloudConsultations) setConsultations(cloudConsultations);
    if (cloudClinicalTests) setClinicalTests(cloudClinicalTests);
  };

  useEffect(() => {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'clinician')) {
      setPatients([]);
      setVisits([]);
      setConsultations([]);
      setClinicalTests([]);
      return;
    }
    void refreshClinicalData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.role]);

  // Cloud hydration: when Supabase is configured, pull the latest medications,
  // prescriptions & tests from the cloud on login so this device starts from
  // the shared source of truth rather than stale local data.
  useEffect(() => {
    if (!currentUser || !supabaseConfig.isConfigured()) return;
    (async () => {
      const [cloudMeds, cloudRx, cloudTests] = await Promise.all([
        storageService.pullMedicationsFromCloud(),
        storageService.pullPrescriptionsFromCloud(),
        storageService.pullTestsFromCloud(),
      ]);
      if (cloudMeds && cloudMeds.length > 0) {
        setMedications(cloudMeds);
        storageService.saveMedications(cloudMeds);
      }
      if (cloudRx) {
        setPrescriptions(cloudRx);
        storageService.savePrescriptions(cloudRx);
      }
      if (cloudTests) {
        setTests(cloudTests);
        storageService.saveTests(cloudTests);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // Realtime sync: live-refresh medications/prescriptions/tests when another
  // device (a different cashier till, the clinician's tablet, admin laptop)
  // writes a change to Supabase.
  useRealtimeSync({
    enabled: !!currentUser,
    onMedicationsChanged: async () => {
      const cloudMeds = await storageService.pullMedicationsFromCloud();
      if (cloudMeds) {
        setMedications(cloudMeds);
        storageService.saveMedications(cloudMeds);
      }
    },
    onPrescriptionsChanged: async () => {
      const cloudRx = await storageService.pullPrescriptionsFromCloud();
      if (cloudRx) {
        setPrescriptions(cloudRx);
        storageService.savePrescriptions(cloudRx);
      }
    },
    onTestsChanged: async () => {
      const cloudTests = await storageService.pullTestsFromCloud();
      if (cloudTests) {
        setTests(cloudTests);
        storageService.saveTests(cloudTests);
      }
    },
    onPatientsChanged: refreshClinicalData,
    onConsultationsChanged: refreshClinicalData,
    onClinicalTestsChanged: refreshClinicalData,
  });

  // Default landing tab per role (used on login & when redirected off a restricted tab)
  const defaultTabForRole = (role: UserRole): AppNavTab => {
    if (role === 'clinician') return 'clinical';
    return 'pos';
  };

  // Enforce access control on tab state: users cannot remain on a tab their role can't access
  useEffect(() => {
    if (currentUser && !isTabAllowedForRole(activeTab, currentUser.role)) {
      setActiveTab(defaultTabForRole(currentUser.role));
      showToast('Access restricted: That module is not available for your role.', 'warning');
    }
  }, [currentUser?.role, activeTab]);

  // Sync Offline Queue when returning online or manually triggered
  const handleSyncOfflineQueue = () => {
    if (offlineQueue.length === 0) {
      showToast('No offline transactions waiting to sync.', 'info');
      return;
    }

    // Without a configured Supabase project there is no server to sync to;
    // fall back to just clearing local "offline" flags so the UI queue
    // doesn't grow unbounded while running in local-only/demo mode.
    if (!supabaseConfig.isConfigured()) {
      const count = offlineQueue.length;
      const localOnlySynced = transactions.map((tx) =>
        tx.isOffline ? { ...tx, isOffline: false, synced: false } : tx
      );
      setTransactions(localOnlySynced);
      storageService.saveTransactions(localOnlySynced);
      setOfflineQueue([]);
      storageService.clearOfflineQueue();
      showToast(
        `Cleared ${count} offline transaction${count > 1 ? 's' : ''} (no database configured, saved locally only).`,
        'info'
      );
      return;
    }

    const count = offlineQueue.length;

    (async () => {
      const results = await Promise.all(offlineQueue.map((tx) => storageService.pushTransactionToCloud(tx)));
      const succeededIds = new Set(offlineQueue.filter((_, i) => results[i]).map((tx) => tx.id));
      const failedCount = count - succeededIds.size;

      const syncedTransactions = transactions.map((tx) => {
        if (tx.isOffline && succeededIds.has(tx.id)) {
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

      const remainingQueue = offlineQueue.filter((tx) => !succeededIds.has(tx.id));
      setOfflineQueue(remainingQueue);
      storageService.saveOfflineQueue(remainingQueue);

      if (succeededIds.size > 0) {
        showToast(
          `Synced ${succeededIds.size} offline transaction${succeededIds.size > 1 ? 's' : ''} to the server${
            failedCount > 0 ? `, ${failedCount} still pending` : ''
          }.`,
          failedCount > 0 ? 'warning' : 'success'
        );
      } else {
        showToast('Unable to synchronize changes. Will retry when connectivity is restored.', 'warning');
      }
    })();
  };

  // Automatic sync when connection is restored
  useEffect(() => {
    if (isOnline && offlineQueue.length > 0) {
      handleSyncOfflineQueue();
    }
  }, [isOnline]);

  // Inventory Management Handlers with Authorization Enforcement & Pharmaceutical Compliance
  const handleUpdateMedication = (updated: Medication) => {
    if (!currentUser || currentUser.role !== 'admin') {
      showToast('Unauthorized: Only administrators can modify stock or pricing.', 'warning');
      return;
    }

    // Stricter Validation: Stock cannot fall below zero
    if (typeof updated.stock !== 'number' || isNaN(updated.stock) || updated.stock < 0) {
      showToast('Pharmaceutical Compliance Error: Stock levels cannot fall below zero.', 'error');
      return;
    }

    // Stricter Validation: Batch information must be strictly associated
    if (!updated.batchNumber || !updated.batchNumber.trim()) {
      showToast('Pharmaceutical Compliance Error: Batch/Lot number is strictly required.', 'error');
      return;
    }

    if (!updated.expiryDate || !updated.expiryDate.trim()) {
      showToast('Pharmaceutical Compliance Error: Expiration date is strictly required.', 'error');
      return;
    }

    const cleanUpdated: Medication = {
      ...updated,
      stock: Math.max(0, Math.floor(updated.stock)),
      batchNumber: updated.batchNumber.trim(),
      expiryDate: updated.expiryDate.trim(),
    };

    const updatedList = medications.map((m) => (m.id === cleanUpdated.id ? cleanUpdated : m));
    setMedications(updatedList);
    storageService.saveMedications(updatedList);
    storageService.pushMedicationToCloud(cleanUpdated);

    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'INVENTORY_UPDATED',
      details: `Updated item ${cleanUpdated.name} (Stock: ${cleanUpdated.stock}, Batch: ${cleanUpdated.batchNumber}, Expiry: ${cleanUpdated.expiryDate}, Price: ${formatKSh(cleanUpdated.price)})`,
      category: 'INVENTORY',
    });
    setAuditLogs(storageService.getAuditLogs());

    showToast(`Updated medication details for ${cleanUpdated.name}.`, 'success');
  };

  const handleAddMedication = (newItem: Medication) => {
    if (!currentUser || currentUser.role !== 'admin') {
      showToast('Unauthorized: Only administrators can add products.', 'warning');
      return;
    }

    // Stricter Validation: Stock cannot fall below zero
    if (typeof newItem.stock !== 'number' || isNaN(newItem.stock) || newItem.stock < 0) {
      showToast('Pharmaceutical Compliance Error: Stock levels cannot fall below zero.', 'error');
      return;
    }

    // Stricter Validation: Batch information is strictly mandatory
    if (!newItem.batchNumber || !newItem.batchNumber.trim()) {
      showToast('Pharmaceutical Compliance Error: Batch/Lot number is strictly required for registration.', 'error');
      return;
    }

    if (!newItem.expiryDate || !newItem.expiryDate.trim()) {
      showToast('Pharmaceutical Compliance Error: Expiration date is strictly required.', 'error');
      return;
    }

    const cleanItem: Medication = {
      ...newItem,
      stock: Math.max(0, Math.floor(newItem.stock)),
      batchNumber: newItem.batchNumber.trim(),
      expiryDate: newItem.expiryDate.trim(),
    };

    const updatedList = [cleanItem, ...medications];
    setMedications(updatedList);
    storageService.saveMedications(updatedList);
    storageService.pushMedicationToCloud(cleanItem);

    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'PRODUCT_ADDED',
      details: `Added new product ${cleanItem.name} (${cleanItem.dosage}, Batch: ${cleanItem.batchNumber}, Expiry: ${cleanItem.expiryDate}, Stock: ${cleanItem.stock}, Price: ${formatKSh(cleanItem.price)})`,
      category: 'INVENTORY',
    });
    setAuditLogs(storageService.getAuditLogs());

    showToast(`Added ${cleanItem.name} to pharmacy inventory.`, 'success');
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
    storageService.deleteMedicationFromCloud(id);
    setPosTabs((prev) =>
      prev.map((t) => ({ ...t, cart: t.cart.filter((i) => i.medication.id !== id), updatedAt: Date.now() }))
    );

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
    if (!med) {
      showToast('Medication not found in inventory.', 'error');
      return;
    }

    // Stricter Validation: Stock levels can never fall below zero
    if (typeof newStock !== 'number' || isNaN(newStock) || newStock < 0) {
      showToast(`Compliance Error: Stock levels cannot fall below zero (requested: ${newStock}). Transaction rejected.`, 'error');
      return;
    }

    // Stricter Validation: Batch information must be strictly associated with every product adjustment
    const batch = (newBatchNumber && newBatchNumber.trim()) || med.batchNumber?.trim();
    if (!batch) {
      showToast('Pharmaceutical Compliance Error: Every stock adjustment must be strictly associated with a valid batch/lot number.', 'error');
      return;
    }

    const expiry = (newExpiryDate && newExpiryDate.trim()) || med.expiryDate?.trim();
    if (!expiry) {
      showToast('Pharmaceutical Compliance Error: Valid expiration date is required for stock adjustment batch association.', 'error');
      return;
    }

    if (!reason || !reason.trim()) {
      showToast('Pharmaceutical Compliance Error: Reason is mandatory for regulatory audit compliance.', 'error');
      return;
    }

    const prevStock = med.stock;
    const cleanStock = Math.max(0, Math.floor(newStock));
    const diff = cleanStock - prevStock;

    const updated: Medication = {
      ...med,
      stock: cleanStock,
      batchNumber: batch,
      expiryDate: expiry,
    };
    const updatedList = medications.map((m) => (m.id === medicationId ? updated : m));
    setMedications(updatedList);
    storageService.saveMedications(updatedList);
    storageService.pushMedicationToCloud(updated);

    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'STOCK_ADJUSTMENT',
      details: `Compliance Verified | Product: "${med.name}" | Batch: "${batch}" | Expiry: "${expiry}" | Previous Stock: ${prevStock} -> New Stock: ${cleanStock} (Adjustment: ${diff >= 0 ? '+' : ''}${diff}) | Reason: ${reason.trim()}`,
      category: 'INVENTORY',
    });
    setAuditLogs(storageService.getAuditLogs());
    showToast(`Stock adjusted for ${med.name}: ${prevStock} -> ${cleanStock} (${diff >= 0 ? '+' : ''}${diff}) [Batch: ${batch}]`, 'success');
  };

  // Prescription Management Handlers
  const handleAddNewPrescription = (newRx: Prescription) => {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'clinician')) {
      showToast('Unauthorized: Only clinicians and administrators can write new prescriptions.', 'warning');
      return;
    }
    const updated = [newRx, ...prescriptions];
    setPrescriptions(updated);
    storageService.savePrescriptions(updated);
    storageService.pushPrescriptionToCloud(newRx);
    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'PRESCRIPTION_CREATED',
      details: `Registered prescription ${newRx.rxNumber} for ${newRx.patientName} (${newRx.medicationName})`,
      category: 'CLINICAL',
    });
    setAuditLogs(storageService.getAuditLogs());
    showToast(`Prescription ${newRx.rxNumber} for ${newRx.patientName} registered.`, 'success');
  };

  // Clinical Test Handlers (clinician orders & records results)
  const handleAddNewTest = (newTest: MedicalTest) => {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'clinician')) {
      showToast('Unauthorized: Only clinicians and administrators can order clinical tests.', 'warning');
      return;
    }
    const updated = [newTest, ...tests];
    setTests(updated);
    storageService.saveTests(updated);
    storageService.pushTestToCloud(newTest);
    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'TEST_ORDERED',
      details: `Ordered test ${newTest.testNumber} (${newTest.testType}) for ${newTest.patientName}`,
      category: 'CLINICAL',
    });
    setAuditLogs(storageService.getAuditLogs());
    showToast(`Test ${newTest.testNumber} for ${newTest.patientName} ordered.`, 'success');
  };

  const handleUpdateTest = (updatedTest: MedicalTest) => {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'clinician')) {
      showToast('Unauthorized: Only clinicians and administrators can record test results.', 'warning');
      return;
    }
    const updated = tests.map((t) => (t.id === updatedTest.id ? updatedTest : t));
    setTests(updated);
    storageService.saveTests(updated);
    storageService.pushTestToCloud(updatedTest);
    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'TEST_UPDATED',
      details: `Updated test ${updatedTest.testNumber} for ${updatedTest.patientName} to status "${updatedTest.status}"`,
      category: 'CLINICAL',
    });
    setAuditLogs(storageService.getAuditLogs());
    showToast(`Test ${updatedTest.testNumber} updated.`, 'success');
  };

  const handleDispensePrescriptionToCart = (rx: Prescription) => {
    const lines = rx.items && rx.items.length > 0
      ? rx.items.filter((item) => item.quantityPrescribed - item.quantityDispensedSoFar > 0)
      : [{
          id: `legacy-${rx.id}`,
          medicationId: rx.medicationId || '',
          medicationName: rx.medicationName,
          dosageInstructions: rx.dosageInstructions || '',
          quantityPrescribed: rx.quantityPrescribed,
          quantityDispensedSoFar: rx.quantityDispensedSoFar || 0,
          refillsAllowed: rx.refillsAllowed || 0,
          refillsRemaining: rx.refillsRemaining || 0,
        }];

    if (lines.length === 0) {
      showToast(`Prescription ${rx.rxNumber} has no remaining quantities to dispense.`, 'warning');
      return;
    }

    const itemDiscount = rx.insuranceCoPayRate !== undefined ? (1 - rx.insuranceCoPayRate) * 100 : 0;
    const additions: CartItem[] = [];

    for (const line of lines) {
      const med = medications.find((m) => m.id === line.medicationId);
      if (!med) {
        showToast(`Medication record for "${line.medicationName}" is missing from current inventory.`, 'warning');
        return;
      }
      const remaining = Math.max(0, line.quantityPrescribed - line.quantityDispensedSoFar);
      if (med.stock < remaining) {
        showToast(`Insufficient stock for ${med.name}: ${remaining} required, ${med.stock} available.`, 'warning');
        return;
      }
      const alreadyInCart = activePOSTab.cart.some(
        (item) => item.prescriptionId === rx.id && item.prescriptionItemId === line.id
      );
      if (!alreadyInCart) {
        additions.push({
          medication: med,
          quantity: remaining,
          prescriptionId: rx.id,
          prescriptionItemId: line.id,
          rxNumber: rx.rxNumber,
          patientName: rx.patientName,
          discountPercent: itemDiscount,
        });
      }
    }

    if (additions.length === 0) {
      showToast(`Prescription ${rx.rxNumber} is already in the active checkout.`, 'info');
      setActiveTab('pos');
      return;
    }

    const updatedCart = [...activePOSTab.cart, ...additions];
    setPosTabs((prev) =>
      prev.map((t) => {
        if (t.id !== activePOSTab.id) return t;
        const isGeneric = /^Tab \d+$/i.test(t.name);
        const tabName = isGeneric ? `${t.name}: ${rx.patientName}` : t.name;
        return {
          ...t,
          cart: updatedCart,
          patientName: t.patientName || rx.patientName,
          name: tabName,
          isParked: false,
          updatedAt: Date.now(),
        };
      })
    );

    playScanSuccessBeep();
    showToast(
      `Prescription ${rx.rxNumber} loaded: ${additions.length} medication line(s) for ${rx.patientName}.`,
      'success'
    );
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
        showToast(`Compliance Alert: Medication ${matchedMed.name} (${matchedMed.barcode}) is out of stock.`, 'warning');
        return;
      }

      // Add to active tab's cart with stock limit guard
      const existingIdx = activePOSTab.cart.findIndex((i) => i.medication.id === matchedMed.id);
      let updatedCart: CartItem[];
      if (existingIdx > -1) {
        if (activePOSTab.cart[existingIdx].quantity + 1 > matchedMed.stock) {
          showToast(`Stock limit reached: Only ${matchedMed.stock} units available for ${matchedMed.name}.`, 'warning');
          return;
        }
        updatedCart = [...activePOSTab.cart];
        updatedCart[existingIdx].quantity += 1;
      } else {
        updatedCart = [...activePOSTab.cart, { medication: matchedMed, quantity: 1 }];
      }
      handleUpdateActiveCart(updatedCart);

      showToast(`Scanned & added: ${matchedMed.name} to tab "${activePOSTab.name}"`, 'success');
      if (activeTab !== 'pos') {
        setActiveTab('pos');
      }
      return;
    }

    showToast(`Barcode "${code}" was not recognized in prescriptions or drug catalog.`, 'warning');
  };

  // Sale Finalization: Supabase is the source of truth for online sales.
  // No local stock or transaction state changes until the authoritative save succeeds.
  const handleCompleteSale = async (transaction: SaleTransaction): Promise<boolean> => {
    if (!currentUser) {
      showToast('Sale rejected: no authenticated user session.', 'error');
      return false;
    }

    for (const soldItem of transaction.items) {
      const currentMed = medications.find((m) => m.id === soldItem.medicationId);
      if (!currentMed) {
        showToast(`Sale rejected: ${soldItem.name} is not in the current inventory.`, 'error');
        return false;
      }
      if (currentMed.stock < soldItem.quantity) {
        showToast(
          `Sale rejected: ${currentMed.name} has only ${currentMed.stock} units available; ${soldItem.quantity} requested.`,
          'error'
        );
        return false;
      }
      if (!soldItem.batchNumber || !soldItem.expiryDate) {
        showToast(`Sale rejected: batch and expiry information are required for ${soldItem.name}.`, 'error');
        return false;
      }
    }

    if (!transaction.isOffline) {
      const saved = await storageService.pushTransactionToCloud(transaction);
      if (!saved) {
        showToast(
          `Sale ${transaction.receiptNumber} was NOT saved. No local stock deduction was applied. Retry the sale.`,
          'error'
        );
        return false;
      }
    }

    const updatedMeds = medications.map((med) => {
      const soldItem = transaction.items.find((item) => item.medicationId === med.id);
      return soldItem ? { ...med, stock: Math.max(0, med.stock - soldItem.quantity) } : med;
    });
    setMedications(updatedMeds);
    storageService.saveMedications(updatedMeds);

    const updatedRxs = prescriptions.map((rx) => {
      const soldRx = transaction.items.find((item) => item.rxNumber === rx.rxNumber);
      if (!soldRx) return rx;
      const newRemaining = Math.max(0, rx.refillsRemaining - 1);
      return {
        ...rx,
        refillsRemaining: newRemaining,
        quantityDispensedSoFar: rx.quantityDispensedSoFar + soldRx.quantity,
        status: newRemaining === 0 ? ('Dispensed' as const) : rx.status,
      };
    });
    setPrescriptions(updatedRxs);
    storageService.savePrescriptions(updatedRxs);

    const newTxList = [transaction, ...transactions];
    setTransactions(newTxList);
    storageService.saveTransactions(newTxList);

    if (currentUser) {
      const batchDetails = transaction.items
        .map((it) => `${it.name} (Qty: ${it.quantity}, Batch: ${it.batchNumber || 'Unspecified'})`)
        .join('; ');
      storageService.addAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'SALE_COMPLETED',
        details: `Sale ${transaction.receiptNumber} recorded (${transaction.items.length} items, Total: ${formatKSh(transaction.total)}, Method: ${transaction.paymentMethod}) | Batches Dispensed: [${batchDetails}]`,
        category: 'SALES',
      });
      setAuditLogs(storageService.getAuditLogs());
    }

    if (transaction.isOffline) {
      storageService.addToOfflineQueue(transaction);
      setOfflineQueue(storageService.getOfflineQueue());
      showToast(`Sale queued offline (${transaction.receiptNumber}). It will sync when online.`, 'info');
    } else {
      showToast(`Sale completed successfully! Receipt ${transaction.receiptNumber}`, 'success');
    }

    setReceiptModalTx(transaction);

    if (posTabs.length > 1) {
      const remainingTabs = posTabs.filter((t) => t.id !== activePOSTab.id);
      setPosTabs(remainingTabs);
      setActivePOSTabId(remainingTabs[0]?.id || 'tab-1');
    } else {
      const freshTab: POSTab = {
        id: `tab-${Date.now()}`,
        name: 'Tab 1',
        cart: [],
        patientName: '',
        isParked: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setPosTabs([freshTab]);
      setActivePOSTabId(freshTab.id);
    }

    return true;
  };

  // System Data Reset Handler (Admin Only) - wipes stock, sales & activity while strictly preserving shop details & accounts
  const handleResetSystemData = () => {
    if (currentUser.role !== 'admin') {
      showToast('Unauthorized: Only administrators can reset system data.', 'error');
      return;
    }

    storageService.resetBusinessData({
      id: currentUser.id,
      name: currentUser.name,
      role: currentUser.role,
    });

    // Refresh state in App.tsx
    setMedications([]);
    setTransactions([]);
    setOfflineQueue([]);
    setPrescriptions([]);
    setTests([]);
    setAuditLogs(storageService.getAuditLogs());

    // Reset POS tabs
    const freshTab: POSTab = {
      id: 'tab-1',
      name: 'Tab 1',
      cart: [],
      patientName: '',
      isParked: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setPosTabs([freshTab]);
    setActivePOSTabId('tab-1');

    // Keep shop details intact
    const preservedSettings = storageService.getReceiptSettings();
    setReceiptSettings(preservedSettings);

    showToast(
      `System reset complete: All stock, sales, and past logs deleted. Shop profile for "${preservedSettings.pharmacyName}" preserved.`,
      'success'
    );
  };

  // Authentication & Session
  const handleLogin = (user: User) => {
    storageService.saveActiveUser(user);
    setCurrentUser(user);
    if (!isTabAllowedForRole(activeTab, user.role)) {
      setActiveTab(defaultTabForRole(user.role));
    }
    showToast(`Signed into session as ${user.name}`, 'success');
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
                  : toastMessage.type === 'error'
                  ? 'bg-red-900 text-white border-red-700'
                  : toastMessage.type === 'warning'
                  ? 'bg-amber-900 text-white border-amber-700'
                  : 'bg-slate-900 text-white border-slate-700'
              }`}
            >
              {toastMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
              ) : toastMessage.type === 'error' ? (
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
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
          isBootstrapAvailable={isBootstrapAvailable}
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
                : toastMessage.type === 'error'
                ? 'bg-red-900 text-white border-red-700'
                : toastMessage.type === 'warning'
                ? 'bg-amber-900 text-white border-amber-700'
                : 'bg-slate-900 text-white border-slate-700'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
            ) : toastMessage.type === 'error' ? (
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
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
          if (!isTabAllowedForRole(tab, currentUser.role)) {
            showToast('That module is not available for your role.', 'warning');
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
              cart={activePOSTab.cart}
              onUpdateCart={handleUpdateActiveCart}
              onCompleteSale={handleCompleteSale}
              onOpenScanner={() => setIsScannerOpen(true)}
              receiptSettings={receiptSettings}
              isOnline={isOnline}
              currentUser={currentUser}
              tabs={posTabs}
              activeTabId={activePOSTab.id}
              onSelectTab={handleSelectPOSTab}
              onAddTab={handleAddPOSTab}
              onCloseTab={handleClosePOSTab}
              onRenameTab={handleRenamePOSTab}
              onToggleParkTab={handleToggleParkPOSTab}
              activePatientName={activePOSTab.patientName || ''}
              onUpdatePatientName={handleUpdateActivePatientName}
            />
          )}

          {activeTab === 'clinical' && (currentUser.role === 'admin' || currentUser.role === 'clinician') && (
            <ClinicalWorkflowView
              currentUser={currentUser}
              patients={patients}
              consultations={consultations}
              clinicalTests={clinicalTests}
              prescriptions={prescriptions}
              medications={medications}
              onRefreshClinicalData={() => void refreshClinicalData()}
              onShowToast={showToast}
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

          {activeTab === 'tests' && (
            <TestsManager
              tests={tests}
              onAddNewTest={handleAddNewTest}
              onUpdateTest={handleUpdateTest}
              userRole={currentUser.role}
              currentUserName={currentUser.name}
              currentUserLicense={currentUser.licenseNumber}
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
                const existingIdx = activePOSTab.cart.findIndex((i) => i.medication.id === med.id);
                let updated: CartItem[];
                if (existingIdx > -1) {
                  updated = [...activePOSTab.cart];
                  updated[existingIdx].quantity += 1;
                } else {
                  updated = [...activePOSTab.cart, { medication: med, quantity: 1 }];
                }
                handleUpdateActiveCart(updated);
                showToast(`Added ${med.name} to POS tab "${activePOSTab.name}".`, 'success');
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

          {/* ADMIN-ONLY MODULE: Admin Settings */}
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
              onResetSystemData={handleResetSystemData}
              medicationCount={medications.length}
              transactionCount={transactions.length}
              prescriptionCount={prescriptions.length}
              auditLogCount={auditLogs.length}
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
