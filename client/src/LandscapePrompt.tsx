import React from 'react';
import { useWindowSize } from './hooks/useWindowSize';

const LandscapePrompt: React.FC = () => {
  const { width, height, isMobile } = useWindowSize();
  const isLandscape = width > height;

  if (!isMobile || !isLandscape) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-slate-900 z-50 flex items-center justify-center">
      <div className="text-center p-6">
        <div className="animate-spin mb-4">
          <svg
            className="w-12 h-12 text-indigo-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Please Rotate Your Device</h2>
        <p className="text-slate-300">
          This game is best played in portrait mode on mobile devices.
        </p>
      </div>
    </div>
  );
};

export default LandscapePrompt; 