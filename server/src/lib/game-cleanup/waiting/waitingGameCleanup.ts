import { prisma } from '../../../lib/prisma';
import type { Server } from 'socket.io';

/**
 * Clean up WAITING games that have been waiting too long (15 minutes)
 */
export async function cleanupWaitingGames(games: any[], io?: Server): Promise<void> {
  const now = new Date();
  const WAITING_TIMEOUT = 15 * 60 * 1000; // 15 minutes
  
  try {
    // Find games that have been waiting too long
    const oldGames = await prisma.game.findMany({
      where: {
        status: 'WAITING',
        createdAt: {
          lt: new Date(now.getTime() - WAITING_TIMEOUT)
        }
      }
    });
    
    for (const game of oldGames) {
      console.log(`[WAITING GAME CLEANUP] Removing game that has been waiting too long: ${game.id}`);
      
      // Delete the game from database
      await prisma.game.delete({
        where: { id: game.id }
      });
      
      console.log(`[WAITING GAME CLEANUP] Successfully cleaned up game: ${game.id}`);
      
      // Notify any connected players that the game was closed
      if (io) {
        io.to(game.id).emit('game_closed', { 
          gameId: game.id, 
          reason: 'game_timeout_waiting_too_long' 
        });
      }
    }
    
    if (oldGames.length > 0) {
      console.log(`[WAITING GAME CLEANUP] Cleaned up ${oldGames.length} old waiting games`);
    }
  } catch (error) {
    console.error('[WAITING GAME CLEANUP] Error cleaning up waiting games:', error);
  }
}
