from pathlib import Path
import re


def replace_required(text, pattern, replacement, label, flags=re.S):
    new, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'REQUIRED TRANSFORM FAILED: {label}')
    return new

# ------------------------------------------------------------------
# POSTerminal: do not clear the cart or close checkout until the
# application confirms that the sale was accepted by the source of truth.
# ------------------------------------------------------------------
post_path = Path('src/components/POSTerminal.tsx')
p = post_path.read_text()
p = p.replace(
    '  onCompleteSale: (transaction: SaleTransaction) => void;',
    '  onCompleteSale: (transaction: SaleTransaction) => Promise<boolean> | boolean;'
)

# Quick cash path: await the authoritative sale result before clearing the cart.
p = replace_required(
    p,
    r"      onCompleteSale\(transaction\);\n      onUpdateCart\(\[\]\);\n      storageService\.clearCart\(\);\n      setIsCheckoutOpen\(false\);\n      handlePatientNameChange\(''\);",
    """      const saved = await onCompleteSale(transaction);
      if (!saved) {
        setCheckoutError('Sale was not saved. No stock was finalized and the cart has been kept for retry.');
        return;
      }
      onUpdateCart([]);
      storageService.clearCart();
      setIsCheckoutOpen(false);
      handlePatientNameChange('');""",
    'quick cash authoritative save',
    flags=re.S,
)

# The normal checkout handler is the same transaction pattern, but appears a second time.
p = replace_required(
    p,
    r"      onCompleteSale\(transaction\);\n      onUpdateCart\(\[\]\);\n      storageService\.clearCart\(\);\n      setIsCheckoutOpen\(false\);\n      handlePatientNameChange\(''\);",
    """      const saved = await onCompleteSale(transaction);
      if (!saved) {
        setCheckoutError('Sale was not saved. No stock was finalized and the cart has been kept for retry.');
        return;
      }
      onUpdateCart([]);
      storageService.clearCart();
      setIsCheckoutOpen(false);
      handlePatientNameChange('');""",
    'normal checkout authoritative save',
    flags=re.S,
)

post_path.write_text(p)

# ------------------------------------------------------------------
# App: make online sales cloud-first. A failed RPC must not mutate the
# local stock/transaction state or display a successful sale receipt.
# Offline sales remain explicitly queued for later synchronization.
# ------------------------------------------------------------------
app_path = Path('src/App.tsx')
a = app_path.read_text()

new_handler = '''  // Sale Finalization with strict pharmaceutical stock and batch validation.
  // ONLINE: Supabase complete_sale() is the source of truth and must succeed first.
  // OFFLINE: retain the transaction in the local queue for later atomic cloud sync.
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

    // Online sales are committed atomically in Supabase before local UI state changes.
    if (!transaction.isOffline) {
      const saved = await storageService.pushTransactionToCloud(transaction);
      if (!saved) {
        showToast(
          `Sale ${transaction.receiptNumber} was NOT saved. No local stock deduction was applied. Check the connection and retry.`,
          'error'
        );
        return false;
      }
    }

    // Only after an online RPC succeeds (or an offline transaction is intentionally queued)
    // update this device's operational cache.
    const updatedMeds = medications.map((med) => {
      const soldItem = transaction.items.find((item) => item.medicationId === med.id);
      return soldItem ? { ...med, stock: Math.max(0, med.stock - soldItem.quantity) } : med;
    });
    setMedications(updatedMeds);
    storageService.saveMedications(updatedMeds);

    // Keep prescription display state in sync after a successful sale.
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
    updatedRxs
      .filter((rx) => transaction.items.some((item) => item.rxNumber === rx.rxNumber))
      .forEach((rx) => void storageService.pushPrescriptionToCloud(rx));

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

    // The receipt is opened only after the sale has been accepted/queued.
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

'''

a = replace_required(
    a,
    r"  // Sale Finalization with strict pharmaceutical stock and batch validation\n  const handleCompleteSale = \(transaction: SaleTransaction\) => \{[\s\S]*?\n  \};\n\n  // System Data Reset Handler",
    new_handler + '  // System Data Reset Handler',
    'authoritative App sale handler',
)
app_path.write_text(a)
print('Online sales are now cloud-first and checkout only clears after a successful save.')
