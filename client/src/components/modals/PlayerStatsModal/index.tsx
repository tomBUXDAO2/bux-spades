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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-xl border border-white/10 bg-slate-950/95 shadow-lobby backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-6">
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
