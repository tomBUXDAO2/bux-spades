import type { Game } from '../../../types/game';
import { cleanupFinishedGamesInMemory } from '../memory/memoryCleanup';
import { cleanupStuckDatabaseGames, cleanupOrphanedGames } from '../database/databaseCleanup';
import { cleanupAbandonedGames } from '../abandoned/abandonedGameCleanup';
import { cleanupWaitingGames } from '../waiting/waitingGameCleanup';
import { forceCleanupGame } from '../database/databaseCleanup';
import type { Server } from 'socket.io';

/**
 * Comprehensive game cleanup and state management
 */
export class GameCleanupManager {
  private static instance: GameCleanupManager;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private io: Server | null = null;

  public static getInstance(): GameCleanupManager {
    if (!GameCleanupManager.instance) {
      GameCleanupManager.instance = new GameCleanupManager();
    }
    return GameCleanupManager.instance;
  }

  /**
   * Set the Socket.IO server instance
   */
  public setIo(io: Server): void {
    this.io = io;
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
      
      // TEMPORARILY DISABLED ALL CLEANUP TO FIND WHAT'S SETTING FINISHED STATUS
      console.log('[GAME CLEANUP] All cleanup disabled to debug FINISHED status issue');
      
      // 1. Clean up WAITING games that have been waiting too long (15 minutes)
      // await cleanupWaitingGames(games, this.io || undefined);
      
      // 2. Clean up memory games that are finished but still in memory
      // await cleanupFinishedGamesInMemory(games);
      
      // 3. Clean up database games that are stuck
      // await cleanupStuckDatabaseGames();
      
      // 4. Clean up orphaned games (in DB but not in memory)
      // await cleanupOrphanedGames(games);
      
      // 5. Clean up games with no human players for too long
      // await cleanupAbandonedGames(games);
      
      console.log('[GAME CLEANUP] Cleanup cycle completed (all disabled)');
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
