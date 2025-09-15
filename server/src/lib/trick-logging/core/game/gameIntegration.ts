import { Game } from '../../../../types/game';
import { TrickLogData } from '../../types/trickLogTypes';
import { getCardValue, getFullSuitName } from '../../utils/cardUtils';
import { TrickLogger } from '../trick/trickLogger';

export class GameIntegration {
  private trickLogger: TrickLogger;
  private gameRounds: Map<string, string> = new Map(); // gameId -> currentRoundId

  constructor(trickLogger: TrickLogger) {
    this.trickLogger = trickLogger;
  }

  /**
   * Set the current round ID for a game
   */
  setCurrentRoundId(gameId: string, roundId: string): void {
    this.gameRounds.set(gameId, roundId);
  }

  /**
   * Get the current round ID for a game
   */
  getCurrentRoundId(gameId: string): string | undefined {
    return this.gameRounds.get(gameId);
  }

  /**
   * Log a trick from the game state
   */
  async logTrickFromGame(game: Game, trickNumber: number): Promise<void> {
    if (!game.play || !game.play.tricks || game.play.tricks.length === 0) {
      console.warn(`[TRICK LOGGER] No tricks to log for game ${game.id}`);
      return;
    }

    const trick = game.play.tricks[trickNumber - 1]; // Convert to 0-based index
    if (!trick) {
      console.warn(`[TRICK LOGGER] Trick ${trickNumber} not found for game ${game.id}`);
      return;
    }

    const gameIdForLookup = game.dbGameId || game.id;
    const roundId = this.gameRounds.get(gameIdForLookup);
    if (!roundId) {
      console.error(`[TRICK LOGGER] No active round found for game ${gameIdForLookup}`);
      return;
    }

    // Get the lead player (first player in the trick)
    const leadPlayerId = trick.cards[0]?.playedBy || game.players[0]?.id || '';
    
    // Get the winning player
    const winningPlayer = game.players[trick.winnerIndex];
    const winningPlayerId = winningPlayer?.id || '';

    const trickData: TrickLogData = {
      roundId,
      trickNumber,
      leadPlayerId,
      winningPlayerId,
      cards: trick.cards.map((card, index) => ({
        playerId: card.playedBy || game.players[card.playerIndex || 0]?.id || '',
        suit: getFullSuitName(card.suit),
        value: getCardValue(card.rank),
        position: index,
      })),
    };

    await this.trickLogger.logTrick(trickData);
  }

  /**
   * Log all tricks from a completed hand
   */
  async logCompletedHand(game: Game): Promise<void> {
    if (!game.play || !game.play.tricks) {
      console.warn(`[TRICK LOGGER] No tricks to log for completed hand in game ${game.id}`);
      return;
    }

    console.log(`[TRICK LOGGER] Logging ${game.play.tricks.length} tricks for completed hand in game ${game.id}`);

    // Since tricks are already logged individually during the game,
    // we don't need to log them again here to avoid duplicate key constraints
    console.log(`[TRICK LOGGER] Skipping duplicate trick logging - ${game.play.tricks.length} tricks already logged during game`);
  }
}
