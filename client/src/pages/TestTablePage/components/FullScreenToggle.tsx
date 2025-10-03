import React from 'react';
import { isMobileOrTablet } from './DeviceDetection';

interface FullScreenToggleProps {
  isVisible: boolean;
}

export const FullScreenToggle: React.FC<FullScreenToggleProps> = ({ isVisible }) => {
  if (!isVisible || !isMobileOrTablet()) return null;

  const handleToggleFullScreen = () => {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    }
  };

  return (
    <button
      onClick={handleToggleFullScreen}
      className="fixed top-4 right-4 z-50 bg-gray-800/90 text-white p-2 rounded-full hover:bg-gray-700 transition sm:hidden"
      title="Toggle Fullscreen"
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
      </svg>
    </button>
  );
};
