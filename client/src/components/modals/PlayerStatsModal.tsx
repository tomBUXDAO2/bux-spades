import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';

interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  totalBags?: number;
  bagsPerGame?: number;
  nilsBid: number;
  nilsMade: number;
  blindNilsBid: number;
  blindNilsMade: number;
  regPlayed?: number;
  regWon?: number;
  whizPlayed?: number;
  whizWon?: number;
  mirrorPlayed?: number;
  mirrorWon?: number;
  gimmickPlayed?: number;
  gimmickWon?: number;
  screamerPlayed?: number;
  screamerWon?: number;
  assassinPlayed?: number;
  assassinWon?: number;
  // Mode-specific totals
  partnersGamesPlayed?: number;
  partnersGamesWon?: number;
  soloGamesPlayed?: number;
  soloGamesWon?: number;
  totalCoinsWon?: number; // Added for new code
}

interface Player {
  username: string;
  avatar: string;
  stats: PlayerStats
  coins?: number;
  id: string;
  status: 'friend' | 'blocked' | 'not_friend';
}

interface PlayerStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: Player | null;
}

const PlayerStatsModal: React.FC<PlayerStatsModalProps> = ({ isOpen, onClose, player }) => {
  const [mode, setMode] = useState<'all' | 'partners' | 'solo'>('all');
  const [currentStats, setCurrentStats] = useState<PlayerStats | null>(null);


  // Fetch stats when mode changes or player changes
  useEffect(() => {
    if (!isOpen || !player || !player.id) return;

    const fetchStats = async () => {
      try {
        const gameModeParam = mode === 'all' ? 'ALL' : mode.toUpperCase();
        const url = `/api/users/${player.id}/stats?gameMode=${gameModeParam}`;
        console.log('[PLAYER STATS MODAL] Fetching stats with URL:', url, 'Mode:', mode, 'GameModeParam:', gameModeParam);
        const response = await api.get(url);
        const data = await response.json();
        console.log('[PLAYER STATS MODAL] Received data:', data);
        
        // Fix: Use data.stats instead of data directly
        if (data.stats) {
          console.log('[PLAYER STATS MODAL] Using API stats:', data.stats);
          setCurrentStats(data.stats);
        } else {
          console.log('[PLAYER STATS MODAL] No stats in response, using fallback');
          setCurrentStats(player.stats);
        }
      } catch (error) {
        console.error('Error fetching player stats:', error);
        // Fallback to original stats
        setCurrentStats(player.stats);
      }
    };

    fetchStats();
  }, [isOpen, player, mode]);

  if (!isOpen || !player) return null;

  const stats = currentStats || player.stats || {
    gamesPlayed: 0,
    gamesWon: 0,
    nilsBid: 0,
    nilsMade: 0,
    blindNilsBid: 0,
    blindNilsMade: 0,
  } as any;

  const displayCoins = (stats as any)?.coins ?? player.coins ?? 0;

  // Calculate game mode breakdown
  const gameModeBreakdown = {
    regular: `${stats.regWon || 0}/${stats.regPlayed || 0}`,
    whiz: `${stats.whizWon || 0}/${stats.whizPlayed || 0}`,
    mirrors: `${stats.mirrorWon || 0}/${stats.mirrorPlayed || 0}`,
    gimmick: `${stats.gimmickWon || 0}/${stats.gimmickPlayed || 0}`
  };

  // Calculate special rules breakdown
  const specialRules = {
    screamer: `${stats.screamerWon || 0}/${stats.screamerPlayed || 0}`,
    assassin: `${stats.assassinWon || 0}/${stats.assassinPlayed || 0}`
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img src={player.avatar} alt={player.username} className="w-12 h-12 rounded-full" />
              <div>
                <h2 className="text-2xl font-bold text-white">{player.username}</h2>
                <div className="flex space-x-4 mt-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="mode"
                      value="all"
                      checked={mode === 'all'}
                      onChange={(e) => setMode(e.target.value as 'all' | 'partners' | 'solo')}
                      className="text-blue-500"
                    />
                    <span className="text-white">ALL</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="mode"
                      value="partners"
                      checked={mode === 'partners'}
                      onChange={(e) => setMode(e.target.value as 'all' | 'partners' | 'solo')}
                      className="text-blue-500"
                    />
                    <span className="text-white">PARTNERS</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="mode"
                      value="solo"
                      checked={mode === 'solo'}
                      onChange={(e) => setMode(e.target.value as 'all' | 'partners' | 'solo')}
                      className="text-blue-500"
                    />
                    <span className="text-white">SOLO</span>
                  </label>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white text-3xl hover:text-gray-300"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content - Two columns with equal height */}
        <div className="grid grid-cols-2 gap-6 p-6">
          {/* Left Column */}
          <div className="flex flex-col">
            {/* Player Profile Card */}
            <div className="bg-slate-700 rounded-lg p-6 mb-6">
              <div className="flex items-center space-x-4 mb-4">
                <img src={player.avatar} alt={player.username} className="w-16 h-16 rounded-full" />
                <h3 className="text-3xl font-bold text-white">{player.username}</h3>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-yellow-400 text-2xl">⭐</span>
                    <span className="text-2xl font-bold text-yellow-400">{Math.round((stats.gamesWon / stats.gamesPlayed) * 100)}% Win</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                    <span className="text-2xl font-bold text-yellow-400">{Number(displayCoins).toLocaleString()}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-white">🏁</div>
                    <div className="text-lg text-slate-300">Played</div>
                    <div className="text-xl font-bold text-white">{stats.gamesPlayed || 0}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-white">🏆</div>
                    <div className="text-lg text-slate-300">Won</div>
                    <div className="text-xl font-bold text-white">{stats.gamesWon || 0}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-white">🎒</div>
                    <div className="text-lg text-slate-300">Bags</div>
                    <div className="text-xl font-bold text-white">{stats.totalBags || 0}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-white">✅</div>
                    <div className="text-lg text-slate-300">Bags/G</div>
                    <div className="text-xl font-bold text-white">{stats.bagsPerGame || 0}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Nil Stats */}
            <div className="bg-slate-700 rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-4">Nil Stats</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Type</span>
                  <span className="text-slate-300">Bid</span>
                  <span className="text-slate-300">Made</span>
                  <span className="text-slate-300">%</span>
                  <span className="text-slate-300">Points</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white">Nil</span>
                  <span className="text-white">{stats.nilsBid || 0}</span>
                  <span className="text-white">{stats.nilsMade || 0}</span>
                  <span className="text-white">{Math.round((stats.nilsMade / stats.nilsBid) * 100) || 0}%</span>
                  <span className="text-white">{stats.nilsMade || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white">Blind Nil</span>
                  <span className="text-white">{stats.blindNilsBid || 0}</span>
                  <span className="text-white">{stats.blindNilsMade || 0}</span>
                  <span className="text-white">{Math.round((stats.blindNilsMade / stats.blindNilsBid) * 100) || 0}%</span>
                  <span className="text-white">{stats.blindNilsMade || 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="flex flex-col">
            {/* Game Mode Breakdown */}
            <div className="bg-slate-700 rounded-lg p-6 mb-6">
              <h3 className="text-xl font-bold text-white mb-4">Game Mode Breakdown</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Regular</span>
                  <span className="text-white">{gameModeBreakdown.regular}</span>
                  <span className="text-white">{Math.round(((stats.regWon || 0) / (stats.regPlayed || 1)) * 100)}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Whiz</span>
                  <span className="text-white">{gameModeBreakdown.whiz}</span>
                  <span className="text-white">{Math.round(((stats.whizWon || 0) / (stats.whizPlayed || 1)) * 100)}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Mirrors</span>
                  <span className="text-white">{gameModeBreakdown.mirrors}</span>
                  <span className="text-white">{Math.round(((stats.mirrorWon || 0) / (stats.mirrorPlayed || 1)) * 100)}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Gimmick</span>
                  <span className="text-white">{gameModeBreakdown.gimmick}</span>
                  <span className="text-white">{Math.round(((stats.gimmickWon || 0) / (stats.gimmickPlayed || 1)) * 100)}%</span>
                </div>
              </div>
            </div>

            {/* Special Rules */}
            <div className="bg-slate-700 rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-4">Special Rules</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Screamer</span>
                  <span className="text-white">{specialRules.screamer}</span>
                  <span className="text-white">{Math.round(((stats.screamerWon || 0) / (stats.screamerPlayed || 1)) * 100)}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Assassin</span>
                  <span className="text-white">{specialRules.assassin}</span>
                  <span className="text-white">{Math.round(((stats.assassinWon || 0) / (stats.assassinPlayed || 1)) * 100)}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlayerStatsModal;
