import React from 'react';
import type { GameMode } from "../../types/game"""';

interface GameModeToggleProps {
  mode: GameMode;
  onModeChange: (mode: GameMode) => void;
  isMobile: boolean;
  useLandscapeLayout: boolean;
}

export const GameModeToggle: React.FC<GameModeToggleProps> = ({
  mode,
  onModeChange,
  isMobile,
  useLandscapeLayout
}) => {
  if (useLandscapeLayout) {
    return (
      <div className="flex items-center gap-2">
        <span className={`font-semibold ${mode === 'PARTNERS' ? 'text-white' : 'text-slate-400'} text-sm`}>
          Partners
        </span>
        <div
          className="relative inline-flex items-center w-12 h-6 bg-slate-700 rounded-full cursor-pointer"
          onClick={() => onModeChange(mode === 'PARTNERS' ? 'SOLO' : 'PARTNERS')}
          style={{ userSelect: 'none' }}
        >
          <input
            type="checkbox"
            id="mode-toggle"
            className="sr-only peer"
            checked={mode === 'SOLO'}
            readOnly
          />
          <div
            className={`absolute top-1 left-1 w-4 h-4 bg-indigo-600 rounded-full shadow-md transition-transform duration-200 ${mode === 'SOLO' ? 'translate-x-6' : ''}`}
            style={{ transform: mode === 'SOLO' ? 'translateX(24px)' : 'translateX(0)' }}
          ></div>
        </div>
        <span className={`font-semibold ${mode === 'SOLO' ? 'text-white' : 'text-slate-400'} text-sm`}>
          Solo
        </span>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <label className="block text-slate-300 font-semibold mb-2">
        Game Mode
      </label>
      <div className="flex gap-4">
        <button
          onClick={() => onModeChange('PARTNERS')}
          className={`px-4 py-2 rounded-md transition-colors ${
            mode === 'PARTNERS'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Partners
        </button>
        <button
          onClick={() => onModeChange('SOLO')}
          className={`px-4 py-2 rounded-md transition-colors ${
            mode === 'SOLO'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Solo
        </button>
      </div>
    </div>
  );
};
