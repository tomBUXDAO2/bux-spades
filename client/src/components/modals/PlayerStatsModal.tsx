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
  stats: PlayerStats;
  status: 'friend' | 'blocked' | 'not_friend';
  coins?: number;
  id?: string; // Add id for API calls
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
        const stats = await response.json();
        console.log('[PLAYER STATS MODAL] Received stats:', stats);
        setCurrentStats(stats);
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
  };

  const winPercentage = stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-8 max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header with close button and radio buttons on same row */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex space-x-6">
            <label className="flex items-center space-x-3">
              <input
                type="radio"
                name="gameMode"
                value="all"
                checked={mode === 'all'}
                onChange={() => setMode('all')}
                className="w-5 h-5 text-blue-600 bg-slate-700 border-slate-600 focus:ring-blue-500"
              />
              <span className="text-lg text-white">ALL</span>
            </label>
            <label className="flex items-center space-x-3">
              <input
                type="radio"
                name="gameMode"
                value="partners"
                checked={mode === 'partners'}
                onChange={() => setMode('partners')}
                className="w-5 h-5 text-blue-600 bg-slate-700 border-slate-600 focus:ring-blue-500"
              />
              <span className="text-lg text-white">PARTNERS</span>
            </label>
            <label className="flex items-center space-x-3">
              <input
                type="radio"
                name="gameMode"
                value="solo"
                checked={mode === 'solo'}
                onChange={() => setMode('solo')}
                className="w-5 h-5 text-blue-600 bg-slate-700 border-slate-600 focus:ring-blue-500"
              />
              <span className="text-lg text-white">SOLO</span>
            </label>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl font-bold"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column */}
          <div className="flex flex-col">
            {/* Main Stats */}
            <div className="bg-slate-700 rounded-lg p-6 mb-6">
              <div className="flex items-center space-x-4 mb-4">
                <img
                  src={player.avatar || '/default-pfp.jpg'}
                  alt={player.username}
                  className="w-16 h-16 rounded-full"
                />
                <div>
                  <h2 className="text-2xl font-bold text-white">{player.username}</h2>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-lg">
                <div className="flex items-center space-x-2">
                  <span className="text-yellow-400">⭐</span>
                  <span className="text-white">{winPercentage}% Win</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-yellow-400">🪙</span>
                  <span className="text-white">{stats.totalCoinsWon?.toLocaleString() || 0}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-blue-400">📊</span>
                  <span className="text-white">{stats.gamesPlayed} Played</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-yellow-400">🏆</span>
                  <span className="text-white">{stats.gamesWon} Won</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-green-400">👜</span>
                  <span className="text-white">{stats.totalBags} Bags</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-green-400">✓</span>
                  <span className="text-white">{stats.bagsPerGame?.toFixed(1) || 0} Bags/G</span>
                </div>
              </div>
            </div>

            {/* Nil Stats Table */}
            <div className="bg-slate-700 rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-4">Nil Stats</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-white">
                  <thead>
                    <tr className="border-b border-slate-600">
                      <th className="text-left py-2 px-2">Type</th>
                      <th className="text-center py-2 px-2">Bid</th>
                      <th className="text-center py-2 px-2">Made</th>
                      <th className="text-center py-2 px-2">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-600">
                      <td className="py-2 px-2">Nil</td>
                      <td className="text-center py-2 px-2">{stats.nilsBid || 0}</td>
                      <td className="text-center py-2 px-2">{stats.nilsMade || 0}</td>
                      <td className="text-center py-2 px-2">{stats.nilsBid && stats.nilsMade ? Math.round((stats.nilsMade / stats.nilsBid) * 100) : 0}%</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-2">Blind Nil</td>
                      <td className="text-center py-2 px-2">{stats.blindNilsBid || 0}</td>
                      <td className="text-center py-2 px-2">{stats.blindNilsMade || 0}</td>
                      <td className="text-center py-2 px-2">{stats.blindNilsBid && stats.blindNilsMade ? Math.round((stats.blindNilsMade / stats.blindNilsBid) * 100) : 0}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="flex flex-col">
            {/* Game Mode Breakdown */}
            <div className="bg-slate-700 rounded-lg p-6 mb-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-3xl font-bold text-white">Game Mode Breakdown</h3>
                <div className="text-slate-300 text-lg">
                  <span className="mr-4">(won/played)</span>
                  <span>(win %)</span>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xl text-white">Regular</span>
                  <div className="flex space-x-8">
                    <span className="text-xl text-white">{gameModeBreakdown.regular}</span>
                    <span className="text-xl text-white">{stats.regPlayed ? Math.round((stats.regWon / stats.regPlayed) * 100) : 0}%</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xl text-white">Whiz</span>
                  <div className="flex space-x-8">
                    <span className="text-xl text-white">{gameModeBreakdown.whiz}</span>
                    <span className="text-xl text-white">{stats.whizPlayed ? Math.round((stats.whizWon / stats.whizPlayed) * 100) : 0}%</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xl text-white">Mirrors</span>
                  <div className="flex space-x-8">
                    <span className="text-xl text-white">{gameModeBreakdown.mirrors}</span>
                    <span className="text-xl text-white">{stats.mirrorPlayed ? Math.round((stats.mirrorWon / stats.mirrorPlayed) * 100) : 0}%</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xl text-white">Gimmick</span>
                  <div className="flex space-x-8">
                    <span className="text-xl text-white">{gameModeBreakdown.gimmick}</span>
                    <span className="text-xl text-white">{stats.gimmickPlayed ? Math.round((stats.gimmickWon / stats.gimmickPlayed) * 100) : 0}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Special Rules */}
            <div className="bg-slate-700 rounded-lg p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xl font-bold text-white">Special Rules</h3>
                <div className="text-slate-300 text-lg">
                  <span className="mr-4">(won/played)</span>
                  <span>(win %)</span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-lg text-white">Screamer</span>
                  <div className="flex space-x-8">
                    <span className="text-lg text-white">{specialRules.screamer}</span>
                    <span className="text-lg text-white">{stats.screamerPlayed ? Math.round((stats.screamerWon / stats.screamerPlayed) * 100) : 0}%</span>
                  </div>
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