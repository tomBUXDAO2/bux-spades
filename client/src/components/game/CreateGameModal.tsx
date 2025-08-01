import React, { useState } from 'react';
import type { GameSettings, GameMode, BiddingOption } from '../../types/game';

interface CreateGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateGame: (settings: GameSettings) => void;
}

const formatCoins = (value: number) => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}mil`;
  }
  return `${value / 1000}k`;
};

const CreateGameModal: React.FC<CreateGameModalProps> = ({ isOpen, onClose, onCreateGame }) => {
  // UI state for modal controls
  const [mode, setMode] = useState<GameMode>('PARTNERS');
  const [gameType, setGameType] = useState<'REG' | 'WHIZ' | 'MIRROR' | 'GIMMICK'>('REG');
  const [gimmickType, setGimmickType] = useState<'SUICIDE' | '4 OR NIL' | 'BID 3' | 'BID HEARTS' | 'CRAZY ACES'>('SUICIDE');

  const [minPoints, setMinPoints] = useState(-100);
  const [maxPoints, setMaxPoints] = useState(500);
  const [buyIn, setBuyIn] = useState(100000);
  const [specialRule, setSpecialRule] = useState<'screamer' | 'assassin' | ''>('');
  const [allowNil, setAllowNil] = useState(true);
  const [allowBlindNil, setAllowBlindNil] = useState(false);

  // Get the actual bidding option based on game type and gimmick selection
  const getBiddingOption = (): BiddingOption => {
    if (gameType === 'GIMMICK') {
      return gimmickType as BiddingOption;
    }
    return gameType as BiddingOption;
  };

  // Handle game type changes
  const handleGameTypeChange = (type: 'REG' | 'WHIZ' | 'MIRROR' | 'GIMMICK') => {
    setGameType(type);
    
    // Mirror game type logic: nil always allowed, blind nil never allowed
    if (type === 'MIRROR') {
      setAllowNil(true); // Nil is always allowed in Mirror
      setAllowBlindNil(false); // Blind nil is never allowed in Mirror
    }
  };

  // Handle nil toggle changes
  const handleNilToggle = (enabled: boolean) => {
    setAllowNil(enabled);
    // If nil is disabled, blind nil should also be disabled
    if (!enabled) {
      setAllowBlindNil(false);
    }
  };

  // Handle blind nil toggle changes
  const handleBlindNilToggle = (enabled: boolean) => {
    setAllowBlindNil(enabled);
    // If blind nil is enabled, nil should also be enabled
    if (enabled) {
      setAllowNil(true);
    }
  };

  if (!isOpen) return null;

  const handlePointsChange = (field: 'min' | 'max', delta: number) => {
    if (field === 'min') {
      setMinPoints((prev) => {
        const next = prev + delta;
        return Math.max(-250, Math.min(-100, next));
      });
    } else {
      setMaxPoints((prev) => {
        const next = prev + delta;
        return Math.max(100, Math.min(650, next));
      });
    }
  };

  const handleBuyInChange = (delta: number) => {
    setBuyIn((prev) => {
      const step = prev >= 1000000 ? 100000 : 50000;
      const newValue = prev + delta * step;
      return Math.max(100000, newValue);
    });
  };

  const handleCreate = () => {
    // Pass all necessary settings to onCreateGame
    onCreateGame({
      gameMode: mode,
      biddingOption: getBiddingOption(),
      gamePlayOption: 'REG',
      minPoints,
      maxPoints,
      buyIn,
      specialRules: {
        screamer: specialRule === 'screamer',
        assassin: specialRule === 'assassin',
        allowNil,
        allowBlindNil
      }
    });
    onClose();
  };



  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
      <div className="bg-slate-800 rounded-lg p-4 w-full max-w-md flex flex-col items-center border border-white/20 max-h-[95vh] overflow-y-auto sm:p-4 sm:gap-4">
        <h2 className="text-xl font-bold text-slate-200 mb-4 text-center sm:text-2xl">Create Game</h2>
        <div className="space-y-2 w-full flex flex-col items-center justify-center sm:space-y-3">
          {/* Left Column */}
          <div className="w-full flex flex-col items-center space-y-2 sm:space-y-3">
            {/* Partners/Solo Toggle with text outside */}
            <div className="flex items-center justify-center w-full gap-2 my-2">
              <span className={`font-semibold ${mode === 'PARTNERS' ? 'text-white' : 'text-slate-400'} text-sm sm:text-base`}>Partners</span>
              <div
                className="relative inline-flex items-center w-16 h-8 bg-slate-700 rounded-full cursor-pointer"
                onClick={() => {
                  const newMode = mode === 'PARTNERS' ? 'SOLO' : 'PARTNERS';
                  setMode(newMode);
                  
                  // Reset gimmickType when switching modes to prevent invalid selections
                  if (newMode === 'SOLO' && gimmickType === 'SUICIDE') {
                    setGimmickType('4 OR NIL');
                  }
                }}
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
                  className={`absolute top-1 left-1 w-6 h-6 bg-indigo-600 rounded-full shadow-md transition-transform duration-200 ${mode === 'SOLO' ? 'translate-x-8' : ''}`}
                  style={{ transform: mode === 'SOLO' ? 'translateX(32px)' : 'translateX(0)' }}
                ></div>
              </div>
              <span className={`font-semibold ${mode === 'SOLO' ? 'text-white' : 'text-slate-400'} text-sm sm:text-base`}>Solo</span>
            </div>

          {/* Coins with coin icon and prize display - moved above bidding options */}
          <div className="w-full flex flex-col items-center my-2">
            <label className="block text-lg font-bold text-yellow-500 mb-2 text-center sm:text-2xl">Coins</label>
            <div className="flex items-center gap-4 justify-center">
              <button onClick={() => handleBuyInChange(-1)} className="w-8 h-8 flex items-center justify-center bg-slate-600 text-slate-200 rounded-full">-</button>
              <span className="w-20 text-center flex items-center justify-center gap-1 bg-slate-100 text-slate-800 rounded-md px-2 py-1 font-semibold">
                <svg className="w-5 h-5 text-yellow-500 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
                {formatCoins(buyIn)}
              </span>
              <button onClick={() => handleBuyInChange(1)} className="w-8 h-8 flex items-center justify-center bg-slate-600 text-slate-200 rounded-full">+</button>
            </div>
            {/* Prize display */}
            <div className="mt-2 text-xs font-medium text-indigo-300 text-center sm:text-sm">
              {(() => {
                const prizePot = buyIn * 4 * 0.9;
                if (mode === 'PARTNERS') {
                  return ` (Prize = ${formatCoins(prizePot / 2)} each)`;
                } else {
                  // Solo mode: 2nd place gets their stake back, 1st place gets the remainder
                  const secondPlacePrize = buyIn; // Exactly their stake back
                  const firstPlacePrize = prizePot - secondPlacePrize; // Remainder after 2nd place gets their stake
                  return ` (1st = ${formatCoins(firstPlacePrize)}, 2nd = ${formatCoins(secondPlacePrize)})`;
                }
              })()}
            </div>
          </div>

          {/* Min and Max Points inline */}
          <div className="w-full flex flex-col items-center my-2">
            <div className="flex gap-8 items-center justify-center w-full">
              <div className="flex flex-col items-center w-1/2">
                <label className="block text-slate-300 mb-2 text-center text-sm sm:text-base">Min Points</label>
                <div className="flex gap-2 items-center justify-center">
                  <button onClick={() => handlePointsChange('min', -50)} className="w-8 h-8 flex items-center justify-center bg-slate-600 text-slate-200 rounded-full" disabled={minPoints <= -250}>-</button>
                  <input
                    type="text"
                    value={minPoints}
                    readOnly
                    className="w-16 text-center bg-slate-100 text-slate-800 rounded-md px-2 py-1 font-semibold"
                  />
                  <button onClick={() => handlePointsChange('min', 50)} className="w-8 h-8 flex items-center justify-center bg-slate-600 text-slate-200 rounded-full" disabled={minPoints >= -100}>+</button>
                </div>
              </div>
              <div className="flex flex-col items-center w-1/2">
                <label className="block text-slate-300 mb-2 text-center text-sm sm:text-base">Max Points</label>
                <div className="flex gap-2 items-center justify-center">
                  <button onClick={() => handlePointsChange('max', -50)} className="w-8 h-8 flex items-center justify-center bg-slate-600 text-slate-200 rounded-full" disabled={maxPoints <= 100}>-</button>
                  <input
                    type="text"
                    value={maxPoints}
                    readOnly
                    className="w-16 text-center bg-slate-100 text-slate-800 rounded-md px-2 py-1 font-semibold"
                  />
                  <button onClick={() => handlePointsChange('max', 50)} className="w-8 h-8 flex items-center justify-center bg-slate-600 text-slate-200 rounded-full" disabled={maxPoints >= 650}>+</button>
                </div>
              </div>
            </div>
          </div>
          </div>

          {/* Right Column */}
          <div className="w-full flex flex-col items-center space-y-2 sm:space-y-3">

          {/* Game Type Radio Buttons */}
          <div className="w-full flex flex-col items-center my-2">
            <div className="flex flex-wrap gap-4 justify-center mb-2">
              {['REG', 'WHIZ', 'MIRROR', 'GIMMICK'].map((opt) => (
                <label key={opt} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="gameType"
                    value={opt}
                    checked={gameType === opt}
                    onChange={() => handleGameTypeChange(opt as 'REG' | 'WHIZ' | 'MIRROR' | 'GIMMICK')}
                  />
                  <span className="text-slate-200 text-xs sm:text-sm">{opt}</span>
                </label>
              ))}
            </div>

            {/* Gimmick Dropdown */}
            <div className="w-full flex justify-center mb-2">
              <select
                value={gameType === 'GIMMICK' ? gimmickType : 'NO GIMMICK'}
                onChange={(e) => setGimmickType(e.target.value as 'SUICIDE' | '4 OR NIL' | 'BID 3' | 'BID HEARTS')}
                disabled={gameType !== 'GIMMICK'}
                className={`px-2 py-1 rounded-md text-slate-800 font-semibold text-xs sm:text-sm sm:px-3 ${
                  gameType === 'GIMMICK' 
                    ? 'bg-slate-100 cursor-pointer' 
                    : 'bg-slate-600 text-slate-400 cursor-not-allowed'
                }`}
              >
                <option value="NO GIMMICK" disabled>NO GIMMICK</option>
                {gameType === 'GIMMICK' && (mode === 'PARTNERS' 
                  ? ['SUICIDE', '4 OR NIL', 'BID 3', 'BID HEARTS', 'CRAZY ACES']
                  : ['4 OR NIL', 'BID 3', 'BID HEARTS', 'CRAZY ACES']
                ).map((option: string) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            {/* Nil and Blind Nil toggles */}
            <div className="flex flex-row gap-6 justify-center items-center my-2" style={{ minHeight: '2.2rem' }}>
              <div className="flex items-center gap-2">
                                  <span className="text-slate-200 text-xs sm:text-sm">Nil:</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${!allowNil ? 'text-white' : 'text-slate-400'}`}>Off</span>
                  <div
                    className={`relative inline-flex items-center w-12 h-6 bg-slate-700 rounded-full cursor-pointer ${gameType === 'MIRROR' ? 'cursor-not-allowed opacity-50' : ''}`}
                    onClick={() => !(gameType === 'MIRROR') && handleNilToggle(!allowNil)}
                    style={{ userSelect: 'none' }}
                  >
                    <div
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-indigo-600 rounded-full shadow-md transition-transform duration-200 ${allowNil ? 'translate-x-6' : ''}`}
                      style={{ transform: allowNil ? 'translateX(24px)' : 'translateX(0)' }}
                    ></div>
                  </div>
                  <span className={`text-xs ${allowNil ? 'text-white' : 'text-slate-400'}`}>On</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-200 text-xs sm:text-sm">Blind Nil:</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${!allowBlindNil ? 'text-white' : 'text-slate-400'}`}>Off</span>
                  <div
                    className={`relative inline-flex items-center w-12 h-6 bg-slate-700 rounded-full cursor-pointer ${gameType === 'MIRROR' || !allowNil ? 'cursor-not-allowed opacity-50' : ''}`}
                    onClick={() => !(gameType === 'MIRROR' || !allowNil) && handleBlindNilToggle(!allowBlindNil)}
                    style={{ userSelect: 'none' }}
                  >
                    <div
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-indigo-600 rounded-full shadow-md transition-transform duration-200 ${allowBlindNil ? 'translate-x-6' : ''}`}
                      style={{ transform: allowBlindNil ? 'translateX(24px)' : 'translateX(0)' }}
                    ></div>
                  </div>
                  <span className={`text-xs ${allowBlindNil ? 'text-white' : 'text-slate-400'}`}>On</span>
                </div>
              </div>
            </div>
          </div>

          {/* Special Rules with emojis, mutually exclusive */}
          <div className="w-full flex flex-col items-center my-2">
            <label className="block text-lg font-bold text-pink-400 mb-2 text-center sm:text-2xl">Special Rules</label>
            <div className="flex flex-row gap-6 justify-center">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={specialRule === 'screamer'}
                  onChange={() => setSpecialRule(specialRule === 'screamer' ? '' : 'screamer')}
                  className="form-checkbox bg-slate-700 text-indigo-600 rounded"
                />
                <span className="text-slate-300 text-xs sm:text-sm">🎭 Screamer</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={specialRule === 'assassin'}
                  onChange={() => setSpecialRule(specialRule === 'assassin' ? '' : 'assassin')}
                  className="form-checkbox bg-slate-700 text-indigo-600 rounded"
                />
                <span className="text-slate-300 text-xs sm:text-sm">⚔️ Assassin</span>
              </label>
            </div>
          </div>
          </div>

          {/* Buttons Row */}
          <div className="w-full flex justify-center gap-4 mt-4 sm:mt-4">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-slate-300 hover:text-slate-100 transition-colors text-sm sm:text-base sm:px-4 sm:py-2"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md transition-colors text-sm sm:text-base sm:px-4 sm:py-2"
            >
              Create Game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateGameModal; 