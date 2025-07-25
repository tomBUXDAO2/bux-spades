import React, { useState, useEffect } from 'react';

const LandscapePrompt: React.FC = () => {
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      const isPortraitMode = window.innerHeight > window.innerWidth;
      setIsPortrait(isPortraitMode);
    };

    // Check on mount
    checkOrientation();

    // Listen for orientation changes
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  if (!isPortrait) {
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
          BUX Spades is designed for landscape mode. Please rotate your device to continue playing.
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