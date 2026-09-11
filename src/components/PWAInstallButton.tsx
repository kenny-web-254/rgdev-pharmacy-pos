import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA in standalone mode, hide
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        id="pwa-install-btn"
        onClick={install}
        className="flex items-center gap-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white px-3 py-1.5 text-xs font-semibold shadow-sm transition-all active:scale-95"
        title="Install RG Pharma-POS app on your device"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install PWA</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          id="pwa-ios-install-btn"
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-lg border border-teal-600/30 bg-teal-50 text-teal-800 hover:bg-teal-100 px-2.5 py-1 text-xs font-medium transition"
        >
          <Smartphone className="w-3.5 h-3.5 text-teal-700" />
          <span>Install App</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs no-print">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-teal-600" />
                  Install on iPhone / iPad
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="text-sm text-slate-600 space-y-2.5 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="flex items-start gap-2">
                  <span className="font-bold text-teal-700">1.</span>
                  <span>Tap the <strong>Share</strong> button at the bottom of Safari.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-teal-700">2.</span>
                  <span>Scroll down and select <strong>Add to Home Screen</strong>.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-teal-700">3.</span>
                  <span>Launch PharmaPOS from your home screen for full offline usage.</span>
                </div>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-xl bg-teal-700 py-2 text-sm font-semibold text-white hover:bg-teal-800 transition"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Standard fallback button if browser hasn't fired beforeinstallprompt yet
  return null;
};
