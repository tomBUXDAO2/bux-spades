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
      <span className={`text-sm font-bold mr-2 ${mobileTab === 'lobby' ? 'text-white' : 'text-slate-400'}`}>Lobby</span>
      <div
        className="relative inline-flex items-center w-16 h-8 bg-slate-700 rounded-full cursor-pointer"
        onClick={onToggle}
        style={{ userSelect: 'none' }}
      >
        <div
          className={`absolute top-1 left-1 w-6 h-6 bg-indigo-600 rounded-full shadow-md transition-transform duration-200 ${mobileTab === 'chat' ? 'translate-x-8' : ''}`}
          style={{ transform: mobileTab === 'chat' ? 'translateX(32px)' : 'translateX(0)' }}
        ></div>
      </div>
      <span className={`text-sm font-bold ml-2 ${mobileTab === 'chat' ? 'text-white' : 'text-slate-400'}`}>Chat</span>
    </div>
  );
};

export default MobileToggle;
