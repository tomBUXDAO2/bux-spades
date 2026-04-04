import React, { useState } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ isOpen, onClose }) => {
  const { handleInstall, deferredPrompt } = usePWAInstall();
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');

  // Detect platform
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
      // For iOS, we can't trigger the install automatically
      // Just close the modal and let them do it manually
      onClose();
    }
  };

  const getInstallInstructions = () => {
    switch (platform) {
      case 'ios':
        return {
          title: 'Install on iPhone/iPad',
          steps: [
            'Tap the share button 📤',
            'Tap "Add to Home Screen"',
            'Tap "Add" to install'
          ],
          icon: '📱'
        };
      case 'android':
        return {
          title: 'Install on Android',
          steps: [
            'Tap the menu button ⋮',
            'Tap "Add to Home screen"',
            'Tap "Add" to install'
          ],
          icon: '🤖'
        };
      default:
        return {
          title: 'Install App',
          steps: [
            'Look for the install button 📲',
            'Or use the browser menu to add to home screen'
          ],
          icon: '💻'
        };
    }
  };

  const instructions = getInstallInstructions();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="mx-2 max-h-[90vh] w-full max-w-sm animate-fade-in overflow-y-auto rounded-xl border border-white/10 bg-slate-950/95 p-4 shadow-lobby backdrop-blur-xl sm:p-6">
        <div className="text-center">
          <div className="text-4xl sm:text-6xl mb-3 sm:mb-4">{instructions.icon}</div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-200 mb-3 sm:mb-4">
            {instructions.title}
          </h2>
          
          <div className="space-y-3 sm:space-y-4 text-slate-300">
            <p className="text-base sm:text-lg">
              Get the best experience by installing BUX Spades as an app!
            </p>
            
            <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3 text-left backdrop-blur-sm sm:p-4">
              <h3 className="font-semibold text-slate-200 text-sm sm:text-base">How to install:</h3>
              <ol className="list-decimal list-inside space-y-1 text-xs sm:text-sm">
                {instructions.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </div>

            <div className="rounded-lg border border-cyan-500/25 bg-cyan-950/20 p-2 sm:p-3">
              <p className="text-xs text-cyan-200/90 sm:text-sm">
                💡 <strong>Tip:</strong> Once installed, the app will open in full-screen mode 
                and feel just like a native app!
              </p>
            </div>
          </div>

          <div className="mt-6 sm:mt-8 space-y-2 sm:space-y-3">
            {platform === 'android' && deferredPrompt && (
              <button
                onClick={handleInstallClick}
                className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 py-2 px-4 text-sm font-semibold text-white shadow-md shadow-cyan-950/25 transition hover:from-cyan-400 hover:to-teal-500 sm:py-3 sm:px-6 sm:text-base"
              >
                Install Now
              </button>
            )}
            
            <button
              onClick={onClose}
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/10 sm:py-3 sm:px-6 sm:text-base"
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