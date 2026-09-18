import React, { useRef, useState } from 'react';
import {
  Check,
  Copy,
  FileText,
  Printer,
  QrCode,
  Share2,
  X,
} from 'lucide-react';
import { ReceiptSettings, SaleTransaction } from '../types';
import { formatKSh } from '../utils/currency';

interface ReceiptModalProps {
  isOpen?: boolean;
  onClose: () => void;
  transaction: SaleTransaction | null;
  settings: ReceiptSettings;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen = true,
  onClose,
  transaction,
  settings,
}) => {
  const [copied, setCopied] = useState(false);
  const [overrideWidth, setOverrideWidth] = useState<'80mm' | '58mm'>(settings.paperWidth);
  const receiptRef = useRef<HTMLDivElement | null>(null);

  if (!isOpen || !transaction) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleCopyText = () => {
    const isPartial = transaction.paymentMethod === 'Partial (Cash + M-Pesa)';
    const text = `
========================================
${settings.pharmacyName}
${settings.tagline}
${settings.addressLine1}
${settings.addressLine2}
Tel: ${settings.phone} | ${settings.licenseNumber}
${settings.taxId ? `${settings.taxId}\n` : ''}----------------------------------------
Receipt: ${transaction.receiptNumber}
Date: ${new Date(transaction.timestamp).toLocaleString()}
Cashier: ${transaction.cashierName}
Payment: ${transaction.paymentMethod}
${transaction.patientName ? `Patient: ${transaction.patientName}\n` : ''}${
  transaction.mpesaReference ? `M-Pesa Ref: ${transaction.mpesaReference}\n` : ''
}----------------------------------------
ITEMS:
${transaction.items
  .map(
    (it) =>
      `${it.quantity}x ${it.name} ${it.rxNumber ? `(Rx: ${it.rxNumber})` : ''} - ${formatKSh(it.totalPrice)}`
  )
  .join('\n')}
----------------------------------------
Subtotal: ${formatKSh(transaction.subtotal)}
${transaction.discount > 0 ? `Discount: -${formatKSh(transaction.discount)}\n` : ''}TOTAL: ${formatKSh(transaction.total)}
${
  isPartial
    ? `Cash Paid: ${formatKSh(transaction.cashAmount || 0)}\nM-Pesa Paid: ${formatKSh(
        transaction.mpesaAmount || 0
      )}\n`
    : ''
}${transaction.amountTendered ? `Tendered: ${formatKSh(transaction.amountTendered)}\n` : ''}${
      transaction.changeDue !== undefined ? `Change: ${formatKSh(transaction.changeDue)}\n` : ''
    }----------------------------------------
${settings.footerMessage}
${settings.emergencyPhone}
========================================
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const is58mm = overrideWidth === '58mm';
  const isPartial = transaction.paymentMethod === 'Partial (Cash + M-Pesa)';
  const isShowLogo = (settings.showLogo ?? true) && Boolean(settings.logoUrl);
  const logoHeight = settings.logoHeight || 48;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4">
      {/* Control Modal (Hidden during actual print) */}
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] no-print">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-700 text-white flex items-center justify-center">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Receipt Preview & Thermal Print</h2>
              <p className="text-[11px] text-slate-500 font-mono">#{transaction.receiptNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action toolbar */}
        <div className="px-5 py-2.5 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-semibold text-slate-500">Paper:</span>
            <button
              onClick={() => setOverrideWidth('80mm')}
              className={`px-2 py-1 rounded text-xs font-semibold ${
                !is58mm ? 'bg-white text-teal-900 shadow-xs border border-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              80mm Standard
            </button>
            <button
              onClick={() => setOverrideWidth('58mm')}
              className={`px-2 py-1 rounded text-xs font-semibold ${
                is58mm ? 'bg-white text-teal-900 shadow-xs border border-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              58mm Thermal
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopyText}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium transition"
              title="Copy receipt text to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              id="print-receipt-btn"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold shadow-xs transition active:scale-95"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Scrollable Receipt Body (Thermal Simulation) */}
        <div className="p-4 bg-slate-200/60 overflow-y-auto flex justify-center">
          <div
            ref={receiptRef}
            className={`bg-white text-black p-5 shadow-lg border border-slate-300 font-mono-receipt text-[11px] leading-snug transition-all ${
              is58mm ? 'w-[260px]' : 'w-[320px]'
            }`}
          >
            {/* Header / Brand */}
            <div className="text-center pb-3 border-b border-dashed border-slate-400 space-y-1">
              {isShowLogo && (
                <div className="flex justify-center mb-1.5">
                  <img
                    src={settings.logoUrl}
                    alt={settings.pharmacyName}
                    referrerPolicy="no-referrer"
                    style={{ maxHeight: `${logoHeight}px` }}
                    className="max-w-[140px] object-contain filter grayscale contrast-125"
                  />
                </div>
              )}
              <div className="flex justify-center mb-1">
                <span className="font-bold text-base tracking-wider uppercase">
                  {settings.pharmacyName}
                </span>
              </div>
              <p className="text-[10px] text-slate-600">{settings.tagline}</p>
              <p className="text-[10px] text-slate-600">{settings.addressLine1}</p>
              <p className="text-[10px] text-slate-600">{settings.addressLine2}</p>
              <p className="text-[10px] text-slate-600">Tel: {settings.phone}</p>
              <p className="text-[9px] text-slate-500">{settings.licenseNumber}</p>
              {settings.taxId && <p className="text-[9px] text-slate-500 font-bold">{settings.taxId}</p>}
            </div>

            {/* Transaction metadata */}
            <div className="py-2 border-b border-dashed border-slate-400 text-[10px] space-y-0.5">
              <div className="flex justify-between">
                <span>RECEIPT:</span>
                <span className="font-bold">{transaction.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>DATE:</span>
                <span>
                  {new Date(transaction.timestamp).toLocaleDateString()} {new Date(transaction.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {settings.showPharmacistName && (
                <div className="flex justify-between">
                  <span>DISPENSER:</span>
                  <span>{transaction.cashierName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>PAYMENT:</span>
                <span className="font-bold">{transaction.paymentMethod}</span>
              </div>
              {transaction.mpesaReference && (
                <div className="flex justify-between text-emerald-800 font-bold">
                  <span>M-PESA REF:</span>
                  <span>{transaction.mpesaReference}</span>
                </div>
              )}
              {transaction.mpesaPhone && (
                <div className="flex justify-between text-slate-600">
                  <span>M-PESA TEL:</span>
                  <span>{transaction.mpesaPhone}</span>
                </div>
              )}
              {transaction.patientName && (
                <div className="flex justify-between">
                  <span>PATIENT:</span>
                  <span className="font-semibold">{transaction.patientName}</span>
                </div>
              )}
              {transaction.isOffline && (
                <div className="text-center bg-amber-50 text-amber-900 py-0.5 px-1 rounded text-[9px] font-bold">
                  [OFFLINE RECORD - SYNC QUEUED]
                </div>
              )}
            </div>

            {/* Itemized list */}
            <div className="py-2.5 border-b border-dashed border-slate-400 space-y-2">
              <div className="flex justify-between font-bold text-[10px] pb-1 border-b border-slate-200">
                <span>ITEM / DOSAGE</span>
                <span>TOTAL</span>
              </div>

              {transaction.items.map((item, idx) => (
                <div key={idx} className="space-y-0.5">
                  <div className="flex justify-between font-semibold">
                    <span className="truncate pr-2">
                      {item.name}
                    </span>
                    <span className="shrink-0 font-bold">{formatKSh(item.totalPrice)}</span>
                  </div>

                  {settings.showGenericName && item.genericName && (
                    <div className="text-[9px] text-slate-500 italic">
                      Gen: {item.genericName}
                    </div>
                  )}

                  <div className="flex justify-between text-[10px] text-slate-600">
                    <span>
                      {item.quantity} x {formatKSh(item.unitPrice)}
                    </span>
                    {item.isPrescription && settings.showPrescriptionDetails && item.rxNumber && (
                      <span className="font-bold text-slate-800 bg-slate-100 px-1 rounded text-[9px]">
                        Rx: {item.rxNumber}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Calculations */}
            <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>SUBTOTAL:</span>
                <span>{formatKSh(transaction.subtotal)}</span>
              </div>
              {settings.showTaxBreakdown && (
                <div className="flex justify-between text-slate-600">
                </div>
              )}
              {transaction.discount > 0 && (
                <div className="flex justify-between text-slate-700">
                  <span>DISCOUNT / COPAY:</span>
                  <span>-{formatKSh(transaction.discount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm pt-1 border-t border-slate-300">
                <span>TOTAL PAID:</span>
                <span>{formatKSh(transaction.total)}</span>
              </div>

              {/* Partial breakdown */}
              {isPartial && (
                <div className="pt-1 border-t border-slate-200 space-y-0.5 text-[10px]">
                  <div className="flex justify-between text-slate-700">
                    <span>* CASH PORTION:</span>
                    <span className="font-bold">{formatKSh(transaction.cashAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-800">
                    <span>* M-PESA PORTION:</span>
                    <span className="font-bold">{formatKSh(transaction.mpesaAmount || 0)}</span>
                  </div>
                </div>
              )}

              {transaction.amountTendered !== undefined && transaction.amountTendered > 0 && (
                <div className="flex justify-between text-[10px] text-slate-600 pt-0.5">
                  <span>TENDERED:</span>
                  <span>{formatKSh(transaction.amountTendered)}</span>
                </div>
              )}
              {transaction.changeDue !== undefined && transaction.changeDue >= 0 && (
                <div className="flex justify-between text-[10px] font-bold text-slate-700">
                  <span>CHANGE DUE:</span>
                  <span>{formatKSh(transaction.changeDue)}</span>
                </div>
              )}
            </div>

            {/* Footer and Disclaimers */}
            <div className="pt-3 text-center space-y-1.5 text-[9px] text-slate-600">
              <p className="font-medium">{settings.footerMessage}</p>
              {settings.returnPolicy && <p className="text-[8px] text-slate-500 leading-tight">{settings.returnPolicy}</p>}
              <p className="font-semibold text-slate-800">{settings.emergencyPhone}</p>

              {settings.showBarcode && (
                <div className="pt-2 flex flex-col items-center justify-center">
                  <div className="h-9 w-40 flex items-center justify-center bg-slate-100 border border-slate-300 font-mono tracking-widest text-[9px] font-bold">
                    |||||||||||||||||||||||||||
                  </div>
                  <span className="text-[8px] font-mono text-slate-500 mt-0.5">
                    *{transaction.receiptNumber}*
                  </span>
                </div>
              )}

              <p className="text-[8px] text-slate-400 pt-1">*** END OF OFFICIAL RECEIPT ***</p>
            </div>
          </div>
        </div>

        {/* Dialog footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">Ready for thermal printing</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold transition"
          >
            Done
          </button>
        </div>
      </div>

      {/* Hidden container that expands and formats ONLY during window.print() */}
      <div className="print-only-container hidden">
        <div
          className={`mx-auto p-4 font-mono-receipt text-[12px] leading-tight text-black ${
            is58mm ? 'max-w-[58mm]' : 'max-w-[80mm]'
          }`}
        >
          {/* Print Header */}
          <div className="text-center pb-2 border-b border-dashed border-black">
            {isShowLogo && (
              <div className="mb-1.5 flex justify-center text-center">
                <img
                  src={settings.logoUrl}
                  alt={settings.pharmacyName}
                  referrerPolicy="no-referrer"
                  style={{ maxHeight: `${logoHeight}px` }}
                  className="max-w-[140px] mx-auto object-contain filter grayscale contrast-125 block"
                />
              </div>
            )}
            <h1 className="font-bold text-sm tracking-wider uppercase m-0">{settings.pharmacyName}</h1>
            <p className="text-[10px] m-0">{settings.tagline}</p>
            <p className="text-[10px] m-0">{settings.addressLine1}</p>
            <p className="text-[10px] m-0">{settings.addressLine2}</p>
            <p className="text-[10px] m-0">Tel: {settings.phone}</p>
            <p className="text-[9px] m-0">{settings.licenseNumber}</p>
            {settings.taxId && <p className="text-[9px] m-0 font-bold">{settings.taxId}</p>}
          </div>

          <div className="py-2 border-b border-dashed border-black text-[10px]">
            <div className="flex justify-between">
              <span>RECEIPT:</span>
              <span className="font-bold">{transaction.receiptNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>DATE:</span>
              <span>{new Date(transaction.timestamp).toLocaleString()}</span>
            </div>
            {settings.showPharmacistName && (
              <div className="flex justify-between">
                <span>DISPENSER:</span>
                <span>{transaction.cashierName}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>PAYMENT:</span>
              <span>{transaction.paymentMethod}</span>
            </div>
            {transaction.mpesaReference && (
              <div className="flex justify-between font-bold">
                <span>M-PESA REF:</span>
                <span>{transaction.mpesaReference}</span>
              </div>
            )}
            {transaction.patientName && (
              <div className="flex justify-between">
                <span>PATIENT:</span>
                <span>{transaction.patientName}</span>
              </div>
            )}
          </div>

          {/* Items */}
          <div className="py-2 border-b border-dashed border-black">
            {transaction.items.map((it, i) => (
              <div key={i} className="mb-1 text-[11px]">
                <div className="flex justify-between font-bold">
                  <span>{it.name}</span>
                  <span>{formatKSh(it.totalPrice)}</span>
                </div>
                {settings.showGenericName && it.genericName && (
                  <div className="text-[9px]">Gen: {it.genericName}</div>
                )}
                <div className="flex justify-between text-[10px]">
                  <span>{it.quantity} @ {formatKSh(it.unitPrice)}</span>
                  {it.rxNumber && <span>Rx: {it.rxNumber}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="py-2 border-b border-dashed border-black text-[11px]">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatKSh(transaction.subtotal)}</span>
            </div>
            <div className="flex justify-between">
            </div>
            {transaction.discount > 0 && (
              <div className="flex justify-between">
                <span>Discount:</span>
                <span>-{formatKSh(transaction.discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm pt-1 border-t border-black">
              <span>TOTAL:</span>
              <span>{formatKSh(transaction.total)}</span>
            </div>
            {isPartial && (
              <div className="pt-1 border-t border-dashed border-black text-[10px]">
                <div className="flex justify-between">
                  <span>Cash:</span>
                  <span>{formatKSh(transaction.cashAmount || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>M-Pesa:</span>
                  <span>{formatKSh(transaction.mpesaAmount || 0)}</span>
                </div>
              </div>
            )}
            {transaction.amountTendered !== undefined && (
              <div className="flex justify-between text-[10px]">
                <span>Tendered:</span>
                <span>{formatKSh(transaction.amountTendered)}</span>
              </div>
            )}
            {transaction.changeDue !== undefined && (
              <div className="flex justify-between text-[10px] font-bold">
                <span>Change:</span>
                <span>{formatKSh(transaction.changeDue)}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="pt-2 text-center text-[9px]">
            <p className="m-0 font-bold">{settings.footerMessage}</p>
            <p className="m-0">{settings.returnPolicy}</p>
            <p className="m-0 font-bold">{settings.emergencyPhone}</p>
            <p className="mt-2 tracking-widest">||||||||||||||||||||||||||</p>
            <p className="m-0">*{transaction.receiptNumber}*</p>
            <p className="mt-1">*** ASANTE SANA - THANK YOU ***</p>
          </div>
        </div>
      </div>
    </div>
  );
};
