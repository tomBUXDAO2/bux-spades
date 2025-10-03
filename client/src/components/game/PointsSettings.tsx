import React from 'react';

interface PointsSettingsProps {
  minPoints: number;
  maxPoints: number;
  onMinPointsChange: (value: number) => void;
  onMaxPointsChange: (value: number) => void;
  isMobile: boolean;
  useLandscapeLayout: boolean;
}

export const PointsSettings: React.FC<PointsSettingsProps> = ({
  minPoints,
  maxPoints,
  onMinPointsChange,
  onMaxPointsChange,
  isMobile,
  useLandscapeLayout
}) => {
  if (useLandscapeLayout) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-slate-300 font-semibold text-sm">Points:</span>
        <input
          type="number"
          value={minPoints}
          onChange={(e) => onMinPointsChange(parseInt(e.target.value) || 0)}
          className="w-16 bg-slate-700 text-white rounded px-2 py-1 text-sm"
          placeholder="Min"
        />
        <span className="text-slate-300">to</span>
        <input
          type="number"
          value={maxPoints}
          onChange={(e) => onMaxPointsChange(parseInt(e.target.value) || 0)}
          className="w-16 bg-slate-700 text-white rounded px-2 py-1 text-sm"
          placeholder="Max"
        />
      </div>
    );
  }

  return (
    <div className="mb-4">
      <label className="block text-slate-300 font-semibold mb-2">
        Points Range
      </label>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-slate-400 text-sm mb-1">Min Points</label>
          <input
            type="number"
            value={minPoints}
            onChange={(e) => onMinPointsChange(parseInt(e.target.value) || 0)}
            className="w-full bg-slate-700 text-white rounded px-3 py-2"
            placeholder="Min Points"
          />
        </div>
        <div className="flex-1">
          <label className="block text-slate-400 text-sm mb-1">Max Points</label>
          <input
            type="number"
            value={maxPoints}
            onChange={(e) => onMaxPointsChange(parseInt(e.target.value) || 0)}
            className="w-full bg-slate-700 text-white rounded px-3 py-2"
            placeholder="Max Points"
          />
        </div>
      </div>
    </div>
  );
};
