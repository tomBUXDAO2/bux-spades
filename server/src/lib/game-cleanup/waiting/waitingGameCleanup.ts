import type { Game } from '../../../types/game';
import { deleteUnratedGameFromDatabase } from '../../hand-completion/game/gameCompletion';
import type { Server } from 'socket.io';

/**
 * Clean up WAITING games that have been waiting too long (15 minutes)
 */
export async function cleanupWaitingGames(games: Game[], io?: Server): Promise<void> {
  const now = Date.now();
  const WAITING_TIMEOUT = 15 * 60 * 1000; // 15 minutes
  
  for (let i = games.length - 1; i >= 0; i--) {
    const game = games[i];
    
    // Only process WAITING games
    if (game.status !== 'WAITING') continue;
    
    // Skip league games
    if ((game as any).league) continue;
    
    // Check if game has been waiting too long
    const waitingTime = now - game.createdAt;
    if (waitingTime > WAITING_TIMEOUT) {
      console.log(`[WAITING GAME CLEANUP] Removing game that has been waiting too long: ${game.id} (${Math.round(waitingTime / 1000 / 60)} minutes)`);
      
      // Get bot players before removing the game
      const botPlayers = game.players.filter(p => p && p.type === 'bot');
      
      // Remove game from memory
      games.splice(i, 1);
      
      // Clean up database if it's an unrated game
      if (!game.rated && game.dbGameId) {
        console.log(`[WAITING GAME CLEANUP] Cleaning up unrated game from database: ${game.dbGameId}`);
        try {
          await deleteUnratedGameFromDatabase(game);
          console.log(`[WAITING GAME CLEANUP] Successfully cleaned up unrated game: ${game.dbGameId}`);
        } catch (error) {
          console.error(`[WAITING GAME CLEANUP] Failed to clean up unrated game: ${game.dbGameId}`, error);
        }
      } else if (game.rated && game.dbGameId) {
        // For rated games, just mark as cancelled in database
        console.log(`[WAITING GAME CLEANUP] Marking rated game as cancelled: ${game.dbGameId}`);
        try {
          const { prisma } = await import('../../prisma');
          await prisma.game.update({
            where: { id: game.dbGameId },
            data: {
              status: 'FINISHED',
              cancelled: true,
              completed: true,
              updatedAt: new Date()
            }
          });
          console.log(`[WAITING GAME CLEANUP] Successfully marked rated game as cancelled: ${game.dbGameId}`);
        } catch (error) {
          console.error(`[WAITING GAME CLEANUP] Failed to mark rated game as cancelled: ${game.dbGameId}`, error);
        }
      }
      
      // Notify any connected players that the game was closed
      if (io) {
        io.to(game.id).emit('game_closed', { 
          gameId: game.id, 
          reason: 'game_timeout_waiting_too_long' 
        });
      }
      
      console.log(`[WAITING GAME CLEANUP] Removed ${botPlayers.length} bot players and cleaned up game: ${game.id}`);
    }
  }
}
