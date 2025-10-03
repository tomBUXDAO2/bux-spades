import React from 'react';

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
  partnersGamesPlayed?: number;
  partnersGamesWon?: number;
  soloGamesPlayed?: number;
  soloGamesWon?: number;
  totalCoinsWon?: number;
}

interface PlayerStatsDisplayProps {
  stats: PlayerStats;
  displayCoins: number;
}

export const PlayerStatsDisplay: React.FC<PlayerStatsDisplayProps> = ({
  stats,
  displayCoins
}) => {
  const formatSigned = (value: number) => (value > 0 ? `+${value}` : `${value}`);

  // Calculate game mode breakdown
  const gameModeBreakdown = {
    regular: `${stats.regWon || 0}/${stats.regPlayed || 0}`,
    whiz: `${stats.whizWon || 0}/${stats.whizPlayed || 0}`,
    mirror: `${stats.mirrorWon || 0}/${stats.mirrorPlayed || 0}`,
    gimmick: `${stats.gimmickWon || 0}/${stats.gimmickPlayed || 0}`
  };

  // Calculate special rules breakdown
  const specialRules = {
    screamer: `${stats.screamerWon || 0}/${stats.screamerPlayed || 0}`,
    assassin: `${stats.assassinWon || 0}/${stats.assassinPlayed || 0}`
  };

  return (
    <div className="p-6 space-y-6">
      {/* Player Info */}
      <div className="flex items-center space-x-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-gray-600 flex items-center justify-center">
          <span className="text-2xl">👤</span>
        </div>
        <div>
          <h3 className="text-2xl font-bold text-white">{(stats as any).username || 'Unknown Player'}</h3>
          <p className="text-gray-400">Coins: {displayCoins.toLocaleString()}</p>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-700 p-4 rounded-lg">
          <h4 className="text-gray-400 text-sm">Games Played</h4>
          <p className="text-2xl font-bold text-white">{stats.gamesPlayed}</p>
        </div>
        <div className="bg-slate-700 p-4 rounded-lg">
          <h4 className="text-gray-400 text-sm">Games Won</h4>
          <p className="text-2xl font-bold text-white">{stats.gamesWon}</p>
        </div>
        <div className="bg-slate-700 p-4 rounded-lg">
          <h4 className="text-gray-400 text-sm">Win Rate</h4>
          <p className="text-2xl font-bold text-white">
            {stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0}%
          </p>
        </div>
        <div className="bg-slate-700 p-4 rounded-lg">
          <h4 className="text-gray-400 text-sm">Total Coins Won</h4>
          <p className="text-2xl font-bold text-white">{formatSigned(stats.totalCoinsWon || 0)}</p>
        </div>
      </div>

      {/* Game Mode Breakdown */}
      <div className="bg-slate-700 p-4 rounded-lg">
        <h4 className="text-xl font-bold text-white mb-4">Game Mode Breakdown</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <h5 className="text-gray-400 text-sm">Regular</h5>
            <p className="text-lg font-semibold text-white">{gameModeBreakdown.regular}</p>
          </div>
          <div>
            <h5 className="text-gray-400 text-sm">Whiz</h5>
            <p className="text-lg font-semibold text-white">{gameModeBreakdown.whiz}</p>
          </div>
          <div>
            <h5 className="text-gray-400 text-sm">Mirror</h5>
            <p className="text-lg font-semibold text-white">{gameModeBreakdown.mirror}</p>
          </div>
          <div>
            <h5 className="text-gray-400 text-sm">Gimmick</h5>
            <p className="text-lg font-semibold text-white">{gameModeBreakdown.gimmick}</p>
          </div>
        </div>
      </div>

      {/* Special Rules Breakdown */}
      <div className="bg-slate-700 p-4 rounded-lg">
        <h4 className="text-xl font-bold text-white mb-4">Special Rules Breakdown</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h5 className="text-gray-400 text-sm">Screamer</h5>
            <p className="text-lg font-semibold text-white">{specialRules.screamer}</p>
          </div>
          <div>
            <h5 className="text-gray-400 text-sm">Assassin</h5>
            <p className="text-lg font-semibold text-white">{specialRules.assassin}</p>
          </div>
        </div>
      </div>

      {/* Nil Statistics */}
      <div className="bg-slate-700 p-4 rounded-lg">
        <h4 className="text-xl font-bold text-white mb-4">Nil Statistics</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <h5 className="text-gray-400 text-sm">Nils Bid</h5>
            <p className="text-lg font-semibold text-white">{stats.nilsBid}</p>
          </div>
          <div>
            <h5 className="text-gray-400 text-sm">Nils Made</h5>
            <p className="text-lg font-semibold text-white">{stats.nilsMade}</p>
          </div>
          <div>
            <h5 className="text-gray-400 text-sm">Blind Nils Bid</h5>
            <p className="text-lg font-semibold text-white">{stats.blindNilsBid}</p>
          </div>
          <div>
            <h5 className="text-gray-400 text-sm">Blind Nils Made</h5>
            <p className="text-lg font-semibold text-white">{stats.blindNilsMade}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
