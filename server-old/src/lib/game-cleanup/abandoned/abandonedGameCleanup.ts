import type { Game } from '../../../types/game';

/**
 * Clean up abandoned games (no human players for too long)
 */
export async function cleanupAbandonedGames(games: Game[]): Promise<void> {
  const now = Date.now();
  
  for (let i = games.length - 1; i >= 0; i--) {
    const game = games[i];
    
    // Skip league games
    if ((game as any).league) continue;
    
    // Check if game has no human players
    const hasHumanPlayers = game.players.some(p => p && p.type === 'human');
    
    if (!hasHumanPlayers && game.status !== 'FINISHED') {
      const abandonedTime = (game as any).lastHumanActivity || now;
      
      // If no human players for more than 2 minutes, remove the game
      if (now - abandonedTime > 120000) { // 2 minutes
        console.log(`[GAME CLEANUP] Removing abandoned game: ${game.id}`);
        games.splice(i, 1);
      }
    }
  }
}
