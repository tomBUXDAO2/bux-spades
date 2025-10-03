import React from 'react';

interface PlayerStatsModeSelectorProps {
  mode: 'all' | 'partners' | 'solo';
  onModeChange: (mode: 'all' | 'partners' | 'solo') => void;
}

export const PlayerStatsModeSelector: React.FC<PlayerStatsModeSelectorProps> = ({
  mode,
  onModeChange
}) => {
  return (
    <div className="flex items-center space-x-4">
      <label className="flex items-center space-x-2">
        <input
          type="radio"
          name="mode"
          value="all"
          checked={mode === 'all'}
          onChange={(e) => onModeChange(e.target.value as "all" | "partners" | "solo")}
          className="w-5 h-5 text-blue-600"
        />
        <span className="text-white text-lg">ALL</span>
      </label>
      <label className="flex items-center space-x-2">
        <input
          type="radio"
          name="mode"
          value="partners"
          checked={mode === 'partners'}
          onChange={(e) => onModeChange(e.target.value as "all" | "partners" | "solo")}
          className="w-5 h-5 text-blue-600"
        />
        <span className="text-white text-lg">PARTNERS</span>
      </label>
      <label className="flex items-center space-x-2">
        <input
          type="radio"
          name="mode"
          value="solo"
          checked={mode === 'solo'}
          onChange={(e) => onModeChange(e.target.value as "all" | "partners" | "solo")}
          className="w-5 h-5 text-blue-600"
        />
        <span className="text-white text-lg">SOLO</span>
      </label>
    </div>
  );
};
