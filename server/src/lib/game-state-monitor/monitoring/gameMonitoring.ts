import type { Game } from '../../../types/game';
import { CrashPrevention } from "../../../../lib/crash-prevention";
import { monitorGame } from './individualGameMonitoring';

/**
 * Monitor all games for issues
 */
export async function monitorGames(games: Game[]): Promise<void> {
  const ratedGames = games.filter(g => g.rated || (g as any).league);
  
  if (ratedGames.length === 0) {
    return; // No rated games to monitor
  }

  console.log(`[GAME MONITOR] Monitoring ${ratedGames.length} rated/league games`);

  for (const game of ratedGames) {
    try {
      await monitorGame(game);
    } catch (error) {
      console.error(`[GAME MONITOR] Error monitoring game ${game.id}:`, error);
    }
  }
}
