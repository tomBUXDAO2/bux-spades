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
   * Clean up memory for completed games
   */
  cleanupGame(gameId: string): void {
    this.roundManager.cleanupGame(gameId);
  }

  /**
   * Get current round number for a game
   */
  getCurrentRoundNumber(gameId: string): number | undefined {
    return this.roundManager.getCurrentRoundNumber(gameId);
  }

  /**
   * Start a new round/hand for a game
   */
  async startRound(gameId: string, roundNumber: number): Promise<string> {
    const roundId = await this.roundManager.startRound(gameId, roundNumber);
    this.gameIntegration.setCurrentRoundId(gameId, roundId);
    return roundId;
  }

  /**
   * Log a completed trick to the database
   */
  async logTrick(trickData: any): Promise<string> {
    return this.trickLogger.logTrick(trickData);
  }

  /**
   * Log a trick from the game state
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
   * Get the current round ID for a game
   */
  getCurrentRoundId(gameId: string): string | undefined {
    return this.gameIntegration.getCurrentRoundId(gameId);
  }

  /**
   * Clean up round tracking for a game
   */
  clearGameRounds(gameId: string): void {
    this.roundManager.clearGameRounds(gameId);
  }
}
