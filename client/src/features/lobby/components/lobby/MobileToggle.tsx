import React from 'react';
import { useWindowSize } from '@/hooks/useWindowSize';

interface MobileToggleProps {
  mobileTab: 'lobby' | 'chat';
  onToggle: () => void;
}

const MobileToggle: React.FC<MobileToggleProps> = ({ mobileTab, onToggle }) => {
  const { isLandscape } = useWindowSize();
  const isPortrait = !isLandscape;
  
  // Only show toggle for portrait orientation
  if (!isPortrait) {
    return null;
  }
  
  return (
    <div className="flex justify-center items-center pt-4 pb-1 px-4">
      <span className={`text-sm font-bold mr-2 ${mobileTab === 'lobby' ? 'text-indigo-600' : 'text-slate-400'}`}>Lobby</span>
      <button
        className={`relative w-12 bg-slate-700 rounded-full transition-colors duration-200 focus:outline-none`}
        style={{ height: '26px' }}
        onClick={onToggle}
        aria-label="Toggle Lobby/Chat"
      >
        <span
          className={`absolute left-0 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${mobileTab === 'chat' ? 'translate-x-7' : ''}`}
          style={{ top: '3px' }}
        ></span>
      </button>
      <span className={`text-sm font-bold ml-2 ${mobileTab === 'chat' ? 'text-indigo-600' : 'text-slate-400'}`}>Chat</span>
    </div>
  );
};

export default MobileToggle;
