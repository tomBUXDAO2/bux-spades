import prisma from '../../prisma';
import type { Game } from '../../../types/game';

/**
 * Clean up stuck games in database
 */
export async function cleanupStuckDatabaseGames(): Promise<void> {
  try {
    const stuckGames = await prisma.game.findMany({
      where: {
        status: {
          in: ['PLAYING']
        },
        updatedAt: {
          lt: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
        }
      }
    });

    for (const stuckGame of stuckGames) {
      console.log(`[GAME CLEANUP] Found stuck game in DB: ${stuckGame.id}`);
      
      // Mark as finished
      await prisma.game.update({
        where: { id: stuckGame.id },
        data: {
          status: 'FINISHED'
        }
      });
      
      console.log(`[GAME CLEANUP] Marked stuck game as finished: ${stuckGame.id}`);
    }
  } catch (error) {
    console.error('[GAME CLEANUP] Error cleaning up stuck database games:', error);
  }
}

/**
 * Clean up orphaned games (in DB but not in memory)
 */
export async function cleanupOrphanedGames(games: Game[]): Promise<void> {
  try {
    const memoryGameIds = new Set(games.map(g => g.id));
    
    const orphanedGames = await prisma.game.findMany({
      where: {
        status: {
          in: ['PLAYING']
        },
        updatedAt: {
          lt: new Date(Date.now() - 15 * 60 * 1000) // 15 minutes ago
        }
      }
    });

    for (const orphanedGame of orphanedGames) {
      if (!memoryGameIds.has(orphanedGame.id)) {
        console.log(`[GAME CLEANUP] Found orphaned game: ${orphanedGame.id}`);
        
        // Mark as finished
        await prisma.game.update({
          where: { id: orphanedGame.id },
          data: {
            status: 'FINISHED'
          }
        });
        
        console.log(`[GAME CLEANUP] Marked orphaned game as finished: ${orphanedGame.id}`);
      }
    }
  } catch (error) {
    console.error('[GAME CLEANUP] Error cleaning up orphaned games:', error);
  }
}

/**
 * Force cleanup a specific game
 */
export async function forceCleanupGame(gameId: string, games: Game[]): Promise<void> {
  try {
    console.log(`[GAME CLEANUP] Force cleaning up game: ${gameId}`);
    
    // Remove from memory
    const gameIndex = games.findIndex(g => g.id === gameId);
    if (gameIndex !== -1) {
      games.splice(gameIndex, 1);
      console.log(`[GAME CLEANUP] Removed game from memory: ${gameId}`);
    }
    
    // Mark as finished in database
    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: 'FINISHED'
      }
    });
    
    console.log(`[GAME CLEANUP] Marked game as finished in database: ${gameId}`);
  } catch (error) {
    console.error(`[GAME CLEANUP] Error force cleaning up game ${gameId}:`, error);
  }
}
