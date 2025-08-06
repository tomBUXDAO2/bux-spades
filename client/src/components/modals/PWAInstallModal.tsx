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
            'Tap the Share button (square with arrow)',
            'Scroll down and tap "Add to Home Screen"',
            'Tap "Add" to install'
          ],
          icon: '📱'
        };
      case 'android':
        return {
          title: 'Install on Android',
          steps: [
            'Tap the menu (three dots)',
            'Tap "Add to Home screen"',
            'Tap "Add" to install'
          ],
          icon: '🤖'
        };
      default:
        return {
          title: 'Install App',
          steps: [
            'Look for the install button in your browser',
            'Or use the browser menu to add to home screen'
          ],
          icon: '💻'
        };
    }
  };

  const instructions = getInstallInstructions();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-8 max-w-md w-full mx-4 animate-fade-in border border-white/20">
        <div className="text-center">
          <div className="text-6xl mb-4">{instructions.icon}</div>
          <h2 className="text-2xl font-bold text-slate-200 mb-4">
            {instructions.title}
          </h2>
          
          <div className="space-y-4 text-slate-300">
            <p className="text-lg">
              Get the best experience by installing BUX Spades as an app!
            </p>
            
            <div className="bg-slate-700 p-4 rounded-lg text-left space-y-2">
              <h3 className="font-semibold text-slate-200">How to install:</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                {instructions.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </div>

            <div className="bg-blue-900/20 border border-blue-500/30 p-3 rounded-lg">
              <p className="text-sm text-blue-300">
                💡 <strong>Tip:</strong> Once installed, the app will open in full-screen mode 
                and feel just like a native app!
              </p>
            </div>
          </div>

          <div className="mt-8 space-y-3">
            {platform === 'android' && deferredPrompt && (
              <button
                onClick={handleInstallClick}
                className="w-full bg-green-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-green-700 transition"
              >
                Install Now
              </button>
            )}
            
            <button
              onClick={onClose}
              className="w-full bg-slate-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-slate-700 transition"
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