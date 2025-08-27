import { useState, useEffect } from 'react';
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
  totalCoins?: number; // Added for new code
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
  player: Player;
  isOpen: boolean;
  onClose: () => void;
}

export default function PlayerStatsModal({ player, isOpen, onClose }: PlayerStatsModalProps) {
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

  const winPercentage = stats.gamesPlayed ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;

  // Game mode breakdown stats
  const gameModeBreakdown = {
    regular: { played: stats.regPlayed ?? 0, won: stats.regWon ?? 0 },
    whiz: { played: stats.whizPlayed ?? 0, won: stats.whizWon ?? 0 },
    mirrors: { played: stats.mirrorPlayed ?? 0, won: stats.mirrorWon ?? 0 },
    gimmick: { played: stats.gimmickPlayed ?? 0, won: stats.gimmickWon ?? 0 }
  };

  const specialRules = {
    screamer: { played: stats.screamerPlayed ?? 0, won: stats.screamerWon ?? 0 },
    assassin: { played: stats.assassinPlayed ?? 0, won: stats.assassinWon ?? 0 }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Close button */}
          <div className="flex justify-end mb-4">
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white text-2xl font-bold"
            >
              ×
            </button>
          </div>

          {/* Radio buttons - centered, no gap above */}
          <div className="flex justify-center mb-6">
            <div className="flex space-x-6">
              <label className="flex items-center space-x-2 cursor-pointer">
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
              <label className="flex items-center space-x-2 cursor-pointer">
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
              <label className="flex items-center space-x-2 cursor-pointer">
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
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left column */}
            <div className="flex flex-col">
              {/* Main stats */}
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-yellow-400">{winPercentage}%</div>
                    <div className="text-sm text-slate-300">Win</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-yellow-400">{stats.totalCoins?.toLocaleString() || '0'}</div>
                    <div className="text-sm text-slate-300">Coins</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-400">{stats.gamesPlayed || 0}</div>
                    <div className="text-sm text-slate-300">Played</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-400">{stats.gamesWon || 0}</div>
                    <div className="text-sm text-slate-300">Won</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-400">{stats.totalBags || 0}</div>
                    <div className="text-sm text-slate-300">Bags</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-orange-400">{stats.bagsPerGame?.toFixed(1) || '0.0'}</div>
                    <div className="text-sm text-slate-300">Bags/G</div>
                  </div>
                </div>
              </div>

              {/* Nil Stats - Horizontal inline layout */}
              <div className="bg-slate-700 rounded-lg p-4">
                <h3 className="text-xl font-bold text-white mb-4">Nil Stats</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300">Nil:</span>
                    <div className="flex space-x-4">
                      <span className="text-white">{stats.nilsBid || 0} bid</span>
                      <span className="text-white">{stats.nilsMade || 0} made</span>
                      <span className="text-white">{stats.nilsBid ? Math.round((stats.nilsMade / stats.nilsBid) * 100) : 0}%</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300">Blind Nil:</span>
                    <div className="flex space-x-4">
                      <span className="text-white">{stats.blindNilsBid || 0} bid</span>
                      <span className="text-white">{stats.blindNilsMade || 0} made</span>
                      <span className="text-white">{stats.blindNilsBid ? Math.round((stats.blindNilsMade / stats.blindNilsBid) * 100) : 0}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="flex flex-col">
              {/* Game Mode Breakdown */}
              <div className="bg-slate-700 rounded-lg p-6 mb-6">
                <h3 className="text-3xl font-bold text-white mb-6">Game Mode Breakdown</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-lg text-slate-300">Regular</span>
                    <span className="text-lg text-white">{gameModeBreakdown.regular.won}/{gameModeBreakdown.regular.played}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-lg text-slate-300">Whiz</span>
                    <span className="text-lg text-white">{gameModeBreakdown.whiz.won}/{gameModeBreakdown.whiz.played}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-lg text-slate-300">Mirrors</span>
                    <span className="text-lg text-white">{gameModeBreakdown.mirrors.won}/{gameModeBreakdown.mirrors.played}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-lg text-slate-300">Gimmick</span>
                    <span className="text-lg text-white">{gameModeBreakdown.gimmick.won}/{gameModeBreakdown.gimmick.played}</span>
                  </div>
                </div>
              </div>

              {/* Special Rules */}
              <div className="bg-slate-700 rounded-lg p-4">
                <h3 className="text-xl font-bold text-white mb-3">Special Rules</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300">Screamer</span>
                    <span className="text-white">{specialRules.screamer.won}/{specialRules.screamer.played}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300">Assassin</span>
                    <span className="text-white">{specialRules.assassin.won}/{specialRules.assassin.played}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 