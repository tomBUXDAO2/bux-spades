import React from 'react';

interface MobileToggleProps {
  mobileTab: 'lobby' | 'chat';
  onToggle: () => void;
}

const MobileToggle: React.FC<MobileToggleProps> = ({ mobileTab, onToggle }) => {
  return (
    <div className="md:hidden flex justify-center items-center py-2 px-4">
      <span className={`text-base font-bold mr-2 ${mobileTab === 'lobby' ? 'text-indigo-600' : 'text-slate-400'}`}>Lobby</span>
      <button
        className={`relative w-14 h-8 bg-slate-700 rounded-full flex items-center transition-colors duration-200 focus:outline-none`}
        onClick={onToggle}
        aria-label="Toggle Lobby/Chat"
      >
        <span
          className={`absolute left-1 top-1 w-6 h-6 rounded-full bg-white shadow transition-transform duration-200 ${mobileTab === 'chat' ? 'translate-x-6' : ''}`}
        ></span>
      </button>
      <span className={`text-base font-bold ml-2 ${mobileTab === 'chat' ? 'text-indigo-600' : 'text-slate-400'}`}>Chat</span>
    </div>
  );
};

export default MobileToggle;
