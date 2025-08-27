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

  const winPercent = stats.gamesPlayed ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;
  const nilPercent = stats.nilsBid ? Math.round((stats.nilsMade / stats.nilsBid) * 100) : 0;
  const blindNilPercent = stats.blindNilsBid ? Math.round((stats.blindNilsMade / stats.blindNilsBid) * 100) : 0;

  // Game mode breakdown stats
  const regPlayed = stats.regPlayed ?? 0;
  const regWon = stats.regWon ?? 0;
  const whizPlayed = stats.whizPlayed ?? 0;
  const whizWon = stats.whizWon ?? 0;
  const mirrorPlayed = stats.mirrorPlayed ?? 0;
  const mirrorWon = stats.mirrorWon ?? 0;
  const gimmickPlayed = stats.gimmickPlayed ?? 0;
  const gimmickWon = stats.gimmickWon ?? 0;
  const screamerPlayed = stats.screamerPlayed ?? 0;
  const screamerWon = stats.screamerWon ?? 0;
  const assassinPlayed = stats.assassinPlayed ?? 0;
  const assassinWon = stats.assassinWon ?? 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header with radio buttons - full width */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex justify-end mb-4">
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white text-2xl"
            >
              ×
            </button>
          </div>
          
          {/* Radio buttons - centered */}
          <div className="flex justify-center gap-6">
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="all"
                checked={mode === 'all'}
                onChange={(e) => setMode(e.target.value as 'all' | 'partners' | 'solo')}
                className="w-5 h-5 text-indigo-600 bg-slate-700 border-slate-600 focus:ring-indigo-500"
              />
              <span className="ml-3 text-lg font-semibold text-white">ALL</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="partners"
                checked={mode === 'partners'}
                onChange={(e) => setMode(e.target.value as 'all' | 'partners' | 'solo')}
                className="w-5 h-5 text-indigo-600 bg-slate-700 border-slate-600 focus:ring-indigo-500"
              />
              <span className="ml-3 text-lg font-semibold text-white">PARTNERS</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="solo"
                checked={mode === 'solo'}
                onChange={(e) => setMode(e.target.value as 'all' | 'partners' | 'solo')}
                className="w-5 h-5 text-indigo-600 bg-slate-700 border-slate-600 focus:ring-indigo-500"
              />
              <span className="ml-3 text-lg font-semibold text-white">SOLO</span>
            </label>
          </div>
        </div>

        {/* Main content - two columns with equal height */}
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
            
            {/* Left Column - Shaded stats + Nil stats */}
            <div className="flex flex-col space-y-6">
              {/* Shaded stats div - only left half */}
              <div className="bg-slate-700 rounded-lg p-6">
                <div className="flex items-center mb-4">
                  <img
                    src={player.avatar}
                    alt={player.username}
                    className="w-16 h-16 rounded-full mr-4"
                  />
                  <div>
                    <h3 className="text-xl font-bold text-white">{player.username}</h3>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center text-lg font-bold text-yellow-400">
                    <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                    {winPercent}% Win
                  </div>
                  <div className="flex items-center text-lg font-bold text-yellow-400">
                    <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                    {(typeof player.coins === 'number' ? player.coins : 0).toLocaleString()}
                  </div>
                  <div className="flex items-center text-lg font-bold text-indigo-400">
                    <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6zm16 0a2 2 0 0 0-2-2h-1v16h1a2 2 0 0 0 2-2V6zm-7 2a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
                    </svg>
                    {stats.gamesPlayed} Played
                  </div>
                  <div className="flex items-center text-lg font-bold text-yellow-400">
                    <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M2 7l5 5 5-9 5 9 5-5-2 13H4L2 7zm4.24 11h11.52l1.26-8.18-3.5 3.5-3.52-6.34-3.52 6.34-3.5-3.5L6.24 18z"/>
                    </svg>
                    {stats.gamesWon} Won
                  </div>
                  <div className="flex items-center text-lg font-bold text-orange-400">
                    <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                    {stats.totalBags || 0} Bags
                  </div>
                  <div className="flex items-center text-lg font-bold text-orange-300">
                    <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    {(stats.bagsPerGame || 0).toFixed(1)} Bags/G
                  </div>
                </div>
              </div>

              {/* Nil Stats - larger and clearer with vertical line */}
              <div className="bg-slate-700 rounded-lg p-6 flex-1">
                <h3 className="text-xl font-bold text-indigo-400 mb-4 text-center">Nil Stats</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white mb-2">{stats.nilsBid}</div>
                    <div className="text-lg text-slate-300">Nils Bid</div>
                    <div className="text-2xl font-bold text-white mb-2 mt-4">{stats.nilsMade}</div>
                    <div className="text-lg text-slate-300">Nils Made</div>
                  </div>
                  <div className="text-center relative">
                    {/* Vertical line separator */}
                    <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-600"></div>
                    <div className="text-2xl font-bold text-white mb-2">{stats.blindNilsBid}</div>
                    <div className="text-lg text-slate-300">Blind Nils Bid</div>
                    <div className="text-2xl font-bold text-white mb-2 mt-4">{stats.blindNilsMade}</div>
                    <div className="text-lg text-slate-300">Blind Nils Made</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-6 mt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">{nilPercent}%</div>
                    <div className="text-lg text-slate-300">Nils % Made</div>
                  </div>
                  <div className="text-center relative">
                    {/* Vertical line separator */}
                    <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-600"></div>
                    <div className="text-2xl font-bold text-green-400">{blindNilPercent}%</div>
                    <div className="text-lg text-slate-300">Blind Nils % Made</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Game modes + Special rules */}
            <div className="flex flex-col space-y-6">
              {/* Game Mode Breakdown - taller with more spacing */}
              <div className="bg-slate-700 rounded-lg p-6 flex-1">
                <h3 className="text-xl font-bold text-indigo-400 mb-6 text-center">Game Mode Breakdown</h3>
                <div className="text-lg text-slate-400 text-center mb-6">(won/played)</div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="text-center">
                    <div className="text-lg font-semibold text-slate-200 mb-4">Regular</div>
                    <div className="text-3xl font-bold text-slate-100">{regWon}/{regPlayed}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-slate-200 mb-4">Whiz</div>
                    <div className="text-3xl font-bold text-slate-100">{whizWon}/{whizPlayed}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-slate-200 mb-4">Mirrors</div>
                    <div className="text-3xl font-bold text-slate-100">{mirrorWon}/{mirrorPlayed}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-slate-200 mb-4">Gimmick</div>
                    <div className="text-3xl font-bold text-slate-100">{gimmickWon}/{gimmickPlayed}</div>
                  </div>
                </div>
              </div>

              {/* Special Rules - more compact */}
              <div className="bg-slate-700 rounded-lg p-4">
                <h3 className="text-xl font-bold text-indigo-400 mb-3 text-center">Special Rules</h3>
                <div className="text-lg text-slate-400 text-center mb-3">(won/played)</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-lg font-semibold text-slate-200 mb-1">Screamer</div>
                    <div className="text-2xl font-bold text-slate-100">{screamerWon}/{screamerPlayed}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-slate-200 mb-1">Assassin</div>
                    <div className="text-2xl font-bold text-slate-100">{assassinWon}/{assassinPlayed}</div>
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