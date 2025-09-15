import type { Game } from '../../../types/game';
import { monitorGames } from '../monitoring/gameMonitoring';

/**
 * Continuous monitoring and protection of rated/league games
 */
export class GameStateMonitor {
  private static monitoringInterval: NodeJS.Timeout | null = null;
  private static readonly MONITOR_INTERVAL = 10000; // Check every 10 seconds

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
        await monitorGames(games);
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
}
