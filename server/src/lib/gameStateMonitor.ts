import type { Game } from '../types/game';
import { CrashPrevention } from './crashPrevention';
import { GameOperationWrapper } from './gameOperationWrapper';

/**
 * Continuous monitoring and protection of rated/league games
 */
export class GameStateMonitor {
  private static monitoringInterval: NodeJS.Timeout | null = null;
  private static readonly MONITOR_INTERVAL = 10000; // Check every 10 seconds
  private static readonly PROTECTION_INTERVAL = 30000; // Save state every 30 seconds

  /**
   * Start monitoring all games for crash prevention
   */
  public static startMonitoring(games: Game[]): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    console.log('[GAME MONITOR] Starting continuous game state monitoring');
    
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.monitorGames(games);
      } catch (error) {
        console.error('[GAME MONITOR] Error during monitoring cycle:', error);
      }
    }, this.MONITOR_INTERVAL);
  }

  /**
   * Stop monitoring
   */
  public static stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('[GAME MONITOR] Stopped game state monitoring');
    }
  }

  /**
   * Monitor all games for issues
   */
  private static async monitorGames(games: Game[]): Promise<void> {
    const ratedGames = games.filter(g => g.rated || (g as any).league);
    
    if (ratedGames.length === 0) {
      return; // No rated games to monitor
    }

    console.log(`[GAME MONITOR] Monitoring ${ratedGames.length} rated/league games`);

    for (const game of ratedGames) {
      try {
        await this.monitorGame(game);
      } catch (error) {
        console.error(`[GAME MONITOR] Error monitoring game ${game.id}:`, error);
      }
    }
  }

  /**
   * Monitor individual game
   */
  private static async monitorGame(game: Game): Promise<void> {
    // Validate game integrity
    const validation = CrashPrevention.validateGameIntegrity(game);
    if (!validation.isValid) {
      console.error(`[GAME MONITOR] Game ${game.id} has integrity issues:`, validation.issues);
      await CrashPrevention.emergencyRecovery(game);
    }

    // Check for stuck states
    if (this.isGameStuck(game)) {
      console.warn(`[GAME MONITOR] Game ${game.id} appears to be stuck, attempting recovery`);
      await this.recoverStuckGame(game);
    }

    // Periodic state save for rated games
    const now = Date.now();
    const lastSaved = (game as any).lastSaved || 0;
    if (now - lastSaved > this.PROTECTION_INTERVAL) {
      console.log(`[GAME MONITOR] Periodic state save for rated game ${game.id}`);
      await CrashPrevention.saveGameStateSafely(game);
    }
  }

  /**
   * Check if game is stuck
   */
  private static isGameStuck(game: Game): boolean {
    const now = Date.now();
    const lastActionTime = game.lastActionTime || 0;
    const stuckThreshold = 5 * 60 * 1000; // 5 minutes

    // Game hasn't had action for too long
    if (now - lastActionTime > stuckThreshold) {
      return true;
    }

    // Game is in invalid state
    if (game.status === 'PLAYING' && !game.currentPlayer) {
      return true;
    }

    if (game.status === 'BIDDING' && !game.bidding) {
      return true;
    }

    return false;
  }

  /**
   * Recover stuck game
   */
  private static async recoverStuckGame(game: Game): Promise<void> {
    console.log(`[GAME MONITOR] Attempting to recover stuck game ${game.id}`);

    try {
      // Try to fix current player
      if (game.status === 'PLAYING' && !game.currentPlayer) {
        const firstPlayer = game.players.find(p => p !== null);
        if (firstPlayer) {
          game.currentPlayer = firstPlayer.id;
          console.log(`[GAME MONITOR] Fixed missing current player for ${game.id}`);
        }
      }

      // Try to fix bidding state
      if (game.status === 'BIDDING' && !game.bidding) {
        game.bidding = {
          bids: [null, null, null, null],
          currentPlayer: "0", currentBidderIndex: 0,
          nilBids: {}
        };
        console.log(`[GAME MONITOR] Fixed missing bidding data for ${game.id}`);
      }

      // Update last action time
      game.lastActionTime = Date.now();

      // Save recovered state
      await CrashPrevention.saveGameStateSafely(game);

      console.log(`[GAME MONITOR] Successfully recovered game ${game.id}`);
    } catch (error) {
      console.error(`[GAME MONITOR] Failed to recover game ${game.id}:`, error);
    }
  }

  /**
   * Get monitoring statistics
   */
  public static getMonitoringStats(games: Game[]): {
    totalGames: number;
    ratedGames: number;
    leagueGames: number;
    protectedGames: number;
    issues: string[];
  } {
    const ratedGames = games.filter(g => g.rated);
    const leagueGames = games.filter(g => (g as any).league);
    const protectedGames = games.filter(g => g.rated || (g as any).league);
    
    const issues: string[] = [];
    
    protectedGames.forEach(game => {
      const validation = CrashPrevention.validateGameIntegrity(game);
      if (!validation.isValid) {
        issues.push(`Game ${game.id}: ${validation.issues.join(', ')}`);
      }
    });

    return {
      totalGames: games.length,
      ratedGames: ratedGames.length,
      leagueGames: leagueGames.length,
      protectedGames: protectedGames.length,
      issues
    };
  }
}
