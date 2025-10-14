import React, { useState, useEffect } from 'react';
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
  // Force re-render on window resize
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  
  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Handle screens 600-740px wide - FORCE smaller sizes to prevent overlap
  const buttonSize = (screenWidth >= 600 && screenWidth <= 740) ? 25 : 36;
  const iconSize = (screenWidth >= 600 && screenWidth <= 740) ? 14 : 20;
  
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
    <div 
      className="absolute top-4 left-4 z-[100001] flex items-center gap-2"
      style={{
        '--button-size': `${buttonSize}px`,
        '--icon-size': `${iconSize}px`
      } as React.CSSProperties}
    >
      <button
        onClick={onLeaveTable}
        style={{ 
          backgroundColor: 'rgba(31, 41, 55, 0.9)',
          color: 'white',
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          transition: 'background-color 0.2s',
          fontSize: `${Math.floor(14 * scaleFactor)}px`,
          width: 'var(--button-size)',
          height: 'var(--button-size)'
        }}
        onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(55, 65, 81, 1)'}
        onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(31, 41, 55, 0.9)'}
      >
        <IoExitOutline style={{ width: 'var(--icon-size)', height: 'var(--icon-size)' }} />
      </button>
      <div style={{ position: 'relative' }} ref={infoRef}>
        <button
          onClick={onToggleGameInfo}
          style={{ 
            backgroundColor: 'rgba(31, 41, 55, 0.9)',
            color: 'white',
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            transition: 'background-color 0.2s',
            fontSize: `${Math.floor(14 * scaleFactor)}px`,
            width: 'var(--button-size)',
            height: 'var(--button-size)'
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(55, 65, 81, 1)'}
          onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(31, 41, 55, 0.9)'}
        >
          <IoInformationCircleOutline style={{ width: 'var(--icon-size)', height: 'var(--icon-size)' }} />
        </button>
      </div>
      <button
        onClick={onShowTrickHistory}
        style={{ 
          backgroundColor: 'rgba(31, 41, 55, 0.9)',
          color: 'white',
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          transition: 'background-color 0.2s',
          fontSize: `${Math.floor(14 * scaleFactor)}px`,
          width: 'var(--button-size)',
          height: 'var(--button-size)'
        }}
        onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(55, 65, 81, 1)'}
        onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(31, 41, 55, 0.9)'}
        title="View Trick History"
      >
        <svg style={{ width: 'var(--icon-size)', height: 'var(--icon-size)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </button>
      <button
        onClick={handleSoundToggle}
        style={{ 
          position: 'relative',
          backgroundColor: 'rgba(31, 41, 55, 0.9)',
          color: 'white',
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          transition: 'background-color 0.2s',
          fontSize: `${Math.floor(14 * scaleFactor)}px`,
          width: 'var(--button-size)',
          height: 'var(--button-size)'
        }}
        onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(55, 65, 81, 1)'}
        onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(31, 41, 55, 0.9)'}
        title={isSoundEnabled ? "Mute Sound" : "Unmute Sound"}
      >
        <IoVolumeHigh style={{ width: 'var(--icon-size)', height: 'var(--icon-size)' }} />
        {!isSoundEnabled && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#dc2626', fontWeight: 'bold', filter: 'drop-shadow(0 4px 3px rgba(0, 0, 0, 0.07))', fontSize: `${Math.floor(18 * scaleFactor)}px` }}>✕</span>
          </div>
        )}
      </button>
    </div>
  );
};

export default GameTableHeader;
