import React, { useState } from 'react';
import { IoExitOutline, IoInformationCircleOutline, IoVolumeHigh } from "react-icons/io5";

interface GameTableHeaderProps {
  scaleFactor: number;
  infoRef: React.RefObject<HTMLDivElement>;
  onLeaveTable: () => void;
  onToggleGameInfo: () => void;
  onShowTrickHistory: () => void;
}

const GameTableHeader: React.FC<GameTableHeaderProps> = ({
  scaleFactor,
  infoRef,
  onLeaveTable,
  onToggleGameInfo,
  onShowTrickHistory
}) => {
  // Get initial sound state from localStorage
  const [isSoundEnabled, setIsSoundEnabled] = useState(() => {
    const userData = localStorage.getItem('userData');
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        return parsed.soundEnabled !== false; // Default to true
      } catch (error) {
        return true; // Default to true if parsing fails
      }
    }
    return true; // Default to true if no userData
  });

  const handleSoundToggle = () => {
    const newSoundState = !isSoundEnabled;
    setIsSoundEnabled(newSoundState);
    
    // Update localStorage
    const userData = localStorage.getItem('userData');
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        const updatedUserData = { ...parsed, soundEnabled: newSoundState };
        localStorage.setItem('userData', JSON.stringify(updatedUserData));
        console.log(`[SOUND TOGGLE] User ${parsed.username} sound ${newSoundState ? 'enabled' : 'muted'}`);
      } catch (error) {
        console.error('Failed to update sound preference in localStorage:', error);
      }
    }
  };
  return (
    <div className="absolute top-4 left-4 z-[100001] flex items-center gap-2">
      <button
        onClick={onLeaveTable}
        className="p-2 bg-gray-800/90 text-white rounded-full hover:bg-gray-700 transition shadow-lg"
        style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}
      >
        <IoExitOutline className="h-5 w-5" />
      </button>
      <div className="relative" ref={infoRef}>
        <button
          onClick={onToggleGameInfo}
          className="p-2 bg-gray-800/90 text-white rounded-full hover:bg-gray-700 transition shadow-lg"
          style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}
        >
          <IoInformationCircleOutline className="h-5 w-5" />
        </button>
      </div>
      <button
        onClick={onShowTrickHistory}
        className="p-2 bg-gray-800/90 text-white rounded-full hover:bg-gray-700 transition shadow-lg"
        style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}
        title="View Trick History"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </button>
      <button
        onClick={handleSoundToggle}
        className="relative p-2 bg-gray-800/90 text-white rounded-full hover:bg-gray-700 transition shadow-lg"
        style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}
        title={isSoundEnabled ? "Mute Sound" : "Unmute Sound"}
      >
        <IoVolumeHigh className="h-5 w-5" />
        {!isSoundEnabled && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-red-600 text-lg font-bold drop-shadow-lg">✕</span>
          </div>
        )}
      </button>
    </div>
  );
};

export default GameTableHeader;
