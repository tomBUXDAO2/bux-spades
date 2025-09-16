import { RoundManager } from './round/roundManager';
import { TrickLogger as TrickLoggerCore } from './trick/trickLogger';
import { GameIntegration } from './game/gameIntegration';

export class TrickLogger {
  private roundManager: RoundManager;
  private trickLogger: TrickLoggerCore;
  private gameIntegration: GameIntegration;

  constructor() {
    this.roundManager = new RoundManager();
    this.trickLogger = new TrickLoggerCore();
    this.gameIntegration = new GameIntegration(this.trickLogger);
  }

  /**
   * Set the current round ID for a game
   */
  setCurrentRoundId(gameId: string, roundId: string): void {
    this.gameIntegration.setCurrentRoundId(gameId, roundId);
  }

  /**
   * Clean up memory for completed games
   */
  cleanupGame(gameId: string): void {
    this.roundManager.cleanupGame(gameId);
  }

  /**
   * Get current round number for a game
   */
  getCurrentRoundNumber(gameId: string): number {
    return this.roundManager.getCurrentRoundNumber(gameId);
  }

  /**
   * Log a trick from game state
   */
  async logTrickFromGame(game: any, trickNumber: number): Promise<void> {
    return this.gameIntegration.logTrickFromGame(game, trickNumber);
  }

  /**
   * Log all tricks from a completed hand
   */
  async logCompletedHand(game: any): Promise<void> {
    return this.gameIntegration.logCompletedHand(game);
  }

  /**
   * Get trick statistics for a game
   */
  getTrickStats(gameId: string): any {
    return this.roundManager.getTrickStats(gameId);
  }

  /**
   * Get round statistics for a game
   */
  getRoundStats(gameId: string): any {
    return this.roundManager.getRoundStats(gameId);
  }

  /**
   * Get game statistics
   */
  getGameStats(gameId: string): any {
    return {
      rounds: this.getRoundStats(gameId),
      tricks: this.getTrickStats(gameId)
    };
  }
}
