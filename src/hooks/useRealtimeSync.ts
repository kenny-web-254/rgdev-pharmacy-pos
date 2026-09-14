import { useEffect, useRef } from 'react';
import { RealtimeTable, subscribeToRealtimeChanges } from '../services/supabase';
import { supabaseConfig } from '../services/supabase';

interface UseRealtimeSyncOptions {
  enabled: boolean;
  onMedicationsChanged: () => void;
  onPrescriptionsChanged: () => void;
  onTestsChanged: () => void;
  onPatientsChanged?: () => void;
  onConsultationsChanged?: () => void;
  onClinicalTestsChanged?: () => void;
  onSalesChanged?: () => void;
  onReceiptSettingsChanged?: () => void;
  onUsersChanged?: () => void;
}

/**
 * Keeps an authenticated browser session subscribed to the shared Supabase
 * source of truth. Realtime never becomes a second database: callbacks must
 * re-read authoritative rows from Supabase before updating React state.
 */
export function useRealtimeSync({
  enabled,
  onMedicationsChanged,
  onPrescriptionsChanged,
  onTestsChanged,
  onPatientsChanged,
  onConsultationsChanged,
  onClinicalTestsChanged,
  onSalesChanged,
  onReceiptSettingsChanged,
  onUsersChanged,
}: UseRealtimeSyncOptions) {
  const callbacksRef = useRef({
    onMedicationsChanged,
    onPrescriptionsChanged,
    onTestsChanged,
    onPatientsChanged,
    onConsultationsChanged,
    onClinicalTestsChanged,
    onSalesChanged,
    onReceiptSettingsChanged,
    onUsersChanged,
  });
  callbacksRef.current = {
    onMedicationsChanged,
    onPrescriptionsChanged,
    onTestsChanged,
    onPatientsChanged,
    onConsultationsChanged,
    onClinicalTestsChanged,
    onSalesChanged,
    onReceiptSettingsChanged,
    onUsersChanged,
  };

  useEffect(() => {
    if (!enabled || !supabaseConfig.isConfigured()) return;

    const tables: RealtimeTable[] = [
      'medications',
      'prescriptions',
      'tests',
      'patients',
      'consultations',
      'clinical_tests',
      'sale_transactions',
      'receipt_settings',
      'pharmacy_users',
    ];

    const unsubscribe = subscribeToRealtimeChanges(tables, (table) => {
      if (table === 'medications') callbacksRef.current.onMedicationsChanged();
      if (table === 'prescriptions') callbacksRef.current.onPrescriptionsChanged();
      if (table === 'tests') callbacksRef.current.onTestsChanged();
      if (table === 'patients') callbacksRef.current.onPatientsChanged?.();
      if (table === 'consultations') callbacksRef.current.onConsultationsChanged?.();
      if (table === 'clinical_tests') callbacksRef.current.onClinicalTestsChanged?.();
      if (table === 'sale_transactions') callbacksRef.current.onSalesChanged?.();
      if (table === 'receipt_settings') callbacksRef.current.onReceiptSettingsChanged?.();
      if (table === 'pharmacy_users') callbacksRef.current.onUsersChanged?.();
    });

    return () => unsubscribe();
    // Subscription lifecycle intentionally follows authentication state only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
