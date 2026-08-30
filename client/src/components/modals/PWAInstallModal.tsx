import React, { useState } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AppleLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
  </svg>
);

/** iOS Safari share / export icon */
const IosShareIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M9 6L12 3M12 3L15 6M12 3V13M7.00023 10C6.06835 10 5.60241 10 5.23486 10.1522C4.74481 10.3552 4.35523 10.7448 4.15224 11.2349C4 11.6024 4 12.0681 4 13V17.8C4 18.9201 4 19.4798 4.21799 19.9076C4.40973 20.2839 4.71547 20.5905 5.0918 20.7822C5.5192 21 6.07899 21 7.19691 21H16.8036C17.9215 21 18.4805 21 18.9079 20.7822C19.2842 20.5905 19.5905 20.2839 19.7822 19.9076C20 19.4802 20 18.921 20 17.8031V13C20 12.0681 19.9999 11.6024 19.8477 11.2349C19.6447 10.7448 19.2554 10.3552 18.7654 10.1522C18.3978 10 17.9319 10 17 10"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ isOpen, onClose }) => {
  const { handleInstall, deferredPrompt } = usePWAInstall();
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');

  React.useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      setPlatform('ios');
    } else if (/android/.test(userAgent)) {
      setPlatform('android');
    } else {
      setPlatform('other');
    }
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await handleInstall();
    } else if (platform === 'ios') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="mx-2 max-h-[90vh] w-full max-w-sm animate-fade-in overflow-y-auto rounded-xl border border-white/10 bg-slate-950/95 p-4 shadow-lobby backdrop-blur-xl sm:p-6">
        <div className="text-center">
          {platform === 'ios' ? (
            <div className="mb-3 flex justify-center sm:mb-4">
              <AppleLogo className="h-12 w-12 text-slate-100 sm:h-14 sm:w-14" />
            </div>
          ) : (
            <div className="mb-3 text-4xl sm:mb-4 sm:text-6xl">
              {platform === 'android' ? '🤖' : '💻'}
            </div>
          )}

          <h2 className="mb-3 text-xl font-bold text-slate-200 sm:mb-4 sm:text-2xl">
            {platform === 'ios'
              ? 'Add to Home Screen'
              : platform === 'android'
                ? 'Install on Android'
                : 'Install App'}
          </h2>

          <div className="space-y-3 text-slate-300 sm:space-y-4">
            <p className="text-base sm:text-lg">
              Get the best experience by installing BUX Spades as an app!
            </p>

            {platform === 'ios' ? (
              <div className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-3 text-left backdrop-blur-sm sm:p-4">
                <h3 className="text-sm font-semibold text-slate-200 sm:text-base">How to install:</h3>
                <ol className="list-decimal space-y-3 pl-5 text-xs sm:text-sm">
                  <li>
                    <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
                      In Safari’s browser bar (bottom of the screen —{' '}
                      <span className="font-semibold text-slate-100">not</span> on this website), tap
                      Share
                      <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 text-slate-100">
                        <IosShareIcon className="h-4 w-4 shrink-0" />
                        <span className="sr-only">Share</span>
                      </span>
                    </span>
                  </li>
                  <li>
                    Scroll and tap <span className="font-semibold text-slate-100">Add to Home Screen</span>
                  </li>
                  <li>
                    Tap <span className="font-semibold text-slate-100">Add</span>
                  </li>
                </ol>
                <p className="rounded-md border border-amber-500/20 bg-amber-950/30 px-2.5 py-2 text-[11px] leading-snug text-amber-100/90 sm:text-xs">
                  The Share button lives in Safari’s own menu bar — not inside BUX Spades.
                </p>
              </div>
            ) : (
              <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3 text-left backdrop-blur-sm sm:p-4">
                <h3 className="text-sm font-semibold text-slate-200 sm:text-base">How to install:</h3>
                <ol className="list-inside list-decimal space-y-1 text-xs sm:text-sm">
                  {platform === 'android' ? (
                    <>
                      <li>Tap the menu button ⋮</li>
                      <li>Tap &quot;Add to Home screen&quot;</li>
                      <li>Tap &quot;Add&quot; to install</li>
                    </>
                  ) : (
                    <>
                      <li>Look for the install button in your browser</li>
                      <li>Or use the browser menu to add to home screen</li>
                    </>
                  )}
                </ol>
              </div>
            )}

            <div className="rounded-lg border border-cyan-500/25 bg-cyan-950/20 p-2 sm:p-3">
              <p className="text-xs text-cyan-200/90 sm:text-sm">
                Once installed, the app opens full-screen and feels like a native app.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-2 sm:mt-8 sm:space-y-3">
            {platform === 'android' && deferredPrompt && (
              <button
                onClick={handleInstallClick}
                className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-cyan-950/25 transition hover:from-cyan-400 hover:to-teal-500 sm:px-6 sm:py-3 sm:text-base"
              >
                Install Now
              </button>
            )}

            <button
              onClick={onClose}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 sm:px-6 sm:py-3 sm:text-base"
            >
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallModal;
