import { GameCleanupService } from './GameCleanupService.js';

export class PeriodicCleanupService {
  static intervalId = null;
  static isRunning = false;

  /**
   * Start the periodic cleanup service
   * Runs every hour to clean up abandoned and old unrated games
   */
  static start() {
    if (this.isRunning) {
      console.log('[PERIODIC CLEANUP] Service is already running');
      return;
    }

    console.log('[PERIODIC CLEANUP] Starting periodic cleanup service');
    this.isRunning = true;

    // Run immediately on start
    this.runCleanup();

    // Then run every hour
    this.intervalId = setInterval(() => {
      this.runCleanup();
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Stop the periodic cleanup service
   */
  static stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[PERIODIC CLEANUP] Stopped periodic cleanup service');
  }

  /**
   * Run the cleanup process
   */
  static async runCleanup() {
    try {
      console.log('[PERIODIC CLEANUP] Starting cleanup process');
      
      // Get cleanup stats before cleanup
      const statsBefore = await GameCleanupService.getCleanupStats();
      console.log('[PERIODIC CLEANUP] Stats before cleanup:', statsBefore);
      
      // Cleanup abandoned games (games with no human players)
      const abandonedCleaned = await GameCleanupService.cleanupAllAbandonedUnratedGames();
      
      // Cleanup WAITING games older than 15 minutes
      const staleWaitingCleaned = await GameCleanupService.cleanupStaleWaitingGames(15);
      console.log(`[PERIODIC CLEANUP] Stale WAITING games cleaned: ${staleWaitingCleaned}`);

      // Cleanup old completed games (older than 24 hours)
      const oldCleaned = await GameCleanupService.cleanupOldCompletedUnratedGames();
      
      // Get cleanup stats after cleanup
      const statsAfter = await GameCleanupService.getCleanupStats();
      console.log('[PERIODIC CLEANUP] Stats after cleanup:', statsAfter);
      
      console.log(`[PERIODIC CLEANUP] Cleanup completed: ${abandonedCleaned} abandoned, ${staleWaitingCleaned} stale waiting, ${oldCleaned} old games cleaned`);
      console.log(`[PERIODIC CLEANUP] Total cleanup candidates remaining: ${statsAfter.totalCleanupCandidates}`);
      
    } catch (error) {
      console.error('[PERIODIC CLEANUP] Error during cleanup:', error);
    }
  }

  /**
   * Force run cleanup (for manual triggers)
   */
  static async forceCleanup() {
    console.log('[PERIODIC CLEANUP] Force cleanup triggered');
    await this.runCleanup();
  }

  /**
   * Get service status
   */
  static getStatus() {
    return {
      isRunning: this.isRunning,
      intervalId: this.intervalId !== null
    };
  }
}
