import React, { useState } from 'react';
import type { GameSettings } from '../../../../shared/types/game';

interface CreateGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateGame: (settings: GameSettings) => void;
}

const CreateGameModal: React.FC<CreateGameModalProps> = ({ isOpen, onClose, onCreateGame }) => {
  const [settings, setSettings] = useState<GameSettings>({
    gameMode: 'regular',
    playMode: 'partners',
    minPoints: -100,
    maxPoints: 500,
    buyIn: 100000,
    specialRules: {
      screamer: false,
      assassin: false,
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold text-slate-200 mb-6">Create Game</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-slate-300 mb-2">Game Mode</label>
            <select
              value={settings.gameMode}
              onChange={(e) => setSettings({ ...settings, gameMode: e.target.value as GameSettings['gameMode'] })}
              className="w-full bg-slate-700 text-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="regular">Regular</option>
              <option value="whiz">Whiz</option>
              <option value="mirrors">Mirrors</option>
              <option value="gimmick">Gimmick</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-300 mb-2">Play Mode</label>
            <select
              value={settings.playMode}
              onChange={(e) => setSettings({ ...settings, playMode: e.target.value as GameSettings['playMode'] })}
              className="w-full bg-slate-700 text-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="partners">Partners</option>
              <option value="solo">Solo</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-300 mb-2">Points Range</label>
            <div className="flex gap-4">
              <input
                type="number"
                value={settings.minPoints}
                onChange={(e) => setSettings({ ...settings, minPoints: parseInt(e.target.value) })}
                min={-250}
                max={-100}
                className="w-1/2 bg-slate-700 text-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Min Points"
              />
              <input
                type="number"
                value={settings.maxPoints}
                onChange={(e) => setSettings({ ...settings, maxPoints: parseInt(e.target.value) })}
                min={100}
                max={650}
                className="w-1/2 bg-slate-700 text-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Max Points"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 mb-2">Buy-in (min 100k, 50k increments)</label>
            <input
              type="number"
              value={settings.buyIn}
              onChange={(e) => {
                const value = Math.max(100000, Math.round(parseInt(e.target.value) / 50000) * 50000);
                setSettings({ ...settings, buyIn: value });
              }}
              min={100000}
              step={50000}
              className="w-full bg-slate-700 text-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-2">Special Rules</label>
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.specialRules.screamer}
                  onChange={(e) => setSettings({
                    ...settings,
                    specialRules: { ...settings.specialRules, screamer: e.target.checked }
                  })}
                  className="form-checkbox bg-slate-700 text-indigo-600 rounded"
                />
                <span className="text-slate-300">Screamer</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={settings.specialRules.assassin}
                  onChange={(e) => setSettings({
                    ...settings,
                    specialRules: { ...settings.specialRules, assassin: e.target.checked }
                  })}
                  className="form-checkbox bg-slate-700 text-indigo-600 rounded"
                />
                <span className="text-slate-300">Assassin</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-4 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-300 hover:text-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onCreateGame(settings)}
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