import React from 'react';

interface GameTypeSelectorProps {
  gameType: 'REG' | 'WHIZ' | 'MIRROR' | 'GIMMICK';
  gimmickType: 'SUICIDE' | '4 OR NIL' | 'BID 3' | 'BID HEARTS' | 'CRAZY ACES';
  onGameTypeChange: (type: 'REG' | 'WHIZ' | 'MIRROR' | 'GIMMICK') => void;
  onGimmickTypeChange: (type: 'SUICIDE' | '4 OR NIL' | 'BID 3' | 'BID HEARTS' | 'CRAZY ACES') => void;
  isMobile: boolean;
  useLandscapeLayout: boolean;
}

export const GameTypeSelector: React.FC<GameTypeSelectorProps> = ({
  gameType,
  gimmickType,
  onGameTypeChange,
  onGimmickTypeChange,
  isMobile,
  useLandscapeLayout
}) => {
  const gameTypes = [
    { value: 'REG', label: 'Regular' },
    { value: 'WHIZ', label: 'Whiz' },
    { value: 'MIRROR', label: 'Mirror' },
    { value: 'GIMMICK', label: 'Gimmick' }
  ];

  const gimmickTypes = [
    { value: 'SUICIDE', label: 'Suicide' },
    { value: '4 OR NIL', label: '4 or Nil' },
    { value: 'BID 3', label: 'Bid 3' },
    { value: 'BID HEARTS', label: 'Bid Hearts' },
    { value: 'CRAZY ACES', label: 'Crazy Aces' }
  ];

  if (useLandscapeLayout) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-slate-300 font-semibold text-sm">Type:</span>
        <select
          value={gameType}
          onChange={(e) => onGameTypeChange(e.target.value as 'REG' | 'WHIZ' | 'MIRROR' | 'GIMMICK')}
          className="bg-slate-700 text-white rounded px-2 py-1 text-sm"
        >
          {gameTypes.map(type => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        {gameType === 'GIMMICK' && (
          <select
            value={gimmickType}
            onChange={(e) => onGimmickTypeChange(e.target.value as 'SUICIDE' | '4 OR NIL' | 'BID 3' | 'BID HEARTS' | 'CRAZY ACES')}
            className="bg-slate-700 text-white rounded px-2 py-1 text-sm"
          >
            {gimmickTypes.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        )}
      </div>
    );
  }

  return (
    <div className="mb-4">
      <label className="block text-slate-300 font-semibold mb-2">
        Game Type
      </label>
      <div className="grid grid-cols-2 gap-2">
        {gameTypes.map(type => (
          <button
            key={type.value}
            onClick={() => onGameTypeChange(type.value as 'REG' | 'WHIZ' | 'MIRROR' | 'GIMMICK')}
            className={`px-3 py-2 rounded-md transition-colors ${
              gameType === type.value
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>
      
      {gameType === 'GIMMICK' && (
        <div className="mt-3">
          <label className="block text-slate-300 font-semibold mb-2">
            Gimmick Type
          </label>
          <div className="grid grid-cols-1 gap-2">
            {gimmickTypes.map(type => (
              <button
                key={type.value}
                onClick={() => onGimmickTypeChange(type.value as 'SUICIDE' | '4 OR NIL' | 'BID 3' | 'BID HEARTS' | 'CRAZY ACES')}
                className={`px-3 py-2 rounded-md transition-colors ${
                  gimmickType === type.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
