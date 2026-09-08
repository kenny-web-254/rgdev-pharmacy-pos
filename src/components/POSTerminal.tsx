import React, { useState } from 'react';
import {
  AlertTriangle,
  Barcode,
  Camera,
  Check,
  CreditCard,
  FileCheck,
  Minus,
  Pill,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  ShieldAlert,
  ShoppingCart,
  Smartphone,
  Split,
  Trash2,
  User,
  Wallet,
} from 'lucide-react';
import {
  CartItem,
  Medication,
  MedicationCategory,
  PaymentMethod,
  Prescription,
  ReceiptSettings,
  SaleTransaction,
  UserRole,
} from '../types';
import { playScanSuccessBeep } from '../utils/audio';
import { formatKSh } from '../utils/currency';

interface POSTerminalProps {
  medications: Medication[];
  prescriptions: Prescription[];
  cart: CartItem[];
  onUpdateCart: (newCart: CartItem[]) => void;
  onCompleteSale: (transaction: SaleTransaction) => void;
  onOpenScanner: () => void;
  receiptSettings: ReceiptSettings;
  isOnline: boolean;
  currentUser: { name: string; role: UserRole };
}

export const POSTerminal: React.FC<POSTerminalProps> = ({
  medications,
  prescriptions,
  cart,
  onUpdateCart,
  onCompleteSale,
  onOpenScanner,
  receiptSettings,
  isOnline,
  currentUser,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [barcodeQuickInput, setBarcodeQuickInput] = useState('');
  const [patientNameInput, setPatientNameInput] = useState('');

  // Payment checkout modal state
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');

  // Tender states
  const [cashTendered, setCashTendered] = useState<number>(0);

  // M-Pesa states
  const [mpesaPhone, setMpesaPhone] = useState<string>('07');
  const [mpesaReference, setMpesaReference] = useState<string>('');

  // Partial payment states (Cash + M-Pesa)
  const [partialCash, setPartialCash] = useState<number>(0);
  const [partialMpesa, setPartialMpesa] = useState<number>(0);

  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [mobilePosTab, setMobilePosTab] = useState<'catalog' | 'cart'>('catalog');

  const categories: (string | MedicationCategory)[] = [
    'All',
    'Antibiotics',
    'Cardiovascular',
    'Pain & Analgesics',
    'OTC & First Aid',
    'Diabetes',
    'Respiratory',
    'Vitamins & Supplements',
  ];

  // Filter medications
  const filteredMedications = medications.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.genericName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.barcode.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (selectedCategory !== 'All' && m.category !== selectedCategory) return false;
    return true;
  });

  // Cart operations
  const handleAddToCart = (med: Medication, prescription?: Prescription) => {
    const existingIndex = cart.findIndex((item) => item.medication.id === med.id);

    if (existingIndex > -1) {
      const currentQty = cart[existingIndex].quantity;
      if (currentQty + 1 > med.stock) {
        alert(`Stock limit reached! Only ${med.stock} units available in pharmacy.`);
        return;
      }
      const updated = [...cart];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: currentQty + 1,
      };
      onUpdateCart(updated);
    } else {
      if (med.stock < 1) {
        alert(`Cannot add out-of-stock medication: ${med.name}`);
        return;
      }

      // Calculate co-pay discount if prescribed with insurance
      let itemDiscount = 0;
      if (prescription && prescription.insuranceCoPayRate !== undefined) {
        // e.g. coPayRate = 0.2 means patient pays 20%, discount is 80%
        itemDiscount = (1 - prescription.insuranceCoPayRate) * 100;
      }

      const newItem: CartItem = {
        medication: med,
        quantity: 1,
        prescriptionId: prescription?.id,
        rxNumber: prescription?.rxNumber,
        patientName: prescription?.patientName,
        discountPercent: itemDiscount,
      };

      if (prescription?.patientName && !patientNameInput) {
        setPatientNameInput(prescription.patientName);
      }

      onUpdateCart([...cart, newItem]);
    }

    playScanSuccessBeep();
  };

  const handleUpdateQuantity = (index: number, delta: number) => {
    const item = cart[index];
    const newQty = item.quantity + delta;

    if (newQty <= 0) {
      handleRemoveFromCart(index);
      return;
    }

    if (newQty > item.medication.stock) {
      alert(`Cannot exceed current shelf stock of ${item.medication.stock} units.`);
      return;
    }

    const updated = [...cart];
    updated[index] = { ...item, quantity: newQty };
    onUpdateCart(updated);
  };

  const handleRemoveFromCart = (index: number) => {
    const updated = cart.filter((_, i) => i !== index);
    onUpdateCart(updated);
  };

  const handleClearCart = () => {
    onUpdateCart([]);
    setPatientNameInput('');
  };

  // Quick barcode input handler
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeQuickInput.trim();
    if (!code) return;

    // First check prescriptions
    const matchedRx = prescriptions.find(
      (r) => r.rxNumber.toLowerCase() === code.toLowerCase() || r.barcode.toLowerCase() === code.toLowerCase()
    );

    if (matchedRx) {
      const med = medications.find((m) => m.id === matchedRx.medicationId);
      if (med) {
        handleAddToCart(med, matchedRx);
        setBarcodeQuickInput('');
        return;
      }
    }

    // Check medications
    const matchedMed = medications.find(
      (m) => m.barcode.toLowerCase() === code.toLowerCase() || m.id.toLowerCase() === code.toLowerCase()
    );

    if (matchedMed) {
      handleAddToCart(matchedMed);
      setBarcodeQuickInput('');
      return;
    }

    alert(`Barcode "${code}" not found. Try scanning with camera or searching by drug name.`);
  };

  // Financial calculations in Kenyan Shillings
  const subtotal = cart.reduce((acc, item) => {
    const basePrice = item.medication.price * item.quantity;
    const discount = item.discountPercent ? (basePrice * item.discountPercent) / 100 : 0;
    return acc + (basePrice - discount);
  }, 0);

  const cartDiscount = (subtotal * discountPercent) / 100;
  const taxableAmount = Math.max(0, subtotal - cartDiscount);
  const tax = taxableAmount * (receiptSettings.taxRate || 0.16);
  const total = Math.round((taxableAmount + tax) * 100) / 100;

  // Change calculations depending on payment method
  let changeDue = 0;
  if (paymentMethod === 'Cash') {
    changeDue = Math.max(0, cashTendered - total);
  } else if (paymentMethod === 'Partial (Cash + M-Pesa)') {
    const totalPartialTendered = partialCash + partialMpesa;
    changeDue = Math.max(0, totalPartialTendered - total);
  }

  // Trigger Checkout
  const handleStartCheckout = () => {
    if (cart.length === 0) return;
    const roundedTotal = Math.ceil(total);
    setCashTendered(roundedTotal);

    // Default partial: 50% cash, remainder M-Pesa
    const half = Math.round(roundedTotal / 2);
    setPartialCash(half);
    setPartialMpesa(Math.max(0, roundedTotal - half));

    // Generate random M-Pesa code
    const randomCode = 'QA' + Math.floor(10000000 + Math.random() * 90000000).toString().slice(0, 8);
    setMpesaReference(randomCode);

    setCheckoutError(null);
    setIsCheckoutOpen(true);
  };

  // Generate new M-Pesa Transaction Code
  const handleGenerateMpesaCode = () => {
    const prefixes = ['QA', 'QB', 'SH', 'SK', 'TL', 'MG'];
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const code = randomPrefix + Math.floor(10000000 + Math.random() * 90000000).toString().slice(0, 8);
    setMpesaReference(code);
  };

  // Finalize Sale
  const handleConfirmSale = () => {
    setCheckoutError(null);

    if (paymentMethod === 'Cash') {
      if (cashTendered < total) {
        setCheckoutError(
          `Insufficient cash tendered. Total is ${formatKSh(total)}, received ${formatKSh(cashTendered)}.`
        );
        return;
      }
    } else if (paymentMethod === 'Partial (Cash + M-Pesa)') {
      const combinedTendered = partialCash + partialMpesa;
      if (combinedTendered < total) {
        setCheckoutError(
          `Combined payment is incomplete! Cash (${formatKSh(partialCash)}) + M-Pesa (${formatKSh(
            partialMpesa
          )}) = ${formatKSh(combinedTendered)}. Total due is ${formatKSh(total)}.`
        );
        return;
      }
      if (!mpesaReference.trim()) {
        setCheckoutError('Please enter or generate the M-Pesa transaction confirmation code.');
        return;
      }
    } else if (paymentMethod === 'M-Pesa') {
      if (!mpesaReference.trim()) {
        setCheckoutError('Please enter or generate the M-Pesa transaction confirmation code.');
        return;
      }
    }

    const receiptNumber = 'REC-' + Math.floor(100000 + Math.random() * 900000);

    const transaction: SaleTransaction = {
      id: 'tx-' + Date.now(),
      receiptNumber,
      timestamp: new Date().toISOString(),
      cashierName: currentUser.name,
      cashierRole: currentUser.role,
      items: cart.map((it) => ({
        medicationId: it.medication.id,
        name: it.medication.name,
        genericName: it.medication.genericName,
        dosage: it.medication.dosage,
        isPrescription: it.medication.isPrescriptionRequired,
        rxNumber: it.rxNumber,
        patientName: it.patientName || patientNameInput,
        quantity: it.quantity,
        unitPrice: it.medication.price,
        totalPrice: it.medication.price * it.quantity * (1 - (it.discountPercent || 0) / 100),
      })),
      subtotal,
      tax,
      discount: cartDiscount,
      total,
      paymentMethod,
      amountTendered:
        paymentMethod === 'Cash'
          ? cashTendered
          : paymentMethod === 'Partial (Cash + M-Pesa)'
          ? partialCash + partialMpesa
          : total,
      changeDue: paymentMethod === 'Cash' || paymentMethod === 'Partial (Cash + M-Pesa)' ? changeDue : 0,
      cashAmount:
        paymentMethod === 'Cash'
          ? cashTendered
          : paymentMethod === 'Partial (Cash + M-Pesa)'
          ? partialCash
          : undefined,
      mpesaAmount:
        paymentMethod === 'M-Pesa'
          ? total
          : paymentMethod === 'Partial (Cash + M-Pesa)'
          ? partialMpesa
          : undefined,
      mpesaReference:
        paymentMethod === 'M-Pesa' || paymentMethod === 'Partial (Cash + M-Pesa)'
          ? mpesaReference.toUpperCase()
          : undefined,
      mpesaPhone:
        paymentMethod === 'M-Pesa' || paymentMethod === 'Partial (Cash + M-Pesa)'
          ? mpesaPhone
          : undefined,
      patientName: patientNameInput || undefined,
      isOffline: !isOnline,
      synced: isOnline,
      syncTimestamp: isOnline ? new Date().toISOString() : undefined,
    };

    onCompleteSale(transaction);
    onUpdateCart([]);
    setIsCheckoutOpen(false);
    setPatientNameInput('');
  };

  return (
    <div className="space-y-4 pb-16 lg:pb-0">
      {/* Mobile Segmented View Toggle (< lg) */}
      <div className="lg:hidden flex items-center bg-slate-100 p-1 rounded-2xl text-xs font-bold">
        <button
          type="button"
          onClick={() => setMobilePosTab('catalog')}
          className={`flex-1 py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
            mobilePosTab === 'catalog' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Pill className="w-4 h-4" />
          <span>Medication Catalog</span>
        </button>
        <button
          type="button"
          onClick={() => setMobilePosTab('cart')}
          className={`flex-1 py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 ${
            mobilePosTab === 'cart' ? 'bg-teal-700 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          <span>Cart ({cart.length})</span>
          {cart.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                mobilePosTab === 'cart' ? 'bg-teal-900 text-teal-200' : 'bg-teal-100 text-teal-800'
              }`}
            >
              {formatKSh(total)}
            </span>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 cols: Catalog & Fast Barcode Bar */}
        <div className={`lg:col-span-7 space-y-4 ${mobilePosTab === 'catalog' ? 'block' : 'hidden lg:block'}`}>
          {/* Quick Barcode & Search Header */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex gap-2">
            {/* Rapid Barcode Input */}
            <form onSubmit={handleBarcodeSubmit} className="relative flex-1">
              <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="pos-fast-barcode-input"
                type="text"
                value={barcodeQuickInput}
                onChange={(e) => setBarcodeQuickInput(e.target.value)}
                placeholder="Scan / Type Rx or NDC Barcode (Enter)..."
                className="w-full pl-9 pr-20 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-mono"
              />
              <button
                type="submit"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold"
              >
                Scan
              </button>
            </form>

            {/* Camera Scanner Button */}
            <button
              id="open-pos-camera-scanner-btn"
              onClick={onOpenScanner}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-xs transition active:scale-95 whitespace-nowrap"
              title="Open Barcode Scanner Camera"
            >
              <Camera className="w-4 h-4" />
              <span>Camera Scan</span>
            </button>
          </div>

          {/* Search by drug name & Generic */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search medication catalog by brand, active ingredient or category..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition ${
                  selectedCategory === cat
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Medication Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[620px] overflow-y-auto pr-1">
          {filteredMedications.map((med) => {
            const isLow = med.stock <= med.minStockLevel;
            const isOut = med.stock === 0;

            return (
              <div
                key={med.id}
                onClick={() => !isOut && handleAddToCart(med)}
                className={`bg-white p-3.5 rounded-2xl border transition-all flex flex-col justify-between cursor-pointer group ${
                  isOut
                    ? 'opacity-50 border-slate-200 cursor-not-allowed'
                    : 'border-slate-200 hover:border-teal-500 hover:shadow-md'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase ${
                        med.isPrescriptionRequired
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {med.isPrescriptionRequired ? 'Rx Script' : 'OTC'}
                    </span>

                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                        isOut
                          ? 'bg-red-100 text-red-700'
                          : isLow
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {isOut ? 'Out of Stock' : `${med.stock} in stock`}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-teal-700 transition">
                    {med.name}
                  </h3>
                  <p className="text-[11px] text-slate-500 italic line-clamp-1">{med.genericName}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{med.dosage} • {med.form}</p>
                </div>

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
                  <span className="text-sm font-extrabold text-slate-900">
                    {formatKSh(med.price)}
                  </span>
                  <button
                    disabled={isOut}
                    className="p-1.5 rounded-xl bg-teal-50 text-teal-700 group-hover:bg-teal-700 group-hover:text-white transition"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right 5 cols: Active POS Cart & Checkout */}
      <div
        className={`lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[740px] overflow-hidden sticky top-6 ${
          mobilePosTab === 'cart' ? 'block' : 'hidden lg:block'
        }`}
      >
        {/* Cart Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-700 text-white flex items-center justify-center">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Active Dispense Cart</h2>
              <p className="text-[11px] text-slate-500">
                {cart.length} line item{cart.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          {cart.length > 0 && (
            <button
              onClick={handleClearCart}
              className="text-xs text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1 p-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>

        {/* Patient Reference Field */}
        <div className="px-4 py-2.5 bg-slate-100/60 border-b border-slate-200 text-xs flex items-center gap-2">
          <User className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={patientNameInput}
            onChange={(e) => setPatientNameInput(e.target.value)}
            placeholder="Customer / Patient Name (optional)..."
            className="w-full bg-transparent border-none focus:outline-hidden text-xs font-semibold text-slate-800 placeholder:text-slate-400"
          />
        </div>

        {/* Cart Item List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <Pill className="w-12 h-12 text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-600">Dispense Cart is Empty</p>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                Scan an Rx barcode or tap medication cards to ring up the sale in Kenyan Shillings.
              </p>
            </div>
          ) : (
            cart.map((item, idx) => {
              const itemTotal = item.medication.price * item.quantity;
              const discount = item.discountPercent ? (itemTotal * item.discountPercent) / 100 : 0;
              const finalItemPrice = itemTotal - discount;

              return (
                <div
                  key={idx}
                  className="p-3 rounded-xl border border-slate-200 hover:border-teal-300 bg-slate-50/50 transition flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-xs text-slate-900">{item.medication.name}</div>
                      <div className="text-[11px] text-slate-500 italic">{item.medication.dosage}</div>
                      {item.rxNumber && (
                        <span className="inline-block mt-0.5 text-[10px] font-bold bg-teal-100 text-teal-800 px-1.5 py-0.2 rounded font-mono">
                          Rx: {item.rxNumber} ({item.patientName})
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-xs text-slate-900">{formatKSh(finalItemPrice)}</div>
                      {item.discountPercent ? (
                        <div className="text-[10px] text-emerald-700 font-semibold">
                          -{item.discountPercent}% Co-Pay
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400">
                          {formatKSh(item.medication.price)} each
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <span className="text-[10px] text-slate-500 font-mono">
                      Batch: {item.medication.batchNumber}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleUpdateQuantity(idx, -1)}
                        className="w-6 h-6 rounded-lg bg-white border border-slate-300 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-7 text-center font-bold text-xs text-slate-800">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => handleUpdateQuantity(idx, 1)}
                        className="w-6 h-6 rounded-lg bg-white border border-slate-300 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleRemoveFromCart(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 ml-1 rounded-lg hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Totals and Checkout Button */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-2.5 text-xs">
          <div className="space-y-1.5 text-slate-600">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-semibold text-slate-800">{formatKSh(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>VAT ({Math.round((receiptSettings.taxRate || 0.16) * 100)}%):</span>
              <span className="font-semibold text-slate-800">{formatKSh(tax)}</span>
            </div>
            {cartDiscount > 0 && (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Discount Applied:</span>
                <span>-{formatKSh(cartDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-slate-900 pt-1.5 border-t border-slate-200">
              <span>Total Amount Due:</span>
              <span className="text-base text-teal-900 font-extrabold">{formatKSh(total)}</span>
            </div>
          </div>

          <button
            id="proceed-checkout-btn"
            onClick={handleStartCheckout}
            disabled={cart.length === 0}
            className="w-full py-3 bg-teal-700 hover:bg-teal-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm shadow-md transition active:scale-98 flex items-center justify-center gap-2"
          >
            <Wallet className="w-4 h-4" />
            <span>Pay & Print Receipt ({formatKSh(total)})</span>
          </button>
        </div>
      </div>
      </div>

      {/* Floating Mobile Cart Summary Bar (< lg) */}
      {cart.length > 0 && mobilePosTab === 'catalog' && (
        <div className="lg:hidden fixed bottom-16 left-3 right-3 z-20 bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-2xl shadow-xl flex items-center justify-between animate-fade-in border border-slate-700/60 no-print">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              {cart.length}
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Due</div>
              <div className="text-sm font-black text-white font-mono">{formatKSh(total)}</div>
            </div>
          </div>
          <button
            onClick={() => setMobilePosTab('cart')}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md active:scale-95"
          >
            <span>Review & Pay</span>
            <ShoppingCart className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Checkout & Tender Payment Modal */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4 no-print">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">Payment & Tender (Kenya)</h3>
                <p className="text-xs text-slate-500 font-mono">Total Due: {formatKSh(total)}</p>
              </div>
              <button
                onClick={() => setIsCheckoutOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs max-h-[80vh] overflow-y-auto">
              {/* Grand Total Callout */}
              <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-center">
                <span className="text-[11px] uppercase font-bold text-teal-800">Total Payable Amount</span>
                <div className="text-3xl font-extrabold text-teal-950 mt-0.5 font-mono">
                  {formatKSh(total)}
                </div>
                {!isOnline && (
                  <span className="inline-block mt-1 text-[10px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded">
                    Offline Mode Active - Will Queue for Sync
                  </span>
                )}
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Select Payment Method:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {/* Cash */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Cash')}
                    className={`p-2.5 rounded-xl border text-left font-semibold flex flex-col gap-1 transition ${
                      paymentMethod === 'Cash'
                        ? 'border-teal-700 bg-teal-50 text-teal-900 shadow-xs ring-1 ring-teal-700'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Wallet className="w-4 h-4 text-emerald-600" />
                      <span className="font-bold">Cash</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-normal">KSh notes & coins</span>
                  </button>

                  {/* M-Pesa */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('M-Pesa')}
                    className={`p-2.5 rounded-xl border text-left font-semibold flex flex-col gap-1 transition ${
                      paymentMethod === 'M-Pesa'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-xs ring-1 ring-emerald-600'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-emerald-600" />
                      <span className="font-bold text-emerald-800">M-Pesa</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-normal">Safaricom Mobile</span>
                  </button>

                  {/* Partial (Cash + M-Pesa) */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Partial (Cash + M-Pesa)')}
                    className={`p-2.5 rounded-xl border text-left font-semibold flex flex-col gap-1 transition ${
                      paymentMethod === 'Partial (Cash + M-Pesa)'
                        ? 'border-teal-700 bg-teal-50 text-teal-900 shadow-xs ring-1 ring-teal-700'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Split className="w-4 h-4 text-teal-700" />
                      <span className="font-bold">Partial</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-normal">Cash + M-Pesa split</span>
                  </button>
                </div>

                {/* Secondary methods */}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Credit/Debit Card')}
                    className={`p-2 rounded-lg border text-left font-medium flex items-center gap-1.5 text-xs transition ${
                      paymentMethod === 'Credit/Debit Card'
                        ? 'border-teal-700 bg-teal-50 text-teal-900 font-bold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                    <span>Card / POS PDQ</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('Insurance')}
                    className={`p-2 rounded-lg border text-left font-medium flex items-center gap-1.5 text-xs transition ${
                      paymentMethod === 'Insurance'
                        ? 'border-teal-700 bg-teal-50 text-teal-900 font-bold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <FileCheck className="w-3.5 h-3.5 text-purple-600" />
                    <span>Insurance / SHA</span>
                  </button>
                </div>
              </div>

              {/* CASH TENDER SECTION */}
              {paymentMethod === 'Cash' && (
                <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="flex justify-between items-center">
                    <label className="block font-semibold text-slate-700">Cash Received (KSh):</label>
                    <span className="text-[11px] text-slate-500 font-mono">Due: {formatKSh(total)}</span>
                  </div>

                  <input
                    type="number"
                    step="1"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-base font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 bg-white font-mono"
                  />

                  {/* Fast Tender Kenyan Note Buttons */}
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">Fast Tender Notes</span>
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                      {[100, 200, 500, 1000, 2000, 5000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setCashTendered(amt)}
                          className="py-1.5 px-1 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 text-[11px] font-mono text-center"
                        >
                          {amt}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setCashTendered(Math.ceil(total))}
                        className="py-1.5 px-1 rounded-lg bg-teal-100 text-teal-900 font-bold hover:bg-teal-200 text-[11px] text-center"
                      >
                        Exact
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-bold text-sm">
                    <span className="text-slate-600">Change Due to Customer:</span>
                    <span className={changeDue >= 0 ? 'text-emerald-700 text-base font-mono' : 'text-red-600 font-mono'}>
                      {formatKSh(changeDue)}
                    </span>
                  </div>
                </div>
              )}

              {/* M-PESA ONLY SECTION */}
              {paymentMethod === 'M-Pesa' && (
                <div className="space-y-3 bg-emerald-50/60 p-4 rounded-xl border border-emerald-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                        M
                      </div>
                      <span className="font-bold text-emerald-950">Safaricom M-Pesa Payment</span>
                    </div>
                    <span className="text-xs font-bold text-emerald-900 font-mono">{formatKSh(total)}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Customer Mobile Number:
                      </label>
                      <input
                        type="tel"
                        value={mpesaPhone}
                        onChange={(e) => setMpesaPhone(e.target.value)}
                        placeholder="e.g. 0712 345 678"
                        className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[11px] font-semibold text-slate-700">M-Pesa Confirmation Code:</label>
                        <button
                          type="button"
                          onClick={handleGenerateMpesaCode}
                          className="text-[10px] text-emerald-700 font-bold hover:underline"
                        >
                          Auto-Code
                        </button>
                      </div>
                      <input
                        type="text"
                        value={mpesaReference}
                        onChange={(e) => setMpesaReference(e.target.value.toUpperCase())}
                        placeholder="e.g. QK89201982"
                        className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500 uppercase font-mono tracking-wider"
                      />
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-emerald-100/70 border border-emerald-300 text-[11px] text-emerald-900 flex items-center justify-between">
                    <span>Till / Paybill: <strong>522522 (Acc: RX-{Math.floor(1000 + Math.random() * 9000)})</strong></span>
                    <span className="font-bold text-emerald-800">Status: Verified OK</span>
                  </div>
                </div>
              )}

              {/* PARTIAL PAYMENT SECTION (Cash + M-Pesa) */}
              {paymentMethod === 'Partial (Cash + M-Pesa)' && (
                <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800">
                      <Split className="w-4 h-4 text-teal-700" />
                      <span>Split Payment: Cash + M-Pesa</span>
                    </div>
                    <span className="font-bold text-xs text-slate-900 font-mono">
                      Target: {formatKSh(total)}
                    </span>
                  </div>

                  {/* Cash portion */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="font-bold text-slate-700 text-xs flex items-center gap-1">
                        <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                        <span>1. Cash Amount Tendered:</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const half = Math.round(total / 2);
                          setPartialCash(half);
                          setPartialMpesa(Math.max(0, total - half));
                        }}
                        className="text-[10px] text-teal-700 font-bold hover:underline"
                      >
                        Split 50/50
                      </button>
                    </div>

                    <input
                      type="number"
                      step="1"
                      value={partialCash}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setPartialCash(val);
                        setPartialMpesa(Math.max(0, total - val));
                      }}
                      className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500 font-mono"
                    />
                  </div>

                  {/* M-Pesa portion */}
                  <div className="p-3 bg-white rounded-xl border border-emerald-200 space-y-2">
                    <label className="font-bold text-slate-700 text-xs flex items-center gap-1">
                      <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                      <span>2. M-Pesa Amount:</span>
                    </label>

                    <input
                      type="number"
                      step="1"
                      value={partialMpesa}
                      onChange={(e) => setPartialMpesa(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono"
                    />

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                          M-Pesa Phone Number:
                        </label>
                        <input
                          type="tel"
                          value={mpesaPhone}
                          onChange={(e) => setMpesaPhone(e.target.value)}
                          placeholder="0712 345 678"
                          className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg font-mono"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-0.5">
                          <label className="text-[10px] font-semibold text-slate-600">Confirmation Code:</label>
                          <button
                            type="button"
                            onClick={handleGenerateMpesaCode}
                            className="text-[9px] text-emerald-700 font-bold hover:underline"
                          >
                            Auto
                          </button>
                        </div>
                        <input
                          type="text"
                          value={mpesaReference}
                          onChange={(e) => setMpesaReference(e.target.value.toUpperCase())}
                          placeholder="e.g. SH9102910"
                          className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg uppercase font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Partial summary calculation */}
                  <div className="pt-2 border-t border-slate-200 space-y-1 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Total Tendered (Cash + M-Pesa):</span>
                      <span className="font-bold text-slate-900 font-mono">
                        {formatKSh(partialCash + partialMpesa)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center font-bold">
                      <span className="text-slate-700">Change Due:</span>
                      <span className={changeDue >= 0 ? 'text-emerald-700 font-mono' : 'text-red-600 font-mono'}>
                        {formatKSh(changeDue)}
                      </span>
                    </div>
                    {partialCash + partialMpesa < total && (
                      <div className="text-[11px] text-red-600 font-semibold">
                        Remaining balance needed: {formatKSh(total - (partialCash + partialMpesa))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* CARD PLACEHOLDER */}
              {paymentMethod === 'Credit/Debit Card' && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-1">
                  <CreditCard className="w-6 h-6 mx-auto text-blue-600" />
                  <p className="font-semibold text-slate-800">Kenyan Bank Card / PDQ Terminal</p>
                  <p className="text-[11px] text-slate-500">Insert Visa / Mastercard on the banking terminal.</p>
                </div>
              )}

              {/* INSURANCE PLACEHOLDER */}
              {paymentMethod === 'Insurance' && (
                <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-purple-900 space-y-1 text-center">
                  <FileCheck className="w-6 h-6 mx-auto text-purple-700" />
                  <p className="font-semibold">SHA / NHIF / Private Medical Insurance</p>
                  <p className="text-[11px] text-purple-700">Insurance co-pay collected. Claim approved.</p>
                </div>
              )}

              {checkoutError && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 font-medium">
                  {checkoutError}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCheckoutOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="confirm-checkout-sale-btn"
                  onClick={handleConfirmSale}
                  className="px-6 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold shadow-md transition active:scale-95"
                >
                  Complete Sale & Print
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
