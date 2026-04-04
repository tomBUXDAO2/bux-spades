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
    <div className="flex items-center justify-center px-4 pb-1 pt-4">
      <span className={`mr-2 text-sm font-semibold ${mobileTab === 'lobby' ? 'bg-gradient-to-r from-cyan-200 to-teal-200 bg-clip-text text-transparent' : 'text-slate-500'}`}>Lobby</span>
      <div
        className="relative inline-flex h-8 w-16 cursor-pointer items-center rounded-full border border-white/10 bg-slate-900/60 shadow-inner"
        onClick={onToggle}
        style={{ userSelect: 'none' }}
      >
        <div
          className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-gradient-to-br from-cyan-400 to-teal-600 shadow-md shadow-cyan-950/50 transition-transform duration-200 ${mobileTab === 'chat' ? 'translate-x-8' : ''}`}
          style={{ transform: mobileTab === 'chat' ? 'translateX(32px)' : 'translateX(0)' }}
        ></div>
      </div>
      <span className={`ml-2 text-sm font-semibold ${mobileTab === 'chat' ? 'bg-gradient-to-r from-cyan-200 to-teal-200 bg-clip-text text-transparent' : 'text-slate-500'}`}>Chat</span>
    </div>
  );
};

export default MobileToggle;
