import React, { useState } from 'react';
import { usePlayerStatsData } from './hooks/PlayerStatsData';
import { PlayerStatsModeSelector } from './components/PlayerStatsModeSelector';
import { PlayerStatsDisplay } from './components/PlayerStatsDisplay';

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

interface Player {
  username: string;
  avatar: string;
  stats: PlayerStats;
  status: 'friend' | 'blocked' | 'not_friend';
  coins?: number;
  id?: string;
}

interface PlayerStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: Player | null;
}

const PlayerStatsModal: React.FC<PlayerStatsModalProps> = ({ 
  isOpen, 
  onClose, 
  player 
}) => {
  const [mode, setMode] = useState<'all' | 'partners' | 'solo'>('all');
  
  const { currentStats } = usePlayerStatsData(isOpen, player, mode);

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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-600">
          <h2 className="text-3xl font-bold text-white">Player Stats</h2>
          
          {/* Radio buttons and close button */}
          <div className="flex items-center space-x-6">
            <PlayerStatsModeSelector
              mode={mode}
              onModeChange={setMode}
            />
            
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl font-bold"
            >
              ×
            </button>
          </div>
        </div>

        {/* Stats Display */}
        <PlayerStatsDisplay
          stats={stats}
          displayCoins={displayCoins}
        />
      </div>
    </div>
  );
};

export default PlayerStatsModal;
