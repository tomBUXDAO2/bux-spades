import type { Game } from '../../../types/game';
import { CrashPrevention } from '../../crashPrevention';

/**
 * Get monitoring statistics
 */
export function getMonitoringStats(games: Game[]): {
  totalGames: number;
  ratedGames: number;
  leagueGames: number;
  protectedGames: number;
  issues: string[];
} {
  const ratedGames = games.filter(g => g.rated);
  const leagueGames = games.filter(g => (g as any).league);
  const protectedGames = games.filter(g => g.rated || (g as any).league);
  
  const issues: string[] = [];
  
  protectedGames.forEach(game => {
    const validation = CrashPrevention.validateGameIntegrity(game);
    if (!validation.isValid) {
      issues.push(`Game ${game.id}: ${validation.issues.join(', ')}`);
    }
  });

  return {
    totalGames: games.length,
    ratedGames: ratedGames.length,
    leagueGames: leagueGames.length,
    protectedGames: protectedGames.length,
    issues
  };
}
