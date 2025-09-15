import type { Game } from '../../../types/game';

/**
 * Remove finished games from memory
 */
export async function cleanupFinishedGamesInMemory(games: Game[]): Promise<void> {
  const now = Date.now();
  const finishedGames: number[] = [];
  
  for (let i = games.length - 1; i >= 0; i--) {
    const game = games[i];
    
    // Remove games that have been finished for more than 5 minutes
    if (game.status === 'FINISHED') {
      const finishedTime = (game as any).finishedAt || now;
      if (now - finishedTime > 300000) { // 5 minutes
        console.log(`[GAME CLEANUP] Removing finished game from memory: ${game.id}`);
        games.splice(i, 1);
        finishedGames.push(i);
      }
    }
  }
  
  if (finishedGames.length > 0) {
    console.log(`[GAME CLEANUP] Removed ${finishedGames.length} finished games from memory`);
  }
}
