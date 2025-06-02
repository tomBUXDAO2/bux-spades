import React, { useState } from 'react';
import type { GameSettings, GameMode, BiddingOption } from '../../types/game';

interface CreateGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateGame: (settings: GameSettings) => void;
}

const GIMMICK_OPTIONS = [
  { value: 'suicide', label: 'Suicide (1 partner must nil)' },
  { value: 'bid4orNil', label: 'Bid 4 or Nil' },
  { value: 'bid3', label: 'Bid 3' },
  { value: 'bidHearts', label: 'Bid Hearts' },
];

const formatCoins = (value: number) => `${value / 1000}k`;

const CreateGameModal: React.FC<CreateGameModalProps> = ({ isOpen, onClose, onCreateGame }) => {
  // UI state for modal controls
  const [mode, setMode] = useState<GameMode>('PARTNERS');
  const [biddingOption, setBiddingOption] = useState<BiddingOption>('REG');
  const [gimmickOption, setGimmickOption] = useState('');
  const [minPoints, setMinPoints] = useState(-100);
  const [maxPoints, setMaxPoints] = useState(500);
  const [buyIn, setBuyIn] = useState(100000);
  const [specialRule, setSpecialRule] = useState<'screamer' | 'assassin' | ''>('');

  if (!isOpen) return null;

  const handlePointsChange = (field: 'min' | 'max', delta: number) => {
    if (field === 'min') setMinPoints((prev) => prev + delta);
    else setMaxPoints((prev) => prev + delta);
  };

  const handleBuyInChange = (delta: number) => {
    setBuyIn((prev) => Math.max(100000, prev + delta));
  };

  const handleCreate = () => {
    // Pass all necessary settings to onCreateGame
    onCreateGame({
      gameMode: mode,
      biddingOption,
      gamePlayOption: 'REG',
      minPoints,
      maxPoints,
      buyIn,
      specialRules: {
        screamer: specialRule === 'screamer',
        assassin: specialRule === 'assassin'
      }
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold text-slate-200 mb-6 text-center">Create Game</h2>
        <div className="space-y-6 w-full flex flex-col items-center justify-center">
          {/* Partners/Solo Toggle with text outside */}
          <div className="flex items-center justify-center w-full mb-2 gap-4">
            <span className={`font-semibold ${mode === 'PARTNERS' ? 'text-white' : 'text-slate-400'}`}>Partners</span>
            <div
              className="relative inline-flex items-center w-28 h-12 bg-slate-700 rounded-full cursor-pointer"
              onClick={() => setMode(mode === 'PARTNERS' ? 'SOLO' : 'PARTNERS')}
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
                className={`absolute top-1 left-1 w-10 h-10 bg-indigo-600 rounded-full shadow-md transition-transform duration-200 ${mode === 'SOLO' ? 'translate-x-16' : ''}`}
                style={{ transform: mode === 'SOLO' ? 'translateX(64px)' : 'translateX(0)' }}
              ></div>
            </div>
            <span className={`font-semibold ${mode === 'SOLO' ? 'text-white' : 'text-slate-400'}`}>Solo</span>
          </div>

          {/* Coins with coin icon and prize display - moved above bidding options */}
          <div className="w-full flex flex-col items-center">
            <label className="block text-2xl font-bold text-yellow-500 mb-2 text-center">Coins</label>
            <div className="flex items-center gap-4 justify-center">
              <button onClick={() => handleBuyInChange(-50000)} className="w-8 h-8 flex items-center justify-center bg-slate-600 text-slate-200 rounded-full">-</button>
              <span className="w-20 text-center flex items-center justify-center gap-1 bg-slate-100 text-slate-800 rounded-md px-2 py-1 font-semibold">
                <svg className="w-5 h-5 text-yellow-500 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
                {formatCoins(buyIn)}
              </span>
              <button onClick={() => handleBuyInChange(50000)} className="w-8 h-8 flex items-center justify-center bg-slate-600 text-slate-200 rounded-full">+</button>
            </div>
            {/* Prize display */}
            <div className="mt-2 text-sm font-medium text-indigo-300 text-center">
              {mode === 'PARTNERS' ? ` (Prize = ${(buyIn * 1.8 / 1000).toFixed(0)}k each)` : ` (1st = ${(buyIn * 2.6 / 1000).toFixed(0)}k, 2nd = ${(buyIn / 1000).toFixed(0)}k)`}
            </div>
          </div>

          {/* Min and Max Points inline */}
          <div className="w-full flex flex-col items-center">
            <div className="flex gap-8 items-center justify-center w-full">
              <div className="flex flex-col items-center w-1/2">
                <label className="block text-slate-300 mb-2 text-center">Min Points</label>
                <div className="flex gap-2 items-center justify-center">
                  <button onClick={() => handlePointsChange('min', -50)} className="w-8 h-8 flex items-center justify-center bg-slate-600 text-slate-200 rounded-full">-</button>
                  <input
                    type="text"
                    value={minPoints}
                    readOnly
                    className="w-16 text-center bg-slate-100 text-slate-800 rounded-md px-2 py-1 font-semibold"
                  />
                  <button onClick={() => handlePointsChange('min', 50)} className="w-8 h-8 flex items-center justify-center bg-slate-600 text-slate-200 rounded-full">+</button>
                </div>
              </div>
              <div className="flex flex-col items-center w-1/2">
                <label className="block text-slate-300 mb-2 text-center">Max Points</label>
                <div className="flex gap-2 items-center justify-center">
                  <button onClick={() => handlePointsChange('max', -50)} className="w-8 h-8 flex items-center justify-center bg-slate-600 text-slate-200 rounded-full">-</button>
                  <input
                    type="text"
                    value={maxPoints}
                    readOnly
                    className="w-16 text-center bg-slate-100 text-slate-800 rounded-md px-2 py-1 font-semibold"
                  />
                  <button onClick={() => handlePointsChange('max', 50)} className="w-8 h-8 flex items-center justify-center bg-slate-600 text-slate-200 rounded-full">+</button>
                </div>
              </div>
            </div>
          </div>

          {/* Bidding Options Radio Buttons - label removed */}
          <div className="w-full flex flex-col items-center">
            <div className="flex flex-wrap gap-4 justify-center">
              {['REG', 'WHIZ', 'MIRROR', 'GIMMICK'].map((opt) => (
                <label key={opt} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="biddingOption"
                    value={opt}
                    checked={biddingOption === opt as BiddingOption}
                    onChange={() => setBiddingOption(opt as BiddingOption)}
                  />
                  <span className="text-slate-200">{opt}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Gimmick Dropdown */}
          {biddingOption === 'GIMMICK' as BiddingOption && (
            <div className="w-full flex flex-col items-center">
              <label className="block text-slate-300 mb-2 text-center">Gimmick Option</label>
              <select
                value={gimmickOption}
                onChange={e => setGimmickOption(e.target.value)}
                className="w-full bg-slate-600 text-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select a Gimmick</option>
                {(mode === 'PARTNERS' ? GIMMICK_OPTIONS : GIMMICK_OPTIONS.filter(opt => opt.value !== 'suicide')).map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Special Rules with emojis, mutually exclusive */}
          <div className="w-full flex flex-col items-center">
            <label className="block text-2xl font-bold text-pink-400 mb-2 text-center">Special Rules</label>
            <div className="flex flex-row gap-8 justify-center">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={specialRule === 'screamer'}
                  onChange={() => setSpecialRule(specialRule === 'screamer' ? '' : 'screamer')}
                  className="form-checkbox bg-slate-700 text-indigo-600 rounded"
                />
                <span className="text-slate-300">🎭 Screamer</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={specialRule === 'assassin'}
                  onChange={() => setSpecialRule(specialRule === 'assassin' ? '' : 'assassin')}
                  className="form-checkbox bg-slate-700 text-indigo-600 rounded"
                />
                <span className="text-slate-300">⚔️ Assassin</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-4 mt-6 w-full">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-300 hover:text-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md transition-colors"
          >
            Create Game
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateGameModal; 