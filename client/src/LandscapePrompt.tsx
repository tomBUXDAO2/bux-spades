import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function isMobileOrTabletDevice() {
  if (typeof window === 'undefined') return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth <= 1024
  );
}

async function lockLandscape() {
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
    };
    if (orientation?.lock) {
      await orientation.lock('landscape');
    }
  } catch {
    // Browsers often require fullscreen / user gesture; LandscapePrompt UI covers the rest.
  }
}

function unlockOrientation() {
  try {
    screen.orientation?.unlock?.();
  } catch {
    // ignore
  }
}

/**
 * On game table routes (mobile): try to lock landscape; if still portrait, show rotate overlay.
 * Lobby / league stay free to rotate (app/PWA orientation is "any").
 */
const LandscapePrompt: React.FC = () => {
  const [isPortrait, setIsPortrait] = useState(false);
  const location = useLocation();
  const isGameTablePage = location.pathname.includes('/table/');

  useEffect(() => {
    if (!isGameTablePage || !isMobileOrTabletDevice()) {
      return;
    }

    lockLandscape();

    return () => {
      unlockOrientation();
    };
  }, [isGameTablePage]);

  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  if (!isGameTablePage || !isPortrait || !isMobileOrTabletDevice()) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 text-white">
      <div className="text-center p-8 max-w-md">
        <div className="mb-6">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-blue-500 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-4">Please Rotate Your Device</h2>
        <p className="text-lg mb-6">
          The game table is designed for landscape mode. Please rotate your device to continue playing.
        </p>
        <div className="text-sm text-gray-400">
          <p>• Turn your device sideways</p>
          <p>• Or use landscape orientation</p>
        </div>
      </div>
    </div>
  );
};

export default LandscapePrompt;
