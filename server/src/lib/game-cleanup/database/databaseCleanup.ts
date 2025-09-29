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
      // Do NOT auto-finish here; just log for observability
      // Optionally, we could ping or set a heartbeat marker
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
        // Do NOT auto-finish; manual/explicit finish only
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
    
  // Do NOT change DB status here implicitly
  console.log(`[GAME CLEANUP] Skipped DB FINISHED transition for: ${gameId}`);
  } catch (error) {
    console.error(`[GAME CLEANUP] Error force cleaning up game ${gameId}:`, error);
  }
}
