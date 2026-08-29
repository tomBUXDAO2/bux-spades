import { useState, useEffect } from 'react';
import { api } from "../../../../services/lib/api";

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

export const usePlayerStatsData = (
  isOpen: boolean,
  player: Player | null,
  mode: 'all' | 'partners' | 'solo',
  leagueId?: string
) => {
  const [currentStats, setCurrentStats] = useState<PlayerStats | null>(null);

  useEffect(() => {
    if (!isOpen || !player || !player.id) return;

    const fetchStats = async () => {
      try {
        const gameModeParam = mode === 'all' ? 'ALL' : mode.toUpperCase();
        const leagueParam = leagueId ? `&leagueId=${encodeURIComponent(leagueId)}` : '';
        const url = `/api/users/${player.id}/stats?gameMode=${gameModeParam}${leagueParam}`;
        const response = await api.get(url);
        const data = await response.json();
        const raw = data.data || data.stats || data;
        // Map DetailedStatsService shape onto modal fields when needed
        const mapped: PlayerStats = {
          gamesPlayed: raw.gamesPlayed ?? raw.totalGames ?? 0,
          gamesWon: raw.gamesWon ?? 0,
          totalBags: raw.totalBags ?? raw.bags?.total,
          bagsPerGame: raw.bagsPerGame ?? raw.bags?.perGame,
          nilsBid: raw.nilsBid ?? raw.nils?.bid ?? 0,
          nilsMade: raw.nilsMade ?? raw.nils?.made ?? 0,
          blindNilsBid: raw.blindNilsBid ?? raw.blindNils?.bid ?? 0,
          blindNilsMade: raw.blindNilsMade ?? raw.blindNils?.made ?? 0,
          regPlayed: raw.regPlayed ?? raw.formatBreakdown?.regular?.played,
          regWon: raw.regWon ?? raw.formatBreakdown?.regular?.won,
          whizPlayed: raw.whizPlayed ?? raw.formatBreakdown?.whiz?.played,
          whizWon: raw.whizWon ?? raw.formatBreakdown?.whiz?.won,
          mirrorPlayed: raw.mirrorPlayed ?? raw.formatBreakdown?.mirror?.played,
          mirrorWon: raw.mirrorWon ?? raw.formatBreakdown?.mirror?.won,
          gimmickPlayed: raw.gimmickPlayed ?? raw.formatBreakdown?.gimmick?.played,
          gimmickWon: raw.gimmickWon ?? raw.formatBreakdown?.gimmick?.won,
          partnersGamesPlayed: raw.partnersGamesPlayed ?? raw.modeBreakdown?.partners?.played,
          partnersGamesWon: raw.partnersGamesWon ?? raw.modeBreakdown?.partners?.won,
          soloGamesPlayed: raw.soloGamesPlayed ?? raw.modeBreakdown?.solo?.played,
          soloGamesWon: raw.soloGamesWon ?? raw.modeBreakdown?.solo?.won,
          totalCoinsWon: raw.totalCoinsWon ?? raw.totalCoins,
          screamerPlayed: raw.screamerPlayed,
          screamerWon: raw.screamerWon,
          assassinPlayed: raw.assassinPlayed,
          assassinWon: raw.assassinWon
        };
        setCurrentStats(mapped);
      } catch (error) {
        console.error('Error fetching player stats:', error);
        setCurrentStats(player.stats);
      }
    };

    fetchStats();
  }, [isOpen, player, mode, leagueId]);

  return {
    currentStats,
    setCurrentStats
  };
};
