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
import { createClinicalPrescriptionToSupabase, getAuthenticatedProfile, getSupabase, onSupabaseAuthStateChange, pullClinicalTestsFromSupabase, pullConsultationsFromSupabase, pullPatientsFromSupabase, pullVisitsFromSupabase, startVisitForPatient, supabaseConfig, signOutSupabase } from './services/supabase';
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
    // Supabase Auth is the authentication authority. Refreshing local module
    // data must never replace the live authenticated session with localStorage.
    setUsers(storageService.getUsers());
    setAuditLogs(storageService.getAuditLogs());
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

  const handleAdjustStock = async (
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
    if (typeof newStock !== 'number' || isNaN(newStock) || newStock < 0) {
      showToast(`Compliance Error: Stock levels cannot fall below zero (requested: ${newStock}). Transaction rejected.`, 'error');
      return;
    }
    const batch = (newBatchNumber && newBatchNumber.trim()) || med.batchNumber?.trim();
    const expiry = (newExpiryDate && newExpiryDate.trim()) || med.expiryDate?.trim();
    if (!batch) {
      showToast('Pharmaceutical Compliance Error: A valid batch/lot number is required.', 'error');
      return;
    }
    if (!expiry) {
      showToast('Pharmaceutical Compliance Error: A valid expiration date is required.', 'error');
      return;
    }
    if (!reason || !reason.trim()) {
      showToast('Pharmaceutical Compliance Error: An adjustment reason is required for audit compliance.', 'error');
      return;
    }

    const client = supabaseConfig.isConfigured() ? getSupabase() : null;
    if (!client) {
      showToast('Inventory adjustment requires the connected Supabase database.', 'error');
      return;
    }

    const { data, error } = await client.rpc('adjust_inventory', {
      p_medication_id: medicationId,
      p_new_stock: Math.floor(newStock),
      p_reason: reason.trim(),
      p_batch_number: batch,
      p_expiry_date: expiry,
    });

    if (error || !data?.ok) {
      showToast(error?.message || 'Inventory adjustment was not saved.', 'error');
      return;
    }

    const cloudMeds = await storageService.pullMedicationsFromCloud();
    if (cloudMeds) {
      setMedications(cloudMeds);
      storageService.saveMedications(cloudMeds);
    }

    const previousStock = med.stock;
    const diff = Math.floor(newStock) - previousStock;
    setAuditLogs(storageService.getAuditLogs());
    showToast(
      `Stock adjusted for ${med.name}: ${previousStock} -> ${Math.floor(newStock)} (${diff >= 0 ? '+' : ''}${diff}) [Batch: ${batch}]`,
      'success'
    );
  };

  // Prescription Management Handlers
  const handleAddNewPrescription = async (newRx: Prescription) => {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'clinician')) {
      showToast('Unauthorized: Only clinicians and administrators can write new prescriptions.', 'warning');
      return;
    }

    // Every prescription must be tied to a real patient + visit. Standalone
    // intake resolves those IDs from the authoritative patient directory and
    // starts an active visit when necessary.
    let patient = newRx.patientId ? patients.find((p) => p.id === newRx.patientId) : undefined;
    if (!patient) {
      patient = patients.find(
        (p) =>
          p.fullName.trim().toLowerCase() === newRx.patientName.trim().toLowerCase() &&
          p.dob === newRx.patientDOB &&
          p.phone.trim() === newRx.patientPhone.trim()
      );
    }
    if (!patient) {
      showToast('Prescription was not saved. Register/select the patient in Clinical Workflow first.', 'warning');
      return;
    }

    let visitId = newRx.visitId;
    if (!visitId) {
      const activeVisit = visits.find((v) => v.patientId === patient.id && v.status === 'ACTIVE');
      if (activeVisit) {
        visitId = activeVisit.id;
      } else {
        const visitResult = await startVisitForPatient(patient.id);
        if (!visitResult.ok || !visitResult.visit) {
          showToast(visitResult.error || 'Unable to start the patient visit for this prescription.', 'warning');
          return;
        }
        visitId = visitResult.visit.id;
      }
    }

    const item: import('./types').PrescriptionItem = {
      id: `rxi-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`,
      medicationId: newRx.medicationId || '',
      medicationName: newRx.medicationName || '',
      dosageInstructions: newRx.dosageInstructions || 'As directed',
      quantityPrescribed: Number(newRx.quantityPrescribed || 0),
      quantityDispensedSoFar: 0,
      refillsAllowed: Number(newRx.refillsAllowed || 0),
      refillsRemaining: Number(newRx.refillsAllowed || 0),
    };

    if (!item.medicationId || !item.medicationName || item.quantityPrescribed <= 0) {
      showToast('Prescription was not saved. A medication and positive quantity are required.', 'warning');
      return;
    }

    const enrichedRx: Prescription = {
      ...newRx,
      id: newRx.id || `rx-${Date.now()}`,
      patientId: patient.id,
      visitId,
      patientName: patient.fullName,
      patientDOB: patient.dob,
      patientPhone: patient.phone,
      status: 'ISSUED',
      quantityPrescribed: item.quantityPrescribed,
      quantityDispensedSoFar: 0,
      items: newRx.items && newRx.items.length > 0 ? newRx.items : [item],
    };

    const result = await createClinicalPrescriptionToSupabase(
      enrichedRx,
      enrichedRx.items || [item]
    );
    if (!result.ok) {
      showToast(result.error || 'Prescription could not be saved to the clinical database.', 'warning');
      return;
    }

    const cloudRx = await storageService.pullPrescriptionsFromCloud();
    if (!cloudRx) {
      showToast('Prescription was saved, but the refreshed prescription list could not be loaded.', 'warning');
      return;
    }

    setPrescriptions(cloudRx);
    storageService.savePrescriptions(cloudRx);

    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'PRESCRIPTION_CREATED',
      details: `Registered prescription for ${patient.fullName} (${enrichedRx.medicationName})`,
      category: 'CLINICAL',
    });
    setAuditLogs(storageService.getAuditLogs());
    showToast(`Prescription for ${patient.fullName} registered successfully.`, 'success');
  };

  // Clinical Test Handlers (clinician orders & records results)
  const handleAddNewTest = async (newTest: MedicalTest) => {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'clinician')) {
      showToast('Unauthorized: Only clinicians and administrators can order clinical tests.', 'warning');
      return;
    }

    const previousTests = tests;
    const updated = [newTest, ...previousTests];
    setTests(updated);
    storageService.saveTests(updated);

    const saved = await storageService.pushTestToCloud(newTest);
    if (!saved) {
      setTests(previousTests);
      storageService.saveTests(previousTests);
      showToast('Test order was not saved to the clinical database. No local test record was retained.', 'warning');
      return;
    }

    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'TEST_ORDERED',
      details: `Ordered test ${newTest.testNumber || newTest.id} (${newTest.testType || newTest.testName}) for ${newTest.patientName}`,
      category: 'CLINICAL',
    });
    setAuditLogs(storageService.getAuditLogs());
    showToast(`Test ${newTest.testNumber || newTest.id} for ${newTest.patientName} ordered.`, 'success');
  };

  const handleUpdateTest = async (updatedTest: MedicalTest) => {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'clinician')) {
      showToast('Unauthorized: Only clinicians and administrators can record test results.', 'warning');
      return;
    }

    const previousTests = tests;
    const updated = tests.map((t) => (t.id === updatedTest.id ? updatedTest : t));
    setTests(updated);
    storageService.saveTests(updated);

    const saved = await storageService.pushTestToCloud(updatedTest);
    if (!saved) {
      setTests(previousTests);
      storageService.saveTests(previousTests);
      showToast('Test result was not saved to the clinical database. The previous local record was restored.', 'warning');
      return;
    }

    storageService.addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'TEST_UPDATED',
      details: `Updated test ${updatedTest.testNumber || updatedTest.id} for ${updatedTest.patientName} to status "${updatedTest.status}"`,
      category: 'CLINICAL',
    });
    setAuditLogs(storageService.getAuditLogs());
    showToast(`Test ${updatedTest.testNumber || updatedTest.id} updated.`, 'success');
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
  // For online checkout, local state is refreshed from the authoritative
  // database after the RPC succeeds. This prevents multi-item prescription
  // drift and duplicate/incorrect local stock deductions.
  const handleCompleteSale = async (transaction: SaleTransaction): Promise<boolean> => {
    if (!currentUser) {
      showToast('Sale rejected: no authenticated user session.', 'error');
      return false;
    }

    if (currentUser.role !== 'admin' && currentUser.role !== 'cashier') {
      showToast('Sale rejected: only Admin or Cashier sessions may complete sales.', 'error');
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

    if (transaction.isOffline) {
      // Offline sales are queued locally and are finalized authoritatively
      // when connectivity returns.
      const updatedMeds = medications.map((med) => {
        const quantity = transaction.items
          .filter((item) => item.medicationId === med.id)
          .reduce((sum, item) => sum + item.quantity, 0);
        return quantity > 0 ? { ...med, stock: Math.max(0, med.stock - quantity) } : med;
      });
      setMedications(updatedMeds);
      storageService.saveMedications(updatedMeds);

      const newTxList = [transaction, ...transactions];
      setTransactions(newTxList);
      storageService.saveTransactions(newTxList);
      storageService.addToOfflineQueue(transaction);
      setOfflineQueue(storageService.getOfflineQueue());
      setReceiptModalTx(transaction);
      showToast(`Sale queued offline (${transaction.receiptNumber}). It will sync when online.`, 'info');
      return true;
    }

    const saved = await storageService.pushTransactionToCloud(transaction);
    if (!saved) {
      showToast(
        `Sale ${transaction.receiptNumber} was NOT saved. No local stock deduction was applied. Retry the sale.`,
        'error'
      );
      return false;
    }

    const [cloudMeds, cloudRx] = await Promise.all([
      storageService.pullMedicationsFromCloud(),
      storageService.pullPrescriptionsFromCloud(),
    ]);

    if (!cloudMeds || !cloudRx) {
      showToast(
        `Sale ${transaction.receiptNumber} was saved, but the refreshed stock/dispensing view could not be loaded. Refreshing the page is safe; the database sale is already committed.`,
        'warning'
      );
    } else {
      setMedications(cloudMeds);
      storageService.saveMedications(cloudMeds);
      setPrescriptions(cloudRx);
      storageService.savePrescriptions(cloudRx);
    }

    const newTxList = [transaction, ...transactions.filter((tx) => tx.id !== transaction.id)];
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

    setReceiptModalTx(transaction);
    showToast(`Sale completed successfully! Receipt ${transaction.receiptNumber}`, 'success');

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
