import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  FileText,
  Pill,
  Search,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import { Medication, Prescription } from '../types';
import { playErrorBeep, playScanSuccessBeep } from '../utils/audio';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanMatch: (result: {
    type: 'prescription' | 'medication';
    item: Prescription | Medication;
    rawCode: string;
  }) => void;
  medications: Medication[];
  prescriptions: Prescription[];
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanMatch,
  medications,
  prescriptions,
}) => {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [lastScannedResult, setLastScannedResult] = useState<string | null>(null);
  const [scanStatusMessage, setScanStatusMessage] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Initialize camera when opened
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setManualCode('');
      setScanStatusMessage(null);
      setLastScannedResult(null);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access API is not available on this device/browser');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);

      // Check for native BarcodeDetector
      initBarcodeDetector(stream);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Camera could not be accessed';
      console.warn('Camera access unavailable:', msg);
      setCameraError('Camera preview is unavailable (permissions or no device found). You can still scan using manual input, hardware barcode scanners, or sample buttons below.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setCameraActive(false);
  };

  // BarcodeDetector API for browsers that support it
  const initBarcodeDetector = async (_stream: MediaStream) => {
    if ('BarcodeDetector' in window) {
      try {
        const BarcodeDetectorClass = (window as unknown as {
          BarcodeDetector: new (opts?: { formats: string[] }) => {
            detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
          };
        }).BarcodeDetector;

        const detector = new BarcodeDetectorClass({
          formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code', 'upc_a'],
        });

        const scanLoop = async () => {
          if (videoRef.current && videoRef.current.readyState >= 2) {
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes && barcodes.length > 0) {
                const code = barcodes[0].rawValue;
                handleCodeScanned(code);
                return; // pause detection briefly after match
              }
            } catch (e) {
              // frame detection pass-through
            }
          }
          animationFrameRef.current = requestAnimationFrame(scanLoop);
        };

        animationFrameRef.current = requestAnimationFrame(scanLoop);
      } catch (e) {
        console.warn('BarcodeDetector initialization error:', e);
      }
    }
  };

  const handleCodeScanned = (code: string) => {
    const cleanCode = code.trim();
    if (!cleanCode) return;

    // Check if prescription match (matches rxNumber or barcode)
    const matchedRx = prescriptions.find(
      (rx) =>
        rx.rxNumber.toLowerCase() === cleanCode.toLowerCase() ||
        rx.barcode.toLowerCase() === cleanCode.toLowerCase()
    );

    if (matchedRx) {
      playScanSuccessBeep();
      setLastScannedResult(`Prescription found: ${matchedRx.rxNumber} (${matchedRx.patientName})`);
      setScanStatusMessage({
        text: `Verified Rx ${matchedRx.rxNumber} for ${matchedRx.patientName} - ${matchedRx.medicationName}`,
        type: 'success',
      });
      setTimeout(() => {
        onScanMatch({
          type: 'prescription',
          item: matchedRx,
          rawCode: cleanCode,
        });
        onClose();
      }, 500);
      return;
    }

    // Check if medication match (matches NDC, barcode, or ID)
    const matchedMed = medications.find(
      (m) =>
        m.barcode.toLowerCase() === cleanCode.toLowerCase() ||
        m.id.toLowerCase() === cleanCode.toLowerCase() ||
        m.name.toLowerCase().includes(cleanCode.toLowerCase())
    );

    if (matchedMed) {
      playScanSuccessBeep();
      setLastScannedResult(`Medication found: ${matchedMed.name} ($${matchedMed.price.toFixed(2)})`);
      setScanStatusMessage({
        text: `Medication verified: ${matchedMed.name} (${matchedMed.stock} in stock)`,
        type: 'success',
      });
      setTimeout(() => {
        onScanMatch({
          type: 'medication',
          item: matchedMed,
          rawCode: cleanCode,
        });
        onClose();
      }, 500);
      return;
    }

    // No match found
    playErrorBeep();
    setScanStatusMessage({
      text: `Unrecognized barcode "${cleanCode}". No prescription or medication found with this code.`,
      type: 'error',
    });
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      handleCodeScanned(manualCode);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 no-print">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-sm">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Pharmacy Barcode Scanner</h2>
              <p className="text-xs text-slate-500">Scan prescription bottles, Rx slips, or medication NDC barcodes</p>
            </div>
          </div>
          <button
            id="close-scanner-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {/* Camera Viewport */}
          <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-video flex items-center justify-center border-2 border-slate-800 shadow-inner">
            {cameraActive ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Laser Scanning Reticle */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8">
                  <div className="w-64 h-40 border-2 border-dashed border-teal-400/80 rounded-lg relative overflow-hidden flex items-center justify-center bg-teal-500/5">
                    {/* Animated Scanning Line */}
                    <div className="absolute inset-x-0 h-0.5 bg-red-500 shadow-[0_0_8px_#ef4444] animate-pulse top-1/2 -translate-y-1/2" />
                    <span className="text-[11px] font-mono font-medium text-teal-300 bg-slate-950/70 px-2 py-0.5 rounded">
                      Align Rx / NDC Barcode
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-6 text-center text-slate-400 flex flex-col items-center max-w-sm">
                <CameraOff className="w-10 h-10 text-slate-500 mb-2" />
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  {cameraError || 'Camera preview inactive. You can use manual entry, hardware barcode gun, or quick-test samples below.'}
                </p>
                <button
                  onClick={startCamera}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-400 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Retry Camera Access
                </button>
              </div>
            )}
          </div>

          {/* Feedback message */}
          {scanStatusMessage && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 border font-medium ${
                scanStatusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : scanStatusMessage.type === 'error'
                  ? 'bg-red-50 text-red-800 border-red-200'
                  : 'bg-teal-50 text-teal-800 border-teal-200'
              }`}
            >
              {scanStatusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <Volume2 className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{scanStatusMessage.text}</span>
            </div>
          )}

          {/* Manual Input / Hardware Scanner Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Manual Barcode / Hardware Scanner Wedge:
            </label>
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="barcode-manual-input"
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Enter or scan Rx barcode (e.g. RX-80219 or 00093-2264-01)"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-mono"
                  autoFocus
                />
              </div>
              <button
                id="submit-manual-barcode-btn"
                type="submit"
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold transition active:scale-95 flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" />
                Lookup
              </button>
            </form>
          </div>

          {/* Quick Test Barcodes for instant testing */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-600">Quick-Scan Prescriptions & Drugs (Click to Test):</span>
              <span className="text-[11px] text-teal-600 font-medium">Demo Simulator</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {prescriptions.slice(0, 3).map((rx) => (
                <button
                  key={rx.id}
                  onClick={() => handleCodeScanned(rx.rxNumber)}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 hover:border-teal-400 hover:bg-teal-50/50 text-left transition group"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-teal-600 group-hover:scale-110 transition" />
                    <div>
                      <div className="text-xs font-bold text-slate-800 font-mono">{rx.rxNumber}</div>
                      <div className="text-[11px] text-slate-500">{rx.patientName} • {rx.medicationName}</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded">
                    Rx
                  </span>
                </button>
              ))}

              {medications.slice(0, 2).map((med) => (
                <button
                  key={med.id}
                  onClick={() => handleCodeScanned(med.barcode)}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 text-left transition group"
                >
                  <div className="flex items-center gap-2">
                    <Pill className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition" />
                    <div>
                      <div className="text-xs font-bold text-slate-800 font-mono">{med.barcode}</div>
                      <div className="text-[11px] text-slate-500">{med.name} (${med.price.toFixed(2)})</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                    {med.isPrescriptionRequired ? 'Rx Item' : 'OTC'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Supported: UPC, EAN-13, Code 128, QR, USB Barcode Guns</span>
          <button
            onClick={onClose}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
