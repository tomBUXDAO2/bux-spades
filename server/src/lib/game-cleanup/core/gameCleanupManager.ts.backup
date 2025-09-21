import type { Game } from '../../../types/game';
import { cleanupFinishedGamesInMemory } from '../memory/memoryCleanup';
import { cleanupStuckDatabaseGames, cleanupOrphanedGames } from '../database/databaseCleanup';
import { cleanupAbandonedGames } from '../abandoned/abandonedGameCleanup';
import { forceCleanupGame } from '../database/databaseCleanup';

/**
 * Comprehensive game cleanup and state management
 */
export class GameCleanupManager {
  private static instance: GameCleanupManager;
  private cleanupInterval: NodeJS.Timeout | null = null;

  public static getInstance(): GameCleanupManager {
    if (!GameCleanupManager.instance) {
      GameCleanupManager.instance = new GameCleanupManager();
    }
    return GameCleanupManager.instance;
  }

  /**
   * Start the cleanup system
   */
  public startCleanup(games: Game[]): void {
    console.log('[GAME CLEANUP] Starting comprehensive game cleanup system');
    
    // Run cleanup every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.performCleanup(games);
    }, 30000);
  }

  /**
   * Stop the cleanup system
   */
  public stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Perform comprehensive cleanup
   */
  private async performCleanup(games: Game[]): Promise<void> {
    try {
      console.log('[GAME CLEANUP] Starting cleanup cycle...');
      
      // 1. Clean up memory games that are finished but still in memory
      await cleanupFinishedGamesInMemory(games);
      
      // 2. Clean up database games that are stuck
      await cleanupStuckDatabaseGames();
      
      // 3. Clean up orphaned games (in DB but not in memory)
      await cleanupOrphanedGames(games);
      
      // 4. Clean up games with no human players for too long
      await cleanupAbandonedGames(games);
      
      console.log('[GAME CLEANUP] Cleanup cycle completed');
    } catch (error) {
      console.error('[GAME CLEANUP] Error during cleanup:', error);
    }
  }

  /**
   * Force cleanup a specific game
   */
  public async forceCleanupGame(gameId: string, games: Game[]): Promise<void> {
    await forceCleanupGame(gameId, games);
  }
}
