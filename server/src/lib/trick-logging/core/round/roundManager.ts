import prisma from '../../../prisma';

export class RoundManager {
  private gameRounds: Map<string, string> = new Map(); // gameId -> currentRoundId
  private gameRoundNumbers: Map<string, number> = new Map(); // gameId -> currentRoundNumber

  /**
   * Clean up memory for completed games
   */
  cleanupGame(gameId: string): void {
    this.gameRounds.delete(gameId);
    this.gameRoundNumbers.delete(gameId);
  }

  /**
   * Get current round number for a game
   */
  getCurrentRoundNumber(gameId: string): number | undefined {
    return this.gameRoundNumbers.get(gameId);
  }

  /**
   * Start a new round/hand for a game
   */
  async startRound(gameId: string, roundNumber: number): Promise<string> {
    const isProduction = process.env.NODE_ENV === 'production';
    
    try {
      const roundId = `round_${gameId}_${roundNumber}_${Date.now()}`;
      const round = await prisma.round.create({
        data: {
          id: roundId,
          gameId,
          roundNumber,
          updatedAt: new Date(),
        } as any,
      });

      this.gameRounds.set(gameId, round.id);
      this.gameRoundNumbers.set(gameId, roundNumber);
      
      if (!isProduction) {
        console.log(`[TRICK LOGGER] Started round ${roundNumber} for game ${gameId} with ID ${round.id}`);
      }
      return round.id;
    } catch (error) {
      console.error(`[TRICK LOGGER] Failed to start round for game ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * Get the current round ID for a game
   */
  getCurrentRoundId(gameId: string): string | undefined {
    return this.gameRounds.get(gameId);
  }

  /**
   * Clean up round tracking for a game
   */
  clearGameRounds(gameId: string): void {
    this.gameRounds.delete(gameId);
    this.gameRoundNumbers.delete(gameId);
  }
}
