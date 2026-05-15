"use client";

import { useEffect, useState } from 'react';
import { X, Download, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Already running as installed PWA — never show
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    ) {
      setIsInstalled(true);
      return;
    }

    // iOS Safari detection
    const ios =
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !(window as any).MSStream &&
      !(window.matchMedia('(display-mode: standalone)').matches);
    setIsIOS(ios);

    if (ios) {
      // Show iOS install instructions after 1.5s
      const t = setTimeout(() => setShow(true), 1500);
      return () => clearTimeout(t);
    }

    // Chrome / Android — capture beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Listen for successful install — hide prompt
    const installed = () => {
      setIsInstalled(true);
      setShow(false);
    };
    window.addEventListener('appinstalled', installed);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setShow(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => setShow(false);

  if (!show || isInstalled) return null;

  return (
    <div className="fixed bottom-20 xl:bottom-6 left-4 right-4 z-[60] max-w-sm mx-auto animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-[#0d1526] border border-white/10 rounded-2xl p-5 shadow-2xl shadow-black/60">
        <div className="flex items-start gap-4">
          {/* App icon */}
          <div className="flex-shrink-0 h-12 w-12 rounded-2xl overflow-hidden shadow-lg shadow-red-900/40 border border-white/10">
            <img src="/icons/logo.png" alt="Emergency Hotline" className="w-full h-full object-cover" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-white leading-tight">Install Emergency Hotline</p>
            {isIOS ? (
              <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                Tap <span className="text-white font-semibold">Share ↑</span> then{' '}
                <span className="text-white font-semibold">"Add to Home Screen"</span>.
              </p>
            ) : (
              <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                Add to your home screen for faster emergency reporting.
              </p>
            )}

            {!isIOS && deferredPrompt && (
              <button
                onClick={handleInstall}
                className="mt-4 flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white text-sm font-bold transition-all shadow-lg shadow-red-900/40"
              >
                <Download className="h-4 w-4" />
                Install App
              </button>
            )}

            {isIOS && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                <Smartphone className="h-3.5 w-3.5" />
                <span>Use Safari to install</span>
              </div>
            )}
          </div>

          {/* Dismiss */}
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
