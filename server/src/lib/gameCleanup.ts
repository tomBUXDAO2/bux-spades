import prisma from './prisma';
import type { Game } from '../types/game';

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
      await this.cleanupFinishedGamesInMemory(games);
      
      // 2. Clean up database games that are stuck
      await this.cleanupStuckDatabaseGames();
      
      // 3. Clean up orphaned games (in DB but not in memory)
      await this.cleanupOrphanedGames(games);
      
      // 4. Clean up games with no human players for too long
      await this.cleanupAbandonedGames(games);
      
      console.log('[GAME CLEANUP] Cleanup cycle completed');
    } catch (error) {
      console.error('[GAME CLEANUP] Error during cleanup:', error);
    }
  }

  /**
   * Remove finished games from memory
   */
  private async cleanupFinishedGamesInMemory(games: Game[]): Promise<void> {
    const now = Date.now();
    const finishedGames: number[] = [];
    
    for (let i = games.length - 1; i >= 0; i--) {
      const game = games[i];
      
      // Remove games that have been finished for more than 5 minutes
      if (game.status === 'FINISHED' || game.status === 'FINISHED') {
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

  /**
   * Clean up stuck games in database
   */
  private async cleanupStuckDatabaseGames(): Promise<void> {
    try {
      const stuckGames = await (prisma.game.findMany as any)({
        where: {
          status: {
            in: ['PLAYING'] as any
          },
          lastActionAt: {
            lt: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
          }
        }
      });

      for (const stuckGame of stuckGames) {
        console.log(`[GAME CLEANUP] Found stuck game in DB: ${stuckGame.id}`);
        
        // Mark as finished
        await (prisma.game.update as any)({
          where: { id: stuckGame.id },
          data: {
            status: 'FINISHED',
            completed: true,
            updatedAt: new Date()
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
  private async cleanupOrphanedGames(games: Game[]): Promise<void> {
    try {
      const memoryGameIds = new Set(games.map(g => g.id));
      
      const orphanedGames = await (prisma.game.findMany as any)({
        where: {
          status: {
            in: ['PLAYING'] as any
          },
          lastActionAt: {
            lt: new Date(Date.now() - 15 * 60 * 1000) // 15 minutes ago
          }
        }
      });

      for (const orphanedGame of orphanedGames) {
        if (!memoryGameIds.has(orphanedGame.id)) {
          console.log(`[GAME CLEANUP] Found orphaned game: ${orphanedGame.id}`);
          
          // Mark as finished
          await (prisma.game.update as any)({
            where: { id: orphanedGame.id },
            data: {
              status: 'FINISHED',
              completed: true,
              updatedAt: new Date()
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
   * Clean up abandoned games (no human players for too long)
   */
  private async cleanupAbandonedGames(games: Game[]): Promise<void> {
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

  /**
   * Force cleanup a specific game
   */
  public async forceCleanupGame(gameId: string, games: Game[]): Promise<void> {
    try {
      console.log(`[GAME CLEANUP] Force cleaning up game: ${gameId}`);
      
      // Remove from memory
      const gameIndex = games.findIndex(g => g.id === gameId);
      if (gameIndex !== -1) {
        games.splice(gameIndex, 1);
        console.log(`[GAME CLEANUP] Removed game from memory: ${gameId}`);
      }
      
      // Mark as finished in database
      await (prisma.game.update as any)({
        where: { id: gameId },
        data: {
          status: 'FINISHED',
          completed: true,
          updatedAt: new Date()
        }
      });
      
      console.log(`[GAME CLEANUP] Marked game as finished in database: ${gameId}`);
    } catch (error) {
      console.error(`[GAME CLEANUP] Error force cleaning up game ${gameId}:`, error);
    }
  }
}

export const gameCleanupManager = GameCleanupManager.getInstance();
