import React from 'react';

const formatCoins = (value: number) => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}mil`;
  }
  return `${value / 1000}k`;
};

interface BuyInSettingsProps {
  buyIn: number;
  onBuyInChange: (value: number) => void;
  isMobile: boolean;
  useLandscapeLayout: boolean;
}

export const BuyInSettings: React.FC<BuyInSettingsProps> = ({
  buyIn,
  onBuyInChange,
  isMobile,
  useLandscapeLayout
}) => {
  const buyInOptions = [
    { value: 10000, label: '10k' },
    { value: 50000, label: '50k' },
    { value: 100000, label: '100k' },
    { value: 250000, label: '250k' },
    { value: 500000, label: '500k' },
    { value: 1000000, label: '1mil' }
  ];

  if (useLandscapeLayout) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-slate-300 font-semibold text-sm">Buy-in:</span>
        <select
          value={buyIn}
          onChange={(e) => onBuyInChange(parseInt(e.target.value))}
          className="bg-slate-700 text-white rounded px-2 py-1 text-sm"
        >
          {buyInOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <label className="block text-slate-300 font-semibold mb-2">
        Buy-in Amount
      </label>
      <div className="grid grid-cols-3 gap-2">
        {buyInOptions.map(option => (
          <button
            key={option.value}
            onClick={() => onBuyInChange(option.value)}
            className={`px-3 py-2 rounded-md transition-colors ${
              buyIn === option.value
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="mt-2 text-slate-400 text-sm">
        Selected: {formatCoins(buyIn)} coins
      </div>
    </div>
  );
};
